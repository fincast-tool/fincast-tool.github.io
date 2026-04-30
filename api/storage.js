import Redis from 'ioredis';

// Fehlerbehandlung für den Redis-Client selbst
let redis;
try {
    const redisUrl = process.env.KV_REDIS_URL || process.env.REDIS_URL;
    if (!redisUrl) {
        console.error('MISSING_REDIS_URL: Bitte prüfe deine Environment Variables auf Vercel.');
    } else {
        redis = new Redis(redisUrl, {
            connectTimeout: 10000, // 10 Sekunden Timeout
            maxRetriesPerRequest: 1
        });
        
        redis.on('error', (err) => {
            console.error('Redis Client Error:', err);
        });
    }
} catch (e) {
    console.error('Redis Initialization Error:', e);
}

// Hilfsfunktion für Datum - Reset erfolgt um 08:00 UTC (09:00 Winterzeit / 10:00 Sommerzeit DE)
function getResetDateString() {
    const d = new Date();
    // Verschiebe die Zeit um 8 Stunden zurück. Alles vor 08:00 UTC zählt zum vorherigen Tag.
    d.setUTCHours(d.getUTCHours() - 8);
    return d.toISOString().split('T')[0];
}

export default async function handler(req, res) {
    if (!redis) {
        return res.status(500).json({ error: 'Datenbank-Konfiguration fehlt (KV_REDIS_URL nicht gefunden).' });
    }

    const { action, email, data, key } = req.body;

    try {
        switch (action) {
            case 'get_users':
                console.log('Admin Action: get_users triggered');
                let usersRaw;
                try {
                    usersRaw = await redis.get('terminal_users');
                } catch (redisErr) {
                    console.error('CRITICAL_REDIS_GET_ERROR:', redisErr);
                    return res.status(500).json({ error: 'Redis Read Error: ' + redisErr.message });
                }

                let users = [];
                if (usersRaw) {
                    try {
                        users = JSON.parse(usersRaw);
                    } catch (parseErr) {
                        console.error('JSON_PARSE_ERROR in terminal_users:', parseErr);
                        users = [];
                    }
                }
                
                console.log(`Found ${users.length} users in database`);

                // ENSURE ADMIN EXISTS (via Environment Variables)
                const adminEmail = process.env.ADMIN_EMAIL;
                const adminHash = process.env.ADMIN_PASSWORD_HASH;
                
                if (adminEmail && adminHash) {
                    console.log('Checking for Admin User:', adminEmail);
                    let userIdx = users.findIndex(u => u.email === adminEmail);
                    if (userIdx === -1) {
                        console.log('Admin not found. Creating default admin...');
                        const adminUser = {
                            email: adminEmail,
                            password: adminHash,
                            firstName: 'Admin',
                            lastName: 'User',
                            apiKey: process.env.GEMINI_API_KEY || '',
                            model: 'gemini-2.5-flash',
                            tier: 'premium',
                            isAdmin: true,
                            createdAt: new Date().toISOString()
                        };
                        users.push(adminUser);
                        await redis.set('terminal_users', JSON.stringify(users));
                    } else if (!users[userIdx].isAdmin) {
                        console.log('Upgrading existing user to Admin status');
                        users[userIdx].isAdmin = true;
                        users[userIdx].tier = 'premium';
                        await redis.set('terminal_users', JSON.stringify(users));
                    }
                }

                // Sicherheitsschicht: Verhindere, dass der System-Key jemals an das Frontend gesendet wird
                const sysKey = process.env.GEMINI_API_KEY;
                if (sysKey && sysKey.trim() !== '') {
                    users = users.map(u => {
                        if (u.apiKey === sysKey) {
                            return { ...u, apiKey: '' }; // Key im Frontend verstecken
                        }
                        return u;
                    });
                }

                return res.status(200).json(users);

            case 'save_user':
                let allUsersRaw = await redis.get('terminal_users');
                let allUsers = allUsersRaw ? JSON.parse(allUsersRaw) : [];
                
                // Wir weisen den System-Key NICHT mehr dem User-Objekt zu, 
                // um zu verhindern, dass er über get_users im Frontend sichtbar wird.
                // Der Fallback erfolgt sicher in api/analyze.js.
                if (!data.apiKey) {
                    data.apiKey = '';
                }
                
                const idx = allUsers.findIndex(u => u.email === data.email);
                if (idx !== -1) allUsers[idx] = data;
                else allUsers.push(data);
                
                await redis.set('terminal_users', JSON.stringify(allUsers));
                return res.status(200).json({ success: true });

            case 'delete_user':
                let delUsersRaw = await redis.get('terminal_users');
                let delUsers = delUsersRaw ? JSON.parse(delUsersRaw) : [];
                const newUsers = delUsers.filter(u => u.email !== email);
                await redis.set('terminal_users', JSON.stringify(newUsers));
                return res.status(200).json({ success: true });

            case 'get_queries':
                const qRaw = await redis.get(`queries:${email}`);
                let queries = qRaw ? JSON.parse(qRaw) : { counts: {}, date: '' };
                const todayPT = getResetDateString();
                if (queries.date !== todayPT) {
                    queries = { counts: {}, date: todayPT };
                }
                // Migration alter Struktur
                if (queries.count !== undefined) {
                    queries.counts = { 'gemini-2.5-flash-lite': queries.count };
                    delete queries.count;
                }
                const modelToGet = req.body.model || 'gemini-2.5-flash-lite';
                return res.status(200).json({ count: queries.counts[modelToGet] || 0, date: queries.date });

            case 'get_all_queries':
                const allKeys = await redis.keys('queries:*');
                const allQueries = {};
                const currentPT = getResetDateString();
                if (allKeys.length > 0) {
                    const values = await redis.mget(allKeys);
                    allKeys.forEach((k, i) => {
                        const userEmail = k.replace('queries:', '');
                        try { 
                            let qObj = JSON.parse(values[i]);
                            if (qObj.date !== currentPT) {
                                qObj = { counts: {}, date: currentPT };
                            }
                            if (qObj.count !== undefined) {
                                qObj.counts = { 'gemini-2.5-flash-lite': qObj.count };
                                delete qObj.count;
                            }
                            allQueries[userEmail] = qObj;
                        } catch(e) { 
                            allQueries[userEmail] = { counts: {}, date: currentPT };
                        }
                    });
                }
                return res.status(200).json(allQueries);


            case 'increment_query':
                const today = getResetDateString();
                let qDataRaw = await redis.get(`queries:${email}`);
                let q = qDataRaw ? JSON.parse(qDataRaw) : { counts: {}, date: today };
                
                if (q.date !== today) { q.counts = {}; q.date = today; }
                if (q.count !== undefined) {
                    q.counts = { 'gemini-2.5-flash-lite': q.count };
                    delete q.count;
                }
                
                const modelToInc = req.body.model || 'gemini-2.5-flash-lite';
                q.counts[modelToInc] = (q.counts[modelToInc] || 0) + 1;
                
                await redis.set(`queries:${email}`, JSON.stringify(q));
                return res.status(200).json({ count: q.counts[modelToInc], date: q.date });

            case 'save_archive':
                await redis.hset(`archive:${email}`, key, JSON.stringify(data));
                return res.status(200).json({ success: true });

            case 'get_archive':
                const archiveRaw = await redis.hgetall(`archive:${email}`);
                const archive = {};
                if (archiveRaw) {
                    for (const [k, v] of Object.entries(archiveRaw)) {
                        try { archive[k] = JSON.parse(v); } catch(e) { archive[k] = v; }
                    }
                }
                return res.status(200).json(archive);

            case 'delete_archive':
                await redis.del(`archive:${email}`);
                return res.status(200).json({ success: true });

            case 'delete_single_archive':
                if (key) {
                    await redis.hdel(`archive:${email}`, key);
                }
                return res.status(200).json({ success: true });

            case 'save_shared_report':
                const shareId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
                // Speichern für 7 Tage (604800 Sekunden)
                await redis.setex(`shared:${shareId}`, 604800, JSON.stringify(data));
                return res.status(200).json({ id: shareId });

            case 'get_shared_report':
                const sharedDataRaw = await redis.get(`shared:${req.body.id}`);
                if (!sharedDataRaw) return res.status(404).json({ error: 'Report nicht gefunden oder abgelaufen.' });
                return res.status(200).json(JSON.parse(sharedDataRaw));

            default:
                return res.status(400).json({ error: 'Unknown action: ' + action });
        }
    } catch (error) {
        console.error('Storage API Handler Error:', error);
        return res.status(500).json({ error: 'Datenbank-Verbindungsfehler: ' + error.message });
    }
}


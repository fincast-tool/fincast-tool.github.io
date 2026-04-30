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

// Hilfsfunktion für Datum in Pacific Time (PT) - Reset erfolgt um Mitternacht PT
function getPTDate() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

export default async function handler(req, res) {
    if (!redis) {
        return res.status(500).json({ error: 'Datenbank-Konfiguration fehlt (KV_REDIS_URL nicht gefunden).' });
    }

    const { action, email, data, key } = req.body;

    try {
        switch (action) {
            case 'get_users':
                let usersRaw = await redis.get('terminal_users');
                let users = usersRaw ? JSON.parse(usersRaw) : [];
                
                // ENSURE ADMIN EXISTS (via Environment Variables)
                const adminEmail = process.env.ADMIN_EMAIL;
                const adminHash = process.env.ADMIN_PASSWORD_HASH;
                
                if (adminEmail && adminHash) {
                    let user = users.find(u => u.email === adminEmail);
                    if (!user) {
                        user = {
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
                        users.push(user);
                        await redis.set('terminal_users', JSON.stringify(users));
                    } else if (!user.isAdmin) {
                        user.isAdmin = true;
                        user.tier = 'premium';
                        await redis.set('terminal_users', JSON.stringify(users));
                    }
                }
                return res.status(200).json(users);

            case 'save_user':
                let allUsersRaw = await redis.get('terminal_users');
                let allUsers = allUsersRaw ? JSON.parse(allUsersRaw) : [];
                
                // Automatisches Zuweisen des System-Keys, falls kein eigener hinterlegt wurde
                if (!data.apiKey || data.apiKey.trim() === '') {
                    data.apiKey = process.env.GEMINI_API_KEY || '';
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
                let queries = qRaw ? JSON.parse(qRaw) : { count: 0, date: '' };
                const todayPT = getPTDate();
                if (queries.date !== todayPT) {
                    queries = { count: 0, date: todayPT };
                }
                return res.status(200).json(queries);

            case 'get_all_queries':
                const allKeys = await redis.keys('queries:*');
                const allQueries = {};
                const currentPT = getPTDate();
                if (allKeys.length > 0) {
                    const values = await redis.mget(allKeys);
                    allKeys.forEach((k, i) => {
                        const userEmail = k.replace('queries:', '');
                        try { 
                            let qObj = JSON.parse(values[i]);
                            if (qObj.date !== currentPT) {
                                qObj = { count: 0, date: currentPT };
                            }
                            allQueries[userEmail] = qObj;
                        } catch(e) { 
                            allQueries[userEmail] = { count: 0, date: currentPT };
                        }
                    });
                }
                return res.status(200).json(allQueries);


            case 'increment_query':
                const today = getPTDate();
                let qDataRaw = await redis.get(`queries:${email}`);
                let q = qDataRaw ? JSON.parse(qDataRaw) : { count: 0, date: today };
                
                if (q.date !== today) { q.count = 0; q.date = today; }
                q.count++;
                
                await redis.set(`queries:${email}`, JSON.stringify(q));
                return res.status(200).json(q);

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


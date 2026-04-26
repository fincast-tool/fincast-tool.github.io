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

export default async function handler(req, res) {
    if (!redis) {
        return res.status(500).json({ error: 'Datenbank-Konfiguration fehlt (KV_REDIS_URL nicht gefunden).' });
    }

    const { action, email, data, key } = req.body;

    try {
        switch (action) {
            case 'get_users':
                const usersRaw = await redis.get('terminal_users');
                const users = usersRaw ? JSON.parse(usersRaw) : [];
                return res.status(200).json(users);

            case 'save_user':
                let allUsersRaw = await redis.get('terminal_users');
                let allUsers = allUsersRaw ? JSON.parse(allUsersRaw) : [];
                
                const idx = allUsers.findIndex(u => u.email === data.email);
                if (idx !== -1) allUsers[idx] = data;
                else allUsers.push(data);
                
                await redis.set('terminal_users', JSON.stringify(allUsers));
                return res.status(200).json({ success: true });

            case 'get_queries':
                const qRaw = await redis.get(`queries:${email}`);
                const queries = qRaw ? JSON.parse(qRaw) : { count: 0, date: '' };
                return res.status(200).json(queries);

            case 'increment_query':
                const today = new Date().toISOString().slice(0, 10);
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

            default:
                return res.status(400).json({ error: 'Unknown action: ' + action });
        }
    } catch (error) {
        console.error('Storage API Handler Error:', error);
        return res.status(500).json({ error: 'Datenbank-Verbindungsfehler: ' + error.message });
    }
}

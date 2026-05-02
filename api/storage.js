const Redis = require('ioredis');

module.exports = async function handler(req, res) {
    const { action, params, data, email, key: tickerKey } = req.body;
    const redis = new Redis(process.env.KV_REDIS_URL || process.env.REDIS_URL);

    try {
        // --- USER MANAGEMENT ---
        if (action === 'get_users') {
            let users = await redis.get('terminal_users');
            let usersArray = users ? JSON.parse(users) : [];
            const adminEmail = process.env.ADMIN_EMAIL;
            const adminHash = process.env.ADMIN_PASSWORD_HASH;
            
            if (adminEmail && !usersArray.find(u => u.email === adminEmail)) {
                usersArray.push({
                    email: adminEmail, passwordHash: adminHash, firstName: 'Admin', lastName: 'System',
                    tier: 'premium', isAdmin: true, model: 'gemini-2.5-flash', createdAt: new Date().toISOString()
                });
                await redis.set('terminal_users', JSON.stringify(usersArray));
            }
            return res.status(200).json(usersArray);
        }

        if (action === 'save_user') {
            let users = await redis.get('terminal_users');
            let usersArray = users ? JSON.parse(users) : [];
            const index = usersArray.findIndex(u => u.email === data.email);
            if (index > -1) { usersArray[index] = { ...usersArray[index], ...data }; } 
            else { usersArray.push(data); }
            await redis.set('terminal_users', JSON.stringify(usersArray));
            return res.status(200).json({ success: true });
        }

        if (action === 'delete_user') {
            let users = await redis.get('terminal_users');
            let usersArray = users ? JSON.parse(users) : [];
            usersArray = usersArray.filter(u => u.email !== req.body.email);
            await redis.set('terminal_users', JSON.stringify(usersArray));
            return res.status(200).json({ success: true });
        }

        // --- QUERY TRACKING ---
        if (action === 'get_all_queries') {
            const keys = await redis.keys('queries:*');
            const allStats = {};
            for (const key of keys) {
                const userEmail = key.split(':')[1];
                const stats = await redis.get(key);
                allStats[userEmail] = stats ? JSON.parse(stats) : { counts: {} };
            }
            return res.status(200).json(allStats);
        }

        if (action === 'get_queries') {
            const stats = await redis.get(`queries:${email}`);
            const parsed = stats ? JSON.parse(stats) : { count: 0, counts: {} };
            return res.status(200).json({
                count: parsed.count || 0,
                counts: parsed.counts || {}
            });
        }

        if (action === 'increment_query') {
            const key = `queries:${email}`;
            const stats = await redis.get(key);
            let statsObj = stats ? JSON.parse(stats) : { count: 0, counts: {} };
            
            statsObj.count = (statsObj.count || 0) + 1;
            
            // Falls ein Modell mitgesendet wurde, auch dort zählen
            if (req.body.model) {
                if (!statsObj.counts) statsObj.counts = {};
                statsObj.counts[req.body.model] = (statsObj.counts[req.body.model] || 0) + 1;
            }
            
            await redis.set(key, JSON.stringify(statsObj));
            return res.status(200).json({ success: true });
        }

        if (action === 'reset_queries') {
            await redis.del(`queries:${req.body.email}`);
            return res.status(200).json({ success: true });
        }

        // --- ARCHIVE LOGIC ---
        if (action === 'get_archive') {
            const key = `archive:${email}`;
            const type = await redis.type(key);
            
            if (type === 'list') {
                const list = await redis.lrange(key, 0, -1);
                // Konvertiere altes Listen-Format in neues Objekt-Format für das Frontend
                const archiveObj = {};
                list.forEach(item => {
                    const parsed = JSON.parse(item);
                    const ticker = parsed.ticker || 'UNKNOWN';
                    archiveObj[ticker] = parsed;
                });
                return res.status(200).json(archiveObj);
            } else {
                const archive = await redis.get(key);
                return res.status(200).json(archive ? JSON.parse(archive) : {});
            }
        }

        if (action === 'save_archive') {
            const key = `archive:${email}`;
            const archive = await redis.get(key);
            let archiveObj = archive ? JSON.parse(archive) : {};
            
            // Füge die neue Analyse unter dem Ticker-Key hinzu
            if (tickerKey) {
                archiveObj[tickerKey] = data;
            } else {
                // Fallback falls kein Key gesendet wurde (sollte nicht passieren)
                const fallbackKey = new Date().getTime().toString();
                archiveObj[fallbackKey] = data;
            }
            
            await redis.set(key, JSON.stringify(archiveObj));
            return res.status(200).json({ success: true });
        }

        if (action === 'delete_single_archive') {
            const key = `archive:${email}`;
            const archive = await redis.get(key);
            if (archive) {
                let archiveObj = JSON.parse(archive);
                delete archiveObj[tickerKey];
                await redis.set(key, JSON.stringify(archiveObj));
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'delete_archive') {
            await redis.del(`archive:${req.body.email}`);
            return res.status(200).json({ success: true });
        }

        // --- SHARE LINK LOGIC ---
        if (action === 'save_shared_report') {
            const id = Math.random().toString(36).substring(2, 15);
            await redis.set(`shared:${id}`, JSON.stringify(data), 'EX', 60 * 60 * 24 * 10); // 10 Tage gültig
            return res.status(200).json({ id });
        }

        if (action === 'get_shared_report') {
            const report = await redis.get(`shared:${req.body.id}`);
            if (!report) return res.status(404).json({ error: 'Bericht nicht gefunden.' });
            return res.status(200).json(JSON.parse(report));
        }

        // --- GLOBAL SWARM ARCHIVE (30 DAYS) ---
        if (action === 'get_global_archive_entry') {
            if (!tickerKey) return res.status(400).json({ error: 'Ticker key required' });
            const entry = await redis.get(`global_archive:${tickerKey.toUpperCase()}`);
            return res.status(200).json(entry ? JSON.parse(entry) : null);
        }

        if (action === 'save_global_archive') {
            if (!tickerKey || !data) return res.status(400).json({ error: 'Ticker key and data required' });
            // Hinterlegt für 30 Tage (Swarm Intelligence)
            await redis.set(`global_archive:${tickerKey.toUpperCase()}`, JSON.stringify(data), 'EX', 60 * 60 * 24 * 30);
            return res.status(200).json({ success: true });
        }

        if (action === 'get_global_tickers') {
            // Holt alle aktuell im globalen Archiv verfügbaren Ticker
            const keys = await redis.keys('global_archive:*');
            const tickers = keys.map(k => k.split(':')[1]);
            return res.status(200).json(tickers);
        }

        res.status(400).json({ error: 'Unknown action: ' + action });
    } catch (error) {
        console.error('Storage API Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await redis.quit();
    }
}

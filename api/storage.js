const Redis = require('ioredis');

module.exports = async function handler(req, res) {
    const { action, params, data, email } = req.body;
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
            return res.status(200).json(stats ? JSON.parse(stats) : { counts: {} });
        }

        if (action === 'reset_queries') {
            await redis.del(`queries:${req.body.email}`);
            return res.status(200).json({ success: true });
        }

        // --- ARCHIVE LOGIC ---
        if (action === 'get_archive') {
            const archive = await redis.get(`archive:${email}`);
            return res.status(200).json(archive ? JSON.parse(archive) : []);
        }

        if (action === 'save_archive') {
            await redis.set(`archive:${email}`, JSON.stringify(data));
            return res.status(200).json({ success: true });
        }

        if (action === 'delete_archive') {
            await redis.del(`archive:${req.body.email}`);
            return res.status(200).json({ success: true });
        }

        res.status(400).json({ error: 'Unknown action: ' + action });
    } catch (error) {
        console.error('Storage API Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await redis.quit();
    }
}

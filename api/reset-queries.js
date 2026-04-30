
import Redis from 'ioredis';

// Wir nutzen denselben Redis-Client wie in api/storage.js
let redis;
try {
    const redisUrl = process.env.KV_REDIS_URL || process.env.REDIS_URL;
    if (redisUrl) {
        redis = new Redis(redisUrl, {
            connectTimeout: 10000,
            maxRetriesPerRequest: 1
        });
    }
} catch (e) {
    console.error('Redis Init Error in reset-queries:', e);
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!redis) return res.status(500).json({ error: 'Database connection not initialized' });

    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        // Wir löschen den spezifischen Tages-Key
        // Das Format in api/storage.js scheint queries:email zu sein
        const key = `queries:${userId}`;
        await redis.del(key);

        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Reset Queries Error:', error);
        return res.status(500).json({ error: error.message });
    }
}

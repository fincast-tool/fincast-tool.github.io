
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'User ID required' });

        // Der Key folgt dem Format: queries:userId:YYYY-MM-DD
        const today = new Date().toISOString().split('T')[0];
        const queryCountKey = `queries:${userId}:${today}`;

        await redis.del(queryCountKey);

        return res.status(200).json({ success: true, message: 'Queries reset successfully' });
    } catch (error) {
        console.error('Reset Queries Error:', error);
        return res.status(500).json({ error: 'Failed to reset queries' });
    }
}

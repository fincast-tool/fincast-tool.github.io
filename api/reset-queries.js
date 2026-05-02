const Redis = require('ioredis');

module.exports = async function handler(req, res) {
    // Vercel Cron-Jobs senden einen GET-Request. 
    // Wir erlauben GET für den automatischen Reset und POST für manuelle Admin-Aktionen.
    
    const redis = new Redis(process.env.KV_REDIS_URL || process.env.REDIS_URL);

    try {
        // Falls eine spezifische E-Mail mitgesendet wurde (manueller Reset im Admin Panel)
        const email = req.body?.email || req.query?.email;

        if (email) {
            // Nur einen spezifischen Nutzer zurücksetzen
            await redis.del(`queries:${email}`);
            console.log(`[RESET] Queries for ${email} cleared.`);
            return res.status(200).json({ success: true, message: `Reset for ${email} complete.` });
        } else {
            // GLOBALER RESET (für 10:00 Uhr Cron-Job)
            // Wir suchen alle Keys, die mit 'queries:' beginnen
            const keys = await redis.keys('queries:*');
            if (keys.length > 0) {
                await redis.del(...keys);
            }
            console.log(`[RESET] Global reset complete. ${keys.length} users cleared.`);
            return res.status(200).json({ 
                success: true, 
                message: 'Global reset complete.',
                clearedCount: keys.length
            });
        }
    } catch (error) {
        console.error('Reset Queries Error:', error);
        res.status(500).json({ error: error.message });
    } finally {
        await redis.quit();
    }
}

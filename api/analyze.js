import Redis from 'ioredis';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { ticker, model, geminiBody, email } = req.body;
    let apiKey = process.env.GEMINI_API_KEY;

    // Versuche, den spezifischen Key des Nutzers aus Redis zu laden
    try {
        const redisUrl = process.env.KV_REDIS_URL || process.env.REDIS_URL;
        if (redisUrl && email) {
            const redis = new Redis(redisUrl);
            const usersRaw = await redis.get('terminal_users');
            const users = usersRaw ? JSON.parse(usersRaw) : [];
            const user = users.find(u => u.email === email);
            if (user && user.apiKey && user.apiKey.trim() !== '') {
                apiKey = user.apiKey.trim();
            }
            await redis.quit(); // Verbindung schließen
        }
    } catch (e) {
        console.error('Redis Key Lookup Error:', e);
        // Fallback auf System-Key geht weiter...
    }

    if (!apiKey) {
        return res.status(500).json({ error: 'Kein API-Key gefunden. Bitte hinterlege einen Key im Admin-Bereich oder in Vercel.' });
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Google API Error:', data);
            return res.status(response.status).json({ 
                error: data.error?.message || `Google API Error: ${response.status}`,
                details: data.error
            });
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Analyze Handler Error:', error);
        res.status(500).json({ error: 'Server-Fehler: ' + error.message });
    }
}

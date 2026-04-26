export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { ticker, model, geminiBody } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Konfigurationsfehler: GEMINI_API_KEY fehlt in Vercel.' });
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

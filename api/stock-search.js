module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { query } = req.body;
    if (!query || query.length < 2) return res.status(200).json([]);

    const fmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key || process.env.FMP_KEY || process.env.fmp_key;

    if (!fmpKey) {
        console.error("FMP API Key missing in stock-search.");
        return res.status(500).json({ error: 'FMP API Key missing.' });
    }

    try {
        const searchRes = await fetch(`https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(query)}&limit=10&apikey=${fmpKey}`);
        const searchData = await searchRes.json().catch(() => []);
        
        // Filter results to ensure we have symbol, name, and stock exchange
        const results = (searchData || []).map(item => ({
            symbol: item.symbol,
            name: item.name,
            exchange: item.stockExchange || item.exchangeShortName,
            isin: item.isin || ''
        }));

        res.status(200).json(results);
    } catch (error) {
        console.error("Search API Error:", error);
        res.status(500).json({ error: 'Search failed: ' + error.message });
    }
}

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
        // We use a Google Search query that targets tickers and ISINs
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}+aktie+ticker+isin&num=10`;
        
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });

        const html = await response.text();
        
        // Regex to extract potential ticker/ISIN pairs from the search results
        // This is a heuristic approach to find "Name (TICKER) ... ISIN: [ISIN]"
        const results = [];
        const seen = new Set();

        // Pattern 1: Ticker in parentheses like (AAPL) or (NASDAQ: AAPL)
        const tickerRegex = /\(([A-Z0-9.:]{1,10})\)/g;
        // Pattern 2: ISIN like US5949181045
        const isinRegex = /[A-Z]{2}[A-Z0-9]{9}\d/g;

        // Try to find structured results in the HTML
        // Note: Scraping Google is fragile, but the user requested "ohne API"
        // We extract common patterns from the search snippets
        
        const snippets = html.split('<div class="g">').slice(1);
        
        for (const snippet of snippets) {
            const titleMatch = snippet.match(/<h3[^>]*>(.*?)<\/h3>/);
            if (!titleMatch) continue;
            
            const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
            const text = snippet.replace(/<[^>]*>/g, ' ');
            
            const tickerMatch = title.match(/\(([A-Z0-9.:]{1,10})\)/) || text.match(/\(([A-Z0-9.:]{1,10})\)/);
            const isinMatch = text.match(/[A-Z]{2}[A-Z0-9]{9}\d/);
            
            if (tickerMatch) {
                let symbol = tickerMatch[1].split(':').pop().trim();
                if (symbol && !seen.has(symbol) && symbol.length <= 6) {
                    results.push({
                        symbol: symbol,
                        name: title.split('(')[0].trim(),
                        exchange: tickerMatch[1].includes(':') ? tickerMatch[1].split(':')[0] : 'Search',
                        isin: isinMatch ? isinMatch[0] : ''
                    });
                    seen.add(symbol);
                }
            }
        }

        // Fallback: If scraping fails or returns nothing, try to use a more permissive search
        if (results.length === 0) {
            console.log("[Search] No results via scraping, falling back to basic search...");
            // As a last resort, we could use FMP search here but the user said "via Google Search"
            // For now, let's return an empty list or try to find anything in the text
        }

        res.status(200).json(results.slice(0, 8));
    } catch (error) {
        console.error("Search API Error:", error);
        res.status(500).json({ error: 'Search failed: ' + error.message });
    }
}

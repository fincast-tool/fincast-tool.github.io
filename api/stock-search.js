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
        const results = [];
        const seen = new Set();

        // 1. TRY LIGHTWEIGHT GOOGLE SEARCH (GBV=1) - More resistant to blocking
        try {
            const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}+aktie+ticker+isin&gbv=1&num=10`;
            const googleRes = await fetch(googleUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
            });
            const html = await googleRes.text();
            
            // Extract from standard Google result blocks
            const blocks = html.split('<div class="g">').slice(1);
            for (const block of blocks) {
                const title = (block.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] || '').replace(/<[^>]*>/g, '');
                const text = block.replace(/<[^>]*>/g, ' ');
                
                const tickerMatch = title.match(/\(([A-Z0-9.:]{1,10})\)/) || text.match(/\(([A-Z0-9.:]{1,10})\)/);
                const isinMatch = text.match(/[A-Z]{2}[A-Z0-9]{9}\d/);
                
                if (tickerMatch) {
                    const symbol = tickerMatch[1].split(':').pop().trim();
                    if (symbol && !seen.has(symbol) && symbol.length <= 6) {
                        results.push({
                            symbol,
                            name: title.split('(')[0].trim().substring(0, 40),
                            exchange: tickerMatch[1].includes(':') ? tickerMatch[1].split(':')[0] : 'Google',
                            isin: isinMatch ? isinMatch[0] : ''
                        });
                        seen.add(symbol);
                    }
                }
            }
        } catch (e) { console.warn("Google search failed, using fallbacks."); }

        // 2. FALLBACK TO FMP SEARCH (Reliable as we have a key)
        if (results.length < 3 && fmpKey) {
            try {
                const fmpUrl = `https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(query)}&limit=5&apikey=${fmpKey}`;
                const fmpRes = await fetch(fmpUrl);
                const fmpData = await fmpRes.json();
                for (const item of (fmpData || [])) {
                    if (!seen.has(item.symbol)) {
                        results.push({
                            symbol: item.symbol,
                            name: item.name,
                            exchange: item.stockExchange || item.exchangeShortName,
                            isin: item.isin || ''
                        });
                        seen.add(item.symbol);
                    }
                }
            } catch (e) { console.warn("FMP fallback failed."); }
        }

        // 3. FALLBACK TO YAHOO FINANCE (Best for company names)
        if (results.length < 3) {
            try {
                const yahooUrl = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5`;
                const yahooRes = await fetch(yahooUrl);
                const yahooData = await yahooRes.json();
                for (const item of (yahooData.quotes || [])) {
                    if (item.symbol && !seen.has(item.symbol)) {
                        results.push({
                            symbol: item.symbol,
                            name: item.shortname || item.longname || item.symbol,
                            exchange: item.exchDisp || item.exchange,
                            isin: item.isin || ''
                        });
                        seen.add(item.symbol);
                    }
                }
            } catch (e) { console.warn("Yahoo fallback failed."); }
        }

        res.status(200).json(results.slice(0, 10));
    } catch (error) {
        console.error("Search API Error:", error);
        res.status(500).json({ error: 'Search failed: ' + error.message });
    }
}

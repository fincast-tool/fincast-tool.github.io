const Redis = require('ioredis');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { ticker, model, geminiBody, email, apiKey: clientApiKey, action } = req.body;
    
    const apiKey = (clientApiKey && clientApiKey.trim() !== '') 
                   ? clientApiKey.trim() 
                   : process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Kein API-Key gefunden. Bitte hinterlege einen Key im Admin-Bereich oder in Vercel.' });
    }

    try {
        // --- FMP INTEGRATION ---
        const fmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key;
        
        console.log(`[DIAGNOSE] FMP-Check: Key vorhanden? ${fmpKey ? 'JA' : 'NEIN'} | Ticker: ${ticker}`);

        if (fmpKey && ticker && geminiBody && geminiBody.contents && geminiBody.contents[0].parts[0].text) {
            try {
                // 1. Symbol auflösen
                const searchRes = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(ticker)}&limit=1&apikey=${fmpKey}`);
                const searchData = await searchRes.json();
                
                const symbol = (searchData && searchData.length > 0) ? searchData[0].symbol : ticker.toUpperCase();
                
                console.log(`[DIAGNOSE] Nutze Symbol: ${symbol}`);

                const [profileRes, quoteRes, metricsRes, ttmRes, growthRes, ptRes, earnRes, rsiRes, macdRes, cfRes, incomeRes] = await Promise.all([
                    fetch(`https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=10&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/financial-growth/${symbol}?limit=1&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${symbol}&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/technical_indicator/1day/${symbol}?type=rsi&period=14&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/technical_indicator/1day/${symbol}?type=macd&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=10&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=10&apikey=${fmpKey}`).catch(() => ({ json: () => [] }))
                ]);

                const profileData = await profileRes.json().catch(() => []);
                const quoteData = await quoteRes.json().catch(() => []);
                const metricsData = await metricsRes.json().catch(() => []);
                const ttmData = await ttmRes.json().catch(() => []);
                const growthData = await growthRes.json().catch(() => []);
                const ptData = await ptRes.json().catch(() => []);
                const earnData = await earnRes.json().catch(() => []);
                const rsiDataRaw = await rsiRes.json().catch(() => []);
                const macdDataRaw = await macdRes.json().catch(() => []);
                const cfData = await cfRes.json().catch(() => []);
                const incomeData = await incomeRes.json().catch(() => []);
                
                if (profileData && profileData.length > 0 && quoteData && quoteData.length > 0) {
                    const profile = profileData[0] || {};
                    const quote = quoteData[0] || {};
                    const ttm = ttmData[0] || {};
                    const growth = growthData[0] || {};
                    const pt = ptData[0] || {};
                    
                    const rsiData = (rsiDataRaw && rsiDataRaw.length > 0) ? rsiDataRaw[0].rsi : 'N/A';
                    const macdData = (macdDataRaw && macdDataRaw.length > 0) ? macdDataRaw[0].macd : 'N/A';
                    const earnString = (earnData && earnData.length > 0) 
                        ? earnData.slice(0,4).map(e => `Q-Date: ${e.date?.split(' ')[0]} | Est: ${e.estimatedEarning} | Act: ${e.actualEarning}`).join('\n') 
                        : 'N/A';
                    
                    if (metricsData && metricsData.length > 0) {
                        let sumPE = 0, sumPB = 0, sumPS = 0, sumEV = 0;
                        let countPE = 0, countPB = 0, countPS = 0, countEV = 0;
                        let sumPE10 = 0, countPE10 = 0;
                        
                        metricsData.forEach((y, index) => {
                            const pe = y.peRatio;
                            const pb = y.pbRatio;
                            const ps = y.priceToSalesRatio;
                            const ev = y.enterpriseValueOverEBITDA;

                            if (index < 5) {
                                if (pe !== null && pe !== undefined) { sumPE += pe; countPE++; }
                                if (pb !== null && pb !== undefined) { sumPB += pb; countPB++; }
                                if (ps !== null && ps !== undefined) { sumPS += ps; countPS++; }
                                if (ev !== null && ev !== undefined) { sumEV += ev; countEV++; }
                            }
                            if (pe !== null && pe !== undefined) { sumPE10 += pe; countPE10++; }
                        });

                        let sumFCF5 = 0, countFCF5 = 0, sumFCF10 = 0, countFCF10 = 0;
                        if (cfData && cfData.length > 0) {
                            cfData.forEach((y, index) => {
                                let fcf = y.freeCashFlow;
                                if (fcf === null || fcf === undefined) {
                                    const ocf = y.netCashProvidedByOperatingActivities || y.operatingCashFlow || 0;
                                    const capex = Math.abs(y.capitalExpenditure || 0);
                                    fcf = ocf - capex;
                                }
                                if (fcf !== null && fcf !== undefined) {
                                    if (index < 5) { sumFCF5 += fcf; countFCF5++; }
                                    sumFCF10 += fcf; countFCF10++;
                                }
                            });
                        }
                        
                        const avgPE = countPE > 0 ? (sumPE / countPE).toFixed(2) : 'N/A';
                        const avgPE10 = countPE10 > 0 ? (sumPE10 / countPE10).toFixed(2) : 'N/A';
                        const avgFCF5 = countFCF5 > 0 ? (sumFCF5 / countFCF5 / 1e6).toFixed(2) + ' M' : 'N/A';
                        
                        let currentFCFVal = cfData[0] ? cfData[0].freeCashFlow : null;
                        if (currentFCFVal === null || currentFCFVal === undefined) {
                           if (cfData[0]) {
                               const ocf = cfData[0].netCashProvidedByOperatingActivities || cfData[0].operatingCashFlow || 0;
                               const capex = Math.abs(cfData[0].capitalExpenditure || 0);
                               currentFCFVal = ocf - capex;
                           }
                        }
                        const currentFCF = (currentFCFVal !== null && currentFCFVal !== undefined) ? (currentFCFVal / 1e6).toFixed(2) + ' M' : 'N/A';

                        const firstMetric = metricsData[0] || {};
                        const currentPE = (firstMetric.peRatio !== null && firstMetric.peRatio !== undefined) ? firstMetric.peRatio.toFixed(2) : 'N/A';

                        const fmpContext = `
[!!! MANDATORY PRIMARY DATA !!!]
--- IDENTIFICATION & PRICE ---
Name: ${profile.companyName || 'N/A'} (${symbol})
Price: $${quote.price || 'N/A'}
Market Cap: ${quote.marketCap ? '$' + (quote.marketCap / 1e9).toFixed(2) + ' Billion' : 'N/A'}

--- TRENDS (LAST 5Y) ---
Yearly Revenue: ${ incomeData.slice(0,5).map(y => (y.revenue/1e9).toFixed(2) + 'B').reverse().join(' -> ') }
Yearly Op. Margin: ${ incomeData.slice(0,5).map(y => ((y.operatingIncome/y.revenue)*100).toFixed(1) + '%').reverse().join(' -> ') }
Yearly FCF: ${ cfData.slice(0,5).map(y => (y.freeCashFlow/1e9).toFixed(2) + 'B').reverse().join(' -> ') }

--- VALUATION ---
Current P/E: ${currentPE} | 5Y Avg: ${avgPE} | 10Y Avg: ${avgPE10}
ROE: ${ttm.roeTTM ? (ttm.roeTTM * 100).toFixed(2) + '%' : 'N/A'}
[/MANDATORY PRIMARY DATA]
`;
                        geminiBody.contents[0].parts[0].text = fmpContext + geminiBody.contents[0].parts[0].text;
                    }
                }
            } catch(e) {
                console.error("FMP Fetch Error:", e);
            }
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ 
                error: data.error?.message || `Google API Error: ${response.status}`
            });
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Analyze Handler Error:', error);
        res.status(500).json({ error: 'Server-Fehler: ' + error.message });
    }
}

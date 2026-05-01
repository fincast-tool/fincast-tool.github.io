const Redis = require('ioredis');

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { ticker, model, geminiBody, email, apiKey: clientApiKey } = req.body;

    const apiKey = (clientApiKey && clientApiKey.trim() !== '')
        ? clientApiKey.trim()
        : process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Kein API-Key gefunden.' });
    }

    try {
        // --- FMP INTEGRATION ---
        const fmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key || process.env.FMP_KEY || process.env.fmp_key;

        if (ticker && geminiBody && geminiBody.contents && geminiBody.contents[0].parts[0].text) {
            if (!fmpKey) {
                console.warn("FMP API Key missing.");
                geminiBody.contents[0].parts[0].text = "[DEBUG: FMP_API_KEY_MISSING - The system could not find an FMP API key in environment variables. Falling back to Google Search.]\n\n" + geminiBody.contents[0].parts[0].text;
            } else {
                try {
                // Detect if ticker is already a symbol (1-5 uppercase letters)
                const isTicker = /^[A-Z]{1,5}$/.test(ticker.trim().toUpperCase());
                let symbol = isTicker ? ticker.trim().toUpperCase() : null;

                if (!symbol) {
                    try {
                        const searchRes = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(ticker)}&limit=1&apikey=${fmpKey}`);
                        const searchData = await searchRes.json();
                        symbol = (Array.isArray(searchData) && searchData.length > 0) ? searchData[0].symbol : ticker.toUpperCase();
                    } catch (e) {
                        symbol = ticker.toUpperCase();
                    }
                }

                const [profileRes, quoteRes, metricsRes, ttmRes, growthRes, ptRes, earnRes, rsiRes, macdRes, cfRes, incomeRes, estRes, insiderRes, instRes] = await Promise.all([
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
                    fetch(`https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=10&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v3/analyst-estimates/${symbol}?limit=1&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v4/insider-trading?symbol=${symbol}&limit=5&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                    fetch(`https://financialmodelingprep.com/api/v4/institutional-ownership/symbol-ownership-percent?symbol=${symbol}&apikey=${fmpKey}`).catch(() => ({ json: () => [] }))
                ]);

                let profileData = await profileRes.json().catch(() => []);
                if (!Array.isArray(profileData)) profileData = [];
                
                let quoteData = await quoteRes.json().catch(() => []);
                if (!Array.isArray(quoteData)) quoteData = [];
                
                let metricsData = await metricsRes.json().catch(() => []);
                if (!Array.isArray(metricsData)) metricsData = [];
                
                let ttmData = await ttmRes.json().catch(() => []);
                if (!Array.isArray(ttmData)) ttmData = [];
                
                let growthData = await growthRes.json().catch(() => []);
                if (!Array.isArray(growthData)) growthData = [];
                
                let ptData = await ptRes.json().catch(() => []);
                if (!Array.isArray(ptData)) ptData = [];
                
                let earnData = await earnRes.json().catch(() => []);
                if (!Array.isArray(earnData)) earnData = [];
                
                let rsiDataRaw = await rsiRes.json().catch(() => []);
                if (!Array.isArray(rsiDataRaw)) rsiDataRaw = [];
                
                let macdDataRaw = await macdRes.json().catch(() => []);
                if (!Array.isArray(macdDataRaw)) macdDataRaw = [];
                
                let cfData = await cfRes.json().catch(() => []);
                if (!Array.isArray(cfData)) cfData = [];
                
                let incomeData = await incomeRes.json().catch(() => []);
                if (!Array.isArray(incomeData)) incomeData = [];
                
                let estData = await estRes.json().catch(() => []);
                if (!Array.isArray(estData)) estData = [];
                
                let insiderData = await insiderRes.json().catch(() => []);
                if (!Array.isArray(insiderData)) insiderData = [];
                
                let instData = await instRes.json().catch(() => []);
                if (!Array.isArray(instData)) instData = [];

                // Ensure we have at least the basic profile and quote data
                const hasProfile = Array.isArray(profileData) && profileData.length > 0;
                const hasQuote = Array.isArray(quoteData) && quoteData.length > 0;

                if (hasProfile && hasQuote) {
                    const profile = profileData[0] || {};
                    const quote = quoteData[0] || {};
                    const ttm = ttmData[0] || {};
                    const growth = growthData[0] || {};
                    const pt = ptData[0] || {};
                    const rsiData = (rsiDataRaw && rsiDataRaw.length > 0 && rsiDataRaw[0].rsi != null) ? rsiDataRaw[0].rsi : 'N/A';
                    const macdData = (macdDataRaw && macdDataRaw.length > 0 && macdDataRaw[0].macd != null) ? macdDataRaw[0].macd : 'N/A';
                    const earnString = (earnData && earnData.length > 0)
                        ? earnData.slice(0, 4).map(e => `Q-Date: ${e.date?.split(' ')[0]} | Est: ${e.estimatedEarning} | Act: ${e.actualEarning}`).join('\n')
                        : 'N/A';

                    if (metricsData && metricsData.length > 0) {
                        let sumPE = 0, sumPB = 0, sumPS = 0, sumEV = 0;
                        let countPE = 0, countPB = 0, countPS = 0, countEV = 0;
                        let sumPE10 = 0, countPE10 = 0;

                        metricsData.forEach((y, index) => {
                            if (index < 5) {
                                if (y.peRatio) { sumPE += y.peRatio; countPE++; }
                                if (y.pbRatio) { sumPB += y.pbRatio; countPB++; }
                                if (y.priceToSalesRatio) { sumPS += y.priceToSalesRatio; countPS++; }
                                if (y.enterpriseValueOverEBITDA) { sumEV += y.enterpriseValueOverEBITDA; countEV++; }
                            }
                            if (y.peRatio) { sumPE10 += y.peRatio; countPE10++; }
                        });

                        const avgPE = countPE > 0 ? (sumPE / countPE).toFixed(2) : 'N/A';
                        const avgPE10 = countPE10 > 0 ? (sumPE10 / countPE10).toFixed(2) : 'N/A';

                        // Calculate 5Y Revenue CAGR
                        let revenueCAGR = 'N/A';
                        if (incomeData.length >= 5) {
                            const revEnd = incomeData[0].revenue;
                            const revStart = incomeData[4].revenue;
                            if (revStart > 0 && revEnd > 0) {
                                revenueCAGR = ((Math.pow(revEnd / revStart, 1 / 4) - 1) * 100).toFixed(2) + '%';
                            }
                        }

                        const upcomingEst = (estData && estData.length > 0) 
                            ? `Rev: ${estData[0].revenueLow}-${estData[0].revenueHigh} | EPS: ${estData[0].estimatedEarningLow}-${estData[0].estimatedEarningHigh}`
                            : 'N/A';

                        const insiderActivity = (insiderData && insiderData.length > 0)
                            ? insiderData.slice(0, 5).map(i => `${i.transactionDate}: ${i.reportingName} (${i.typeOfOwner}) ${i.transactionType} ${i.securitiesTransacted} shares`).join('\n')
                            : 'N/A';

                        const instOwnership = (instData && instData.length > 0)
                            ? `Institutional Ownership: ${instData[0].ownershipPercent?.toFixed(2)}%`
                            : 'N/A';

                        const fmpContext = `
[FMP API BLOCK]
Name: ${profile.companyName || 'N/A'}
Symbol: ${symbol}
ISIN: ${profile.isin || 'N/A'}
WKN: ${profile.cusip || 'N/A'}
Sector/Industry: ${profile.sector || 'N/A'} / ${profile.industry || 'N/A'}
HQ: ${profile.city || 'N/A'}, ${profile.country || 'N/A'}
Description: ${profile.description || 'N/A'}
Current Price: $${quote.price || 'N/A'}
Market Cap: ${quote.marketCap ? '$' + (quote.marketCap / 1e9).toFixed(2) + ' Billion' : 'N/A'}

--- FINANCIAL TRENDS ---
Revenue (5Y): ${incomeData.slice(0, 5).map(y => (y.revenue / 1e9).toFixed(2) + 'B').reverse().join(' -> ')}
5Y Revenue CAGR: ${revenueCAGR}
Op. Margins (5Y): ${incomeData.slice(0, 5).map(y => ((y.operatingIncome / y.revenue) * 100).toFixed(1) + '%').reverse().join(' -> ')}
FCF Trend (5Y): ${cfData.slice(0, 5).map(y => (y.freeCashFlow / 1e9).toFixed(2) + 'B').reverse().join(' -> ')}
EPS Surprise History:
${earnString}

--- ANALYST & SMART MONEY ---
Upcoming Consensus: ${upcomingEst}
Institutional Trends: ${instOwnership}
Insider Activity:
${insiderActivity}

--- VALUATION METRICS ---
Current P/E: ${metricsData[0]?.peRatio?.toFixed(2) || 'N/A'}
5Y Avg P/E: ${avgPE}
10Y Avg P/E: ${avgPE10}
Current P/S: ${metricsData[0]?.priceToSalesRatio?.toFixed(2) || 'N/A'}
Debt to Equity: ${ttm.debtToEquityTTM?.toFixed(2) || 'N/A'}
ROE: ${ttm.roeTTM ? (ttm.roeTTM * 100).toFixed(2) + '%' : 'N/A'}
Dividend Yield: ${quote.dividendYield ? (quote.dividendYield * 100).toFixed(2) + '%' : 'N/A'}
Payout Ratio: ${ttm.payoutRatioTTM ? (ttm.payoutRatioTTM * 100).toFixed(2) + '%' : 'N/A'}
DCF Fair Value Estimate: $${profile.dcf?.toFixed(2) || 'N/A'}
Bull Case Target: $${pt.targetHigh || 'N/A'}
Bear Case Target: $${pt.targetLow || 'N/A'}
Consensus Target: $${pt.targetConsensus || 'N/A'}

--- TECHNICAL INDICATORS ---
14-Day RSI: ${rsiData !== 'N/A' ? rsiData.toFixed(2) : 'N/A'}
MACD: ${macdData !== 'N/A' ? macdData.toFixed(2) : 'N/A'}
50-DMA: $${quote.priceAvg50 || 'N/A'}
200-DMA: $${quote.priceAvg200 || 'N/A'}
Short Interest: ${quote.sharesOutstanding ? ((quote.volume / quote.sharesOutstanding) * 100).toFixed(2) + '%' : 'N/A'} (Volume Proxy)
Next Earnings: ${quote.earningsAnnouncement || 'N/A'}
[/FMP API BLOCK]
`;
                        geminiBody.contents[0].parts[0].text = fmpContext + "\n" + geminiBody.contents[0].parts[0].text;
                    }
                } else {
                    geminiBody.contents[0].parts[0].text = `[DEBUG: FMP_DATA_INCOMPLETE - Profile: ${hasProfile}, Quote: ${hasQuote}. Falling back to Google Search.]\n\n` + geminiBody.contents[0].parts[0].text;
                }
                } catch (e) { 
                    console.error("FMP Error:", e);
                    geminiBody.contents[0].parts[0].text = `[DEBUG: FMP_FETCH_ERROR - ${e.message}. Falling back to Google Search.]\n\n` + geminiBody.contents[0].parts[0].text;
                }
            }
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody)
        });

        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: data.error?.message });
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Server-Fehler: ' + error.message });
    }
}

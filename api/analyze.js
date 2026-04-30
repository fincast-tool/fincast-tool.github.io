import Redis from 'ioredis';

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { ticker, model, geminiBody, email, apiKey: clientApiKey, action } = req.body;
    
    // Architektur-Update: Wir nutzen direkt den lokalen Key des Users (falls vorhanden), 
    // um die langsame Vercel-Datenbank-Verbindung (Redis) vor der Generierung komplett zu umgehen.
    const apiKey = (clientApiKey && clientApiKey.trim() !== '') 
                   ? clientApiKey.trim() 
                   : process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'Kein API-Key gefunden. Bitte hinterlege einen Key im Admin-Bereich oder in Vercel.' });
    }

    try {
        // --- FMP INTEGRATION ---
        // Lädt historische Multiples, falls ein FMP_API_KEY in Vercel hinterlegt ist.
        const fmpKey = process.env.FMP_API_KEY;
        if (fmpKey && ticker && geminiBody && geminiBody.contents && geminiBody.contents[0].parts[0].text) {
            try {
                // 1. Symbol auflösen (falls der User z.B. "Apple" statt "AAPL" eingegeben hat)
                const searchRes = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(ticker)}&limit=1&apikey=${fmpKey}`);
                const searchData = await searchRes.json();
                
                if (searchData && searchData.length > 0) {
                    const symbol = searchData[0].symbol;
                    
                    // Lade alle zentralen Marktdaten parallel für maximale Geschwindigkeit
                    const [profileRes, quoteRes, metricsRes, ttmRes, growthRes, ptRes, earnRes, rsiRes, macdRes, cfRes] = await Promise.all([
                        fetch(`https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=10&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v3/financial-growth/${symbol}?limit=1&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v4/price-target-consensus?symbol=${symbol}&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v3/technical_indicator/1day/${symbol}?type=rsi&period=14&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v3/technical_indicator/1day/${symbol}?type=macd&apikey=${fmpKey}`).catch(() => ({ json: () => [] })),
                        fetch(`https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=10&apikey=${fmpKey}`).catch(() => ({ json: () => [] }))
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
                            if (index < 5) {
                                if (y.peRatio) { sumPE += y.peRatio; countPE++; }
                                if (y.pbRatio) { sumPB += y.pbRatio; countPB++; }
                                if (y.priceToSalesRatio) { sumPS += y.priceToSalesRatio; countPS++; }
                                if (y.enterpriseValueOverEBITDA) { sumEV += y.enterpriseValueOverEBITDA; countEV++; }
                            }
                            if (y.peRatio) { sumPE10 += y.peRatio; countPE10++; }
                        });

                        // FCF Berechnung aus Cash Flow Statement
                        let sumFCF5 = 0, countFCF5 = 0, sumFCF10 = 0, countFCF10 = 0;
                        if (cfData && cfData.length > 0) {
                            cfData.forEach((y, index) => {
                                if (index < 5) {
                                    if (y.freeCashFlow) { sumFCF5 += y.freeCashFlow; countFCF5++; }
                                }
                                if (y.freeCashFlow) { sumFCF10 += y.freeCashFlow; countFCF10++; }
                            });
                        }
                        
                        const avgPE = countPE > 0 ? (sumPE / countPE).toFixed(2) : 'N/A';
                        const avgPB = countPB > 0 ? (sumPB / countPB).toFixed(2) : 'N/A';
                        const avgPS = countPS > 0 ? (sumPS / countPS).toFixed(2) : 'N/A';
                        const avgEV = countEV > 0 ? (sumEV / countEV).toFixed(2) : 'N/A';
                        const avgPE10 = countPE10 > 0 ? (sumPE10 / countPE10).toFixed(2) : 'N/A';

                        const avgFCF5 = countFCF5 > 0 ? (sumFCF5 / countFCF5 / 1e6).toFixed(2) + ' M' : 'N/A';
                        const avgFCF10 = countFCF10 > 0 ? (sumFCF10 / countFCF10 / 1e6).toFixed(2) + ' M' : 'N/A';
                        const currentFCF = (cfData && cfData[0] && cfData[0].freeCashFlow) ? (cfData[0].freeCashFlow / 1e6).toFixed(2) + ' M' : 'N/A';

                        const currentPE = metricsData[0].peRatio ? metricsData[0].peRatio.toFixed(2) : 'N/A';
                        const currentPB = metricsData[0].pbRatio ? metricsData[0].pbRatio.toFixed(2) : 'N/A';
                        const currentPS = metricsData[0].priceToSalesRatio ? metricsData[0].priceToSalesRatio.toFixed(2) : 'N/A';
                        const currentEV = metricsData[0].enterpriseValueOverEBITDA ? metricsData[0].enterpriseValueOverEBITDA.toFixed(2) : 'N/A';

                        // Baue den ultimativen Single Source of Truth Block auf
                        const fmpContext = `
[FMP API DATA - SINGLE SOURCE of TRUTH]
CRITICAL INSTRUCTION: You MUST use these exact API numbers for your fundamental analysis, valuation, and technical signals. 
Do NOT use Google Search for these metrics! Use Google Search ONLY for recent news, management guidance, macro sentiment, and short interest / 13F flux.

--- IDENTIFICATION & PRICE ---
Name: ${profile.companyName || 'N/A'} (${symbol})
HQ: ${profile.city || 'N/A'}, ${profile.country || 'N/A'}
Sector/Industry: ${profile.sector || 'N/A'} / ${profile.industry || 'N/A'}
Description: ${profile.description ? profile.description.substring(0, 150) + '...' : 'N/A'}
Current Price: $${quote.price || 'N/A'} (Day Change: ${quote.changesPercentage ? quote.changesPercentage.toFixed(2) : 'N/A'}%)
52-Week Range: $${quote.yearLow || 'N/A'} - $${quote.yearHigh || 'N/A'}
Market Cap: ${quote.marketCap ? '$' + (quote.marketCap / 1e9).toFixed(2) + ' Billion' : 'N/A'}
Beta: ${profile.beta || 'N/A'}

--- TECHNICALS & SENTIMENT ---
50-Day Moving Average: $${quote.priceAvg50 || 'N/A'}
200-Day Moving Average: $${quote.priceAvg200 || 'N/A'}
Avg Volume: ${quote.avgVolume || 'N/A'}
14-Day RSI: ${rsiData !== 'N/A' ? rsiData.toFixed(2) : 'N/A'}
MACD: ${macdData !== 'N/A' ? macdData.toFixed(2) : 'N/A'}

--- MULTIPLES & VALUATION ---
Aktuelles KGV (P/E): ${currentPE} | 5J-Avg KGV: ${avgPE} | 10J-Avg KGV: ${avgPE10}
Aktuelles KBV (P/B): ${currentPB} | 5J-Avg KBV: ${avgPB}
Aktuelles KUV (P/S): ${currentPS} | 5J-Avg KUV: ${avgPS}
Aktuelles EV/EBITDA: ${currentEV} | 5J-Avg EV/EBITDA: ${avgEV}
Aktueller Free Cash Flow (FCF): ${currentFCF}
Avg FCF (5J): ${avgFCF5} | Avg FCF (10J): ${avgFCF10}
DCF Fair Value Estimate (FMP): $${profile.dcf ? profile.dcf.toFixed(2) : 'N/A'}
Analyst Price Target (Consensus): ${pt.targetConsensus ? '$' + pt.targetConsensus : 'N/A'} (High: $${pt.targetHigh || 'N/A'} | Low: $${pt.targetLow || 'N/A'})

--- GROWTH & MARGINS ---
EPS (Trailing): $${quote.eps || 'N/A'}
1Y Revenue Growth: ${growth.revenueGrowth ? (growth.revenueGrowth * 100).toFixed(2) + '%' : 'N/A'}
1Y EPS Growth: ${growth.epsgrowth ? (growth.epsgrowth * 100).toFixed(2) + '%' : 'N/A'}
Operating Margin: ${ttm.operatingProfitMarginTTM ? (ttm.operatingProfitMarginTTM * 100).toFixed(2) + '%' : 'N/A'}
Net Margin: ${ttm.netProfitMarginTTM ? (ttm.netProfitMarginTTM * 100).toFixed(2) + '%' : 'N/A'}
ROE: ${ttm.roeTTM ? (ttm.roeTTM * 100).toFixed(2) + '%' : 'N/A'}
ROIC: ${ttm.roicTTM ? (ttm.roicTTM * 100).toFixed(2) + '%' : 'N/A'}
Debt to Equity: ${ttm.debtToEquityTTM ? ttm.debtToEquityTTM.toFixed(2) : 'N/A'}
FCF Yield: ${ttm.freeCashFlowYieldTTM ? (ttm.freeCashFlowYieldTTM * 100).toFixed(2) + '%' : 'N/A'}
Dividend Yield: ${ttm.dividendYieldPercentageTTM ? ttm.dividendYieldPercentageTTM.toFixed(2) + '%' : 'N/A'}

--- EARNINGS HISTORY ---
Next Earnings Date: ${quote.earningsAnnouncement || 'N/A'}
Last 4 Quarters EPS Surprise History:
${earnString}
[/FMP API DATA]

`;
                        // Fügt die harten FMP-Daten GANZ OBEN in den Gemini Prompt ein
                        geminiBody.contents[0].parts[0].text = fmpContext + geminiBody.contents[0].parts[0].text;
                    }
                }
            } catch(e) {
                console.error("FMP Fetch Error:", e);
                // Fehler ignorieren, damit Gemini trotzdem antwortet
            }
        }
        // --- END FMP INTEGRATION ---

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

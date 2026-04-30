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

                        // FCF Berechnung aus Cash Flow Statement
                        let sumFCF5 = 0, countFCF5 = 0, sumFCF10 = 0, countFCF10 = 0;
                        if (cfData && cfData.length > 0) {
                            cfData.forEach((y, index) => {
                                // Fallback: Falls freeCashFlow null ist, berechne es selbst
                                let fcf = y.freeCashFlow;
                                if (fcf === null || fcf === undefined) {
                                    const ocf = y.netCashProvidedByOperatingActivities || y.operatingCashFlow || 0;
                                    const capex = Math.abs(y.capitalExpenditure || 0);
                                    fcf = ocf - capex;
                                }

                                if (fcf !== null && fcf !== undefined) {
                                    if (index < 5) {
                                        sumFCF5 += fcf;
                                        countFCF5++;
                                    }
                                    sumFCF10 += fcf;
                                    countFCF10++;
                                }
                            });
                        }
                        
                        const avgPE = countPE > 0 ? (sumPE / countPE).toFixed(2) : 'N/A';
                        const avgPB = countPB > 0 ? (sumPB / countPB).toFixed(2) : 'N/A';
                        const avgPS = countPS > 0 ? (sumPS / countPS).toFixed(2) : 'N/A';
                        const avgEV = countEV > 0 ? (sumEV / countEV).toFixed(2) : 'N/A';
                        const avgPE10 = countPE10 > 0 ? (sumPE10 / countPE10).toFixed(2) : 'N/A';

                        const avgFCF5 = countFCF5 > 0 ? (sumFCF5 / countFCF5 / 1e6).toFixed(2) + ' M' : 'N/A';
                        const avgFCF10 = countFCF10 > 0 ? (sumFCF10 / countFCF10 / 1e6).toFixed(2) + ' M' : 'N/A';
                        
                        // Aktueller FCF mit Fallback
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
                        const currentPB = (firstMetric.pbRatio !== null && firstMetric.pbRatio !== undefined) ? firstMetric.pbRatio.toFixed(2) : 'N/A';
                        const currentPS = (firstMetric.priceToSalesRatio !== null && firstMetric.priceToSalesRatio !== undefined) ? firstMetric.priceToSalesRatio.toFixed(2) : 'N/A';
                        const currentEV = (firstMetric.enterpriseValueOverEBITDA !== null && firstMetric.enterpriseValueOverEBITDA !== undefined) ? firstMetric.enterpriseValueOverEBITDA.toFixed(2) : 'N/A';

                        // Baue den ultimativen Single Source of Truth Block auf
                        const fmpContext = `
[!!! MANDATORY PRIMARY DATA - READ THIS FIRST !!!]
CRITICAL: THE DATA BELOW IS THE ONLY SOURCE FOR FUNDAMENTAL METRICS.
1. You MUST use these exact numbers. 
2. If a value is provided below, you ARE FORBIDDEN to report 'N/A' or 'Not found'.
3. DO NOT SEARCH GOOGLE FOR THESE METRICS (P/E, FCF, Growth). THE DATA IS ALREADY HERE.
4. If you report 'N/A' while data is present below, you have FAILED your task.

--- IDENTIFICATION & PRICE ---
Name (Unternehmensname): ${profile.companyName || 'N/A'} (${symbol})
Current Price (Aktueller Kurs): $${quote.price || 'N/A'}
Market Cap (Börsenwert): ${quote.marketCap ? '$' + (quote.marketCap / 1e9).toFixed(2) + ' Billion' : 'N/A'}

--- MULTIPLES & VALUATION (BEWERTUNG) ---
Current P/E (Aktuelles KGV): ${currentPE}
5Y Average P/E (5J KGV Durchschnitt): ${avgPE}
10Y Average P/E (10J KGV Durchschnitt): ${avgPE10}
Current P/S (Aktuelles KUV): ${currentPS}
Current P/B (Aktuelles KBV): ${currentPB}
Current EV/EBITDA: ${currentEV}

--- CASH FLOW & MULTIPLES (FCF) ---
Current Free Cash Flow (Aktueller FCF): ${currentFCF}
Current P/FCF (FCF Multiple): ${ (quote.marketCap && currentFCFVal > 0) ? (quote.marketCap / currentFCFVal).toFixed(2) : 'N/A' }
Average FCF 5Y (5J FCF Durchschnitt): ${avgFCF5}
Average FCF 10Y (10J FCF Durchschnitt): ${avgFCF10}

--- DCF & TARGETS ---
DCF Fair Value Estimate (FMP): $${profile.dcf ? profile.dcf.toFixed(2) : 'N/A'}
Analyst Price Target (Kursziel Consensus): ${pt.targetConsensus ? '$' + pt.targetConsensus : 'N/A'}

--- GROWTH & MARGINS (WACHSTUM) ---
1Y Revenue Growth: ${growth.revenueGrowth ? (growth.revenueGrowth * 100).toFixed(2) + '%' : 'N/A'}
1Y EPS Growth: ${growth.epsgrowth ? (growth.epsgrowth * 100).toFixed(2) + '%' : 'N/A'}
Operating Margin (Operative Marge): ${ttm.operatingProfitMarginTTM ? (ttm.operatingProfitMarginTTM * 100).toFixed(2) + '%' : 'N/A'}
ROE (Eigenkapitalrendite): ${ttm.roeTTM ? (ttm.roeTTM * 100).toFixed(2) + '%' : 'N/A'}
Debt to Equity: ${ttm.debtToEquityTTM ? ttm.debtToEquityTTM.toFixed(2) : 'N/A'}
FCF Yield (FCF Rendite): ${ttm.freeCashFlowYieldTTM ? (ttm.freeCashFlowYieldTTM * 100).toFixed(2) + '%' : 'N/A'}

--- EARNINGS HISTORY ---
Next Earnings Date: ${quote.earningsAnnouncement || 'N/A'}
Last 4 Quarters EPS Surprise History:
${earnString}
[/MANDATORY PRIMARY DATA]

`;

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

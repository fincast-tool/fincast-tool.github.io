module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { ticker, model, geminiBody, apiKey: clientApiKey } = req.body;
    const apiKey = (clientApiKey && clientApiKey.trim() !== '') ? clientApiKey.trim() : process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'Kein API-Key gefunden.' });


    console.log(`[Backend] Processing request for ticker: ${ticker}, model: ${model}`);
    console.log(`[Backend] Available Env Keys:`, Object.keys(process.env));

    try {
        const fmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key || process.env.FMP_KEY || process.env.fmp_key;
        
        // Initial system status for debugging
        let systemStatus = `DEBUG: Backend reached. Ticker: ${ticker}. `;

        if (ticker && geminiBody && geminiBody.contents) {
            if (!fmpKey) {
                console.warn("FMP API Key missing.");
                systemStatus += "ERROR: FMP_API_KEY_MISSING.";
                geminiBody.contents[0].parts[0].text = `<system_status>\n${systemStatus}\n</system_status>\n\n` + geminiBody.contents[0].parts[0].text;
            } else {
                const maskedKey = fmpKey.length > 5 ? (fmpKey.substring(0, 3) + "..." + fmpKey.substring(fmpKey.length - 3)) : "***";
                systemStatus += `FMP Key Found (${maskedKey}). `;
                let fmpDetails = "";
                try {

                    // Detect if ticker is already a symbol (1-5 uppercase letters)
                    const isTicker = /^[A-Z0-9.\-]{1,6}$/.test(ticker.trim().toUpperCase());
                    let symbol = isTicker ? ticker.trim().toUpperCase() : null;

                    if (!symbol || ticker.length > 5) {
                        console.log(`[Backend] Searching symbol for: ${ticker}`);
                        fmpDetails += "Searching symbol... ";
                        
                        // 1. Try finding a US ticker (ADR) first to bypass international data restrictions
                        let searchRes = await fetch(`https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(ticker)}&limit=3&exchange=NYSE,NASDAQ&apikey=${fmpKey}`);
                        let searchData = await searchRes.json().catch(() => []);
                        
                        // 2. Fallback to global search if no US ticker is found
                        if (!searchData || searchData.length === 0) {
                            searchRes = await fetch(`https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(ticker)}&limit=1&apikey=${fmpKey}`);
                            searchData = await searchRes.json().catch(() => []);
                        }

                        symbol = (searchData && searchData[0]) ? searchData[0].symbol : ticker.trim().toUpperCase();
                        console.log(`[Backend] Search result: ${symbol}`);
                    }
                    fmpDetails += `Using Symbol: ${symbol}. `;

                    console.log(`[Backend] Starting fetches for ${symbol}...`);

                    const [profileRes, quoteRes, metricsRes, ttmRes, earnRes, rsiRes, macdRes, cfRes, incomeRes, histRes] = await Promise.all([
                        fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${fmpKey}`).catch(e => { console.error("Profile Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${fmpKey}`).catch(e => { console.error("Quote Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&limit=5&apikey=${fmpKey}`).catch(e => { console.error("Metrics Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${symbol}&apikey=${fmpKey}`).catch(e => { console.error("TTM Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/earnings-surprises?symbol=${symbol}&apikey=${fmpKey}`).catch(e => { console.error("Earnings Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/api/v3/technical-indicators/daily/${symbol}?type=rsi&period=14&apikey=${fmpKey}`).catch(e => { console.error("RSI Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/api/v3/technical-indicators/daily/${symbol}?type=macd&apikey=${fmpKey}`).catch(e => { console.error("MACD Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`).catch(e => { console.error("CF Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`).catch(e => { console.error("Income Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=20&apikey=${fmpKey}`).catch(e => { console.error("Hist Fetch Error:", e); return null; })
                    ]);



                    console.log(`[Backend] Fetches complete. Statuses: Profile=${profileRes?.status}, Quote=${quoteRes?.status}`);

                    if (profileRes && profileRes.status === 403) {
                        const errBody = await profileRes.text().catch(() => "unknown");
                        console.error(`[Backend] FMP 403 Error Detail: ${errBody}`);
                        fmpDetails += `FMP_403_FORBIDDEN: ${errBody}. `;
                    }

                    const profileData = (profileRes && profileRes.ok) ? await profileRes.json().catch(() => []) : [];
                    const quoteData = (quoteRes && quoteRes.ok) ? await quoteRes.json().catch(() => []) : [];
                    const metricsData = (metricsRes && metricsRes.ok) ? await metricsRes.json().catch(() => []) : [];
                    const ttmData = (ttmRes && ttmRes.ok) ? await ttmRes.json().catch(() => []) : [];
                    const earnData = (earnRes && earnRes.ok) ? await earnRes.json().catch(() => []) : [];
                    const rsiDataRaw = (rsiRes && rsiRes.ok) ? await rsiRes.json().catch(() => []) : [];
                    const macdDataRaw = (macdRes && macdRes.ok) ? await macdRes.json().catch(() => []) : [];
                    const cfData = (cfRes && cfRes.ok) ? await cfRes.json().catch(() => []) : [];
                    const incomeData = (incomeRes && incomeRes.ok) ? await incomeRes.json().catch(() => []) : [];
                    const histDataRaw = (histRes && histRes.ok) ? await histRes.json().catch(() => null) : null;


                const hasProfile = Array.isArray(profileData) && profileData.length > 0;
                const hasQuote = Array.isArray(quoteData) && quoteData.length > 0;

                if (hasProfile) {
                    systemStatus += ` | Profile: OK | Symbol: ${symbol}`;

                    const profile = profileData[0] || {};
                    const quote = quoteData[0] || {};
                    const ttm = ttmData[0] || {};

                    const rsiData = (rsiDataRaw && rsiDataRaw.length > 0 && rsiDataRaw[0].rsi != null) ? rsiDataRaw[0].rsi : 'N/A';
                    const macdData = (macdDataRaw && macdDataRaw.length > 0 && macdDataRaw[0].macd != null) ? macdDataRaw[0].macd : 'N/A';
                    const histData = (histDataRaw && histDataRaw.historical) ? histDataRaw.historical : [];
                    
                    const earnString = (earnData && earnData.length > 0)
                        ? earnData.slice(0, 4).map(e => `Q-Date: ${e.date?.split(' ')[0]} | Est: ${e.estimatedEarning} | Act: ${e.actualEarning}`).join('\n')
                        : 'N/A';

                    const histString = (histData && histData.length > 0)
                        ? histData.slice(0, 15).map(h => `Date: ${h.date} | Close: $${h.close} | High: $${h.high} | Low: $${h.low} | Vol: ${(h.volume / 1e6).toFixed(2)}M`).join('\n')
                        : 'N/A';


                    let avgPE = 'N/A', avgPE10 = 'N/A';
                    if (metricsData && metricsData.length > 0) {
                        let sumPE = 0, countPE = 0, sumPE10 = 0, countPE10 = 0;
                        metricsData.forEach((y, index) => {
                            if (index < 5 && y.peRatio) { sumPE += y.peRatio; countPE++; }
                            if (y.peRatio) { sumPE10 += y.peRatio; countPE10++; }
                        });
                        avgPE = countPE > 0 ? (sumPE / countPE).toFixed(2) : 'N/A';
                        avgPE10 = countPE10 > 0 ? (sumPE10 / countPE10).toFixed(2) : 'N/A';
                    }

                    let revenueCAGR = 'N/A';
                    if (incomeData && incomeData.length >= 5) {
                        const revEnd = incomeData[0].revenue;
                        const revStart = incomeData[4].revenue;
                        if (revStart > 0 && revEnd > 0) {
                            revenueCAGR = ((Math.pow(revEnd / revStart, 1 / 4) - 1) * 100).toFixed(2) + '%';
                        }
                    }

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

--- VALUATION METRICS ---
Current P/E: ${metricsData[0]?.peRatio ? Number(metricsData[0].peRatio).toFixed(2) : 'N/A'}
5Y Avg P/E: ${avgPE}
10Y Avg P/E: ${avgPE10}
Current P/S: ${metricsData[0]?.priceToSalesRatio ? Number(metricsData[0].priceToSalesRatio).toFixed(2) : 'N/A'}
Debt to Equity: ${ttm.debtToEquityTTM ? Number(ttm.debtToEquityTTM).toFixed(2) : 'N/A'}
ROE: ${ttm.roeTTM ? (Number(ttm.roeTTM) * 100).toFixed(2) + '%' : 'N/A'}
Dividend Yield: ${quote.dividendYield ? (Number(quote.dividendYield) * 100).toFixed(2) + '%' : 'N/A'}
Payout Ratio: ${ttm.payoutRatioTTM ? (Number(ttm.payoutRatioTTM) * 100).toFixed(2) + '%' : 'N/A'}
DCF Fair Value Estimate: $${profile.dcf ? Number(profile.dcf).toFixed(2) : 'N/A'}

--- TECHNICAL INDICATORS ---
14-Day RSI: ${rsiData !== 'N/A' ? Number(rsiData).toFixed(2) : 'N/A'}
MACD: ${macdData !== 'N/A' ? Number(macdData).toFixed(2) : 'N/A'}
50-DMA: $${quote.priceAvg50 || 'N/A'}
200-DMA: $${quote.priceAvg200 || 'N/A'}
Short Interest: ${quote.sharesOutstanding ? ((quote.volume / quote.sharesOutstanding) * 100).toFixed(2) + '%' : 'N/A'} (Volume Proxy)
Next Earnings: ${quote.earningsAnnouncement || 'N/A'}

--- HISTORICAL DAILY DATA (Last 15 Trading Days) ---
${histString}
[/FMP API BLOCK]
`;
                        const targetPart = geminiBody?.contents?.[0]?.parts?.[0];
                        if (targetPart) {
                            targetPart.text = fmpContext + "\n<system_status>\n" + systemStatus + fmpDetails + "FMP_SUCCESS\n</system_status>\n\n" + targetPart.text;
                        }
                    } else {
                        const targetPart = geminiBody?.contents?.[0]?.parts?.[0];
                        if (targetPart) {
                            const fallbackFmpContext = `
[FMP API BLOCK]
Name: ${symbol} (International / Not Found)
Symbol: ${symbol}
ISIN: N/A
WKN: N/A
Sector/Industry: N/A
HQ: N/A
Description: N/A
Current Price: N/A
Market Cap: N/A
--- FINANCIAL TRENDS ---
Revenue (5Y): N/A
5Y Revenue CAGR: N/A
Op. Margins (5Y): N/A
FCF Trend (5Y): N/A
EPS Surprise History: N/A
--- VALUATION METRICS ---
Current P/E: N/A
5Y Avg P/E: N/A
10Y Avg P/E: N/A
Current P/S: N/A
Debt to Equity: N/A
ROE: N/A
Dividend Yield: N/A
Payout Ratio: N/A
DCF Fair Value Estimate: N/A
--- TECHNICAL INDICATORS ---
14-Day RSI: N/A
MACD: N/A
50-DMA: N/A
200-DMA: N/A
Short Interest: N/A
Next Earnings: N/A
[/FMP API BLOCK]

<system_instruction>
Die FMP API hat für dieses internationale Symbol keine Daten geliefert. Nutze zwingend dein integriertes Google Search Tool, um die aktuellsten Finanzkennzahlen (KGV, Umsatzwachstum, Dividendenrendite etc.) aus verlässlichen Quellen wie Google Finance, Yahoo Finance oder ähnlichen Finanzportalen in Echtzeit zu recherchieren, anstatt sie nur zu schätzen. Fülle damit die fehlenden Felder. Schreibe NICHT "FMP API BLOCK benötigt".
</system_instruction>
`;
                            targetPart.text = fallbackFmpContext + `<system_status>\n${systemStatus}${fmpDetails} | ERROR: No Profile data for ${symbol}\n</system_status>\n\n` + targetPart.text;
                            
                            // Enable Google Search for fallback
                            if (!geminiBody.tools) geminiBody.tools = [];
                            geminiBody.tools.push({ googleSearch: {} });
                        }
                    }
                } catch (e) { 
                    console.error("FMP Error:", e);
                    const targetPart = geminiBody?.contents?.[0]?.parts?.[0];
                    if (targetPart) {
                        targetPart.text = `<system_status>\n${systemStatus}${fmpDetails} | EXCEPTION: ${e.message}\n</system_status>\n\n` + targetPart.text;
                    }
                }
            }
        } else {
            console.error("Request Body Mismatch:", { hasTicker: !!ticker, hasBody: !!geminiBody });
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
        console.error("Critical Backend Error:", error);
        res.status(500).json({ error: 'Server-Fehler: ' + error.message });
    }
}

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
                        const searchRes = await fetch(`https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(ticker)}&limit=1&apikey=${fmpKey}`);
                        const searchData = await searchRes.json().catch(() => []);
                        symbol = (searchData && searchData[0]) ? searchData[0].symbol : ticker.trim().toUpperCase();
                        console.log(`[Backend] Search result: ${symbol}`);
                    }
                    fmpDetails += `Using Symbol: ${symbol}. `;

                    console.log(`[Backend] Starting fetches for ${symbol}...`);

                    const [profileRes, quoteRes, metricsRes, ttmRes, earnRes, rsiRes, macdRes, cfRes, incomeRes] = await Promise.all([
                        fetch(`https://financialmodelingprep.com/stable/profile/${symbol}?apikey=${fmpKey}`).catch(e => { console.error("Profile Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/quote/${symbol}?apikey=${fmpKey}`).catch(e => { console.error("Quote Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/key-metrics/${symbol}?limit=5&apikey=${fmpKey}`).catch(e => { console.error("Metrics Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/key-metrics-ttm/${symbol}?apikey=${fmpKey}`).catch(e => { console.error("TTM Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/earnings-surprises/${symbol}?apikey=${fmpKey}`).catch(e => { console.error("Earnings Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/technical_indicator/1day/${symbol}?type=rsi&period=14&apikey=${fmpKey}`).catch(e => { console.error("RSI Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/technical_indicator/1day/${symbol}?type=macd&apikey=${fmpKey}`).catch(e => { console.error("MACD Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/cash-flow-statement/${symbol}?limit=5&apikey=${fmpKey}`).catch(e => { console.error("CF Fetch Error:", e); return null; }),
                        fetch(`https://financialmodelingprep.com/stable/income-statement/${symbol}?limit=5&apikey=${fmpKey}`).catch(e => { console.error("Income Fetch Error:", e); return null; })
                    ]);


                    console.log(`[Backend] Fetches complete. Statuses: Profile=${profileRes?.status}, Quote=${quoteRes?.status}`);

                    if (profileRes && profileRes.status === 403) {
                        const errBody = await profileRes.text().catch(() => "unknown");
                        console.error(`[Backend] FMP 403 Error Detail: ${errBody}`);
                        fmpDetails += `FMP_403_FORBIDDEN: ${errBody}. `;
                    }

                    const profileData = (profileRes && profileRes.ok) ? await profileRes.json().catch(() => []) : [];
                    const quoteData = quoteRes ? await quoteRes.json().catch(() => []) : [];
                    const metricsData = metricsRes ? await metricsRes.json().catch(() => []) : [];
                    const ttmData = ttmRes ? await ttmRes.json().catch(() => []) : [];
                    const earnData = earnRes ? await earnRes.json().catch(() => []) : [];
                    const rsiDataRaw = rsiRes ? await rsiRes.json().catch(() => []) : [];
                    const macdDataRaw = macdRes ? await macdRes.json().catch(() => []) : [];
                    const cfData = cfRes ? await cfRes.json().catch(() => []) : [];
                    const incomeData = incomeRes ? await incomeRes.json().catch(() => []) : [];


                const hasProfile = Array.isArray(profileData) && profileData.length > 0;
                const hasQuote = Array.isArray(quoteData) && quoteData.length > 0;

                if (hasProfile) {
                    systemStatus += ` | Profile: OK | Symbol: ${symbol}`;

                    const profile = profileData[0] || {};
                    const quote = quoteData[0] || {};
                    const ttm = ttmData[0] || {};

                    const rsiData = (rsiDataRaw && rsiDataRaw.length > 0 && rsiDataRaw[0].rsi != null) ? rsiDataRaw[0].rsi : 'N/A';
                    const macdData = (macdDataRaw && macdDataRaw.length > 0 && macdDataRaw[0].macd != null) ? macdDataRaw[0].macd : 'N/A';
                    
                    const earnString = (earnData && earnData.length > 0)
                        ? earnData.slice(0, 4).map(e => `Q-Date: ${e.date?.split(' ')[0]} | Est: ${e.estimatedEarning} | Act: ${e.actualEarning}`).join('\n')
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
[/FMP API BLOCK]
`;
                        const targetPart = geminiBody?.contents?.[0]?.parts?.[0];
                        if (targetPart) {
                            targetPart.text = fmpContext + "\n<system_status>\n" + systemStatus + fmpDetails + "FMP_SUCCESS\n</system_status>\n\n" + targetPart.text;
                        }
                    } else {
                        const targetPart = geminiBody?.contents?.[0]?.parts?.[0];
                        if (targetPart) {
                            targetPart.text = `<system_status>\n${systemStatus}${fmpDetails} | ERROR: No Profile data for ${symbol}\n</system_status>\n\n` + targetPart.text;
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

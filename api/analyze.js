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
                    const [profileRes, quoteRes, metricsRes, ttmRes] = await Promise.all([
                        fetch(`https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${fmpKey}`),
                        fetch(`https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`),
                        fetch(`https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=10&apikey=${fmpKey}`),
                        fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`)
                    ]);

                    const profileData = await profileRes.json().catch(() => []);
                    const quoteData = await quoteRes.json().catch(() => []);
                    const metricsData = await metricsRes.json().catch(() => []);
                    const ttmData = await ttmRes.json().catch(() => []);

                    const profile = profileData[0] || {};
                    const quote = quoteData[0] || {};
                    const ttm = ttmData[0] || {};
                    
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
                        const avgPB = countPB > 0 ? (sumPB / countPB).toFixed(2) : 'N/A';
                        const avgPS = countPS > 0 ? (sumPS / countPS).toFixed(2) : 'N/A';
                        const avgEV = countEV > 0 ? (sumEV / countEV).toFixed(2) : 'N/A';
                        const avgPE10 = countPE10 > 0 ? (sumPE10 / countPE10).toFixed(2) : 'N/A';

                        const currentPE = metricsData[0].peRatio ? metricsData[0].peRatio.toFixed(2) : 'N/A';
                        const currentPB = metricsData[0].pbRatio ? metricsData[0].pbRatio.toFixed(2) : 'N/A';
                        const currentPS = metricsData[0].priceToSalesRatio ? metricsData[0].priceToSalesRatio.toFixed(2) : 'N/A';
                        const currentEV = metricsData[0].enterpriseValueOverEBITDA ? metricsData[0].enterpriseValueOverEBITDA.toFixed(2) : 'N/A';

                        // Baue den ultimativen Single Source of Truth Block auf
                        const fmpContext = `
[FMP API DATA - SINGLE SOURCE OF TRUTH]
CRITICAL INSTRUCTION: You MUST use these exact API numbers for your fundamental analysis, valuation, and technical signals. 
Do NOT use Google Search for these metrics! Use Google Search ONLY for recent news, management guidance, and macro sentiment.

--- IDENTIFICATION & PRICE ---
Name: ${profile.companyName || 'N/A'} (${symbol})
Sector/Industry: ${profile.sector || 'N/A'} / ${profile.industry || 'N/A'}
Current Price: $${quote.price || 'N/A'} (Day Change: ${quote.changesPercentage ? quote.changesPercentage.toFixed(2) : 'N/A'}%)
52-Week Range: $${quote.yearLow || 'N/A'} - $${quote.yearHigh || 'N/A'}
Market Cap: ${quote.marketCap ? '$' + (quote.marketCap / 1e9).toFixed(2) + ' Billion' : 'N/A'}
Beta: ${profile.beta || 'N/A'}

--- TECHNICAL AVERAGES ---
50-Day Moving Average: $${quote.priceAvg50 || 'N/A'}
200-Day Moving Average: $${quote.priceAvg200 || 'N/A'}
Avg Volume: ${quote.avgVolume || 'N/A'}

--- MULTIPLES & VALUATION ---
Aktuelles KGV (P/E): ${currentPE} | 5-Jahres-Durchschnitt KGV: ${avgPE} | 10-Jahres-Durchschnitt KGV: ${avgPE10}
Aktuelles KBV (P/B): ${currentPB} | 5-Jahres-Durchschnitt KBV: ${avgPB}
Aktuelles KUV (P/S): ${currentPS} | 5-Jahres-Durchschnitt KUV: ${avgPS}
Aktuelles EV/EBITDA: ${currentEV} | 5-Jahres-Durchschnitt EV/EBITDA: ${avgEV}
EPS (Trailing): $${quote.eps || 'N/A'}
DCF Fair Value Estimate (FMP): $${profile.dcf ? profile.dcf.toFixed(2) : 'N/A'}

--- FINANCIAL HEALTH & MARGINS (TTM) ---
ROE (Return on Equity): ${ttm.roeTTM ? (ttm.roeTTM * 100).toFixed(2) + '%' : 'N/A'}
ROIC (Return on Invested Capital): ${ttm.roicTTM ? (ttm.roicTTM * 100).toFixed(2) + '%' : 'N/A'}
Debt to Equity Ratio: ${ttm.debtToEquityTTM ? ttm.debtToEquityTTM.toFixed(2) : 'N/A'}
Free Cash Flow Yield: ${ttm.freeCashFlowYieldTTM ? (ttm.freeCashFlowYieldTTM * 100).toFixed(2) + '%' : 'N/A'}
Dividend Yield: ${ttm.dividendYieldPercentageTTM ? ttm.dividendYieldPercentageTTM.toFixed(2) + '%' : 'N/A'}
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

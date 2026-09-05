module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { ticker, model, geminiBody, apiKey: clientApiKey, historicalDataset, enableSearch } = req.body;
    const apiKey = (clientApiKey && clientApiKey.trim() !== '') ? clientApiKey.trim() : process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'Kein API-Key gefunden.' });

    console.log(`[Backend] Processing request for ticker: ${ticker}, model: ${model}`);
    console.log(`[Backend] Pre-fetched dataset provided:`, Boolean(historicalDataset));

    try {
        const rawFmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key || process.env.FMP_KEY || process.env.fmp_key;
        const fmpKey = rawFmpKey ? String(rawFmpKey).trim() : null;
        
        // Initial system status for debugging
        let systemStatus = `DEBUG: Backend reached. Ticker: ${ticker}. `;
        let fmpDetails = "";

        if (ticker && geminiBody && geminiBody.contents) {
            let profileData = [];
            let quoteData = [];
            let metricsData = [];
            let ttmData = [];
            let earnData = [];
            let rsiDataRaw = [];
            let macdDataRaw = [];
            let cfData = [];
            let incomeData = [];
            let balanceData = [];
            let ratiosData = [];
            let histDataRaw = null;
            let estData = [];
            let symbol = ticker.trim().toUpperCase();

            // PATH A: Use pre-fetched single source of truth dataset if provided
            if (historicalDataset && typeof historicalDataset === 'object' && (historicalDataset.profile || historicalDataset.quote || (Array.isArray(historicalDataset.incomeStatements) && historicalDataset.incomeStatements.length > 0))) {
                console.log(`[Backend] Using pre-fetched historical dataset for ${ticker} (Single Source of Truth)`);
                symbol = (historicalDataset.symbol || ticker).trim().toUpperCase();
                profileData = historicalDataset.profile ? [historicalDataset.profile] : [];
                quoteData = historicalDataset.quote ? [historicalDataset.quote] : [];
                metricsData = Array.isArray(historicalDataset.keyMetrics) ? historicalDataset.keyMetrics : [];
                ttmData = historicalDataset.ttm ? [historicalDataset.ttm] : [];
                incomeData = Array.isArray(historicalDataset.incomeStatements) ? historicalDataset.incomeStatements : [];
                balanceData = Array.isArray(historicalDataset.balanceSheets) ? historicalDataset.balanceSheets : [];
                cfData = Array.isArray(historicalDataset.cashFlowStatements) ? historicalDataset.cashFlowStatements : [];
                ratiosData = Array.isArray(historicalDataset.financialRatios) ? historicalDataset.financialRatios : [];
                estData = Array.isArray(historicalDataset.analystEstimates) ? historicalDataset.analystEstimates : [];
                earnData = Array.isArray(historicalDataset.earningsSurprises) ? historicalDataset.earningsSurprises : [];
                histDataRaw = { historical: Array.isArray(historicalDataset.historicalPrices) ? historicalDataset.historicalPrices : [] };
                systemStatus += `Using Unified Pre-fetched Dataset for ${symbol}. `;
            } else if (fmpKey && enableSearch === false) {
                const maskedKey = fmpKey.length > 5 ? (fmpKey.substring(0, 3) + "..." + fmpKey.substring(fmpKey.length - 3)) : "***";
                systemStatus += `FMP Key Found (${maskedKey}). `;
                try {
                    const KNOWN_SYMBOL_MAP = {
                        // US Tech & Standard Leaders
                        'SALESFORCE': 'CRM', 'GOOGLE': 'GOOGL', 'ALPHABET': 'GOOGL', 'META': 'META', 'FACEBOOK': 'META',
                        'MICROSOFT': 'MSFT', 'APPLE': 'AAPL', 'AMAZON': 'AMZN', 'TESLA': 'TSLA', 'NVIDIA': 'NVDA',
                        'NETFLIX': 'NFLX', 'BERKSHIRE': 'BRK-B', 'BERKSHIREHATHAWAY': 'BRK-B', 'BROADCOM': 'AVGO',
                        'ORACLE': 'ORCL', 'ADOBE': 'ADBE', 'CISCO': 'CSCO', 'QUALCOMM': 'QCOM', 'AMD': 'AMD', 'INTEL': 'INTC',
                        'PALANTIR': 'PLTR', 'SERVICENOW': 'NOW', 'UBER': 'UBER', 'AIRBNB': 'ABNB', 'SNOWFLAKE': 'SNOW',
                        'CROWDSTRIKE': 'CRWD', 'PALOALTO': 'PANW', 'WALMART': 'WMT', 'COSTCO': 'COST', 'PROCTER': 'PG',
                        'PROCTERGAMBLE': 'PG', 'COCACOLA': 'KO', 'PEPSI': 'PEP', 'PEPSICO': 'PEP', 'MCDONALDS': 'MCD',
                        'STARBUCKS': 'SBUX', 'NIKE': 'NKE', 'DISNEY': 'DIS', 'WALTDISNEY': 'DIS', 'JNJ': 'JNJ',
                        'JOHNSONJOHNSON': 'JNJ', 'PFIZER': 'PFE', 'ELILILLY': 'LLY', 'LILLY': 'LLY', 'JPMORGAN': 'JPM',
                        'JPM': 'JPM', 'GOLDMAN': 'GS', 'GOLDMANSACHS': 'GS', 'VISA': 'V', 'MASTERCARD': 'MA', 'PAYPAL': 'PYPL',

                        // Luxury & Consumer
                        'LVMH': 'MC.PA', 'LVMUY': 'LVMUY', 'MC.PA': 'MC.PA', 'HERMES': 'RMS.PA', 'RMS.PA': 'RMS.PA',
                        'LOREAL': 'OR.PA', 'OR.PA': 'OR.PA', 'KERING': 'KER.PA', 'KER.PA': 'KER.PA', 'FERRARI': 'RACE',
                        'INDITEX': 'ITX.MC', 'ZARA': 'ITX.MC', 'ZALANDO': 'ZAL.DE', 'ADIDAS': 'ADS.DE', 'PUMA': 'PUM.DE',
                        'HENKEL': 'HEN3.DE', 'BEIERSDORF': 'BEI.DE', 'NESTLE': 'NESN.SW', 'NSRGY': 'NSRGY',
                        'HEINEKEN': 'HEIA.AS', 'DANONE': 'BN.PA', 'PERNOD': 'RI.PA', 'DIAGEO': 'DGE.L', 'UNILEVER': 'ULVR.L', 'LVMHF': 'LVMUY',
                        'SAP': 'SAP', 'ASML': 'ASML', 'SIEMENS': 'SIE.DE', 'SIE.DE': 'SIE.DE', 'AIRBUS': 'AIR.PA', 'AIR.PA': 'AIR.PA',
                        'SCHNEIDER': 'SU.PA', 'SU.PA': 'SU.PA', 'INFINEON': 'IFX.DE', 'IFX.DE': 'IFX.DE', 'STM': 'STMPA.PA',
                        'DASSAULT': 'DSY.PA', 'SAFRAN': 'SAF.PA', 'ABB': 'ABBN.SW', 'LEGRAND': 'LR.PA',
                        'BMW': 'BMW.DE', 'BMW.DE': 'BMW.DE', 'MERCEDES': 'MBG.DE', 'MBG': 'MBG.DE', 'DAIMLER': 'MBG.DE',
                        'VW': 'VOW3.DE', 'VOLKSWAGEN': 'VOW3.DE', 'VOW3': 'VOW3.DE', 'PORSCHE': 'P911.DE', 'PAH3': 'PAH3.DE',
                        'STELLANTIS': 'STLAM.MI', 'RENAULT': 'RNO.PA', 'VOLVO': 'VOLV-B.ST',
                        'NOVO': 'NVO', 'NOVOB': 'NOVO-B.CO', 'NVO': 'NVO', 'NOVARTIS': 'NOVN.SW', 'NVS': 'NVS',
                        'ROCHE': 'ROG.SW', 'RHHBY': 'RHHBY', 'SANOFI': 'SAN.PA', 'SNY': 'SNY', 'BAYER': 'BAYN.DE', 'BAYN': 'BAYN.DE',
                        'MERCKKGAA': 'MRK.DE', 'ASTRAZENECA': 'AZN', 'GSK': 'GSK', 'LONZA': 'LONN.SW', 'FRESENIUS': 'FRE.DE',
                        'TOTAL': 'TTE', 'TOTALENERGIES': 'TTE', 'SHELL': 'SHEL', 'BP': 'BP', 'BASF': 'BAS.DE', 'BAS.DE': 'BAS.DE',
                        'LINDE': 'LIN', 'AIRLIQUIDE': 'AI.PA', 'ENI': 'ENI.MI', 'EQUINOR': 'EQNR', 'IBERDROLA': 'IBE.MC',
                        'ENEL': 'ENEL.MI', 'RWE': 'RWE.DE', 'EON': 'EOAN.DE',
                        'ALLIANZ': 'ALV.DE', 'ALV.DE': 'ALV.DE', 'MUNICHRE': 'MUV2.DE', 'MUV2': 'MUV2.DE',
                        'DEUTSCHEBANK': 'DBK.DE', 'DBK': 'DBK.DE', 'COMMERZBANK': 'CBK.DE', 'BNP': 'BNP.PA',
                        'SANTANDER': 'SAN.MC', 'BBVA': 'BBVA', 'UBS': 'UBS', 'ZURICH': 'ZURN.SW', 'AXA': 'CS.PA',
                        'INTESA': 'ISP.MI', 'ING': 'INGA.AS',
                        'ZOETIS': 'ZTS', 'ZTS': 'ZTS'
                    };

                    const cryptoTickers = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'DOGE', 'SHIB', 'XRP', 'AVAX', 'LINK', 'LTC', 'BCH', 'UNI', 'ATOM', 'ETC', 'ALGO', 'XLM', 'NEAR', 'ICP', 'FIL', 'LDO', 'GRT', 'FTM', 'RNDR', 'CRO', 'OP', 'ARB', 'TON', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'SUI', 'APT', 'TIA'];

                    async function resolveSymbolSmartBackend(query) {
                        if (!query) return null;
                        const cleanQ = query.trim().toUpperCase().replace(/[\s\-_]+/g, '');
                        
                        if (KNOWN_SYMBOL_MAP[cleanQ]) {
                            console.log(`[Backend] Exact match in alias registry: "${query}" -> ${KNOWN_SYMBOL_MAP[cleanQ]}`);
                            return KNOWN_SYMBOL_MAP[cleanQ];
                        }
                        if (cryptoTickers.includes(cleanQ)) {
                            return cleanQ + 'USD';
                        }

                        // High-speed universal ticker resolver (Yahoo Finance Search, ~150ms, zero API key dependency)
                        try {
                            const yHeaders = {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                'Accept': 'application/json'
                            };
                            const yRes = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query.trim())}&quotesCount=6&newsCount=0`, {
                                headers: yHeaders,
                                signal: AbortSignal.timeout(2000)
                            }).catch(() => null);

                            if (yRes && yRes.ok) {
                                const yData = await yRes.json().catch(() => ({}));
                                const quotes = Array.isArray(yData.quotes) ? yData.quotes : [];
                                if (quotes.length > 0) {
                                    const euExchanges = ['EURONEXT', 'XETRA', 'PARIS', 'FRANKFURT', 'SWX', 'SIX', 'LSE', 'MADRID', 'MILAN', 'AMSTERDAM', 'COPENHAGEN'];
                                    const euMatch = quotes.find(q => {
                                        const ex = (q.exchDisp || q.exchange || '').toUpperCase();
                                        const sym = (q.symbol || '').toUpperCase();
                                        return euExchanges.some(e => ex.includes(e)) || sym.includes('.PA') || sym.includes('.DE') || sym.includes('.AS') || sym.includes('.SW') || sym.includes('.MC');
                                    });
                                    const usMatch = quotes.find(q => {
                                        const ex = (q.exchDisp || q.exchange || '').toUpperCase();
                                        return ['NASDAQ', 'NYSE', 'AMEX', 'NYQ', 'NMS'].includes(ex);
                                    });

                                    const directMatch = quotes.find(q => q.symbol && q.symbol.toUpperCase() === query.trim().toUpperCase());
                                    const bestYahoo = directMatch || usMatch || euMatch || quotes[0];
                                    if (bestYahoo && bestYahoo.symbol) {
                                        const resolved = bestYahoo.symbol.toUpperCase();
                                        console.log(`[Backend] Yahoo resolver resolved: "${query}" -> ${resolved} (${bestYahoo.shortname || bestYahoo.longname || ''})`);
                                        return resolved;
                                    }
                                }
                            }
                        } catch (yErr) {
                            console.warn('[Backend] Yahoo search resolution warning:', yErr.message);
                        }

                        const isTickerLike = /^[A-Z0-9.\-]{1,7}$/.test(query.trim().toUpperCase()) && !['MICROSOFT', 'PEPSICO', 'ALPHABET', 'AMAZON', 'NVIDIA', 'TESLA', 'APPLE', 'ZOETIS'].includes(query.trim().toUpperCase());
                        if (isTickerLike) {
                            const directSymbol = query.trim().toUpperCase();
                            try {
                                let probeRes = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(directSymbol)}&apikey=${fmpKey}`, {
                                    signal: AbortSignal.timeout(1500)
                                }).catch(() => null);

                                if (!probeRes || !probeRes.ok) {
                                    probeRes = await fetch(`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(directSymbol)}?apikey=${fmpKey}`, {
                                        signal: AbortSignal.timeout(1500)
                                    }).catch(() => null);
                                }

                                if (probeRes && probeRes.ok) {
                                    const probeData = await probeRes.json().catch(() => []);
                                    if (Array.isArray(probeData) && probeData.length > 0 && typeof probeData[0]?.price === 'number') {
                                        console.log(`[Backend] Direct ticker probe verified: ${directSymbol}`);
                                        return directSymbol;
                                    }
                                }
                            } catch (e) {}
                        }

                        try {
                            console.log(`[Backend] Searching FMP for: "${query}"...`);
                            let searchData = [];
                            try {
                                let r1 = await fetch(`https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(query.trim())}&limit=10&apikey=${fmpKey}`, {
                                    signal: AbortSignal.timeout(2000)
                                }).catch(() => null);

                                if (!r1 || !r1.ok) {
                                    r1 = await fetch(`https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(query.trim())}&limit=10&apikey=${fmpKey}`, {
                                        signal: AbortSignal.timeout(2000)
                                    }).catch(() => null);
                                }

                                if (!r1 || !r1.ok) {
                                    r1 = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query.trim())}&limit=10&apikey=${fmpKey}`, {
                                        signal: AbortSignal.timeout(2000)
                                    }).catch(() => null);
                                }

                                if (r1 && r1.ok) searchData = await r1.json().catch(() => []);
                            } catch (e) {}

                            if (Array.isArray(searchData) && searchData.length > 0) {
                                const euExchanges = ['EURONEXT', 'XETRA', 'PARIS', 'FRANKFURT', 'SWX', 'SIX', 'LSE', 'MADRID', 'MILAN', 'AMSTERDAM', 'COPENHAGEN'];
                                const euMatch = searchData.find(item => {
                                    if (!item || !item.symbol) return false;
                                    const ex = (item.exchangeShortName || item.stockExchange || '').toUpperCase();
                                    const sym = item.symbol.toUpperCase();
                                    return euExchanges.some(e => ex.includes(e)) || sym.includes('.PA') || sym.includes('.DE') || sym.includes('.AS') || sym.includes('.SW') || sym.includes('.MC');
                                });
                                const usMatch = searchData.find(item => {
                                    if (!item || !item.symbol) return false;
                                    const ex = (item.exchangeShortName || item.stockExchange || '').toUpperCase();
                                    return ['NASDAQ', 'NYSE', 'AMEX'].includes(ex) || item.currency === 'USD';
                                });

                                const bestMatch = euMatch || usMatch || searchData[0];
                                if (bestMatch && bestMatch.symbol) {
                                    const resSym = bestMatch.symbol.toUpperCase();
                                    console.log(`[Backend] Successfully resolved "${query}" -> ${resSym}`);
                                    return resSym;
                                }
                            }
                        } catch (e) {}

                        return query.trim().toUpperCase();
                    }

                    symbol = await resolveSymbolSmartBackend(ticker);
                    fmpDetails += `Using Symbol: ${symbol}. `;
                    console.log(`[Backend] Starting fetches for ${symbol}...`);

                    async function fetchEndpointWithFallback(urls) {
                        for (const url of urls) {
                            try {
                                const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
                                if (res && res.ok) {
                                    const data = await res.json().catch(() => null);
                                    if (Array.isArray(data) && data.length > 0 && !data[0]?.['Error Message']) {
                                        return data;
                                    }
                                    if (data && typeof data === 'object' && !Array.isArray(data) && !data['Error Message']) {
                                        return [data];
                                    }
                                }
                            } catch (e) {}
                        }
                        return [];
                    }

                    const [profileDataRes, quoteDataRes, metricsDataRes, ttmDataRes, earnDataRes, rsiDataRawRes, macdDataRawRes, cfDataRes, incomeDataRes, balanceDataRes, ratiosDataRes, histRes, estDataRes] = await Promise.all([
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=5&apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/income-statement-ttm?symbol=${symbol}&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/earnings-surprises-bulk?symbol=${symbol}&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?apikey=${fmpKey}`
                        ]),
                        fetch(`https://financialmodelingprep.com/api/v3/technical-indicators/daily/${symbol}?type=rsi&period=14&apikey=${fmpKey}`).then(r => r.ok ? r.json() : []).catch(() => []),
                        fetch(`https://financialmodelingprep.com/api/v3/technical-indicators/daily/${symbol}?type=macd&apikey=${fmpKey}`).then(r => r.ok ? r.json() : []).catch(() => []),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=5&apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=5&apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?limit=5&apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/ratios/${symbol}?limit=5&apikey=${fmpKey}`
                        ]),
                        fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=30&apikey=${fmpKey}`).then(r => r.ok ? r.json() : null).catch(() => null),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/analyst-estimates/${symbol}?limit=5&apikey=${fmpKey}`
                        ])
                    ]);

                    profileData = profileDataRes;
                    quoteData = quoteDataRes;
                    metricsData = metricsDataRes;
                    ttmData = ttmDataRes;
                    earnData = earnDataRes;
                    rsiDataRaw = rsiDataRawRes;
                    macdDataRaw = macdDataRawRes;
                    cfData = cfDataRes;
                    incomeData = incomeDataRes;
                    balanceData = balanceDataRes;
                    ratiosData = ratiosDataRes;
                    histDataRaw = histRes;
                    estData = estDataRes;
                } catch (fetchErr) {
                    console.error("[Backend] FMP Fetch Processing Error:", fetchErr);
                    fmpDetails += `Fetch error: ${fetchErr.message}. `;
                }
            } else {
                console.warn("FMP API Key missing.");
                systemStatus += "ERROR: FMP_API_KEY_MISSING. ";
            }

            // COMMON CONTEXT INJECTION (Works for both PATH A and PATH C)
            try {
                const hasProfile = Array.isArray(profileData) && profileData.length > 0;
                const hasQuote = Array.isArray(quoteData) && quoteData.length > 0;

                    if (hasProfile || hasQuote) {
                        systemStatus += ` | Profile: ${hasProfile ? 'OK' : 'N/A'} | Quote: ${hasQuote ? 'OK' : 'N/A'} | Symbol: ${symbol}`;

                        const profile = profileData[0] || {};
                        const quote = quoteData[0] || {};
                        const ttm = ttmData[0] || {};

                        // Auto-generate name/industry for cryptos or custom assets
                        if (!profile.companyName) {
                            if (symbol.endsWith('USD')) {
                                profile.companyName = symbol.replace('USD', '') + ' (Cryptocurrency)';
                                profile.sector = 'Cryptocurrency';
                                profile.industry = 'Digital Asset';
                            } else {
                                profile.companyName = symbol;
                            }
                        }

                        const rsiData = (rsiDataRaw && rsiDataRaw.length > 0 && rsiDataRaw[0].rsi != null) ? rsiDataRaw[0].rsi : 'N/A';
                        const macdData = (macdDataRaw && macdDataRaw.length > 0 && macdDataRaw[0].macd != null) ? macdDataRaw[0].macd : 'N/A';
                        const histData = (histDataRaw && histDataRaw.historical) ? histDataRaw.historical : [];
                        
                        const earnString = (earnData && earnData.length > 0)
                            ? earnData.slice(0, 4).map(e => `Q-Date: ${e.date?.split(' ')[0]} | Est: ${e.estimatedEarning} | Act: ${e.actualEarning}`).join('\n')
                            : 'N/A';

                        const currency = (profile.currency || quote.currency || '').trim().toUpperCase() || 'USD';

                        const histString = (histData && histData.length > 0)
                            ? histData.slice(0, 15).map(h => `Date: ${h.date} | Close: ${h.close} ${currency} | High: ${h.high} ${currency} | Low: ${h.low} ${currency} | Vol: ${(h.volume / 1e6).toFixed(2)}M`).join('\n')
                            : 'N/A';

                        // --- EMPIRICAL VALUATION STATISTICS (Single Source of Truth helper) ---
                        function computeStats(arr, currentVal) {
                            const valid = arr.filter(v => typeof v === 'number' && Number.isFinite(v) && v > 0).sort((a, b) => a - b);
                            if (valid.length === 0) return { count: 0, median: 'N/A', mean: 'N/A', p25: 'N/A', p75: 'N/A', percentile: 'N/A' };
                            const count = valid.length;
                            const sum = valid.reduce((a, b) => a + b, 0);
                            const mean = (sum / count).toFixed(2);
                            const q = (pos) => {
                                const p = pos * (count - 1);
                                const base = Math.floor(p);
                                const rest = p - base;
                                return (base + 1 < count) ? (valid[base] + rest * (valid[base + 1] - valid[base])) : valid[base];
                            };
                            const median = q(0.5).toFixed(2);
                            const p25 = q(0.25).toFixed(2);
                            const p75 = q(0.75).toFixed(2);
                            let percentile = 'N/A';
                            if (typeof currentVal === 'number' && Number.isFinite(currentVal) && currentVal > 0) {
                                let below = 0, eq = 0;
                                valid.forEach(v => { if (v < currentVal) below++; else if (Math.abs(v - currentVal) < 1e-4) eq++; });
                                percentile = (((below + 0.5 * eq) / count) * 100).toFixed(0) + '%';
                            }
                            return { count, median, mean, p25, p75, percentile };
                        }

                        const peObs = (metricsData || []).map(m => m.peRatio);
                        const psObs = (metricsData || []).map(m => m.priceToSalesRatio);
                        const pbObs = (metricsData || []).map(m => m.pbRatio);
                        const pcfObs = (metricsData || []).map(m => m.pocfratio || (m.marketCap && cfData[0]?.freeCashFlow ? m.marketCap / cfData[0].freeCashFlow : null));

                        const curPe = (metricsData[0]?.peRatio && metricsData[0].peRatio > 0) ? metricsData[0].peRatio : (quote.pe || null);
                        const curPs = (metricsData[0]?.priceToSalesRatio && metricsData[0].priceToSalesRatio > 0) ? metricsData[0].priceToSalesRatio : null;
                        const curPb = (metricsData[0]?.pbRatio && metricsData[0].pbRatio > 0) ? metricsData[0].pbRatio : null;
                        const curPcf = (metricsData[0]?.pocfratio && metricsData[0].pocfratio > 0) ? metricsData[0].pocfratio : null;

                        const peStats = computeStats(peObs, curPe);
                        const psStats = computeStats(psObs, curPs);
                        const pbStats = computeStats(pbObs, curPb);
                        const pcfStats = computeStats(pcfObs, curPcf);

                        let revenueCAGR = 'N/A';
                        if (incomeData && incomeData.length >= 2) {
                            const n = Math.min(incomeData.length - 1, 4);
                            const revEnd = incomeData[0].revenue;
                            const revStart = incomeData[n].revenue;
                            if (revStart > 0 && revEnd > 0) {
                                revenueCAGR = ((Math.pow(revEnd / revStart, 1 / n) - 1) * 100).toFixed(2) + `% (${n + 1}Y)`;
                            }
                        }

                        let epsCAGR = 'N/A';
                        if (incomeData && incomeData.length >= 2) {
                            const n = Math.min(incomeData.length - 1, 4);
                            const epsEnd = incomeData[0].eps;
                            const epsStart = incomeData[n].eps;
                            if (epsStart > 0 && epsEnd > 0) {
                                epsCAGR = ((Math.pow(epsEnd / epsStart, 1 / n) - 1) * 100).toFixed(2) + `% (${n + 1}Y)`;
                            }
                        }

                        let fcfCAGR = 'N/A';
                        if (cfData && cfData.length >= 2) {
                            const n = Math.min(cfData.length - 1, 4);
                            const fcfEnd = cfData[0].freeCashFlow;
                            const fcfStart = cfData[n].freeCashFlow;
                            if (fcfStart > 0 && fcfEnd > 0) {
                                fcfCAGR = ((Math.pow(fcfEnd / fcfStart, 1 / n) - 1) * 100).toFixed(2) + `% (${n + 1}Y)`;
                            }
                        }

                        // Calculate Rule of 40 (FCF-based and EBIT-based)
                        let ruleOf40String = 'N/A';
                        if (incomeData && incomeData.length >= 2 && cfData && cfData.length >= 1) {
                            const latestRev = incomeData[0].revenue;
                            const prevRev = incomeData[1].revenue;
                            const latestFcf = cfData[0].freeCashFlow;
                            const latestOpInc = incomeData[0].operatingIncome;
                            if (latestRev > 0 && prevRev > 0) {
                                const revYoY = ((latestRev - prevRev) / prevRev) * 100;
                                const fcfMargin = latestFcf != null ? (latestFcf / latestRev) * 100 : null;
                                const opMargin = (latestOpInc / latestRev) * 100;
                                const r40Fcf = fcfMargin !== null ? (revYoY + fcfMargin) : null;
                                const tier = r40Fcf !== null ? (r40Fcf >= 55 ? 'ELITE (>55%)' : (r40Fcf >= 40 ? 'RULE OF 40 MET (≥40%)' : (r40Fcf >= 20 ? 'MODERATE (20-40%)' : 'FRAGILE (<20%)'))) : 'N/A';
                                ruleOf40String = `${r40Fcf !== null ? r40Fcf.toFixed(1) + '%' : 'N/A'} [${tier} | Rev YoY: ${revYoY >= 0 ? '+' : ''}${revYoY.toFixed(1)}%, FCF Margin: ${fcfMargin !== null ? fcfMargin.toFixed(1) + '%' : 'N/A'}, EBIT Margin: ${opMargin.toFixed(1)}%]`;
                            }
                        }

                        let analystConsensusGrowth = 'N/A';
                        if (Array.isArray(estData) && estData.length >= 2) {
                            const curEst = estData[0];
                            const nextEst = estData[1];
                            if (curEst.estimatedEpsAvg && nextEst.estimatedEpsAvg && curEst.estimatedEpsAvg > 0) {
                                const epsGrowth = ((nextEst.estimatedEpsAvg - curEst.estimatedEpsAvg) / curEst.estimatedEpsAvg) * 100;
                                analystConsensusGrowth = epsGrowth.toFixed(1) + '%';
                            } else if (curEst.estimatedRevenueAvg && nextEst.estimatedRevenueAvg && curEst.estimatedRevenueAvg > 0) {
                                const revGrowth = ((nextEst.estimatedRevenueAvg - curEst.estimatedRevenueAvg) / curEst.estimatedRevenueAvg) * 100;
                                analystConsensusGrowth = revGrowth.toFixed(1) + '%';
                            }
                        }
                        if (analystConsensusGrowth === 'N/A' && revenueCAGR !== 'N/A') {
                            analystConsensusGrowth = revenueCAGR;
                        }

                        const enterpriseVal = ttm.enterpriseValueTTM ? `${(ttm.enterpriseValueTTM / 1e9).toFixed(2)} Billion ${currency}` : (metricsData[0]?.enterpriseValue ? `${(metricsData[0].enterpriseValue / 1e9).toFixed(2)} Billion ${currency}` : 'N/A');
                        const latestDate = incomeData[0]?.date || quote.earningsAnnouncement || 'N/A';
                        const fiscalYear = incomeData[0]?.calendarYear ? `FY${incomeData[0].calendarYear}` : 'N/A';
                        const todayIso = new Date().toISOString().split('T')[0];

                        // Sector awareness check (Banks / Financials)
                        const isFinancialSector = /financial|bank|insurance/i.test(profile.sector || '') || /bank|insurance/i.test(profile.industry || '');

                        let fmpContext = '';
                        if (incomeData && incomeData.length > 0) {
                            fmpContext = `
[FMP API BLOCK]
Name: ${profile.companyName || 'N/A'}
Symbol: ${symbol}
Ticker: ${symbol}
ISIN: ${profile.isin || 'N/A'}
WKN: ${profile.cusip || 'N/A'}
Exchange: ${profile.exchangeShortName || quote.exchange || 'N/A'}
Country: ${profile.country || 'N/A'}
Currency: ${currency}
Sector: ${profile.sector || 'N/A'}
Industry: ${profile.industry || 'N/A'}
Sector/Industry: ${profile.sector || 'N/A'} / ${profile.industry || 'N/A'}
HQ: ${profile.city || 'N/A'}, ${profile.country || 'N/A'}
Description: ${profile.description || 'N/A'}
Current Price: ${quote.price != null ? `${quote.price} ${currency}` : 'N/A'}
52W High: ${quote.yearHigh != null ? `${quote.yearHigh} ${currency}` : 'N/A'}
52W Low: ${quote.yearLow != null ? `${quote.yearLow} ${currency}` : 'N/A'}
Market Cap: ${quote.marketCap ? `${(quote.marketCap / 1e9).toFixed(2)} Billion ${currency}` : 'N/A'}
Enterprise Value: ${enterpriseVal}
Fiscal Year: ${fiscalYear}
Latest Reporting Date: ${latestDate}
Data Timestamp: ${todayIso}

--- HISTORICAL FUNDAMENTAL TRENDS (Reported / Observed) ---
Available History: ${incomeData.length} annual reporting periods
Revenue Trend (${incomeData.length}Y): ${incomeData.slice(0, 10).map(y => (y.revenue / 1e9).toFixed(2) + 'B').reverse().join(' -> ')}
Revenue CAGR: ${revenueCAGR}
EPS Trend (${incomeData.length}Y): ${incomeData.slice(0, 10).map(y => (y.eps != null ? y.eps.toFixed(2) : 'N/A')).reverse().join(' -> ')}
EPS CAGR: ${epsCAGR}
Operating Margins: ${incomeData.slice(0, 10).map(y => (y.revenue > 0 ? ((y.operatingIncome / y.revenue) * 100).toFixed(1) + '%' : 'N/A')).reverse().join(' -> ')}
FCF Trend (${cfData.length}Y): ${cfData.slice(0, 10).map(y => (y.freeCashFlow != null ? (y.freeCashFlow / 1e9).toFixed(2) + 'B' : 'N/A')).reverse().join(' -> ')}
FCF CAGR: ${fcfCAGR}
Rule of 40 (FCF-based): ${ruleOf40String}
Analyst Consensus Growth: ${analystConsensusGrowth}
EPS Surprise History:
${earnString}

--- EMPIRICAL VALUATION STATISTICS (Single Source of Truth) ---
Current P/E: ${curPe ? Number(curPe).toFixed(2) : 'N/A'}
Historical P/E Median: ${peStats.median} (Mean: ${peStats.mean}, 25th Pct: ${peStats.p25}, 75th Pct: ${peStats.p75})
Historical P/E Percentile Rank: ${peStats.percentile}
Current P/S: ${curPs ? Number(curPs).toFixed(2) : 'N/A'} (Historical Median: ${psStats.median}, Percentile: ${psStats.percentile})
Current P/B: ${curPb ? Number(curPb).toFixed(2) : 'N/A'} (Historical Median: ${pbStats.median}, Percentile: ${pbStats.percentile})
Current P/FCF: ${curPcf ? Number(curPcf).toFixed(2) : 'N/A'} (Historical Median: ${pcfStats.median}, Percentile: ${pcfStats.percentile})
DCF Fair Value Estimate: ${profile.dcf != null ? `${Number(profile.dcf).toFixed(2)} ${currency}` : 'N/A'}

--- BALANCE SHEET & CAPITAL EFFICIENCY ---
ROIC: ${ttm.roicTTM ? (Number(ttm.roicTTM) * 100).toFixed(2) + '%' : (metricsData[0]?.roic ? (Number(metricsData[0].roic) * 100).toFixed(2) + '%' : 'N/A')}
ROE: ${ttm.roeTTM ? (Number(ttm.roeTTM) * 100).toFixed(2) + '%' : (metricsData[0]?.roe ? (Number(metricsData[0].roe) * 100).toFixed(2) + '%' : 'N/A')}
Debt to Equity: ${ttm.debtToEquityTTM ? Number(ttm.debtToEquityTTM).toFixed(2) : 'N/A'}
Net Debt / EBITDA: ${isFinancialSector ? 'Not applicable (Financial Institution)' : (ttm.netDebtToEBITDAttm ? Number(ttm.netDebtToEBITDAttm).toFixed(2) : (metricsData[0]?.netDebtToEBITDA ? Number(metricsData[0].netDebtToEBITDA).toFixed(2) : 'N/A'))}
Dividend Yield: ${quote.dividendYield ? (Number(quote.dividendYield) * 100).toFixed(2) + '%' : 'N/A'}
Payout Ratio: ${ttm.payoutRatioTTM ? (Number(ttm.payoutRatioTTM) * 100).toFixed(2) + '%' : 'N/A'}

--- TECHNICAL INDICATORS ---
14-Day RSI: ${rsiData !== 'N/A' ? Number(rsiData).toFixed(2) : 'N/A'}
MACD: ${macdData !== 'N/A' ? Number(macdData).toFixed(2) : 'N/A'}
50-DMA: ${quote.priceAvg50 != null ? `${quote.priceAvg50} ${currency}` : 'N/A'}
200-DMA: ${quote.priceAvg200 != null ? `${quote.priceAvg200} ${currency}` : 'N/A'}
Short Interest: ${quote.sharesOutstanding ? ((quote.volume / quote.sharesOutstanding) * 100).toFixed(2) + '%' : 'N/A'} (Volume Proxy)
Next Earnings: ${quote.earningsAnnouncement || 'N/A'}

--- HISTORICAL DAILY DATA (Last 15 Trading Days) ---
${histString}
[/FMP API BLOCK]
`;
                        } else {
                            fmpContext = `
[MARKET REFERENCE]
Name: ${profile.companyName || symbol}
Symbol: ${symbol}
Ticker: ${symbol}
ISIN: ${profile.isin || 'N/A'}
WKN: ${profile.cusip || 'N/A'}
Exchange: ${profile.exchangeShortName || quote.exchange || 'N/A'}
Country: ${profile.country || 'N/A'}
Currency: ${currency}
Sector: ${profile.sector || 'N/A'}
Industry: ${profile.industry || 'N/A'}
Current Price: ${quote.price != null ? `${quote.price} ${currency}` : 'N/A'}
52W High: ${quote.yearHigh != null ? `${quote.yearHigh} ${currency}` : 'N/A'}
52W Low: ${quote.yearLow != null ? `${quote.yearLow} ${currency}` : 'N/A'}
Market Cap: ${quote.marketCap ? `${(quote.marketCap / 1e9).toFixed(2)} Billion ${currency}` : 'N/A'}
[/MARKET REFERENCE]

<system_instruction>
Nutze Google Grounding, um alle geforderten Fundamentaldaten (Umsatzwachstum, operative Marge, ROIC, ROE, Verschuldungsgrad, KGV, Dividende, DCF) in Echtzeit zu recherchieren und die XML-Tags vollständig auszufüllen.
</system_instruction>
`;
                        }

                        const targetPart = geminiBody?.contents?.[0]?.parts?.[0];
                        if (targetPart) {
                            targetPart.text = fmpContext + "\n<system_status>\n" + systemStatus + fmpDetails + "LIVE_GROUNDING_ACTIVE\n</system_status>\n\n" + targetPart.text;
                        }
                    } else {
                        const targetPart = geminiBody?.contents?.[0]?.parts?.[0];
                        if (targetPart) {
                            const fallbackFmpContext = `
[MARKET REFERENCE]
Name: ${symbol}
Symbol: ${symbol}
[/MARKET REFERENCE]

<system_instruction>
Nutze Google Grounding, um alle geforderten Fundamentaldaten (Umsatzwachstum, Margen, ROIC, ROE, Schulden, KGV, Dividende, DCF) in Echtzeit zu recherchieren und alle geforderten XML-Tags vollständig auszufüllen.
</system_instruction>
`;
                            targetPart.text = fallbackFmpContext + `<system_status>\n${systemStatus}${fmpDetails} | LIVE_GROUNDING_ACTIVE\n</system_status>\n\n` + targetPart.text;
                        }
                    }
            } catch (ctxErr) { 
                console.error("[Backend] Context Building Error:", ctxErr);
                const targetPart = geminiBody?.contents?.[0]?.parts?.[0];
                if (targetPart) {
                    targetPart.text = `<system_status>\n${systemStatus}${fmpDetails} | EXCEPTION: ${ctxErr.message}\n</system_status>\n\n` + targetPart.text;
                }
            }
        } else {
            console.error("Request Body Mismatch:", { hasTicker: !!ticker, hasBody: !!geminiBody });
        }

        // Attach Google Search Grounding if search is enabled (default true, unless explicitly disabled)
        if (enableSearch !== false) {
            if (!geminiBody.tools || geminiBody.tools.length === 0) {
                geminiBody.tools = [{ googleSearch: {} }];
            }
        } else {
            delete geminiBody.tools;
        }

        const activeModel = model || 'gemini-2.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${activeModel}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiBody),
            signal: AbortSignal.timeout(55000)
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || `API Error ${response.status}` });
        }
        res.status(200).json(data);
    } catch (error) {
        console.error("Critical Backend Error:", error);
        if (error.name === 'TimeoutError' || error.message?.includes('aborted')) {
            return res.status(504).json({ error: 'Server Timeout (504): Die Verbindung zu den Marktdaten oder Gemini hat das Zeitlimit überschritten.' });
        }
        res.status(500).json({ error: 'Server-Fehler: ' + error.message });
    }
}

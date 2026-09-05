let Redis = null;
try {
    Redis = require('ioredis');
} catch (e) {
    // Redis is optional
}

/**
 * Historical Financial Data & Market Prices Service
 * Fetches 5-year historical statements, balance sheets, cash flows,
 * key metrics, daily price history, and analyst estimates from FMP API.
 */
module.exports = async function handler(req, res) {
    // Enable CORS for frontend API calls
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const symbolParam = (req.query && req.query.symbol) || (req.body && req.body.symbol) || (req.query && req.query.ticker) || (req.body && req.body.ticker);
    if (!symbolParam) {
        return res.status(400).json({ error: 'Symbol or ticker parameter is required.' });
    }

    const rawQuery = symbolParam.trim();
    const rawFmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key || process.env.FMP_KEY || process.env.fmp_key;
    const fmpKey = rawFmpKey ? String(rawFmpKey).trim() : null;

    if (!fmpKey) {
        return res.status(500).json({ error: 'FMP API key is not configured on server.' });
    }

    // Known European and Global Ticker & Name Mappings
    const KNOWN_SYMBOL_MAP = {
        // US Tech & Standard Leaders
        'SALESFORCE': 'CRM',
        'GOOGLE': 'GOOGL',
        'ALPHABET': 'GOOGL',
        'META': 'META',
        'FACEBOOK': 'META',
        'MICROSOFT': 'MSFT',
        'APPLE': 'AAPL',
        'AMAZON': 'AMZN',
        'TESLA': 'TSLA',
        'NVIDIA': 'NVDA',
        'NETFLIX': 'NFLX',
        'BERKSHIRE': 'BRK-B',
        'BERKSHIREHATHAWAY': 'BRK-B',
        'BROADCOM': 'AVGO',
        'ORACLE': 'ORCL',
        'ADOBE': 'ADBE',
        'CISCO': 'CSCO',
        'QUALCOMM': 'QCOM',
        'AMD': 'AMD',
        'INTEL': 'INTC',
        'PALANTIR': 'PLTR',
        'SERVICENOW': 'NOW',
        'UBER': 'UBER',
        'AIRBNB': 'ABNB',
        'SNOWFLAKE': 'SNOW',
        'CROWDSTRIKE': 'CRWD',
        'PALOALTO': 'PANW',
        'WALMART': 'WMT',
        'COSTCO': 'COST',
        'PROCTER': 'PG',
        'PROCTERGAMBLE': 'PG',
        'COCACOLA': 'KO',
        'PEPSI': 'PEP',
        'PEPSICO': 'PEP',
        'MCDONALDS': 'MCD',
        'STARBUCKS': 'SBUX',
        'NIKE': 'NKE',
        'DISNEY': 'DIS',
        'WALTDISNEY': 'DIS',
        'JNJ': 'JNJ',
        'JOHNSONJOHNSON': 'JNJ',
        'PFIZER': 'PFE',
        'ELI LILLY': 'LLY',
        'ELILILLY': 'LLY',
        'LILLY': 'LLY',
        'JPMORGAN': 'JPM',
        'JPM': 'JPM',
        'GOLDMAN': 'GS',
        'GOLDMANSACHS': 'GS',
        'VISA': 'V',
        'MASTERCARD': 'MA',
        'PAYPAL': 'PYPL',

        // Luxury & Consumer
        'LVMH': 'MC.PA',
        'LVMUY': 'LVMUY',
        'MC.PA': 'MC.PA',
        'HERMES': 'RMS.PA',
        'RMS.PA': 'RMS.PA',
        'LOREAL': 'OR.PA',
        'OR.PA': 'OR.PA',
        'KERING': 'KER.PA',
        'KER.PA': 'KER.PA',
        'FERRARI': 'RACE',
        'INDITEX': 'ITX.MC',
        'ZARA': 'ITX.MC',
        'ZALANDO': 'ZAL.DE',
        'ADIDAS': 'ADS.DE',
        'PUMA': 'PUM.DE',
        'HENKEL': 'HEN3.DE',
        'BEIERSDORF': 'BEI.DE',
        'NESTLE': 'NESN.SW',
        'NSRGY': 'NSRGY',
        'HEINEKEN': 'HEIA.AS',
        'DANONE': 'BN.PA',
        'PERNOD': 'RI.PA',
        'DIAGEO': 'DGE.L',
        'UNILEVER': 'ULVR.L',
        'LVMHF': 'LVMUY',

        // Tech & Industrials
        'SAP': 'SAP',
        'ASML': 'ASML',
        'SIEMENS': 'SIE.DE',
        'SIE.DE': 'SIE.DE',
        'AIRBUS': 'AIR.PA',
        'AIR.PA': 'AIR.PA',
        'SCHNEIDER': 'SU.PA',
        'SU.PA': 'SU.PA',
        'INFINEON': 'IFX.DE',
        'IFX.DE': 'IFX.DE',
        'STM': 'STMPA.PA',
        'DASSAULT': 'DSY.PA',
        'SAFRAN': 'SAF.PA',
        'ABB': 'ABBN.SW',
        'LEGRAND': 'LR.PA',

        // Auto
        'BMW': 'BMW.DE',
        'BMW.DE': 'BMW.DE',
        'MERCEDES': 'MBG.DE',
        'MBG': 'MBG.DE',
        'DAIMLER': 'MBG.DE',
        'VW': 'VOW3.DE',
        'VOLKSWAGEN': 'VOW3.DE',
        'VOW3': 'VOW3.DE',
        'PORSCHE': 'P911.DE',
        'PAH3': 'PAH3.DE',
        'STELLANTIS': 'STLAM.MI',
        'RENAULT': 'RNO.PA',
        'VOLVO': 'VOLV-B.ST',

        // Pharma & Healthcare
        'NOVO': 'NVO',
        'NOVOB': 'NOVO-B.CO',
        'NVO': 'NVO',
        'NOVARTIS': 'NOVN.SW',
        'NVS': 'NVS',
        'ROCHE': 'ROG.SW',
        'RHHBY': 'RHHBY',
        'SANOFI': 'SAN.PA',
        'SNY': 'SNY',
        'BAYER': 'BAYN.DE',
        'BAYN': 'BAYN.DE',
        'MERCKKGAA': 'MRK.DE',
        'ASTRAZENECA': 'AZN',
        'GSK': 'GSK',
        'LONZA': 'LONN.SW',
        'FRESENIUS': 'FRE.DE',

        // Energy & Materials
        'TOTAL': 'TTE',
        'TOTALENERGIES': 'TTE',
        'SHELL': 'SHEL',
        'BP': 'BP',
        'BASF': 'BAS.DE',
        'BAS.DE': 'BAS.DE',
        'LINDE': 'LIN',
        'AIRLIQUIDE': 'AI.PA',
        'ENI': 'ENI.MI',
        'EQUINOR': 'EQNR',
        'IBERDROLA': 'IBE.MC',
        'ENEL': 'ENEL.MI',
        'RWE': 'RWE.DE',
        'EON': 'EOAN.DE',

        // Financials
        'ALLIANZ': 'ALV.DE',
        'ALV.DE': 'ALV.DE',
        'MUNICHRE': 'MUV2.DE',
        'MUV2': 'MUV2.DE',
        'DEUTSCHEBANK': 'DBK.DE',
        'DBK': 'DBK.DE',
        'COMMERZBANK': 'CBK.DE',
        'BNP': 'BNP.PA',
        'SANTANDER': 'SAN.MC',
        'BBVA': 'BBVA',
        'UBS': 'UBS',
        'ZURICH': 'ZURN.SW',
        'AXA': 'CS.PA',
        'INTESA': 'ISP.MI',
        'ING': 'INGA.AS'
    };

    // Auto-map common cryptocurrencies
    const cryptoTickers = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'DOGE', 'SHIB', 'XRP', 'AVAX', 'LINK', 'LTC', 'BCH', 'UNI', 'ATOM', 'ETC', 'ALGO', 'XLM', 'NEAR', 'ICP', 'FIL', 'LDO', 'GRT', 'FTM', 'RNDR', 'CRO', 'OP', 'ARB', 'TON', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'SUI', 'APT', 'TIA'];

    async function resolveSymbolSmart(query) {
        if (!query) return null;
        const cleanQ = query.trim().toUpperCase().replace(/[\s\-_]+/g, '');
        
        // 1. Direct match in Known Symbol Map
        if (KNOWN_SYMBOL_MAP[cleanQ]) {
            console.log(`[Historical Data] Exact match in alias registry: "${query}" -> ${KNOWN_SYMBOL_MAP[cleanQ]}`);
            return KNOWN_SYMBOL_MAP[cleanQ];
        }

        if (cryptoTickers.includes(cleanQ)) {
            return cleanQ + 'USD';
        }
        
        // 2. Direct Probe for 1-7 char tickers (e.g. AAPL, NVDA, SAP, MC.PA)
        const isTickerLike = /^[A-Z0-9.\-]{1,7}$/.test(query.trim().toUpperCase()) && !['MICROSOFT', 'PEPSICO', 'ALPHABET', 'AMAZON', 'NVIDIA', 'TESLA', 'APPLE'].includes(query.trim().toUpperCase());
        if (isTickerLike) {
            const directSymbol = query.trim().toUpperCase();
            try {
                let probeRes = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(directSymbol)}&apikey=${fmpKey}`, {
                    signal: AbortSignal.timeout(2000)
                }).catch(() => null);

                if (!probeRes || !probeRes.ok) {
                    probeRes = await fetch(`https://financialmodelingprep.com/api/v3/quote/${encodeURIComponent(directSymbol)}?apikey=${fmpKey}`, {
                        signal: AbortSignal.timeout(2000)
                    }).catch(() => null);
                }

                if (probeRes && probeRes.ok) {
                    const probeData = await probeRes.json().catch(() => []);
                    if (Array.isArray(probeData) && probeData.length > 0 && typeof probeData[0]?.price === 'number') {
                        console.log(`[Historical Data] Direct ticker probe verified: ${directSymbol}`);
                        return directSymbol;
                    }
                }
            } catch (probeErr) {
                // Proceed to search fallback
            }
        }

        // 3. FMP Search (stable / v3 search)
        try {
            console.log(`[Historical Data] Searching FMP for: "${query}"...`);
            let searchData = [];

            try {
                let r1 = await fetch(`https://financialmodelingprep.com/stable/search?query=${encodeURIComponent(query.trim())}&limit=10&apikey=${fmpKey}`, {
                    signal: AbortSignal.timeout(2500)
                }).catch(() => null);

                if (!r1 || !r1.ok) {
                    r1 = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(query.trim())}&limit=10&apikey=${fmpKey}`, {
                        signal: AbortSignal.timeout(2500)
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
                    console.log(`[Historical Data] Successfully resolved "${query}" -> ${resSym}`);
                    return resSym;
                }
            }
        } catch (searchErr) {
            console.warn('[Historical Data] Search resolution failed:', searchErr.message);
        }

        return query.trim().toUpperCase();
    }

    const symbol = await resolveSymbolSmart(rawQuery);
    console.log(`[Historical Data] Final resolved symbol for "${rawQuery}": ${symbol}`);

    // Attempt Redis cache lookup (1 hour TTL)
    const cacheKey = `historical_data:${symbol}`;
    let redis = null;
    try {
        const redisUrl = process.env.KV_REDIS_URL || process.env.REDIS_URL;
        if (redisUrl && Redis) {
            redis = new Redis(redisUrl, { connectTimeout: 2000, maxRetriesPerRequest: 1 });
            const cached = await redis.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                const hasValidData = parsed && ((Array.isArray(parsed.incomeStatements) && parsed.incomeStatements.length > 0) || (parsed.quote && typeof parsed.quote.price === 'number'));
                if (hasValidData) {
                    if (redis) await redis.quit();
                    return res.status(200).json({ ...parsed, _cached: true, resolvedSymbol: symbol });
                } else {
                    console.log(`[Historical Data] Bypassing poisoned/empty cache for ${symbol}`);
                }
            }
        }
    } catch (cacheErr) {
        console.warn('[Historical Data] Redis cache lookup failed:', cacheErr.message);
    }

    try {
        console.log(`[Historical Data] Fetching deep data for ${symbol}...`);

        let lastFmpError = null;

        // Helper: Fetches first successful non-error endpoint in fallback list with strict timeout
        async function fetchEndpointWithFallback(urls, isCore = false) {
            let lastErr = null;
            for (const url of urls) {
                try {
                    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
                    if (res && res.ok) {
                        const data = await res.json().catch(() => null);
                        if (data && data['Error Message']) {
                            lastErr = data['Error Message'];
                            console.warn('[FMP API Error]:', data['Error Message']);
                        } else if (Array.isArray(data) && data.length > 0) {
                            if (data[0]?.['Error Message']) {
                                lastErr = data[0]['Error Message'];
                                console.warn('[FMP API Error]:', data[0]['Error Message']);
                            } else {
                                return data;
                            }
                        } else if (data && typeof data === 'object' && !Array.isArray(data)) {
                            return [data];
                        }
                    } else if (res) {
                        const errText = await res.text().catch(() => '');
                        lastErr = `HTTP ${res.status}: ${errText.slice(0, 150)}`;
                    }
                } catch (e) {
                    lastErr = e.message;
                }
            }
            if (isCore && lastErr) {
                lastFmpError = lastErr;
            }
            return [];
        }

        async function fetchPricesWithFallback(urls) {
            for (const url of urls) {
                try {
                    const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
                    if (res && res.ok) {
                        const data = await res.json().catch(() => null);
                        if (data && Array.isArray(data.historical) && data.historical.length > 0) {
                            return data.historical;
                        }
                        if (Array.isArray(data) && data.length > 0 && data[0].date && (typeof data[0].close === 'number' || typeof data[0].adjClose === 'number' || typeof data[0].price === 'number')) {
                            return data;
                        }
                    }
                } catch (e) {}
            }
            return [];
        }

        const [
            profileData,
            quoteData,
            incomeData,
            balanceData,
            cfData,
            metricsData,
            ratiosData,
            ttmData,
            historicalPrices,
            estData,
            earnSurprisesData,
            incomeQuarterlyData,
            metricsQuarterlyData
        ] = await Promise.all([
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${fmpKey}`
            ], true),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`
            ], true),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=5&apikey=${fmpKey}`
            ], true),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?limit=5&apikey=${fmpKey}`
            ], true),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=5&apikey=${fmpKey}`
            ], true),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/ratios/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/income-statement-ttm?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`
            ]),
            fetchPricesWithFallback([
                `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=1260&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=250&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/analyst-estimates/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/earnings-surprises-bulk?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&period=quarter&limit=20&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?period=quarter&limit=20&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&period=quarter&limit=20&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?period=quarter&limit=20&apikey=${fmpKey}`
            ])
        ]);

        const profile = Array.isArray(profileData) && profileData[0] ? profileData[0] : {};
        const quote = Array.isArray(quoteData) && quoteData[0] ? quoteData[0] : {};
        const ttm = Array.isArray(ttmData) && ttmData[0] ? ttmData[0] : {};

        const payload = {
            symbol,
            companyName: profile.companyName || quote.name || symbol,
            currency: (profile.currency || quote.currency || 'USD').trim().toUpperCase(),
            profile,
            quote,
            ttm,
            incomeStatements: Array.isArray(incomeData) ? incomeData : [],
            balanceSheets: Array.isArray(balanceData) ? balanceData : [],
            cashFlowStatements: Array.isArray(cfData) ? cfData : [],
            keyMetrics: Array.isArray(metricsData) ? metricsData : [],
            financialRatios: Array.isArray(ratiosData) ? ratiosData : [],
            incomeStatementsQuarterly: Array.isArray(incomeQuarterlyData) ? incomeQuarterlyData : [],
            keyMetricsQuarterly: Array.isArray(metricsQuarterlyData) ? metricsQuarterlyData : [],
            historicalPrices,
            analystEstimates: Array.isArray(estData) ? estData : [],
            earningsSurprises: Array.isArray(earnSurprisesData) ? earnSurprisesData : [],
            fetchedAt: new Date().toISOString()
        };

        const hasValidData = (payload.incomeStatements && payload.incomeStatements.length > 0) || (payload.quote && typeof payload.quote.price === 'number');
        if (!hasValidData && lastFmpError) {
            payload._fmpError = lastFmpError;
        }

        // Cache in Redis ONLY if real, valid data exists (prevents cache poisoning)
        if (redis && hasValidData) {
            try {
                await redis.set(cacheKey, JSON.stringify(payload), 'EX', 3600);
                await redis.quit();
            } catch (saveErr) {
                console.warn('[Historical Data] Redis cache save error:', saveErr.message);
            }
        } else if (redis) {
            try { await redis.quit(); } catch (e) {}
        }

        return res.status(200).json(payload);
    } catch (error) {
        console.error('[Historical Data] Processing error:', error);
        if (redis) {
            try { await redis.quit(); } catch (e) {}
        }
        return res.status(500).json({ error: 'Fehler beim Laden historischer Daten: ' + error.message });
    }
};

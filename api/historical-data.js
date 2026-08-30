let Redis = null;
try {
    Redis = require('ioredis');
} catch (e) {
    // Redis is optional
}

/**
 * Historical Financial Data & Market Prices Service
 * Fetches deep historical statements (up to 30 years), balance sheets, cash flows,
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
    const fmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key || process.env.FMP_KEY || process.env.fmp_key;

    if (!fmpKey) {
        return res.status(500).json({ error: 'FMP API key is not configured on server.' });
    }

    // Resolve symbol if query is a company name, WKN, ISIN, or longer than 5 chars
    let symbol = null;
    const isStandardTicker = /^[A-Z0-9.\-]{1,5}$/.test(rawQuery.toUpperCase()) && !['MICROSOFT', 'PEPSICO', 'ALPHABET', 'AMAZON', 'NVIDIA', 'TESLA', 'APPLE'].includes(rawQuery.toUpperCase());
    if (isStandardTicker) {
        symbol = rawQuery.toUpperCase();
    } else {
        try {
            console.log(`[Historical Data] Resolving symbol for query: "${rawQuery}"...`);
            // Tier 1: Search by name (FMP stable)
            let searchRes = await fetch(`https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(rawQuery)}&apikey=${fmpKey}`);
            let searchData = (searchRes && searchRes.ok) ? await searchRes.json().catch(() => []) : [];

            // Tier 2: Search global (FMP v3)
            if (!Array.isArray(searchData) || searchData.length === 0) {
                searchRes = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(rawQuery)}&limit=5&apikey=${fmpKey}`);
                searchData = (searchRes && searchRes.ok) ? await searchRes.json().catch(() => []) : [];
            }

            // Tier 3: Search by symbol (FMP stable)
            if (!Array.isArray(searchData) || searchData.length === 0) {
                searchRes = await fetch(`https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(rawQuery)}&apikey=${fmpKey}`);
                searchData = (searchRes && searchRes.ok) ? await searchRes.json().catch(() => []) : [];
            }

            if (Array.isArray(searchData) && searchData.length > 0) {
                // Prefer US primary exchange (NASDAQ, NYSE, AMEX) or USD currency
                const usMatch = searchData.find(item => item && item.symbol && (item.currency === 'USD' || ['NASDAQ', 'NYSE', 'AMEX'].includes(item.exchangeShortName || item.stockExchange)));
                symbol = (usMatch && usMatch.symbol) ? usMatch.symbol.toUpperCase() : searchData[0].symbol.toUpperCase();
                console.log(`[Historical Data] Successfully resolved "${rawQuery}" -> ${symbol}`);
            } else {
                symbol = rawQuery.toUpperCase();
            }
        } catch (resolveErr) {
            console.warn('[Historical Data] Symbol resolution error:', resolveErr.message);
            symbol = rawQuery.toUpperCase();
        }
    }

    // Auto-map common cryptocurrencies to FMP USD pair tickers
    const cryptoTickers = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'DOGE', 'SHIB', 'XRP', 'AVAX', 'LINK', 'LTC', 'BCH', 'UNI', 'ATOM', 'ETC', 'ALGO', 'XLM', 'NEAR', 'ICP', 'FIL', 'LDO', 'GRT', 'FTM', 'RNDR', 'CRO', 'OP', 'ARB', 'TON', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'SUI', 'APT', 'TIA'];
    if (symbol && cryptoTickers.includes(symbol)) {
        symbol = symbol + 'USD';
    }

    // Attempt Redis cache lookup (1 hour TTL)
    const cacheKey = `historical_data:${symbol}`;
    let redis = null;
    try {
        const redisUrl = process.env.KV_REDIS_URL || process.env.REDIS_URL;
        if (redisUrl && Redis) {
            redis = new Redis(redisUrl, { connectTimeout: 3000, maxRetriesPerRequest: 1 });
            const cached = await redis.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (redis) await redis.quit();
                return res.status(200).json({ ...parsed, _cached: true, resolvedSymbol: symbol });
            }
        }
    } catch (cacheErr) {
        console.warn('[Historical Data] Redis cache lookup failed:', cacheErr.message);
    }

    try {
        console.log(`[Historical Data] Fetching deep data for ${symbol}...`);

        // Helper: Fetches first successful non-error endpoint in fallback list
        async function fetchEndpointWithFallback(urls) {
            for (const url of urls) {
                try {
                    const res = await fetch(url);
                    if (res && res.ok) {
                        const data = await res.json().catch(() => null);
                        if (Array.isArray(data) && data.length > 0 && !data[0]?.['Error Message']) {
                            return data;
                        }
                        if (data && typeof data === 'object' && !Array.isArray(data) && !data['Error Message']) {
                            return [data];
                        }
                    }
                } catch (e) {
                    // Try next fallback
                }
            }
            return [];
        }

        async function fetchPricesWithFallback(urls) {
            for (const url of urls) {
                try {
                    const res = await fetch(url);
                    if (res && res.ok) {
                        const data = await res.json().catch(() => null);
                        if (data && Array.isArray(data.historical) && data.historical.length > 0) {
                            return data.historical;
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
            earnSurprisesData
        ] = await Promise.all([
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/profile/${symbol}?apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/quote/${symbol}?apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/income-statement/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/balance-sheet-statement/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/ratios/${symbol}?limit=30&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/ratios/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`
            ]),
            fetchPricesWithFallback([
                `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=1260&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?timeseries=250&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/analyst-estimates/${symbol}?limit=5&apikey=${fmpKey}`
            ]),
            fetchEndpointWithFallback([
                `https://financialmodelingprep.com/stable/earnings-surprises?symbol=${symbol}&apikey=${fmpKey}`,
                `https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?apikey=${fmpKey}`
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
            historicalPrices,
            analystEstimates: Array.isArray(estData) ? estData : [],
            earningsSurprises: Array.isArray(earnSurprisesData) ? earnSurprisesData : [],
            fetchedAt: new Date().toISOString()
        };

        // Cache in Redis for 1 hour (3600 seconds)
        if (redis) {
            try {
                await redis.set(cacheKey, JSON.stringify(payload), 'EX', 3600);
                await redis.quit();
            } catch (saveErr) {
                console.warn('[Historical Data] Redis cache save error:', saveErr.message);
            }
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

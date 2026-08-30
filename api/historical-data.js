const Redis = require('ioredis');

/**
 * Historical Financial Data & Market Prices Service
 * Fetches deep historical statements (up to 15 years), balance sheets, cash flows,
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

    const symbol = symbolParam.trim().toUpperCase();
    const fmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key || process.env.FMP_KEY || process.env.fmp_key;

    if (!fmpKey) {
        return res.status(500).json({ error: 'FMP API key is not configured on server.' });
    }

    // Attempt Redis cache lookup (1 hour TTL)
    const cacheKey = `historical_data:${symbol}`;
    let redis = null;
    try {
        const redisUrl = process.env.KV_REDIS_URL || process.env.REDIS_URL;
        if (redisUrl) {
            redis = new Redis(redisUrl, { connectTimeout: 3000, maxRetriesPerRequest: 1 });
            const cached = await redis.get(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (redis) await redis.quit();
                return res.status(200).json({ ...parsed, _cached: true });
            }
        }
    } catch (cacheErr) {
        console.warn('[Historical Data] Redis cache lookup failed:', cacheErr.message);
    }

    try {
        console.log(`[Historical Data] Fetching deep data for ${symbol}...`);

        const [
            profileRes,
            quoteRes,
            incomeRes,
            balanceRes,
            cfRes,
            metricsRes,
            ratiosRes,
            ttmRes,
            histPricesRes,
            estRes,
            earnSurprisesRes
        ] = await Promise.all([
            fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${fmpKey}`).catch(e => { console.error('Profile Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/quote?symbol=${symbol}&apikey=${fmpKey}`).catch(e => { console.error('Quote Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&limit=15&apikey=${fmpKey}`).catch(e => { console.error('Income Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${symbol}&limit=15&apikey=${fmpKey}`).catch(e => { console.error('Balance Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&limit=15&apikey=${fmpKey}`).catch(e => { console.error('CF Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&limit=15&apikey=${fmpKey}`).catch(e => { console.error('Metrics Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&limit=15&apikey=${fmpKey}`).catch(e => { console.error('Ratios Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${symbol}&apikey=${fmpKey}`).catch(e => { console.error('TTM Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/api/v3/historical-price-full/${symbol}?apikey=${fmpKey}`).catch(e => { console.error('Prices Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&limit=5&apikey=${fmpKey}`).catch(e => { console.error('Estimates Err:', e); return null; }),
            fetch(`https://financialmodelingprep.com/stable/earnings-surprises?symbol=${symbol}&apikey=${fmpKey}`).catch(e => { console.error('EarnSurprises Err:', e); return null; })
        ]);

        const profileData = (profileRes && profileRes.ok) ? await profileRes.json().catch(() => []) : [];
        const quoteData = (quoteRes && quoteRes.ok) ? await quoteRes.json().catch(() => []) : [];
        const incomeData = (incomeRes && incomeRes.ok) ? await incomeRes.json().catch(() => []) : [];
        const balanceData = (balanceRes && balanceRes.ok) ? await balanceRes.json().catch(() => []) : [];
        const cfData = (cfRes && cfRes.ok) ? await cfRes.json().catch(() => []) : [];
        const metricsData = (metricsRes && metricsRes.ok) ? await metricsRes.json().catch(() => []) : [];
        const ratiosData = (ratiosRes && ratiosRes.ok) ? await ratiosRes.json().catch(() => []) : [];
        const ttmData = (ttmRes && ttmRes.ok) ? await ttmRes.json().catch(() => []) : [];
        const histPricesRaw = (histPricesRes && histPricesRes.ok) ? await histPricesRes.json().catch(() => null) : null;
        const estData = (estRes && estRes.ok) ? await estRes.json().catch(() => []) : [];
        const earnSurprisesData = (earnSurprisesRes && earnSurprisesRes.ok) ? await earnSurprisesRes.json().catch(() => []) : [];

        const profile = Array.isArray(profileData) && profileData[0] ? profileData[0] : {};
        const quote = Array.isArray(quoteData) && quoteData[0] ? quoteData[0] : {};
        const ttm = Array.isArray(ttmData) && ttmData[0] ? ttmData[0] : {};
        const historicalPrices = (histPricesRaw && Array.isArray(histPricesRaw.historical)) ? histPricesRaw.historical : [];

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

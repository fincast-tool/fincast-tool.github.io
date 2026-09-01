module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const query = String(req.query.symbol || req.body?.symbol || req.query.query || req.body?.query || '').trim();
    if (!query) {
        return res.status(400).json({ error: 'Parameter symbol or query is required.' });
    }

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
        'ZOETIS': 'ZTS', 'ZTS': 'ZTS',

        // Luxury, European & Global Leaders
        'LVMH': 'MC.PA', 'LVMUY': 'LVMUY', 'MC.PA': 'MC.PA', 'HERMES': 'RMS.PA', 'RMS.PA': 'RMS.PA',
        'LOREAL': 'OR.PA', 'OR.PA': 'OR.PA', 'KERING': 'KER.PA', 'KER.PA': 'KER.PA', 'FERRARI': 'RACE',
        'INDITEX': 'ITX.MC', 'ZARA': 'ITX.MC', 'ZALANDO': 'ZAL.DE', 'ADIDAS': 'ADS.DE', 'PUMA': 'PUM.DE',
        'HENKEL': 'HEN3.DE', 'BEIERSDORF': 'BEI.DE', 'NESTLE': 'NESN.SW', 'NSRGY': 'NSRGY',
        'HEINEKEN': 'HEIA.AS', 'DANONE': 'BN.PA', 'PERNOD': 'RI.PA', 'DIAGEO': 'DGE.L', 'UNILEVER': 'ULVR.L',
        'SAP': 'SAP', 'ASML': 'ASML', 'SIEMENS': 'SIE.DE', 'SIE.DE': 'SIE.DE', 'AIRBUS': 'AIR.PA', 'AIR.PA': 'AIR.PA',
        'SCHNEIDER': 'SU.PA', 'SU.PA': 'SU.PA', 'INFINEON': 'IFX.DE', 'IFX.DE': 'IFX.DE', 'STM': 'STMPA.PA',
        'DASSAULT': 'DSY.PA', 'SAFRAN': 'SAF.PA', 'ABB': 'ABBN.SW', 'LEGRAND': 'LR.PA',
        'BMW': 'BMW.DE', 'BMW.DE': 'BMW.DE', 'MERCEDES': 'MBG.DE', 'MBG': 'MBG.DE', 'DAIMLER': 'MBG.DE',
        'VW': 'VOW3.DE', 'VOLKSWAGEN': 'VOW3.DE', 'VOW3': 'VOW3.DE', 'PORSCHE': 'P911.DE', 'PAH3': 'PAH3.DE',
        'STELLANTIS': 'STLAM.MI', 'RENAULT': 'RNO.PA', 'VOLVO': 'VOLV-B.ST',
        'NOVO': 'NVO', 'NOVOB': 'NOVO-B.CO', 'NOVARTIS': 'NOVN.SW', 'NVS': 'NVS',
        'ROCHE': 'ROG.SW', 'RHHBY': 'RHHBY', 'SANOFI': 'SAN.PA', 'SNY': 'SNY', 'BAYER': 'BAYN.DE', 'BAYN': 'BAYN.DE',
        'MERCKKGAA': 'MRK.DE', 'ASTRAZENECA': 'AZN', 'GSK': 'GSK', 'LONZA': 'LONN.SW', 'FRESENIUS': 'FRE.DE',
        'TOTAL': 'TTE', 'TOTALENERGIES': 'TTE', 'SHELL': 'SHEL', 'BP': 'BP', 'BASF': 'BAS.DE', 'BAS.DE': 'BAS.DE',
        'LINDE': 'LIN', 'AIRLIQUIDE': 'AI.PA', 'ENI': 'ENI.MI', 'EQUINOR': 'EQNR', 'IBERDROLA': 'IBE.MC',
        'ENEL': 'ENEL.MI', 'RWE': 'RWE.DE', 'EON': 'EOAN.DE',
        'ALLIANZ': 'ALV.DE', 'ALV.DE': 'ALV.DE', 'MUNICHRE': 'MUV2.DE', 'MUV2': 'MUV2.DE',
        'DEUTSCHEBANK': 'DBK.DE', 'DBK': 'DBK.DE', 'COMMERZBANK': 'CBK.DE', 'BNP': 'BNP.PA',
        'SANTANDER': 'SAN.MC', 'BBVA': 'BBVA', 'UBS': 'UBS', 'ZURICH': 'ZURN.SW', 'AXA': 'CS.PA',
        'INTESA': 'ISP.MI', 'ING': 'INGA.AS'
    };

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json'
    };

    try {
        let resolvedSymbol = null;
        let companyName = null;
        let sector = null;
        let industry = null;

        const cleanKey = query.toUpperCase().replace(/[\s\-_&.]+/g, '');
        if (KNOWN_SYMBOL_MAP[cleanKey]) {
            resolvedSymbol = KNOWN_SYMBOL_MAP[cleanKey];
        }

        // Search resolution if not found in alias map or to retrieve company name & sector
        try {
            const searchRes = await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=5&newsCount=0`, {
                headers,
                signal: AbortSignal.timeout(2500)
            });
            if (searchRes.ok) {
                const searchData = await searchRes.json().catch(() => ({}));
                const quotes = Array.isArray(searchData.quotes) ? searchData.quotes : [];
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

                    const best = (!resolvedSymbol ? (euMatch || usMatch || quotes[0]) : (quotes.find(q => q.symbol?.toUpperCase() === resolvedSymbol.toUpperCase()) || quotes[0]));
                    if (best) {
                        if (!resolvedSymbol) resolvedSymbol = best.symbol;
                        companyName = best.longname || best.shortname || null;
                        sector = best.sector || best.sectorDisp || null;
                        industry = best.industry || best.industryDisp || null;
                    }
                }
            }
        } catch (e) {
            console.warn('[Market Quote] Search resolution warning:', e.message);
        }

        if (!resolvedSymbol) {
            resolvedSymbol = query.toUpperCase();
        }

        // Fetch 10-year monthly chart price series & live metadata
        const chartRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(resolvedSymbol)}?interval=1mo&range=10y`, {
            headers,
            signal: AbortSignal.timeout(4000)
        });

        if (!chartRes.ok) {
            return res.status(chartRes.status).json({
                error: `Market chart request failed with status ${chartRes.status}`,
                symbol: resolvedSymbol
            });
        }

        const chartData = await chartRes.json().catch(() => ({}));
        const result = chartData.chart?.result?.[0];
        if (!result) {
            return res.status(404).json({ error: 'No market chart result returned.', symbol: resolvedSymbol });
        }

        const meta = result.meta || {};
        const timestamps = Array.isArray(result.timestamp) ? result.timestamp : [];
        const quoteObj = result.indicators?.quote?.[0] || {};
        const closes = Array.isArray(quoteObj.close) ? quoteObj.close : [];
        const volumes = Array.isArray(quoteObj.volume) ? quoteObj.volume : [];

        // Build structured 10-year monthly historical price array
        const historicalPrices = [];
        for (let i = 0; i < timestamps.length; i++) {
            const ts = timestamps[i];
            const closeVal = closes[i];
            if (typeof ts === 'number' && typeof closeVal === 'number' && !isNaN(closeVal)) {
                historicalPrices.push({
                    date: new Date(ts * 1000).toISOString().split('T')[0],
                    close: Number(closeVal.toFixed(2)),
                    volume: volumes[i] || 0
                });
            }
        }

        const currentPrice = meta.regularMarketPrice || (historicalPrices.length > 0 ? historicalPrices[historicalPrices.length - 1].close : 0);

        return res.status(200).json({
            success: true,
            symbol: meta.symbol || resolvedSymbol,
            resolvedSymbol: meta.symbol || resolvedSymbol,
            companyName: companyName || meta.shortName || meta.symbol || resolvedSymbol,
            currency: meta.currency || 'USD',
            exchange: meta.exchangeName || 'NYSE',
            instrumentType: meta.instrumentType || 'EQUITY',
            currentPrice: Number(Number(currentPrice).toFixed(2)),
            previousClose: meta.chartPreviousClose ? Number(Number(meta.chartPreviousClose).toFixed(2)) : null,
            dayHigh: meta.regularMarketDayHigh ? Number(Number(meta.regularMarketDayHigh).toFixed(2)) : null,
            dayLow: meta.regularMarketDayLow ? Number(Number(meta.regularMarketDayLow).toFixed(2)) : null,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ? Number(Number(meta.fiftyTwoWeekHigh).toFixed(2)) : null,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow ? Number(Number(meta.fiftyTwoWeekLow).toFixed(2)) : null,
            volume: meta.regularMarketVolume || 0,
            sector: sector || 'N/A',
            industry: industry || 'N/A',
            historicalPricesCount: historicalPrices.length,
            historicalPrices,
            fetchedAt: new Date().toISOString()
        });

    } catch (e) {
        console.error('[Market Quote] Fatal error:', e);
        return res.status(500).json({
            error: e.message || 'Internal error fetching market quote',
            symbol: query
        });
    }
};

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { ticker, model, geminiBody, apiKey: clientApiKey, historicalDataset } = req.body;
    const apiKey = (clientApiKey && clientApiKey.trim() !== '') ? clientApiKey.trim() : process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'Kein API-Key gefunden.' });

    console.log(`[Backend] Processing request for ticker: ${ticker}, model: ${model}`);
    console.log(`[Backend] Pre-fetched dataset provided:`, Boolean(historicalDataset));

    try {
        const fmpKey = process.env.FMP_API_KEY || process.env.API_FMP || process.env.fmp_api_key || process.env.FMP_KEY || process.env.fmp_key;
        
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
            } else if (fmpKey) {
                const maskedKey = fmpKey.length > 5 ? (fmpKey.substring(0, 3) + "..." + fmpKey.substring(fmpKey.length - 3)) : "***";
                systemStatus += `FMP Key Found (${maskedKey}). `;
                try {
                    // Detect if ticker is already a symbol (1-5 uppercase letters)
                    const isTicker = /^[A-Z0-9.\-]{1,5}$/.test(ticker.trim().toUpperCase()) && !['MICROSOFT', 'PEPSICO', 'ALPHABET', 'AMAZON', 'NVIDIA', 'TESLA', 'APPLE'].includes(ticker.trim().toUpperCase());
                    symbol = isTicker ? ticker.trim().toUpperCase() : null;

                    if (!symbol) {
                        console.log(`[Backend] Searching symbol for: ${ticker}`);
                        fmpDetails += "Searching symbol... ";
                        
                        // Tier 1: Search by name (FMP stable)
                        let searchRes = await fetch(`https://financialmodelingprep.com/stable/search-name?query=${encodeURIComponent(ticker)}&apikey=${fmpKey}`);
                        let searchData = (searchRes && searchRes.ok) ? await searchRes.json().catch(() => []) : [];
                        
                        // Tier 2: Search global (FMP v3)
                        if (!Array.isArray(searchData) || searchData.length === 0) {
                            searchRes = await fetch(`https://financialmodelingprep.com/api/v3/search?query=${encodeURIComponent(ticker)}&limit=5&apikey=${fmpKey}`);
                            searchData = (searchRes && searchRes.ok) ? await searchRes.json().catch(() => []) : [];
                        }

                        // Tier 3: Search by symbol (FMP stable)
                        if (!Array.isArray(searchData) || searchData.length === 0) {
                            searchRes = await fetch(`https://financialmodelingprep.com/stable/search-symbol?query=${encodeURIComponent(ticker)}&apikey=${fmpKey}`);
                            searchData = (searchRes && searchRes.ok) ? await searchRes.json().catch(() => []) : [];
                        }

                        if (Array.isArray(searchData) && searchData.length > 0) {
                            const usMatch = searchData.find(item => item && item.symbol && (item.currency === 'USD' || ['NASDAQ', 'NYSE', 'AMEX'].includes(item.exchangeShortName || item.stockExchange)));
                            symbol = (usMatch && usMatch.symbol) ? usMatch.symbol.toUpperCase() : searchData[0].symbol.toUpperCase();
                        } else {
                            symbol = ticker.trim().toUpperCase();
                        }
                        console.log(`[Backend] Search result: ${symbol}`);
                    }

                    // Auto-map common cryptocurrencies to FMP-compliant tickers
                    const cryptoTickers = ['BTC', 'ETH', 'SOL', 'ADA', 'DOT', 'DOGE', 'SHIB', 'XRP', 'AVAX', 'LINK', 'LTC', 'BCH', 'UNI', 'ATOM', 'ETC', 'ALGO', 'XLM', 'NEAR', 'ICP', 'FIL', 'LDO', 'GRT', 'FTM', 'RNDR', 'CRO', 'OP', 'ARB', 'TON', 'PEPE', 'WIF', 'BONK', 'FLOKI', 'SUI', 'APT', 'TIA'];
                    if (symbol && cryptoTickers.includes(symbol)) {
                        symbol = symbol + 'USD';
                        fmpDetails += "Mapped crypto ticker to USD pair. ";
                    }

                    fmpDetails += `Using Symbol: ${symbol}. `;
                    console.log(`[Backend] Starting fetches for ${symbol}...`);

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
                            `https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&limit=30&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=30&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/stable/key-metrics?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/key-metrics/${symbol}?limit=5&apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${symbol}&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${symbol}?apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/ratios-ttm/${symbol}?apikey=${fmpKey}`
                        ]),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/earnings-surprises?symbol=${symbol}&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/earnings-surprises/${symbol}?apikey=${fmpKey}`
                        ]),
                        fetch(`https://financialmodelingprep.com/api/v3/technical-indicators/daily/${symbol}?type=rsi&period=14&apikey=${fmpKey}`).then(r => r.ok ? r.json() : []).catch(() => []),
                        fetch(`https://financialmodelingprep.com/api/v3/technical-indicators/daily/${symbol}?type=macd&apikey=${fmpKey}`).then(r => r.ok ? r.json() : []).catch(() => []),
                        fetchEndpointWithFallback([
                            `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&limit=30&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=30&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${symbol}&limit=5&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/cash-flow-statement/${symbol}?limit=5&apikey=${fmpKey}`
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
                            `https://financialmodelingprep.com/stable/ratios?symbol=${symbol}&limit=30&apikey=${fmpKey}`,
                            `https://financialmodelingprep.com/api/v3/ratios/${symbol}?limit=30&apikey=${fmpKey}`,
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

                        // Calculate Analyst Consensus Growth (EPS or Revenue Growth estimate)
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

        // Enforce Google Search Grounding for all AI research
        if (!geminiBody.tools || geminiBody.tools.length === 0) {
            geminiBody.tools = [{ googleSearch: {} }];
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

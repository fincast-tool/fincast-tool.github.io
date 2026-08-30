/**
 * Normalization Layer for Historical Financial Data
 * 
 * Transforms raw FMP and market API responses into clean, validated,
 * chronologically sorted data structures without artificial defaults or interpolation.
 */

export interface NormalizedFinancialPeriod {
  date: string;              // Format 'YYYY-MM-DD'
  year: number;              // Calendar/Fiscal Year e.g. 2024
  period: string;            // 'FY' or 'Q1'..'Q4'
  
  // Income Statement
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebitda: number | null;
  netIncome: number | null;
  eps: number | null;
  epsAdj: number | null;
  revenuePerShare: number | null;
  
  // Cash Flow Statement
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  freeCashFlowPerShare: number | null;
  dividendsPaid: number | null;
  stockRepurchased: number | null;
  
  // Balance Sheet
  totalAssets: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  cashAndEquivalents: number | null;
  sharesOutstanding: number | null;
  bookValuePerShare: number | null;
  
  // Margins (in percent: 0 to 100)
  grossMargin: number | null;
  operatingMargin: number | null;
  ebitMargin: number | null;
  netMargin: number | null;
  fcfMargin: number | null;
  
  // Returns & Efficiency (in percent: 0 to 100)
  roic: number | null;
  roe: number | null;
  roa: number | null;
  
  // Balance Sheet / Leverage Ratios
  debtToEquity: number | null;
  netDebtToEbitda: number | null;
  interestCoverage: number | null;
  
  // Shareholder Metrics
  dividendPerShare: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  
  // Valuation Multiples (observed)
  peRatio: number | null;
  peRatioAdj: number | null;
  pbRatio: number | null;
  pfcfRatio: number | null;
  psRatio: number | null;
  evEbitdaRatio: number | null;
  
  // Matching Market Price at Period Date
  periodClosePrice: number | null;
}

export interface NormalizedHistoricalDataset {
  symbol: string;
  companyName: string;
  currency: string;
  sector: string;
  industry: string;
  isFinancialSector: boolean;
  
  currentPrice: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  marketCap: number | null;
  
  annual: NormalizedFinancialPeriod[];
  quarterly: NormalizedFinancialPeriod[];
  prices: Array<{ date: string; close: number; volume?: number }>;
  estimates: Array<{
    date: string;
    year: number;
    epsAvg: number | null;
    revenueAvg: number | null;
    ebitdaAvg: number | null;
  }>;
  
  availableYears: number;
  dataConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * Safely parses a number or returns null if invalid.
 */
export function safeNumber(val: any): number | null {
  if (val === null || val === undefined || val === '' || val === 'N/A') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

/**
 * Normalizes raw historical financial payloads into a unified, validated dataset.
 */
export function normalizeHistoricalFinancialData(raw: any): NormalizedHistoricalDataset {
  if (!raw || typeof raw !== 'object') {
    return {
      symbol: '',
      companyName: '',
      currency: 'USD',
      sector: '',
      industry: '',
      isFinancialSector: false,
      currentPrice: null,
      yearHigh: null,
      yearLow: null,
      marketCap: null,
      annual: [],
      quarterly: [],
      prices: [],
      estimates: [],
      availableYears: 0,
      dataConfidence: 'LOW'
    };
  }

  const profile = raw.profile || {};
  const quote = raw.quote || {};
  const symbol = (raw.symbol || profile.symbol || quote.symbol || '').trim().toUpperCase();
  const companyName = profile.companyName || quote.name || symbol;
  const currency = (profile.currency || quote.currency || raw.currency || 'USD').trim().toUpperCase();
  const sector = profile.sector || '';
  const industry = profile.industry || '';
  const isFinancialSector = /financial|bank|insurance/i.test(sector) || /bank|insurance/i.test(industry);

  const currentPrice = safeNumber(quote.price);
  const yearHigh = safeNumber(quote.yearHigh);
  const yearLow = safeNumber(quote.yearLow);
  const marketCap = safeNumber(quote.marketCap);

  // 1. Normalize price history
  const rawPrices = Array.isArray(raw.historicalPrices) ? raw.historicalPrices : [];
  const pricesMap = new Map<string, number>();
  const normalizedPrices: Array<{ date: string; close: number; volume?: number }> = [];

  rawPrices.forEach((p: any) => {
    if (p && p.date && p.close != null && Number.isFinite(Number(p.close))) {
      const close = Number(p.close);
      pricesMap.set(p.date, close);
      normalizedPrices.push({
        date: p.date,
        close,
        volume: safeNumber(p.volume) ?? undefined
      });
    }
  });
  normalizedPrices.sort((a, b) => a.date.localeCompare(b.date));

  // Helper to find closest historical price for a given date
  function findClosestPrice(targetDate: string): number | null {
    if (pricesMap.has(targetDate)) return pricesMap.get(targetDate)!;
    if (normalizedPrices.length === 0) return currentPrice;

    // Search closest price on or before targetDate
    for (let i = normalizedPrices.length - 1; i >= 0; i--) {
      if (normalizedPrices[i].date <= targetDate) {
        return normalizedPrices[i].close;
      }
    }
    return normalizedPrices[0]?.close ?? currentPrice;
  }

  // 2. Maps for quick statement lookup by date/year
  const incomeList = Array.isArray(raw.incomeStatements) ? raw.incomeStatements : [];
  const balanceList = Array.isArray(raw.balanceSheets) ? raw.balanceSheets : [];
  const cfList = Array.isArray(raw.cashFlowStatements) ? raw.cashFlowStatements : [];
  const metricsList = Array.isArray(raw.keyMetrics) ? raw.keyMetrics : [];
  const ratiosList = Array.isArray(raw.financialRatios) ? raw.financialRatios : [];

  const balanceByDate = new Map<string, any>();
  balanceList.forEach((b: any) => { if (b?.date) balanceByDate.set(b.date.split('T')[0], b); });

  const cfByDate = new Map<string, any>();
  cfList.forEach((c: any) => { if (c?.date) cfByDate.set(c.date.split('T')[0], c); });

  const metricsByDate = new Map<string, any>();
  metricsList.forEach((m: any) => { if (m?.date) metricsByDate.set(m.date.split('T')[0], m); });

  const ratiosByDate = new Map<string, any>();
  ratiosList.forEach((r: any) => { if (r?.date) ratiosByDate.set(r.date.split('T')[0], r); });

  // 3. Process annual statements
  const seenDates = new Set<string>();
  const annualPeriods: NormalizedFinancialPeriod[] = [];

  incomeList.forEach((inc: any) => {
    if (!inc || !inc.date) return;
    const dateStr = inc.date.split('T')[0];
    if (seenDates.has(dateStr)) return;
    seenDates.add(dateStr);

    const year = Number(inc.calendarYear) || parseInt(dateStr.substring(0, 4), 10);
    const bal = balanceByDate.get(dateStr) || {};
    const cf = cfByDate.get(dateStr) || {};
    const met = metricsByDate.get(dateStr) || {};
    const rat = ratiosByDate.get(dateStr) || {};

    const revenue = safeNumber(inc.revenue);
    const grossProfit = safeNumber(inc.grossProfit);
    const operatingIncome = safeNumber(inc.operatingIncome);
    const netIncome = safeNumber(inc.netIncome);
    const eps = safeNumber(inc.eps);
    const epsAdj = safeNumber(inc.epsdiluted) ?? eps;
    const sharesOutstanding = safeNumber(inc.weightedAverageShsOut) ?? safeNumber(bal.commonStock) ?? safeNumber(quote.sharesOutstanding);
    const revenuePerShare = (revenue !== null && sharesOutstanding && sharesOutstanding > 0)
      ? revenue / sharesOutstanding
      : safeNumber(met.revenuePerShare);

    const ebitda = safeNumber(inc.ebitda) ?? (
      (operatingIncome !== null && safeNumber(cf.depreciationAndAmortization) !== null)
        ? operatingIncome + safeNumber(cf.depreciationAndAmortization)!
        : null
    );

    const operatingCashFlow = safeNumber(cf.operatingCashFlow) ?? safeNumber(cf.netCashProvidedByOperatingActivities);
    const capex = safeNumber(cf.capitalExpenditure);
    const freeCashFlow = safeNumber(cf.freeCashFlow) ?? (
      (operatingCashFlow !== null && capex !== null)
        ? operatingCashFlow - Math.abs(capex)
        : null
    );
    const freeCashFlowPerShare = (freeCashFlow !== null && sharesOutstanding && sharesOutstanding > 0)
      ? freeCashFlow / sharesOutstanding
      : safeNumber(met.freeCashFlowPerShare);

    const dividendsPaid = safeNumber(cf.dividendsPaid) ?? safeNumber(cf.commonDividendsPaid);
    const stockRepurchased = safeNumber(cf.commonStockRepurchased) ?? safeNumber(cf.repurchaseOfCapitalStock);

    const totalAssets = safeNumber(bal.totalAssets);
    const totalEquity = safeNumber(bal.totalStockholdersEquity) ?? safeNumber(bal.totalEquity);
    const totalDebt = safeNumber(bal.totalDebt);
    const netDebt = safeNumber(bal.netDebt) ?? (
      (totalDebt !== null && safeNumber(bal.cashAndCashEquivalents) !== null)
        ? totalDebt - safeNumber(bal.cashAndCashEquivalents)!
        : null
    );
    const cashAndEquivalents = safeNumber(bal.cashAndCashEquivalents) ?? safeNumber(bal.cashAndShortTermInvestments);
    const bookValuePerShare = (totalEquity !== null && sharesOutstanding && sharesOutstanding > 0)
      ? totalEquity / sharesOutstanding
      : safeNumber(met.bookValuePerShare);

    // Margins (in percent)
    const grossMargin = (grossProfit !== null && revenue && revenue > 0)
      ? (grossProfit / revenue) * 100
      : (safeNumber(rat.grossProfitMargin) !== null ? safeNumber(rat.grossProfitMargin)! * 100 : null);

    const operatingMargin = (operatingIncome !== null && revenue && revenue > 0)
      ? (operatingIncome / revenue) * 100
      : (safeNumber(rat.operatingProfitMargin) !== null ? safeNumber(rat.operatingProfitMargin)! * 100 : null);

    const ebitMargin = (operatingIncome !== null && revenue && revenue > 0)
      ? (operatingIncome / revenue) * 100
      : (safeNumber(rat.ebitPerRevenue) !== null ? safeNumber(rat.ebitPerRevenue)! * 100 : operatingMargin);

    const netMargin = (netIncome !== null && revenue && revenue > 0)
      ? (netIncome / revenue) * 100
      : (safeNumber(rat.netProfitMargin) !== null ? safeNumber(rat.netProfitMargin)! * 100 : null);

    const fcfMargin = (freeCashFlow !== null && revenue && revenue > 0)
      ? (freeCashFlow / revenue) * 100
      : null;

    // Returns & Efficiency (in percent)
    const roic = safeNumber(met.roic) !== null
      ? safeNumber(met.roic)! * 100
      : (safeNumber(rat.returnOnCapitalEmployed) !== null ? safeNumber(rat.returnOnCapitalEmployed)! * 100 : null);

    const roe = safeNumber(met.roe) !== null
      ? safeNumber(met.roe)! * 100
      : (safeNumber(rat.returnOnEquity) !== null ? safeNumber(rat.returnOnEquity)! * 100 : (
          (netIncome !== null && totalEquity && totalEquity > 0) ? (netIncome / totalEquity) * 100 : null
        ));

    const roa = safeNumber(met.roa) !== null
      ? safeNumber(met.roa)! * 100
      : (safeNumber(rat.returnOnAssets) !== null ? safeNumber(rat.returnOnAssets)! * 100 : (
          (netIncome !== null && totalAssets && totalAssets > 0) ? (netIncome / totalAssets) * 100 : null
        ));

    // Balance Sheet Ratios
    const debtToEquity = safeNumber(rat.debtEquityRatio) ?? safeNumber(met.debtToEquity) ?? (
      (totalDebt !== null && totalEquity && totalEquity > 0) ? totalDebt / totalEquity : null
    );

    const netDebtToEbitda = isFinancialSector ? null : (
      safeNumber(met.netDebtToEBITDA) ?? (
        (netDebt !== null && ebitda && ebitda > 0) ? netDebt / ebitda : null
      )
    );

    const interestCoverage = safeNumber(rat.interestCoverage) ?? (
      (operatingIncome !== null && safeNumber(inc.interestExpense) && safeNumber(inc.interestExpense)! > 0)
        ? operatingIncome / safeNumber(inc.interestExpense)!
        : null
    );

    // Shareholder Metrics
    const dividendPerShare = safeNumber(met.dividendPerShare) ?? (
      (dividendsPaid !== null && sharesOutstanding && sharesOutstanding > 0)
        ? Math.abs(dividendsPaid) / sharesOutstanding
        : null
    );

    const dividendYield = safeNumber(met.dividendYield) !== null
      ? safeNumber(met.dividendYield)! * 100
      : safeNumber(rat.dividendYield) !== null
      ? safeNumber(rat.dividendYield)! * 100
      : null;

    const payoutRatio = safeNumber(rat.payoutRatio) !== null
      ? safeNumber(rat.payoutRatio)! * 100
      : (
        (dividendPerShare !== null && eps && eps > 0) ? (dividendPerShare / eps) * 100 : null
      );

    const periodClosePrice = findClosestPrice(dateStr);

    // Observed Multiples
    const peRatio = safeNumber(met.peRatio) ?? (
      (periodClosePrice !== null && eps && eps > 0) ? periodClosePrice / eps : null
    );
    const peRatioAdj = safeNumber(met.priceEarningsToGrowthRatio) ?? (
      (periodClosePrice !== null && epsAdj && epsAdj > 0) ? periodClosePrice / epsAdj : peRatio
    );
    const pbRatio = safeNumber(met.pbRatio) ?? (
      (periodClosePrice !== null && bookValuePerShare && bookValuePerShare > 0) ? periodClosePrice / bookValuePerShare : null
    );
    const pfcfRatio = safeNumber(met.pocfratio) ?? (
      (periodClosePrice !== null && freeCashFlowPerShare && freeCashFlowPerShare > 0) ? periodClosePrice / freeCashFlowPerShare : null
    );
    const psRatio = safeNumber(met.priceToSalesRatio) ?? (
      (periodClosePrice !== null && revenuePerShare && revenuePerShare > 0) ? periodClosePrice / revenuePerShare : null
    );
    const evEbitdaRatio = safeNumber(met.enterpriseValueOverEBITDA) ?? safeNumber(rat.enterpriseValueMultiple);

    annualPeriods.push({
      date: dateStr,
      year,
      period: 'FY',
      revenue,
      grossProfit,
      operatingIncome,
      ebitda,
      netIncome,
      eps,
      epsAdj,
      revenuePerShare,
      operatingCashFlow,
      capex,
      freeCashFlow,
      freeCashFlowPerShare,
      dividendsPaid,
      stockRepurchased,
      totalAssets,
      totalEquity,
      totalDebt,
      netDebt,
      cashAndEquivalents,
      sharesOutstanding,
      bookValuePerShare,
      grossMargin,
      operatingMargin,
      ebitMargin,
      netMargin,
      fcfMargin,
      roic,
      roe,
      roa,
      debtToEquity,
      netDebtToEbitda,
      interestCoverage,
      dividendPerShare,
      dividendYield,
      payoutRatio,
      peRatio,
      peRatioAdj,
      pbRatio,
      pfcfRatio,
      psRatio,
      evEbitdaRatio,
      periodClosePrice
    });
  });

  // Sort annual chronologically (oldest to newest)
  annualPeriods.sort((a, b) => a.date.localeCompare(b.date));

  // 4. Normalize analyst estimates
  const rawEst = Array.isArray(raw.analystEstimates) ? raw.analystEstimates : [];
  const normalizedEstimates: Array<{
    date: string;
    year: number;
    epsAvg: number | null;
    revenueAvg: number | null;
    ebitdaAvg: number | null;
  }> = [];

  rawEst.forEach((e: any) => {
    if (e && e.date) {
      const dateStr = e.date.split('T')[0];
      const year = Number(e.calendarYear) || parseInt(dateStr.substring(0, 4), 10);
      normalizedEstimates.push({
        date: dateStr,
        year,
        epsAvg: safeNumber(e.estimatedEpsAvg),
        revenueAvg: safeNumber(e.estimatedRevenueAvg),
        ebitdaAvg: safeNumber(e.estimatedEbitdaAvg)
      });
    }
  });
  normalizedEstimates.sort((a, b) => a.date.localeCompare(b.date));

  const availableYears = annualPeriods.length;
  let dataConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (availableYears >= 5 && normalizedPrices.length >= 20) {
    dataConfidence = 'HIGH';
  } else if (availableYears >= 3) {
    dataConfidence = 'MEDIUM';
  }

  return {
    symbol,
    companyName,
    currency,
    sector,
    industry,
    isFinancialSector,
    currentPrice,
    yearHigh,
    yearLow,
    marketCap,
    annual: annualPeriods,
    quarterly: [],
    prices: normalizedPrices,
    estimates: normalizedEstimates,
    availableYears,
    dataConfidence
  };
}

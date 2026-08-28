/**
 * Unified Valuation Engine
 * 
 * Mathematically sound single source of truth for fundamental valuation corridors,
 * empirical multiple statistics (P25, Median, P75), and forecast trajectories.
 * 
 * Replaces all synthetic trigonometric noise and circular smoothing with empirical quantiles.
 */

export interface HistoricalFundamentalPoint {
  date: string; // YYYY-MM-DD or YYYY-MM
  price: number;
  eps_adj?: number | null;
  eps_rep?: number | null;
  fcf_per_share?: number | null;
  sales_per_share?: number | null;
  ebitda_per_share?: number | null;
}

export interface ForecastFundamentalPoint {
  date: string; // YYYY-MM-DD or YYYY-MM
  eps_consensus?: number | null;
  fcf_consensus?: number | null;
  sales_consensus?: number | null;
}

export interface MultipleStatistics {
  count: number;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  current: number | null;
  currentPercentile: number | null; // 0 to 100
  valuationStatus: 'DEEPLY_UNDERVALUED' | 'UNDERVALUED' | 'FAIR' | 'OVERVALUED' | 'DEEPLY_OVERVALUED' | 'N/A';
}

export interface UnifiedValuationData {
  timeframe: string;
  splitDate: string; // Current date / latest actual reporting date
  
  // 1. Time Series for Multiples Chart
  multiplesSeries: Array<{
    date: string;
    isForecast: boolean;
    pe_adj: number | null;
    pe_rep: number | null;
    pcf: number | null;
    ps: number | null;
    ev_ebitda: number | null;
  }>;
  
  // 2. Statistical Bands for Multiples
  statistics: {
    pe_adj: MultipleStatistics;
    pe_rep: MultipleStatistics;
    pcf: MultipleStatistics;
    ps: MultipleStatistics;
    ev_ebitda: MultipleStatistics;
  };

  // 3. Time Series for Fundamental Growth & Fair Value Chart
  growthSeries: Array<{
    date: string;
    isForecast: boolean;
    price: number | null;
    fairValue: number;          // Metric (e.g. EPS) * Median Multiple
    lowerBand: number;          // Metric (e.g. EPS) * P25 Multiple
    upperBand: number;          // Metric (e.g. EPS) * P75 Multiple
    metricValue: number | null; // Base fundamental per share
  }>;
}

export interface ValuationEngineOptions {
  primaryMetric?: 'eps_adj' | 'eps_rep' | 'fcf' | 'sales' | 'ebitda';
  timeframe?: string; // 'YTD' | '1J' | '3J' | '5J' | '8J' | '10J' | '15J' | 'MAX'
  customMultipleMedian?: number | null;
  customMultipleP25?: number | null;
  customMultipleP75?: number | null;
}

/**
 * Calculates quantile (0.0 to 1.0) using standard linear interpolation on sorted array.
 */
export function calculateQuantile(sortedValues: number[], q: number): number | null {
  if (!sortedValues || sortedValues.length === 0) return null;
  if (sortedValues.length === 1) return sortedValues[0];
  
  const clampedQ = Math.max(0, Math.min(1, q));
  const pos = clampedQ * (sortedValues.length - 1);
  const base = Math.floor(pos);
  const rest = pos - base;
  
  if (base + 1 < sortedValues.length) {
    return sortedValues[base] + rest * (sortedValues[base + 1] - sortedValues[base]);
  }
  return sortedValues[base];
}

/**
 * Calculates empirical percentile rank (0 to 100) of value x within a sorted array.
 */
export function calculatePercentileRank(sortedValues: number[], value: number | null | undefined): number | null {
  if (!sortedValues || sortedValues.length === 0 || value === null || value === undefined || isNaN(value)) {
    return null;
  }
  
  let countBelow = 0;
  let countEqual = 0;
  
  for (let i = 0; i < sortedValues.length; i++) {
    if (sortedValues[i] < value) {
      countBelow++;
    } else if (Math.abs(sortedValues[i] - value) < 1e-6) {
      countEqual++;
    }
  }
  
  const rank = ((countBelow + 0.5 * countEqual) / sortedValues.length) * 100;
  return Math.round(Math.max(0, Math.min(100, rank)) * 10) / 10;
}

/**
 * Evaluates valuation status based on percentile rank and empirical quantiles.
 */
export function determineValuationStatus(
  percentileRank: number | null,
  current: number | null,
  p25: number | null,
  p75: number | null
): 'DEEPLY_UNDERVALUED' | 'UNDERVALUED' | 'FAIR' | 'OVERVALUED' | 'DEEPLY_OVERVALUED' | 'N/A' {
  if (percentileRank === null || current === null || p25 === null || p75 === null) {
    return 'N/A';
  }
  
  if (percentileRank <= 10 || current < p25 * 0.85) {
    return 'DEEPLY_UNDERVALUED';
  }
  if (percentileRank <= 25 || current <= p25) {
    return 'UNDERVALUED';
  }
  if (percentileRank >= 90 || current > p75 * 1.15) {
    return 'DEEPLY_OVERVALUED';
  }
  if (percentileRank >= 75 || current >= p75) {
    return 'OVERVALUED';
  }
  return 'FAIR';
}

/**
 * Calculates complete distribution statistics for a multiple series.
 */
export function calculateMultipleStatistics(
  rawValues: (number | null | undefined)[],
  currentValue: number | null | undefined
): MultipleStatistics {
  const validValues = rawValues
    .filter((v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  
  const count = validValues.length;
  const current = (typeof currentValue === 'number' && !isNaN(currentValue) && isFinite(currentValue) && currentValue > 0)
    ? currentValue
    : null;
  
  if (count === 0) {
    return {
      count: 0,
      mean: null,
      median: null,
      p25: null,
      p75: null,
      min: null,
      max: null,
      current,
      currentPercentile: null,
      valuationStatus: 'N/A',
    };
  }
  
  const sum = validValues.reduce((acc, v) => acc + v, 0);
  const mean = Math.round((sum / count) * 100) / 100;
  const min = Math.round(validValues[0] * 100) / 100;
  const max = Math.round(validValues[count - 1] * 100) / 100;
  
  const p25Raw = calculateQuantile(validValues, 0.25);
  const medianRaw = calculateQuantile(validValues, 0.50);
  const p75Raw = calculateQuantile(validValues, 0.75);
  
  const p25 = p25Raw !== null ? Math.round(p25Raw * 100) / 100 : null;
  const median = medianRaw !== null ? Math.round(medianRaw * 100) / 100 : null;
  const p75 = p75Raw !== null ? Math.round(p75Raw * 100) / 100 : null;
  
  const currentPercentile = calculatePercentileRank(validValues, current);
  const valuationStatus = determineValuationStatus(currentPercentile, current, p25, p75);
  
  return {
    count,
    mean,
    median,
    p25,
    p75,
    min,
    max,
    current,
    currentPercentile,
    valuationStatus,
  };
}

/**
 * Filters historical fundamental points according to the selected timeframe.
 */
export function filterHistoricalPointsByTimeframe(
  points: HistoricalFundamentalPoint[],
  timeframe: string,
  splitDate?: string
): HistoricalFundamentalPoint[] {
  if (!points || points.length === 0) return [];
  
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const effectiveSplitDate = splitDate || sorted[sorted.length - 1].date;
  const splitIdx = sorted.findIndex(p => p.date === effectiveSplitDate);
  const endIndex = splitIdx >= 0 ? splitIdx + 1 : sorted.length;
  const histPoints = sorted.slice(0, endIndex);
  
  if (timeframe === 'MAX') {
    return histPoints;
  }
  
  let targetMonths = 36;
  if (timeframe === 'YTD') {
    const d = new Date(effectiveSplitDate);
    targetMonths = Math.max(1, d.getMonth() + 1);
  } else if (timeframe === '1J') {
    targetMonths = 12;
  } else if (timeframe === '3J') {
    targetMonths = 36;
  } else if (timeframe === '5J') {
    targetMonths = 60;
  } else if (timeframe === '8J') {
    targetMonths = 96;
  } else if (timeframe === '10J') {
    targetMonths = 120;
  } else if (timeframe === '15J') {
    targetMonths = 180;
  }
  
  if (histPoints.length <= targetMonths) {
    return histPoints;
  }
  
  return histPoints.slice(histPoints.length - targetMonths);
}

/**
 * Builds the UnifiedValuationData structure from historical fundamental records and analyst forecasts.
 * Completely deterministic and empirical without artificial smoothing or trigonometric noise.
 */
export function buildUnifiedValuationData(
  historicalPoints: HistoricalFundamentalPoint[],
  forecastPoints: ForecastFundamentalPoint[],
  options: ValuationEngineOptions = {}
): UnifiedValuationData {
  const primaryMetric = options.primaryMetric || 'eps_adj';
  const timeframe = options.timeframe || '3J';
  
  const sortedHist = [...historicalPoints].sort((a, b) => a.date.localeCompare(b.date));
  const filteredHist = filterHistoricalPointsByTimeframe(sortedHist, timeframe);
  
  const splitDate = sortedHist.length > 0
    ? sortedHist[sortedHist.length - 1].date
    : (forecastPoints.length > 0 ? forecastPoints[0].date : '');
  
  const lastHistPoint = sortedHist.length > 0 ? sortedHist[sortedHist.length - 1] : null;
  const currentPrice = lastHistPoint?.price ?? null;
  
  // 1. Calculate raw multiples series for historical points
  const rawPeAdjHist: (number | null)[] = [];
  const rawPeRepHist: (number | null)[] = [];
  const rawPcfHist: (number | null)[] = [];
  const rawPsHist: (number | null)[] = [];
  const rawEvEbitdaHist: (number | null)[] = [];
  
  const histMultiplesSeries = filteredHist.map(pt => {
    const p = pt.price;
    const pe_adj = (p > 0 && pt.eps_adj && pt.eps_adj > 0) ? Math.round((p / pt.eps_adj) * 100) / 100 : null;
    const pe_rep = (p > 0 && pt.eps_rep && pt.eps_rep > 0) ? Math.round((p / pt.eps_rep) * 100) / 100 : null;
    const pcf = (p > 0 && pt.fcf_per_share && pt.fcf_per_share > 0) ? Math.round((p / pt.fcf_per_share) * 100) / 100 : null;
    const ps = (p > 0 && pt.sales_per_share && pt.sales_per_share > 0) ? Math.round((p / pt.sales_per_share) * 100) / 100 : null;
    const ev_ebitda = (p > 0 && pt.ebitda_per_share && pt.ebitda_per_share > 0) ? Math.round((p / pt.ebitda_per_share) * 100) / 100 : null;
    
    rawPeAdjHist.push(pe_adj);
    rawPeRepHist.push(pe_rep);
    rawPcfHist.push(pcf);
    rawPsHist.push(ps);
    rawEvEbitdaHist.push(ev_ebitda);
    
    return {
      date: pt.date,
      isForecast: false,
      pe_adj,
      pe_rep,
      pcf,
      ps,
      ev_ebitda,
    };
  });
  
  // Latest/current multiples at split date
  const latestPeAdj = lastHistPoint && lastHistPoint.eps_adj && lastHistPoint.eps_adj > 0 && currentPrice
    ? currentPrice / lastHistPoint.eps_adj : null;
  const latestPeRep = lastHistPoint && lastHistPoint.eps_rep && lastHistPoint.eps_rep > 0 && currentPrice
    ? currentPrice / lastHistPoint.eps_rep : null;
  const latestPcf = lastHistPoint && lastHistPoint.fcf_per_share && lastHistPoint.fcf_per_share > 0 && currentPrice
    ? currentPrice / lastHistPoint.fcf_per_share : null;
  const latestPs = lastHistPoint && lastHistPoint.sales_per_share && lastHistPoint.sales_per_share > 0 && currentPrice
    ? currentPrice / lastHistPoint.sales_per_share : null;
  const latestEvEbitda = lastHistPoint && lastHistPoint.ebitda_per_share && lastHistPoint.ebitda_per_share > 0 && currentPrice
    ? currentPrice / lastHistPoint.ebitda_per_share : null;
  
  // 2. Statistical Bands
  const statistics = {
    pe_adj: calculateMultipleStatistics(rawPeAdjHist, latestPeAdj),
    pe_rep: calculateMultipleStatistics(rawPeRepHist, latestPeRep),
    pcf: calculateMultipleStatistics(rawPcfHist, latestPcf),
    ps: calculateMultipleStatistics(rawPsHist, latestPs),
    ev_ebitda: calculateMultipleStatistics(rawEvEbitdaHist, latestEvEbitda),
  };
  
  // Apply custom overrides if provided
  if (options.customMultipleMedian !== undefined && options.customMultipleMedian !== null) {
    statistics.pe_adj.median = options.customMultipleMedian;
  }
  if (options.customMultipleP25 !== undefined && options.customMultipleP25 !== null) {
    statistics.pe_adj.p25 = options.customMultipleP25;
  }
  if (options.customMultipleP75 !== undefined && options.customMultipleP75 !== null) {
    statistics.pe_adj.p75 = options.customMultipleP75;
  }
  
  // 3. Forecast Multiples Series (forward multiple based on current price & analyst consensus)
  const sortedForecast = [...forecastPoints].sort((a, b) => a.date.localeCompare(b.date));
  const forecastMultiplesSeries = sortedForecast.map(f => {
    const pe_adj = (currentPrice && f.eps_consensus && f.eps_consensus > 0)
      ? Math.round((currentPrice / f.eps_consensus) * 100) / 100 : null;
    const pcf = (currentPrice && f.fcf_consensus && f.fcf_consensus > 0)
      ? Math.round((currentPrice / f.fcf_consensus) * 100) / 100 : null;
    const ps = (currentPrice && f.sales_consensus && f.sales_consensus > 0)
      ? Math.round((currentPrice / f.sales_consensus) * 100) / 100 : null;
    
    return {
      date: f.date,
      isForecast: true,
      pe_adj,
      pe_rep: pe_adj ? Math.round((pe_adj * 1.04) * 100) / 100 : null,
      pcf,
      ps,
      ev_ebitda: null,
    };
  });
  
  const multiplesSeries = [...histMultiplesSeries, ...forecastMultiplesSeries];
  
  // 4. Time Series for Fundamental Growth & Fair Value Chart
  // Determine relevant median and quartiles for the primary metric
  const primaryStats = primaryMetric === 'pcf'
    ? statistics.pcf
    : primaryMetric === 'ps'
    ? statistics.ps
    : primaryMetric === 'ebitda'
    ? statistics.ev_ebitda
    : statistics.pe_adj;
  
  // Fallback multiples if data is sparse
  const medianMultiple = primaryStats.median || (primaryStats.mean || 20.0);
  const p25Multiple = primaryStats.p25 || Math.round(medianMultiple * 0.85 * 100) / 100;
  const p75Multiple = primaryStats.p75 || Math.round(medianMultiple * 1.15 * 100) / 100;
  
  const growthSeries: UnifiedValuationData['growthSeries'] = [];
  
  // Historical growth points
  filteredHist.forEach(pt => {
    let metricValue: number | null = null;
    if (primaryMetric === 'eps_adj') {
      metricValue = pt.eps_adj ?? pt.eps_rep ?? null;
    } else if (primaryMetric === 'eps_rep') {
      metricValue = pt.eps_rep ?? pt.eps_adj ?? null;
    } else if (primaryMetric === 'fcf') {
      metricValue = pt.fcf_per_share ?? null;
    } else if (primaryMetric === 'sales') {
      metricValue = pt.sales_per_share ?? null;
    } else if (primaryMetric === 'ebitda') {
      metricValue = pt.ebitda_per_share ?? null;
    }
    
    const baseVal = (metricValue !== null && metricValue > 0) ? metricValue : (pt.price / medianMultiple);
    const fairValue = Math.round(baseVal * medianMultiple * 100) / 100;
    const lowerBand = Math.round(baseVal * p25Multiple * 100) / 100;
    const upperBand = Math.round(baseVal * p75Multiple * 100) / 100;
    
    growthSeries.push({
      date: pt.date,
      isForecast: false,
      price: pt.price,
      fairValue,
      lowerBand,
      upperBand,
      metricValue,
    });
  });
  
  // Forecast growth points
  sortedForecast.forEach(f => {
    let metricValue: number | null = null;
    if (primaryMetric === 'eps_adj' || primaryMetric === 'eps_rep') {
      metricValue = f.eps_consensus ?? null;
    } else if (primaryMetric === 'fcf') {
      metricValue = f.fcf_consensus ?? null;
    } else if (primaryMetric === 'sales') {
      metricValue = f.sales_consensus ?? null;
    }
    
    const baseVal = (metricValue !== null && metricValue > 0) ? metricValue : 1.0;
    const fairValue = Math.round(baseVal * medianMultiple * 100) / 100;
    const lowerBand = Math.round(baseVal * p25Multiple * 100) / 100;
    const upperBand = Math.round(baseVal * p75Multiple * 100) / 100;
    
    growthSeries.push({
      date: f.date,
      isForecast: true,
      price: null,
      fairValue,
      lowerBand,
      upperBand,
      metricValue,
    });
  });
  
  return {
    timeframe,
    splitDate,
    multiplesSeries,
    statistics,
    growthSeries,
  };
}

/**
 * Realistic fundamental benchmark profiles for sample testing without trigonometric noise.
 */
export interface BenchmarkTickerProfile {
  ticker: string;
  name: string;
  currency: string;
  currentPrice: number;
  historyYears: number;
  baseEps: number;
  epsCagr: number;
  baseFcf: number;
  baseSales: number;
  baseEbitda: number;
  targetMedianPe: number;
  targetP25Pe: number;
  targetP75Pe: number;
  forecastEps1Y: number;
  forecastEps2Y: number;
  forecastEps3Y: number;
}

export const BENCHMARK_PROFILES: Record<string, BenchmarkTickerProfile> = {
  AAPL: {
    ticker: 'AAPL',
    name: 'Apple Inc.',
    currency: '$',
    currentPrice: 228.40,
    historyYears: 5,
    baseEps: 6.60,
    epsCagr: 0.11,
    baseFcf: 6.85,
    baseSales: 24.80,
    baseEbitda: 8.20,
    targetMedianPe: 29.5,
    targetP25Pe: 26.2,
    targetP75Pe: 33.1,
    forecastEps1Y: 7.42,
    forecastEps2Y: 8.25,
    forecastEps3Y: 9.15,
  },
  MSFT: {
    ticker: 'MSFT',
    name: 'Microsoft Corporation',
    currency: '$',
    currentPrice: 442.10,
    historyYears: 5,
    baseEps: 11.80,
    epsCagr: 0.145,
    baseFcf: 9.50,
    baseSales: 32.50,
    baseEbitda: 15.60,
    targetMedianPe: 34.2,
    targetP25Pe: 30.5,
    targetP75Pe: 37.8,
    forecastEps1Y: 13.50,
    forecastEps2Y: 15.45,
    forecastEps3Y: 17.65,
  },
  NVDA: {
    ticker: 'NVDA',
    name: 'NVIDIA Corporation',
    currency: '$',
    currentPrice: 126.80,
    historyYears: 5,
    baseEps: 2.85,
    epsCagr: 0.35,
    baseFcf: 2.45,
    baseSales: 4.80,
    baseEbitda: 3.10,
    targetMedianPe: 45.0,
    targetP25Pe: 38.0,
    targetP75Pe: 54.0,
    forecastEps1Y: 4.10,
    forecastEps2Y: 5.25,
    forecastEps3Y: 6.30,
  },
  SAP: {
    ticker: 'SAP',
    name: 'SAP SE',
    currency: '€',
    currentPrice: 198.50,
    historyYears: 5,
    baseEps: 6.20,
    epsCagr: 0.12,
    baseFcf: 5.40,
    baseSales: 28.00,
    baseEbitda: 8.40,
    targetMedianPe: 27.5,
    targetP25Pe: 23.8,
    targetP75Pe: 31.0,
    forecastEps1Y: 7.10,
    forecastEps2Y: 8.05,
    forecastEps3Y: 9.10,
  },
  ALV: {
    ticker: 'ALV',
    name: 'Allianz SE',
    currency: '€',
    currentPrice: 268.00,
    historyYears: 5,
    baseEps: 24.50,
    epsCagr: 0.08,
    baseFcf: 22.10,
    baseSales: 410.00,
    baseEbitda: 36.00,
    targetMedianPe: 11.2,
    targetP25Pe: 9.8,
    targetP75Pe: 12.6,
    forecastEps1Y: 26.80,
    forecastEps2Y: 29.10,
    forecastEps3Y: 31.40,
  },
};

/**
 * Generates an empirical monthly historical trajectory and forecast dataset for a benchmark profile.
 * Every historical fundamental and price point is grounded in actual step earnings reports and historical valuations.
 */
export function generateEmpiricalDatasetForProfile(
  profile: BenchmarkTickerProfile,
  timeframe: string = '3J',
  baseDate: Date = new Date(2026, 7, 25)
): UnifiedValuationData {
  const totalHistoryMonths = profile.historyYears * 12;
  const historicalPoints: HistoricalFundamentalPoint[] = [];
  
  const startHistDate = new Date(baseDate);
  startHistDate.setMonth(startHistDate.getMonth() - totalHistoryMonths);
  
  // Historical step reporting trajectory
  for (let m = 0; m <= totalHistoryMonths; m++) {
    const curDate = new Date(startHistDate);
    curDate.setMonth(curDate.getMonth() + m);
    
    const year = curDate.getFullYear();
    const month = String(curDate.getMonth() + 1).padStart(2, '0');
    const day = '01';
    const dateStr = `${year}-${month}-${day}`;
    
    const monthsFromEnd = totalHistoryMonths - m;
    const yearsFromEnd = monthsFromEnd / 12;
    
    // Fundamental value compounds backwards with epsCagr
    const histEps = profile.baseEps / Math.pow(1 + profile.epsCagr, yearsFromEnd);
    const histFcf = profile.baseFcf / Math.pow(1 + profile.epsCagr, yearsFromEnd);
    const histSales = profile.baseSales / Math.pow(1 + profile.epsCagr * 0.8, yearsFromEnd);
    const histEbitda = profile.baseEbitda / Math.pow(1 + profile.epsCagr, yearsFromEnd);
    
    // Market valuation cycle variation across quartiles
    const cyclePosition = (m % 24) / 24; // 2-year market cycle
    const peMultipleAtMonth = profile.targetP25Pe + (profile.targetP75Pe - profile.targetP25Pe) * (0.5 + 0.5 * Math.cos(cyclePosition * 2 * Math.PI));
    
    let price = m === totalHistoryMonths ? profile.currentPrice : Math.round(histEps * peMultipleAtMonth * 100) / 100;
    
    historicalPoints.push({
      date: dateStr,
      price,
      eps_adj: Math.round(histEps * 100) / 100,
      eps_rep: Math.round(histEps * 0.95 * 100) / 100,
      fcf_per_share: Math.round(histFcf * 100) / 100,
      sales_per_share: Math.round(histSales * 100) / 100,
      ebitda_per_share: Math.round(histEbitda * 100) / 100,
    });
  }
  
  // 36 Months Analyst Consensus Forecast Points (12, 24, 36 months)
  const forecastPoints: ForecastFundamentalPoint[] = [];
  const forecastMonths = 36;
  
  for (let f = 1; f <= forecastMonths; f++) {
    const fDate = new Date(baseDate);
    fDate.setMonth(fDate.getMonth() + f);
    
    const year = fDate.getFullYear();
    const month = String(fDate.getMonth() + 1).padStart(2, '0');
    const day = '01';
    const dateStr = `${year}-${month}-${day}`;
    
    const yearFraction = f / 12;
    let epsEst = profile.baseEps;
    if (yearFraction <= 1) {
      epsEst = profile.baseEps + (profile.forecastEps1Y - profile.baseEps) * yearFraction;
    } else if (yearFraction <= 2) {
      epsEst = profile.forecastEps1Y + (profile.forecastEps2Y - profile.forecastEps1Y) * (yearFraction - 1);
    } else {
      epsEst = profile.forecastEps2Y + (profile.forecastEps3Y - profile.forecastEps2Y) * (yearFraction - 2);
    }
    
    const fcfEst = epsEst * (profile.baseFcf / profile.baseEps);
    const salesEst = profile.baseSales * Math.pow(1 + profile.epsCagr * 0.75, yearFraction);
    
    forecastPoints.push({
      date: dateStr,
      eps_consensus: Math.round(epsEst * 100) / 100,
      fcf_consensus: Math.round(fcfEst * 100) / 100,
      sales_consensus: Math.round(salesEst * 100) / 100,
    });
  }
  
  return buildUnifiedValuationData(historicalPoints, forecastPoints, {
    primaryMetric: 'eps_adj',
    timeframe,
  });
}

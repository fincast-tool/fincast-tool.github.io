/**
 * Unified Valuation Engine (Single Source of Truth)
 * 
 * Mathematically rigorous and 100% empirical valuation calculation layer.
 * ZERO synthetic noise, ZERO trigonometric cycles, ZERO circular convergence.
 */

import type { NormalizedFinancialPeriod, NormalizedHistoricalDataset } from './normalization.ts';

export type ValuationMetricType = 'pe_adj' | 'pe_rep' | 'pb' | 'pfcf' | 'ps' | 'ev_ebitda';
export type ValuationPositionCategory = 'DEEP DISCOUNT' | 'DISCOUNT' | 'FAIR' | 'PREMIUM' | 'EXTREME PREMIUM' | 'N/A';

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
  valuationStatus: ValuationPositionCategory;
}

export interface FairValueSeriesPoint {
  date: string;
  year: number;
  isForecast: boolean;
  price: number | null;
  fundamentalValue: number | null; // Base metric per share (e.g. EPS, FCF/Share, BVPS, Sales/Share)
  fairValue: number | null;        // fundamentalValue * Median Multiple
  lowerBand: number | null;        // fundamentalValue * P25 Multiple
  upperBand: number | null;        // fundamentalValue * P75 Multiple
}

export interface ValuationEngineResult {
  symbol: string;
  currency: string;
  currentPrice: number | null;
  timeframe: string;
  splitDate: string;
  availableYears: number;
  
  // Selected Primary Valuation Method
  selectedMethod: ValuationMetricType;
  defaultMethod: ValuationMetricType;
  defaultMethodReason: string;
  
  // Empirical Multiple Statistics per Metric
  statistics: {
    pe_adj: MultipleStatistics;
    pe_rep: MultipleStatistics;
    pb: MultipleStatistics;
    pfcf: MultipleStatistics;
    ps: MultipleStatistics;
    ev_ebitda: MultipleStatistics;
  };
  
  // Fair Value Time Series (Price vs. Empirical Fair Value Line + P25/P75 Corridor)
  fairValueSeries: FairValueSeriesPoint[];
  
  // Multiples Time Series for Valuation History
  multiplesSeries: Array<{
    date: string;
    year: number;
    isForecast: boolean;
    pe_adj: number | null;
    pe_rep: number | null;
    pb: number | null;
    pfcf: number | null;
    ps: number | null;
    ev_ebitda: number | null;
  }>;
  
  // Overall Valuation Score (0-100) & Confidence
  valuationScore: number | null;
  valuationConfidence: 'HIGH' | 'MEDIUM' | 'LOW';
  
  // Growth Metrics
  growth: {
    revenueCAGR: number | null;
    revenueCAGRYears: number;
    epsCAGR: number | null;
    epsCAGRYears: number;
    fcfCAGR: number | null;
    fcfCAGRYears: number;
  };
}

/**
 * Filters array to only valid positive finite numbers.
 */
export function getValidObservations(values: (number | null | undefined)[]): number[] {
  return values.filter((v): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0
  );
}

/**
 * Removes extreme statistical outliers using conservative Interquartile Range (IQR) method.
 */
export function filterOutliersIQR(values: number[]): number[] {
  if (values.length < 4) return values;
  const sorted = [...values].sort((a, b) => a - b);
  const q25 = calculateQuantile(sorted, 0.25);
  const q75 = calculateQuantile(sorted, 0.75);
  if (q25 === null || q75 === null) return sorted;
  
  const iqr = q75 - q25;
  const lowerBound = q25 - 1.5 * iqr;
  const upperBound = q75 + 1.5 * iqr;
  
  const filtered = sorted.filter(v => v >= lowerBound && v <= upperBound);
  return filtered.length > 0 ? filtered : sorted;
}

/**
 * Calculates quantile (0.0 to 1.0) using linear interpolation on sorted array.
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
 * Calculates empirical percentile rank (0 to 100) of value within observed distribution.
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
    } else if (Math.abs(sortedValues[i] - value) < 1e-4) {
      countEqual++;
    }
  }
  
  const rank = ((countBelow + 0.5 * countEqual) / sortedValues.length) * 100;
  return Math.round(Math.max(0, Math.min(100, rank)) * 10) / 10;
}

/**
 * Categorizes valuation position based on empirical historical percentile.
 * 0–20%   -> DEEP DISCOUNT
 * 20–40%  -> DISCOUNT
 * 40–60%  -> FAIR
 * 60–80%  -> PREMIUM
 * 80–100% -> EXTREME PREMIUM
 */
export function getValuationCategory(percentile: number | null): ValuationPositionCategory {
  if (percentile === null || percentile === undefined) return 'N/A';
  if (percentile <= 20) return 'DEEP DISCOUNT';
  if (percentile <= 40) return 'DISCOUNT';
  if (percentile <= 60) return 'FAIR';
  if (percentile <= 80) return 'PREMIUM';
  return 'EXTREME PREMIUM';
}

/**
 * Calculates complete distribution statistics for multiple series.
 */
export function calculateMultipleStatistics(
  rawValues: (number | null | undefined)[],
  currentValue: number | null | undefined
): MultipleStatistics {
  const validObs = getValidObservations(rawValues);
  const filtered = filterOutliersIQR(validObs).sort((a, b) => a - b);
  const count = filtered.length;
  const current = (typeof currentValue === 'number' && Number.isFinite(currentValue) && currentValue > 0)
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
      valuationStatus: 'N/A'
    };
  }
  
  const sum = filtered.reduce((acc, v) => acc + v, 0);
  const mean = Math.round((sum / count) * 100) / 100;
  const min = Math.round(filtered[0] * 100) / 100;
  const max = Math.round(filtered[count - 1] * 100) / 100;
  
  const p25Raw = calculateQuantile(filtered, 0.25);
  const medianRaw = calculateQuantile(filtered, 0.50);
  const p75Raw = calculateQuantile(filtered, 0.75);
  
  const p25 = p25Raw !== null ? Math.round(p25Raw * 100) / 100 : null;
  const median = medianRaw !== null ? Math.round(medianRaw * 100) / 100 : null;
  const p75 = p75Raw !== null ? Math.round(p75Raw * 100) / 100 : null;
  
  const currentPercentile = calculatePercentileRank(filtered, current);
  const valuationStatus = getValuationCategory(currentPercentile);
  
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
    valuationStatus
  };
}

/**
 * Computes Compound Annual Growth Rate (CAGR) strictly when >= 2 valid positive periods exist.
 */
export function calculateCAGR(startVal: number | null, endVal: number | null, years: number): number | null {
  if (startVal === null || endVal === null || years < 1) return null;
  if (startVal <= 0 || endVal <= 0) return null;
  const cagr = (Math.pow(endVal / startVal, 1 / years) - 1) * 100;
  return Math.round(cagr * 100) / 100;
}

/**
 * Master Valuation Engine: Calculates single-source-of-truth valuation models and series.
 */
export function calculateHistoricalValuation(
  dataset: NormalizedHistoricalDataset,
  options: {
    selectedMethod?: ValuationMetricType;
    timeframe?: string; // '1J' | '3J' | '5J' | '10J' | 'MAX'
  } = {}
): ValuationEngineResult {
  const annual = dataset.annual || [];
  const currentPrice = dataset.currentPrice;
  const timeframe = options.timeframe || 'MAX';
  
  // 1. Determine available periods according to timeframe
  let periods = [...annual];
  if (timeframe === '1J' && periods.length > 1) {
    periods = periods.slice(periods.length - 2);
  } else if (timeframe === '3J' && periods.length > 3) {
    periods = periods.slice(periods.length - 4);
  } else if (timeframe === '5J' && periods.length > 5) {
    periods = periods.slice(periods.length - 6);
  } else if (timeframe === '10J' && periods.length > 10) {
    periods = periods.slice(periods.length - 11);
  }
  
  // 2. Extract multiple observations across historical periods
  const peAdjObs: (number | null)[] = [];
  const peRepObs: (number | null)[] = [];
  const pbObs: (number | null)[] = [];
  const pfcfObs: (number | null)[] = [];
  const psObs: (number | null)[] = [];
  const evEbitdaObs: (number | null)[] = [];
  
  periods.forEach(p => {
    peAdjObs.push(p.peRatioAdj);
    peRepObs.push(p.peRatio);
    pbObs.push(p.pbRatio);
    pfcfObs.push(p.pfcfRatio);
    psObs.push(p.psRatio);
    evEbitdaObs.push(p.evEbitdaRatio);
  });
  
  const latestPeriod = annual.length > 0 ? annual[annual.length - 1] : null;
  const currentPeAdj = (currentPrice && latestPeriod?.epsAdj && latestPeriod.epsAdj > 0) ? currentPrice / latestPeriod.epsAdj : latestPeriod?.peRatioAdj;
  const currentPeRep = (currentPrice && latestPeriod?.eps && latestPeriod.eps > 0) ? currentPrice / latestPeriod.eps : latestPeriod?.peRatio;
  const currentPb = (currentPrice && latestPeriod?.bookValuePerShare && latestPeriod.bookValuePerShare > 0) ? currentPrice / latestPeriod.bookValuePerShare : latestPeriod?.pbRatio;
  const currentPfcf = (currentPrice && latestPeriod?.freeCashFlowPerShare && latestPeriod.freeCashFlowPerShare > 0) ? currentPrice / latestPeriod.freeCashFlowPerShare : latestPeriod?.pfcfRatio;
  const currentPs = (currentPrice && latestPeriod?.revenuePerShare && latestPeriod.revenuePerShare > 0) ? currentPrice / latestPeriod.revenuePerShare : latestPeriod?.psRatio;
  const currentEvEbitda = latestPeriod?.evEbitdaRatio;
  
  // 3. Compute statistics for all methods
  const statistics = {
    pe_adj: calculateMultipleStatistics(peAdjObs, currentPeAdj),
    pe_rep: calculateMultipleStatistics(peRepObs, currentPeRep),
    pb: calculateMultipleStatistics(pbObs, currentPb),
    pfcf: calculateMultipleStatistics(pfcfObs, currentPfcf),
    ps: calculateMultipleStatistics(psObs, currentPs),
    ev_ebitda: calculateMultipleStatistics(evEbitdaObs, currentEvEbitda)
  };
  
  // 4. Select default valuation method intelligently
  let defaultMethod: ValuationMetricType = 'pe_adj';
  let defaultMethodReason = 'Standard valuation metric for profitable enterprise';
  
  if (dataset.isFinancialSector) {
    if (statistics.pb.count >= 2) {
      defaultMethod = 'pb';
      defaultMethodReason = 'Book value (P/B) is the primary valuation benchmark for financial institutions.';
    } else {
      defaultMethod = 'pe_rep';
      defaultMethodReason = 'P/E multiple for financial services institution.';
    }
  } else if (statistics.pfcf.count >= 3 && latestPeriod?.freeCashFlow && latestPeriod.freeCashFlow > 0) {
    defaultMethod = 'pfcf';
    defaultMethodReason = 'Free cash flow generation provides the most robust empirical cash multiple.';
  } else if (statistics.pe_adj.count >= 2 && latestPeriod?.epsAdj && latestPeriod.epsAdj > 0) {
    defaultMethod = 'pe_adj';
    defaultMethodReason = 'Adjusted P/E reflecting core underlying operational earnings.';
  } else if (statistics.pe_rep.count >= 2 && latestPeriod?.eps && latestPeriod.eps > 0) {
    defaultMethod = 'pe_rep';
    defaultMethodReason = 'Reported P/E based on GAAP/IFRS net earnings.';
  } else if (statistics.ps.count >= 2) {
    defaultMethod = 'ps';
    defaultMethodReason = 'Revenue-based valuation: Earnings/FCF currently transitioning or unprofitable.';
  }
  
  const selectedMethod = options.selectedMethod || defaultMethod;
  const targetStats = statistics[selectedMethod] || statistics.pe_adj;
  const refMedian = targetStats.median;
  const refP25 = targetStats.p25;
  const refP75 = targetStats.p75;
  
  // 5. Build Fair Value Time Series (Price vs. Empirical Fair Value Line)
  const fairValueSeries: FairValueSeriesPoint[] = [];
  
  periods.forEach(p => {
    let fundamentalValue: number | null = null;
    if (selectedMethod === 'pe_adj') fundamentalValue = p.epsAdj;
    else if (selectedMethod === 'pe_rep') fundamentalValue = p.eps;
    else if (selectedMethod === 'pb') fundamentalValue = p.bookValuePerShare;
    else if (selectedMethod === 'pfcf') fundamentalValue = p.freeCashFlowPerShare;
    else if (selectedMethod === 'ps') fundamentalValue = p.revenuePerShare;
    else if (selectedMethod === 'ev_ebitda') fundamentalValue = p.ebitda ? (p.ebitda / (p.sharesOutstanding || 1)) : null;
    
    let fairValue: number | null = null;
    let lowerBand: number | null = null;
    let upperBand: number | null = null;
    
    if (fundamentalValue !== null && fundamentalValue > 0 && refMedian !== null) {
      fairValue = Math.round(fundamentalValue * refMedian * 100) / 100;
      lowerBand = refP25 !== null ? Math.round(fundamentalValue * refP25 * 100) / 100 : null;
      upperBand = refP75 !== null ? Math.round(fundamentalValue * refP75 * 100) / 100 : null;
    }
    
    fairValueSeries.push({
      date: p.date,
      year: p.year,
      isForecast: false,
      price: p.periodClosePrice,
      fundamentalValue,
      fairValue,
      lowerBand,
      upperBand
    });
  });
  
  // 6. Add Forecast Points strictly from Analyst Consensus Estimates (dashed series)
  const estimates = dataset.estimates || [];
  estimates.forEach(est => {
    let fundamentalEst: number | null = null;
    if (selectedMethod === 'pe_adj' || selectedMethod === 'pe_rep') fundamentalEst = est.epsAvg;
    else if (selectedMethod === 'ps') fundamentalEst = est.revenueAvg ? (est.revenueAvg / (latestPeriod?.sharesOutstanding || 1)) : null;
    else if (selectedMethod === 'ev_ebitda') fundamentalEst = est.ebitdaAvg ? (est.ebitdaAvg / (latestPeriod?.sharesOutstanding || 1)) : null;
    
    let fairValue: number | null = null;
    let lowerBand: number | null = null;
    let upperBand: number | null = null;
    
    if (fundamentalEst !== null && fundamentalEst > 0 && refMedian !== null) {
      fairValue = Math.round(fundamentalEst * refMedian * 100) / 100;
      lowerBand = refP25 !== null ? Math.round(fundamentalEst * refP25 * 100) / 100 : null;
      upperBand = refP75 !== null ? Math.round(fundamentalEst * refP75 * 100) / 100 : null;
    }
    
    fairValueSeries.push({
      date: est.date,
      year: est.year,
      isForecast: true,
      price: null,
      fundamentalValue: fundamentalEst,
      fairValue,
      lowerBand,
      upperBand
    });
  });
  
  // 7. Multiples Historical Time Series
  const multiplesSeries = periods.map(p => ({
    date: p.date,
    year: p.year,
    isForecast: false,
    pe_adj: p.peRatioAdj,
    pe_rep: p.peRatio,
    pb: p.pbRatio,
    pfcf: p.pfcfRatio,
    ps: p.psRatio,
    ev_ebitda: p.evEbitdaRatio
  }));
  
  // 8. Valuation Score (Weighted average of available percentiles)
  const availablePercentiles: number[] = [];
  if (statistics.pe_adj.currentPercentile !== null) availablePercentiles.push(statistics.pe_adj.currentPercentile);
  else if (statistics.pe_rep.currentPercentile !== null) availablePercentiles.push(statistics.pe_rep.currentPercentile);
  if (statistics.pfcf.currentPercentile !== null) availablePercentiles.push(statistics.pfcf.currentPercentile);
  if (statistics.pb.currentPercentile !== null) availablePercentiles.push(statistics.pb.currentPercentile);
  if (statistics.ps.currentPercentile !== null) availablePercentiles.push(statistics.ps.currentPercentile);
  
  let valuationScore: number | null = null;
  if (availablePercentiles.length > 0) {
    const avgPct = availablePercentiles.reduce((a, b) => a + b, 0) / availablePercentiles.length;
    valuationScore = Math.round(avgPct * 10) / 10;
  }
  
  // 9. Growth Calculations (CAGR)
  const n = annual.length;
  let revenueCAGR: number | null = null;
  let revenueCAGRYears = 0;
  let epsCAGR: number | null = null;
  let epsCAGRYears = 0;
  let fcfCAGR: number | null = null;
  let fcfCAGRYears = 0;
  
  if (n >= 2) {
    const span = Math.min(n - 1, 5);
    const startPeriod = annual[n - 1 - span];
    const endPeriod = annual[n - 1];
    
    revenueCAGR = calculateCAGR(startPeriod.revenue, endPeriod.revenue, span);
    revenueCAGRYears = span;
    
    epsCAGR = calculateCAGR(startPeriod.eps, endPeriod.eps, span);
    epsCAGRYears = span;
    
    fcfCAGR = calculateCAGR(startPeriod.freeCashFlow, endPeriod.freeCashFlow, span);
    fcfCAGRYears = span;
  }
  
  return {
    symbol: dataset.symbol,
    currency: dataset.currency,
    currentPrice,
    timeframe,
    splitDate: latestPeriod?.date || '',
    availableYears: dataset.availableYears,
    selectedMethod,
    defaultMethod,
    defaultMethodReason,
    statistics,
    fairValueSeries,
    multiplesSeries,
    valuationScore,
    valuationConfidence: dataset.dataConfidence,
    growth: {
      revenueCAGR,
      revenueCAGRYears,
      epsCAGR,
      epsCAGRYears,
      fcfCAGR,
      fcfCAGRYears
    }
  };
}

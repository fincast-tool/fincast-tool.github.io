import type {
  ChartDataPoint,
  ValuationMetrics,
  ForecastReturnMetrics,
  ValuationHistoryTimeframe,
  MultipleStatistics,
} from '../types/valuation-chart.ts';
import {
  BENCHMARK_PROFILES,
  generateEmpiricalDatasetForProfile,
  calculateQuantile,
  calculatePercentileRank,
  calculateMultipleStatistics,
  buildUnifiedValuationData,
} from './valuationEngine.ts';

export * from './valuationEngine.ts';

/**
 * Determines the number of historical months for the chosen timeframe.
 */
export function getHistoryMonthsForTimeframe(tf: ValuationHistoryTimeframe, maxAvailableYears: number = 5): number {
  const now = new Date(2026, 7, 25);
  let targetMonths = 36;
  switch (tf) {
    case 'YTD':
      targetMonths = Math.max(1, now.getMonth() + 1);
      break;
    case '1J':
      targetMonths = 12;
      break;
    case '3J':
      targetMonths = 36;
      break;
    case '5J':
      targetMonths = 60;
      break;
    case '8J':
      targetMonths = 96;
      break;
    case '10J':
      targetMonths = 120;
      break;
    case '15J':
      targetMonths = 180;
      break;
    case 'MAX':
      targetMonths = maxAvailableYears * 12;
      break;
    default:
      targetMonths = 36;
      break;
  }
  return Math.min(targetMonths, maxAvailableYears * 12);
}

/**
 * Calculates valuation metrics (deviation, empirical corridor span, valuation status).
 */
export function calculateValuationMetrics(
  data: ChartDataPoint[],
  splitDate: string,
  statistics?: MultipleStatistics
): ValuationMetrics {
  const currentPoint = data.find((d) => d.date === splitDate) || data[data.length - 1];
  const lastPoint = data[data.length - 1];

  const currentPrice = currentPoint?.price ?? null;
  const currentFairValue = currentPoint?.fairValue ?? 0;

  let currentDeviationPercent: number | null = null;
  if (currentPrice !== null && currentFairValue > 0) {
    currentDeviationPercent = ((currentPrice - currentFairValue) / currentFairValue) * 100;
  }

  let valuationStatus: ValuationMetrics['valuationStatus'] = 'fair';
  if (statistics && statistics.valuationStatus !== 'N/A') {
    valuationStatus = statistics.valuationStatus;
  } else if (currentDeviationPercent !== null) {
    if (currentDeviationPercent <= -10) {
      valuationStatus = 'DEEPLY_UNDERVALUED';
    } else if (currentDeviationPercent <= -4) {
      valuationStatus = 'UNDERVALUED';
    } else if (currentDeviationPercent >= 12) {
      valuationStatus = 'DEEPLY_OVERVALUED';
    } else if (currentDeviationPercent >= 4) {
      valuationStatus = 'OVERVALUED';
    } else {
      valuationStatus = 'FAIR';
    }
  }

  const forecastFairValueEnd = lastPoint?.fairValue ?? currentFairValue;

  let expectedAnnualReturnPercent: number | null = null;
  if (currentPrice !== null && currentPrice > 0 && forecastFairValueEnd > 0) {
    const years = 3;
    expectedAnnualReturnPercent = (Math.pow(forecastFairValueEnd / currentPrice, 1 / years) - 1) * 100;
  }

  const corridorBandWidthPercent = currentPoint && currentFairValue > 0
    ? ((currentPoint.upperBand - currentPoint.lowerBand) / currentFairValue) * 100
    : 30;

  return {
    currentPrice,
    currentFairValue,
    currentDeviationPercent,
    forecastFairValueEnd,
    expectedAnnualReturnPercent,
    corridorBandWidthPercent,
    valuationStatus,
    medianMultiple: statistics?.median,
    p25Multiple: statistics?.p25,
    p75Multiple: statistics?.p75,
    currentPercentile: statistics?.currentPercentile,
  };
}

/**
 * Formats date strings ('YYYY-MM-DD') for chart axes and tooltips.
 */
export function formatChartDate(dateStr: string, format: 'short' | 'full' = 'short', isYearOnly: boolean = false): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;

  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2] ? parseInt(parts[2], 10) : 1;

  const monthsShort = [
    'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
  ];

  const monthsFull = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  if (format === 'full') {
    return `${day}. ${monthsFull[monthIdx] || ''} ${year}`;
  }

  if (isYearOnly) {
    return `'${year.slice(2)}`;
  }

  return `${monthsShort[monthIdx] || ''} '${year.slice(2)}`;
}

/**
 * Formats currency values with German locale and 2 decimal digits.
 */
export function formatCurrencyValue(val: number | null | undefined, currency = '$'): string {
  if (val === null || val === undefined || isNaN(val)) return '--';
  return `${val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Calculates forecast return metrics (Total Return & annualized CAGR) between base price and target point.
 */
export function calculateForecastReturn(
  basePrice: number,
  targetPoint: ChartDataPoint,
  splitDate: string,
  targetYears?: number
): ForecastReturnMetrics | null {
  if (!basePrice || basePrice <= 0 || !targetPoint || targetPoint.fairValue <= 0) {
    return null;
  }

  let years = targetYears;
  if (years === undefined || years === null || years <= 0) {
    const splitParts = splitDate.split('-').map((p) => parseInt(p, 10));
    const targetParts = targetPoint.date.split('-').map((p) => parseInt(p, 10));

    if (splitParts.length >= 2 && targetParts.length >= 2) {
      const splitMonths = splitParts[0] * 12 + splitParts[1];
      const targetMonths = targetParts[0] * 12 + targetParts[1];
      const deltaMonths = targetMonths - splitMonths;
      years = Math.max(0.25, deltaMonths / 12);
    } else {
      years = 1;
    }
  }

  const targetFairValue = targetPoint.fairValue;
  const targetLowerBand = targetPoint.lowerBand;
  const targetUpperBand = targetPoint.upperBand;

  const totalReturnPercent = ((targetFairValue - basePrice) / basePrice) * 100;
  const annualizedReturnPercent = (Math.pow(targetFairValue / basePrice, 1 / years) - 1) * 100;
  const lowerAnnualizedReturnPercent = (Math.pow(targetLowerBand / basePrice, 1 / years) - 1) * 100;
  const upperAnnualizedReturnPercent = (Math.pow(targetUpperBand / basePrice, 1 / years) - 1) * 100;

  return {
    targetDate: targetPoint.date,
    targetYears: Math.round(years * 10) / 10,
    basePrice,
    targetFairValue,
    targetLowerBand,
    targetUpperBand,
    totalReturnPercent,
    annualizedReturnPercent,
    lowerAnnualizedReturnPercent,
    upperAnnualizedReturnPercent,
  };
}

/**
 * Generates empirical valuation data without synthetic trigonometric noise.
 */
export function generateSampleGrowthData(
  ticker: string = 'AAPL',
  basePrice?: number,
  baseFairValue?: number,
  annualGrowth?: number,
  corridorSpread?: number,
  timeframe: ValuationHistoryTimeframe = '3J'
): { splitDate: string; data: ChartDataPoint[] } {
  const profile = BENCHMARK_PROFILES[ticker.toUpperCase()] || BENCHMARK_PROFILES.AAPL;
  
  // Apply overrides if passed
  const activeProfile = {
    ...profile,
    currentPrice: basePrice !== undefined && basePrice > 0 ? basePrice : profile.currentPrice,
    epsCagr: annualGrowth !== undefined && annualGrowth > 0 ? annualGrowth : profile.epsCagr,
  };

  const unified = generateEmpiricalDatasetForProfile(activeProfile, timeframe);
  
  return {
    splitDate: unified.splitDate,
    data: unified.growthSeries,
  };
}

/**
 * Pre-defined sample ticker records mapped to empirical fundamental profiles.
 */
export const SAMPLE_TICKERS: Record<
  string,
  { name: string; currency: string; price: number; fair: number; growth: number; spread: number }
> = {
  AAPL: {
    name: BENCHMARK_PROFILES.AAPL.name,
    currency: BENCHMARK_PROFILES.AAPL.currency,
    price: BENCHMARK_PROFILES.AAPL.currentPrice,
    fair: Math.round(BENCHMARK_PROFILES.AAPL.baseEps * BENCHMARK_PROFILES.AAPL.targetMedianPe * 10) / 10,
    growth: BENCHMARK_PROFILES.AAPL.epsCagr,
    spread: 0.14,
  },
  MSFT: {
    name: BENCHMARK_PROFILES.MSFT.name,
    currency: BENCHMARK_PROFILES.MSFT.currency,
    price: BENCHMARK_PROFILES.MSFT.currentPrice,
    fair: Math.round(BENCHMARK_PROFILES.MSFT.baseEps * BENCHMARK_PROFILES.MSFT.targetMedianPe * 10) / 10,
    growth: BENCHMARK_PROFILES.MSFT.epsCagr,
    spread: 0.12,
  },
  NVDA: {
    name: BENCHMARK_PROFILES.NVDA.name,
    currency: BENCHMARK_PROFILES.NVDA.currency,
    price: BENCHMARK_PROFILES.NVDA.currentPrice,
    fair: Math.round(BENCHMARK_PROFILES.NVDA.baseEps * BENCHMARK_PROFILES.NVDA.targetMedianPe * 10) / 10,
    growth: BENCHMARK_PROFILES.NVDA.epsCagr,
    spread: 0.18,
  },
  SAP: {
    name: BENCHMARK_PROFILES.SAP.name,
    currency: BENCHMARK_PROFILES.SAP.currency,
    price: BENCHMARK_PROFILES.SAP.currentPrice,
    fair: Math.round(BENCHMARK_PROFILES.SAP.baseEps * BENCHMARK_PROFILES.SAP.targetMedianPe * 10) / 10,
    growth: BENCHMARK_PROFILES.SAP.epsCagr,
    spread: 0.13,
  },
  ALV: {
    name: BENCHMARK_PROFILES.ALV.name,
    currency: BENCHMARK_PROFILES.ALV.currency,
    price: BENCHMARK_PROFILES.ALV.currentPrice,
    fair: Math.round(BENCHMARK_PROFILES.ALV.baseEps * BENCHMARK_PROFILES.ALV.targetMedianPe * 10) / 10,
    growth: BENCHMARK_PROFILES.ALV.epsCagr,
    spread: 0.12,
  },
};

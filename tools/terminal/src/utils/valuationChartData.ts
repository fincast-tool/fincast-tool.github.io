import type {
  ChartDataPoint,
  ValuationMetrics,
  ForecastReturnMetrics,
  ValuationHistoryTimeframe,
  MultipleStatistics,
} from '../types/valuation-chart.ts';
import {
  calculateQuantile,
  calculatePercentileRank,
  calculateMultipleStatistics,
  calculateHistoricalValuation,
  getValidObservations,
  filterOutliersIQR,
} from './valuationEngine.ts';
import {
  normalizeHistoricalFinancialData,
  safeNumber,
} from './normalization.ts';

export * from './valuationEngine.ts';
export * from './normalization.ts';

/**
 * Determines the number of historical months for the chosen timeframe.
 */
export function getHistoryMonthsForTimeframe(tf: ValuationHistoryTimeframe, maxAvailableYears: number = 5): number {
  const now = new Date();
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
 * Formats dates for UI display.
 */
export function formatDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const monthsShort = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${monthsShort[monthIdx] || ''} '${year.slice(2)}`;
}

/**
 * Formats currency values with German locale.
 */
export function formatCurrencyValue(val: number | null | undefined, currency = '$'): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return `${val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Formats large financial figures (e.g. 1.25 B, 540.2 M).
 */
export function formatLargeNumber(val: number | null | undefined, currency = '$'): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const abs = Math.abs(val);
  const sign = val < 0 ? '-' : '';
  if (abs >= 1e12) {
    return `${sign}${(abs / 1e12).toFixed(2)} Bio. ${currency}`;
  }
  if (abs >= 1e9) {
    return `${sign}${(abs / 1e9).toFixed(2)} Mrd. ${currency}`;
  }
  if (abs >= 1e6) {
    return `${sign}${(abs / 1e6).toFixed(2)} Mio. ${currency}`;
  }
  return `${sign}${abs.toFixed(2)} ${currency}`;
}

/**
 * Formats percentages with clean decimal digits.
 */
export function formatPercent(val: number | null | undefined, includeSign = false): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const prefix = (includeSign && val > 0) ? '+' : '';
  return `${prefix}${val.toFixed(2)}%`;
}

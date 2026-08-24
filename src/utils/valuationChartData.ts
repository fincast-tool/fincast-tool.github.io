import { ChartDataPoint, ValuationMetrics } from '../types/valuation-chart';

/**
 * Berechnet Metriken wie Abweichung, Korridorbreite und Status für einen Datenpunkt oder Stichtag.
 */
export function calculateValuationMetrics(
  data: ChartDataPoint[],
  splitDate: string
): ValuationMetrics {
  const currentPoint = data.find((d) => d.date === splitDate) || data[data.length - 1];
  const lastPoint = data[data.length - 1];

  const currentPrice = currentPoint?.price ?? null;
  const currentFairValue = currentPoint?.fairValue ?? 0;

  let currentDeviationPercent: number | null = null;
  if (currentPrice !== null && currentFairValue > 0) {
    currentDeviationPercent = ((currentPrice - currentFairValue) / currentFairValue) * 100;
  }

  let valuationStatus: 'undervalued' | 'fair' | 'overvalued' = 'fair';
  if (currentDeviationPercent !== null) {
    if (currentDeviationPercent <= -8) {
      valuationStatus = 'undervalued';
    } else if (currentDeviationPercent >= 8) {
      valuationStatus = 'overvalued';
    } else {
      valuationStatus = 'fair';
    }
  }

  const forecastFairValueEnd = lastPoint?.fairValue ?? currentFairValue;

  let expectedAnnualReturnPercent: number | null = null;
  if (currentPrice !== null && currentPrice > 0 && forecastFairValueEnd > 0) {
    const years = 3; // Typischer 3-Jahres-Prognosehorizont
    expectedAnnualReturnPercent = (Math.pow(forecastFairValueEnd / currentPrice, 1 / years) - 1) * 100;
  }

  const corridorBandWidthPercent = currentPoint
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
  };
}

/**
 * Formatiert Datumsstrings ('YYYY-MM-DD') für X-Achsen und Tooltips ('Monat Jahr').
 */
export function formatChartDate(dateStr: string, format: 'short' | 'full' = 'short'): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return dateStr;

  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];

  const monthsShort = [
    'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
    'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'
  ];

  const monthsFull = [
    'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
  ];

  if (format === 'full') {
    return `${parseInt(day, 10)}. ${monthsFull[monthIdx] || ''} ${year}`;
  }
  return `${monthsShort[monthIdx] || ''} ${year.slice(2)}`;
}

/**
 * Formatiert Währungsbeträge mit Tausendertrennzeichen und 2 Dezimalstellen.
 */
export function formatCurrencyValue(val: number | null | undefined, currency = '$'): string {
  if (val === null || val === undefined || isNaN(val)) return '--';
  return `${val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Generiert realitätsnahe Chart-Daten für Schnellanalysen basierend auf Fundamentaldaten & KGV-Multiplikator.
 */
export function generateSampleGrowthData(
  ticker: string = 'AAPL',
  basePrice: number = 225.5,
  baseFairValue: number = 210.0,
  annualGrowth: number = 0.12,
  corridorSpread: number = 0.15
): { splitDate: string; data: ChartDataPoint[] } {
  const data: ChartDataPoint[] = [];
  const totalMonths = 48; // 36 Monate Historie + 12 Monate Prognose
  const historyMonths = 36;
  
  const today = new Date(2026, 7, 25); // Aktueller Stichtag
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - historyMonths);

  let currentSimPrice = basePrice * Math.pow(1 - annualGrowth, historyMonths / 12) * 0.95;
  let currentSimFair = baseFairValue * Math.pow(1 - annualGrowth, historyMonths / 12);
  
  let splitDateStr = '';
  const priceHistory: number[] = [];

  for (let i = 0; i <= totalMonths; i++) {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = '01';
    const dateStr = `${year}-${month}-${day}`;

    const isForecast = i > historyMonths;
    if (i === historyMonths) {
      splitDateStr = dateStr;
    }

    // Monatliche Wachstumsrate für Fair Value
    const monthlyGrowth = Math.pow(1 + annualGrowth, 1 / 12) - 1;
    currentSimFair = currentSimFair * (1 + monthlyGrowth);

    // Bänder um ±15% (oder konfigurierten Spread)
    const fairValRound = Math.round(currentSimFair * 100) / 100;
    const lowerBand = Math.round(fairValRound * (1 - corridorSpread) * 100) / 100;
    const upperBand = Math.round(fairValRound * (1 + corridorSpread) * 100) / 100;

    let priceVal: number | null = null;
    let movingAvgVal: number | null = null;

    if (!isForecast) {
      // Zyklische und stochastische Preisschwankung um den Fair Value
      const noise = (Math.sin(i * 0.5) * 0.06) + ((Math.cos(i * 0.9) * 0.04)) + ((Math.sin(i * 1.8) * 0.03));
      currentSimPrice = fairValRound * (1 + noise);
      priceVal = Math.round(currentSimPrice * 100) / 100;
      priceHistory.push(priceVal);

      // Gleitender Durchschnitt (EMA-Glättung über die letzten 6 Datenpunkte)
      const windowSize = Math.min(priceHistory.length, 6);
      const slice = priceHistory.slice(-windowSize);
      const sum = slice.reduce((acc, p) => acc + p, 0);
      movingAvgVal = Math.round((sum / windowSize) * 100) / 100;
    }

    data.push({
      date: dateStr,
      price: priceVal,
      movingAvg: movingAvgVal,
      fairValue: fairValRound,
      lowerBand,
      upperBand,
      isForecast,
    });
  }

  return {
    splitDate: splitDateStr,
    data,
  };
}

/**
 * Vordefinierte Ticker-Beispieldatensätze
 */
export const SAMPLE_TICKERS: Record<
  string,
  { name: string; currency: string; price: number; fair: number; growth: number; spread: number }
> = {
  AAPL: {
    name: 'Apple Inc.',
    currency: '$',
    price: 228.4,
    fair: 215.0,
    growth: 0.11,
    spread: 0.15,
  },
  MSFT: {
    name: 'Microsoft Corporation',
    currency: '$',
    price: 442.1,
    fair: 455.0,
    growth: 0.14,
    spread: 0.14,
  },
  NVDA: {
    name: 'NVIDIA Corporation',
    currency: '$',
    price: 126.8,
    fair: 118.5,
    growth: 0.28,
    spread: 0.20,
  },
  SAP: {
    name: 'SAP SE',
    currency: '€',
    price: 198.5,
    fair: 205.0,
    growth: 0.13,
    spread: 0.15,
  },
  ALV: {
    name: 'Allianz SE',
    currency: '€',
    price: 268.0,
    fair: 280.0,
    growth: 0.08,
    spread: 0.12,
  },
};

import { ChartDataPoint, ValuationMetrics, ForecastReturnMetrics, ValuationHistoryTimeframe } from '../types/valuation-chart';

/**
 * Ermittelt die Anzahl an historischen Monaten für einen gewählten Zeithorizont.
 */
export function getHistoryMonthsForTimeframe(tf: ValuationHistoryTimeframe): number {
  const now = new Date(2026, 7, 25);
  switch (tf) {
    case 'YTD':
      return Math.max(2, now.getMonth() + 1);
    case '1J':
      return 12;
    case '3J':
      return 36;
    case '5J':
      return 60;
    case '10J':
      return 120;
    case 'MAX':
      return 180;
    default:
      return 36;
  }
}

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
export function formatChartDate(dateStr: string, format: 'short' | 'full' = 'short', isYearOnly: boolean = false): string {
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

  if (isYearOnly) {
    return `'${year.slice(2)}`;
  }

  return `${monthsShort[monthIdx] || ''} '${year.slice(2)}`;
}

/**
 * Formatiert Währungsbeträge mit Tausendertrennzeichen und 2 Dezimalstellen.
 */
export function formatCurrencyValue(val: number | null | undefined, currency = '$'): string {
  if (val === null || val === undefined || isNaN(val)) return '--';
  return `${val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

/**
 * Berechnet Rendite-Kennzahlen (Total Return & CAGR p.a.) von einem Basispreis zu einem Zielpunkt.
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

  // Ermittle Zeitabstand in Jahren
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
 * Generiert realitätsnahe Chart-Daten für Schnellanalysen basierend auf Fundamentaldaten & KGV-Multiplikator.
 */
export function generateSampleGrowthData(
  ticker: string = 'AAPL',
  basePrice: number = 225.5,
  baseFairValue: number = 210.0,
  annualGrowth: number = 0.12,
  corridorSpread: number = 0.15,
  timeframe: ValuationHistoryTimeframe = '3J'
): { splitDate: string; data: ChartDataPoint[] } {
  const data: ChartDataPoint[] = [];
  const historyMonths = getHistoryMonthsForTimeframe(timeframe);
  const forecastMonths = 36; // 36 Monate Konsens-Prognose (1J, 2J, 3J)
  const totalMonths = historyMonths + forecastMonths;
  
  const today = new Date(2026, 7, 25); // Aktueller Stichtag
  const startDate = new Date(today);
  startDate.setMonth(startDate.getMonth() - historyMonths);

  let currentSimFair = baseFairValue * Math.pow(1 - annualGrowth, historyMonths / 12);
  let splitDateStr = '';

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

    if (!isForecast) {
      // Realistische zyklische Marktbewegung
      const noise = (Math.sin(i * 0.35) * 0.08) + ((Math.cos(i * 0.85) * 0.05)) + ((Math.sin(i * 1.6) * 0.025));
      let baseP = fairValRound * (1 + noise);
      if (i === historyMonths) {
        baseP = basePrice;
      } else if (i >= historyMonths - 3) {
        const weight = (i - (historyMonths - 3)) / 3;
        baseP = (baseP * (1 - weight)) + (basePrice * weight);
      }
      priceVal = Math.round(baseP * 100) / 100;
    }

    data.push({
      date: dateStr,
      price: priceVal,
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

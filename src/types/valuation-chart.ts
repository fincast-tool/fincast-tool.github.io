export type ValuationHistoryTimeframe = 'YTD' | '1J' | '3J' | '5J' | '10J' | 'MAX';

export interface ChartDataPoint {
  date: string;              // Format: 'YYYY-MM-DD'
  price: number | null;      // null im Prognosebereich
  movingAvg?: number | null; // optional / deprecated
  fairValue: number;         // Durchgehend vorhanden
  lowerBand: number;         // Untere Grenze Korridor (-15%)
  upperBand: number;         // Obere Grenze Korridor (+15%)
  isForecast: boolean;       // true ab splitDate
}

export interface GrowthChartProps {
  ticker: string;
  companyName: string;
  currency?: string;
  splitDate: string;         // Trennpunkt Historie / Prognose
  data: ChartDataPoint[];
  height?: number;
  className?: string;
  isDarkMode?: boolean;
  showFloatingTooltip?: boolean; // Default false (uses top Live Info Bar for clean mobile/desktop UX)
  selectedHorizonYears?: number | null; // 1, 2, 3 oder null
  selectedTimeframe?: ValuationHistoryTimeframe;
  onDataPointHover?: (point: ChartDataPoint | null) => void;
  onHorizonSelect?: (years: number | null) => void;
  onTimeframeSelect?: (timeframe: ValuationHistoryTimeframe) => void;
}

export interface ValuationMetrics {
  currentPrice: number | null;
  currentFairValue: number;
  currentDeviationPercent: number | null;
  forecastFairValueEnd: number;
  expectedAnnualReturnPercent: number | null;
  corridorBandWidthPercent: number;
  valuationStatus: 'undervalued' | 'fair' | 'overvalued';
}

export interface ForecastReturnMetrics {
  targetDate: string;
  targetYears: number;
  basePrice: number;
  targetFairValue: number;
  targetLowerBand: number;
  targetUpperBand: number;
  totalReturnPercent: number;
  annualizedReturnPercent: number;
  lowerAnnualizedReturnPercent: number;
  upperAnnualizedReturnPercent: number;
}


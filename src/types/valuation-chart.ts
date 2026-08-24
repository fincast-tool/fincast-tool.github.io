export interface ChartDataPoint {
  date: string;              // Format: 'YYYY-MM-DD'
  price: number | null;      // null im Prognosebereich
  movingAvg: number | null;  // null im Prognosebereich
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
  onDataPointHover?: (point: ChartDataPoint | null) => void;
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

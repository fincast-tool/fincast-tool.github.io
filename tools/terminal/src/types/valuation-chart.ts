import type {
  HistoricalFundamentalPoint,
  ForecastFundamentalPoint,
  MultipleStatistics,
  UnifiedValuationData,
  ValuationEngineOptions,
} from '../utils/valuationEngine.ts';

export type {
  HistoricalFundamentalPoint,
  ForecastFundamentalPoint,
  MultipleStatistics,
  UnifiedValuationData,
  ValuationEngineOptions,
};

export type ValuationHistoryTimeframe = 'YTD' | '1J' | '3J' | '5J' | '8J' | '10J' | '15J' | 'MAX';
export type MultiplesHistoryTimeframe = '3J' | '5J' | '8J' | '10J' | '15J' | 'MAX';

export interface ChartDataPoint {
  date: string;              // Format: 'YYYY-MM-DD'
  price: number | null;      // null in forecast period
  movingAvg?: number | null; // optional moving average
  fairValue: number;         // Metric * Median Multiple
  lowerBand: number;         // Empirical lower quantile (Metric * P25 Multiple)
  upperBand: number;         // Empirical upper quantile (Metric * P75 Multiple)
  metricValue?: number | null; // Fundamental metric per share (e.g. EPS)
  isForecast: boolean;       // true from splitDate onwards
}

export interface ValuationMetrics {
  currentPrice: number | null;
  currentFairValue: number;
  currentDeviationPercent: number | null;
  forecastFairValueEnd: number;
  expectedAnnualReturnPercent: number | null;
  corridorBandWidthPercent: number;
  valuationStatus: 'DEEPLY_UNDERVALUED' | 'UNDERVALUED' | 'FAIR' | 'OVERVALUED' | 'DEEPLY_OVERVALUED' | 'undervalued' | 'fair' | 'overvalued' | 'N/A';
  medianMultiple?: number | null;
  p25Multiple?: number | null;
  p75Multiple?: number | null;
  currentPercentile?: number | null;
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

export interface MultiplesDataPoint {
  date: string;
  pe_adj: number | null;
  pe_rep: number | null;
  pcf: number | null;
  ps: number | null;
  ev_ebitda?: number | null;
  isForecast: boolean;
}

export interface MultiplesAverages {
  pe_adj: number;
  pe_rep: number;
  pcf: number;
  ps: number;
  ev_ebitda?: number;
}

export interface GrowthChartProps {
  ticker: string;
  companyName: string;
  currency?: string;
  splitDate: string;         // Split date between history and forecast
  data: ChartDataPoint[];
  height?: number;
  className?: string;
  isDarkMode?: boolean;
  showFloatingTooltip?: boolean;
  selectedHorizonYears?: number | null; // 1, 2, 3 or null
  selectedTimeframe?: ValuationHistoryTimeframe;
  statistics?: MultipleStatistics;
  onDataPointHover?: (point: ChartDataPoint | null) => void;
  onHorizonSelect?: (years: number | null) => void;
  onTimeframeSelect?: (timeframe: ValuationHistoryTimeframe) => void;
}

export interface MultiplesChartProps {
  ticker: string;
  companyName: string;
  splitDate: string;
  data: MultiplesDataPoint[];
  averages?: MultiplesAverages;
  statistics?: {
    pe_adj: MultipleStatistics;
    pe_rep: MultipleStatistics;
    pcf: MultipleStatistics;
    ps: MultipleStatistics;
    ev_ebitda: MultipleStatistics;
  };
  height?: number;
  className?: string;
  isDarkMode?: boolean;
  selectedTimeframe?: MultiplesHistoryTimeframe;
  onTimeframeSelect?: (tf: MultiplesHistoryTimeframe) => void;
  onMetricToggle?: (metric: string) => void;
}

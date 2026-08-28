import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
} from 'recharts';
import type { ChartDataPoint, GrowthChartProps, ValuationHistoryTimeframe } from '../types/valuation-chart';
import {
  calculateValuationMetrics,
  calculateForecastReturn,
  formatChartDate,
  formatCurrencyValue,
} from '../utils/valuationChartData';

export const GrowthChart: React.FC<GrowthChartProps> = ({
  ticker,
  companyName,
  currency = '$',
  splitDate,
  data,
  height = 380,
  className = '',
  isDarkMode = true,
  showFloatingTooltip = false,
  selectedHorizonYears = 3,
  selectedTimeframe = '3J',
  statistics,
  onDataPointHover,
  onHorizonSelect,
  onTimeframeSelect,
}) => {
  const [activePoint, setActivePoint] = useState<ChartDataPoint | null>(null);
  const [currentHorizon, setCurrentHorizon] = useState<number | null>(selectedHorizonYears ?? 3);
  const [currentTimeframe, setCurrentTimeframe] = useState<ValuationHistoryTimeframe>(selectedTimeframe ?? '3J');

  const handleHorizonClick = (years: number | null) => {
    setCurrentHorizon(years);
    if (onHorizonSelect) onHorizonSelect(years);
  };

  const handleTimeframeClick = (tf: ValuationHistoryTimeframe) => {
    setCurrentTimeframe(tf);
    if (onTimeframeSelect) onTimeframeSelect(tf);
  };

  // Preparation of data for distinct solid vs. dashed lines & empirical quantile bands
  const processedData = useMemo(() => {
    return data.map((point) => {
      const isHistorical = point.date <= splitDate;
      const isFuture = point.date >= splitDate;

      // Empirical quantile band range: [lowerBand (P25), upperBand (P75)]
      const corridorRange: [number, number] = [point.lowerBand, point.upperBand];

      return {
        ...point,
        corridorRange,
        // Historical Fair Value (up to splitDate)
        fairValueHistory: isHistorical ? point.fairValue : null,
        // Forecast Fair Value (from splitDate onwards for seamless connection)
        fairValueForecast: isFuture ? point.fairValue : null,
        // Band width
        bandDelta: point.upperBand - point.lowerBand,
      };
    });
  }, [data, splitDate]);

  // Metric and corridor calculations
  const metrics = useMemo(() => {
    return calculateValuationMetrics(data, splitDate, statistics);
  }, [data, splitDate, statistics]);

  // Calculation of return forecast for selected horizon
  const roiMetrics = useMemo(() => {
    const splitIndex = data.findIndex((d) => d.date === splitDate);
    if (splitIndex < 0) return null;
    const splitPt = data[splitIndex];
    const basePrice = splitPt.price || splitPt.fairValue;

    if (!currentHorizon || currentHorizon <= 0) {
      return null;
    }

    const targetIndex = Math.min(data.length - 1, splitIndex + Math.round(currentHorizon * 12));
    const targetPt = data[targetIndex];
    if (!targetPt) return null;

    return calculateForecastReturn(basePrice, targetPt, splitDate, currentHorizon);
  }, [data, splitDate, currentHorizon]);

  const yDomain = useMemo(() => {
    const allValues: number[] = [];
    data.forEach((d) => {
      if (d.price !== null && d.price > 0) allValues.push(d.price);
      if (d.fairValue > 0) allValues.push(d.fairValue);
      if (d.lowerBand > 0) allValues.push(d.lowerBand);
      if (d.upperBand > 0) allValues.push(d.upperBand);
    });

    if (allValues.length === 0) return [0, 100];

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.12;

    return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
  }, [data]);

  // Last data point for ReferenceArea
  const lastDate = data.length > 0 ? data[data.length - 1].date : splitDate;

  // Theme styling
  const theme = {
    bg: isDarkMode ? 'bg-[#0F1420]/90' : 'bg-white',
    border: isDarkMode ? 'border-white/10' : 'border-slate-200',
    grid: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    textMuted: isDarkMode ? '#94A3B8' : '#64748B',
    textMain: isDarkMode ? '#F8FAFC' : '#0F172A',
    priceLine: isDarkMode ? '#F8FAFC' : '#0F172A',
    fairValueLine: '#D4AF37', // Gold / Amber Accent
    forecastAreaFill: isDarkMode ? 'rgba(212, 175, 55, 0.035)' : 'rgba(212, 175, 55, 0.05)',
    splitLine: isDarkMode ? 'rgba(212, 175, 55, 0.4)' : 'rgba(212, 175, 55, 0.6)',
  };

  const handleMouseMove = (state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
      const point = state.activePayload[0].payload as ChartDataPoint;
      setActivePoint(point);
      if (onDataPointHover) onDataPointHover(point);
    } else {
      setActivePoint(null);
      if (onDataPointHover) onDataPointHover(null);
    }
  };

  const handleMouseLeave = () => {
    setActivePoint(null);
    if (onDataPointHover) onDataPointHover(null);
  };

  const handleChartClick = (state: any) => {
    if (state && state.activePayload && state.activePayload.length > 0) {
      const point = state.activePayload[0].payload as ChartDataPoint;
      const splitIndex = data.findIndex((d) => d.date === splitDate);
      const clickedIndex = data.findIndex((d) => d.date === point.date);

      if (clickedIndex <= splitIndex) {
        handleHorizonClick(null);
      } else {
        const deltaMonths = clickedIndex - splitIndex;
        const approxYears = Math.max(1, Math.min(3, Math.round(deltaMonths / 12)));
        handleHorizonClick(approxYears);
      }
    }
  };

  const isMultiYear = data.length > 60;

  // Valuation Status Label Mapping
  const getStatusBadge = () => {
    const dev = metrics.currentDeviationPercent;
    const status = metrics.valuationStatus;

    if (status === 'DEEPLY_UNDERVALUED' || (dev !== null && dev <= -12)) {
      return {
        bg: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400',
        dot: 'bg-emerald-400',
        label: `Stark Unterbewertet (${dev !== null ? `${dev.toFixed(1)}%` : '< P25'})`,
      };
    }
    if (status === 'UNDERVALUED' || (dev !== null && dev <= -4)) {
      return {
        bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        dot: 'bg-emerald-400',
        label: `Unterbewertet (${dev !== null ? `${dev.toFixed(1)}%` : '< Median'})`,
      };
    }
    if (status === 'DEEPLY_OVERVALUED' || (dev !== null && dev >= 15)) {
      return {
        bg: 'bg-rose-500/15 border-rose-500/35 text-rose-400',
        dot: 'bg-rose-400',
        label: `Stark Überbewertet (${dev !== null ? `+${dev.toFixed(1)}%` : '> P75'})`,
      };
    }
    if (status === 'OVERVALUED' || (dev !== null && dev >= 5)) {
      return {
        bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        dot: 'bg-amber-400',
        label: `Überbewertet (${dev !== null ? `+${dev.toFixed(1)}%` : '> Median'})`,
      };
    }
    return {
      bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
      dot: 'bg-blue-400',
      label: `Fair bewertet (${dev !== null && dev >= 0 ? '+' : ''}${dev?.toFixed(1) || '0.0'}%)`,
    };
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      className={`relative w-full rounded-2xl border ${theme.border} ${theme.bg} p-4 md:p-6 backdrop-blur-md transition-all duration-300 font-sans shadow-sm ${className}`}
    >
      {/* Header & Quick-Metrics Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center text-[#D4AF37]">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-sm md:text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'} uppercase tracking-tight`}>
                {companyName} <span className="font-mono text-xs text-[#D4AF37]">({ticker})</span>
              </h3>
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-[#D4AF37]">
                Empirical Fundamental Corridor
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Historischer Kursverlauf &amp; empirischer Bewertungskorridor (P25 – P75) inkl. 3-Jahres-Prognose
            </p>
          </div>
        </div>

        {/* Current Valuation Badge & Timeframe Range Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {metrics.currentPrice !== null && (
            <div className="text-right hidden sm:block">
              <div className="text-[10px] uppercase font-mono text-gray-400">Akt. Kurs</div>
              <div className={`font-mono text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {formatCurrencyValue(metrics.currentPrice, currency)}
              </div>
            </div>
          )}
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase font-mono text-gray-400">Fair Value (Median)</div>
            <div className="font-mono text-sm font-bold text-[#D4AF37]">
              {formatCurrencyValue(metrics.currentFairValue, currency)}
            </div>
          </div>
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm ${statusBadge.bg}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusBadge.dot}`} />
            <span>{statusBadge.label}</span>
          </div>
        </div>
      </div>

      {/* Top Bar: Range Selector (YTD, 1J, 3J, 5J, 10J, MAX) & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-gray-400 mb-3 pb-2.5 border-b border-white/5">
        <div className="flex flex-wrap items-center gap-3 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className={`w-3 h-0.5 ${isDarkMode ? 'bg-white' : 'bg-slate-900'} rounded-full`} />
            <span className="text-gray-300">Kurs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-[#D4AF37] rounded-full" />
            <span className="text-gray-300">Fair Value (Median)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-[#D4AF37]" />
            <span className="text-[#D4AF37]/90">Konsens-Prognose</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#10B981]/20 border border-[#D4AF37]/30" />
            <span className="text-gray-300">Korridor (P25 – P75)</span>
          </div>
        </div>

        {/* Timeframe Range Pills */}
        <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10">
          {(['YTD', '1J', '3J', '5J', '8J', '10J', '15J', 'MAX'] as ValuationHistoryTimeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => handleTimeframeClick(tf)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                currentTimeframe === tf
                  ? 'text-[#D4AF37] bg-[#D4AF37]/20 border border-[#D4AF37]/30 shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Horizon / Rendite-Prognose Selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-0.5">
        <div className="flex items-center gap-1.5 text-xs font-mono text-gray-300">
          <span className="text-[#D4AF37] font-bold flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            <span>Rendite-Prognose:</span>
          </span>
          <span className="text-[10px] text-gray-400 hidden sm:inline">(Stichtag ➔ Fair Value Median)</span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[11px]">
          <button
            type="button"
            onClick={() => handleHorizonClick(null)}
            className={`px-2.5 py-1 rounded-lg border transition-all text-[11px] ${
              !currentHorizon
                ? 'border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#D4AF37] font-bold'
                : 'border-white/10 text-gray-400 hover:text-white'
            }`}
          >
            Stichtag
          </button>
          {[1, 2, 3].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => handleHorizonClick(y)}
              className={`px-2.5 py-1 rounded-lg border transition-all text-[11px] ${
                currentHorizon === y
                  ? 'border-[#D4AF37]/50 bg-[#D4AF37]/15 text-[#D4AF37] font-bold shadow-sm'
                  : 'border-white/10 text-gray-300 hover:border-[#D4AF37]/40 hover:text-[#D4AF37] font-semibold'
              }`}
            >
              +{y} {y === 1 ? 'Jahr' : 'Jahre'}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Yield / ROI Card */}
      {roiMetrics && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-gradient-to-r from-[#D4AF37]/10 via-emerald-500/10 to-white/[0.02] border border-[#D4AF37]/25 mb-3.5 text-xs font-mono transition-all">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-sm shrink-0">
              %
            </div>
            <div>
              <div className="text-[10px] uppercase font-mono tracking-wider text-gray-400">
                Erwartete Ø Rendite (+{roiMetrics.targetYears} {roiMetrics.targetYears === 1 ? 'Jahr' : 'Jahre'} - {formatChartDate(roiMetrics.targetDate, 'short')})
              </div>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span
                  className={`text-base sm:text-lg font-bold ${
                    roiMetrics.annualizedReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {roiMetrics.annualizedReturnPercent >= 0 ? '+' : ''}
                  {roiMetrics.annualizedReturnPercent.toFixed(1)}% p.a.
                </span>
                <span className="text-xs text-gray-300 font-normal">
                  ({roiMetrics.totalReturnPercent >= 0 ? '+' : ''}
                  {roiMetrics.totalReturnPercent.toFixed(1)}% gesamt)
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0 sm:pl-4">
            <div>
              <div className="text-[9px] text-gray-400 uppercase">Ziel Fair Value</div>
              <div className="font-bold text-[#D4AF37] mt-0.5">
                {formatCurrencyValue(roiMetrics.targetFairValue, currency)}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-gray-400 uppercase">P25 – P75 Spanne p.a.</div>
              <div className="font-mono text-gray-300 mt-0.5">
                {roiMetrics.lowerAnnualizedReturnPercent >= 0 ? '+' : ''}
                {roiMetrics.lowerAnnualizedReturnPercent.toFixed(1)}% bis{' '}
                {roiMetrics.upperAnnualizedReturnPercent >= 0 ? '+' : ''}
                {roiMetrics.upperAnnualizedReturnPercent.toFixed(1)}% p.a.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Live Interactive Info Bar (Crystal Clear on Mobile & Desktop) */}
      {(() => {
        const pt = activePoint || data.find((d) => d.date === splitDate) || data[data.length - 1];
        if (!pt) return null;
        const isStichtag = pt.date === splitDate;
        const devPct = pt.price !== null && pt.fairValue > 0 ? ((pt.price - pt.fairValue) / pt.fairValue) * 100 : null;

        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-2.5 rounded-xl bg-white/[0.04] border border-white/10 mb-4 text-xs font-mono transition-colors">
            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-gray-400 uppercase tracking-tighter">Datum / Modus</span>
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <span className={`font-bold text-[11px] truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  {formatChartDate(pt.date, 'full')}
                </span>
                <span
                  className={`text-[8px] px-1 py-0.2 rounded font-bold uppercase shrink-0 ${
                    isStichtag
                      ? 'bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30'
                      : pt.isForecast
                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                      : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {isStichtag ? 'Stichtag' : pt.isForecast ? 'Prognose' : 'Historie'}
                </span>
              </div>
            </div>

            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-gray-400 uppercase tracking-tighter">Realkurs</span>
              <span className={`font-bold mt-0.5 text-[11px] truncate ${pt.price !== null ? (isDarkMode ? 'text-white' : 'text-slate-900') : 'text-gray-500 italic'}`}>
                {pt.price !== null ? formatCurrencyValue(pt.price, currency) : '-- (Zukunft)'}
              </span>
            </div>

            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-gray-400 uppercase tracking-tighter">Fair Value (Median)</span>
              <span className="font-bold text-[#D4AF37] mt-0.5 text-[11px] truncate">
                {formatCurrencyValue(pt.fairValue, currency)}
              </span>
            </div>

            <div className="flex flex-col min-w-0">
              <span className="text-[9px] text-gray-400 uppercase tracking-tighter">Abweichung</span>
              <span
                className={`font-bold mt-0.5 text-[11px] truncate ${
                  devPct !== null
                    ? devPct <= -5
                      ? 'text-emerald-400'
                      : devPct >= 5
                      ? 'text-rose-400'
                      : 'text-blue-400'
                    : 'text-gray-500'
                }`}
              >
                {devPct !== null
                  ? `${devPct > 0 ? '+' : ''}${devPct.toFixed(1)}% ${
                      devPct <= -5 ? '(Unterbew.)' : devPct >= 5 ? '(Überbew.)' : '(Fair)'
                    }`
                  : '--'}
              </span>
            </div>

            <div className="flex flex-col min-w-0 col-span-2 sm:col-span-1 lg:col-span-1">
              <span className="text-[9px] text-gray-400 uppercase tracking-tighter">Korridor (P25 – P75)</span>
              <span className="font-mono text-gray-300 mt-0.5 text-[10px] truncate">
                {pt.lowerBand.toFixed(1)} – {pt.upperBand.toFixed(1)} {currency}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Main Chart Container */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={processedData}
            margin={{ top: 15, right: 25, left: 0, bottom: 5 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleChartClick}
          >
            {/* Gradients for translucent FinTech corridor and forecast shadow */}
            <defs>
              <linearGradient id="corridorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.16} />
                <stop offset="50%" stopColor="#D4AF37" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.16} />
              </linearGradient>

              <linearGradient id="forecastAreaGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.02} />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.07} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={(date) => formatChartDate(date, 'short', isMultiYear)}
              stroke={theme.textMuted}
              tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
              tickLine={false}
              axisLine={{ stroke: theme.grid }}
              minTickGap={30}
            />

            <YAxis
              domain={yDomain}
              tickFormatter={(val) => `${val} ${currency}`}
              stroke={theme.textMuted}
              tick={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}
              tickLine={false}
              axisLine={false}
              orientation="right"
              width={65}
            />

            {/* Shaded Forecast Area */}
            <ReferenceArea
              x1={splitDate}
              x2={lastDate}
              fill="url(#forecastAreaGradient)"
              fillOpacity={1}
              stroke="none"
            />

            {/* Split Date Line */}
            <ReferenceLine
              x={splitDate}
              stroke={theme.splitLine}
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{
                value: 'Konsens-Prognose ➔',
                position: 'insideTopRight',
                fill: '#D4AF37',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                offset: 8,
              }}
            />

            {/* 1. Empirical Quantile Corridor: Lower Band (P25) & Upper Band (P75) */}
            <Area
              type="monotone"
              dataKey="corridorRange"
              stroke="rgba(212, 175, 55, 0.25)"
              strokeWidth={1}
              fill="url(#corridorGradient)"
              isAnimationActive={false}
              name="Bewertungskorridor (P25–P75)"
            />

            {/* 2. Historical Fair Value (Solid line up to splitDate) */}
            <Line
              type="monotone"
              dataKey="fairValueHistory"
              stroke={theme.fairValueLine}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: theme.fairValueLine, strokeWidth: 2, fill: '#fff' }}
              name="Fair Value (Median Hist.)"
              isAnimationActive={true}
            />

            {/* 2b. Forecast Fair Value (Dashed line from splitDate) */}
            <Line
              type="monotone"
              dataKey="fairValueForecast"
              stroke={theme.fairValueLine}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, stroke: theme.fairValueLine, strokeWidth: 2, fill: '#fff' }}
              name="Fair Value (Konsens-Prog.)"
              isAnimationActive={true}
            />

            {/* 3. Real Price Line */}
            <Line
              type="monotone"
              dataKey="price"
              stroke={theme.priceLine}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 5, stroke: theme.priceLine, strokeWidth: 2.5, fill: '#fff' }}
              name="Realkurs"
              isAnimationActive={true}
              connectNulls={false}
            />

            {/* Tooltip */}
            <Tooltip
              content={
                showFloatingTooltip ? (
                  <CustomValuationTooltip currency={currency} isDarkMode={isDarkMode} />
                ) : (
                  () => null
                )
              }
              cursor={{
                stroke: isDarkMode ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
                strokeWidth: 1,
                strokeDasharray: '2 2',
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom Methodology Info */}
      <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-gray-400">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className={`w-3.5 h-0.5 ${isDarkMode ? 'bg-white' : 'bg-slate-900'} rounded-full`} />
            <span>Realkurs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-[#D4AF37] rounded-full" />
            <span>Fair Value (Median)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 border-t border-dashed border-[#D4AF37]" />
            <span>Konsens-Schätzung</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#10B981]/20 border border-[#D4AF37]/30" />
            <span>Empirischer Korridor (P25 – P75)</span>
          </div>
        </div>

        <div className="text-[10px] text-gray-500 flex items-center gap-1">
          <svg className="w-3 h-3 text-[#D4AF37]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Stichtag: {formatChartDate(splitDate, 'full')}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Modern interactive FinTech tooltip
 */
interface TooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
  currency: string;
  isDarkMode: boolean;
}

const CustomValuationTooltip: React.FC<TooltipProps> = ({
  active,
  payload,
  currency,
  isDarkMode,
}) => {
  if (!active || !payload || payload.length === 0) return null;

  const dataPoint = payload[0].payload as ChartDataPoint;
  if (!dataPoint) return null;

  const { date, price, fairValue, lowerBand, upperBand, isForecast, metricValue } = dataPoint;

  let deviationPercent: number | null = null;
  if (price !== null && fairValue > 0) {
    deviationPercent = ((price - fairValue) / fairValue) * 100;
  }

  const isUndervalued = deviationPercent !== null && deviationPercent < 0;
  const isFair = deviationPercent !== null && Math.abs(deviationPercent) <= 3;

  return (
    <div
      className={`p-3.5 rounded-xl border backdrop-blur-xl shadow-2xl font-mono text-xs transition-all min-w-[230px] ${
        isDarkMode
          ? 'bg-[#0F1420]/95 border-white/15 text-gray-200'
          : 'bg-white/95 border-slate-200 text-slate-800'
      }`}
    >
      {/* Tooltip Header: Date & Status Badge */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-white/10">
        <div className="font-bold text-[11px] uppercase tracking-wider text-white">
          {formatChartDate(date, 'full')}
        </div>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tight ${
            isForecast
              ? 'bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30'
              : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
          }`}
        >
          {isForecast ? 'Prognose' : 'Historie'}
        </span>
      </div>

      {/* Key-Value Metrics */}
      <div className="space-y-1.5">
        {/* Real Price */}
        {price !== null ? (
          <div className="flex items-center justify-between gap-4">
            <span className="text-gray-400 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isDarkMode ? 'bg-white' : 'bg-slate-900'}`} />
              Realkurs:
            </span>
            <span className="font-bold text-white">{formatCurrencyValue(price, currency)}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 text-gray-500 italic text-[11px]">
            <span>Realkurs:</span>
            <span>-- (Zukunft)</span>
          </div>
        )}

        {/* Fundamental Metric per share (e.g. EPS) if present */}
        {metricValue !== undefined && metricValue !== null && (
          <div className="flex items-center justify-between gap-4 text-[11px]">
            <span className="text-gray-400">Fundamental (EPS):</span>
            <span className="font-mono text-gray-200">{formatCurrencyValue(metricValue, currency)}</span>
          </div>
        )}

        {/* Fair Value (Median) */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            Fair Value (Median):
          </span>
          <span className="font-bold text-[#D4AF37]">{formatCurrencyValue(fairValue, currency)}</span>
        </div>

        {/* Deviation % */}
        {deviationPercent !== null && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/5">
            <span className="text-gray-400">Abweichung:</span>
            <span
              className={`font-bold ${
                isUndervalued
                  ? 'text-emerald-400'
                  : isFair
                  ? 'text-blue-400'
                  : 'text-rose-400'
              }`}
            >
              {deviationPercent > 0 ? '+' : ''}
              {deviationPercent.toFixed(2)}%
              <span className="text-[9px] ml-1 font-normal opacity-80">
                {isUndervalued ? '(Unterbew.)' : isFair ? '(Fair)' : '(Überbew.)'}
              </span>
            </span>
          </div>
        )}

        {/* Empirical Quantile Corridor (P25 - P75) */}
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/5 text-[10px] text-gray-400">
          <span>Korridor (P25–P75):</span>
          <span className="text-gray-300 font-mono">
            {lowerBand.toFixed(1)} – {upperBand.toFixed(1)} {currency}
          </span>
        </div>
      </div>
    </div>
  );
};

export default GrowthChart;

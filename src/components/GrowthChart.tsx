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
import { ChartDataPoint, GrowthChartProps } from '../types/valuation-chart';
import {
  calculateValuationMetrics,
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
  onDataPointHover,
}) => {
  const [activePoint, setActivePoint] = useState<ChartDataPoint | null>(null);

  // Aufbereitung der Daten für getrennte solide vs. gestrichelte Linien & Bänder
  const processedData = useMemo(() => {
    return data.map((point) => {
      const isHistorical = point.date <= splitDate;
      const isFuture = point.date >= splitDate;

      // Bandbreite für Area Fill
      const corridorRange: [number, number] = [point.lowerBand, point.upperBand];

      return {
        ...point,
        corridorRange,
        // Historischer Fair Value (nur bis inkl. splitDate)
        fairValueHistory: isHistorical ? point.fairValue : null,
        // Prognostizierter Fair Value (ab inkl. splitDate für nahtlose Verbindung)
        fairValueForecast: isFuture ? point.fairValue : null,
        // Unteres & Oberes Band für Area-Visualisierung
        bandDelta: point.upperBand - point.lowerBand,
      };
    });
  }, [data, splitDate]);

  // Kennzahlen und Min/Max-Berechnung für Y-Achse
  const metrics = useMemo(() => {
    return calculateValuationMetrics(data, splitDate);
  }, [data, splitDate]);

  const yDomain = useMemo(() => {
    const allValues: number[] = [];
    data.forEach((d) => {
      if (d.price !== null) allValues.push(d.price);
      if (d.movingAvg !== null) allValues.push(d.movingAvg);
      allValues.push(d.fairValue, d.lowerBand, d.upperBand);
    });

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.12;

    return [Math.max(0, Math.floor(min - padding)), Math.ceil(max + padding)];
  }, [data]);

  // Letzter Datenpunkt für die End-Position der ReferenceArea
  const lastDate = data.length > 0 ? data[data.length - 1].date : splitDate;

  // Farb-Paletten basierend auf Dark/Light Mode
  const theme = {
    bg: isDarkMode ? 'bg-[#0F1420]/90' : 'bg-white',
    border: isDarkMode ? 'border-white/10' : 'border-slate-200',
    grid: isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    textMuted: isDarkMode ? '#94A3B8' : '#64748B',
    textMain: isDarkMode ? '#F8FAFC' : '#0F172A',
    priceLine: isDarkMode ? '#F8FAFC' : '#0F172A',
    maLine: '#3B82F6',
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

  return (
    <div
      className={`relative w-full rounded-2xl border ${theme.border} ${theme.bg} p-4 md:p-6 backdrop-blur-md transition-all duration-300 font-sans shadow-sm ${className}`}
    >
      {/* Header & Quick-Metrics Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5 pb-4 border-b border-white/5">
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
                Fair Value Corridor
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              Historischer Kurs, gleitender Durchschnitt &amp; Konsens-Bewertungsband (±15%)
            </p>
          </div>
        </div>

        {/* Current Valuation Badge */}
        <div className="flex items-center gap-3">
          {metrics.currentPrice !== null && (
            <div className="text-right hidden sm:block">
              <div className="text-[10px] uppercase font-mono text-gray-400">Akt. Kurs</div>
              <div className={`font-mono text-sm font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {formatCurrencyValue(metrics.currentPrice, currency)}
              </div>
            </div>
          )}
          <div className="text-right hidden sm:block">
            <div className="text-[10px] uppercase font-mono text-gray-400">Fairer Wert</div>
            <div className="font-mono text-sm font-bold text-[#D4AF37]">
              {formatCurrencyValue(metrics.currentFairValue, currency)}
            </div>
          </div>
          {metrics.currentDeviationPercent !== null && (
            <div
              className={`px-3 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1.5 shadow-sm ${
                metrics.currentDeviationPercent <= -5
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : metrics.currentDeviationPercent >= 5
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  metrics.currentDeviationPercent <= -5
                    ? 'bg-emerald-400'
                    : metrics.currentDeviationPercent >= 5
                    ? 'bg-amber-400'
                    : 'bg-blue-400'
                }`}
              />
              <span>
                {metrics.currentDeviationPercent > 0 ? '+' : ''}
                {metrics.currentDeviationPercent.toFixed(1)}%{' '}
                {metrics.currentDeviationPercent <= -5
                  ? 'Unterbewertet'
                  : metrics.currentDeviationPercent >= 5
                  ? 'Überbewertet'
                  : 'Fair bewertet'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Chart Container */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={processedData}
            margin={{ top: 15, right: 25, left: 0, bottom: 5 }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Definitions für zarte, transluzente FinTech-Gradients */}
            <defs>
              {/* Zartes Bewertungsband (Emerald bei Unterbewertung / Amber-Gold Basis) */}
              <linearGradient id="corridorGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity={0.16} />
                <stop offset="50%" stopColor="#D4AF37" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#10B981" stopOpacity={0.16} />
              </linearGradient>

              {/* Prognose-Schattenverlauf */}
              <linearGradient id="forecastAreaGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity={0.02} />
                <stop offset="100%" stopColor="#D4AF37" stopOpacity={0.07} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={(date) => formatChartDate(date, 'short')}
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

            {/* Schattierter Prognosebereich (ReferenceArea) */}
            <ReferenceArea
              x1={splitDate}
              x2={lastDate}
              fill="url(#forecastAreaGradient)"
              fillOpacity={1}
              stroke="none"
            />

            {/* Vertikale Trennlinie Historie vs. Prognose */}
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

            {/* 1. Bewertungskorridor: Oberes Band & Unteres Band */}
            {/* Area zwischen lowerBand und upperBand */}
            <Area
              type="monotone"
              dataKey="corridorRange"
              stroke="rgba(212, 175, 55, 0.25)"
              strokeWidth={1}
              fill="url(#corridorGradient)"
              isAnimationActive={false}
              name="Bewertungskorridor"
            />

            {/* 2. Trendlinie / Moving Average (geglaettet, #3B82F6) */}
            <Line
              type="monotone"
              dataKey="movingAvg"
              stroke={theme.maLine}
              strokeWidth={1.75}
              dot={false}
              activeDot={{ r: 4, stroke: theme.maLine, strokeWidth: 2, fill: '#fff' }}
              name="Trendlinie (MA)"
              isAnimationActive={true}
              connectNulls={false}
            />

            {/* 3. Fair-Value-Linie Historie (durchgezogen bis splitDate) */}
            <Line
              type="monotone"
              dataKey="fairValueHistory"
              stroke={theme.fairValueLine}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: theme.fairValueLine, strokeWidth: 2, fill: '#fff' }}
              name="Fair Value (Historie)"
              isAnimationActive={true}
            />

            {/* 3b. Fair-Value-Linie Prognose (gestrichelt ab splitDate) */}
            <Line
              type="monotone"
              dataKey="fairValueForecast"
              stroke={theme.fairValueLine}
              strokeWidth={2}
              strokeDasharray="4 4"
              dot={false}
              activeDot={{ r: 4, stroke: theme.fairValueLine, strokeWidth: 2, fill: '#fff' }}
              name="Fair Value (Prognose)"
              isAnimationActive={true}
            />

            {/* 4. Reale Kurslinie (Historie bis splitDate) */}
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

            {/* Interaktiver Custom Tooltip */}
            <Tooltip
              content={<CustomValuationTooltip currency={currency} isDarkMode={isDarkMode} />}
              cursor={{
                stroke: isDarkMode ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
                strokeWidth: 1,
                strokeDasharray: '2 2',
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom Legend & Methodology Info */}
      <div className="mt-4 pt-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-gray-400">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className={`w-3.5 h-0.5 ${isDarkMode ? 'bg-white' : 'bg-slate-900'} rounded-full`} />
            <span>Realkurs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-[#3B82F6] rounded-full" />
            <span>Trendlinie (MA)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-[#D4AF37] rounded-full" />
            <span>Fair Value (Hist.)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 border-t border-dashed border-[#D4AF37]" />
            <span>Konsens-Schätzung</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-[#10B981]/20 border border-[#D4AF37]/30" />
            <span>Korridor (±15%)</span>
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
 * Moderner, interaktiver FinTech-Tooltip
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
  label,
  currency,
  isDarkMode,
}) => {
  if (!active || !payload || payload.length === 0) return null;

  const dataPoint = payload[0].payload as ChartDataPoint;
  if (!dataPoint) return null;

  const { date, price, movingAvg, fairValue, lowerBand, upperBand, isForecast } = dataPoint;

  let deviationPercent: number | null = null;
  if (price !== null && fairValue > 0) {
    deviationPercent = ((price - fairValue) / fairValue) * 100;
  }

  const isUndervalued = deviationPercent !== null && deviationPercent < 0;
  const isFair = deviationPercent !== null && Math.abs(deviationPercent) <= 3;

  return (
    <div
      className={`p-3.5 rounded-xl border backdrop-blur-xl shadow-2xl font-mono text-xs transition-all min-w-[220px] ${
        isDarkMode
          ? 'bg-[#0F1420]/95 border-white/15 text-gray-200'
          : 'bg-white/95 border-slate-200 text-slate-800'
      }`}
    >
      {/* Tooltip Header: Datum & Status Badge */}
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
        {/* Realkurs (nur in Historie) */}
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

        {/* Trendlinie (MA) */}
        {movingAvg !== null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-gray-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
              Trend (MA):
            </span>
            <span className="font-medium text-blue-300">{formatCurrencyValue(movingAvg, currency)}</span>
          </div>
        )}

        {/* Fair Value */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-gray-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
            Fairer Wert:
          </span>
          <span className="font-bold text-[#D4AF37]">{formatCurrencyValue(fairValue, currency)}</span>
        </div>

        {/* Abweichung % */}
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

        {/* Korridor-Spanne (Lower - Upper Band) */}
        <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/5 text-[10px] text-gray-400">
          <span>Korridor (±15%):</span>
          <span className="text-gray-300 font-mono">
            {lowerBand.toFixed(1)} – {upperBand.toFixed(1)} {currency}
          </span>
        </div>
      </div>
    </div>
  );
};

export default GrowthChart;

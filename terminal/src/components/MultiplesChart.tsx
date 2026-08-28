import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  CartesianGrid,
} from 'recharts';
import type {
  MultiplesChartProps,
  MultiplesDataPoint,
  MultiplesHistoryTimeframe,
  MultipleStatistics,
} from '../types/valuation-chart';
import { formatChartDate } from '../utils/valuationChartData';

export const MultiplesChart: React.FC<MultiplesChartProps> = ({
  ticker,
  companyName,
  splitDate,
  data,
  averages,
  statistics,
  height = 300,
  className = '',
  isDarkMode = true,
  selectedTimeframe = '10J',
  onTimeframeSelect,
  onMetricToggle,
}) => {
  const [activeMetrics, setActiveMetrics] = useState({
    pe_adj: true,
    pe_rep: true,
    pcf: true,
    ps: true,
    ev_ebitda: true,
  });
  const [timeframe, setTimeframe] = useState<MultiplesHistoryTimeframe>(selectedTimeframe);
  const [activePoint, setActivePoint] = useState<MultiplesDataPoint | null>(null);

  const toggleMetric = (key: keyof typeof activeMetrics) => {
    setActiveMetrics((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      if (onMetricToggle) onMetricToggle(key);
      return next;
    });
  };

  const handleTimeframeChange = (tf: MultiplesHistoryTimeframe) => {
    setTimeframe(tf);
    if (onTimeframeSelect) onTimeframeSelect(tf);
  };

  const splitIndex = useMemo(() => data.findIndex((d) => d.date === splitDate), [data, splitDate]);
  const splitPoint = data[splitIndex] || data[0];

  // Current display point (either hovered point or Stichtag)
  const currentPt = activePoint || splitPoint || data[data.length - 1];

  // Primary stats reference (pe_adj)
  const peStats = statistics?.pe_adj;
  const peMedian = peStats?.median || averages?.pe_adj;
  const peDiffPct = useMemo(() => {
    if (!peMedian || !currentPt?.pe_adj) return null;
    return ((currentPt.pe_adj - peMedian) / peMedian) * 100;
  }, [peMedian, currentPt]);

  // Overall valuation status from engine or computed diff
  const valuationStatus = peStats?.valuationStatus || (
    peDiffPct !== null && peDiffPct <= -12
      ? 'DEEPLY_UNDERVALUED'
      : peDiffPct !== null && peDiffPct <= -4
      ? 'UNDERVALUED'
      : peDiffPct !== null && peDiffPct >= 15
      ? 'DEEPLY_OVERVALUED'
      : peDiffPct !== null && peDiffPct >= 4
      ? 'OVERVALUED'
      : 'FAIR'
  );

  const getStatusPill = () => {
    const pctl = peStats?.currentPercentile;
    const pctlStr = pctl !== null && pctl !== undefined ? ` (${pctl}% Perzentil)` : '';

    if (valuationStatus === 'DEEPLY_UNDERVALUED') {
      return {
        bg: 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400',
        dot: 'bg-emerald-400',
        text: `Historischer Tiefstand${pctlStr}`,
      };
    }
    if (valuationStatus === 'UNDERVALUED') {
      return {
        bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        dot: 'bg-emerald-400',
        text: `Historischer Abschlag${pctlStr}`,
      };
    }
    if (valuationStatus === 'DEEPLY_OVERVALUED') {
      return {
        bg: 'bg-rose-500/15 border-rose-500/35 text-rose-400',
        dot: 'bg-rose-400',
        text: `Historische Spitzenbewertung${pctlStr}`,
      };
    }
    if (valuationStatus === 'OVERVALUED') {
      return {
        bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        dot: 'bg-amber-400',
        text: `Bewertungsprämie${pctlStr}`,
      };
    }
    return {
      bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
      dot: 'bg-blue-400',
      text: `Faire Bewertung${pctlStr}`,
    };
  };

  const statusPill = getStatusPill();

  return (
    <div
      className={`w-full relative bg-[#0a0d14]/70 rounded-xl border border-white/5 p-3 sm:p-4 overflow-hidden text-xs font-mono ${className}`}
    >
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide uppercase flex items-center gap-2">
              <span>Multiples von {companyName || ticker}</span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                Empirischer Bewertungsvergleich
              </span>
            </h3>
          </div>
        </div>

        {/* Assessment Status Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-sm ${statusPill.bg}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusPill.dot}`} />
            <span>{statusPill.text}</span>
          </div>
        </div>
      </div>

      {/* Controls Bar: Multiples Toggle Buttons & Timeframe */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-white/5 text-[10px]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleMetric('pe_adj')}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all ${
              activeMetrics.pe_adj
                ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 font-bold'
                : 'border-white/10 text-gray-500'
            }`}
          >
            <span className="w-2 h-2 rounded-sm bg-amber-400" />
            <span>KGV bereinigt</span>
          </button>

          <button
            type="button"
            onClick={() => toggleMetric('pe_rep')}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all ${
              activeMetrics.pe_rep
                ? 'border-slate-400/50 bg-slate-500/20 text-slate-200 font-bold'
                : 'border-white/10 text-gray-500'
            }`}
          >
            <span className="w-2 h-2 rounded-sm bg-slate-400" />
            <span>KGV bilanziert</span>
          </button>

          <button
            type="button"
            onClick={() => toggleMetric('pcf')}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all ${
              activeMetrics.pcf
                ? 'border-yellow-500/50 bg-yellow-500/20 text-yellow-300 font-bold'
                : 'border-white/10 text-gray-500'
            }`}
          >
            <span className="w-2 h-2 rounded-sm bg-yellow-400" />
            <span>KCV</span>
          </button>

          <button
            type="button"
            onClick={() => toggleMetric('ps')}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all ${
              activeMetrics.ps
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 font-bold'
                : 'border-white/10 text-gray-500'
            }`}
          >
            <span className="w-2 h-2 rounded-sm bg-emerald-400" />
            <span>KUV</span>
          </button>

          <button
            type="button"
            onClick={() => toggleMetric('ev_ebitda')}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all ${
              activeMetrics.ev_ebitda
                ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300 font-bold'
                : 'border-white/10 text-gray-500'
            }`}
          >
            <span className="w-2 h-2 rounded-sm bg-cyan-400" />
            <span>EV/EBITDA</span>
          </button>
        </div>

        {/* Timeframe Buttons */}
        <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10">
          {(['3J', '5J', '8J', '10J', '15J', 'MAX'] as MultiplesHistoryTimeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => handleTimeframeChange(tf)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                timeframe === tf
                  ? 'text-amber-300 bg-amber-500/20 border border-amber-500/30 shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Live Info Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/10 mb-3 text-[11px]">
        <div>
          <span className="text-[9px] text-gray-400 uppercase">Datum / Modus</span>
          <div className="font-bold text-white mt-0.5">{formatChartDate(currentPt?.date || '', 'short')}</div>
        </div>
        <div>
          <span className="text-[9px] text-amber-400 uppercase">KGV bereinigt</span>
          <div className="font-bold text-amber-300 mt-0.5">
            {currentPt?.pe_adj?.toFixed(1) || '--'}
            {peStats?.median ? <span className="text-[9px] text-gray-400 font-normal ml-1">({peStats.median.toFixed(1)} Median)</span> : null}
          </div>
        </div>
        <div>
          <span className="text-[9px] text-slate-400 uppercase">KGV bilanziert</span>
          <div className="font-bold text-slate-300 mt-0.5">
            {currentPt?.pe_rep?.toFixed(1) || '--'}
          </div>
        </div>
        <div>
          <span className="text-[9px] text-yellow-400 uppercase">KCV (Cashflow)</span>
          <div className="font-bold text-yellow-300 mt-0.5">{currentPt?.pcf?.toFixed(1) || '--'}</div>
        </div>
        <div>
          <span className="text-[9px] text-emerald-400 uppercase">KUV (Umsatz)</span>
          <div className="font-bold text-emerald-400 mt-0.5">{currentPt?.ps?.toFixed(1) || '--'}</div>
        </div>
        <div>
          <span className="text-[9px] text-gray-400 uppercase">Perzentil / Status</span>
          <div className={`font-bold mt-0.5 ${peDiffPct !== null && peDiffPct <= -5 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {peStats?.currentPercentile !== null && peStats?.currentPercentile !== undefined
              ? `${peStats.currentPercentile}% (${valuationStatus})`
              : peDiffPct !== null
              ? `${peDiffPct >= 0 ? '+' : ''}${peDiffPct.toFixed(1)}% vs Ø`
              : '--'}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            onMouseMove={(e) => {
              if (e && e.activePayload && e.activePayload.length > 0) {
                setActivePoint(e.activePayload[0].payload as MultiplesDataPoint);
              }
            }}
            onMouseLeave={() => setActivePoint(null)}
            margin={{ top: 15, right: 30, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => formatChartDate(d, 'short')}
              stroke="#64748B"
              fontSize={10}
              tickLine={false}
            />
            <YAxis stroke="#64748B" fontSize={10} tickLine={false} domain={[0, 'auto']} />

            {/* Shaded Forecast Region */}
            {splitIndex >= 0 && (
              <ReferenceArea
                x1={data[splitIndex]?.date}
                x2={data[data.length - 1]?.date}
                fill="rgba(245, 158, 11, 0.05)"
              />
            )}

            {/* Split Date Line */}
            {splitIndex >= 0 && (
              <ReferenceLine
                x={data[splitIndex]?.date}
                stroke="rgba(245, 158, 11, 0.6)"
                strokeDasharray="3 3"
                label={{ value: 'Prognose ➔', fill: '#F59E0B', fontSize: 10, position: 'insideTopLeft' }}
              />
            )}

            {/* Statistical Median / Average Lines */}
            {activeMetrics.pe_adj && peMedian && (
              <ReferenceLine
                y={peMedian}
                stroke="#F59E0B"
                strokeDasharray="3 3"
                label={{ value: `Median KGV: ${peMedian.toFixed(1)}`, fill: '#F59E0B', fontSize: 9, position: 'right' }}
              />
            )}
            {activeMetrics.pe_rep && (statistics?.pe_rep?.median || averages?.pe_rep) && (
              <ReferenceLine
                y={statistics?.pe_rep?.median || averages?.pe_rep}
                stroke="#94A3B8"
                strokeDasharray="3 3"
                label={{
                  value: `Median KGV bil.: ${(statistics?.pe_rep?.median || averages?.pe_rep)?.toFixed(1)}`,
                  fill: '#94A3B8',
                  fontSize: 9,
                  position: 'right',
                }}
              />
            )}
            {activeMetrics.pcf && (statistics?.pcf?.median || averages?.pcf) && (
              <ReferenceLine
                y={statistics?.pcf?.median || averages?.pcf}
                stroke="#EAB308"
                strokeDasharray="3 3"
                label={{
                  value: `Median KCV: ${(statistics?.pcf?.median || averages?.pcf)?.toFixed(1)}`,
                  fill: '#EAB308',
                  fontSize: 9,
                  position: 'right',
                }}
              />
            )}
            {activeMetrics.ps && (statistics?.ps?.median || averages?.ps) && (
              <ReferenceLine
                y={statistics?.ps?.median || averages?.ps}
                stroke="#10B981"
                strokeDasharray="3 3"
                label={{
                  value: `Median KUV: ${(statistics?.ps?.median || averages?.ps)?.toFixed(1)}`,
                  fill: '#10B981',
                  fontSize: 9,
                  position: 'right',
                }}
              />
            )}
            {activeMetrics.ev_ebitda && statistics?.ev_ebitda?.median && (
              <ReferenceLine
                y={statistics.ev_ebitda.median}
                stroke="#06B6D4"
                strokeDasharray="3 3"
                label={{
                  value: `Median EV/EBITDA: ${statistics.ev_ebitda.median.toFixed(1)}`,
                  fill: '#06B6D4',
                  fontSize: 9,
                  position: 'right',
                }}
              />
            )}

            {/* Multiple Curves */}
            {activeMetrics.pe_adj && (
              <Line
                type="monotone"
                dataKey="pe_adj"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
                name="KGV bereinigt"
              />
            )}
            {activeMetrics.pe_rep && (
              <Line
                type="monotone"
                dataKey="pe_rep"
                stroke="#94A3B8"
                strokeWidth={1.5}
                dot={false}
                name="KGV bilanziert"
              />
            )}
            {activeMetrics.pcf && (
              <Line
                type="monotone"
                dataKey="pcf"
                stroke="#EAB308"
                strokeWidth={2}
                dot={false}
                name="KCV"
              />
            )}
            {activeMetrics.ps && (
              <Line
                type="monotone"
                dataKey="ps"
                stroke="#10B981"
                strokeWidth={2}
                dot={false}
                name="KUV"
              />
            )}
            {activeMetrics.ev_ebitda && (
              <Line
                type="monotone"
                dataKey="ev_ebitda"
                stroke="#06B6D4"
                strokeWidth={1.5}
                dot={false}
                name="EV/EBITDA"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MultiplesChart;

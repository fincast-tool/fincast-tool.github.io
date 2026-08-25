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
  CartesianGrid
} from 'recharts';
import { MultiplesChartProps, MultiplesDataPoint, MultiplesHistoryTimeframe } from '../types/valuation-chart';
import { formatChartDate } from '../utils/valuationChartData';

export const MultiplesChart: React.FC<MultiplesChartProps> = ({
  ticker,
  companyName,
  splitDate,
  data,
  averages,
  height = 300,
  className = '',
  isDarkMode = true,
  selectedTimeframe = '10J',
  onTimeframeSelect,
  onMetricToggle
}) => {
  const [activeMetrics, setActiveMetrics] = useState({
    pe_adj: true,
    pe_rep: true,
    pcf: true,
    ps: true
  });
  const [timeframe, setTimeframe] = useState<MultiplesHistoryTimeframe>(selectedTimeframe);
  const [activePoint, setActivePoint] = useState<MultiplesDataPoint | null>(null);

  const toggleMetric = (key: keyof typeof activeMetrics) => {
    setActiveMetrics(prev => {
      const next = { ...prev, [key]: !prev[key] };
      if (onMetricToggle) onMetricToggle(key);
      return next;
    });
  };

  const handleTimeframeChange = (tf: MultiplesHistoryTimeframe) => {
    setTimeframe(tf);
    if (onTimeframeSelect) onTimeframeSelect(tf);
  };

  const splitIndex = useMemo(() => data.findIndex(d => d.date === splitDate), [data, splitDate]);
  const splitPoint = data[splitIndex] || data[0];

  // Current display point (either hovered point or Stichtag)
  const currentPt = activePoint || splitPoint || data[data.length - 1];

  const peDiffPct = useMemo(() => {
    if (!averages?.pe_adj || !currentPt?.pe_adj) return null;
    return ((currentPt.pe_adj - averages.pe_adj) / averages.pe_adj) * 100;
  }, [averages, currentPt]);

  return (
    <div className={`w-full relative bg-[#0a0d14]/70 rounded-xl border border-white/5 p-3 sm:p-4 overflow-hidden text-xs font-mono ${className}`}>
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wide uppercase flex items-center gap-2">
              <span>Multiples von {companyName || ticker}</span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                Historischer Bewertungsvergleich
              </span>
            </h3>
          </div>
        </div>

        {/* Assessment Status Badge */}
        <div className="flex items-center gap-2">
          <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-mono font-bold flex items-center gap-1.5 shadow-sm ${
            peDiffPct !== null && peDiffPct <= -5
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : peDiffPct !== null && peDiffPct >= 5
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${
              peDiffPct !== null && peDiffPct <= -5
                ? 'bg-emerald-400'
                : peDiffPct !== null && peDiffPct >= 5
                ? 'bg-rose-400'
                : 'bg-amber-400'
            }`} />
            <span>
              {peDiffPct !== null && peDiffPct <= -5
                ? `Historischer Abschlag (${peDiffPct.toFixed(1)}%)`
                : peDiffPct !== null && peDiffPct >= 5
                ? `Bewertungsprämie (+${peDiffPct.toFixed(1)}%)`
                : `Faire Bewertung (${peDiffPct !== null && peDiffPct >= 0 ? '+' : ''}${peDiffPct?.toFixed(1) || '0.0'}%)`}
            </span>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
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
            onClick={() => toggleMetric('pe_rep')}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded border transition-all ${
              activeMetrics.pe_rep
                ? 'border-slate-400/50 bg-slate-500/20 text-slate-200 font-bold'
                : 'border-white/10 text-gray-500'
            }`}
          >
            <span className="w-2 h-2 rounded-sm bg-slate-500" />
            <span>KGV bilanziert</span>
          </button>
        </div>

        {/* Timeframe Buttons */}
        <div className="flex items-center gap-1 bg-white/[0.04] p-0.5 rounded-lg border border-white/10">
          {(['3J', '5J', '8J', '10J', '15J', 'MAX'] as MultiplesHistoryTimeframe[]).map(tf => (
            <button
              key={tf}
              type="button"
              onClick={() => handleTimeframeChange(tf)}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                timeframe === tf
                  ? 'text-gold-300 bg-gold-500/20 border border-gold-500/30 shadow-sm'
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
          <div className="font-bold text-amber-300 mt-0.5">{currentPt?.pe_adj?.toFixed(1) || '--'}</div>
        </div>
        <div>
          <span className="text-[9px] text-slate-400 uppercase">KGV bilanziert</span>
          <div className="font-bold text-slate-300 mt-0.5">{currentPt?.pe_rep?.toFixed(1) || '--'}</div>
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
          <span className="text-[9px] text-gray-400 uppercase">Bewertung vs Ø</span>
          <div className={`font-bold mt-0.5 ${peDiffPct !== null && peDiffPct <= -5 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {peDiffPct !== null ? `${peDiffPct >= 0 ? '+' : ''}${peDiffPct.toFixed(1)}%` : '--'}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            onMouseMove={e => {
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
              tickFormatter={d => formatChartDate(d, 'short')}
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

            {/* Historical Average Lines */}
            {activeMetrics.pe_adj && averages?.pe_adj && (
              <ReferenceLine
                y={averages.pe_adj}
                stroke="#F59E0B"
                strokeDasharray="3 3"
                label={{ value: `Ø KGV: ${averages.pe_adj}`, fill: '#F59E0B', fontSize: 9, position: 'right' }}
              />
            )}
            {activeMetrics.pe_rep && averages?.pe_rep && (
              <ReferenceLine
                y={averages.pe_rep}
                stroke="#94A3B8"
                strokeDasharray="3 3"
                label={{ value: `Ø KGV bil.: ${averages.pe_rep}`, fill: '#94A3B8', fontSize: 9, position: 'right' }}
              />
            )}
            {activeMetrics.pcf && averages?.pcf && (
              <ReferenceLine
                y={averages.pcf}
                stroke="#EAB308"
                strokeDasharray="3 3"
                label={{ value: `Ø KCV: ${averages.pcf}`, fill: '#EAB308', fontSize: 9, position: 'right' }}
              />
            )}
            {activeMetrics.ps && averages?.ps && (
              <ReferenceLine
                y={averages.ps}
                stroke="#10B981"
                strokeDasharray="3 3"
                label={{ value: `Ø KUV: ${averages.ps}`, fill: '#10B981', fontSize: 9, position: 'right' }}
              />
            )}

            {/* Curves */}
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
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default MultiplesChart;

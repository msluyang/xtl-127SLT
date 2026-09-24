import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { TelescopeState } from '../types/telescope';
import { formatRA, formatDec } from '../services/astronomy';
import {
  Activity,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Download,
  ShieldCheck,
  Compass,
  Sliders,
  Sparkles,
  Info,
  TrendingDown,
  Layers,
} from 'lucide-react';

export interface TrackingDataPoint {
  time: string;
  timeSec: number;
  raError: number; // in arcseconds (")
  decError: number; // in arcseconds (")
  rmsError: number; // sqrt(ra^2 + dec^2)
  upperTolerance: number;
  lowerTolerance: number;
}

interface TrackingPrecisionChartProps {
  state: TelescopeState;
  nightMode: boolean;
  title?: string;
  className?: string;
  compact?: boolean;
}

export const TrackingPrecisionChart: React.FC<TrackingPrecisionChartProps> = ({
  state,
  nightMode,
  title = '望远镜赤经/赤纬实时追踪精度偏差图 (Tracking Precision)',
  className = '',
  compact = false,
}) => {
  // Time window: 30s, 60s, 120s, 300s
  const [timeWindowSec, setTimeWindowSec] = useState<number>(60);
  const [isLive, setIsLive] = useState<boolean>(true);
  const [selectedAxis, setSelectedAxis] = useState<'all' | 'ra' | 'dec'>('all');
  const [toleranceArcsec, setToleranceArcsec] = useState<number>(2.5); // safe threshold in arcsec

  // Reference anchor coordinate for tracking deviation
  const anchorRef = useRef<{ ra: number; dec: number }>({
    ra: state.ra,
    dec: state.dec,
  });

  // Keep track of data buffer
  const [dataPoints, setDataPoints] = useState<TrackingDataPoint[]>([]);
  const startTimeRef = useRef<number>(Date.now());
  const tickCountRef = useRef<number>(0);

  // When target changes or tracking starts, reset anchor to target
  useEffect(() => {
    if (state.targetName) {
      anchorRef.current = { ra: state.ra, dec: state.dec };
    }
  }, [state.targetName]);

  // Seed initial realistic baseline history so the chart looks vibrant immediately
  useEffect(() => {
    const initial: TrackingDataPoint[] = [];
    const now = Date.now();
    const count = 30;

    for (let i = count; i >= 1; i--) {
      const pastMs = now - i * 1000;
      const tSec = (count - i);
      const d = new Date(pastMs);
      const timeStr = d.toTimeString().slice(3, 8); // "MM:SS"

      // Celestron 127SLT worm gear periodic error + seeing jitter
      // Gear cycle ~ 480 seconds, amplitude ~ 1.5 arcsec + random jitter +/-0.4"
      const periodicRa = 1.2 * Math.sin((tSec * 2 * Math.PI) / 120) + (Math.random() - 0.5) * 0.7;
      const periodicDec = 0.8 * Math.cos((tSec * 2 * Math.PI) / 90) + (Math.random() - 0.5) * 0.5;
      const rms = Math.round(Math.sqrt(periodicRa * periodicRa + periodicDec * periodicDec) * 100) / 100;

      initial.push({
        time: timeStr,
        timeSec: tSec,
        raError: Math.round(periodicRa * 100) / 100,
        decError: Math.round(periodicDec * 100) / 100,
        rmsError: rms,
        upperTolerance: toleranceArcsec,
        lowerTolerance: -toleranceArcsec,
      });
    }
    setDataPoints(initial);
  }, []);

  // Real-time tracking tick loop (every 1 second)
  useEffect(() => {
    if (!isLive) return;

    const interval = setInterval(() => {
      tickCountRef.current += 1;
      const tSec = tickCountRef.current;
      const now = new Date();
      const timeStr = now.toTimeString().slice(3, 8); // "MM:SS"

      // Real delta from anchor (if mount moved) + mount gear micro-drift
      const decRad = (state.dec * Math.PI) / 180;
      const cosDec = Math.cos(decRad);

      // RA hour difference converted to arcseconds: 1h RA = 15 deg = 54,000 arcsec
      const raDiffHours = state.ra - anchorRef.current.ra;
      const rawRaError = raDiffHours * 15 * 3600 * (Math.abs(cosDec) > 0.05 ? cosDec : 0.05);

      // Dec degree difference converted to arcseconds: 1 deg = 3600 arcsec
      const decDiffDeg = state.dec - anchorRef.current.dec;
      const rawDecError = decDiffDeg * 3600;

      // Celestron Alt-Az mount periodic simulation component
      const waveRa = 1.35 * Math.sin((tSec * 2 * Math.PI) / 120) + (Math.random() - 0.5) * 0.65;
      const waveDec = 0.95 * Math.cos((tSec * 2 * Math.PI) / 95) + (Math.random() - 0.5) * 0.55;

      // If user is actively slewing, show large displacement; if tracking, show sub-arcsecond precision
      let computedRa = state.isSlewing ? (rawRaError % 10) : waveRa;
      let computedDec = state.isSlewing ? (rawDecError % 10) : waveDec;

      // Keep within realistic display bounds for tracking analysis
      computedRa = Math.max(-15, Math.min(15, computedRa));
      computedDec = Math.max(-15, Math.min(15, computedDec));

      const rms = Math.round(Math.sqrt(computedRa * computedRa + computedDec * computedDec) * 100) / 100;

      const newPoint: TrackingDataPoint = {
        time: timeStr,
        timeSec: tSec,
        raError: Math.round(computedRa * 100) / 100,
        decError: Math.round(computedDec * 100) / 100,
        rmsError: rms,
        upperTolerance: toleranceArcsec,
        lowerTolerance: -toleranceArcsec,
      };

      setDataPoints((prev) => {
        const updated = [...prev, newPoint];
        // Retain max points according to time window + buffer
        const maxPoints = Math.max(timeWindowSec + 10, 60);
        if (updated.length > maxPoints) {
          return updated.slice(updated.length - maxPoints);
        }
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLive, state.ra, state.dec, state.isSlewing, toleranceArcsec, timeWindowSec]);

  // Statistical calculations
  const stats = useMemo(() => {
    if (dataPoints.length === 0) {
      return {
        currentRms: 0,
        currentRa: 0,
        currentDec: 0,
        maxError: 0,
        meanRms: 0,
        withinTolerancePct: 100,
        driftRate: 0,
      };
    }

    const latest = dataPoints[dataPoints.length - 1];
    let maxE = 0;
    let sumRms = 0;
    let insideCount = 0;

    dataPoints.forEach((p) => {
      const e = Math.max(Math.abs(p.raError), Math.abs(p.decError));
      if (e > maxE) maxE = e;
      sumRms += p.rmsError;
      if (p.rmsError <= toleranceArcsec) insideCount += 1;
    });

    const mean = sumRms / dataPoints.length;
    const pct = Math.round((insideCount / dataPoints.length) * 100);

    // Estimate drift rate ("/min)
    const firstPoint = dataPoints[0];
    const dtMin = Math.max(0.1, (latest.timeSec - firstPoint.timeSec) / 60);
    const drift = Math.abs(latest.rmsError - firstPoint.rmsError) / dtMin;

    return {
      currentRms: latest.rmsError,
      currentRa: latest.raError,
      currentDec: latest.decError,
      maxError: Math.round(maxE * 100) / 100,
      meanRms: Math.round(mean * 100) / 100,
      withinTolerancePct: pct,
      driftRate: Math.round(drift * 10) / 10,
    };
  }, [dataPoints, toleranceArcsec]);

  // Reset tracking anchor to current telescope position
  const handleResetAnchor = () => {
    anchorRef.current = { ra: state.ra, dec: state.dec };
    setDataPoints([]);
  };

  // Export CSV of tracking points
  const handleExportCSV = () => {
    if (dataPoints.length === 0) return;
    const header = 'Timestamp,TimeSec,DeltaRA_arcsec,DeltaDec_arcsec,RMS_arcsec\n';
    const rows = dataPoints
      .map((p) => `${p.time},${p.timeSec},${p.raError},${p.decError},${p.rmsError}`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `celestron_127slt_tracking_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as TrackingDataPoint;
      return (
        <div
          className={`p-3 rounded-xl shadow-2xl border text-xs font-mono z-50 ${
            nightMode
              ? 'bg-neutral-950/95 border-red-900 text-red-200'
              : 'bg-slate-900/95 border-slate-700 text-slate-100 backdrop-blur-md'
          }`}
        >
          <div className="font-bold border-b border-slate-800 pb-1.5 mb-2 flex items-center justify-between gap-4">
            <span className="text-slate-400">时间: {data.time}</span>
            <span className="text-purple-400">
              总 RMS: <strong className="text-white">{data.rmsError.toFixed(2)}"</strong>
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4 text-cyan-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                赤经偏差 (ΔRA):
              </span>
              <strong className="font-bold">{data.raError >= 0 ? `+${data.raError.toFixed(2)}"` : `${data.raError.toFixed(2)}"`}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 text-amber-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                赤纬偏差 (ΔDec):
              </span>
              <strong className="font-bold">{data.decError >= 0 ? `+${data.decError.toFixed(2)}"` : `${data.decError.toFixed(2)}"`}</strong>
            </div>
          </div>
          <div className="mt-2 pt-1.5 border-t border-slate-800/80 text-[10px] text-slate-500">
            基准指向: RA {formatRA(state.ra)} / Dec {formatDec(state.dec)}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div
      className={`rounded-2xl border transition-all ${
        nightMode
          ? 'bg-neutral-900/90 border-red-950/80 text-red-200'
          : 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
      } ${className}`}
    >
      {/* Header bar */}
      <div className="p-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className={`p-2 rounded-xl border ${
              nightMode
                ? 'bg-red-950/60 border-red-800/60 text-red-400'
                : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
            }`}
          >
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight flex items-center gap-2">
              {title}
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                  isLive
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                    : 'bg-yellow-950 text-yellow-300 border-yellow-800'
                }`}
              >
                {isLive ? '● 实时追踪解算' : '⏸ 暂停采样'}
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              星特朗 127SLT 恒星速跟踪微步偏差与机械齿轮周期性误差分析（角秒级 arcsec "）
            </p>
          </div>
        </div>

        {/* Action buttons strip */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Axis toggle */}
          <div className="flex items-center bg-slate-950/80 rounded-lg p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => setSelectedAxis('all')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                selectedAxis === 'all'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              双轴 (RA+Dec)
            </button>
            <button
              onClick={() => setSelectedAxis('ra')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                selectedAxis === 'ra'
                  ? 'bg-cyan-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              仅赤经 (RA)
            </button>
            <button
              onClick={() => setSelectedAxis('dec')}
              className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                selectedAxis === 'dec'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              仅赤纬 (Dec)
            </button>
          </div>

          {/* Time window selector */}
          <select
            value={timeWindowSec}
            onChange={(e) => setTimeWindowSec(parseInt(e.target.value))}
            className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs font-mono cursor-pointer"
          >
            <option value={30}>近 30 秒</option>
            <option value={60}>近 60 秒</option>
            <option value={120}>近 2 分钟</option>
            <option value={300}>近 5 分钟</option>
          </select>

          {/* Live Pause/Play */}
          <button
            onClick={() => setIsLive(!isLive)}
            className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors cursor-pointer ${
              isLive
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-emerald-600 border-emerald-500 text-white'
            }`}
            title={isLive ? '暂停采样' : '恢复采样'}
          >
            {isLive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          </button>

          {/* Reset Anchor */}
          <button
            onClick={handleResetAnchor}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200 hover:border-slate-700 cursor-pointer"
            title="重置当前指向为追踪基准零点"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="p-1.5 rounded-lg border border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200 hover:border-slate-700 cursor-pointer"
            title="导出追踪精度 CSV 数据"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Real-time stats HUD row */}
      <div className="p-4 bg-slate-950/40 grid grid-cols-2 sm:grid-cols-5 gap-3 border-b border-slate-800/60 font-mono text-xs">
        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-500 text-[10px] block">实时综合 RMS 偏差</span>
          <span
            className={`text-base font-bold ${
              stats.currentRms <= toleranceArcsec ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            {stats.currentRms.toFixed(2)}"
          </span>
          <span className="text-[9px] text-slate-500 block">目标 ≤ {toleranceArcsec}"</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-500 text-[10px] block">赤经偏差 (ΔRA)</span>
          <span className="text-cyan-400 font-bold text-sm">
            {stats.currentRa >= 0 ? `+${stats.currentRa.toFixed(2)}"` : `${stats.currentRa?.toFixed(2)}"`}
          </span>
          <span className="text-[9px] text-cyan-600 block">方位轴传动</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-500 text-[10px] block">赤纬偏差 (ΔDec)</span>
          <span className="text-amber-400 font-bold text-sm">
            {stats.currentDec >= 0 ? `+${stats.currentDec.toFixed(2)}"` : `${stats.currentDec?.toFixed(2)}"`}
          </span>
          <span className="text-[9px] text-amber-600 block">高度轴俯仰</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-500 text-[10px] block">窗口峰值最大误差</span>
          <span className="text-slate-200 font-bold text-sm">{stats.maxError.toFixed(2)}"</span>
          <span className="text-[9px] text-slate-500 block">平均 {stats.meanRms.toFixed(2)}"</span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 col-span-2 sm:col-span-1">
          <span className="text-slate-500 text-[10px] block">良星率 (≤{toleranceArcsec}")</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`font-bold text-sm ${
                stats.withinTolerancePct >= 85 ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {stats.withinTolerancePct}%
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">
              {stats.withinTolerancePct >= 90 ? '极佳 (A+)' : '良好 (B)'}
            </span>
          </div>
          <span className="text-[9px] text-slate-500 block">微漂 {stats.driftRate}"/分</span>
        </div>
      </div>

      {/* Main Recharts Container */}
      <div className={`p-4 ${compact ? 'h-64' : 'h-80'} w-full`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={dataPoints}
            margin={{ top: 10, right: 15, left: -10, bottom: 5 }}
          >
            <defs>
              <linearGradient id="rmsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              strokeDasharray="3 3"
              stroke={nightMode ? '#3b0d0d' : '#1e293b'}
              vertical={false}
            />

            <XAxis
              dataKey="time"
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#64748b' }}
              tickLine={{ stroke: '#334155' }}
            />

            <YAxis
              domain={[-4, 4]}
              stroke="#64748b"
              tick={{ fontSize: 10, fill: '#64748b' }}
              tickLine={{ stroke: '#334155' }}
              tickFormatter={(val) => `${val}"`}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend
              verticalAlign="top"
              height={28}
              wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }}
            />

            {/* Zero Baseline */}
            <ReferenceLine
              y={0}
              stroke="#475569"
              strokeWidth={1.5}
            />

            {/* Safe Tolerance Threshold Guides */}
            <ReferenceLine
              y={toleranceArcsec}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{
                value: `+${toleranceArcsec}" 导星容差线`,
                fill: '#10b981',
                fontSize: 9,
                position: 'insideTopRight',
              }}
            />
            <ReferenceLine
              y={-toleranceArcsec}
              stroke="#10b981"
              strokeDasharray="4 4"
              label={{
                value: `-${toleranceArcsec}"`,
                fill: '#10b981',
                fontSize: 9,
                position: 'insideBottomRight',
              }}
            />

            {/* RMS Area (Only shown in 'all' view) */}
            {selectedAxis === 'all' && (
              <Area
                type="monotone"
                dataKey="rmsError"
                name="综合 RMS 偏差"
                stroke="#a855f7"
                fillOpacity={1}
                fill="url(#rmsGradient)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            )}

            {/* RA Error Curve (Cyan) */}
            {(selectedAxis === 'all' || selectedAxis === 'ra') && (
              <Line
                type="monotone"
                dataKey="raError"
                name="赤经偏差 ΔRA (角秒)"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}

            {/* Dec Error Curve (Amber) */}
            {(selectedAxis === 'all' || selectedAxis === 'dec') && (
              <Line
                type="monotone"
                dataKey="decError"
                name="赤纬偏差 ΔDec (角秒)"
                stroke="#fbbf24"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Chart Footer Guide */}
      <div className="p-3 bg-slate-950/60 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 font-mono">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-cyan-400 rounded-full"></span>
            赤经 (RA) 偏差
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-1 bg-amber-400 rounded-full"></span>
            赤纬 (Dec) 偏差
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-purple-500/40 border border-purple-400"></span>
            综合 RMS 偏差
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span>容差阈值:</span>
          <input
            type="range"
            min="1.0"
            max="6.0"
            step="0.5"
            value={toleranceArcsec}
            onChange={(e) => setToleranceArcsec(parseFloat(e.target.value))}
            className="w-20 accent-emerald-400 cursor-pointer"
          />
          <span className="text-emerald-300 font-bold">±{toleranceArcsec.toFixed(1)}"</span>
        </div>
      </div>
    </div>
  );
};

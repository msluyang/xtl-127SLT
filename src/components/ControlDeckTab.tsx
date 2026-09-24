import React, { useState, useEffect, useCallback } from 'react';
import {
  TelescopeState,
  ObserverLocation,
  TrackingMode,
  TrackingRate,
} from '../types/telescope';
import {
  formatRA,
  formatDec,
  formatAltAz,
  TELESCOPE_SPECS,
  equatorialToHorizontal,
  horizontalToEquatorial,
} from '../services/astronomy';
import { telescopeBridge } from '../services/celestronProtocol';
import { TrackingPrecisionChart } from './TrackingPrecisionChart';
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  RotateCcw,
  Compass,
  AlertOctagon,
  Radar,
  Radio,
  Sliders,
  Settings,
  Flame,
  Activity,
  Maximize2,
  Keyboard,
  Target,
  Crosshair,
  Sparkles,
  Gauge,
  Zap,
} from 'lucide-react';

interface ControlDeckTabProps {
  state: TelescopeState;
  nightMode: boolean;
  location: ObserverLocation;
}

type MotionMode = 'continuous' | 'step';
type AxisCoordinateSystem = 'equatorial' | 'altaz';

interface StepSizeOption {
  id: string;
  label: string;
  sublabel: string;
  degrees: number;
}

const STEP_SIZES: StepSizeOption[] = [
  { id: '1s', label: '1" (1角秒)', sublabel: '极高倍微调', degrees: 1 / 3600 },
  { id: '10s', label: '10" (10角秒)', sublabel: '目镜中心对齐', degrees: 10 / 3600 },
  { id: '1m', label: '1\' (1角分)', sublabel: '寻星镜校准', degrees: 1 / 60 },
  { id: '5m', label: '5\' (5角分)', sublabel: '视场内位移', degrees: 5 / 60 },
  { id: '30m', label: '30\' (0.5度)', sublabel: '满月视直径', degrees: 0.5 },
  { id: '1d', label: '1° (1度)', sublabel: '大步长大天区', degrees: 1.0 },
];

export const ControlDeckTab: React.FC<ControlDeckTabProps> = ({
  state,
  nightMode,
  location,
}) => {
  // Motion settings
  const [axisSystem, setAxisSystem] = useState<AxisCoordinateSystem>('equatorial');
  const [motionMode, setMotionMode] = useState<MotionMode>('continuous');
  const [selectedStepIndex, setSelectedStepIndex] = useState(2); // default 1'
  const [activeDirection, setActiveDirection] = useState<string | null>(null);
  const [lastNudgeMessage, setLastNudgeMessage] = useState<string | null>(null);

  // Manual coordinate input states
  const [manualCoordType, setManualCoordType] = useState<'radec' | 'altaz'>('radec');
  const [manualRaH, setManualRaH] = useState('05');
  const [manualRaM, setManualRaM] = useState('35');
  const [manualRaS, setManualRaS] = useState('17');
  const [manualDecSign, setManualDecSign] = useState<'+' | '-'>('-');
  const [manualDecD, setManualDecD] = useState('05');
  const [manualDecM, setManualDecM] = useState('23');

  const [manualAlt, setManualAlt] = useState('45.0');
  const [manualAz, setManualAz] = useState('180.0');

  // Slew rates 1-9 definition
  const SLEW_RATES = [
    { rate: 1, label: '1: 0.5x', desc: '极慢精密导星' },
    { rate: 2, label: '2: 1x', desc: '恒星速对中' },
    { rate: 3, label: '3: 4x', desc: '视野内慢速巡星' },
    { rate: 4, label: '4: 8x', desc: '中速寻星' },
    { rate: 5, label: '5: 32x', desc: '快速寻星' },
    { rate: 6, label: '6: 64x', desc: '高速 (0.25°/s)' },
    { rate: 7, label: '7: 0.5°/s', desc: '极速区域调转' },
    { rate: 8, label: '8: 2.0°/s', desc: '快速跨星座' },
    { rate: 9, label: '9: 4.0°/s', desc: '全天球极速回转' },
  ];

  const currentStep = STEP_SIZES[selectedStepIndex];

  // Precision single-step pulse for RA / Dec or Alt / Az
  const handleStepNudge = (axis: 'dec' | 'ra' | 'alt' | 'az', direction: '+' | '-') => {
    telescopeBridge.precisionNudge(axis, direction, currentStep.degrees);

    let axisLabel = '';
    if (axis === 'dec') axisLabel = `赤纬 Dec ${direction === '+' ? '北向 (+)' : '南向 (-)'}`;
    else if (axis === 'ra') axisLabel = `赤经 RA ${direction === '+' ? '向东 (+)' : '向西 (-)'}`;
    else if (axis === 'alt') axisLabel = `仰角 Alt ${direction === '+' ? '向上 (+)' : '向下 (-)'}`;
    else if (axis === 'az') axisLabel = `方位 Az ${direction === '+' ? '顺时针 (+)' : '逆时针 (-)'}`;

    setLastNudgeMessage(`已精确脉冲移动: ${axisLabel} ${currentStep.label}`);
  };

  // Continuous Slew start
  const handleStartContinuous = (dir: 'N' | 'S' | 'E' | 'W') => {
    setActiveDirection(dir);
    telescopeBridge.manualSlew(dir, state.slewRate);
  };

  // Continuous Slew stop
  const handleStopContinuous = (axis: 'alt' | 'az') => {
    setActiveDirection(null);
    telescopeBridge.manualSlew(axis === 'alt' ? 'STOP_N_S' : 'STOP_E_W');
  };

  // Handle Unified Direction Action (Step vs Continuous)
  const handleDirectionPress = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    if (motionMode === 'step') {
      if (axisSystem === 'equatorial') {
        if (dir === 'UP') handleStepNudge('dec', '+');
        if (dir === 'DOWN') handleStepNudge('dec', '-');
        if (dir === 'LEFT') handleStepNudge('ra', '-');
        if (dir === 'RIGHT') handleStepNudge('ra', '+');
      } else {
        if (dir === 'UP') handleStepNudge('alt', '+');
        if (dir === 'DOWN') handleStepNudge('alt', '-');
        if (dir === 'LEFT') handleStepNudge('az', '-');
        if (dir === 'RIGHT') handleStepNudge('az', '+');
      }
    } else {
      // Continuous mode
      if (dir === 'UP') handleStartContinuous('N');
      if (dir === 'DOWN') handleStartContinuous('S');
      if (dir === 'LEFT') handleStartContinuous('W');
      if (dir === 'RIGHT') handleStartContinuous('E');
    }
  };

  const handleDirectionRelease = (dir: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT') => {
    if (motionMode === 'continuous') {
      if (dir === 'UP' || dir === 'DOWN') handleStopContinuous('alt');
      if (dir === 'LEFT' || dir === 'RIGHT') handleStopContinuous('az');
    }
  };

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid firing if typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        handleDirectionPress('UP');
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        handleDirectionPress('DOWN');
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleDirectionPress('LEFT');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        handleDirectionPress('RIGHT');
      } else if (e.key === ' ') {
        e.preventDefault();
        telescopeBridge.abortSlew();
      } else if (e.key >= '1' && e.key <= '9') {
        telescopeBridge.setSlewRate(parseInt(e.key));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      if (motionMode === 'continuous') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          handleStopContinuous('alt');
        }
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A' || e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
          handleStopContinuous('az');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [motionMode, axisSystem, currentStep]);

  // GoTo custom coordinates form
  const handleManualGoTo = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCoordType === 'radec') {
      const h = parseFloat(manualRaH) || 0;
      const m = parseFloat(manualRaM) || 0;
      const s = parseFloat(manualRaS) || 0;
      const raHours = h + m / 60 + s / 3600;

      const d = parseFloat(manualDecD) || 0;
      const dm = parseFloat(manualDecM) || 0;
      const decSign = manualDecSign === '-' ? -1 : 1;
      const decDeg = decSign * (d + dm / 60);

      telescopeBridge.goToTarget('指定赤道坐标', raHours, decDeg);
    } else {
      const alt = parseFloat(manualAlt) || 0;
      const az = parseFloat(manualAz) || 0;
      telescopeBridge.goToAltAz(az, alt, '指定地平坐标');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Top High-Precision Coordinate Display HUD */}
      <div
        className={`rounded-2xl p-6 border shadow-2xl ${
          nightMode
            ? 'bg-neutral-950 border-red-900/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>星特朗 127SLT 精密光轴指向监控台</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  NexStar+ 遥测直通
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                实时解算高精度赤经 (RA)、赤纬 (Dec) 及当地地平高度方位
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span
              className={`px-3 py-1 rounded-xl border font-bold ${
                state.isSlewing
                  ? 'bg-amber-950 border-amber-600 text-amber-300 animate-pulse'
                  : state.isSpiralSearching
                  ? 'bg-purple-950 border-purple-600 text-purple-300 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {state.isSlewing
                ? `回转中 (${state.slewProgress}%)`
                : state.isSpiralSearching
                ? '螺旋寻星中...'
                : '定点跟踪中 (Tracking)'}
            </span>

            <button
              onClick={() => {
                telescopeBridge.abortSlew();
              }}
              className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-colors flex items-center gap-1 shadow"
              title="紧急刹车，切断电机驱动"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              <span>急停</span>
            </button>
          </div>
        </div>

        {/* Big Digital Coordinate Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* RA Card */}
          <div className="p-4 rounded-xl bg-black/70 border border-slate-800 relative overflow-hidden group">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold text-cyan-300">赤经 (Right Ascension)</span>
              <span className="font-mono text-[10px] text-slate-500">时分秒</span>
            </div>
            <div
              className={`text-2xl sm:text-3xl font-mono font-bold tracking-wider ${
                nightMode ? 'text-red-400' : 'text-cyan-400'
              }`}
            >
              {formatRA(state.ra)}
            </div>
            <div className="text-[11px] text-slate-400 mt-2 font-mono flex items-center justify-between">
              <span>角度: {(state.ra * 15).toFixed(4)}°</span>
              <span className="text-slate-500">J2000.0</span>
            </div>
          </div>

          {/* Dec Card */}
          <div className="p-4 rounded-xl bg-black/70 border border-slate-800 relative overflow-hidden group">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold text-cyan-300">赤纬 (Declination)</span>
              <span className="font-mono text-[10px] text-slate-500">度分秒</span>
            </div>
            <div
              className={`text-2xl sm:text-3xl font-mono font-bold tracking-wider ${
                nightMode ? 'text-red-400' : 'text-cyan-400'
              }`}
            >
              {formatDec(state.dec)}
            </div>
            <div className="text-[11px] text-slate-400 mt-2 font-mono flex items-center justify-between">
              <span>极向: {state.dec >= 0 ? '北天区 (+)' : '南天区 (-)'}</span>
              <span className="text-slate-500">{state.dec.toFixed(4)}°</span>
            </div>
          </div>

          {/* Altitude Card */}
          <div className="p-4 rounded-xl bg-black/70 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold text-emerald-400">高度仰角 (Altitude)</span>
              <span className="font-mono text-[10px] text-slate-500">地平系</span>
            </div>
            <div
              className={`text-2xl sm:text-3xl font-mono font-bold tracking-wider ${
                nightMode ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {state.alt.toFixed(2)}°
            </div>
            <div className="text-[11px] text-slate-400 mt-2 font-mono flex items-center justify-between">
              <span>
                {state.alt >= 30
                  ? '🌟 优秀仰角 (>30°)'
                  : state.alt >= 15
                  ? '良好视场'
                  : '⚠️ 低空消光严重'}
              </span>
              <span className="text-slate-500">天顶距 {(90 - state.alt).toFixed(1)}°</span>
            </div>
          </div>

          {/* Azimuth Card */}
          <div className="p-4 rounded-xl bg-black/70 border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-semibold text-emerald-400">地平方位角 (Azimuth)</span>
              <span className="font-mono text-[10px] text-slate-500">360°罗盘</span>
            </div>
            <div
              className={`text-2xl sm:text-3xl font-mono font-bold tracking-wider ${
                nightMode ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {state.az.toFixed(2)}°
            </div>
            <div className="text-[11px] text-slate-400 mt-2 font-mono flex items-center justify-between">
              <span>{formatAltAz(state.alt, state.az).split('|')[1]?.trim()}</span>
              <span className="text-slate-500">正北为0°</span>
            </div>
          </div>
        </div>

        {/* Target Delta HUD (if targeted) */}
        {state.targetName && state.targetRa !== null && state.targetDec !== null && (
          <div className="mt-4 p-3 rounded-xl bg-slate-950/80 border border-amber-800/60 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" />
              <span className="text-slate-300">当前锁定目标:</span>
              <span className="font-bold text-amber-300">{state.targetName}</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400">
              <span>
                目标赤经: <strong className="text-slate-200">{formatRA(state.targetRa).slice(0, 8)}</strong>
              </span>
              <span>
                目标赤纬: <strong className="text-slate-200">{formatDec(state.targetDec)}</strong>
              </span>
              <span>
                角偏差: <strong className="text-cyan-400">
                  {Math.hypot((state.ra - state.targetRa) * 15, state.dec - state.targetDec).toFixed(2)}°
                </strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Main Manual Slew & Step Controller Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Direction Pad, Axis Select, Mode Select */}
        <div
          className={`lg:col-span-7 rounded-2xl p-6 border shadow-2xl flex flex-col justify-between ${
            nightMode
              ? 'bg-neutral-950 border-red-900/60'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div>
            {/* Header with Mode Switches */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <Compass className={`w-5 h-5 ${nightMode ? 'text-red-400' : 'text-cyan-400'}`} />
                <h3 className="font-bold text-slate-100">赤经 / 赤纬 精密手动控制盘</h3>
              </div>

              {/* Axis Switcher (Equatorial RA/Dec vs Alt/Az) */}
              <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setAxisSystem('equatorial')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    axisSystem === 'equatorial'
                      ? nightMode
                        ? 'bg-red-700 text-white shadow'
                        : 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  赤道坐标轴 (RA / Dec)
                </button>
                <button
                  type="button"
                  onClick={() => setAxisSystem('altaz')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                    axisSystem === 'altaz'
                      ? nightMode
                        ? 'bg-red-700 text-white shadow'
                        : 'bg-cyan-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  地平坐标轴 (Alt / Az)
                </button>
              </div>
            </div>

            {/* Motion Paradigm Switcher: Continuous vs Step Nudge */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold text-slate-300">点动回转范式:</span>
                <div className="flex rounded-lg bg-slate-900 p-0.5 text-xs border border-slate-700">
                  <button
                    onClick={() => setMotionMode('continuous')}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                      motionMode === 'continuous'
                        ? 'bg-cyan-500 text-slate-950 shadow font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    长按连续回转 (Continuous)
                  </button>
                  <button
                    onClick={() => setMotionMode('step')}
                    className={`px-3 py-1 rounded-md font-semibold transition-colors ${
                      motionMode === 'step'
                        ? 'bg-cyan-500 text-slate-950 shadow font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    定步长精密微调 (Step Jog)
                  </button>
                </div>
              </div>

              {/* Step size selector if in Step mode */}
              {motionMode === 'step' && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-xs text-slate-400">单步脉冲:</span>
                  <div className="flex gap-1">
                    {STEP_SIZES.map((s, idx) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStepIndex(idx)}
                        className={`px-2 py-1 rounded-md text-[11px] font-mono font-bold transition-all border ${
                          selectedStepIndex === idx
                            ? 'bg-cyan-950 border-cyan-500 text-cyan-200'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                        title={s.sublabel}
                      >
                        {s.label.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Direction Pad Visual */}
            <div className="flex flex-col items-center justify-center my-4 select-none">
              <div className="relative w-72 h-72 flex items-center justify-center p-3 rounded-full bg-slate-950 border-2 border-slate-800 shadow-2xl">
                {/* Center Stop / Sync Button */}
                <button
                  onClick={() => telescopeBridge.abortSlew()}
                  className="w-20 h-20 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex flex-col items-center justify-center shadow-2xl active:scale-95 transition-all z-20 border-2 border-rose-400/40"
                  title="立即切断电机驱动，紧急刹车"
                >
                  <AlertOctagon className="w-6 h-6 mb-0.5" />
                  <span>紧急急停</span>
                  <span className="text-[9px] opacity-80 font-mono">[空格]</span>
                </button>

                {/* UP Button (Dec + / Alt +) */}
                <button
                  onMouseDown={() => handleDirectionPress('UP')}
                  onMouseUp={() => handleDirectionRelease('UP')}
                  onTouchStart={() => handleDirectionPress('UP')}
                  onTouchEnd={() => handleDirectionRelease('UP')}
                  className={`absolute top-2 w-20 h-16 rounded-t-2xl flex flex-col items-center justify-center border font-bold text-xs shadow-md transition-all active:scale-95 ${
                    activeDirection === 'N'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 scale-105'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title={axisSystem === 'equatorial' ? '赤纬增加 (Dec + / 北向)' : '仰角增加 (Alt +)'}
                >
                  <ArrowUp className="w-5 h-5" />
                  <span className="font-mono text-[11px]">
                    {axisSystem === 'equatorial' ? 'Dec +' : 'Alt +'}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    {axisSystem === 'equatorial' ? '赤纬向北' : '仰角向上'}
                  </span>
                </button>

                {/* DOWN Button (Dec - / Alt -) */}
                <button
                  onMouseDown={() => handleDirectionPress('DOWN')}
                  onMouseUp={() => handleDirectionRelease('DOWN')}
                  onTouchStart={() => handleDirectionPress('DOWN')}
                  onTouchEnd={() => handleDirectionRelease('DOWN')}
                  className={`absolute bottom-2 w-20 h-16 rounded-b-2xl flex flex-col items-center justify-center border font-bold text-xs shadow-md transition-all active:scale-95 ${
                    activeDirection === 'S'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 scale-105'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title={axisSystem === 'equatorial' ? '赤纬减少 (Dec - / 南向)' : '仰角减少 (Alt -)'}
                >
                  <span className="text-[9px] text-slate-400">
                    {axisSystem === 'equatorial' ? '赤纬向南' : '仰角向下'}
                  </span>
                  <span className="font-mono text-[11px]">
                    {axisSystem === 'equatorial' ? 'Dec -' : 'Alt -'}
                  </span>
                  <ArrowDown className="w-5 h-5" />
                </button>

                {/* LEFT Button (RA - / Az -) */}
                <button
                  onMouseDown={() => handleDirectionPress('LEFT')}
                  onMouseUp={() => handleDirectionRelease('LEFT')}
                  onTouchStart={() => handleDirectionPress('LEFT')}
                  onTouchEnd={() => handleDirectionRelease('LEFT')}
                  className={`absolute left-2 w-16 h-20 rounded-l-2xl flex flex-col items-center justify-center border font-bold text-xs shadow-md transition-all active:scale-95 ${
                    activeDirection === 'W'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 scale-105'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title={axisSystem === 'equatorial' ? '赤经减少 (RA - / 向西)' : '方位角逆时针 (Az -)'}
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span className="font-mono text-[11px]">
                    {axisSystem === 'equatorial' ? 'RA -' : 'Az -'}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    {axisSystem === 'equatorial' ? '向西' : '逆时针'}
                  </span>
                </button>

                {/* RIGHT Button (RA + / Az +) */}
                <button
                  onMouseDown={() => handleDirectionPress('RIGHT')}
                  onMouseUp={() => handleDirectionRelease('RIGHT')}
                  onTouchStart={() => handleDirectionPress('RIGHT')}
                  onTouchEnd={() => handleDirectionRelease('RIGHT')}
                  className={`absolute right-2 w-16 h-20 rounded-r-2xl flex flex-col items-center justify-center border font-bold text-xs shadow-md transition-all active:scale-95 ${
                    activeDirection === 'E'
                      ? 'bg-cyan-500 text-slate-950 border-cyan-400 scale-105'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title={axisSystem === 'equatorial' ? '赤经增加 (RA + / 向东)' : '方位角顺时针 (Az +)'}
                >
                  <ArrowRight className="w-5 h-5" />
                  <span className="font-mono text-[11px]">
                    {axisSystem === 'equatorial' ? 'RA +' : 'Az +'}
                  </span>
                  <span className="text-[9px] text-slate-400">
                    {axisSystem === 'equatorial' ? '向东' : '顺时针'}
                  </span>
                </button>
              </div>
            </div>

            {/* Nudge Notification / Hotkey Tips */}
            <div className="flex items-center justify-between text-xs text-slate-400 mt-2 px-2">
              <div className="flex items-center gap-1 text-[11px]">
                <Keyboard className="w-3.5 h-3.5 text-cyan-400" />
                <span>支持方向键 ↑ ↓ ← → 或 W A S D 键盘操作</span>
              </div>
              {lastNudgeMessage && (
                <div className="font-mono text-cyan-300 text-[11px] animate-fade-in">
                  {lastNudgeMessage}
                </div>
              )}
            </div>
          </div>

          {/* Slew Rate Selector (1-9) */}
          <div className="mt-5 pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300">
                星特朗 NexStar 9 档回转速率 (Slew Rate: {state.slewRate})
              </span>
              <span className="text-[11px] font-mono text-cyan-400">
                {SLEW_RATES[state.slewRate - 1]?.desc}
              </span>
            </div>

            <div className="grid grid-cols-9 gap-1.5">
              {SLEW_RATES.map((item) => (
                <button
                  key={item.rate}
                  onClick={() => telescopeBridge.setSlewRate(item.rate)}
                  className={`py-2 rounded-lg text-xs font-mono font-bold transition-all border ${
                    state.slewRate === item.rate
                      ? nightMode
                        ? 'bg-red-700 border-red-500 text-white shadow'
                        : 'bg-cyan-500 border-cyan-400 text-slate-950 shadow'
                      : 'bg-slate-800/80 hover:bg-slate-700 border-slate-700/60 text-slate-300'
                  }`}
                  title={`${item.label} - ${item.desc}`}
                >
                  {item.rate}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Tracking Engine & Manual Coordinates Input */}
        <div className="lg:col-span-5 space-y-6">
          {/* Tracking Engine Card */}
          <div
            className={`rounded-2xl p-6 border shadow-2xl ${
              nightMode
                ? 'bg-neutral-950 border-red-900/60'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-4">
              <RotateCcw className={`w-5 h-5 ${nightMode ? 'text-red-400' : 'text-cyan-400'}`} />
              <h3 className="font-bold text-slate-100">恒星时主动跟踪马达 (Tracking)</h3>
            </div>

            <div className="space-y-4 text-xs">
              {/* Tracking Mode */}
              <div>
                <label className="block font-semibold text-slate-400 mb-2">
                  经纬仪跟踪模式
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'alt_az', label: '地平双轴', desc: '127SLT标配' },
                    { id: 'eq_north', label: '赤道仪斜劈', desc: '北半球极轴' },
                    { id: 'off', label: '关闭电机', desc: '停止自转' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => telescopeBridge.setTrackingMode(m.id as TrackingMode)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        state.trackingMode === m.id
                          ? nightMode
                            ? 'bg-red-950 border-red-700 text-red-200 font-bold'
                            : 'bg-cyan-950 border-cyan-600 text-cyan-200 font-bold'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold">{m.label}</div>
                      <div className="text-[10px] opacity-60 font-normal">{m.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tracking Rate */}
              <div>
                <label className="block font-semibold text-slate-400 mb-2">
                  角速率设定
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'sidereal', label: '恒星速', desc: '15.041°/hr' },
                    { id: 'lunar', label: '月球速', desc: '14.685°/hr' },
                    { id: 'solar', label: '太阳速', desc: '15.000°/hr' },
                  ].map((r) => (
                    <button
                      key={r.id}
                      onClick={() => telescopeBridge.setTrackingRate(r.id as TrackingRate)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        state.trackingRate === r.id
                          ? nightMode
                            ? 'bg-red-950 border-red-700 text-red-200 font-bold'
                            : 'bg-cyan-950 border-cyan-600 text-cyan-200 font-bold'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-bold">{r.label}</div>
                      <div className="text-[10px] opacity-60 font-normal">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Special Features: Spiral Search & Sync */}
              <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2">
                <button
                  onClick={() => telescopeBridge.startSpiralSearch()}
                  className={`p-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                    state.isSpiralSearching
                      ? 'bg-purple-600 border-purple-400 text-white animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                  }`}
                  title="当目标不在狭窄目镜视场内时，自动以阿基米德螺旋向外扩展搜索"
                >
                  <Radar className="w-4 h-4" />
                  <span>{state.isSpiralSearching ? '停止螺旋' : '螺旋寻星'}</span>
                </button>

                <button
                  onClick={() => {
                    telescopeBridge.syncCurrentPosition(state.ra, state.dec);
                    alert(`已将 127SLT 编码器同步至当前光轴坐标`);
                  }}
                  className="p-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  title="望远镜已瞄准亮星时，同步校准编码器绝对基准点"
                >
                  <Crosshair className="w-4 h-4 text-cyan-400" />
                  <span>当前坐标同步 (Sync)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Direct Coordinate Input Card */}
          <div
            className={`rounded-2xl p-6 border shadow-2xl ${
              nightMode
                ? 'bg-neutral-950 border-red-900/60'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sliders className={`w-5 h-5 ${nightMode ? 'text-red-400' : 'text-cyan-400'}`} />
                <h3 className="font-bold text-slate-100">输入天球坐标直达回转</h3>
              </div>

              <div className="flex rounded-lg bg-slate-950 p-0.5 text-xs border border-slate-800">
                <button
                  type="button"
                  onClick={() => setManualCoordType('radec')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    manualCoordType === 'radec' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'
                  }`}
                >
                  赤道 RA/Dec
                </button>
                <button
                  type="button"
                  onClick={() => setManualCoordType('altaz')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                    manualCoordType === 'altaz' ? 'bg-cyan-500 text-slate-950 font-bold' : 'text-slate-400'
                  }`}
                >
                  地平 Alt/Az
                </button>
              </div>
            </div>

            <form onSubmit={handleManualGoTo} className="space-y-4 text-xs font-mono">
              {manualCoordType === 'radec' ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-sans font-semibold">
                      赤经 RA (00h ~ 23h 59m 59s)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="0"
                        max="23"
                        value={manualRaH}
                        onChange={(e) => setManualRaH(e.target.value)}
                        className="w-16 p-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-sm font-bold text-cyan-300"
                      />
                      <span>h</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={manualRaM}
                        onChange={(e) => setManualRaM(e.target.value)}
                        className="w-16 p-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-sm font-bold text-cyan-300"
                      />
                      <span>m</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={manualRaS}
                        onChange={(e) => setManualRaS(e.target.value)}
                        className="w-16 p-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-sm font-bold text-cyan-300"
                      />
                      <span>s</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-sans font-semibold">
                      赤纬 Dec (-90° ~ +90°)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <select
                        value={manualDecSign}
                        onChange={(e) => setManualDecSign(e.target.value as '+' | '-')}
                        className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-bold text-cyan-300"
                      >
                        <option value="+">+</option>
                        <option value="-">-</option>
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="90"
                        value={manualDecD}
                        onChange={(e) => setManualDecD(e.target.value)}
                        className="w-16 p-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-sm font-bold text-cyan-300"
                      />
                      <span>°</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={manualDecM}
                        onChange={(e) => setManualDecM(e.target.value)}
                        className="w-16 p-2 rounded-lg bg-slate-950 border border-slate-800 text-center text-sm font-bold text-cyan-300"
                      />
                      <span>'</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1 font-sans font-semibold">高度角 Alt (0° ~ 90°)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="90"
                      value={manualAlt}
                      onChange={(e) => setManualAlt(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm font-bold text-cyan-300"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-sans font-semibold">方位角 Az (0° ~ 360°)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="360"
                      value={manualAz}
                      onChange={(e) => setManualAz(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm font-bold text-cyan-300"
                    />
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={state.isSlewing}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs shadow-lg transition-all ${
                  state.isSlewing
                    ? 'bg-amber-600 text-white animate-pulse'
                    : nightMode
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                }`}
              >
                {state.isSlewing ? '回转中...' : '发送指令回转至该坐标 (GoTo)'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Real-time Tracking Precision Error Chart (Recharts) */}
      <div className="pt-2">
        <TrackingPrecisionChart
          state={state}
          nightMode={nightMode}
          title="望远镜赤经/赤纬实时追踪精度偏差图 (Recharts 实时解算)"
        />
      </div>
    </div>
  );
};

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TelescopeState,
  ObserverLocation,
  TimelapseConfig,
  TimelapseSessionState,
  CapturedFrame,
} from '../types/telescope';
import {
  timelapseController,
} from '../services/timelapseController';
import {
  telescopeBridge,
} from '../services/celestronProtocol';
import {
  formatRA,
  formatDec,
  formatAltAz,
  TELESCOPE_SPECS,
} from '../services/astronomy';
import {
  Camera,
  Play,
  Pause,
  Square,
  Sparkles,
  Sliders,
  Cpu,
  Clock,
  Film,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  ChevronRight,
  Download,
  RotateCcw,
  Maximize2,
  Gauge,
  Activity,
  HardDrive,
  Eye,
} from 'lucide-react';

interface TimelapseTabProps {
  state: TelescopeState;
  nightMode: boolean;
  location: ObserverLocation;
}

export const TimelapseTab: React.FC<TimelapseTabProps> = ({
  state,
  nightMode,
  location,
}) => {
  // Session state from controller
  const [session, setSession] = useState<TimelapseSessionState>(
    timelapseController.getState()
  );

  // Config parameters state
  const [config, setConfig] = useState<TimelapseConfig>(session.config);

  // Selected frame for detail inspection
  const [selectedFrame, setSelectedFrame] = useState<CapturedFrame | null>(
    session.capturedFrames[0] || null
  );

  // Timelapse playback simulation
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);
  const [playbackIndex, setPlaybackIndex] = useState(0);
  const [playbackFps, setPlaybackFps] = useState<number>(15);
  const playbackTimerRef = useRef<any>(null);

  // GPIO diagram modal toggle
  const [showGpioGuide, setShowGpioGuide] = useState(false);

  // Tracking link toggle (automatically keep 127SLT tracking while shooting)
  const [autoTracking, setAutoTracking] = useState(true);

  // Test shot flash animation state
  const [testShotActive, setTestShotActive] = useState(false);

  useEffect(() => {
    const unsub = timelapseController.subscribe((newState) => {
      setSession(newState);
      setConfig(newState.config);
      if (!selectedFrame && newState.capturedFrames.length > 0) {
        setSelectedFrame(newState.capturedFrames[0]);
      }
    });
    return unsub;
  }, [selectedFrame]);

  // Keep selected frame updated if list prepends new items
  useEffect(() => {
    if (session.capturedFrames.length > 0 && (!selectedFrame || selectedFrame.id.startsWith('test-'))) {
      setSelectedFrame(session.capturedFrames[0]);
    }
  }, [session.capturedFrames]);

  // Calculate field rotation rate based on current telescope Alt/Az
  const fieldRotationRate = useMemo(() => {
    const altRad = (state.alt * Math.PI) / 180;
    const azRad = (state.az * Math.PI) / 180;
    const latRad = (location.latitude * Math.PI) / 180;

    // Standard field rotation formula in alt-az mount:
    // d(theta)/dt = 15.041 * cos(az) * cos(lat) / cos(alt) (deg/hr)
    const cosAlt = Math.cos(altRad);
    if (Math.abs(cosAlt) < 0.05) return 99.9; // Near zenith
    const rate = 15.041 * (Math.cos(azRad) * Math.cos(latRad)) / cosAlt;
    return Math.abs(rate);
  }, [state.alt, state.az, location.latitude]);

  // Max recommended exposure for 127SLT (1500mm FL) without trailing on Alt-Az
  const recommendedMaxExposure = useMemo(() => {
    if (state.alt > 75) return 4; // Severe field rotation near zenith
    if (state.alt > 60) return 8;
    if (state.alt > 30) return 15;
    return 20; // Lower altitude, slower field rotation
  }, [state.alt]);

  // Sequence playback player loop
  useEffect(() => {
    if (isPlayingSequence && session.capturedFrames.length > 0) {
      playbackTimerRef.current = setInterval(() => {
        setPlaybackIndex((prev) => {
          const next = prev + 1;
          if (next >= session.capturedFrames.length) {
            return 0; // loop
          }
          return next;
        });
      }, 1000 / playbackFps);
    } else {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlayingSequence, session.capturedFrames.length, playbackFps]);

  // Update selected frame when playback runs
  useEffect(() => {
    if (isPlayingSequence && session.capturedFrames[playbackIndex]) {
      setSelectedFrame(session.capturedFrames[playbackIndex]);
    }
  }, [isPlayingSequence, playbackIndex, session.capturedFrames]);

  // Handle configuration changes
  const handleConfigChange = (patch: Partial<TimelapseConfig>) => {
    const updated = { ...config, ...patch };
    setConfig(updated);
    timelapseController.updateConfig(patch);
  };

  // Start shooting session
  const handleStart = () => {
    if (autoTracking && state.trackingMode === 'off') {
      telescopeBridge.setTrackingMode('alt_az');
      telescopeBridge.setTrackingRate('sidereal');
    }
    timelapseController.start(config);
  };

  // Trigger test shot
  const handleTestShot = () => {
    setTestShotActive(true);
    timelapseController.triggerTestShot(config.exposureSec);
    setTimeout(() => setTestShotActive(false), Math.min(config.exposureSec * 1000, 2000));
  };

  // Format time helpers
  const formatSecondsToClock = (totalSec: number) => {
    const s = Math.max(0, Math.floor(totalSec));
    const hours = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hours > 0) {
      return `${hours}时${mins.toString().padStart(2, '0')}分${secs.toString().padStart(2, '0')}秒`;
    }
    return `${mins}分${secs.toString().padStart(2, '0')}秒`;
  };

  // Calculated estimates
  const singleCycleTime = config.settlingDelaySec + config.exposureSec + config.intervalSec;
  const totalSessionTimeSec = singleCycleTime * config.totalFrames;
  const videoLengthSec = config.totalFrames > 0 ? (config.totalFrames / config.targetFps).toFixed(1) : '0';
  const estimatedStorageMb = (config.totalFrames * (config.saveRaw ? 28.5 : 4.2)).toFixed(0);

  // Status badge styling
  const getStatusBadge = () => {
    switch (session.status) {
      case 'exposing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            ⚡ 正在曝光 ({session.currentExposureCountdown}s)
          </span>
        );
      case 'settling':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
            <Activity className="w-3.5 h-3.5 animate-spin" />
            🧘 望远镜沉降防震 ({session.nextShutterCountdown}s)
          </span>
        );
      case 'waiting':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/40">
            <Clock className="w-3.5 h-3.5" />
            ⏳ 间隔冷却 ({session.nextShutterCountdown}s)
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
            <Play className="w-3.5 h-3.5" />
            ▶️ 序列执行中
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40">
            <Pause className="w-3.5 h-3.5" />
            ⏸️ 拍摄已暂停
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="w-3.5 h-3.5" />
            ✅ 延时序列拍摄完成
          </span>
        );
      case 'aborted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/40">
            <Square className="w-3.5 h-3.5" />
            ⏹️ 已中止
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            💤 待命中就绪
          </span>
        );
    }
  };

  const progressPercent = config.totalFrames > 0
    ? Math.min(100, Math.round((session.currentFrame / config.totalFrames) * 100))
    : 0;

  return (
    <div className="space-y-6 pb-20">
      {/* Top Banner & Active State */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          nightMode
            ? 'bg-neutral-900/90 border-red-950/80 text-red-200'
            : 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl border ${
                  nightMode
                    ? 'bg-red-950/60 border-red-800/60 text-red-400'
                    : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                }`}
              >
                <Camera className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
                  星特朗 127SLT 天文延时摄影与 GPIO 快门控制
                  {getStatusBadge()}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  通过树莓派物理 GPIO 引脚脉冲触发微单/单反快门线，全自动执行高精度天文延时拍摄序列
                </p>
              </div>
            </div>
          </div>

          {/* Quick Action Control Strip */}
          <div className="flex items-center flex-wrap gap-2.5 w-full lg:w-auto">
            {session.status === 'idle' || session.status === 'completed' || session.status === 'aborted' ? (
              <button
                onClick={handleStart}
                className="flex-1 lg:flex-none px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-transform active:scale-95 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                开始延时拍摄 ({config.totalFrames} 张)
              </button>
            ) : (
              <>
                {session.status === 'paused' ? (
                  <button
                    onClick={() => timelapseController.resume()}
                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" /> 恢复拍摄
                  </button>
                ) : (
                  <button
                    onClick={() => timelapseController.pause()}
                    className="px-4 py-2.5 rounded-xl bg-yellow-600 hover:bg-yellow-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pause className="w-3.5 h-3.5" /> 暂停拍摄
                  </button>
                )}
                <button
                  onClick={() => timelapseController.stop()}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5" /> 终止任务
                </button>
              </>
            )}

            <button
              onClick={handleTestShot}
              disabled={testShotActive || session.status === 'exposing'}
              className={`px-3.5 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                testShotActive
                  ? 'bg-amber-500 text-black border-amber-400 animate-pulse font-bold'
                  : nightMode
                  ? 'bg-red-950/40 border-red-800 text-red-300 hover:bg-red-900/50'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
              title="立即发送一次快门脉冲，验证树莓派GPIO与相机接线"
            >
              <Zap className={`w-3.5 h-3.5 ${testShotActive ? 'fill-current' : ''}`} />
              {testShotActive ? '快门释放中...' : '测试单张快门'}
            </button>

            <button
              onClick={() => setShowGpioGuide(!showGpioGuide)}
              className="px-3 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              GPIO电路图
            </button>
          </div>
        </div>

        {/* Live Progress Bar if active or completed */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-xs font-mono mb-1.5">
            <span className="text-slate-400 flex items-center gap-2">
              <span>当前进度:</span>
              <strong className="text-cyan-400 text-sm">{session.currentFrame}</strong>
              <span>/</span>
              <span>{config.totalFrames} 帧 ({progressPercent}%)</span>
            </span>
            <div className="flex items-center gap-4 text-slate-400">
              <span>已用时: <strong className="text-slate-200">{formatSecondsToClock(session.elapsedSec)}</strong></span>
              <span>剩余预估: <strong className="text-slate-200">{formatSecondsToClock(session.remainingSec)}</strong></span>
            </div>
          </div>
          <div className="w-full bg-slate-800/80 h-3 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                nightMode
                  ? 'bg-gradient-to-r from-red-600 to-amber-600'
                  : 'bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Main Grid: Parameters on Left, Realtime Film & Monitor on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Parameter & GPIO Hardware Settings (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Shooting Parameter Matrix */}
          <div
            className={`p-5 rounded-2xl border ${
              nightMode
                ? 'bg-neutral-900/90 border-red-950/80'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                延时摄影曝光与序列参数
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                127SLT 焦距 1500mm / F12
              </span>
            </div>

            <div className="space-y-4">
              {/* Parameter 1: Total Frames */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="font-semibold text-slate-300">计划拍摄张数 (Frames)</label>
                  <span className="font-mono text-cyan-400 font-bold">{config.totalFrames} 张</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="1000"
                  step="10"
                  value={config.totalFrames}
                  disabled={session.status === 'running' || session.status === 'exposing'}
                  onChange={(e) => handleConfigChange({ totalFrames: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 mt-2">
                  {[30, 60, 120, 240, 360, 500].map((num) => (
                    <button
                      key={num}
                      disabled={session.status === 'running' || session.status === 'exposing'}
                      onClick={() => handleConfigChange({ totalFrames: num })}
                      className={`flex-1 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        config.totalFrames === num
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Parameter 2: Single Exposure Time */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <label className="font-semibold text-slate-300">单张曝光时长 (Exposure)</label>
                    {config.exposureSec > recommendedMaxExposure && (
                      <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800 flex items-center gap-1">
                        <AlertTriangle className="w-2.5 h-2.5" /> 建议≤{recommendedMaxExposure}s防场旋
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-cyan-400 font-bold">{config.exposureSec} 秒</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="30"
                  step="0.5"
                  value={config.exposureSec}
                  disabled={session.status === 'running' || session.status === 'exposing'}
                  onChange={(e) => handleConfigChange({ exposureSec: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 mt-2">
                  {[1, 3, 5, 8, 12, 15, 20].map((sec) => (
                    <button
                      key={sec}
                      disabled={session.status === 'running' || session.status === 'exposing'}
                      onClick={() => handleConfigChange({ exposureSec: sec })}
                      className={`flex-1 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        config.exposureSec === sec
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Parameter 3: Interval Between Shots */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="font-semibold text-slate-300">拍摄间隔时间 (Interval)</label>
                  <span className="font-mono text-cyan-400 font-bold">{config.intervalSec} 秒</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={config.intervalSec}
                  disabled={session.status === 'running' || session.status === 'exposing'}
                  onChange={(e) => handleConfigChange({ intervalSec: parseInt(e.target.value) })}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="flex items-center gap-1.5 mt-2">
                  {[2, 5, 10, 15, 30].map((intv) => (
                    <button
                      key={intv}
                      disabled={session.status === 'running' || session.status === 'exposing'}
                      onClick={() => handleConfigChange({ intervalSec: intv })}
                      className={`flex-1 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        config.intervalSec === intv
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                          : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {intv}s
                    </button>
                  ))}
                </div>
              </div>

              {/* Parameter 4: Settling Delay */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label className="font-semibold text-slate-300">望远镜防抖沉降延迟 (Settling)</label>
                  <span className="font-mono text-cyan-400 font-bold">{config.settlingDelaySec} 秒</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.5"
                    value={config.settlingDelaySec}
                    disabled={session.status === 'running' || session.status === 'exposing'}
                    onChange={(e) => handleConfigChange({ settlingDelaySec: parseFloat(e.target.value) })}
                    className="flex-1 accent-cyan-400 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    消除经纬仪马达微震
                  </span>
                </div>
              </div>

              {/* Checkboxes: RAW format & Auto Sidereal Tracking */}
              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <label className="flex items-center justify-between text-xs cursor-pointer select-none">
                  <span className="text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                    自动联动 127SLT 恒星跟踪 (Sidereal Tracking)
                  </span>
                  <input
                    type="checkbox"
                    checked={autoTracking}
                    onChange={(e) => setAutoTracking(e.target.checked)}
                    className="accent-cyan-400 w-4 h-4 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between text-xs cursor-pointer select-none">
                  <span className="text-slate-300 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    保存 RAW 格式并生成深空天文元数据 (CR3/NEF/ARW)
                  </span>
                  <input
                    type="checkbox"
                    checked={config.saveRaw}
                    onChange={(e) => handleConfigChange({ saveRaw: e.target.checked })}
                    className="accent-cyan-400 w-4 h-4 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Calculations & Forecast Summary */}
            <div className="mt-5 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 grid grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <span className="text-slate-400 block text-[11px]">总拍摄耗时</span>
                <strong className="text-slate-200 text-sm">{formatSecondsToClock(totalSessionTimeSec)}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">生成延时时长 (@{config.targetFps}fps)</span>
                <strong className="text-cyan-400 text-sm">{videoLengthSec} 秒</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">单帧循环周期</span>
                <span className="text-slate-300">{singleCycleTime} 秒/张</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[11px]">预估存储容量</span>
                <span className="text-slate-300">{estimatedStorageMb} MB</span>
              </div>
            </div>
          </div>

          {/* Card 2: Raspberry Pi GPIO Hardware Pinout Settings */}
          <div
            className={`p-5 rounded-2xl border ${
              nightMode
                ? 'bg-neutral-900/90 border-red-950/80'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                树莓派 GPIO 硬件快门引脚
              </h3>
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <span
                  className={`w-2 h-2 rounded-full ${
                    session.status === 'exposing' || testShotActive
                      ? 'bg-emerald-400 animate-ping'
                      : 'bg-slate-600'
                  }`}
                ></span>
                <span className="text-slate-400">
                  {session.status === 'exposing' || testShotActive ? '快门闭合中 (LOW)' : '释放断开 (HIGH)'}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">快门引脚 (Shutter BCM)</label>
                  <select
                    value={config.gpioShutterPin}
                    disabled={session.status === 'running' || session.status === 'exposing'}
                    onChange={(e) => handleConfigChange({ gpioShutterPin: parseInt(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                  >
                    <option value={17}>GPIO 17 (Pin 11 - 推荐)</option>
                    <option value={22}>GPIO 22 (Pin 15)</option>
                    <option value={23}>GPIO 23 (Pin 16)</option>
                    <option value={24}>GPIO 24 (Pin 18)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">唤醒/对焦引脚 (Focus BCM)</label>
                  <select
                    value={config.gpioFocusPin}
                    disabled={session.status === 'running' || session.status === 'exposing'}
                    onChange={(e) => handleConfigChange({ gpioFocusPin: parseInt(e.target.value) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                  >
                    <option value={27}>GPIO 27 (Pin 13 - 推荐)</option>
                    <option value={25}>GPIO 25 (Pin 22)</option>
                    <option value={18}>GPIO 18 (Pin 12)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">触发有效电平</label>
                  <select
                    value={config.activeLevel}
                    disabled={session.status === 'running' || session.status === 'exposing'}
                    onChange={(e) => handleConfigChange({ activeLevel: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                  >
                    <option value="low">低电平有效 (光耦接地 - 推荐)</option>
                    <option value="high">高电平有效 (继电器模块)</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">隔离驱动硬件</label>
                  <select
                    value={config.triggerType}
                    disabled={session.status === 'running' || session.status === 'exposing'}
                    onChange={(e) => handleConfigChange({ triggerType: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono"
                  >
                    <option value="gpio_optocoupler">PC817 光电隔离芯片</option>
                    <option value="gpio_relay">5V 双路继电器模块</option>
                    <option value="usb_ptp">USB PTP (gphoto2 协议)</option>
                  </select>
                </div>
              </div>

              {/* Hardware tip */}
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                <span className="text-emerald-400 font-semibold block mb-0.5">💡 安全接线说明:</span>
                树莓派 GPIO 通过 PC817 光电隔离器连接单反相机快门线（Tip: 快门, Ring: 对焦, Sleeve: 地线），实现电气 100% 隔离，绝不损伤相机与主板。
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Monitor, Image Preview, Filmstrip & Analysis (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 3: 127SLT Field Rotation & Pointing HUD */}
          <div
            className={`p-4 rounded-2xl border ${
              nightMode
                ? 'bg-neutral-900/90 border-red-950/80'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-cyan-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  127SLT 望远镜当前指向与经纬仪场旋监视
                </h4>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-slate-400">场旋速率:</span>
                <span
                  className={`font-bold px-2 py-0.5 rounded ${
                    fieldRotationRate > 20
                      ? 'bg-rose-950 text-rose-300 border border-rose-800'
                      : fieldRotationRate > 10
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  }`}
                >
                  {fieldRotationRate.toFixed(1)}° / 小时
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">赤经 (R.A.)</span>
                <span className="text-cyan-300 font-bold">{formatRA(state.ra)}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">赤纬 (Dec.)</span>
                <span className="text-cyan-300 font-bold">{formatDec(state.dec)}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">地平仰角 (Alt)</span>
                <span className="text-emerald-300 font-bold">{state.alt.toFixed(2)}°</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-500 text-[10px] block">安全曝光上限</span>
                <span className="text-amber-300 font-bold">≤ {recommendedMaxExposure} 秒</span>
              </div>
            </div>
          </div>

          {/* Card 4: Frame Inspection & Simulated Starfield Monitor */}
          <div
            className={`p-5 rounded-2xl border ${
              nightMode
                ? 'bg-neutral-900/90 border-red-950/80'
                : 'bg-slate-900/80 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                <h4 className="font-bold text-sm">
                  {selectedFrame
                    ? `底片检视: ${selectedFrame.filename}`
                    : '底片监视器 (等待首帧曝光)'}
                </h4>
              </div>

              {/* Sequence Playback Controls */}
              {session.capturedFrames.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPlayingSequence(!isPlayingSequence)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isPlayingSequence
                        ? 'bg-amber-600 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {isPlayingSequence ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    {isPlayingSequence ? '暂停预览' : '播放延时序列'}
                  </button>
                  <select
                    value={playbackFps}
                    onChange={(e) => setPlaybackFps(parseInt(e.target.value))}
                    className="px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-300 text-xs font-mono"
                  >
                    <option value={10}>10 FPS</option>
                    <option value={15}>15 FPS</option>
                    <option value={24}>24 FPS</option>
                    <option value={30}>30 FPS</option>
                  </select>
                </div>
              )}
            </div>

            {/* Astronomical Sensor Viewport (Canvas / Stylized Star Simulation) */}
            <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center group shadow-inner">
              {/* Deep space background stars */}
              <div className="absolute inset-0 bg-radial from-slate-900/60 to-black">
                {/* Simulated Nebula & Star cluster */}
                <div
                  className="absolute inset-0 opacity-40 mix-blend-screen transition-all duration-700"
                  style={{
                    background:
                      'radial-gradient(circle at 45% 45%, rgba(64, 180, 255, 0.35) 0%, rgba(180, 70, 255, 0.25) 30%, transparent 70%)',
                    filter: 'blur(24px)',
                  }}
                ></div>

                {/* Stars grid */}
                <svg className="w-full h-full absolute inset-0 pointer-events-none">
                  <defs>
                    <radialGradient id="starGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                      <stop offset="60%" stopColor="#7dd3fc" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
                    </radialGradient>
                  </defs>
                  {/* Generated stars proportional to selected frame's star count */}
                  {Array.from({ length: selectedFrame?.starCount ? Math.min(selectedFrame.starCount, 90) : 45 }).map((_, i) => {
                    const cx = ((i * 37 + (selectedFrame?.frameIndex || 1) * 7) % 94) + 3;
                    const cy = ((i * 53 + (selectedFrame?.frameIndex || 1) * 11) % 92) + 4;
                    const r = (i % 7 === 0 ? 3.5 : i % 3 === 0 ? 2.2 : 1.2);
                    return (
                      <circle
                        key={i}
                        cx={`${cx}%`}
                        cy={`${cy}%`}
                        r={r}
                        fill={i % 7 === 0 ? 'url(#starGlow)' : '#e2e8f0'}
                        opacity={0.7 + (i % 4) * 0.1}
                      />
                    );
                  })}
                </svg>

                {/* Crosshair Overlay */}
                <div className="absolute inset-0 pointer-events-none border border-cyan-500/20 m-6 rounded-lg flex items-center justify-center">
                  <div className="w-10 h-10 border border-cyan-500/40 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></div>
                  </div>
                  <div className="absolute top-0 bottom-0 w-px bg-cyan-500/20"></div>
                  <div className="absolute left-0 right-0 h-px bg-cyan-500/20"></div>
                </div>
              </div>

              {/* Shutter Pulse Flash on Exposure */}
              {(session.status === 'exposing' || testShotActive) && (
                <div className="absolute inset-0 bg-white/20 pointer-events-none animate-ping"></div>
              )}

              {/* Overlay HUD Badges */}
              <div className="absolute top-3 left-3 flex flex-wrap gap-2 text-[10px] font-mono">
                <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur border border-slate-700 text-slate-200">
                  {selectedFrame?.filename || 'STANDBY'}
                </span>
                <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur border border-slate-700 text-cyan-300">
                  曝光: {selectedFrame?.exposureSec || config.exposureSec}s
                </span>
                <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur border border-slate-700 text-emerald-300">
                  检测星点: {selectedFrame?.starCount || 160}颗
                </span>
                <span className="px-2 py-0.5 rounded bg-black/70 backdrop-blur border border-slate-700 text-amber-300">
                  FWHM: {selectedFrame?.fwhm || 2.1}" (极佳)
                </span>
              </div>

              <div className="absolute bottom-3 right-3 text-[10px] font-mono text-slate-400 bg-black/70 px-2 py-0.5 rounded border border-slate-800">
                Celestron 127SLT / 127mm Mak-Cass / FL 1500mm
              </div>
            </div>

            {/* Filmstrip of Captured Frames */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                  <Film className="w-3.5 h-3.5 text-cyan-400" />
                  已捕获底片胶卷 ({session.capturedFrames.length} 张)
                </span>
                <span className="text-[11px] text-slate-500">
                  点击任意一帧检视画质与星点
                </span>
              </div>

              <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
                {session.capturedFrames.map((frame, idx) => {
                  const isCurrent = selectedFrame?.id === frame.id;
                  return (
                    <button
                      key={frame.id}
                      onClick={() => {
                        setSelectedFrame(frame);
                        setIsPlayingSequence(false);
                      }}
                      className={`flex-none w-24 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-cyan-500/20 border-cyan-400 shadow-md shadow-cyan-950'
                          : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="aspect-video w-full rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-mono text-slate-400 mb-1.5">
                        #{frame.frameIndex}
                      </div>
                      <div className="text-[10px] font-mono text-slate-300 truncate">
                        {frame.timestamp}
                      </div>
                      <div className="text-[9px] font-mono text-cyan-400 flex items-center justify-between mt-0.5">
                        <span>{frame.exposureSec}s</span>
                        <span>{frame.fwhm}"</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GPIO Wiring & Circuit Reference Modal */}
      {showGpioGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 max-h-[85vh] overflow-y-auto space-y-5 ${
              nightMode
                ? 'bg-neutral-900 border-red-950 text-red-200'
                : 'bg-slate-900 border-slate-800 text-slate-100 shadow-2xl'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-base">树莓派 GPIO 控制单反/微单快门线硬件电路指南</h3>
              </div>
              <button
                onClick={() => setShowGpioGuide(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs leading-relaxed text-slate-300">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <h4 className="font-bold text-cyan-400 mb-1.5">🔌 相机快门接口定义 (2.5mm / 3.5mm TRS 插头)</h4>
                <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-slate-300">
                  <div className="p-2 rounded bg-slate-900 border border-slate-800">
                    <strong className="text-amber-400 block">Tip (尖端)</strong>
                    快门触发 (Shutter)
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800">
                    <strong className="text-blue-400 block">Ring (中间环)</strong>
                    预对焦/唤醒 (Focus)
                  </div>
                  <div className="p-2 rounded bg-slate-900 border border-slate-800">
                    <strong className="text-emerald-400 block">Sleeve (底套管)</strong>
                    公共地线 (GND)
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <h4 className="font-bold text-emerald-400">🛡️ PC817 双通道光耦电气隔离方案 (强烈推荐)</h4>
                <p>
                  为了绝对保护相机内部 CMOS/主板不被反向电压击穿，必须使用光耦芯片（如 PC817 / TLP281）：
                </p>
                <div className="font-mono text-[11px] bg-slate-900 p-3 rounded-lg border border-slate-800 text-cyan-300">
                  [树莓派 GPIO 17 (Pin 11)] ──(330Ω)──► [PC817 IN1 (+)]<br />
                  [树莓派 GND (Pin 9)] ────────────────► [PC817 IN1 (-)]<br />
                  <br />
                  [相机快门线 Tip] ────────────────────► [PC817 OUT1 (集电极 C)]<br />
                  [相机快门线 Sleeve (地)] ─────────────► [PC817 OUT1 (发射极 E)]
                </div>
                <p className="text-[11px] text-slate-400">
                  当树莓派输出 LOW (低电平) 触发时，光耦内部发光二极管点亮，光敏三极管导通，相当于机械按下相机快门按钮。
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <h4 className="font-bold text-amber-400 mb-1">⚡ 5V 双路继电器简易接法 (免焊接面包板方案)</h4>
                <p className="text-[11px] text-slate-300">
                  若手头有 Arduino/树莓派常用的 5V 继电器模块：将快门线 Tip 接入继电器常开端 (NO)，Sleeve 接入公共端 (COM)。树莓派 GPIO 控制继电器线圈吸合即可完成触发。
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setShowGpioGuide(false)}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer"
              >
                我已了解接线，返回控制台
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

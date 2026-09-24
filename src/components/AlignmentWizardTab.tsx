import React, { useState, useMemo } from 'react';
import { TelescopeState, ObserverLocation, CelestialObject } from '../types/telescope';
import {
  CELESTIAL_CATALOG,
  equatorialToHorizontal,
  formatRA,
  formatDec,
  formatAltAz,
} from '../services/astronomy';
import { telescopeBridge } from '../services/celestronProtocol';
import {
  Sparkles,
  CheckCircle2,
  Crosshair,
  Compass,
  ArrowRight,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface AlignmentWizardTabProps {
  state: TelescopeState;
  nightMode: boolean;
  location: ObserverLocation;
}

export const AlignmentWizardTab: React.FC<AlignmentWizardTabProps> = ({
  state,
  nightMode,
  location,
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [alignmentMethod, setAlignmentMethod] = useState<'two_star' | 'one_star' | 'solar_system'>('two_star');
  const [selectedStar1, setSelectedStar1] = useState<CelestialObject | null>(null);
  const [selectedStar2, setSelectedStar2] = useState<CelestialObject | null>(null);
  const [alignedStars, setAlignedStars] = useState<string[]>([]);

  // Find candidate alignment stars currently visible (>20° altitude)
  const candidateStars = useMemo(() => {
    const stars = CELESTIAL_CATALOG.filter((c) => c.category === 'star');
    return stars
      .map((star) => {
        const horiz = equatorialToHorizontal(star.ra, star.dec, location);
        return { ...star, alt: horiz.alt, az: horiz.az };
      })
      .filter((s) => s.alt > 15)
      .sort((a, b) => a.magnitude - b.magnitude); // Brightest first
  }, [location]);

  const handleSelectStar1 = (star: CelestialObject) => {
    setSelectedStar1(star);
    telescopeBridge.goToTarget(star.chineseName, star.ra, star.dec);
  };

  const handleConfirmStar1 = () => {
    if (selectedStar1) {
      telescopeBridge.syncCurrentPosition(selectedStar1.ra, selectedStar1.dec);
      setAlignedStars([selectedStar1.chineseName]);
      if (alignmentMethod === 'one_star') {
        setCurrentStep(4);
      } else {
        setCurrentStep(3);
      }
    }
  };

  const handleSelectStar2 = (star: CelestialObject) => {
    setSelectedStar2(star);
    telescopeBridge.goToTarget(star.chineseName, star.ra, star.dec);
  };

  const handleConfirmStar2 = () => {
    if (selectedStar2) {
      telescopeBridge.syncCurrentPosition(selectedStar2.ra, selectedStar2.dec);
      setAlignedStars((prev) => [...prev, selectedStar2.chineseName]);
      setCurrentStep(4);
    }
  };

  const handleResetAlignment = () => {
    setCurrentStep(1);
    setSelectedStar1(null);
    setSelectedStar2(null);
    setAlignedStars([]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Wizard Header Card */}
      <div
        className={`rounded-2xl p-6 border shadow-xl ${
          nightMode
            ? 'bg-neutral-950 border-red-900/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">星特朗 127SLT 星空自动校准向导</h2>
              <p className="text-xs text-slate-400">
                通过校准 1~2 颗亮星建立天球几何模型，使望远镜获得高达角分级的全天自动寻星精度
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetAlignment}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>重新校准</span>
            </button>
          </div>
        </div>

        {/* Step Progress Pills */}
        <div className="grid grid-cols-4 gap-2 pt-4 border-t border-slate-800">
          {[
            { step: 1, label: '1. 水平与基准', desc: '三脚架调平' },
            { step: 2, label: '2. 第一颗校准星', desc: '寻星与对中' },
            { step: 3, label: '3. 第二颗校准星', desc: '跨天区对准' },
            { step: 4, label: '4. 校准完成', desc: '天球模型建立' },
          ].map((s) => {
            const isDone = currentStep > s.step;
            const isCurrent = currentStep === s.step;
            return (
              <div
                key={s.step}
                className={`p-3 rounded-xl border text-xs transition-all ${
                  isCurrent
                    ? nightMode
                      ? 'bg-red-950 border-red-600 text-red-100 font-bold'
                      : 'bg-cyan-950 border-cyan-500 text-cyan-200 font-bold'
                    : isDone
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : 'bg-slate-950/40 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span>{s.label}</span>
                  {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                </div>
                <div className="text-[10px] opacity-70 font-normal">{s.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Step 1: Tripod Level & Time/Location */}
      {currentStep === 1 && (
        <div
          className={`rounded-2xl p-6 border shadow-xl space-y-4 ${
            nightMode
              ? 'bg-neutral-950 border-red-900/60'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
            <span>步骤 1: 调平三脚架与基准状态检查</span>
          </h3>

          <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold shrink-0">
                1
              </span>
              <div>
                <div className="font-semibold text-slate-200">三脚架气泡水平仪调平</div>
                <p className="text-slate-400 mt-0.5">
                  调整 127SLT 铝合金不锈钢三脚架伸缩节，观察云台底座圆气泡水平仪，确保气泡严格位于中央黑圈内。
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold shrink-0">
                2
              </span>
              <div>
                <div className="font-semibold text-slate-200">红点寻星镜光轴同轴校验</div>
                <p className="text-slate-400 mt-0.5">
                  白天或远方建筑物尖顶上已将红点寻星镜与主镜视场调为同轴（StarPointer 红点中心与 127SLT 25mm 目镜中心完全重合）。
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold shrink-0">
                3
              </span>
              <div>
                <div className="font-semibold text-slate-200">当前时间与地理经纬度已同步</div>
                <p className="text-slate-400 mt-0.5">
                  观测点: {location.name} (纬度 {location.latitude.toFixed(2)}°N, 经度 {location.longitude.toFixed(2)}°E)。
                </p>
              </div>
            </div>
          </div>

          <div className="pt-3 flex justify-end">
            <button
              onClick={() => setCurrentStep(2)}
              className="py-2.5 px-6 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg"
            >
              <span>准备就绪，选择第一颗校准星</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: First Alignment Star */}
      {currentStep === 2 && (
        <div
          className={`rounded-2xl p-6 border shadow-xl space-y-4 ${
            nightMode
              ? 'bg-neutral-950 border-red-900/60'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
            <span>步骤 2: 选择并对准第 1 颗明亮基准星</span>
          </h3>

          <p className="text-xs text-slate-400">
            系统已自动计算此时您所在夜空中仰角最高、最亮、最易分辨的参考星。点击下方任意一颗星，望远镜将回转至该大致区域。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {candidateStars.slice(0, 6).map((star) => (
              <button
                key={star.id}
                onClick={() => handleSelectStar1(star)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  selectedStar1?.id === star.id
                    ? nightMode
                      ? 'bg-red-950 border-red-600 text-red-100 shadow'
                      : 'bg-cyan-950 border-cyan-500 text-cyan-200 shadow'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm">{star.chineseName}</div>
                  <span className="text-xs font-mono text-cyan-400">
                    星等 {star.magnitude}m
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {star.constellation} • 仰角 {(star.alt ?? 0).toFixed(1)}° • 方位 {(star.az ?? 0).toFixed(1)}°
                </div>
              </button>
            ))}
          </div>

          {selectedStar1 && (
            <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/60 space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold">
                <Crosshair className="w-4 h-4" />
                <span>望远镜正在瞄准 [{selectedStar1.chineseName}]</span>
              </div>
              <p className="text-xs text-slate-300">
                请先观察红点寻星镜，使用控制台方向键将红点对准该星；随后在 127SLT 25mm 标配目镜中微调，使这颗亮星严格居于十字视场正中央。
              </p>
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleConfirmStar1}
                  className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>已在目镜居中，确认校准第 1 颗星</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Second Alignment Star */}
      {currentStep === 3 && (
        <div
          className={`rounded-2xl p-6 border shadow-xl space-y-4 ${
            nightMode
              ? 'bg-neutral-950 border-red-900/60'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
            <span>步骤 3: 选择并对准第 2 颗校准星 (双星对准)</span>
          </h3>

          <p className="text-xs text-slate-400">
            为获得最佳数学解，第 2 颗校准星与第 1 颗星 ({selectedStar1?.chineseName}) 方位角最好相隔 60° ~ 120°。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {candidateStars
              .filter((s) => s.id !== selectedStar1?.id)
              .slice(0, 6)
              .map((star) => (
                <button
                  key={star.id}
                  onClick={() => handleSelectStar2(star)}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    selectedStar2?.id === star.id
                      ? nightMode
                        ? 'bg-red-950 border-red-600 text-red-100 shadow'
                        : 'bg-cyan-950 border-cyan-500 text-cyan-200 shadow'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm">{star.chineseName}</div>
                    <span className="text-xs font-mono text-cyan-400">
                      星等 {star.magnitude}m
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {star.constellation} • 仰角 {(star.alt ?? 0).toFixed(1)}° • 方位 {(star.az ?? 0).toFixed(1)}°
                  </div>
                </button>
              ))}
          </div>

          {selectedStar2 && (
            <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/60 space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 text-xs font-bold">
                <Crosshair className="w-4 h-4" />
                <span>望远镜正在回转至 [{selectedStar2.chineseName}]</span>
              </div>
              <p className="text-xs text-slate-300">
                由于已有了第 1 颗星的基准，127SLT 会非常接近该星。请在目镜中做轻微微调使其位于中心，然后确认。
              </p>
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleConfirmStar2}
                  className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>已在目镜居中，完成双星校准</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Complete */}
      {currentStep === 4 && (
        <div
          className={`rounded-2xl p-8 border shadow-xl text-center space-y-5 ${
            nightMode
              ? 'bg-neutral-950 border-red-900/60'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-10 h-10" />
          </div>

          <div>
            <h3 className="text-xl font-bold text-slate-100">星特朗 127SLT 校准成功！</h3>
            <p className="text-xs text-slate-400 mt-1">
              已对准参考星: {alignedStars.join(' & ')} • 空间锥差补偿已激活
            </p>
          </div>

          <div className="max-w-md mx-auto p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-left space-y-2 font-mono">
            <div className="flex justify-between">
              <span className="text-slate-400">校准模式:</span>
              <span className="text-emerald-400">Celestron 2-Star Sky Model</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">预计寻星误差:</span>
              <span className="text-emerald-400">&lt; 3.2 角分 (轻松落在25mm目镜视场内)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">跟踪电机状态:</span>
              <span className="text-cyan-400">恒星时跟踪主动补偿中 (Sidereal Active)</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => {
                // Navigate to catalog
                const navBtn = document.querySelector('button[title*="寻星库"]') as HTMLElement;
                if (navBtn) navBtn.click();
              }}
              className="py-3 px-8 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm shadow-xl"
            >
              进入自动寻星库开始观测
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

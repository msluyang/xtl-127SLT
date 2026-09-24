import React, { useState, useMemo } from 'react';
import {
  TelescopeState,
  ObserverLocation,
  CelestialObject,
  CelestialCategory,
} from '../types/telescope';
import {
  getAllCelestialObjects,
  equatorialToHorizontal,
  formatAltAz,
  formatRA,
  formatDec,
  getVisibilityStatus,
  calculateEyepieceView,
} from '../services/astronomy';
import { telescopeBridge } from '../services/celestronProtocol';
import {
  Search,
  Navigation,
  Check,
  AlertTriangle,
  Sparkles,
  Compass,
  Filter,
  Eye,
  SlidersHorizontal,
} from 'lucide-react';

interface CatalogTabProps {
  state: TelescopeState;
  nightMode: boolean;
  location: ObserverLocation;
  onSelectTarget: (obj: CelestialObject) => void;
}

export const CatalogTab: React.FC<CatalogTabProps> = ({
  state,
  nightMode,
  location,
  onSelectTarget,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<CelestialCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [minAltitude, setMinAltitude] = useState<number>(0); // 0 = above horizon, 15 = good seeing
  const [sunWarningTarget, setSunWarningTarget] = useState<CelestialObject | null>(null);

  // Compute live objects with Alt/Az
  const allObjects = useMemo(() => {
    const list = getAllCelestialObjects();
    return list.map((obj) => {
      const horiz = equatorialToHorizontal(obj.ra, obj.dec, location);
      return {
        ...obj,
        alt: horiz.alt,
        az: horiz.az,
      };
    });
  }, [location, state.lastHeartbeat]);

  // Filtered objects
  const filteredObjects = useMemo(() => {
    return allObjects.filter((obj) => {
      // Category filter
      if (selectedCategory !== 'all' && obj.category !== selectedCategory) {
        return false;
      }
      // Altitude filter
      if (obj.alt < minAltitude) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = obj.name.toLowerCase().includes(q);
        const matchChinese = obj.chineseName.toLowerCase().includes(q);
        const matchConst = obj.constellation.toLowerCase().includes(q);
        const matchType = obj.type.toLowerCase().includes(q);
        return matchName || matchChinese || matchConst || matchType;
      }
      return true;
    });
  }, [allObjects, selectedCategory, minAltitude, searchQuery]);

  const handleGoTo = (obj: CelestialObject) => {
    if (obj.id === 'sun') {
      setSunWarningTarget(obj);
      return;
    }
    telescopeBridge.goToTarget(obj.chineseName, obj.ra, obj.dec);
    onSelectTarget(obj);
  };

  const confirmSunGoTo = () => {
    if (sunWarningTarget) {
      telescopeBridge.goToTarget(
        sunWarningTarget.chineseName,
        sunWarningTarget.ra,
        sunWarningTarget.dec
      );
      onSelectTarget(sunWarningTarget);
      setSunWarningTarget(null);
    }
  };

  const categories: { id: CelestialCategory | 'all'; label: string; icon: string }[] = [
    { id: 'all', label: '全部天体', icon: '🌌' },
    { id: 'solar_system', label: '太阳系天体', icon: '🪐' },
    { id: 'messier', label: '梅西耶深空', icon: '✨' },
    { id: 'star', label: '亮星与校准星', icon: '⭐' },
    { id: 'deep_sky', label: '热门深空星云', icon: '🔭' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Controls: Search Bar & Filters */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border shadow-xl ${
          nightMode
            ? 'bg-neutral-950 border-red-900/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索天体：输入名称、梅西耶编号 (如 M42, M31, 木星, 天狼星)..."
              className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none transition-colors ${
                nightMode
                  ? 'bg-neutral-900 border-red-900 text-red-200 focus:border-red-600'
                  : 'bg-slate-800/80 border-slate-700 text-slate-100 focus:border-cyan-500'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-200"
              >
                清除
              </button>
            )}
          </div>

          {/* Altitude Quick Filter */}
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-slate-400">仰角筛选:</span>
            <div className="flex items-center gap-1">
              {[
                { val: -90, label: '全天球' },
                { val: 0, label: '地平线上 (>0°)' },
                { val: 20, label: '优质仰角 (>20°)' },
              ].map((item) => (
                <button
                  key={item.val}
                  onClick={() => setMinAltitude(item.val)}
                  className={`px-2.5 py-1 rounded-lg border transition-all ${
                    minAltitude === item.val
                      ? nightMode
                        ? 'bg-red-900/50 border-red-700 text-red-200 font-bold'
                        : 'bg-cyan-950 border-cyan-600 text-cyan-300 font-bold'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? nightMode
                      ? 'bg-red-900/80 border border-red-700 text-red-100 font-bold shadow'
                      : 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 font-bold shadow'
                    : 'bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Target Count */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-400">
        <div>
          找到 <span className="font-bold text-cyan-400">{filteredObjects.length}</span> 个目标
          {minAltitude >= 0 && ' (已按当前地理位置过滤可见天体)'}
        </div>
        <div>Celestron 127SLT 马卡光学口径 127mm • 极限星等 13.0m</div>
      </div>

      {/* Target Grid Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredObjects.map((obj) => {
          const vis = getVisibilityStatus(obj.alt);
          const isTargeted =
            state.targetName === obj.chineseName ||
            state.targetName === obj.name;
          const isSlewingToThis = state.isSlewing && isTargeted;

          return (
            <div
              key={obj.id}
              className={`rounded-2xl p-5 border flex flex-col justify-between transition-all hover:shadow-2xl relative ${
                isSlewingToThis
                  ? 'border-amber-500/80 ring-2 ring-amber-500/40'
                  : nightMode
                  ? 'bg-neutral-950/90 border-red-900/40 hover:border-red-700'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* Header */}
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-bold text-base text-slate-100 tracking-tight">
                      {obj.chineseName}
                    </h3>
                    <div className="text-xs font-mono text-slate-400">
                      {obj.name} • {obj.constellation}
                    </div>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${vis.badgeClass}`}
                  >
                    {vis.label}
                  </span>
                </div>

                {/* Subtitle Details */}
                <div className="flex flex-wrap items-center gap-2 my-2 text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300">
                    星等: {obj.magnitude > 0 ? `+${obj.magnitude}` : obj.magnitude}m
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-300">
                    类型: {obj.type}
                  </span>
                  {obj.size && (
                    <span className="px-2 py-0.5 rounded bg-slate-800/80 text-slate-400">
                      视大小: {obj.size}
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className="text-xs text-slate-300/90 my-2.5 leading-relaxed line-clamp-3">
                  {obj.description}
                </p>

                {/* Eyepiece & Magnification Recommendation */}
                {obj.recommendedEyepiece && (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs mb-3">
                    <Eye className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span className="text-slate-400">推荐目镜:</span>
                    <span className="font-semibold text-cyan-300">
                      {obj.recommendedEyepiece === '25mm'
                        ? '25mm 广角目镜 (60倍，视场约 0.87°)'
                        : obj.recommendedEyepiece === '9mm'
                        ? '9mm 高倍目镜 (167倍，视场约 0.31°)'
                        : '2x 巴洛镜 + 9mm (333倍，极高倍极限)'}
                    </span>
                  </div>
                )}

                {/* Real-time Coordinates */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono my-2 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                  <div>
                    <div className="text-[10px] text-slate-500">赤经 RA / 赤纬 Dec</div>
                    <div className="text-slate-200">{formatRA(obj.ra)}</div>
                    <div className="text-slate-400">{formatDec(obj.dec)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500">实时仰角 Alt / 方位 Az</div>
                    <div className={`font-semibold ${obj.alt >= 20 ? 'text-emerald-400' : obj.alt >= 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                      仰角: {obj.alt.toFixed(1)}°
                    </div>
                    <div className="text-slate-300">方位: {obj.az.toFixed(1)}°</div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 mt-4 pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => handleGoTo(obj)}
                  disabled={state.isSlewing}
                  className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-md transition-all ${
                    isSlewingToThis
                      ? 'bg-amber-600 text-white animate-pulse'
                      : state.isSlewing
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : nightMode
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>
                    {isSlewingToThis ? '正在回转瞄准...' : '一键 GoTo 寻星'}
                  </span>
                </button>

                <button
                  onClick={() => {
                    telescopeBridge.syncCurrentPosition(obj.ra, obj.dec);
                    alert(`已将 127SLT 编码器坐标同步校准至：${obj.chineseName}`);
                  }}
                  className="py-2 px-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs transition-colors shrink-0"
                  title="望远镜目镜已对准该天体时，将编码器基准点对齐校准"
                >
                  同步 (Sync)
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filteredObjects.length === 0 && (
        <div className="py-16 text-center text-slate-400">
          <p className="text-sm">未找到符合条件的天体。</p>
          <p className="text-xs text-slate-500 mt-1">
            可尝试清除搜索关键词，或放宽仰角筛选条件（设置为“全天球”）。
          </p>
        </div>
      )}

      {/* Sun Observation Safety Warning Modal */}
      {sunWarningTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl p-6 bg-slate-900 border border-amber-500/60 text-slate-100 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400 mb-4">
              <AlertTriangle className="w-8 h-8 shrink-0" />
              <h3 className="text-lg font-bold">⚠️ 天文观测极高危险警告！</h3>
            </div>

            <p className="text-sm text-slate-200 leading-relaxed mb-4">
              您正准备将星特朗 127SLT 望远镜指向 <strong className="text-amber-300">太阳</strong>！
              <br />
              <span className="text-rose-400 font-bold block mt-2">
                绝不能在无专业滤镜的情况下直视太阳！127mm 马卡光学镜头会像放大镜一样在微秒级时间内永久烧毁人眼视网膜或相机传感器！
              </span>
            </p>

            <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200 mb-5">
              ✓ 请确认您已在 127SLT 望远镜主物镜前端牢固安装了专业
              <strong className="underline">巴德膜太阳滤镜 (Baader Solar Filter)</strong>！
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSunWarningTarget(null)}
                className="flex-1 py-2.5 px-4 rounded-xl border border-slate-700 hover:bg-slate-800 text-sm font-semibold"
              >
                取消寻星
              </button>
              <button
                onClick={confirmSunGoTo}
                className="flex-1 py-2.5 px-4 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold shadow-lg"
              >
                已安装巴德膜，继续
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

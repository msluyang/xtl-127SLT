import React, { useState, useEffect } from 'react';
import {
  Telescope,
  Radio,
  Wifi,
  WifiOff,
  Compass,
  Moon,
  Sun,
  AlertOctagon,
  Clock,
  MapPin,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import { TelescopeState, ObserverLocation } from '../types/telescope';
import { telescopeBridge } from '../services/celestronProtocol';
import { formatAltAz, formatRA, formatDec, getLST } from '../services/astronomy';

interface NavbarProps {
  state: TelescopeState;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  nightMode: boolean;
  setNightMode: React.Dispatch<React.SetStateAction<boolean>>;
  location: ObserverLocation;
  setLocation: (loc: ObserverLocation) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  state,
  activeTab,
  setActiveTab,
  nightMode,
  setNightMode,
  location,
  setLocation,
}) => {
  const [timeNow, setTimeNow] = useState(new Date());
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [tempLat, setTempLat] = useState(location.latitude.toString());
  const [tempLon, setTempLon] = useState(location.longitude.toString());
  const [tempName, setTempName] = useState(location.name);

  useEffect(() => {
    const timer = setInterval(() => setTimeNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const lst = getLST(timeNow, location.longitude);

  const handleSaveLocation = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(tempLat) || 39.9;
    const lon = parseFloat(tempLon) || 116.4;
    const newLoc: ObserverLocation = {
      name: tempName || '自定义观测点',
      latitude: Math.max(-90, Math.min(90, lat)),
      longitude: Math.max(-180, Math.min(180, lon)),
      elevation: 50,
    };
    setLocation(newLoc);
    telescopeBridge.setObserverLocation(newLoc);
    setShowLocationModal(false);
  };

  const handleAutoGPS = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setTempLat(pos.coords.latitude.toFixed(4));
          setTempLon(pos.coords.longitude.toFixed(4));
          setTempName('当前GPS定位点');
        },
        (err) => {
          alert('无法获取GPS定位: ' + err.message + '，请手动输入经纬度。');
        }
      );
    } else {
      alert('当前环境不支持GPS');
    }
  };

  const navItems = [
    { id: 'skymap', label: '交互式星图寻星', icon: '🌌' },
    { id: 'control', label: '赤经赤纬精密控制', icon: '🕹️' },
    { id: 'catalog', label: '深空天体库', icon: '🎯' },
    { id: 'radar', label: '半球雷达与目镜视场', icon: '🔭' },
    { id: 'alignment', label: '星空校准向导', icon: '🧭' },
    { id: 'raspberry_pi', label: '树莓派通信中枢', icon: '🍓' },
    { id: 'logs', label: '观测日志', icon: '📝' },
  ];

  return (
    <>
      <header
        className={`border-b transition-colors duration-200 sticky top-0 z-50 ${
          nightMode
            ? 'bg-neutral-950 border-red-950/80 text-red-300'
            : 'bg-slate-900/95 backdrop-blur border-slate-800 text-slate-100'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Brand & Model */}
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl flex items-center justify-center shadow-md ${
                nightMode ? 'bg-red-950/90 text-red-500 border border-red-800/40' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30'
              }`}
            >
              <Telescope className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold tracking-tight">星特朗 127SLT 寻星台</h1>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full border font-semibold ${
                    nightMode
                      ? 'bg-red-900/40 border-red-800 text-red-400'
                      : 'bg-cyan-950 border-cyan-800 text-cyan-300'
                  }`}
                >
                  树莓派 NexStar+
                </span>
              </div>
              <p className={`text-xs ${nightMode ? 'text-red-400/70' : 'text-slate-400'}`}>
                马克斯托夫-卡塞格林 127/1500mm f/11.8 • 自动寻星系统
              </p>
            </div>
          </div>

          {/* Real-time Telemetry Pills */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            {/* Connection Pill */}
            <button
              onClick={() => setActiveTab('raspberry_pi')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
                state.connected
                  ? nightMode
                    ? 'bg-red-950/60 border-red-800 text-red-300 hover:bg-red-900/40'
                    : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/40'
                  : 'bg-rose-950/60 border-rose-700/60 text-rose-300 hover:bg-rose-900/40'
              }`}
              title="点击配置树莓派与通信模式"
            >
              {state.connected ? (
                <Radio className="w-3.5 h-3.5 animate-pulse" />
              ) : (
                <WifiOff className="w-3.5 h-3.5" />
              )}
              <span>
                {state.mode === 'simulator'
                  ? '虚拟仿真器'
                  : state.mode === 'raspberry_pi_ws'
                  ? `树莓派 (${state.host})`
                  : '串口直连'}
              </span>
              {state.connected && (
                <span className="text-[10px] opacity-70">| {state.pingMs}ms</span>
              )}
            </button>

            {/* Mount Motion Status */}
            <div
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border ${
                state.isSlewing
                  ? 'bg-amber-950/60 border-amber-600/80 text-amber-300 animate-pulse'
                  : state.isSpiralSearching
                  ? 'bg-purple-950/60 border-purple-600/80 text-purple-300 animate-pulse'
                  : nightMode
                  ? 'bg-red-950/40 border-red-900/60 text-red-300'
                  : 'bg-slate-800/70 border-slate-700 text-slate-300'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>
                {state.isSlewing
                  ? `回转中 (${state.slewProgress}%)`
                  : state.isSpiralSearching
                  ? '螺旋寻星中...'
                  : state.trackingMode !== 'off'
                  ? '恒星跟踪中'
                  : '电机关机'}
              </span>
            </div>

            {/* LST Clock & Observer Location */}
            <button
              onClick={() => setShowLocationModal(true)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all ${
                nightMode
                  ? 'bg-red-950/30 border-red-900/50 text-red-300/90 hover:border-red-700'
                  : 'bg-slate-800/50 border-slate-700 hover:border-slate-500 text-slate-300'
              }`}
              title="点击修改地理经纬度"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>
                LST {formatRA(lst).slice(0, 8)}
              </span>
              <span className="opacity-40">|</span>
              <MapPin className="w-3.5 h-3.5" />
              <span className="max-w-[70px] truncate">{location.name}</span>
            </button>

            {/* Night Vision Mode Switch */}
            <button
              onClick={() => setNightMode((prev) => !prev)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border font-sans font-medium transition-all ${
                nightMode
                  ? 'bg-red-600 text-black border-red-500 font-bold shadow-lg shadow-red-950/50'
                  : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
              }`}
              title="野外天文暗夜红光模式：避免白光破坏人眼暗适应视紫红质"
            >
              <Flame className="w-3.5 h-3.5" />
              <span>{nightMode ? '暗夜红光 (已开启)' : '红光护眼'}</span>
            </button>

            {/* Emergency Abort Button */}
            {(state.isSlewing || state.isSpiralSearching) && (
              <button
                onClick={() => telescopeBridge.abortSlew()}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold animate-bounce shadow-lg shadow-rose-900/50"
                title="紧急刹车停止电机"
              >
                <AlertOctagon className="w-4 h-4" />
                <span>紧急停止</span>
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="max-w-7xl mx-auto px-4 overflow-x-auto no-scrollbar">
          <nav className="flex items-center gap-1 py-1.5 min-w-max">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? nightMode
                        ? 'bg-red-900/80 text-red-100 shadow border border-red-700 font-semibold'
                        : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm font-semibold'
                      : nightMode
                      ? 'text-red-400/80 hover:text-red-200 hover:bg-red-950/40'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Location Modal */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl ${
              nightMode
                ? 'bg-neutral-900 border-red-800 text-red-200'
                : 'bg-slate-900 border-slate-800 text-slate-100'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold">观测者地理坐标设置</h3>
              </div>
              <button
                onClick={() => setShowLocationModal(false)}
                className="p-1 rounded hover:bg-white/10 text-slate-400"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Celestron 127SLT 为地平式经纬仪 (Alt/Az)，精准将赤道坐标 (RA/Dec) 换算为电机仰角方位 (Alt/Az)
              必须依赖精确的当地经纬度。
            </p>

            <form onSubmit={handleSaveLocation} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  观测点名称
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none ${
                    nightMode
                      ? 'bg-neutral-800 border-red-900 text-red-200'
                      : 'bg-slate-800 border-slate-700 text-slate-100 focus:border-cyan-500'
                  }`}
                  placeholder="例如：北京野鸭湖暗夜保护区"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    纬度 Latitude (°N)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={tempLat}
                    onChange={(e) => setTempLat(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none ${
                      nightMode
                        ? 'bg-neutral-800 border-red-900 text-red-200'
                        : 'bg-slate-800 border-slate-700 text-slate-100 focus:border-cyan-500'
                    }`}
                  />
                  <span className="text-[10px] text-slate-500">北纬为正，南纬为负</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-slate-300">
                    经度 Longitude (°E)
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    value={tempLon}
                    onChange={(e) => setTempLon(e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none ${
                      nightMode
                        ? 'bg-neutral-800 border-red-900 text-red-200'
                        : 'bg-slate-800 border-slate-700 text-slate-100 focus:border-cyan-500'
                    }`}
                  />
                  <span className="text-[10px] text-slate-500">东经为正，西经为负</span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleAutoGPS}
                  className="flex-1 py-2 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium transition-colors"
                >
                  🌐 浏览器GPS自动获取
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-colors"
                >
                  保存并重新同步天球
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

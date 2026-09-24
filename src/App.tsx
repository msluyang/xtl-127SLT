import React, { useState, useEffect } from 'react';
import { TelescopeState, ObserverLocation, CelestialObject } from './types/telescope';
import { telescopeBridge } from './services/celestronProtocol';
import { Navbar } from './components/Navbar';
import { InteractiveSkyMap } from './components/InteractiveSkyMap';
import { CatalogTab } from './components/CatalogTab';
import { ControlDeckTab } from './components/ControlDeckTab';
import { SkyRadarView } from './components/SkyRadarView';
import { AlignmentWizardTab } from './components/AlignmentWizardTab';
import { RaspberryPiTab } from './components/RaspberryPiTab';
import { ObservationLogTab } from './components/ObservationLogTab';
import { formatRA, formatDec, formatAltAz, TELESCOPE_SPECS } from './services/astronomy';
import {
  Compass,
  AlertOctagon,
  Radio,
  Navigation,
  Sparkles,
  ShieldCheck,
  CheckCircle,
  Eye,
  Info,
} from 'lucide-react';

export default function App() {
  const [telescopeState, setTelescopeState] = useState<TelescopeState>(telescopeBridge.getState());
  const [activeTab, setActiveTab] = useState<string>('skymap');
  const [nightMode, setNightMode] = useState<boolean>(false);
  const [location, setLocation] = useState<ObserverLocation>(telescopeBridge.getObserverLocation());

  useEffect(() => {
    // Subscribe to Celestron telescope events & telemetry loop
    const unsubscribe = telescopeBridge.subscribe((state) => {
      setTelescopeState(state);
    });
    return () => unsubscribe();
  }, []);

  const handleSelectTarget = (obj: CelestialObject) => {
    // Target selected from Catalog, SkyMap or Radar
  };

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${
        nightMode
          ? 'bg-[#0a0202] text-red-300 selection:bg-red-950 selection:text-red-100'
          : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Top Navbar with live telemetry */}
      <Navbar
        state={telescopeState}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        nightMode={nightMode}
        setNightMode={setNightMode}
        location={location}
        setLocation={setLocation}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 pb-24 space-y-6">
        {/* Slewing Banner Notification if telescope is moving */}
        {telescopeState.isSlewing && (
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/40 text-amber-300 flex items-center justify-between shadow-xl animate-pulse">
            <div className="flex items-center gap-3">
              <Compass className="w-6 h-6 animate-spin" />
              <div>
                <div className="font-bold text-sm">
                  星特朗 127SLT 正在全速回转寻星中... ({telescopeState.slewProgress}%)
                </div>
                <div className="text-xs text-amber-200/80 mt-0.5">
                  目标天体: <span className="font-bold underline">{telescopeState.targetName || '指定坐标'}</span> |
                  当前指向 RA {formatRA(telescopeState.ra)} / Dec {formatDec(telescopeState.dec)}
                </div>
              </div>
            </div>

            <button
              onClick={() => telescopeBridge.abortSlew()}
              className="py-1.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow flex items-center gap-1.5 shrink-0"
            >
              <AlertOctagon className="w-4 h-4" />
              <span>紧急刹车 (ABORT)</span>
            </button>
          </div>
        )}

        {/* Tab 1: Interactive Planetarium Sky Map */}
        {activeTab === 'skymap' && (
          <InteractiveSkyMap
            state={telescopeState}
            nightMode={nightMode}
            location={location}
            onSelectTarget={handleSelectTarget}
          />
        )}

        {/* Tab 2: Precision Manual RA/Dec Control Deck */}
        {activeTab === 'control' && (
          <ControlDeckTab
            state={telescopeState}
            nightMode={nightMode}
            location={location}
          />
        )}

        {/* Tab 3: Sky Radar & Eyepiece FOV View */}
        {activeTab === 'radar' && (
          <SkyRadarView
            state={telescopeState}
            nightMode={nightMode}
            location={location}
            onSelectTarget={handleSelectTarget}
          />
        )}

        {/* Tab 4: Alignment Wizard */}
        {activeTab === 'alignment' && (
          <AlignmentWizardTab
            state={telescopeState}
            nightMode={nightMode}
            location={location}
          />
        )}

        {/* Tab 5: Raspberry Pi Bridge Setup & Python Daemon */}
        {activeTab === 'raspberry_pi' && (
          <RaspberryPiTab state={telescopeState} nightMode={nightMode} />
        )}

        {/* Tab 6: Observation Log */}
        {activeTab === 'logs' && (
          <ObservationLogTab state={telescopeState} nightMode={nightMode} />
        )}
      </main>

      {/* Persistent Bottom Telemetry Bar */}
      <footer
        className={`fixed bottom-0 left-0 right-0 z-40 border-t backdrop-blur-md transition-colors ${
          nightMode
            ? 'bg-neutral-950/95 border-red-950/80 text-red-300'
            : 'bg-slate-900/90 border-slate-800/80 text-slate-300'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  telescopeState.connected
                    ? 'bg-emerald-400 animate-ping'
                    : 'bg-rose-400'
                }`}
              ></span>
              <span className="font-bold text-slate-100">
                {telescopeState.mode === 'raspberry_pi_ws'
                  ? `树莓派已连接 (${telescopeState.host})`
                  : telescopeState.mode === 'web_serial'
                  ? 'USB 串口直连 (WebSerial)'
                  : '仿真模式'}
              </span>
            </div>

            <div className="hidden sm:block text-slate-500">|</div>

            <div className="hidden sm:flex items-center gap-2">
              <span className="text-slate-400">实时光轴:</span>
              <span className="font-bold text-cyan-400">
                RA {formatRA(telescopeState.ra).slice(0, 11)}
              </span>
              <span className="font-bold text-cyan-400">
                Dec {formatDec(telescopeState.dec)}
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <span className="text-slate-400">地平视向:</span>
              <span className="text-emerald-400">
                {formatAltAz(telescopeState.alt, telescopeState.az)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {telescopeState.targetName && (
              <div className="text-[11px] text-amber-300 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/60">
                当前锁定: {telescopeState.targetName}
              </div>
            )}

            <button
              onClick={() => setActiveTab('control')}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-sans"
            >
              打开回转控制台 🕹️
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

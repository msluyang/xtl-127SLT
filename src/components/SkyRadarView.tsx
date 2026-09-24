import React, { useState, useMemo } from 'react';
import { TelescopeState, ObserverLocation, CelestialObject } from '../types/telescope';
import {
  getAllCelestialObjects,
  equatorialToHorizontal,
  formatAltAz,
  formatRA,
  formatDec,
  TELESCOPE_SPECS,
  STANDARD_EYEPIECES,
  calculateEyepieceView,
  getVisibilityStatus,
} from '../services/astronomy';
import { telescopeBridge } from '../services/celestronProtocol';
import {
  Crosshair,
  Compass,
  Eye,
  Layers,
  Sparkles,
  Info,
  CheckCircle,
  Navigation,
} from 'lucide-react';

interface SkyRadarViewProps {
  state: TelescopeState;
  nightMode: boolean;
  location: ObserverLocation;
  onSelectTarget: (obj: CelestialObject) => void;
}

export const SkyRadarView: React.FC<SkyRadarViewProps> = ({
  state,
  nightMode,
  location,
  onSelectTarget,
}) => {
  const [selectedEyepieceIndex, setSelectedEyepieceIndex] = useState(0); // 0 = 25mm
  const [selectedObject, setSelectedObject] = useState<CelestialObject | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'visible_only'>('visible_only');

  const eyepiece = STANDARD_EYEPIECES[selectedEyepieceIndex];
  const { magnification, tfov } = calculateEyepieceView(eyepiece.focalLength, eyepiece.afov);

  // Compute live horizontal coordinates for all objects
  const objectsWithHoriz = useMemo(() => {
    const all = getAllCelestialObjects();
    return all.map((obj) => {
      const horiz = equatorialToHorizontal(obj.ra, obj.dec, location);
      return {
        ...obj,
        currentAlt: horiz.alt,
        currentAz: horiz.az,
      };
    });
  }, [location, state.lastHeartbeat]);

  const displayedObjects = useMemo(() => {
    if (filterType === 'visible_only') {
      return objectsWithHoriz.filter((o) => o.currentAlt > 0);
    }
    return objectsWithHoriz;
  }, [objectsWithHoriz, filterType]);

  // Radar projection helper:
  // Center is Zenith (alt = 90). Outer rim is Horizon (alt = 0).
  // Distance from center r = (90 - alt) / 90 * maxRadius.
  // Azimuth angle: North (0) is top, East (90) is right, South (180) is bottom, West (270) is left.
  const radarSize = 460;
  const center = radarSize / 2;
  const radius = (radarSize / 2) - 30;

  const projectToRadar = (alt: number, az: number) => {
    const r = Math.max(0, (90 - alt) / 90) * radius;
    // Azimuth: 0 = North (top, -Y in screen coordinates)
    const angleRad = ((az - 90) * Math.PI) / 180;
    const x = center + r * Math.cos(angleRad);
    const y = center + r * Math.sin(angleRad);
    return { x, y };
  };

  const scopePos = projectToRadar(state.alt, state.az);
  const targetPos =
    state.targetAlt !== null && state.targetAz !== null
      ? projectToRadar(state.targetAlt, state.targetAz)
      : null;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Sky Radar Canvas */}
        <div
          className={`lg:col-span-7 rounded-2xl p-5 border flex flex-col items-center justify-center relative shadow-xl ${
            nightMode
              ? 'bg-neutral-950 border-red-900/60'
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          {/* Header controls inside canvas card */}
          <div className="w-full flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Compass className={`w-5 h-5 ${nightMode ? 'text-red-400' : 'text-cyan-400'}`} />
              <h3 className="font-bold text-sm sm:text-base">全天半球雷达星图 (Alt/Az)</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFilterType((prev) => (prev === 'all' ? 'visible_only' : 'all'))}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  filterType === 'visible_only'
                    ? nightMode
                      ? 'bg-red-900/40 border-red-700 text-red-200'
                      : 'bg-cyan-950 border-cyan-700 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {filterType === 'visible_only' ? '仅显示可见 (>0°)' : '显示全天球'}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400 w-full mb-3">
            中心点为天顶 (Zenith 90°)，最外圈为地平线 (Horizon 0°)。十字准星代表 127SLT 实时指向。
          </p>

          {/* SVG Sky Radar */}
          <div className="relative flex items-center justify-center w-full max-w-[460px] aspect-square">
            <svg
              viewBox={`0 0 ${radarSize} ${radarSize}`}
              className="w-full h-full select-none cursor-crosshair overflow-visible"
            >
              {/* Definitions */}
              <defs>
                <radialGradient id="skyGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={nightMode ? '#280606' : '#08172c'} />
                  <stop offset="75%" stopColor={nightMode ? '#160202' : '#030814'} />
                  <stop offset="100%" stopColor="#000000" />
                </radialGradient>
              </defs>

              {/* Sky Background Circle */}
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="url(#skyGrad)"
                stroke={nightMode ? '#7f1d1d' : '#1e3a8a'}
                strokeWidth="2"
              />

              {/* 30° Altitude Circle */}
              <circle
                cx={center}
                cy={center}
                r={(60 / 90) * radius}
                fill="none"
                stroke={nightMode ? '#551515' : '#1e293b'}
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={center + 6}
                y={center - (60 / 90) * radius + 12}
                fill={nightMode ? '#991b1b' : '#64748b'}
                fontSize="10"
                fontFamily="monospace"
              >
                30°
              </text>

              {/* 60° Altitude Circle */}
              <circle
                cx={center}
                cy={center}
                r={(30 / 90) * radius}
                fill="none"
                stroke={nightMode ? '#551515' : '#1e293b'}
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <text
                x={center + 6}
                y={center - (30 / 90) * radius + 12}
                fill={nightMode ? '#991b1b' : '#64748b'}
                fontSize="10"
                fontFamily="monospace"
              >
                60°
              </text>

              {/* Meridian & East-West Cross axes */}
              <line
                x1={center}
                y1={center - radius}
                x2={center}
                y2={center + radius}
                stroke={nightMode ? '#3f1111' : '#1e293b'}
                strokeWidth="1"
              />
              <line
                x1={center - radius}
                y1={center}
                x2={center + radius}
                y2={center}
                stroke={nightMode ? '#3f1111' : '#1e293b'}
                strokeWidth="1"
              />

              {/* Cardinal Labels */}
              <text
                x={center}
                y={center - radius - 10}
                fill={nightMode ? '#f87171' : '#38bdf8'}
                fontSize="13"
                fontWeight="bold"
                textAnchor="middle"
              >
                北 (N)
              </text>
              <text
                x={center + radius + 16}
                y={center + 4}
                fill={nightMode ? '#ef4444' : '#94a3b8'}
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
              >
                东 (E)
              </text>
              <text
                x={center}
                y={center + radius + 20}
                fill={nightMode ? '#ef4444' : '#94a3b8'}
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
              >
                南 (S)
              </text>
              <text
                x={center - radius - 16}
                y={center + 4}
                fill={nightMode ? '#ef4444' : '#94a3b8'}
                fontSize="12"
                fontWeight="bold"
                textAnchor="middle"
              >
                西 (W)
              </text>

              {/* Slew path line if slewing */}
              {state.isSlewing && targetPos && (
                <line
                  x1={scopePos.x}
                  y1={scopePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke={nightMode ? '#f87171' : '#38bdf8'}
                  strokeWidth="2"
                  strokeDasharray="6 4"
                  className="animate-pulse"
                />
              )}

              {/* Celestial Objects Markers */}
              {displayedObjects.map((obj) => {
                const pos = projectToRadar(obj.currentAlt, obj.currentAz);
                const isSelected = selectedObject?.id === obj.id;
                const isBelow = obj.currentAlt < 0;

                let markerColor = '#38bdf8';
                if (obj.category === 'solar_system') markerColor = '#f59e0b';
                else if (obj.category === 'messier') markerColor = '#a855f7';
                else if (obj.category === 'star') markerColor = '#60a5fa';

                if (nightMode) {
                  markerColor = isSelected ? '#fca5a5' : '#ef4444';
                }

                return (
                  <g
                    key={obj.id}
                    onClick={() => {
                      setSelectedObject(obj);
                    }}
                    className="cursor-pointer hover:opacity-100 transition-opacity"
                    opacity={isBelow ? 0.25 : 0.85}
                  >
                    {/* Pulsing ring if selected */}
                    {isSelected && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r="9"
                        fill="none"
                        stroke={nightMode ? '#f87171' : '#38bdf8'}
                        strokeWidth="1.5"
                        className="animate-ping"
                      />
                    )}
                    {/* Object Dot */}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={obj.magnitude < 2 ? 4.5 : 3}
                      fill={markerColor}
                      stroke="#000"
                      strokeWidth="1"
                    />
                    {/* Object Label */}
                    <text
                      x={pos.x + 6}
                      y={pos.y - 4}
                      fill={nightMode ? '#fca5a5' : '#cbd5e1'}
                      fontSize="9"
                      fontFamily="sans-serif"
                    >
                      {obj.name.split(' ')[0]}
                    </text>
                  </g>
                );
              })}

              {/* Target Position Marker (if GoTo in progress) */}
              {targetPos && (
                <g>
                  <circle
                    cx={targetPos.x}
                    cy={targetPos.y}
                    r="8"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={targetPos.x + 10}
                    y={targetPos.y + 12}
                    fill="#f59e0b"
                    fontSize="10"
                    fontWeight="bold"
                  >
                    {state.targetName || '目标'}
                  </text>
                </g>
              )}

              {/* Telescope 127SLT Live Crosshair */}
              <g className="transition-all duration-100 ease-linear">
                {/* Outer Reticle Ring */}
                <circle
                  cx={scopePos.x}
                  cy={scopePos.y}
                  r="14"
                  fill="none"
                  stroke={nightMode ? '#ff0000' : '#22d3ee'}
                  strokeWidth="2"
                />
                {/* Inner Center Dot */}
                <circle
                  cx={scopePos.x}
                  cy={scopePos.y}
                  r="2"
                  fill={nightMode ? '#ff0000' : '#22d3ee'}
                />
                {/* Crosshairs */}
                <line
                  x1={scopePos.x - 20}
                  y1={scopePos.y}
                  x2={scopePos.x + 20}
                  y2={scopePos.y}
                  stroke={nightMode ? '#ff0000' : '#22d3ee'}
                  strokeWidth="1.5"
                />
                <line
                  x1={scopePos.x}
                  y1={scopePos.y - 20}
                  x2={scopePos.x}
                  y2={scopePos.y + 20}
                  stroke={nightMode ? '#ff0000' : '#22d3ee'}
                  strokeWidth="1.5"
                />
                <text
                  x={scopePos.x + 16}
                  y={scopePos.y - 12}
                  fill={nightMode ? '#ff4d4d' : '#22d3ee'}
                  fontSize="10"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  127SLT 指向
                </text>
              </g>
            </svg>
          </div>

          {/* Quick Legend */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
              <span className="text-slate-400">太阳系行星/月亮</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400"></span>
              <span className="text-slate-400">梅西耶深空天体</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
              <span className="text-slate-400">亮星/校准星</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 border border-black"></span>
              <span className="text-slate-400">127SLT 准星</span>
            </div>
          </div>
        </div>

        {/* Right: Eyepiece Field of View Simulation & Target Info */}
        <div className="lg:col-span-5 space-y-6">
          {/* Eyepiece Visual Simulator Card */}
          <div
            className={`rounded-2xl p-5 border shadow-xl ${
              nightMode
                ? 'bg-neutral-950 border-red-900/60'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Eye className={`w-5 h-5 ${nightMode ? 'text-red-400' : 'text-cyan-400'}`} />
                <h3 className="font-bold text-sm sm:text-base">127SLT 目镜视场模拟 (FOV)</h3>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                焦距 1500mm / 口径 127mm
              </span>
            </div>

            {/* Eyepiece Selector */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {STANDARD_EYEPIECES.slice(0, 4).map((ep, idx) => (
                <button
                  key={ep.name}
                  onClick={() => setSelectedEyepieceIndex(idx)}
                  className={`p-2 rounded-xl text-left border text-xs transition-all ${
                    selectedEyepieceIndex === idx
                      ? nightMode
                        ? 'bg-red-950 border-red-700 text-red-200'
                        : 'bg-cyan-950 border-cyan-600 text-cyan-300 shadow-sm'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-semibold text-slate-200">{ep.focalLength}mm 目镜</div>
                  <div className="text-[10px] opacity-70">
                    放大倍率 {(1500 / ep.focalLength).toFixed(0)}x | 真实视场 {(ep.afov / (1500 / ep.focalLength)).toFixed(2)}°
                  </div>
                </button>
              ))}
            </div>

            {/* Eyepiece Visual Circular Reticle */}
            <div className="relative flex flex-col items-center justify-center p-4 rounded-xl bg-black border border-slate-800">
              <div className="relative w-56 h-56 rounded-full border-4 border-slate-700 flex items-center justify-center overflow-hidden bg-slate-950 shadow-inner">
                {/* Subtle dark field stars */}
                <div className="absolute inset-0 opacity-40">
                  <div className="absolute top-10 left-16 w-1 h-1 bg-white rounded-full"></div>
                  <div className="absolute top-28 right-12 w-1.5 h-1.5 bg-blue-200 rounded-full"></div>
                  <div className="absolute bottom-12 left-20 w-1 h-1 bg-amber-100 rounded-full"></div>
                  <div className="absolute top-36 left-32 w-1 h-1 bg-white rounded-full"></div>
                  <div className="absolute bottom-20 right-24 w-1 h-1 bg-white rounded-full"></div>
                </div>

                {/* Concentric Guide Rings */}
                <div className="absolute w-40 h-40 rounded-full border border-dashed border-red-900/60 pointer-events-none"></div>
                <div className="absolute w-20 h-20 rounded-full border border-red-900/40 pointer-events-none"></div>

                {/* Eyepiece Center Crosshairs */}
                <div className="absolute w-full h-[1px] bg-red-800/50 pointer-events-none"></div>
                <div className="absolute h-full w-[1px] bg-red-800/50 pointer-events-none"></div>

                {/* Display Selected Target or Center Reticle */}
                <div className="z-10 text-center">
                  {selectedObject ? (
                    <div className="p-2 rounded bg-black/60 backdrop-blur-xs border border-slate-800">
                      <div className="text-xs font-bold text-amber-300">{selectedObject.chineseName}</div>
                      <div className="text-[10px] text-slate-400">{selectedObject.type}</div>
                      <div className="text-[10px] font-mono text-cyan-300">
                        视星等 {selectedObject.magnitude}m
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] font-mono text-slate-400">
                      准星中心点
                      <br />
                      <span className="text-[9px] text-slate-500">
                        {state.targetName ? `指向: ${state.targetName}` : '天区巡天中'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between w-full mt-3 text-xs font-mono text-slate-400">
                <span>放大倍率: {magnification.toFixed(0)}x</span>
                <span>真实视场 (TFOV): {tfov.toFixed(2)}°</span>
                <span>出瞳直径: {(127 / magnification).toFixed(1)}mm</span>
              </div>
            </div>
          </div>

          {/* Selected Target Detail & GoTo Action */}
          {selectedObject ? (
            <div
              className={`rounded-2xl p-5 border shadow-xl animate-fade-in ${
                nightMode
                  ? 'bg-neutral-950 border-red-900/60'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    {selectedObject.chineseName}
                    <span className="text-xs font-normal text-slate-400 font-mono">
                      ({selectedObject.name})
                    </span>
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>{selectedObject.constellation}</span>
                    <span>•</span>
                    <span>{selectedObject.type}</span>
                  </div>
                </div>

                {(() => {
                  const vis = getVisibilityStatus(selectedObject.currentAlt ?? 0);
                  return (
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full border font-semibold ${vis.badgeClass}`}
                    >
                      {vis.label}
                    </span>
                  );
                })()}
              </div>

              <p className="text-xs text-slate-300 my-3 leading-relaxed bg-slate-950/60 p-3 rounded-xl border border-slate-800">
                {selectedObject.description}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-4">
                <div className="p-2 rounded bg-slate-800/40 border border-slate-800">
                  <div className="text-[10px] text-slate-400">赤经 RA / 赤纬 Dec</div>
                  <div className="font-semibold text-slate-200">
                    {formatRA(selectedObject.ra)}
                  </div>
                  <div className="text-slate-300">{formatDec(selectedObject.dec)}</div>
                </div>

                <div className="p-2 rounded bg-slate-800/40 border border-slate-800">
                  <div className="text-[10px] text-slate-400">当前仰角 Alt / 方位 Az</div>
                  <div className="font-semibold text-cyan-300">
                    仰角 {(selectedObject.currentAlt ?? 0).toFixed(1)}°
                  </div>
                  <div className="text-slate-300">
                    方位 {(selectedObject.currentAz ?? 0).toFixed(1)}°
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    telescopeBridge.goToTarget(
                      selectedObject.chineseName,
                      selectedObject.ra,
                      selectedObject.dec
                    );
                    onSelectTarget(selectedObject);
                  }}
                  disabled={state.isSlewing}
                  className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all ${
                    state.isSlewing
                      ? 'bg-amber-600 text-white animate-pulse'
                      : nightMode
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                  }`}
                >
                  <Navigation className="w-4 h-4" />
                  <span>
                    {state.isSlewing && state.targetName === selectedObject.chineseName
                      ? '望远镜正在回转寻星...'
                      : '执行 127SLT 自动寻星 (GoTo)'}
                  </span>
                </button>

                <button
                  onClick={() => {
                    telescopeBridge.syncCurrentPosition(
                      selectedObject.ra,
                      selectedObject.dec
                    );
                    alert(`已将 127SLT 天体坐标同步校准至 [${selectedObject.chineseName}]`);
                  }}
                  className="py-2.5 px-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 transition-colors"
                  title="当目标已在目镜中央时，同步校准编码器基准点"
                >
                  同步校准 (Sync)
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl p-6 border border-dashed border-slate-800 text-center text-slate-400 text-xs">
              <Info className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              在左侧半球雷达星图中点击任意天体，即可查看详细仰角方位并一键执行 GoTo 自动寻星。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

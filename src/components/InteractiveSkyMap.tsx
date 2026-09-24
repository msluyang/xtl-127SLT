import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TelescopeState, ObserverLocation, CelestialObject } from '../types/telescope';
import {
  getAllCelestialObjects,
  equatorialToHorizontal,
  formatRA,
  formatDec,
  formatAltAz,
  CONSTELLATION_DEFS,
  FAINT_STARS,
  getVisibilityStatus,
  TELESCOPE_SPECS,
  calculateEyepieceView,
  STANDARD_EYEPIECES,
} from '../services/astronomy';
import { telescopeBridge } from '../services/celestronProtocol';
import {
  Search,
  Navigation,
  Crosshair,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  Sparkles,
  Eye,
  Compass,
  AlertOctagon,
  CheckCircle2,
  Maximize2,
  Sliders,
  MapPin,
  Flame,
  Info,
} from 'lucide-react';

interface InteractiveSkyMapProps {
  state: TelescopeState;
  nightMode: boolean;
  location: ObserverLocation;
  onSelectTarget?: (obj: CelestialObject) => void;
}

export const InteractiveSkyMap: React.FC<InteractiveSkyMapProps> = ({
  state,
  nightMode,
  location,
  onSelectTarget,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport center in RA (hours: 0 - 24) and Dec (degrees: -90 to +90)
  const [centerRa, setCenterRa] = useState<number>(state.ra || 5.6);
  const [centerDec, setCenterDec] = useState<number>(state.dec || 10.0);
  // Zoom scale in pixels per degree. default ~ 12px per degree
  const [zoom, setZoom] = useState<number>(14);

  // Selected Target
  const [selectedTarget, setSelectedTarget] = useState<CelestialObject | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Layer Toggles
  const [showConstellationLines, setShowConstellationLines] = useState(true);
  const [showConstellationLabels, setShowConstellationLabels] = useState(true);
  const [showEquatorialGrid, setShowEquatorialGrid] = useState(true);
  const [showHorizonGround, setShowHorizonGround] = useState(true);
  const [showEyepieceFov, setShowEyepieceFov] = useState(true);
  const [selectedEyepieceIndex, setSelectedEyepieceIndex] = useState(0); // 0 = 25mm

  // Drag interaction state
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number; ra: number; dec: number }>({
    x: 0,
    y: 0,
    ra: 0,
    dec: 0,
  });

  // Calculate live objects with coordinates
  const celestialObjects = useMemo(() => {
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

  // Filtered search list
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return celestialObjects
      .filter((obj) => {
        return (
          obj.name.toLowerCase().includes(q) ||
          obj.chineseName.toLowerCase().includes(q) ||
          obj.constellation.toLowerCase().includes(q) ||
          obj.type.toLowerCase().includes(q)
        );
      })
      .slice(0, 8);
  }, [searchQuery, celestialObjects]);

  // Center on current telescope position
  const handleCenterTelescope = () => {
    setCenterRa(state.ra);
    setCenterDec(state.dec);
  };

  // Center on specific target
  const handleSelectAndCenter = (obj: CelestialObject) => {
    setSelectedTarget(obj);
    setCenterRa(obj.ra);
    setCenterDec(obj.dec);
    setIsSearchOpen(false);
    setSearchQuery('');
    if (onSelectTarget) onSelectTarget(obj);
  };

  // Execute GoTo to selected target
  const handleExecuteGoTo = (obj: CelestialObject) => {
    telescopeBridge.goToTarget(obj.chineseName, obj.ra, obj.dec);
    if (onSelectTarget) onSelectTarget(obj);
  };

  // Canvas coordinate projection:
  // (ra, dec) -> (canvasX, canvasY)
  // ra: 0 to 24 hours (1 hr = 15 deg). Sky moves East to West, so RA increases to the left.
  const projectCoords = useCallback(
    (ra: number, dec: number, width: number, height: number) => {
      let deltaRaDeg = (ra - centerRa) * 15;
      // wrap deltaRa around [-180, 180]
      while (deltaRaDeg > 180) deltaRaDeg -= 360;
      while (deltaRaDeg < -180) deltaRaDeg += 360;

      // In astronomy charts, East is to the left (RA increases to the left)
      const x = width / 2 - deltaRaDeg * zoom;
      // Dec increases upwards (North is up)
      const deltaDecDeg = dec - centerDec;
      const y = height / 2 - deltaDecDeg * zoom;

      return { x, y };
    },
    [centerRa, centerDec, zoom]
  );

  // Inverse projection: (canvasX, canvasY) -> (ra, dec)
  const unprojectCoords = useCallback(
    (x: number, y: number, width: number, height: number) => {
      const deltaX = x - width / 2;
      const deltaY = y - height / 2;

      const deltaRaDeg = -deltaX / zoom;
      let ra = centerRa + deltaRaDeg / 15;
      ra = ((ra % 24) + 24) % 24;

      const deltaDecDeg = -deltaY / zoom;
      let dec = centerDec + deltaDecDeg;
      dec = Math.max(-90, Math.min(90, dec));

      return { ra, dec };
    },
    [centerRa, centerDec, zoom]
  );

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    // Color theme
    const bgDark = nightMode ? '#0d0202' : '#030712';
    const gridColor = nightMode ? 'rgba(153, 27, 27, 0.25)' : 'rgba(30, 41, 59, 0.6)';
    const constLineColor = nightMode ? 'rgba(239, 68, 68, 0.45)' : 'rgba(56, 189, 248, 0.35)';
    const textDimColor = nightMode ? '#991b1b' : '#64748b';
    const textColor = nightMode ? '#fca5a5' : '#cbd5e1';

    // 1. Draw Background
    ctx.fillStyle = bgDark;
    ctx.fillRect(0, 0, w, h);

    // 2. Draw Subtle Milky Way Path
    const mwGradient = ctx.createLinearGradient(0, 0, w, h);
    if (nightMode) {
      mwGradient.addColorStop(0, 'rgba(40, 5, 5, 0.15)');
      mwGradient.addColorStop(0.5, 'rgba(80, 10, 10, 0.35)');
      mwGradient.addColorStop(1, 'rgba(40, 5, 5, 0.15)');
    } else {
      mwGradient.addColorStop(0, 'rgba(15, 23, 42, 0.2)');
      mwGradient.addColorStop(0.5, 'rgba(30, 58, 138, 0.25)');
      mwGradient.addColorStop(1, 'rgba(15, 23, 42, 0.2)');
    }
    ctx.fillStyle = mwGradient;
    ctx.fillRect(0, 0, w, h);

    // 3. Draw Equatorial Coordinate Grid (RA and Dec lines)
    if (showEquatorialGrid) {
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.font = '10px monospace';
      ctx.fillStyle = textDimColor;

      // Declination parallels (-80° to +80° every 10° or 20°)
      const decStep = zoom > 25 ? 5 : zoom > 10 ? 10 : 20;
      for (let dec = -80; dec <= 80; dec += decStep) {
        const { y } = projectCoords(centerRa, dec, w, h);
        if (y >= 0 && y <= h) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          ctx.fillText(`${dec > 0 ? '+' : ''}${dec}°`, 6, y - 4);
        }
      }

      // Celestial Equator (Dec = 0) highlighted
      const eqY = projectCoords(centerRa, 0, w, h).y;
      if (eqY >= 0 && eqY <= h) {
        ctx.strokeStyle = nightMode ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.4)';
        ctx.beginPath();
        ctx.moveTo(0, eqY);
        ctx.lineTo(w, eqY);
        ctx.stroke();
        ctx.fillText('天赤道 (Dec 0°)', w - 90, eqY - 4);
      }

      // RA meridians (every 1 hour or 2 hours)
      const raStep = zoom > 25 ? 0.5 : zoom > 10 ? 1 : 2;
      for (let ra = 0; ra < 24; ra += raStep) {
        const { x } = projectCoords(ra, centerDec, w, h);
        if (x >= 0 && x <= w) {
          ctx.strokeStyle = gridColor;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
          const raStr = `${Math.floor(ra)}h${ra % 1 !== 0 ? '30m' : ''}`;
          ctx.fillText(raStr, x + 4, h - 8);
        }
      }
    }

    // 4. Draw Background Stars (600 faint stars)
    ctx.fillStyle = nightMode ? '#f87171' : '#ffffff';
    FAINT_STARS.forEach((star) => {
      const p = projectCoords(star.ra, star.dec, w, h);
      if (p.x >= -10 && p.x <= w + 10 && p.y >= -10 && p.y <= h + 10) {
        const r = Math.max(0.6, (6.5 - star.mag) * 0.6);
        ctx.globalAlpha = Math.max(0.15, Math.min(0.85, (7.0 - star.mag) / 5));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalAlpha = 1.0;

    // 5. Draw Constellation Stick Figures
    if (showConstellationLines) {
      ctx.strokeStyle = constLineColor;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);

      CONSTELLATION_DEFS.forEach((c) => {
        c.segments.forEach(([start, end]) => {
          const p1 = projectCoords(start[0], start[1], w, h);
          const p2 = projectCoords(end[0], end[1], w, h);

          // Check if at least one point is near screen
          const inBounds =
            (p1.x >= -50 && p1.x <= w + 50 && p1.y >= -50 && p1.y <= h + 50) ||
            (p2.x >= -50 && p2.x <= w + 50 && p2.y >= -50 && p2.y <= h + 50);

          if (inBounds) {
            // Avoid drawing wrapped lines across screen
            const dx = Math.abs(p1.x - p2.x);
            if (dx < w * 0.8) {
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          }
        });

        // Constellation Label
        if (showConstellationLabels) {
          const centerP = projectCoords(c.centerRa, c.centerDec, w, h);
          if (centerP.x >= 20 && centerP.x <= w - 20 && centerP.y >= 20 && centerP.y <= h - 20) {
            ctx.font = 'bold 11px sans-serif';
            ctx.fillStyle = nightMode ? '#f87171' : '#38bdf8';
            ctx.textAlign = 'center';
            ctx.fillText(c.chineseName, centerP.x, centerP.y);
          }
        }
      });
      ctx.setLineDash([]);
    }

    // 6. Draw Local Horizon Ground Line & Compass Points
    if (showHorizonGround) {
      ctx.save();
      // Sample horizon circle points (alt = 0)
      ctx.strokeStyle = nightMode ? '#7f1d1d' : '#1e3a8a';
      ctx.lineWidth = 2;
      ctx.fillStyle = nightMode ? 'rgba(40, 5, 5, 0.35)' : 'rgba(2, 6, 23, 0.45)';

      const horizonPts: Array<{ x: number; y: number; az: number }> = [];
      for (let az = 0; az <= 360; az += 5) {
        // Find RA/Dec of alt = 0 at this azimuth
        const { ra, dec } = unprojectHorizontal(0, az, location);
        const pt = projectCoords(ra, dec, w, h);
        horizonPts.push({ x: pt.x, y: pt.y, az });
      }

      // Draw dashed horizon curve
      ctx.setLineDash([6, 4]);
      for (let i = 0; i < horizonPts.length - 1; i++) {
        const p1 = horizonPts[i];
        const p2 = horizonPts[i + 1];
        if (Math.abs(p1.x - p2.x) < w * 0.5) {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();

          // Compass labels (N, NE, E, SE, S, SW, W, NW)
          if (p1.az % 45 === 0) {
            const cardinalLabels: Record<number, string> = {
              0: '北 (N)',
              45: '东北 (NE)',
              90: '东 (E)',
              135: '东南 (SE)',
              180: '南 (S)',
              225: '西南 (SW)',
              270: '西 (W)',
              315: '西北 (NW)',
              360: '北 (N)',
            };
            ctx.font = 'bold 10px sans-serif';
            ctx.fillStyle = nightMode ? '#ef4444' : '#60a5fa';
            ctx.fillText(cardinalLabels[p1.az], p1.x, p1.y + 14);
          }
        }
      }
      ctx.restore();
    }

    // 7. Draw Celestial Objects (Planets, Deep Sky, Messier, Bright Stars)
    celestialObjects.forEach((obj) => {
      const p = projectCoords(obj.ra, obj.dec, w, h);
      if (p.x < -30 || p.x > w + 30 || p.y < -30 || p.y > h + 30) return;

      const isSelected = selectedTarget?.id === obj.id;

      // Color coding by celestial category
      let objColor = '#38bdf8';
      let objRadius = 3.5;
      let symbol = '★';

      if (obj.category === 'solar_system') {
        objColor = '#f59e0b';
        objRadius = 5.5;
        symbol = '🪐';
      } else if (obj.category === 'messier') {
        objColor = '#c084fc';
        objRadius = 4.5;
        symbol = '✧';
      } else if (obj.category === 'deep_sky') {
        objColor = '#ec4899';
        objRadius = 4.0;
        symbol = '✦';
      } else {
        // Bright star
        objRadius = Math.max(3.0, (4 - obj.magnitude) * 1.5);
      }

      if (nightMode) {
        objColor = isSelected ? '#ff4d4d' : '#ef4444';
      }

      // Draw Selected Reticle Ring
      if (isSelected) {
        ctx.strokeStyle = nightMode ? '#f87171' : '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw Object Dot & Glow
      ctx.fillStyle = objColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, objRadius, 0, Math.PI * 2);
      ctx.fill();

      // Draw Label
      ctx.font = isSelected ? 'bold 12px sans-serif' : '10px sans-serif';
      ctx.fillStyle = isSelected
        ? nightMode
          ? '#fee2e2'
          : '#ffffff'
        : nightMode
        ? '#fca5a5'
        : '#e2e8f0';
      ctx.textAlign = 'left';
      ctx.fillText(obj.chineseName.split(' ')[0], p.x + objRadius + 4, p.y + 3);

      // Category icon / Messier ID for clarity
      if (obj.category === 'messier' && zoom > 15) {
        ctx.font = '9px monospace';
        ctx.fillStyle = nightMode ? '#ef4444' : '#a855f7';
        ctx.fillText(obj.name.split(' ')[0], p.x + objRadius + 4, p.y + 14);
      }
    });

    // 8. Draw Slew Trajectory dashed line (if GoTo in progress)
    const scopeP = projectCoords(state.ra, state.dec, w, h);
    if (state.isSlewing && state.targetRa !== null && state.targetDec !== null) {
      const targetP = projectCoords(state.targetRa, state.targetDec, w, h);
      ctx.strokeStyle = nightMode ? '#f87171' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(scopeP.x, scopeP.y);
      ctx.lineTo(targetP.x, targetP.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw mid-flight distance text
      const midX = (scopeP.x + targetP.x) / 2;
      const midY = (scopeP.y + targetP.y) / 2;
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText(`寻星回转中: ${state.slewProgress}%`, midX, midY - 6);
    }

    // 9. Draw 127SLT Telescope Live Pointing Reticle
    ctx.save();
    ctx.translate(scopeP.x, scopeP.y);

    // Outer crosshair ring
    ctx.strokeStyle = nightMode ? '#ff0000' : '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();

    // Inner crosshairs
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(24, 0);
    ctx.moveTo(0, -24);
    ctx.lineTo(0, 24);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = nightMode ? '#ff0000' : '#06b6d4';
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = nightMode ? '#ff4d4d' : '#22d3ee';
    ctx.fillText('127SLT 光轴', 20, -8);
    ctx.restore();

    // 10. Draw 127SLT Eyepiece True FOV Circle (TFOV)
    if (showEyepieceFov) {
      const ep = STANDARD_EYEPIECES[selectedEyepieceIndex];
      const { magnification, tfov } = calculateEyepieceView(ep.focalLength, ep.afov);
      const tfovRadiusPx = (tfov / 2) * zoom;

      // Draw FOV circle around telescope position
      ctx.strokeStyle = nightMode ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 211, 238, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(scopeP.x, scopeP.y, Math.max(12, tfovRadiusPx), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Label at bottom of FOV
      ctx.font = '9px monospace';
      ctx.fillStyle = nightMode ? '#f87171' : '#67e8f9';
      ctx.textAlign = 'center';
      ctx.fillText(
        `${ep.focalLength}mm 目镜 (${magnification.toFixed(0)}x 视场 ${tfov.toFixed(2)}°)`,
        scopeP.x,
        scopeP.y + Math.max(12, tfovRadiusPx) + 12
      );
    }
  }, [
    centerRa,
    centerDec,
    zoom,
    nightMode,
    selectedTarget,
    celestialObjects,
    state.ra,
    state.dec,
    state.isSlewing,
    state.slewProgress,
    state.targetRa,
    state.targetDec,
    showConstellationLines,
    showConstellationLabels,
    showEquatorialGrid,
    showHorizonGround,
    showEyepieceFov,
    selectedEyepieceIndex,
    projectCoords,
  ]);

  // Helper: unproject Alt=0, Az -> RA, Dec for horizon line
  const unprojectHorizontal = (
    altDeg: number,
    azDeg: number,
    loc: ObserverLocation
  ): { ra: number; dec: number } => {
    // Simplified conversion
    const altRad = (altDeg * Math.PI) / 180;
    const azRad = (azDeg * Math.PI) / 180;
    const latRad = (loc.latitude * Math.PI) / 180;

    const sinDec =
      Math.sin(altRad) * Math.sin(latRad) +
      Math.cos(altRad) * Math.cos(latRad) * Math.cos(azRad);
    const decRad = Math.asin(Math.max(-1, Math.min(1, sinDec)));
    const decDeg = (decRad * 180) / Math.PI;

    const cosDec = Math.cos(decRad);
    let haRad = 0;
    if (cosDec * Math.cos(latRad) !== 0) {
      const cosHA = (Math.sin(altRad) - Math.sin(decRad) * Math.sin(latRad)) / (cosDec * Math.cos(latRad));
      haRad = Math.acos(Math.max(-1, Math.min(1, cosHA)));
      if (Math.sin(azRad) > 0) haRad = 2 * Math.PI - haRad;
    }

    const haHours = (haRad * 180) / (Math.PI * 15);
    const lst = (centerRa + 12) % 24; // approximate
    let raHours = lst - haHours;
    raHours = ((raHours % 24) + 24) % 24;

    return { ra: raHours, dec: decDeg };
  };

  // Mouse / Touch Event Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ra: centerRa,
      dec: centerDec,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    // 1 pixel = (1 / zoom) degrees
    // East is left, so dragging right (dx > 0) means looking more East (RA increases)
    const deltaRaHours = (dx / zoom) / 15;
    const deltaDecDeg = dy / zoom;

    setCenterRa(((dragStartRef.current.ra + deltaRaHours) % 24 + 24) % 24);
    setCenterDec(Math.max(-85, Math.min(85, dragStartRef.current.dec + deltaDecDeg)));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Check if it was a quick click to select an object
    const dist = Math.hypot(e.clientX - dragStartRef.current.x, e.clientY - dragStartRef.current.y);
    if (dist < 4 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Find closest celestial object within 20px
      let closestObj: CelestialObject | null = null;
      let minDistance = 25;

      celestialObjects.forEach((obj) => {
        const p = projectCoords(obj.ra, obj.dec, rect.width, rect.height);
        const d = Math.hypot(p.x - clickX, p.y - clickY);
        if (d < minDistance) {
          minDistance = d;
          closestObj = obj;
        }
      });

      if (closestObj) {
        setSelectedTarget(closestObj);
        if (onSelectTarget) onSelectTarget(closestObj);
      }
    }
    isDraggingRef.current = false;
  };

  // Scroll wheel zoom
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setZoom((prev) => Math.max(5, Math.min(90, prev * zoomFactor)));
  };

  return (
    <div className="space-y-4">
      {/* Top Interactive Toolbar */}
      <div
        className={`p-3.5 sm:p-4 rounded-2xl border shadow-xl flex flex-wrap items-center justify-between gap-3 ${
          nightMode
            ? 'bg-neutral-950 border-red-900/60'
            : 'bg-slate-900 border-slate-800'
        }`}
      >
        {/* Search Input with Auto-complete */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => setIsSearchOpen(true)}
            placeholder="搜索天体 (如 木星, M42, M31, 织女星)..."
            className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs sm:text-sm border focus:outline-none transition-all ${
              nightMode
                ? 'bg-neutral-900 border-red-900 text-red-100 focus:border-red-600'
                : 'bg-slate-950 border-slate-700 text-slate-100 focus:border-cyan-500'
            }`}
          />

          {/* Autocomplete Dropdown */}
          {isSearchOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden text-xs divide-y divide-slate-800">
              {searchResults.map((obj) => (
                <button
                  key={obj.id}
                  onClick={() => handleSelectAndCenter(obj)}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-800 text-left transition-colors"
                >
                  <div>
                    <div className="font-bold text-slate-100">{obj.chineseName}</div>
                    <div className="text-[10px] text-slate-400">
                      {obj.name} • {obj.constellation} • {obj.type}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                    {obj.magnitude}m
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Viewport Center & Pointing HUD */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="hidden md:flex items-center gap-2 p-1.5 px-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400">视口中心:</span>
            <span className="font-bold text-cyan-400">RA {formatRA(centerRa).slice(0, 8)}</span>
            <span className="text-slate-600">/</span>
            <span className="font-bold text-cyan-400">Dec {centerDec > 0 ? `+${centerDec.toFixed(1)}°` : `${centerDec.toFixed(1)}°`}</span>
          </div>

          <button
            onClick={handleCenterTelescope}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all shadow-md ${
              nightMode
                ? 'bg-red-950/60 border-red-800 text-red-200 hover:bg-red-900/60'
                : 'bg-cyan-950/60 border-cyan-700 text-cyan-300 hover:bg-cyan-900/40'
            }`}
            title="将星图视野平移并居中至星特朗 127SLT 实时光轴指向"
          >
            <Crosshair className="w-4 h-4" />
            <span>锁定望远镜指向</span>
          </button>
        </div>

        {/* Layer Filters & Eyepiece Selector */}
        <div className="flex items-center gap-1.5 text-xs">
          <button
            onClick={() => setShowConstellationLines((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border transition-colors ${
              showConstellationLines
                ? nightMode
                  ? 'bg-red-900/50 border-red-700 text-red-200'
                  : 'bg-cyan-950 border-cyan-700 text-cyan-300 font-bold'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            星座连线
          </button>

          <button
            onClick={() => setShowEquatorialGrid((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border transition-colors ${
              showEquatorialGrid
                ? nightMode
                  ? 'bg-red-900/50 border-red-700 text-red-200'
                  : 'bg-cyan-950 border-cyan-700 text-cyan-300 font-bold'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            赤道经纬网
          </button>

          <button
            onClick={() => setShowHorizonGround((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border transition-colors ${
              showHorizonGround
                ? nightMode
                  ? 'bg-red-900/50 border-red-700 text-red-200'
                  : 'bg-cyan-950 border-cyan-700 text-cyan-300 font-bold'
                : 'bg-slate-800/60 border-slate-700 text-slate-400'
            }`}
          >
            地平线方位
          </button>
        </div>
      </div>

      {/* Main Interactive Planetarium Canvas */}
      <div className="relative w-full rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-black aspect-[16/9] min-h-[480px] max-h-[680px]">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        />

        {/* Floating Zoom & Control Pad on Canvas */}
        <div className="absolute right-4 bottom-4 z-20 flex flex-col items-center gap-1.5 p-1.5 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 shadow-xl">
          <button
            onClick={() => setZoom((prev) => Math.min(90, prev * 1.25))}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="放大星图 (Zoom In)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setZoom((prev) => Math.max(5, prev * 0.8))}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="缩小星图 (Zoom Out)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => {
              setZoom(14);
              setCenterRa(state.ra);
              setCenterDec(state.dec);
            }}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
            title="重置全天球视角"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Eyepiece Selector Overlay (Top Right of Canvas) */}
        <div className="absolute top-4 right-4 z-20 flex items-center gap-2 p-1.5 px-3 rounded-xl bg-slate-950/80 backdrop-blur-md border border-slate-800 text-xs shadow-xl font-mono">
          <Eye className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-slate-400">127SLT 目镜视圈:</span>
          <select
            value={selectedEyepieceIndex}
            onChange={(e) => setSelectedEyepieceIndex(parseInt(e.target.value))}
            className="bg-slate-900 border border-slate-700 rounded-md px-2 py-0.5 text-xs text-slate-200 focus:outline-none"
          >
            {STANDARD_EYEPIECES.slice(0, 4).map((ep, idx) => (
              <option key={ep.name} value={idx}>
                {ep.focalLength}mm ({(1500 / ep.focalLength).toFixed(0)}x 视场 {(ep.afov / (1500 / ep.focalLength)).toFixed(2)}°)
              </option>
            ))}
          </select>
        </div>

        {/* Live Slew Banner Overlay */}
        {state.isSlewing && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-3 p-3 px-4 rounded-xl bg-amber-950/90 backdrop-blur-md border border-amber-600 text-amber-200 shadow-2xl animate-pulse">
            <Compass className="w-5 h-5 animate-spin text-amber-400" />
            <div>
              <div className="font-bold text-xs">
                望远镜正在自动回转瞄准: {state.targetName || '目标天体'}
              </div>
              <div className="text-[10px] text-amber-300/80 font-mono">
                回转进度 {state.slewProgress}% • 4.0°/s 高速转动
              </div>
            </div>
            <button
              onClick={() => telescopeBridge.abortSlew()}
              className="ml-2 px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow"
            >
              急停
            </button>
          </div>
        )}
      </div>

      {/* Selected Target Inspector Card & GoTo Control Action */}
      {selectedTarget ? (
        <div
          className={`rounded-2xl p-5 sm:p-6 border shadow-2xl animate-fade-in ${
            nightMode
              ? 'bg-neutral-950 border-red-900/60 text-red-200'
              : 'bg-slate-900 border-slate-800 text-slate-100'
          }`}
        >
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Target Titles & Astrophysics */}
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                  <span>{selectedTarget.chineseName}</span>
                  <span className="text-xs font-normal font-mono text-slate-400">
                    ({selectedTarget.name})
                  </span>
                </h3>
                {(() => {
                  const vis = getVisibilityStatus(selectedTarget.alt ?? 0);
                  return (
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${vis.badgeClass}`}
                    >
                      {vis.label}
                    </span>
                  );
                })()}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-slate-400">
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                  星座: {selectedTarget.constellation}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                  类型: {selectedTarget.type}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-cyan-300">
                  视星等: {selectedTarget.magnitude > 0 ? `+${selectedTarget.magnitude}` : selectedTarget.magnitude}m
                </span>
                {selectedTarget.size && (
                  <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">
                    视大小: {selectedTarget.size}
                  </span>
                )}
              </div>

              <p className="text-xs text-slate-300/90 pt-1 leading-relaxed max-w-3xl">
                {selectedTarget.description}
              </p>
            </div>

            {/* Live Calculated Coordinates & Action Buttons */}
            <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
              {/* Coordinates Pill */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono space-y-1">
                <div className="text-[10px] text-slate-500">赤道坐标 RA / Dec:</div>
                <div className="font-bold text-slate-200">
                  RA {formatRA(selectedTarget.ra)} | Dec {formatDec(selectedTarget.dec)}
                </div>
                <div className="text-[10px] text-slate-500 pt-0.5">当地实时仰角方位:</div>
                <div className="font-bold text-emerald-400">
                  仰角 {(selectedTarget.alt ?? 0).toFixed(1)}° | 方位 {(selectedTarget.az ?? 0).toFixed(1)}°
                </div>
              </div>

              {/* Big GoTo Button */}
              <button
                onClick={() => handleExecuteGoTo(selectedTarget)}
                disabled={state.isSlewing}
                className={`py-3.5 px-6 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all ${
                  state.isSlewing
                    ? 'bg-amber-600 text-white animate-pulse'
                    : nightMode
                    ? 'bg-red-600 hover:bg-red-500 text-white'
                    : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                }`}
              >
                <Navigation className="w-4 h-4" />
                <span>
                  {state.isSlewing && state.targetName === selectedTarget.chineseName
                    ? '望远镜正在回转中...'
                    : '计算指向并自动转到该目标 (GoTo)'}
                </span>
              </button>

              {/* Sync Calibration Button */}
              <button
                onClick={() => {
                  telescopeBridge.syncCurrentPosition(selectedTarget.ra, selectedTarget.dec);
                  alert(`已将 127SLT 编码器同步校准至 [${selectedTarget.chineseName}]`);
                }}
                className="py-3 px-3 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors"
                title="目镜已成功捕捉到该天体时，同步校准星特朗编码器"
              >
                同步校准 (Sync)
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-400">
          💡 在上方交互式星图中点击任意恒星、行星（木星、土星、火星）或梅西耶深空天体（M42、M31等），即可查看详情并一键指令星特朗 127SLT 望远镜自动回转寻星。
        </div>
      )}
    </div>
  );
};

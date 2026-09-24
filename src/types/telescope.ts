// Types for Celestron 127SLT and Astronomical Calculations

export type ConnectionMode = 'simulator' | 'raspberry_pi_ws' | 'web_serial';

export type TrackingMode = 'off' | 'alt_az' | 'eq_north' | 'eq_south';

export type TrackingRate = 'sidereal' | 'lunar' | 'solar' | 'custom';

export type CelestialCategory = 'solar_system' | 'messier' | 'star' | 'deep_sky';

export interface ObserverLocation {
  name: string;
  latitude: number; // Degrees (+ for North)
  longitude: number; // Degrees (+ for East, - for West)
  elevation: number; // Meters
}

export interface CelestialCoordinates {
  ra: number; // Hours (0 - 24)
  dec: number; // Degrees (-90 to +90)
  alt?: number; // Altitude (-90 to +90) calculated
  az?: number; // Azimuth (0 to 360) calculated
}

export interface CelestialObject {
  id: string;
  name: string;
  chineseName: string;
  category: CelestialCategory;
  constellation: string;
  ra: number; // Right Ascension in decimal hours (0 - 24)
  dec: number; // Declination in decimal degrees (-90 to +90)
  magnitude: number; // Visual magnitude
  type: string; // e.g., 'Planet', 'Spiral Galaxy', 'Planetary Nebula', 'Open Cluster'
  size?: string; // Apparent size e.g. "10' x 4'"
  description: string;
  bestSeason?: string;
  recommendedEyepiece?: '25mm' | '9mm' | 'Barlow 2x';
  alt?: number;
  az?: number;
  currentAlt?: number;
  currentAz?: number;
}

export interface TelescopeState {
  connected: boolean;
  mode: ConnectionMode;
  host: string;
  port: number;
  serialPortName: string;
  baudRate: number;
  
  // Current coordinates
  ra: number; // Hours (0-24)
  dec: number; // Degrees (-90 to +90)
  az: number; // Degrees (0-360)
  alt: number; // Degrees (0-90)
  
  // Target coordinates
  targetRa: number | null;
  targetDec: number | null;
  targetAz: number | null;
  targetAlt: number | null;
  targetName: string | null;
  
  // Mount state
  isSlewing: boolean;
  slewProgress: number; // 0 - 100%
  trackingMode: TrackingMode;
  trackingRate: TrackingRate;
  slewRate: number; // 1 - 9
  isSpiralSearching: boolean;
  
  // Alignment state
  isAligned: boolean;
  alignmentStarsCount: number;
  
  // Hardware telemetry
  handControllerVersion: string;
  firmwareModel: string;
  pingMs: number;
  lastHeartbeat: number;
}

export interface EyepieceSpec {
  name: string;
  focalLength: number; // mm
  apparentFov: number; // degrees
}

export interface ObservationLogEntry {
  id: string;
  timestamp: string;
  targetName: string;
  targetCategory: string;
  ra: string;
  dec: string;
  eyepiece: string;
  bortle: number;
  seeing: number; // 1-5
  transparency: number; // 1-5
  notes: string;
}

export type CameraTriggerType = 'gpio_optocoupler' | 'pi_hq_camera' | 'gphoto2_usb' | 'simulator';

export interface TimelapseConfig {
  intervalSec: number;        // 拍摄间隔 (秒)
  totalFrames: number;        // 拍摄总张数 (0 为无限制)
  exposureSec: number;        // 单张曝光时长 (秒)
  settlingDelaySec: number;   // 曝光前防抖等待 (秒)
  triggerType: CameraTriggerType;
  gpioShutterPin: number;     // BCM GPIO 编号 (默认 17)
  gpioFocusPin: number;       // BCM GPIO 编号 (默认 27)
  activeLevel: 'high' | 'low'; // 触发电平
  targetFps: number;          // 目标成片帧率 (24, 30, 60 fps)
  saveRaw: boolean;
  prefix: string;
}

export type TimelapseStatus = 'idle' | 'running' | 'paused' | 'exposing' | 'settling' | 'waiting' | 'completed' | 'aborted';

export interface CapturedFrame {
  id: string;
  frameIndex: number;
  timestamp: string;
  exposureSec: number;
  starCount?: number;
  fwhm?: number;
  thumbnailUrl?: string;
  filename: string;
}

export interface TimelapseSessionState {
  status: TimelapseStatus;
  currentFrame: number;
  totalFrames: number;
  elapsedSec: number;
  remainingSec: number;
  currentExposureCountdown: number;
  nextShutterCountdown: number;
  startTime: number | null;
  config: TimelapseConfig;
  capturedFrames: CapturedFrame[];
}


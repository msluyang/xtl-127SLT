import { CelestialObject, ObserverLocation } from '../types/telescope';

// Constants
export const TELESCOPE_SPECS = {
  model: 'Celestron NexStar 127SLT',
  opticalDesign: '马克斯托夫-卡塞格林 (Maksutov-Cassegrain)',
  aperture: 127, // mm
  focalLength: 1500, // mm
  focalRatio: 11.8,
  limitingMagnitude: 13.0,
  resolutionArcSec: 0.91,
  lightGatheringPower: 329, // times human eye
  maxSlewSpeedDegPerSec: 4.0, // Rate 9 = 4 deg/sec
};

export const STANDARD_EYEPIECES = [
  { name: '25mm 标准广角 (出厂标配)', focalLength: 25, afov: 52 },
  { name: '9mm 高倍目镜 (出厂标配)', focalLength: 9, afov: 50 },
  { name: '15mm 中倍行星目镜 (推荐扩展)', focalLength: 15, afov: 60 },
  { name: '2x 巴洛增倍镜 + 9mm (极高倍)', focalLength: 4.5, afov: 50 },
  { name: '32mm 超大视场目镜 (深空探索)', focalLength: 32, afov: 52 },
];

/**
 * Calculates magnification and true field of view (TFOV in degrees) for 127SLT
 */
export function calculateEyepieceView(focalLength: number, afov: number = 50) {
  const magnification = TELESCOPE_SPECS.focalLength / focalLength;
  const tfov = afov / magnification; // degrees
  return { magnification, tfov };
}

/**
 * Julian Date calculation from JavaScript Date
 */
export function getJulianDate(date: Date = new Date()): number {
  const time = date.getTime();
  return time / 86400000 + 2440587.5;
}

/**
 * Greenwich Mean Sidereal Time in degrees (0 - 360)
 */
export function getGMST(date: Date = new Date()): number {
  const jd = getJulianDate(date);
  const d = jd - 2451545.0; // days since J2000.0
  let gmst = 280.46061837 + 360.98564736629 * d;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst;
}

/**
 * Local Sidereal Time in hours (0 - 24) for given observer longitude (deg, + for East)
 */
export function getLST(date: Date, longitudeDeg: number): number {
  const gmstDeg = getGMST(date);
  let lstDeg = gmstDeg + longitudeDeg;
  lstDeg = ((lstDeg % 360) + 360) % 360;
  return lstDeg / 15.0; // Convert degrees to hours
}

/**
 * Convert Equatorial Coordinates (RA in hours, Dec in degrees) to Horizontal (Alt, Az in degrees)
 */
export function equatorialToHorizontal(
  raHours: number,
  decDeg: number,
  location: ObserverLocation,
  date: Date = new Date()
): { alt: number; az: number } {
  const lstHours = getLST(date, location.longitude);
  let haHours = lstHours - raHours;
  if (haHours < 0) haHours += 24;
  if (haHours > 24) haHours -= 24;

  const haRad = (haHours * 15 * Math.PI) / 180;
  const decRad = (decDeg * Math.PI) / 180;
  const latRad = (location.latitude * Math.PI) / 180;

  // sin(alt) = sin(dec)*sin(lat) + cos(dec)*cos(lat)*cos(ha)
  const sinAlt =
    Math.sin(decRad) * Math.sin(latRad) +
    Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
  const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const altDeg = (altRad * 180) / Math.PI;

  // cos(A) = (sin(dec) - sin(alt)*sin(lat)) / (cos(alt)*cos(lat))
  const cosAlt = Math.cos(altRad);
  const cosLat = Math.cos(latRad);
  
  let azDeg = 0;
  if (cosAlt * cosLat !== 0) {
    const cosAz = (Math.sin(decRad) - Math.sin(altRad) * Math.sin(latRad)) / (cosAlt * cosLat);
    const clampedCosAz = Math.max(-1, Math.min(1, cosAz));
    let azRad = Math.acos(clampedCosAz);
    
    // If sin(ha) > 0, target is west of meridian -> Azimuth > 180
    if (Math.sin(haRad) > 0) {
      azRad = 2 * Math.PI - azRad;
    }
    azDeg = (azRad * 180) / Math.PI;
  }

  return {
    alt: Math.round(altDeg * 100) / 100,
    az: Math.round(azDeg * 100) / 100,
  };
}

/**
 * Convert Horizontal Coordinates (Alt, Az in degrees) back to Equatorial (RA in hours, Dec in degrees)
 */
export function horizontalToEquatorial(
  altDeg: number,
  azDeg: number,
  location: ObserverLocation,
  date: Date = new Date()
): { ra: number; dec: number } {
  const altRad = (altDeg * Math.PI) / 180;
  const azRad = (azDeg * Math.PI) / 180;
  const latRad = (location.latitude * Math.PI) / 180;

  // sin(dec) = sin(alt)*sin(lat) + cos(alt)*cos(lat)*cos(az)
  const sinDec =
    Math.sin(altRad) * Math.sin(latRad) +
    Math.cos(altRad) * Math.cos(latRad) * Math.cos(azRad);
  const decRad = Math.asin(Math.max(-1, Math.min(1, sinDec)));
  const decDeg = (decRad * 180) / Math.PI;

  // cos(ha) = (sin(alt) - sin(dec)*sin(lat)) / (cos(dec)*cos(lat))
  const cosDec = Math.cos(decRad);
  const cosLat = Math.cos(latRad);
  
  let haRad = 0;
  if (cosDec * cosLat !== 0) {
    const cosHA = (Math.sin(altRad) - Math.sin(decRad) * Math.sin(latRad)) / (cosDec * cosLat);
    haRad = Math.acos(Math.max(-1, Math.min(1, cosHA)));
    if (Math.sin(azRad) > 0) {
      haRad = 2 * Math.PI - haRad;
    }
  }

  const haHours = (haRad * 180) / (Math.PI * 15);
  const lstHours = getLST(date, location.longitude);
  let raHours = lstHours - haHours;
  raHours = ((raHours % 24) + 24) % 24;

  return {
    ra: Math.round(raHours * 1000) / 1000,
    dec: Math.round(decDeg * 100) / 100,
  };
}

/**
 * Celestron NexStar 16-bit and 32-bit Hex Converters
 * In NexStar protocol:
 * 360 degrees = 0x10000 (16-bit) or 0x100000000 (32-bit)
 */
export function degreesToNexStar16Hex(degrees: number): string {
  const norm = ((degrees % 360) + 360) % 360;
  const val = Math.floor((norm / 360) * 0x10000);
  return val.toString(16).toUpperCase().padStart(4, '0');
}

export function degreesToNexStar32Hex(degrees: number): string {
  const norm = ((degrees % 360) + 360) % 360;
  const val = Math.floor((norm / 360) * 0x100000000);
  return val.toString(16).toUpperCase().padStart(8, '0');
}

export function nexStar16HexToDegrees(hexStr: string): number {
  const val = parseInt(hexStr, 16);
  if (isNaN(val)) return 0;
  return (val / 0x10000) * 360;
}

export function nexStar32HexToDegrees(hexStr: string): number {
  const val = parseInt(hexStr, 16);
  if (isNaN(val)) return 0;
  return (val / 0x100000000) * 360;
}

/**
 * RA Hours (0-24) to Degrees (0-360)
 */
export function raHoursToDegrees(hours: number): number {
  return ((hours % 24) + 24) % 24 * 15;
}

export function degreesToRaHours(degrees: number): number {
  return (((degrees % 360) + 360) % 360) / 15;
}

/**
 * Format RA in Hours, Minutes, Seconds (e.g. 05h 35m 17s)
 */
export function formatRA(hours: number): string {
  const norm = ((hours % 24) + 24) % 24;
  const h = Math.floor(norm);
  const m = Math.floor((norm - h) * 60);
  const s = Math.floor(((norm - h) * 60 - m) * 60);
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

/**
 * Format Declination in Degrees, Minutes, Seconds (e.g. +22° 00' 52")
 */
export function formatDec(degrees: number): string {
  const sign = degrees >= 0 ? '+' : '-';
  const abs = Math.abs(degrees);
  const d = Math.floor(abs);
  const m = Math.floor((abs - d) * 60);
  const s = Math.floor(((abs - d) * 60 - m) * 60);
  return `${sign}${d.toString().padStart(2, '0')}° ${m.toString().padStart(2, '0')}' ${s.toString().padStart(2, '0')}"`;
}

/**
 * Format Azimuth and Altitude
 */
export function formatAltAz(alt: number, az: number): string {
  return `高度 ${alt.toFixed(1)}° | 方位 ${az.toFixed(1)}° (${getCardinalDirection(az)})`;
}

export function getCardinalDirection(az: number): string {
  const norm = ((az % 360) + 360) % 360;
  const directions = ['北 (N)', '东北 (NE)', '东 (E)', '东南 (SE)', '南 (S)', '西南 (SW)', '西 (W)', '西北 (NW)'];
  const index = Math.round(norm / 45) % 8;
  return directions[index];
}

/**
 * Approximate Planetary and Lunar coordinates for current date
 */
export function calculatePlanetaryPositions(date: Date = new Date()): Partial<CelestialObject>[] {
  const jd = getJulianDate(date);
  const d = jd - 2451545.0; // days from J2000.0
  const T = d / 36525.0; // centuries

  // Simplified Sun
  const L0 = 280.46646 + 36000.76983 * T;
  const M_sun = 357.52911 + 35999.05029 * T;
  const C_sun = (1.914602 - 0.004817 * T) * Math.sin((M_sun * Math.PI) / 180) + 0.019993 * Math.sin((2 * M_sun * Math.PI) / 180);
  const sunTrueLong = (L0 + C_sun) % 360;
  const obliquity = 23.439291 - 0.0130042 * T;
  
  const sunLongRad = (sunTrueLong * Math.PI) / 180;
  const oblRad = (obliquity * Math.PI) / 180;
  
  const sunRaRad = Math.atan2(Math.sin(sunLongRad) * Math.cos(oblRad), Math.cos(sunLongRad));
  let sunRaHours = (sunRaRad * 180) / (Math.PI * 15);
  if (sunRaHours < 0) sunRaHours += 24;
  const sunDecRad = Math.asin(Math.sin(sunLongRad) * Math.sin(oblRad));
  const sunDecDeg = (sunDecRad * 180) / Math.PI;

  // Approximate Moon
  const l_moon = (218.316 + 13.176396 * d) % 360;
  const m_moon = (134.963 + 13.064993 * d) % 360;
  const f_moon = (93.272 + 13.229350 * d) % 360;
  const moonLong = l_moon + 6.289 * Math.sin((m_moon * Math.PI) / 180);
  const moonLat = 5.128 * Math.sin((f_moon * Math.PI) / 180);
  
  const mLongRad = (moonLong * Math.PI) / 180;
  const mLatRad = (moonLat * Math.PI) / 180;
  const moonRaRad = Math.atan2(
    Math.sin(mLongRad) * Math.cos(oblRad) - Math.tan(mLatRad) * Math.sin(oblRad),
    Math.cos(mLongRad)
  );
  let moonRaHours = (moonRaRad * 180) / (Math.PI * 15);
  if (moonRaHours < 0) moonRaHours += 24;
  const moonDecRad = Math.asin(
    Math.sin(mLatRad) * Math.cos(oblRad) + Math.cos(mLatRad) * Math.sin(oblRad) * Math.sin(mLongRad)
  );
  const moonDecDeg = (moonDecRad * 180) / Math.PI;

  // Approximate Phase angle
  const phaseAngle = ((moonLong - sunTrueLong + 360) % 360);
  const illumination = Math.round(((1 - Math.cos((phaseAngle * Math.PI) / 180)) / 2) * 100);

  // Return dynamic Solar System targets
  return [
    {
      id: 'moon',
      name: 'Moon',
      chineseName: `月球 (照亮率 ${illumination}%)`,
      category: 'solar_system',
      constellation: '黄道带',
      ra: Math.round(moonRaHours * 100) / 100,
      dec: Math.round(moonDecDeg * 100) / 100,
      magnitude: -12.5,
      type: '卫星 (天然卫星)',
      size: "31' 05\"",
      description: '127SLT极佳观测目标！月海、第谷环形山裂谷与雨海山脉在9mm高倍目镜下纤毫毕现。推荐在晨昏线附近观测丰富阴影细节。',
      recommendedEyepiece: '9mm',
    },
    {
      id: 'jupiter',
      name: 'Jupiter',
      chineseName: '木星 (气态巨行星)',
      category: 'solar_system',
      constellation: '金牛座/双子座',
      ra: 5.65, // Approximation for mid-2020s
      dec: 22.1,
      magnitude: -2.4,
      type: '行星',
      size: "45.2\"",
      description: '太阳系最大行星。127SLT马卡镜能清晰分辨两条主暗带（北赤道带NEB与南赤道带SEB）及四颗伽利略卫星（木卫一、二、三、四）。大红斑转至正面时清晰可见。',
      recommendedEyepiece: '9mm',
    },
    {
      id: 'saturn',
      name: 'Saturn',
      chineseName: '土星 (光环之王)',
      category: 'solar_system',
      constellation: '水瓶座',
      ra: 23.15,
      dec: -7.8,
      magnitude: 0.6,
      type: '行星',
      size: "18.8\" (光环 42\")",
      description: '最壮丽的天体之一！127SLT配9mm目镜可锐利呈现土星光环及卡西尼缝，并能看到最大的卫星土卫六（泰坦）。',
      recommendedEyepiece: '9mm',
    },
    {
      id: 'mars',
      name: 'Mars',
      chineseName: '火星 (红色行星)',
      category: 'solar_system',
      constellation: '巨蟹座',
      ra: 8.2,
      dec: 21.5,
      magnitude: 0.2,
      type: '行星',
      size: "10.5\"",
      description: '大冲期间127SLT可看到明亮的白色极冠和暗色地貌（大瑟提斯高原）。建议配合高倍或2x巴洛镜观测。',
      recommendedEyepiece: '9mm',
    },
    {
      id: 'venus',
      name: 'Venus',
      chineseName: '金星 (启明星/长庚星)',
      category: 'solar_system',
      constellation: '黄道带',
      ra: ((sunRaHours + 1.8) % 24),
      dec: sunDecDeg + 3.5,
      magnitude: -4.3,
      type: '行星',
      size: "25.0\"",
      description: '全天除日月外最亮天体。127SLT可以非常清晰地追踪其如月牙般的相位变化，极富观赏趣味。',
      recommendedEyepiece: '25mm',
    },
    {
      id: 'sun',
      name: 'Sun',
      chineseName: '太阳 ⚠️必须安装巴德膜滤镜！',
      category: 'solar_system',
      constellation: '黄道带',
      ra: Math.round(sunRaHours * 100) / 100,
      dec: Math.round(sunDecDeg * 100) / 100,
      magnitude: -26.7,
      type: '恒星',
      size: "32' 00\"",
      description: '⚠️严正警告：绝不能直接用望远镜看太阳！必须在127SLT物镜前端加装专业巴德膜太阳滤镜。可观测黑子群与米粒组织。',
      recommendedEyepiece: '25mm',
    },
  ];
}

/**
 * Master catalog of celestial objects for Celestron 127SLT
 * Includes Messier objects, bright stars, and alignment stars
 */
export const CELESTIAL_CATALOG: CelestialObject[] = [
  // --- MESSIER OBJECTS ---
  {
    id: 'm42',
    name: 'M42 (NGC 1976)',
    chineseName: '猎户座大星云',
    category: 'messier',
    constellation: '猎户座 (Ori)',
    ra: 5.588, // 05h 35.3m
    dec: -5.39,
    magnitude: 4.0,
    type: '发射星云 / 弥漫星云',
    size: "65' x 60'",
    description: '夜空中最绚丽的发光星云，肉眼可见。127SLT配25mm目镜视场极美，中央四合星（梯形星官）清晰分立，翼状弥漫气体云如鸟翼舒展。',
    bestSeason: '冬季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm31',
    name: 'M31 (NGC 224)',
    chineseName: '仙女座大星系',
    category: 'messier',
    constellation: '仙女座 (And)',
    ra: 0.712, // 00h 42.7m
    dec: 41.27,
    magnitude: 3.4,
    type: '螺旋星系',
    size: "178' x 63'",
    description: '银河系的近邻姐妹星系，距地球约250万光年。25mm目镜下可见其明亮的核心及延伸的卵形光晕，视场中还可同时捕捉其伴星系M32和M110。',
    bestSeason: '秋季/冬季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm45',
    name: 'M45',
    chineseName: '昴星团 (七姊妹星团)',
    category: 'messier',
    constellation: '金牛座 (Tau)',
    ra: 3.79, // 03h 47.4m
    dec: 24.11,
    magnitude: 1.6,
    type: '疏散星团',
    size: "110'",
    description: '极璀璨的年轻疏散星团。在127SLT的25mm目镜下如同一捧散落在黑天鹅绒上的蓝白色钻石，极为华丽。',
    bestSeason: '冬季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm13',
    name: 'M13 (NGC 6205)',
    chineseName: '武仙座大球状星团',
    category: 'messier',
    constellation: '武仙座 (Her)',
    ra: 16.695, // 16h 41.7m
    dec: 36.46,
    magnitude: 5.8,
    type: '球状星团',
    size: "20'",
    description: '北天最宏伟的球状星团，包含数十万颗恒星。127SLT用9mm或15mm目镜可将星团边缘的大量恒星分解为细碎的点点繁星，核心极紧凑。',
    bestSeason: '春季/夏季',
    recommendedEyepiece: '9mm',
  },
  {
    id: 'm57',
    name: 'M57 (NGC 6720)',
    chineseName: '指环星云 (天琴座环状星云)',
    category: 'messier',
    constellation: '天琴座 (Lyr)',
    ra: 18.893, // 18h 53.6m
    dec: 33.03,
    magnitude: 8.8,
    type: '行星状星云',
    size: "1.4' x 1.0'",
    description: '濒死恒星抛出的气体外壳，形如一枚漂浮在深空的翡翠烟圈。127SLT长焦比非常适合小视场高倍观测此天体，9mm目镜下环状中空结构极分明。',
    bestSeason: '夏季/秋季',
    recommendedEyepiece: '9mm',
  },
  {
    id: 'm27',
    name: 'M27 (NGC 6853)',
    chineseName: '哑铃星云',
    category: 'messier',
    constellation: '狐狸座 (Vul)',
    ra: 19.993, // 19h 59.6m
    dec: 22.72,
    magnitude: 7.5,
    type: '行星状星云',
    size: "8.0' x 5.6'",
    description: '人类发现的第一个行星状星云。形态呈明显的哑铃状或苹果核外形，对比度高，在127SLT视场中极为显著。',
    bestSeason: '夏季/秋季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm51',
    name: 'M51 (NGC 5194)',
    chineseName: '涡状星系 (Whirlpool Galaxy)',
    category: 'messier',
    constellation: '猎犬座 (CVn)',
    ra: 13.498, // 13h 29.9m
    dec: 47.2,
    magnitude: 8.4,
    type: '旋涡星系',
    size: "11' x 7'",
    description: '正面对向我们的著名相互作用双星系。暗空条件下用127SLT搭配25mm目镜可分辨主星系明亮核区及其伴星系NGC 5195。',
    bestSeason: '春季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm81',
    name: 'M81 (NGC 3031)',
    chineseName: '波德星系 (大熊座旋涡星系)',
    category: 'messier',
    constellation: '大熊座 (UMa)',
    ra: 9.927, // 09h 55.6m
    dec: 69.07,
    magnitude: 6.9,
    type: '旋涡星系',
    size: "27' x 14'",
    description: '大熊座中最明亮的星系之一。核心明亮紧凑，常与旁边的M82雪茄星系同场观测，是春季北天的经典目标。',
    bestSeason: '春季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm82',
    name: 'M82 (NGC 3034)',
    chineseName: '雪茄星系 (星暴星系)',
    category: 'messier',
    constellation: '大熊座 (UMa)',
    ra: 9.93, // 09h 55.8m
    dec: 69.68,
    magnitude: 8.4,
    type: '侧向星暴星系',
    size: "11' x 4'",
    description: '剧烈的恒星形成星系，呈狭长的雪茄形态，内部有明显的尘埃带不规则截断。与M81仅相距0.5度。',
    bestSeason: '春季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm8',
    name: 'M8 (NGC 6523)',
    chineseName: '礁湖星云 (Lagoon Nebula)',
    category: 'messier',
    constellation: '人马座 (Sgr)',
    ra: 18.06, // 18h 03.6m
    dec: -24.38,
    magnitude: 6.0,
    type: '发射星云 / 恒星形成区',
    size: "90' x 40'",
    description: '银河银心方向的宏大星云，内部包含由暗尘埃带切开的明亮区域以及年轻疏散星团NGC 6530。夏季低空必看目标。',
    bestSeason: '夏季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm20',
    name: 'M20 (NGC 6514)',
    chineseName: '三叶星云 (Trifid Nebula)',
    category: 'messier',
    constellation: '人马座 (Sgr)',
    ra: 18.04, // 18h 02.4m
    dec: -23.03,
    magnitude: 6.3,
    type: '发射与反射星云',
    size: "28'",
    description: '暗尘埃通道将发光气体星云分割为三瓣，中心有多合星照亮。与M8相邻，同为夏季经典。',
    bestSeason: '夏季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm1',
    name: 'M1 (NGC 1952)',
    chineseName: '蟹状星云 (公元1054年超新星遗迹)',
    category: 'messier',
    constellation: '金牛座 (Tau)',
    ra: 5.575, // 05h 34.5m
    dec: 22.01,
    magnitude: 8.4,
    type: '超新星遗迹 (脉冲星风云)',
    size: "6' x 4'",
    description: '中国宋代《宋会要》详细记载的客星爆发遗迹，中心藏有一颗每秒自转30次的脉冲星。127SLT目镜下呈现清晰椭圆雾状光斑。',
    bestSeason: '冬季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm44',
    name: 'M44 (NGC 2632)',
    chineseName: '鬼星团 / 蜂巢星团',
    category: 'messier',
    constellation: '巨蟹座 (Cnc)',
    ra: 8.67, // 08h 40.4m
    dec: 19.67,
    magnitude: 3.7,
    type: '疏散星团',
    size: "95'",
    description: '肉眼隐约可见的一团雾气，伽利略最早用望远镜将其分解为数十颗星。25mm目镜下群星如蜂群般涌现。',
    bestSeason: '春季/冬季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'm11',
    name: 'M11 (NGC 6705)',
    chineseName: '野鸭星团',
    category: 'messier',
    constellation: '盾牌座 (Sct)',
    ra: 18.85, // 18h 51.1m
    dec: -6.27,
    magnitude: 5.8,
    type: '致密疏散星团',
    size: "14'",
    description: '银河系中已知最致密、恒星数量最多的疏散星团之一，形态犹如一群飞行中的野鸭V字队形，星光极为密集。',
    bestSeason: '夏季',
    recommendedEyepiece: '9mm',
  },

  // --- BRIGHT ALIGNMENT STARS (三星/双星校准推荐亮星) ---
  {
    id: 'polaris',
    name: 'Polaris (Alpha UMi)',
    chineseName: '勾陈一 (北极星)',
    category: 'star',
    constellation: '小熊座 (UMi)',
    ra: 2.53, // 02h 31.8m
    dec: 89.26,
    magnitude: 1.98,
    type: '三合星 / 造父变星',
    description: '北半球极轴对准与望远镜水平校准的关键基准星！在127SLT高倍下可清晰看到它微弱的8.7等伴星Polaris B。',
    recommendedEyepiece: '9mm',
  },
  {
    id: 'sirius',
    name: 'Sirius (Alpha CMa)',
    chineseName: '天狼星 (大犬座主星)',
    category: 'star',
    constellation: '大犬座 (CMa)',
    ra: 6.75, // 06h 45.1m
    dec: -16.72,
    magnitude: -1.46,
    type: '全天第一亮星 / 双星',
    description: '全天夜空中视亮度最高的恒星，散发纯净蓝白色光芒。由于极高的亮度，是冬季进行星特朗GoTo校准的最佳首选星。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'vega',
    name: 'Vega (Alpha Lyr)',
    chineseName: '织女一 (天琴座主星)',
    category: 'star',
    constellation: '天琴座 (Lyr)',
    ra: 18.615, // 18h 36.9m
    dec: 38.78,
    magnitude: 0.03,
    type: '夏季大三角主星 / A0V蓝白星',
    description: '北天夜空第二亮星，视星等校准的传统零点基准。夏秋季节最佳校准星，极为耀眼。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'altair',
    name: 'Altair (Alpha Aql)',
    chineseName: '河鼓二 (牛郎星)',
    category: 'star',
    constellation: '天鹰座 (Aql)',
    ra: 19.846, // 19h 50.8m
    dec: 8.87,
    magnitude: 0.77,
    type: '夏季大三角主星 / 极速自转恒星',
    description: '夏季大三角南顶角，距离地球仅16.7光年。光芒清澈，适合与织女星搭配做双星校准。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'deneb',
    name: 'Deneb (Alpha Cyg)',
    chineseName: '天津四 (天鹅座主星)',
    category: 'star',
    constellation: '天鹅座 (Cyg)',
    ra: 20.69, // 20h 41.4m
    dec: 45.28,
    magnitude: 1.25,
    type: '白超巨星 / 夏季大三角',
    description: '银河系中最明亮的超巨星之一，实际光度是太阳的数万倍。高仰角天区极优的对准参考星。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'betelgeuse',
    name: 'Betelgeuse (Alpha Ori)',
    chineseName: '参宿四 (猎户座红超巨星)',
    category: 'star',
    constellation: '猎户座 (Ori)',
    ra: 5.92, // 05h 55.2m
    dec: 7.41,
    magnitude: 0.5,
    type: '红超巨星 / 变星',
    size: '已膨胀至木星轨道大小',
    description: '肉眼可见鲜艳橘红色的濒死超巨星，随时可能爆发为超新星。在望远镜中呈现温润的琥珀红宝石色泽。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'rigel',
    name: 'Rigel (Beta Ori)',
    chineseName: '参宿七 (猎户座蓝超巨星)',
    category: 'star',
    constellation: '猎户座 (Ori)',
    ra: 5.242, // 05h 14.5m
    dec: -8.2,
    magnitude: 0.12,
    type: '蓝白超巨星 / 聚星系统',
    description: '猎户座西南角的明亮耀眼之星。127SLT光学极佳时可在眩光近处分辨其6.7等的小伴星Rigel B。',
    recommendedEyepiece: '9mm',
  },
  {
    id: 'arcturus',
    name: 'Arcturus (Alpha Boo)',
    chineseName: '大角星 (牧夫座主星)',
    category: 'star',
    constellation: '牧夫座 (Boo)',
    ra: 14.26, // 14h 15.7m
    dec: 19.18,
    magnitude: -0.05,
    type: '橙巨星 / 春季大三角',
    description: '北半球天空中视亮度仅次于天狼星的第二亮恒星，呈金黄色。顺着北斗七星斗柄延伸即可找到。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'capella',
    name: 'Capella (Alpha Aur)',
    chineseName: '五车二 (御夫座主星)',
    category: 'star',
    constellation: '御夫座 (Aur)',
    ra: 5.28, // 05h 16.7m
    dec: 45.99,
    magnitude: 0.08,
    type: '四合星系统 / 金黄色巨星',
    description: '北天高纬度常年可见明亮黄星，冬季天顶附近极为显眼，是绝佳的高空校准参考星。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'aldebaran',
    name: 'Aldebaran (Alpha Tau)',
    chineseName: '毕宿五 (金牛座之眼)',
    category: 'star',
    constellation: '金牛座 (Tau)',
    ra: 4.598, // 04h 35.9m
    dec: 16.51,
    magnitude: 0.85,
    type: '红巨星 / 毕星团前景星',
    description: '金牛座中闪耀的红色巨眼，位于V字形的毕星团前端。色泽浓烈，对比鲜明。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'antares',
    name: 'Antares (Alpha Sco)',
    chineseName: '心宿二 (大火星 / 天蝎之主)',
    category: 'star',
    constellation: '天蝎座 (Sco)',
    ra: 16.49, // 16h 29.4m
    dec: -26.43,
    magnitude: 1.06,
    type: '红超巨星 / 慢不规则变星',
    description: '中国古代称“大火”，七月流火即指此星西沉。夏季南天极富魅力的红超巨星，附近有丰富的反光星云。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'spica',
    name: 'Spica (Alpha Vir)',
    chineseName: '角宿一 (室女座主星)',
    category: 'star',
    constellation: '室女座 (Vir)',
    ra: 13.42, // 13h 25.2m
    dec: -11.16,
    magnitude: 0.98,
    type: '分光双星 / 蓝白巨星',
    description: '春季大曲线的终点，散发清爽纯净的蓝白色光芒，标志着春季星空的壮丽。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'alberio',
    name: 'Albireo (Beta Cyg)',
    chineseName: '辇道增七 (天鹅座绝美双星)',
    category: 'star',
    constellation: '天鹅座 (Cyg)',
    ra: 19.51, // 19h 30.7m
    dec: 27.96,
    magnitude: 3.05,
    type: '色彩对比双星 (金黄与黄玉蓝)',
    description: '天文望远镜观测中最著名的绝美色彩对比双星！一颗为3.1等的金色巨星，一颗为5.1等的青蓝色恒星，在127SLT的25mm或9mm目镜下犹如黄金与蓝宝石并蒂交辉。',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'castor',
    name: 'Castor (Alpha Gem)',
    chineseName: '北河二 (双子座聚星)',
    category: 'star',
    constellation: '双子座 (Gem)',
    ra: 7.576, // 07h 34.6m
    dec: 31.89,
    magnitude: 1.58,
    type: '经典物理六合星系统',
    description: '127SLT配9mm高倍目镜能非常清晰地将北河二分解为两颗洁白耀眼的明亮恒星（Castor A与Castor B），角距约5角秒。',
    recommendedEyepiece: '9mm',
  },
  {
    id: 'mizar_alcor',
    name: 'Mizar & Alcor (Zeta UMa)',
    chineseName: '开阳与辅 (古代视力测试双星)',
    category: 'star',
    constellation: '大熊座 (UMa)',
    ra: 13.398, // 13h 23.9m
    dec: 54.92,
    magnitude: 2.23,
    type: '目视多合星',
    description: '北斗七星斗柄倒数第二颗星。肉眼即可看到旁边的辅星，而在127SLT望远镜中，开阳自身又被分解为开阳A和开阳B一对紧密双星！',
    recommendedEyepiece: '25mm',
  },

  // --- DEEP SKY HIGHLIGHTS ---
  {
    id: 'ngc869',
    name: 'Double Cluster (NGC 869 & 884)',
    chineseName: '英仙座双星团 (剑柄星团)',
    category: 'deep_sky',
    constellation: '英仙座 (Per)',
    ra: 2.33, // 02h 20m
    dec: 57.13,
    magnitude: 3.7,
    type: '双疏散星团',
    size: "60'",
    description: '两个极为富饶的年轻疏散星团紧邻并存，在127SLT配25mm目镜下同框展示，密密麻麻的数百颗宝石般恒星令人震撼。',
    bestSeason: '秋季/冬季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'ngc7000',
    name: 'NGC 7000',
    chineseName: '北美洲星云',
    category: 'deep_sky',
    constellation: '天鹅座 (Cyg)',
    ra: 20.98, // 20h 59m
    dec: 44.52,
    magnitude: 4.0,
    type: '大视场发射星云',
    size: "120' x 100'",
    description: '外形酷似北美大陆轮廓的宏大电离氢云，天津四附近。需在极佳暗空配合UHC或OIII双窄带滤镜。',
    bestSeason: '夏季',
    recommendedEyepiece: '25mm',
  },
  {
    id: 'ngc6960',
    name: 'NGC 6960 (Veil Nebula)',
    chineseName: '面纱星云 (西侧女巫扫帚)',
    category: 'deep_sky',
    constellation: '天鹅座 (Cyg)',
    ra: 20.76, // 20h 45.6m
    dec: 30.72,
    magnitude: 7.0,
    type: '超新星遗迹丝状云',
    size: "70' x 6'",
    description: '古老超新星爆发冲击波激发的丝状发光气体，穿过天鹅座52号星。暗空下用OIII滤镜能看到细腻的丝缕状纤维。',
    bestSeason: '夏季',
    recommendedEyepiece: '25mm',
  },
];

export interface ConstellationDef {
  id: string;
  name: string;
  chineseName: string;
  centerRa: number;
  centerDec: number;
  segments: Array<[[number, number], [number, number]]>; // [[ra1, dec1], [ra2, dec2]]
}

export const CONSTELLATION_DEFS: ConstellationDef[] = [
  // 猎户座 Orion
  {
    id: 'ori',
    name: 'Orion',
    chineseName: '猎户座',
    centerRa: 5.6,
    centerDec: 2.0,
    segments: [
      // 猎户腰带 (Alnitak - Alnilam - Mintaka)
      [[5.679, -1.94], [5.603, -1.2],],
      [[5.603, -1.2], [5.533, -0.3],],
      // 参宿四 (Betelgeuse) 到腰带
      [[5.92, 7.41], [5.679, -1.94]],
      // 参宿五 (Bellatrix) 到腰带
      [[5.419, 6.35], [5.533, -0.3]],
      // 双肩相连
      [[5.92, 7.41], [5.419, 6.35]],
      // 参宿六 (Saiph) 到腰带
      [[5.795, -9.67], [5.679, -1.94]],
      // 参宿七 (Rigel) 到腰带
      [[5.242, -8.2], [5.533, -0.3]],
      // 双足相连
      [[5.795, -9.67], [5.242, -8.2]],
      // 猎户宝剑 (M42)
      [[5.588, -5.39], [5.603, -1.2]],
    ],
  },
  // 大熊座 / 北斗七星 Ursa Major
  {
    id: 'uma',
    name: 'Ursa Major',
    chineseName: '大熊座 (北斗七星)',
    centerRa: 11.5,
    centerDec: 55.0,
    segments: [
      // 斗勺：天枢(Dubhe) - 天璇(Merak) - 天玑(Phecda) - 天权(Megrez) - 天枢
      [[11.06, 61.75], [11.03, 56.38]],
      [[11.03, 56.38], [11.9, 53.69]],
      [[11.9, 53.69], [12.25, 57.03]],
      [[12.25, 57.03], [11.06, 61.75]],
      // 斗柄：天权(Megrez) - 玉衡(Alioth) - 开阳(Mizar) - 摇光(Alkaid)
      [[12.25, 57.03], [12.9, 55.96]],
      [[12.9, 55.96], [13.4, 54.92]],
      [[13.4, 54.92], [13.79, 49.31]],
    ],
  },
  // 仙后座 Cassiopeia (W字)
  {
    id: 'cas',
    name: 'Cassiopeia',
    chineseName: '仙后座 (王后之冠)',
    centerRa: 1.0,
    centerDec: 60.0,
    segments: [
      [[0.15, 59.15], [0.68, 56.54]], // Segin - Ruchbah
      [[0.68, 56.54], [0.94, 60.72]], // Ruchbah - Gamma Cas
      [[0.94, 60.72], [0.67, 56.54]], // Gamma Cas - Schedar
      [[0.67, 56.54], [0.15, 59.15]], // Schedar - Caph
      [[0.94, 60.72], [0.15, 59.15]],
    ],
  },
  // 天鹅座 Cygnus (北十字)
  {
    id: 'cyg',
    name: 'Cygnus',
    chineseName: '天鹅座 (北十字)',
    centerRa: 20.5,
    centerDec: 42.0,
    segments: [
      // 躯干：天津四(Deneb) - 天津九(Sadr) - 辇道增七(Albireo)
      [[20.69, 45.28], [20.37, 40.26]],
      [[20.37, 40.26], [19.51, 27.96]],
      // 双翼：天津一(Gienah) - 天津九(Sadr) - 奚仲二(Delta Cyg)
      [[20.77, 33.97], [20.37, 40.26]],
      [[20.37, 40.26], [19.75, 45.13]],
    ],
  },
  // 天琴座 Lyra
  {
    id: 'lyr',
    name: 'Lyra',
    chineseName: '天琴座',
    centerRa: 18.8,
    centerDec: 36.0,
    segments: [
      [[18.615, 38.78], [18.84, 36.9]], // Vega - Epsilon Lyr
      [[18.84, 36.9], [18.9, 32.69]], // Epsilon Lyr - Sulafat
      [[18.9, 32.69], [18.83, 33.36]], // Sulafat - Sheliak
      [[18.83, 33.36], [18.615, 38.78]], // Sheliak - Vega
    ],
  },
  // 金牛座 Taurus
  {
    id: 'tau',
    name: 'Taurus',
    chineseName: '金牛座',
    centerRa: 4.5,
    centerDec: 18.0,
    segments: [
      [[4.598, 16.51], [5.44, 28.61]], // Aldebaran - Elnath
      [[4.598, 16.51], [5.63, 21.14]], // Aldebaran - Tianguan
      [[4.598, 16.51], [4.48, 15.63]], // V字牛脸
      [[4.48, 15.63], [4.33, 15.96]],
      [[4.33, 15.96], [3.79, 24.11]], // 到昴星团 M45
    ],
  },
  // 双子座 Gemini
  {
    id: 'gem',
    name: 'Gemini',
    chineseName: '双子座',
    centerRa: 7.3,
    centerDec: 26.0,
    segments: [
      [[7.576, 31.89], [7.755, 28.03]], // Castor - Pollux
      [[7.576, 31.89], [6.63, 16.4]], // Castor 腿部
      [[7.755, 28.03], [7.07, 20.57]], // Pollux 腿部
      [[7.07, 20.57], [6.63, 16.4]],
    ],
  },
  // 狮子座 Leo
  {
    id: 'leo',
    name: 'Leo',
    chineseName: '狮子座',
    centerRa: 10.7,
    centerDec: 15.0,
    segments: [
      // 镰刀头：轩辕十四(Regulus) - 轩辕十三(Eta Leo) - 轩辕十二(Algieba) - 轩辕十一(Adhafera) - 轩辕十(Ras Elased)
      [[10.14, 11.97], [10.12, 16.76]],
      [[10.12, 16.76], [10.33, 19.84]],
      [[10.33, 19.84], [10.28, 23.42]],
      [[10.28, 23.42], [9.76, 26.01]],
      // 身体：轩辕十二 - 轩辕九(Zosma) - 五帝座一(Denebola) - 轩辕十四
      [[10.33, 19.84], [11.23, 20.52]],
      [[11.23, 20.52], [11.82, 14.57]],
      [[11.82, 14.57], [11.24, 15.43]],
      [[11.24, 15.43], [10.14, 11.97]],
    ],
  },
  // 天蝎座 Scorpius
  {
    id: 'sco',
    name: 'Scorpius',
    chineseName: '天蝎座',
    centerRa: 16.9,
    centerDec: -30.0,
    segments: [
      [[16.09, -22.62], [16.01, -19.8]], // 房宿三 - 房宿四
      [[16.09, -22.62], [16.35, -25.59]], // 房宿三 - 心宿一
      [[16.35, -25.59], [16.49, -26.43]], // 心宿一 - 心宿二 (Antares)
      [[16.49, -26.43], [16.84, -34.29]], // 心宿二 - 尾宿二
      [[16.84, -34.29], [17.56, -37.1]], // 尾宿二 - 尾宿八 (Shaula)
      [[17.56, -37.1], [17.71, -39.03]], // 蝎尾毒针
    ],
  },
  // 牧夫座 Boötes
  {
    id: 'boo',
    name: 'Boötes',
    chineseName: '牧夫座 (春夜风筝)',
    centerRa: 14.5,
    centerDec: 30.0,
    segments: [
      [[14.26, 19.18], [14.68, 27.07]], // Arcturus - Izar
      [[14.68, 27.07], [14.53, 38.3]], // Izar - Seginus
      [[14.53, 38.3], [15.03, 40.39]], // Seginus - Nekkar
      [[15.03, 40.39], [14.26, 19.18]], // 风筝合拢
    ],
  },
  // 飞马座与仙女座 Pegasus & Andromeda
  {
    id: 'peg_and',
    name: 'Pegasus & Andromeda',
    chineseName: '飞马座四边形与仙女座',
    centerRa: 23.0,
    centerDec: 28.0,
    segments: [
      // 飞马座四联四边形
      [[23.08, 15.21], [23.06, 28.08]], // Markab - Scheat
      [[23.06, 28.08], [0.14, 29.09]], // Scheat - Alpheratz (壁宿二)
      [[0.14, 29.09], [0.22, 15.18]], // Alpheratz - Algenib
      [[0.22, 15.18], [23.08, 15.21]], // Algenib - Markab
      // 仙女座身体延伸线
      [[0.14, 29.09], [1.16, 35.62]], // Alpheratz - Mirach
      [[1.16, 35.62], [2.06, 42.33]], // Mirach - Almach
      // 指向 M31 仙女座星系
      [[1.16, 35.62], [0.712, 41.27]],
    ],
  },
  // 人马座 Sagittarius (茶壶)
  {
    id: 'sgr',
    name: 'Sagittarius',
    chineseName: '人马座 (茶壶星群)',
    centerRa: 19.0,
    centerDec: -25.0,
    segments: [
      [[18.4, -25.42], [18.46, -29.83]], // 壶盖顶 - 壶底
      [[18.46, -29.83], [18.93, -29.88]], // 壶底
      [[18.93, -29.88], [19.04, -27.67]], // 壶柄
      [[19.04, -27.67], [18.4, -25.42]], // 壶顶连线
      [[18.04, -29.88], [18.46, -29.83]], // 壶嘴
    ],
  },
];

/**
 * Generate a rich deterministic star field across the full sky
 */
export const FAINT_STARS: Array<{ ra: number; dec: number; mag: number }> = (() => {
  const list: Array<{ ra: number; dec: number; mag: number }> = [];
  // Pseudorandom deterministic seed
  let seed = 127;
  const rnd = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // 600 realistic star positions
  for (let i = 0; i < 600; i++) {
    const ra = rnd() * 24;
    const u = rnd() * 2 - 1; // uniform in sin(dec)
    const dec = (Math.asin(u) * 180) / Math.PI;
    const mag = 2.5 + rnd() * 3.8; // 2.5 to 6.3 mag
    list.push({ ra, dec, mag: Math.round(mag * 10) / 10 });
  }
  return list;
})();

export function getAllCelestialObjects(date: Date = new Date()): CelestialObject[] {
  const planets = calculatePlanetaryPositions(date) as CelestialObject[];
  return [...planets, ...CELESTIAL_CATALOG];
}

/**
 * Calculate visibility state of an object
 */
export function getVisibilityStatus(alt: number): {
  status: 'optimal' | 'good' | 'low' | 'below_horizon';
  label: string;
  badgeClass: string;
} {
  if (alt >= 30) {
    return {
      status: 'optimal',
      label: '最佳观测仰角 (>30°)',
      badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };
  } else if (alt >= 15) {
    return {
      status: 'good',
      label: '可见 (15° - 30°)',
      badgeClass: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    };
  } else if (alt > 0) {
    return {
      status: 'low',
      label: '近地平线低空 (<15°)',
      badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
  } else {
    return {
      status: 'below_horizon',
      label: '地平线下不可见',
      badgeClass: 'bg-slate-800 text-slate-500 border-slate-700',
    };
  }
}

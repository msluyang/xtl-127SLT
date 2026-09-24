import {
  degreesToNexStar16Hex,
  degreesToNexStar32Hex,
  degreesToRaHours,
  equatorialToHorizontal,
  horizontalToEquatorial,
  nexStar16HexToDegrees,
  nexStar32HexToDegrees,
  raHoursToDegrees,
  TELESCOPE_SPECS,
} from './astronomy';
import {
  ConnectionMode,
  ObserverLocation,
  TelescopeState,
  TrackingMode,
  TrackingRate,
} from '../types/telescope';

export type TelescopeEventCallback = (state: TelescopeState) => void;

export class CelestronNexStarBridge {
  private state: TelescopeState = {
    connected: false,
    mode: 'simulator',
    host: '192.168.1.100',
    port: 8000,
    serialPortName: '/dev/ttyUSB0',
    baudRate: 9600,

    ra: 5.588, // Initially pointing near M42 (Orion)
    dec: -5.39,
    az: 180.0,
    alt: 45.0,

    targetRa: null,
    targetDec: null,
    targetAz: null,
    targetAlt: null,
    targetName: null,

    isSlewing: false,
    slewProgress: 0,
    trackingMode: 'alt_az',
    trackingRate: 'sidereal',
    slewRate: 9,
    isSpiralSearching: false,

    isAligned: true,
    alignmentStarsCount: 2,

    handControllerVersion: 'NexStar+ v5.31.9200',
    firmwareModel: 'NexStar 127SLT (Model 0x07)',
    pingMs: 12,
    lastHeartbeat: Date.now(),
  };

  private listeners: Set<TelescopeEventCallback> = new Set();
  private ws: WebSocket | null = null;
  private serialPort: any = null;
  private serialWriter: any = null;
  private serialReader: any = null;
  private simulationInterval: any = null;
  private observerLocation: ObserverLocation = {
    name: '默认观测点 (北京/北半球)',
    latitude: 39.9,
    longitude: 116.4,
    elevation: 50,
  };

  // Spiral search parameters
  private spiralStep = 0;
  private spiralAngle = 0;
  private spiralCenterAlt = 45;
  private spiralCenterAz = 180;

  constructor() {
    this.startSimulationLoop();
  }

  public subscribe(callback: TelescopeEventCallback): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((fn) => fn(currentState));
  }

  public getState(): TelescopeState {
    return { ...this.state };
  }

  public setObserverLocation(loc: ObserverLocation) {
    this.observerLocation = loc;
    // Update Horizontal Alt/Az from current RA/Dec
    const horiz = equatorialToHorizontal(this.state.ra, this.state.dec, loc);
    this.state.alt = horiz.alt;
    this.state.az = horiz.az;
    this.notify();
  }

  public getObserverLocation(): ObserverLocation {
    return this.observerLocation;
  }

  // --- CONNECTIVITY METHODS ---

  /**
   * Connect to Raspberry Pi daemon via WebSocket
   */
  public async connectRaspberryPi(host: string, port: number = 8000): Promise<boolean> {
    this.disconnect();
    this.state.host = host;
    this.state.port = port;
    this.state.mode = 'raspberry_pi_ws';

    return new Promise((resolve) => {
      try {
        const wsUrl = `ws://${host}:${port}/ws`;
        this.ws = new WebSocket(wsUrl);

        const connectionTimeout = setTimeout(() => {
          if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
            this.ws.close();
            this.state.connected = false;
            this.notify();
            resolve(false);
          }
        }, 4000);

        this.ws.onopen = () => {
          clearTimeout(connectionTimeout);
          this.state.connected = true;
          this.state.lastHeartbeat = Date.now();
          this.notify();

          // Request version and status
          this.sendRawNexStarCommand('V'); // Version
          this.sendRawNexStarCommand('m'); // Model
          this.sendRawNexStarCommand('e'); // Precise RA/Dec
          resolve(true);
        };

        this.ws.onmessage = (event) => {
          this.handlePiDaemonMessage(event.data);
        };

        this.ws.onerror = (err) => {
          console.warn('WebSocket error to Raspberry Pi:', err);
          this.state.connected = false;
          this.notify();
        };

        this.ws.onclose = () => {
          this.state.connected = false;
          this.notify();
        };
      } catch (err) {
        console.error('Failed to initiate WebSocket connection:', err);
        this.state.connected = false;
        this.notify();
        resolve(false);
      }
    });
  }

  /**
   * Connect directly using Web Serial API (Chrome/Edge running on Pi or PC)
   */
  public async connectWebSerial(baudRate: number = 9600): Promise<boolean> {
    if (!('serial' in navigator)) {
      throw new Error('当前浏览器不支持 Web Serial API，请使用 Chrome/Edge，或者通过树莓派 WebSocket 模式连接。');
    }

    try {
      this.disconnect();
      // @ts-expect-error navigator.serial is standard in Chromium
      this.serialPort = await navigator.serial.requestPort();
      await this.serialPort.open({ baudRate: baudRate });

      this.state.mode = 'web_serial';
      this.state.connected = true;
      this.state.baudRate = baudRate;
      this.notify();

      this.startSerialReading();
      this.sendRawNexStarCommand('V');
      this.sendRawNexStarCommand('e');

      return true;
    } catch (err) {
      console.error('Web Serial connect failed:', err);
      this.state.connected = false;
      this.notify();
      return false;
    }
  }

  /**
   * Switch to built-in virtual observatory simulator
   */
  public enableSimulator() {
    this.disconnect();
    this.state.mode = 'simulator';
    this.state.connected = true;
    this.notify();
  }

  public disconnect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }

    if (this.serialReader) {
      try {
        this.serialReader.cancel();
      } catch (e) {
        // ignore
      }
      this.serialReader = null;
    }

    if (this.serialPort) {
      try {
        this.serialPort.close();
      } catch (e) {
        // ignore
      }
      this.serialPort = null;
    }

    this.state.connected = this.state.mode === 'simulator';
    this.notify();
  }

  // --- RAW COMMANDS & DISPATCH ---

  public sendRawNexStarCommand(cmd: string): void {
    if (this.state.mode === 'raspberry_pi_ws' && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'nexstar_cmd', command: cmd }));
    } else if (this.state.mode === 'web_serial' && this.serialPort && this.serialPort.writable) {
      const encoder = new TextEncoder();
      const writer = this.serialPort.writable.getWriter();
      writer.write(encoder.encode(cmd));
      writer.releaseLock();
    } else if (this.state.mode === 'simulator') {
      this.handleSimulatorCommand(cmd);
    }
  }

  // --- CELESTRON 127SLT ACTIONS ---

  /**
   * GoTo a specific celestial target (RA/Dec)
   */
  public goToTarget(targetName: string, ra: number, dec: number): void {
    this.state.targetName = targetName;
    this.state.targetRa = ra;
    this.state.targetDec = dec;

    const horiz = equatorialToHorizontal(ra, dec, this.observerLocation);
    this.state.targetAlt = horiz.alt;
    this.state.targetAz = horiz.az;

    this.state.isSlewing = true;
    this.state.slewProgress = 0;
    this.state.isSpiralSearching = false;

    // Send Celestron NexStar protocol 32-bit Goto RA/DEC command: 'R<RA_HEX>,<DEC_HEX>'
    const raHex = degreesToNexStar32Hex(raHoursToDegrees(ra));
    const decHex = degreesToNexStar32Hex(dec);
    this.sendRawNexStarCommand(`R${raHex},${decHex}`);

    this.notify();
  }

  /**
   * GoTo horizontal coordinates (Alt/Az)
   */
  public goToAltAz(az: number, alt: number, targetName: string = '手动方位仰角'): void {
    this.state.targetName = targetName;
    this.state.targetAz = az;
    this.state.targetAlt = alt;

    const eq = horizontalToEquatorial(alt, az, this.observerLocation);
    this.state.targetRa = eq.ra;
    this.state.targetDec = eq.dec;

    this.state.isSlewing = true;
    this.state.slewProgress = 0;
    this.state.isSpiralSearching = false;

    // Celestron protocol 'b<AZM_HEX>,<ALT_HEX>' (16-bit) or 'B' (32-bit)
    const azHex = degreesToNexStar16Hex(az);
    const altHex = degreesToNexStar16Hex(alt);
    this.sendRawNexStarCommand(`b${azHex},${altHex}`);

    this.notify();
  }

  /**
   * Cancel / Emergency Stop GoTo
   */
  public abortSlew(): void {
    this.state.isSlewing = false;
    this.state.isSpiralSearching = false;
    this.state.targetName = null;
    this.state.targetRa = null;
    this.state.targetDec = null;

    // Celestron protocol Cancel Goto command: 'M'
    this.sendRawNexStarCommand('M');

    // Motor stop pass-through:
    // P 0x03 0x10 0x24 0x00 (Stop Azm)
    // P 0x03 0x11 0x24 0x00 (Stop Alt)
    this.sendRawNexStarCommand('P\x03\x10\x24\x00\x00\x00\x00');
    this.sendRawNexStarCommand('P\x03\x11\x24\x00\x00\x00\x00');

    this.notify();
  }

  /**
   * Manual slew in specific direction with selected rate (1-9)
   * dir: 'N' | 'S' | 'E' | 'W' | 'STOP_N_S' | 'STOP_E_W' | 'STOP_ALL'
   */
  public manualSlew(direction: 'N' | 'S' | 'E' | 'W' | 'STOP_N_S' | 'STOP_E_W' | 'STOP_ALL', rate: number = this.state.slewRate): void {
    this.state.slewRate = Math.max(1, Math.min(9, rate));
    this.state.isSpiralSearching = false;

    if (direction === 'STOP_ALL') {
      this.abortSlew();
      return;
    }

    if (this.state.mode === 'simulator') {
      const step = (rate * 0.4); // degrees per pulse
      if (direction === 'N') this.state.alt = Math.min(90, this.state.alt + step);
      if (direction === 'S') this.state.alt = Math.max(0, this.state.alt - step);
      if (direction === 'E') this.state.az = (this.state.az - step + 360) % 360;
      if (direction === 'W') this.state.az = (this.state.az + step) % 360;

      // Update RA/Dec from Alt/Az
      const eq = horizontalToEquatorial(this.state.alt, this.state.az, this.observerLocation);
      this.state.ra = eq.ra;
      this.state.dec = eq.dec;
      this.notify();
      return;
    }

    // Celestron NexStar Motor Pass-Through protocol for variable slew:
    // 'P' + chr(3) + dev + dir + rate + chr(0)*3
    // dev: 16 (0x10) = Azimuth / RA, 17 (0x11) = Altitude / Dec
    // dir: 36 (0x24) = Positive, 37 (0x25) = Negative
    const rChar = String.fromCharCode(rate);
    if (direction === 'N') {
      this.sendRawNexStarCommand('P\x03\x11\x24' + rChar + '\x00\x00\x00');
    } else if (direction === 'S') {
      this.sendRawNexStarCommand('P\x03\x11\x25' + rChar + '\x00\x00\x00');
    } else if (direction === 'W') {
      this.sendRawNexStarCommand('P\x03\x10\x24' + rChar + '\x00\x00\x00');
    } else if (direction === 'E') {
      this.sendRawNexStarCommand('P\x03\x10\x25' + rChar + '\x00\x00\x00');
    } else if (direction === 'STOP_N_S') {
      this.sendRawNexStarCommand('P\x03\x11\x24\x00\x00\x00\x00');
    } else if (direction === 'STOP_E_W') {
      this.sendRawNexStarCommand('P\x03\x10\x24\x00\x00\x00\x00');
    }
  }

  /**
   * Precision step nudge for RA/Dec axes or Alt/Az axes
   * stepDegrees: angular distance in degrees (e.g. 1/3600 for 1 arcsec, 1/60 for 1 arcmin, 0.5 for 30 arcmin)
   */
  public precisionNudge(axis: 'ra' | 'dec' | 'alt' | 'az', direction: '+' | '-', stepDegrees: number): void {
    if (axis === 'ra') {
      // 1 hour RA = 15 degrees
      const deltaHours = (stepDegrees / 15) * (direction === '+' ? 1 : -1);
      this.state.ra = ((this.state.ra + deltaHours) % 24 + 24) % 24;
      const horiz = equatorialToHorizontal(this.state.ra, this.state.dec, this.observerLocation);
      this.state.alt = horiz.alt;
      this.state.az = horiz.az;
    } else if (axis === 'dec') {
      const deltaDeg = stepDegrees * (direction === '+' ? 1 : -1);
      this.state.dec = Math.max(-90, Math.min(90, this.state.dec + deltaDeg));
      const horiz = equatorialToHorizontal(this.state.ra, this.state.dec, this.observerLocation);
      this.state.alt = horiz.alt;
      this.state.az = horiz.az;
    } else if (axis === 'alt') {
      const deltaDeg = stepDegrees * (direction === '+' ? 1 : -1);
      this.state.alt = Math.max(0, Math.min(90, this.state.alt + deltaDeg));
      const eq = horizontalToEquatorial(this.state.alt, this.state.az, this.observerLocation);
      this.state.ra = eq.ra;
      this.state.dec = eq.dec;
    } else if (axis === 'az') {
      const deltaDeg = stepDegrees * (direction === '+' ? 1 : -1);
      this.state.az = ((this.state.az + deltaDeg) % 360 + 360) % 360;
      const eq = horizontalToEquatorial(this.state.alt, this.state.az, this.observerLocation);
      this.state.ra = eq.ra;
      this.state.dec = eq.dec;
    }

    if (this.state.mode !== 'simulator') {
      // Send 32-bit Goto RA/Dec to micro-step the motor
      const raHex = degreesToNexStar32Hex(raHoursToDegrees(this.state.ra));
      const decHex = degreesToNexStar32Hex(this.state.dec);
      this.sendRawNexStarCommand(`R${raHex},${decHex}`);
    }

    this.notify();
  }

  /**
   * Set Tracking Mode: Off (0), Alt/Az (1), EQ-North (2), EQ-South (3)
   */
  public setTrackingMode(mode: TrackingMode): void {
    this.state.trackingMode = mode;
    let modeCode = 1;
    if (mode === 'off') modeCode = 0;
    if (mode === 'alt_az') modeCode = 1;
    if (mode === 'eq_north') modeCode = 2;
    if (mode === 'eq_south') modeCode = 3;

    // Protocol: 'T' + chr(mode)
    this.sendRawNexStarCommand(`T${String.fromCharCode(modeCode)}`);
    this.notify();
  }

  /**
   * Set Tracking Rate: Sidereal, Lunar, Solar
   */
  public setTrackingRate(rate: TrackingRate): void {
    this.state.trackingRate = rate;
    this.notify();
  }

  /**
   * Synchronize mount to current target (Celestron Sync 'S' / 's' command)
   * Calibrates telescope encoder to true sky coordinates
   */
  public syncCurrentPosition(targetRa: number, targetDec: number): void {
    this.state.ra = targetRa;
    this.state.dec = targetDec;
    const horiz = equatorialToHorizontal(targetRa, targetDec, this.observerLocation);
    this.state.alt = horiz.alt;
    this.state.az = horiz.az;
    this.state.isAligned = true;
    this.state.alignmentStarsCount += 1;

    // Send Celestron Sync command: 'S<RA_HEX>,<DEC_HEX>' (32-bit)
    const raHex = degreesToNexStar32Hex(raHoursToDegrees(targetRa));
    const decHex = degreesToNexStar32Hex(targetDec);
    this.sendRawNexStarCommand(`S${raHex},${decHex}`);

    this.notify();
  }

  /**
   * Start Spiral Search (螺旋寻星模式)
   * Useful when target is just outside the narrow FOV of 127SLT Maksutov (1500mm focal length)
   */
  public startSpiralSearch(): void {
    if (this.state.isSpiralSearching) {
      this.state.isSpiralSearching = false;
      this.notify();
      return;
    }
    this.state.isSpiralSearching = true;
    this.state.isSlewing = false;
    this.spiralStep = 0;
    this.spiralAngle = 0;
    this.spiralCenterAlt = this.state.alt;
    this.spiralCenterAz = this.state.az;
    this.notify();
  }

  public setSlewRate(rate: number): void {
    this.state.slewRate = Math.max(1, Math.min(9, rate));
    this.notify();
  }

  // --- SIMULATION & INTERNAL LOOPS ---

  private startSimulationLoop() {
    if (this.simulationInterval) clearInterval(this.simulationInterval);

    this.simulationInterval = setInterval(() => {
      const now = Date.now();

      // If slewing towards target, interpolate position smoothly
      if (this.state.isSlewing && this.state.targetAlt !== null && this.state.targetAz !== null) {
        const speed = (TELESCOPE_SPECS.maxSlewSpeedDegPerSec * 0.1); // deg per 100ms
        const dAlt = this.state.targetAlt - this.state.alt;
        let dAz = this.state.targetAz - this.state.az;

        // Shortest angular path around 360 deg
        if (dAz > 180) dAz -= 360;
        if (dAz < -180) dAz += 360;

        const totalDist = Math.sqrt(dAlt * dAlt + dAz * dAz);

        if (totalDist < speed || totalDist < 0.05) {
          // Arrived at destination
          this.state.alt = this.state.targetAlt;
          this.state.az = this.state.targetAz;
          this.state.isSlewing = false;
          this.state.slewProgress = 100;

          // Align RA/Dec exactly
          if (this.state.targetRa !== null && this.state.targetDec !== null) {
            this.state.ra = this.state.targetRa;
            this.state.dec = this.state.targetDec;
          }
        } else {
          // Step towards target
          const stepRatio = Math.min(1, speed / totalDist);
          this.state.alt += dAlt * stepRatio;
          this.state.az = (this.state.az + dAz * stepRatio + 360) % 360;
          this.state.slewProgress = Math.min(99, Math.round((1 - totalDist / 90) * 100));

          // Update instantaneous RA/Dec
          const eq = horizontalToEquatorial(this.state.alt, this.state.az, this.observerLocation);
          this.state.ra = eq.ra;
          this.state.dec = eq.dec;
        }
        this.notify();
      }

      // If Spiral searching
      else if (this.state.isSpiralSearching) {
        this.spiralAngle += 0.25;
        const radius = (this.spiralAngle * 0.08); // Expanding spiral radius in degrees
        this.state.az = (this.spiralCenterAz + radius * Math.cos(this.spiralAngle) + 360) % 360;
        this.state.alt = Math.max(5, Math.min(88, this.spiralCenterAlt + radius * Math.sin(this.spiralAngle)));
        
        const eq = horizontalToEquatorial(this.state.alt, this.state.az, this.observerLocation);
        this.state.ra = eq.ra;
        this.state.dec = eq.dec;
        this.notify();
      }

      // Sidereal tracking drift simulation when not slewing
      else if (this.state.trackingMode !== 'off') {
        // Celestial sphere rotates ~15 deg/hr = 0.00416 deg/sec
        // In Alt/Az tracking mode, mount motor actively compensates for Earth's rotation
        // So RA/Dec remains pinned, and Alt/Az gradually shifts
        const horiz = equatorialToHorizontal(this.state.ra, this.state.dec, this.observerLocation);
        this.state.alt = horiz.alt;
        this.state.az = horiz.az;
      }

      this.state.lastHeartbeat = now;
    }, 100);
  }

  private handleSimulatorCommand(cmd: string) {
    if (cmd === 'V') {
      this.state.handControllerVersion = 'NexStar+ v5.31.9200 (Sim)';
    } else if (cmd === 'm') {
      this.state.firmwareModel = 'NexStar 127SLT [Alt/Az GoTo]';
    } else if (cmd === 'M') {
      this.state.isSlewing = false;
    }
    this.notify();
  }

  private handlePiDaemonMessage(raw: string) {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'telemetry') {
        if (typeof data.ra === 'number') this.state.ra = data.ra;
        if (typeof data.dec === 'number') this.state.dec = data.dec;
        if (typeof data.az === 'number') this.state.az = data.az;
        if (typeof data.alt === 'number') this.state.alt = data.alt;
        if (typeof data.isSlewing === 'boolean') this.state.isSlewing = data.isSlewing;
        if (data.trackingMode) this.state.trackingMode = data.trackingMode;
        if (data.model) this.state.firmwareModel = data.model;
        if (data.version) this.state.handControllerVersion = data.version;
        if (typeof data.ping === 'number') this.state.pingMs = data.ping;
        this.state.lastHeartbeat = Date.now();
        this.notify();
      }
    } catch (e) {
      console.warn('Malformed message from Pi daemon:', raw);
    }
  }

  private async startSerialReading() {
    if (!this.serialPort || !this.serialPort.readable) return;
    const decoder = new TextDecoder();
    this.serialReader = this.serialPort.readable.getReader();

    let buffer = '';
    try {
      while (true) {
        const { value, done } = await this.serialReader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // NexStar responses end with '#'
        let hashIdx;
        while ((hashIdx = buffer.indexOf('#')) !== -1) {
          const response = buffer.substring(0, hashIdx);
          buffer = buffer.substring(hashIdx + 1);
          this.parseNexStarResponse(response);
        }
      }
    } catch (err) {
      console.error('Serial read error:', err);
    } finally {
      if (this.serialReader) {
        this.serialReader.releaseLock();
      }
    }
  }

  private parseNexStarResponse(resp: string) {
    // Check if it's RA/Dec response '34AB,12CE'
    if (resp.includes(',')) {
      const parts = resp.split(',');
      if (parts.length === 2) {
        const raDeg = parts[0].length === 8 ? nexStar32HexToDegrees(parts[0]) : nexStar16HexToDegrees(parts[0]);
        const decDeg = parts[1].length === 8 ? nexStar32HexToDegrees(parts[1]) : nexStar16HexToDegrees(parts[1]);
        this.state.ra = degreesToRaHours(raDeg);
        this.state.dec = decDeg;

        const horiz = equatorialToHorizontal(this.state.ra, this.state.dec, this.observerLocation);
        this.state.alt = horiz.alt;
        this.state.az = horiz.az;
        this.notify();
      }
    }
  }
}

export const telescopeBridge = new CelestronNexStarBridge();

import {
  TimelapseConfig,
  TimelapseSessionState,
  CapturedFrame,
  TimelapseStatus,
} from '../types/telescope';

export type TimelapseListener = (state: TimelapseSessionState) => void;

class TimelapseController {
  private config: TimelapseConfig = {
    intervalSec: 5,
    totalFrames: 120,
    exposureSec: 8,
    settlingDelaySec: 2,
    triggerType: 'gpio_optocoupler',
    gpioShutterPin: 17,
    gpioFocusPin: 27,
    activeLevel: 'low',
    targetFps: 30,
    saveRaw: true,
    prefix: 'CEL127SLT',
  };

  private state: TimelapseSessionState = {
    status: 'idle',
    currentFrame: 0,
    totalFrames: 120,
    elapsedSec: 0,
    remainingSec: 0,
    currentExposureCountdown: 0,
    nextShutterCountdown: 0,
    startTime: null,
    config: { ...this.config },
    capturedFrames: [],
  };

  private listeners: Set<TimelapseListener> = new Set();
  private timer: any = null;
  private currentPhase: 'idle' | 'settling' | 'exposing' | 'waiting' = 'idle';
  private phaseRemainingMs = 0;

  constructor() {
    this.seedInitialFrames();
  }

  private seedInitialFrames() {
    // Realistic sample frames captured through Celestron 127SLT
    const sampleNames = [
      { name: 'M42 猎户大星云核心区', stars: 142, fwhm: 2.1 },
      { name: '木星光晕与4伽利略卫星序列', stars: 45, fwhm: 1.8 },
      { name: 'M45 昴星团蓝白色反光尘埃', stars: 210, fwhm: 2.3 },
      { name: '仙女座星系 M31 旋臂微光', stars: 188, fwhm: 2.5 },
      { name: '武仙座球状星团 M13 密集群星', stars: 320, fwhm: 1.9 },
    ];

    const now = Date.now();
    const initialList: CapturedFrame[] = sampleNames.map((s, idx) => ({
      id: `frame-${idx + 1}`,
      frameIndex: idx + 1,
      timestamp: new Date(now - (sampleNames.length - idx) * 15000)
        .toTimeString()
        .slice(0, 8),
      exposureSec: 8.0,
      starCount: s.stars,
      fwhm: s.fwhm,
      filename: `CEL127SLT_RAW_${(idx + 1).toString().padStart(4, '0')}.CR3`,
    }));

    this.state.capturedFrames = initialList;
  }

  public subscribe(callback: TimelapseListener): () => void {
    this.listeners.add(callback);
    callback(this.getState());
    return () => this.listeners.delete(callback);
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach((fn) => fn(s));
  }

  public getState(): TimelapseSessionState {
    return {
      ...this.state,
      capturedFrames: [...this.state.capturedFrames],
      config: { ...this.config },
    };
  }

  public updateConfig(newConfig: Partial<TimelapseConfig>) {
    this.config = { ...this.config, ...newConfig };
    this.state.config = { ...this.config };
    this.state.totalFrames = this.config.totalFrames;
    this.notify();
  }

  /**
   * Start or restart time-lapse session
   */
  public start(configOverride?: Partial<TimelapseConfig>) {
    if (configOverride) {
      this.updateConfig(configOverride);
    }

    this.stopTimer();

    const singleCycleSec =
      this.config.settlingDelaySec + this.config.exposureSec + this.config.intervalSec;
    const totalEstSec = singleCycleSec * this.config.totalFrames;

    this.state.status = 'running';
    this.state.currentFrame = 0;
    this.state.totalFrames = this.config.totalFrames;
    this.state.elapsedSec = 0;
    this.state.remainingSec = totalEstSec;
    this.state.startTime = Date.now();

    // Start with settling phase
    this.enterSettlingPhase();
    this.startMainLoop();
    this.notify();
  }

  public pause() {
    if (this.state.status === 'running' || this.state.status === 'exposing' || this.state.status === 'settling' || this.state.status === 'waiting') {
      this.state.status = 'paused';
      this.notify();
    }
  }

  public resume() {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.notify();
    }
  }

  public stop() {
    this.stopTimer();
    this.state.status = 'aborted';
    this.currentPhase = 'idle';
    this.state.currentExposureCountdown = 0;
    this.state.nextShutterCountdown = 0;
    this.notify();
  }

  /**
   * Trigger single test shot (single exposure pulse)
   */
  public triggerTestShot(exposureSec: number = this.config.exposureSec) {
    // Add a captured frame
    const newIdx = this.state.capturedFrames.length + 1;
    const frame: CapturedFrame = {
      id: `test-${Date.now()}`,
      frameIndex: newIdx,
      timestamp: new Date().toTimeString().slice(0, 8),
      exposureSec: exposureSec,
      starCount: Math.floor(120 + Math.random() * 80),
      fwhm: Math.round((1.8 + Math.random() * 0.6) * 10) / 10,
      filename: `${this.config.prefix}_TEST_${newIdx.toString().padStart(4, '0')}.RAW`,
    };

    this.state.capturedFrames = [frame, ...this.state.capturedFrames];
    this.notify();
  }

  private enterSettlingPhase() {
    this.currentPhase = 'settling';
    this.state.status = 'settling';
    this.phaseRemainingMs = this.config.settlingDelaySec * 1000;
  }

  private enterExposingPhase() {
    this.currentPhase = 'exposing';
    this.state.status = 'exposing';
    this.phaseRemainingMs = this.config.exposureSec * 1000;
    this.state.currentFrame += 1;

    // Send GPIO trigger signal (simulated or via Pi WebSocket)
    this.sendGpioShutter(true);
  }

  private enterWaitingPhase() {
    this.currentPhase = 'waiting';
    this.state.status = 'waiting';
    this.phaseRemainingMs = this.config.intervalSec * 1000;

    // Release GPIO shutter
    this.sendGpioShutter(false);

    // Record captured frame
    const frame: CapturedFrame = {
      id: `frame-${Date.now()}`,
      frameIndex: this.state.currentFrame,
      timestamp: new Date().toTimeString().slice(0, 8),
      exposureSec: this.config.exposureSec,
      starCount: Math.floor(140 + Math.random() * 90),
      fwhm: Math.round((1.9 + Math.random() * 0.5) * 10) / 10,
      filename: `${this.config.prefix}_${this.state.currentFrame.toString().padStart(4, '0')}.${this.config.saveRaw ? 'CR3' : 'JPG'}`,
    };
    this.state.capturedFrames = [frame, ...this.state.capturedFrames];
  }

  private sendGpioShutter(active: boolean) {
    // In Pi server mode, we will send WebSocket trigger event
    // console.log(`[GPIO ${this.config.gpioShutterPin}] Shutter ${active ? 'TRIGGER' : 'RELEASE'}`);
  }

  private startMainLoop() {
    const TICK_MS = 100;
    this.timer = setInterval(() => {
      if (this.state.status === 'paused' || this.state.status === 'idle' || this.state.status === 'completed' || this.state.status === 'aborted') {
        return;
      }

      this.state.elapsedSec += TICK_MS / 1000;
      this.phaseRemainingMs -= TICK_MS;

      // Update countdown states
      if (this.currentPhase === 'settling') {
        this.state.currentExposureCountdown = 0;
        this.state.nextShutterCountdown = Math.max(0, Math.ceil(this.phaseRemainingMs / 1000));
        if (this.phaseRemainingMs <= 0) {
          this.enterExposingPhase();
        }
      } else if (this.currentPhase === 'exposing') {
        this.state.currentExposureCountdown = Math.max(0, Math.round((this.phaseRemainingMs / 1000) * 10) / 10);
        this.state.nextShutterCountdown = 0;
        if (this.phaseRemainingMs <= 0) {
          this.enterWaitingPhase();
        }
      } else if (this.currentPhase === 'waiting') {
        this.state.currentExposureCountdown = 0;
        this.state.nextShutterCountdown = Math.max(0, Math.ceil(this.phaseRemainingMs / 1000));
        if (this.phaseRemainingMs <= 0) {
          if (this.state.currentFrame >= this.state.totalFrames && this.state.totalFrames > 0) {
            // Done!
            this.state.status = 'completed';
            this.stopTimer();
          } else {
            this.enterSettlingPhase();
          }
        }
      }

      // Estimate remaining time
      const singleCycle = this.config.settlingDelaySec + this.config.exposureSec + this.config.intervalSec;
      const remainingFrames = Math.max(0, this.state.totalFrames - this.state.currentFrame);
      this.state.remainingSec = remainingFrames * singleCycle + Math.max(0, Math.ceil(this.phaseRemainingMs / 1000));

      this.notify();
    }, 100);
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const timelapseController = new TimelapseController();

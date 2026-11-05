import {
  AMBIENT_SOUND_EMITTERS,
  compute3DSpatialAudioParams,
  selectDistantGunfirePosition,
  type EnemyArchetype,
  type SpatialAudioOptions,
  type SpatialAudioParams,
  type SurfaceMaterial,
} from './rules';

export interface SpatialAudioDebugStats {
  listenerPose: { x: number; y: number; z: number; yaw: number; pitch: number };
  footstepsPlayed: number;
  distantGunfirePlayed: number;
  ambiancePulsesPlayed: number;
  lastFootstepParams: SpatialAudioParams | null;
  lastDistantGunfireParams: SpatialAudioParams | null;
  lastAmbianceParams: SpatialAudioParams | null;
  emitterMix: Array<{
    id: string;
    distance: number;
    attenuationGain: number;
    stereoPan: number;
    lowpassCutoffHz: number;
  }>;
}

class SoundSystem {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  public isMuted: boolean = false;
  private userInteracted: boolean = false;
  private lastPlayedMap: Record<string, number> = {};

  private listenerPose = { x: 0, y: 1.65, z: 0, yaw: 0, pitch: 0 };
  private footstepsPlayed = 0;
  private distantGunfirePlayed = 0;
  private ambiancePulsesPlayed = 0;
  private lastFootstepParams: SpatialAudioParams | null = null;
  private lastDistantGunfireParams: SpatialAudioParams | null = null;
  private lastAmbianceParams: SpatialAudioParams | null = null;
  private distantGunfireTimerSec = 2.6;
  private ambiancePulseTimerSec = 1.4;
  private ambianceEmitterCursor = 0;
  private distantGunfireEventCounter = 0;

  private ensureContext(): AudioContext | null {
    if (this.isMuted || !this.userInteracted || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (!this.noiseBuffer && this.ctx) {
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * 0.45);
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buffer;
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private canPlay(key: string, minIntervalMs: number): boolean {
    const now = performance.now();
    const prev = this.lastPlayedMap[key] ?? 0;
    if (now - prev < minIntervalMs) return false;
    this.lastPlayedMap[key] = now;
    return true;
  }

  public initOnInteraction(): void {
    this.userInteracted = true;
    this.ensureContext();
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    return this.isMuted;
  }

  /**
   * Updates the 3D listener position & orientation in world space and syncs with Web Audio AudioListener.
   */
  public updateListenerPose(
    x: number,
    y: number,
    z: number,
    yaw: number,
    pitch: number = 0,
  ): void {
    this.listenerPose = { x, y, z, yaw, pitch };
    const ctx = this.ctx;
    if (!ctx) return;

    try {
      const listener = ctx.listener;
      const now = ctx.currentTime;
      const forwardX = -Math.sin(yaw) * Math.cos(pitch);
      const forwardY = Math.sin(pitch);
      const forwardZ = -Math.cos(yaw) * Math.cos(pitch);

      if (listener.positionX && listener.forwardX && listener.upX) {
        listener.positionX.setValueAtTime(x, now);
        listener.positionY.setValueAtTime(y, now);
        listener.positionZ.setValueAtTime(z, now);
        listener.forwardX.setValueAtTime(forwardX, now);
        listener.forwardY.setValueAtTime(forwardY, now);
        listener.forwardZ.setValueAtTime(forwardZ, now);
        listener.upX.setValueAtTime(0, now);
        listener.upY.setValueAtTime(1, now);
        listener.upZ.setValueAtTime(0, now);
      } else if (typeof listener.setPosition === 'function') {
        listener.setPosition(x, y, z);
        listener.setOrientation(forwardX, forwardY, forwardZ, 0, 1, 0);
      }
    } catch {}
  }

  /**
   * Builds a 3D spatialized Web Audio routing chain:
   * Source -> Air-Absorption BiquadFilterNode -> 3D PannerNode / StereoPannerNode -> Distance-Attenuated GainNode -> Destination
   */
  private createSpatialRoutingChain(
    ctx: AudioContext,
    sourcePos: { x: number; y: number; z: number },
    spatial: SpatialAudioParams,
    options: SpatialAudioOptions,
  ): AudioNode {
    const now = ctx.currentTime;

    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.setValueAtTime(spatial.lowpassCutoffHz, now);
    airFilter.Q.setValueAtTime(0.707, now);

    const spatialGain = ctx.createGain();
    spatialGain.gain.setValueAtTime(spatial.attenuationGain, now);

    let panNode: AudioNode = spatialGain;
    if (typeof ctx.createStereoPanner === 'function') {
      const stereoPanner = ctx.createStereoPanner();
      stereoPanner.pan.setValueAtTime(spatial.stereoPan, now);
      stereoPanner.connect(spatialGain);
      panNode = stereoPanner;
    }

    if (typeof ctx.createPanner === 'function') {
      try {
        const panner = ctx.createPanner();
        panner.panningModel = 'equalpower';
        panner.distanceModel = 'inverse';
        panner.refDistance = options.refDistance ?? 2.2;
        panner.maxDistance = options.maxDistance ?? 32.0;
        panner.rolloffFactor = 0.25; // Primary attenuation curve is driven by spatial.attenuationGain
        if (panner.positionX) {
          panner.positionX.setValueAtTime(sourcePos.x, now);
          panner.positionY.setValueAtTime(sourcePos.y, now);
          panner.positionZ.setValueAtTime(sourcePos.z, now);
        } else if (typeof panner.setPosition === 'function') {
          panner.setPosition(sourcePos.x, sourcePos.y, sourcePos.z);
        }
        airFilter.connect(panner);
        panner.connect(panNode);
        spatialGain.connect(ctx.destination);
        return airFilter;
      } catch {}
    }

    airFilter.connect(panNode);
    spatialGain.connect(ctx.destination);
    return airFilter;
  }

  /**
   * 1. Spatialized Enemy Footsteps:
   * Synthesizes archetype-distinct footsteps ('heavy' armored thud, 'flanker' rapid tactical scuff,
   * 'assault' combat boot step) with 3D distance attenuation, air-absorption filtering, and azimuth stereo panning.
   */
  public playSpatialEnemyFootstep(
    sourceX: number,
    sourceY: number,
    sourceZ: number,
    archetype: EnemyArchetype = 'assault',
    overrideListener?: { x: number; y: number; z: number; yaw: number },
  ): SpatialAudioParams {
    const listener = overrideListener ?? this.listenerPose;
    const options: SpatialAudioOptions = {
      refDistance: 2.0,
      maxDistance: 26.0,
      rolloffFactor: 1.35,
      baseGain: archetype === 'heavy' ? 0.95 : archetype === 'flanker' ? 0.65 : 0.78,
    };
    const spatial = compute3DSpatialAudioParams(
      listener,
      { x: sourceX, y: sourceY, z: sourceZ },
      options,
    );
    this.lastFootstepParams = spatial;

    if (!spatial.audible) return spatial;
    this.footstepsPlayed += 1;

    if (!this.canPlay(`footstep_${archetype}`, 55)) return spatial;
    const ctx = this.ensureContext();
    if (!ctx) return spatial;

    try {
      const now = ctx.currentTime;
      const targetNode = this.createSpatialRoutingChain(
        ctx,
        { x: sourceX, y: sourceY, z: sourceZ },
        spatial,
        options,
      );

      // Boot sole impact oscillator
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      if (archetype === 'heavy') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(76 + Math.random() * 10, now);
        osc.frequency.exponentialRampToValueAtTime(24, now + 0.11);
        oscGain.gain.setValueAtTime(0.32, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      } else if (archetype === 'flanker') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(148 + Math.random() * 20, now);
        osc.frequency.exponentialRampToValueAtTime(52, now + 0.055);
        oscGain.gain.setValueAtTime(0.2, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(102 + Math.random() * 14, now);
        osc.frequency.exponentialRampToValueAtTime(36, now + 0.08);
        oscGain.gain.setValueAtTime(0.25, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      }
      osc.connect(oscGain);
      oscGain.connect(targetNode);
      osc.start(now);
      osc.stop(now + 0.13);

      // Concrete grit / armor clank transient
      if (this.noiseBuffer) {
        const grit = ctx.createBufferSource();
        grit.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(
          archetype === 'heavy' ? 540 : archetype === 'flanker' ? 1350 : 920,
          now,
        );
        bp.Q.setValueAtTime(1.4, now);
        const gritGain = ctx.createGain();
        gritGain.gain.setValueAtTime(0.14, now);
        gritGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        grit.connect(bp);
        bp.connect(gritGain);
        gritGain.connect(targetNode);
        grit.start(now);
        grit.stop(now + 0.07);
      }
    } catch {}

    return spatial;
  }

  /**
   * 2. Spatialized Distant Gunfire:
   * Simulates perimeter combat gunfire & echo bursts originating outside the arena walls,
   * attenuated and low-pass filtered based on 3D distance and direction from the player.
   */
  public playSpatialDistantGunfire(
    sourceX: number,
    sourceY: number,
    sourceZ: number,
    burstCount: number = 3,
    overrideListener?: { x: number; y: number; z: number; yaw: number },
  ): SpatialAudioParams {
    const listener = overrideListener ?? this.listenerPose;
    const options: SpatialAudioOptions = {
      refDistance: 5.5,
      maxDistance: 56.0,
      rolloffFactor: 1.15,
      baseGain: 0.85,
    };
    const spatial = compute3DSpatialAudioParams(
      listener,
      { x: sourceX, y: sourceY, z: sourceZ },
      options,
    );
    this.lastDistantGunfireParams = spatial;

    if (!spatial.audible) return spatial;
    this.distantGunfirePlayed += 1;

    if (!this.canPlay('distant_gunfire', 180)) return spatial;
    const ctx = this.ensureContext();
    if (!ctx) return spatial;

    try {
      const now = ctx.currentTime;
      const targetNode = this.createSpatialRoutingChain(
        ctx,
        { x: sourceX, y: sourceY, z: sourceZ },
        spatial,
        options,
      );

      const clampedBurst = Math.max(1, Math.min(5, burstCount));
      for (let i = 0; i < clampedBurst; i++) {
        const shotTime = now + i * 0.088;

        // Muffled distant chamber thump
        const osc = ctx.createOscillator();
        const oscGain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(132 - i * 6, shotTime);
        osc.frequency.exponentialRampToValueAtTime(32, shotTime + 0.14);
        oscGain.gain.setValueAtTime(0.24, shotTime);
        oscGain.gain.exponentialRampToValueAtTime(0.001, shotTime + 0.16);
        osc.connect(oscGain);
        oscGain.connect(targetNode);
        osc.start(shotTime);
        osc.stop(shotTime + 0.17);

        // Distant canyon / concrete wall slapback echo
        if (this.noiseBuffer) {
          const crack = ctx.createBufferSource();
          crack.buffer = this.noiseBuffer;
          const lp = ctx.createBiquadFilter();
          lp.type = 'bandpass';
          lp.frequency.setValueAtTime(680, shotTime);
          lp.Q.setValueAtTime(0.9, shotTime);
          const crackGain = ctx.createGain();
          crackGain.gain.setValueAtTime(0.22, shotTime);
          crackGain.gain.exponentialRampToValueAtTime(0.001, shotTime + 0.22);
          crack.connect(lp);
          lp.connect(crackGain);
          crackGain.connect(targetNode);
          crack.start(shotTime);
          crack.stop(shotTime + 0.24);
        }
      }
    } catch {}

    return spatial;
  }

  /**
   * 3. Spatialized Environmental Ambiance Pulse:
   * Emits a 3D positional industrial ambiance sound (exhaust turbine hum, generator thrum,
   * air-duct rush, or high-voltage transformer buzz) from one of the arena's 3D emitters,
   * attenuated by distance from the player.
   */
  public playSpatialAmbiancePulse(
    emitterIndex: number = 0,
    overrideListener?: { x: number; y: number; z: number; yaw: number },
  ): SpatialAudioParams {
    const emitter =
      AMBIENT_SOUND_EMITTERS[
        ((emitterIndex % AMBIENT_SOUND_EMITTERS.length) + AMBIENT_SOUND_EMITTERS.length) %
          AMBIENT_SOUND_EMITTERS.length
      ];
    const listener = overrideListener ?? this.listenerPose;
    const options: SpatialAudioOptions = {
      refDistance: 3.5,
      maxDistance: 38.0,
      rolloffFactor: 1.1,
      baseGain: 0.65,
    };
    const spatial = compute3DSpatialAudioParams(
      listener,
      { x: emitter.x, y: emitter.y, z: emitter.z },
      options,
    );
    this.lastAmbianceParams = spatial;

    if (!spatial.audible) return spatial;
    this.ambiancePulsesPlayed += 1;

    if (!this.canPlay(`ambiance_${emitter.id}`, 180)) return spatial;
    const ctx = this.ensureContext();
    if (!ctx) return spatial;

    try {
      const now = ctx.currentTime;
      const targetNode = this.createSpatialRoutingChain(
        ctx,
        { x: emitter.x, y: emitter.y, z: emitter.z },
        spatial,
        options,
      );

      // Low industrial harmonic drone pulse
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = emitter.kind === 'transformer' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(emitter.baseFreqHz, now);
      osc.frequency.exponentialRampToValueAtTime(emitter.baseFreqHz * 0.96, now + 0.65);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
      osc.connect(gain);
      gain.connect(targetNode);
      osc.start(now);
      osc.stop(now + 0.7);

      // Subtle ventilation airflow hiss
      if (this.noiseBuffer && (emitter.kind === 'ventilation' || emitter.kind === 'turbine')) {
        const air = ctx.createBufferSource();
        air.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(380, now);
        bp.Q.setValueAtTime(1.2, now);
        const airGain = ctx.createGain();
        airGain.gain.setValueAtTime(0.06, now);
        airGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        air.connect(bp);
        bp.connect(airGain);
        airGain.connect(targetNode);
        air.start(now);
        air.stop(now + 0.44);
      }
    } catch {}

    return spatial;
  }

  /**
   * Steps the 3D sound spatializer each simulation tick:
   * - Updates the 3D listener pose from the player's current position and look angles
   * - Periodically triggers spatialized environmental ambiance from the 4 corner emitters
   * - Periodically triggers spatialized distant perimeter gunfire echoes
   */
  public stepSpatialAmbiance(
    listenerX: number,
    listenerY: number,
    listenerZ: number,
    listenerYaw: number,
    listenerPitch: number,
    dt: number,
    wave: number = 1,
  ): void {
    this.updateListenerPose(listenerX, listenerY, listenerZ, listenerYaw, listenerPitch);

    this.ambiancePulseTimerSec -= dt;
    if (this.ambiancePulseTimerSec <= 0) {
      this.ambiancePulseTimerSec = 1.35;
      const idx = this.ambianceEmitterCursor % AMBIENT_SOUND_EMITTERS.length;
      this.ambianceEmitterCursor += 1;
      this.playSpatialAmbiancePulse(idx);
    }

    this.distantGunfireTimerSec -= dt;
    if (this.distantGunfireTimerSec <= 0) {
      this.distantGunfireTimerSec = 3.2 + Math.random() * 2.2;
      this.distantGunfireEventCounter += 1;
      const pos = selectDistantGunfirePosition(wave, this.distantGunfireEventCounter);
      const burstShots = 2 + (this.distantGunfireEventCounter % 3);
      this.playSpatialDistantGunfire(pos.x, pos.y, pos.z, burstShots);
    }
  }

  /**
   * Returns current 3D spatializer telemetry and real-time distance-attenuation mix for all environmental emitters.
   */
  public getSpatialDebugStats(): SpatialAudioDebugStats {
    const emitterMix = AMBIENT_SOUND_EMITTERS.map((emitter) => {
      const p = compute3DSpatialAudioParams(
        this.listenerPose,
        { x: emitter.x, y: emitter.y, z: emitter.z },
        { refDistance: 3.5, maxDistance: 38.0, rolloffFactor: 1.1, baseGain: 0.65 },
      );
      return {
        id: emitter.id,
        distance: Number(p.distance.toFixed(2)),
        attenuationGain: p.attenuationGain,
        stereoPan: Number(p.stereoPan.toFixed(3)),
        lowpassCutoffHz: p.lowpassCutoffHz,
      };
    });

    return {
      listenerPose: { ...this.listenerPose },
      footstepsPlayed: this.footstepsPlayed,
      distantGunfirePlayed: this.distantGunfirePlayed,
      ambiancePulsesPlayed: this.ambiancePulsesPlayed,
      lastFootstepParams: this.lastFootstepParams ? { ...this.lastFootstepParams } : null,
      lastDistantGunfireParams: this.lastDistantGunfireParams
        ? { ...this.lastDistantGunfireParams }
        : null,
      lastAmbianceParams: this.lastAmbianceParams ? { ...this.lastAmbianceParams } : null,
      emitterMix,
    };
  }

  private saturationCurve: Float32Array<ArrayBuffer> | null = null;

  private getSaturationCurve(drive: number = 3.2): Float32Array<ArrayBuffer> {
    if (this.saturationCurve) return this.saturationCurve;
    const samples = 512;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * drive);
    }
    this.saturationCurve = curve;
    return curve;
  }

  public playWeaponFire(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (weaponId === 'shotgun') {
      this.playShotgunBlast();
      return;
    }
    if (weaponId === 'pistol') {
      this.playPistolShot();
      return;
    }
    this.playGunshot();
  }

  /**
   * Realistic 5-Stage 5.56mm NATO Assault Rifle Gunshot:
   * 1. Saturated Muzzle Blast Pressure Wave (WaveShaper transient compression)
   * 2. Deep Sub-Bass Chest Punch (138Hz -> 28Hz)
   * 3. High-Velocity Supersonic N-Wave Crack (2.8kHz high-passed snap)
   * 4. Metallic Bolt-Carrier Group & Buffer Spring Reciprocation Clack (+22ms)
   * 5. Enclosed 40x40 Concrete Arena Early Wall Reflections (+58ms & +115ms)
   */
  public playGunshot(): void {
    if (!this.canPlay('gunshot', 55)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const pitchShift = 0.95 + Math.random() * 0.1;

      const masterShaper = ctx.createWaveShaper();
      masterShaper.curve = this.getSaturationCurve(3.4);
      masterShaper.oversample = '2x';
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.78, now);
      masterShaper.connect(masterGain);
      masterGain.connect(ctx.destination);

      // 1. Sub-bass chamber pressure punch
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(142 * pitchShift, now);
      subOsc.frequency.exponentialRampToValueAtTime(27, now + 0.115);
      subGain.gain.setValueAtTime(0.46, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.125);
      subOsc.connect(subGain);
      subGain.connect(masterShaper);
      subOsc.start(now);
      subOsc.stop(now + 0.13);

      // 2. Mid-body propellant detonation transient
      const bodyOsc = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      bodyOsc.type = 'sawtooth';
      bodyOsc.frequency.setValueAtTime(265 * pitchShift, now);
      bodyOsc.frequency.exponentialRampToValueAtTime(52, now + 0.075);
      bodyGain.gain.setValueAtTime(0.32, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      bodyOsc.connect(bodyGain);
      bodyGain.connect(masterShaper);
      bodyOsc.start(now);
      bodyOsc.stop(now + 0.09);

      // 3. Metallic bolt-carrier group & extractor clack (+22ms)
      const boltOsc = ctx.createOscillator();
      const boltGain = ctx.createGain();
      boltOsc.type = 'triangle';
      boltOsc.frequency.setValueAtTime(1920 * pitchShift, now + 0.018);
      boltOsc.frequency.exponentialRampToValueAtTime(640, now + 0.052);
      boltGain.gain.setValueAtTime(0.14, now + 0.018);
      boltGain.gain.exponentialRampToValueAtTime(0.001, now + 0.056);
      boltOsc.connect(boltGain);
      boltGain.connect(ctx.destination);
      boltOsc.start(now + 0.018);
      boltOsc.stop(now + 0.06);

      if (this.noiseBuffer) {
        // 4. Supersonic ballistic crack + muzzle blast broadband roar
        const crackNoise = ctx.createBufferSource();
        crackNoise.buffer = this.noiseBuffer;

        const crackFilter = ctx.createBiquadFilter();
        crackFilter.type = 'bandpass';
        crackFilter.frequency.setValueAtTime(2250 * pitchShift, now);
        crackFilter.frequency.exponentialRampToValueAtTime(680, now + 0.13);
        crackFilter.Q.setValueAtTime(0.75, now);

        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.48, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        crackNoise.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(masterShaper);
        crackNoise.start(now);
        crackNoise.stop(now + 0.15);

        // 5. Concrete arena early wall slapback reflection (+55ms tail)
        const tailNoise = ctx.createBufferSource();
        tailNoise.buffer = this.noiseBuffer;
        const tailFilter = ctx.createBiquadFilter();
        tailFilter.type = 'lowpass';
        tailFilter.frequency.setValueAtTime(980, now + 0.045);
        tailFilter.frequency.exponentialRampToValueAtTime(280, now + 0.26);
        const tailGain = ctx.createGain();
        tailGain.gain.setValueAtTime(0.16, now + 0.045);
        tailGain.gain.exponentialRampToValueAtTime(0.001, now + 0.27);
        tailNoise.connect(tailFilter);
        tailFilter.connect(tailGain);
        tailGain.connect(ctx.destination);
        tailNoise.start(now + 0.045);
        tailNoise.stop(now + 0.28);
      }
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * Realistic 12-Gauge Pump-Action Shotgun Blast:
   * 1. Saturated Heavy Cannon Sub-Bass Boom (135Hz -> 22Hz)
   * 2. Wide-band Buckshot Muzzle Concussion & Acoustic Slapback
   * 3. Two-Stage Steel Pump-Action Forend Rack (Slide-back at +165ms, Slide-forward lock at +245ms)
   */
  public playShotgunBlast(): void {
    if (!this.canPlay('shotgun', 120)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.getSaturationCurve(3.8);
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.84, now);
      shaper.connect(masterGain);
      masterGain.connect(ctx.destination);

      // 1. Heavy sub-bass cannon thump
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(138, now);
      osc.frequency.exponentialRampToValueAtTime(22, now + 0.24);
      oscGain.gain.setValueAtTime(0.52, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.connect(oscGain);
      oscGain.connect(shaper);
      osc.start(now);
      osc.stop(now + 0.27);

      // 2. Wide buckshot muzzle concussion + arena echo tail
      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2800, now);
        filter.frequency.exponentialRampToValueAtTime(340, now + 0.32);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.56, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(shaper);
        noise.start(now);
        noise.stop(now + 0.35);
      }

      // 3. Two-stage metallic pump-action rack (pull back + push forward)
      [
        { t: 0.165, fStart: 480, fEnd: 690 },
        { t: 0.245, fStart: 720, fEnd: 960 },
      ].forEach(({ t, fStart, fEnd }) => {
        const pumpOsc = ctx.createOscillator();
        const pumpGain = ctx.createGain();
        pumpOsc.type = 'triangle';
        pumpOsc.frequency.setValueAtTime(fStart, now + t);
        pumpOsc.frequency.exponentialRampToValueAtTime(fEnd, now + t + 0.055);
        pumpGain.gain.setValueAtTime(0.14, now + t);
        pumpGain.gain.exponentialRampToValueAtTime(0.001, now + t + 0.065);
        pumpOsc.connect(pumpGain);
        pumpGain.connect(ctx.destination);
        pumpOsc.start(now + t);
        pumpOsc.stop(now + t + 0.07);
      });
    } catch {}
  }

  /**
   * Realistic .50 Cal Heavy Magnum Shot:
   * 1. High-Pressure Magnum Chamber Crack (360Hz -> 38Hz with WaveShaper punch)
   * 2. Heavy Chrome Steel Slide / Barrel Harmonic Ring (1480Hz)
   * 3. High-Velocity Ballistic Snap & Concrete Hall Reflection
   */
  public playPistolShot(): void {
    if (!this.canPlay('pistol', 80)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const shaper = ctx.createWaveShaper();
      shaper.curve = this.getSaturationCurve(3.5);
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.8, now);
      shaper.connect(masterGain);
      masterGain.connect(ctx.destination);

      // 1. High-pressure .50 Cal chamber punch
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(355, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.15);
      gain.gain.setValueAtTime(0.48, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(shaper);
      osc.start(now);
      osc.stop(now + 0.17);

      // 2. Heavy steel slide harmonic ring
      const ringOsc = ctx.createOscillator();
      const ringGain = ctx.createGain();
      ringOsc.type = 'sine';
      ringOsc.frequency.setValueAtTime(1480, now + 0.01);
      ringOsc.frequency.exponentialRampToValueAtTime(920, now + 0.09);
      ringGain.gain.setValueAtTime(0.12, now + 0.01);
      ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      ringOsc.connect(ringGain);
      ringGain.connect(ctx.destination);
      ringOsc.start(now + 0.01);
      ringOsc.stop(now + 0.1);

      // 3. Sharp supersonic crack + room slapback
      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1450, now);
        filter.frequency.exponentialRampToValueAtTime(480, now + 0.22);
        filter.Q.setValueAtTime(0.7, now);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.42, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.23);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(shaper);
        noise.start(now);
        noise.stop(now + 0.24);
      }
    } catch {}
  }

  /**
   * Surface-material bullet impact sounds:
   * - 'metal': metallic ricochet ping + clang
   * - 'wood': warm splinter thud
   * - 'concrete': sharp rock chip snap
   */
  public playSurfaceImpact(material: SurfaceMaterial = 'concrete'): void {
    if (!this.canPlay(`impact_${material}`, 45)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (material === 'metal') {
        osc.type = 'sine';
        const baseFreq = 1650 + Math.random() * 450;
        osc.frequency.setValueAtTime(baseFreq, now);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.52, now + 0.09);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      } else if (material === 'wood') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(240 + Math.random() * 40, now);
        osc.frequency.exponentialRampToValueAtTime(75, now + 0.065);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      } else {
        osc.type = 'square';
        osc.frequency.setValueAtTime(580 + Math.random() * 120, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);
        gain.gain.setValueAtTime(0.11, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      }

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    } catch {}
  }

  /**
   * Synchronized brass shell casing floor bounce clink.
   */
  public playShellCasingBounce(): void {
    if (!this.canPlay('shellBounce', 55)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const freqs = [3650 + Math.random() * 350, 5100 + Math.random() * 400];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + idx * 0.018;
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.85, t + 0.035);
        gain.gain.setValueAtTime(0.055, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.045);
      });
    } catch {}
  }

  /**
   * Multi-layered Hazard Barrel Explosion:
   * Sub-bass detonation wave + broadband blast roar + crackling shrapnel tail
   */
  public playExplosion(): void {
    if (!this.canPlay('explosion', 120)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      // 1. Sub-bass shockwave boom
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sawtooth';
      subOsc.frequency.setValueAtTime(115, now);
      subOsc.frequency.exponentialRampToValueAtTime(22, now + 0.42);
      subGain.gain.setValueAtTime(0.46, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(now);
      subOsc.stop(now + 0.45);

      // 2. Broadband blast roar
      if (this.noiseBuffer) {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1100, now);
        filter.frequency.exponentialRampToValueAtTime(180, now + 0.42);
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.45, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.44);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
        noise.stop(now + 0.45);
      }
    } catch {}
  }

  public playWeaponSwitch(): void {
    if (!this.canPlay('weapSwitch', 70)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.045);
      gain.gain.setValueAtTime(0.11, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.055);
    } catch {}
  }

  public playAmmoPickup(): void {
    if (!this.canPlay('ammoPickup', 100)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const t = now + idx * 0.04;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      });
    } catch {}
  }

  public playHealthPotionPickup(): void {
    if (!this.canPlay('healthPotion', 100)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Crystalline restorative healing chime arpeggio
      [587.33, 783.99, 1046.5, 1318.51].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + idx * 0.045;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.19);
      });
    } catch {}
  }

  public playDryFire(): void {
    if (!this.canPlay('dryfire', 140)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.035);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch {}
  }

  public playReloadStart(): void {
    if (!this.canPlay('reloadStart', 200)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.setValueAtTime(310, now + 0.06);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    } catch {}
  }

  public playReloadComplete(): void {
    if (!this.canPlay('reloadDone', 200)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, now);
      osc.frequency.setValueAtTime(680, now + 0.055);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch {}
  }

  /**
   * Hit & Headshot confirmation sounds:
   * - Body hit: crisp low-mid thwack
   * - Headshot: crystalline dual-harmonic bell dink
   */
  public playEnemyHit(isHeadshot: boolean = false): void {
    if (!this.canPlay('enemyHit', 40)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = isHeadshot ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(isHeadshot ? 1380 : 520, now);
      osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 2120 : 190, now + 0.075);
      gain.gain.setValueAtTime(isHeadshot ? 0.25 : 0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);

      if (isHeadshot) {
        const ring = ctx.createOscillator();
        const ringGain = ctx.createGain();
        ring.type = 'sine';
        ring.frequency.setValueAtTime(2760, now + 0.015);
        ringGain.gain.setValueAtTime(0.16, now + 0.015);
        ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        ring.connect(ringGain);
        ringGain.connect(ctx.destination);
        ring.start(now + 0.015);
        ring.stop(now + 0.13);
      }
    } catch {}
  }

  /**
   * Satisfying Enemy Elimination & Kill Confirmation Audio.
   */
  public playEnemyDeath(isHeadshot: boolean = false): void {
    if (!this.canPlay('enemyDeath', 80)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Low body drop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.26);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.29);

      // Crisp kill confirmation chime
      const chime = ctx.createOscillator();
      const chimeGain = ctx.createGain();
      chime.type = 'triangle';
      chime.frequency.setValueAtTime(isHeadshot ? 880 : 660, now + 0.03);
      chime.frequency.exponentialRampToValueAtTime(isHeadshot ? 1320 : 990, now + 0.15);
      chimeGain.gain.setValueAtTime(0.16, now + 0.03);
      chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      chime.connect(chimeGain);
      chimeGain.connect(ctx.destination);
      chime.start(now + 0.03);
      chime.stop(now + 0.18);
    } catch {}
  }

  public playPlayerDamage(): void {
    if (!this.canPlay('playerDamage', 140)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.22);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch {}
  }

  public playWaveStart(): void {
    if (!this.canPlay('waveStart', 400)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [220, 277.18, 329.63]; // A3 - C#4 - E4 tactical horn
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        const start = now + idx * 0.06;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.11, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.46);
      });
    } catch {}
  }

  public playButtonClick(): void {
    if (!this.canPlay('btnClick', 40)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(760, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.035);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.045);
    } catch {}
  }

  public playJump(): void {
    if (!this.canPlay('jump', 120)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(260, now + 0.09);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.11);
    } catch {}
  }

  public playLand(): void {
    if (!this.canPlay('land', 120)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(34, now + 0.075);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    } catch {}
  }
}

export const soundSystem = new SoundSystem();

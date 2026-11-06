import {
  AMBIENT_SOUND_EMITTERS,
  compute3DSpatialAudioParams,
  selectDistantGunfirePosition,
  selectLayeredGunshotParams,
  type EnemyArchetype,
  type LayeredGunshotHistory,
  type LayeredGunshotSelection,
  type SpatialAudioOptions,
  type SpatialAudioParams,
  type SurfaceMaterial,
  type WeaponId,
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

export type AudioEnvironmentMode = 'indoor' | 'outdoor';

export interface WeaponAudioDiagnostics {
  sampleRateHz: number;
  environmentMode: AudioEnvironmentMode;
  activeVoiceCount: number;
  maxConcurrentVoices: number;
  totalVoicesCleanedUp: number;
  hasRifleShotBuffer: boolean;
  hasShotgunBlastBuffer: boolean;
  hasPistolShotBuffer: boolean;
  sampleVariationsPerWeapon: {
    rifle: number;
    shotgun: number;
    pistol: number;
  };
  layeredSamplePools: Record<
    WeaponId,
    {
      transientSamples: number;
      bodySamples: number;
      mechanicalSamples: number;
    }
  >;
  lastSelectedVariation: {
    rifle: number;
    shotgun: number;
    pistol: number;
  };
  lastLayeredSelection: Record<WeaponId, LayeredGunshotSelection | null>;
  layersActive: {
    initialTransient: boolean;
    lowFreqWeaponBody: boolean;
    mechanicalDetail: boolean;
    environmentalTail: boolean;
    distantReport: boolean;
  };
  rifleShotsPlayed: number;
  shotgunBlastsPlayed: number;
  pistolShotsPlayed: number;
  spatialWeaponShotsPlayed: number;
  weaponFoleyEventsPlayed: number;
  mechanicalEventsCounts: {
    triggerPull: number;
    firingMechanism: number;
    magazineRemoval: number;
    magazineInsertion: number;
    boltOrSlideOperation: number;
    emptyMagazineClick: number;
    weaponSwitch: number;
    reloadComplete: number;
  };
  lastSpatialWeaponShotParams: SpatialAudioParams | null;
  requiredExternalAudioAssets: string[];
}

const REQUIRED_EXTERNAL_AUDIO_ASSETS: string[] = [
  '/assets/audio/weapons/rifle_transient_01.ogg',
  '/assets/audio/weapons/rifle_transient_02.ogg',
  '/assets/audio/weapons/rifle_transient_03.ogg',
  '/assets/audio/weapons/rifle_body_01.ogg',
  '/assets/audio/weapons/rifle_body_02.ogg',
  '/assets/audio/weapons/rifle_body_03.ogg',
  '/assets/audio/weapons/rifle_mech_01.wav',
  '/assets/audio/weapons/rifle_mech_02.wav',
  '/assets/audio/weapons/rifle_mech_03.wav',
  '/assets/audio/weapons/shotgun_transient_01.ogg',
  '/assets/audio/weapons/shotgun_transient_02.ogg',
  '/assets/audio/weapons/shotgun_transient_03.ogg',
  '/assets/audio/weapons/shotgun_body_01.ogg',
  '/assets/audio/weapons/shotgun_body_02.ogg',
  '/assets/audio/weapons/shotgun_body_03.ogg',
  '/assets/audio/weapons/shotgun_mech_01.wav',
  '/assets/audio/weapons/shotgun_mech_02.wav',
  '/assets/audio/weapons/shotgun_mech_03.wav',
  '/assets/audio/weapons/pistol_transient_01.ogg',
  '/assets/audio/weapons/pistol_transient_02.ogg',
  '/assets/audio/weapons/pistol_transient_03.ogg',
  '/assets/audio/weapons/pistol_body_01.ogg',
  '/assets/audio/weapons/pistol_body_02.ogg',
  '/assets/audio/weapons/pistol_body_03.ogg',
  '/assets/audio/weapons/pistol_mech_01.wav',
  '/assets/audio/weapons/pistol_mech_02.wav',
  '/assets/audio/weapons/pistol_mech_03.wav',
  '/assets/audio/weapons/mech_trigger_pull.wav',
  '/assets/audio/weapons/mech_firing_pin.wav',
  '/assets/audio/weapons/mech_mag_out.wav',
  '/assets/audio/weapons/mech_mag_in.wav',
  '/assets/audio/weapons/mech_bolt_slide.wav',
  '/assets/audio/weapons/mech_empty_click.wav',
  '/assets/audio/weapons/mech_weapon_switch.wav',
  '/assets/audio/weapons/mech_reload_complete.wav',
  '/assets/audio/weapons/tail_indoor_reverb.ogg',
  '/assets/audio/weapons/tail_outdoor_echo.ogg',
];

class SoundSystem {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private brownNoiseBuffer: AudioBuffer | null = null;
  private crackNoiseBuffer: AudioBuffer | null = null;
  private rifleShotBuffer: AudioBuffer | null = null;
  private shotgunBlastBuffer: AudioBuffer | null = null;
  private pistolShotBuffer: AudioBuffer | null = null;
  private rifleShotBuffers: AudioBuffer[] = [];
  private shotgunBlastBuffers: AudioBuffer[] = [];
  private pistolShotBuffers: AudioBuffer[] = [];

  // Dedicated 48 kHz multi-sample buffers separated by acoustic layer (Transient, Body, Mechanical)
  private transientLayerBuffers: Record<WeaponId, AudioBuffer[]> = {
    rifle: [],
    shotgun: [],
    pistol: [],
  };
  private bodyLayerBuffers: Record<WeaponId, AudioBuffer[]> = {
    rifle: [],
    shotgun: [],
    pistol: [],
  };
  private mechanicalLayerBuffers: Record<WeaponId, AudioBuffer[]> = {
    rifle: [],
    shotgun: [],
    pistol: [],
  };
  private layerHistory: Record<WeaponId, LayeredGunshotHistory> = {
    rifle: { lastTransientIndex: -1, lastBodyIndex: -1, lastMechanicalIndex: -1 },
    shotgun: { lastTransientIndex: -1, lastBodyIndex: -1, lastMechanicalIndex: -1 },
    pistol: { lastTransientIndex: -1, lastBodyIndex: -1, lastMechanicalIndex: -1 },
  };
  private lastLayeredSelection: Record<WeaponId, LayeredGunshotSelection | null> = {
    rifle: null,
    shotgun: null,
    pistol: null,
  };

  private lastVariationIndex: Record<'rifle' | 'shotgun' | 'pistol', number> = {
    rifle: -1,
    shotgun: -1,
    pistol: -1,
  };
  private environmentMode: AudioEnvironmentMode = 'indoor';
  private activeVoices: Set<AudioScheduledSourceNode> = new Set();
  private readonly maxConcurrentVoices = 24;
  private totalVoicesCleanedUp = 0;

  private blastCurveCache: Map<number, Float32Array<ArrayBuffer>> = new Map();
  public isMuted: boolean = false;
  private userInteracted: boolean = false;
  private lastPlayedMap: Record<string, number> = {};
  private rifleShotsPlayed = 0;
  private shotgunBlastsPlayed = 0;
  private pistolShotsPlayed = 0;
  private spatialWeaponShotsPlayed = 0;
  private weaponFoleyEventsPlayed = 0;
  private mechanicalEventsCounts = {
    triggerPull: 0,
    firingMechanism: 0,
    magazineRemoval: 0,
    magazineInsertion: 0,
    boltOrSlideOperation: 0,
    emptyMagazineClick: 0,
    weaponSwitch: 0,
    reloadComplete: 0,
  };

  private listenerPose = { x: 0, y: 1.65, z: 0, yaw: 0, pitch: 0 };
  private footstepsPlayed = 0;
  private distantGunfirePlayed = 0;
  private ambiancePulsesPlayed = 0;
  private lastFootstepParams: SpatialAudioParams | null = null;
  private lastDistantGunfireParams: SpatialAudioParams | null = null;
  private lastAmbianceParams: SpatialAudioParams | null = null;
  private lastSpatialWeaponShotParams: SpatialAudioParams | null = null;
  private distantGunfireTimerSec = 2.6;
  private ambiancePulseTimerSec = 1.4;
  private ambianceEmitterCursor = 0;
  private distantGunfireEventCounter = 0;

  /**
   * Normalizes an AudioBuffer to a controlled peak ceiling (`targetPeak <= 0.95`)
   * so transients remain sharp while strictly preventing digital clipping.
   */
  private normalizeBuffer(buffer: AudioBuffer, targetPeak: number = 0.95): void {
    const data = buffer.getChannelData(0);
    let maxAbs = 0;
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]);
      if (a > maxAbs) maxAbs = a;
    }
    if (maxAbs > 1e-5) {
      const scale = Math.min(1.25, targetPeak / maxAbs);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.max(-targetPeak, Math.min(targetPeak, data[i] * scale));
      }
    }
  }

  /**
   * Registers an AudioScheduledSourceNode with active voice limiting and automatic cleanup when finished.
   */
  private registerVoice(
    source: AudioScheduledSourceNode,
    disconnectNode?: AudioNode,
  ): void {
    if (this.activeVoices.size >= this.maxConcurrentVoices) {
      const oldest = this.activeVoices.values().next().value;
      if (oldest) {
        try {
          oldest.stop();
          oldest.disconnect();
        } catch {}
        this.activeVoices.delete(oldest);
        this.totalVoicesCleanedUp += 1;
      }
    }
    this.activeVoices.add(source);
    source.onended = () => {
      this.activeVoices.delete(source);
      this.totalVoicesCleanedUp += 1;
      try {
        source.disconnect();
        disconnectNode?.disconnect();
      } catch {}
    };
  }

  /**
   * Randomly selects a sample buffer variation for a weapon while preventing consecutive identical variations.
   */
  private selectWeaponVariationBuffer(
    weaponId: 'rifle' | 'shotgun' | 'pistol',
    pool: AudioBuffer[],
  ): AudioBuffer | null {
    if (pool.length === 0) return null;
    if (pool.length === 1) {
      this.lastVariationIndex[weaponId] = 0;
      return pool[0];
    }
    const prev = this.lastVariationIndex[weaponId];
    let idx = Math.floor(Math.random() * pool.length);
    if (idx === prev) {
      idx = (idx + 1) % pool.length;
    }
    this.lastVariationIndex[weaponId] = idx;
    return pool[idx];
  }

  public setEnvironmentMode(mode: AudioEnvironmentMode): AudioEnvironmentMode {
    this.environmentMode = mode === 'outdoor' ? 'outdoor' : 'indoor';
    return this.environmentMode;
  }

  public getEnvironmentMode(): AudioEnvironmentMode {
    return this.environmentMode;
  }

  private ensureContext(): AudioContext | null {
    if (this.isMuted || !this.userInteracted || typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return null;
        try {
          // Prefer 48 kHz studio sample rate where supported
          this.ctx = new AudioCtx({ sampleRate: 48000 });
        } catch {
          this.ctx = new AudioCtx();
        }
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
      if (!this.brownNoiseBuffer && this.ctx) {
        // Brownian / pink fractal noise: 1/f^2 acoustic roll-off for heavy propellant combustion roar and sub-rumble
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * 0.5);
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < length; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
          b6 = white * 0.115926;
          data[i] = Math.max(-1, Math.min(1, pink * 0.12));
        }
        this.brownNoiseBuffer = buffer;
      }
      if (!this.crackNoiseBuffer && this.ctx) {
        // High-density supersonic crack buffer: steep micro-spikes for ballistic N-wave crack
        const sampleRate = this.ctx.sampleRate;
        const length = Math.floor(sampleRate * 0.3);
        const buffer = this.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-t * 38);
          const isSpike = Math.random() < 0.16;
          const spikeVal = isSpike
            ? (Math.random() > 0.5 ? 1 : -1) * (0.85 + Math.random() * 0.15)
            : 0;
          const noise = (Math.random() * 2 - 1) * 0.4;
          data[i] = (spikeVal + noise) * env;
        }
        this.crackNoiseBuffer = buffer;
      }
      if (this.transientLayerBuffers.rifle.length === 0 && this.ctx) {
        this.buildDedicatedLayerSamplePools(this.ctx);
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Pre-bakes dedicated, independent 48 kHz normalized PCM sample pools for each of the 3 core
   * gunshot layers across all 3 weapons (3 weapons × 3 layers × 3 variations = 27 separate buffers):
   * - `transientLayerBuffers[weaponId][0..2]`: Supersonic N-wave shockfront & muzzle exit crack
   * - `bodyLayerBuffers[weaponId][0..2]`: Deep chamber pressure wave, sub-bass punch, and propellant combustion roar
   * - `mechanicalLayerBuffers[weaponId][0..2]`: Steel BCG reciprocation (rifle), dual-stroke pump action (shotgun), or cylinder index & frame ring (pistol)
   */
  private buildDedicatedLayerSamplePools(ctx: AudioContext): void {
    const sampleRate = ctx.sampleRate;
    const weapons: WeaponId[] = ['rifle', 'shotgun', 'pistol'];

    for (const weaponId of weapons) {
      this.transientLayerBuffers[weaponId] = [];
      this.bodyLayerBuffers[weaponId] = [];
      this.mechanicalLayerBuffers[weaponId] = [];

      for (let v = 0; v < 3; v++) {
        // ----------------------------------------------------------------------
        // 1. TRANSIENT SAMPLE BUFFER (Supersonic N-wave + Muzzle Exit Snap)
        // ----------------------------------------------------------------------
        const transDur = weaponId === 'shotgun' ? 0.055 : weaponId === 'pistol' ? 0.045 : 0.038;
        const transLen = Math.floor(sampleRate * transDur);
        const transBuf = ctx.createBuffer(1, transLen, sampleRate);
        const transData = transBuf.getChannelData(0);
        let hpState = 0;
        let prevSample = 0;

        for (let i = 0; i < transLen; i++) {
          const t = i / sampleRate;
          const white = Math.random() * 2 - 1;
          // High-passed air-tear crack
          hpState = 0.82 * (hpState + white - prevSample);
          prevSample = white;

          // Sub-millisecond Friedlander N-wave shockfront
          const nDur =
            weaponId === 'shotgun'
              ? 0.0022 + v * 0.00018
              : weaponId === 'pistol'
                ? 0.0018 + v * 0.00015
                : 0.0013 + v * 0.00012;
          let shockWave = 0;
          if (t < nDur) {
            const u = t / nDur;
            shockWave = (1 - 2.05 * u) * 0.98;
          } else if (t < nDur * 2.4) {
            // Secondary muzzle brake / cylinder-gap / wad exit shock
            const u2 = (t - nDur) / (nDur * 1.4);
            shockWave = Math.sin(Math.PI * 2 * u2) * Math.exp(-u2 * 3.2) * 0.58;
          }

          const snapFreq =
            weaponId === 'shotgun'
              ? 2150 + v * 140
              : weaponId === 'pistol'
                ? 2950 + v * 170
                : 3450 + v * 190;
          const snapRes =
            Math.sin(2 * Math.PI * snapFreq * t) * Math.exp(-t * (145 + v * 12)) * 0.52;
          const crackBurst =
            hpState * Math.exp(-t * (weaponId === 'shotgun' ? 68 : 92)) * 0.86;

          const rawTrans = shockWave + snapRes + crackBurst;
          transData[i] =
            rawTrans >= 0 ? Math.tanh(rawTrans * 2.8) * 0.95 : Math.tanh(rawTrans * 1.9) * 0.86;
        }
        this.normalizeBuffer(transBuf, 0.95);
        this.transientLayerBuffers[weaponId].push(transBuf);

        // ----------------------------------------------------------------------
        // 2. WEAPON BODY SAMPLE BUFFER (Sub-Bass Chamber Punch + Propellant Roar)
        // ----------------------------------------------------------------------
        const bodyDur = weaponId === 'shotgun' ? 0.42 : weaponId === 'pistol' ? 0.34 : 0.28;
        const bodyLen = Math.floor(sampleRate * bodyDur);
        const bodyBuf = ctx.createBuffer(1, bodyLen, sampleRate);
        const bodyData = bodyBuf.getChannelData(0);
        let lpFast = 0;
        let lpSlow = 0;
        let phaseMain = 0;
        let phaseSub = 0;

        const baseHz =
          weaponId === 'shotgun'
            ? 43 + v * 2.0
            : weaponId === 'pistol'
              ? 49 + v * 2.5
              : 54 + v * 2.5;
        const dropHz =
          weaponId === 'shotgun'
            ? 74 + v * 4.0
            : weaponId === 'pistol'
              ? 92 + v * 5.0
              : 86 + v * 4.0;
        const decayRate = weaponId === 'shotgun' ? 14.5 : weaponId === 'pistol' ? 18.5 : 22.5;

        for (let i = 0; i < bodyLen; i++) {
          const t = i / sampleRate;
          const white = Math.random() * 2 - 1;

          const instFreq = baseHz + dropHz * Math.exp(-t * (115 + v * 7));
          phaseMain += (2 * Math.PI * instFreq) / sampleRate;
          phaseSub += (2 * Math.PI * (instFreq * 0.52)) / sampleRate;

          const chestPunch =
            Math.sin(phaseMain) * Math.exp(-t * decayRate) * 0.88 +
            Math.sin(phaseSub) * Math.exp(-t * (decayRate * 0.82)) * 0.56;

          const alpha = Math.min(0.82, 0.05 + 0.72 * Math.exp(-t * (decayRate * 1.15)));
          lpFast += alpha * (white - lpFast);
          lpSlow += 0.045 * (lpFast - lpSlow);
          const propellantRoar =
            (lpFast * 0.82 + lpSlow * 0.65) * Math.exp(-t * (decayRate * 0.78)) * 1.15;

          const rawBody = chestPunch + propellantRoar;
          bodyData[i] =
            rawBody >= 0 ? Math.tanh(rawBody * 2.5) * 0.95 : Math.tanh(rawBody * 1.7) * 0.88;
        }
        this.normalizeBuffer(bodyBuf, 0.95);
        this.bodyLayerBuffers[weaponId].push(bodyBuf);

        // ----------------------------------------------------------------------
        // 3. MECHANICAL DETAIL SAMPLE BUFFER (BCG / Pump Action / Cylinder & Hammer)
        // ----------------------------------------------------------------------
        const mechDur = weaponId === 'shotgun' ? 0.24 : weaponId === 'pistol' ? 0.14 : 0.12;
        const mechLen = Math.floor(sampleRate * mechDur);
        const mechBuf = ctx.createBuffer(1, mechLen, sampleRate);
        const mechData = mechBuf.getChannelData(0);
        let bpState = 0;
        let lpState = 0;

        for (let i = 0; i < mechLen; i++) {
          const t = i / sampleRate;
          const white = Math.random() * 2 - 1;
          lpState += 0.25 * (white - lpState);
          bpState = 0.58 * bpState + (white - lpState) * 0.78;

          let mechSignal = 0;
          if (weaponId === 'rifle') {
            // Two-stage steel BCG cam-pin unlock (t=0) + buffer spring slide + locking lug battery slam (t=0.024s)
            const unlockEnv = Math.exp(-t * 240);
            const lockT = Math.max(0, t - (0.023 + v * 0.0018));
            const lockEnv = t >= 0.023 + v * 0.0018 ? Math.exp(-lockT * 270) : 0;
            const springScrape = Math.sin(Math.PI * Math.min(1, t / 0.045)) * Math.exp(-t * 42);
            const modes =
              Math.sin(2 * Math.PI * (1260 + v * 45) * t) * 0.45 +
              Math.sin(2 * Math.PI * (2420 + v * 65) * t) * 0.35 +
              Math.sin(2 * Math.PI * (3680 + v * 80) * t) * 0.2;
            mechSignal =
              (bpState * 0.65 + modes * 0.55) * (unlockEnv * 0.75 + lockEnv * 0.85) +
              bpState * springScrape * 0.28;
          } else if (weaponId === 'shotgun') {
            // Dual-stroke steel action-bar pump rack ("CHICK" at t=0..0.065, "CHACK" at t=0.09..0.18)
            const stroke1 = t < 0.068 ? Math.sin((Math.PI * t) / 0.068) : 0;
            const extractorClick = Math.exp(-Math.abs(t - 0.012) * 580) * 0.85;
            const s2Start = 0.088 + v * 0.004;
            const stroke2 =
              t >= s2Start && t < s2Start + 0.072
                ? Math.sin((Math.PI * (t - s2Start)) / 0.072)
                : 0;
            const lockSnap =
              t >= s2Start + 0.046 ? Math.exp(-(t - (s2Start + 0.046)) * 220) * 0.95 : 0;
            const railModes =
              Math.sin(2 * Math.PI * (940 + v * 35) * t) * 0.42 +
              Math.sin(2 * Math.PI * (1880 + v * 55) * t) * 0.35 +
              Math.sin(2 * Math.PI * (2940 + v * 70) * t) * 0.23;
            mechSignal =
              (bpState * 0.68 + railModes * 0.48) * (stroke1 * 0.62 + stroke2 * 0.72) +
              (extractorClick + lockSnap) * (bpState * 0.55 + railModes * 0.45);
          } else {
            // Heavy Magnum Revolver: Cylinder pawl ratchet index click + high-Q forged steel frame ring
            const pawlEnv = Math.exp(-t * 310);
            const reboundT = Math.max(0, t - (0.016 + v * 0.0015));
            const reboundEnv = t >= 0.016 + v * 0.0015 ? Math.exp(-reboundT * 280) : 0;
            const frameRing =
              (Math.sin(2 * Math.PI * (1460 + v * 40) * t) * 0.48 +
                Math.sin(2 * Math.PI * (2240 + v * 55) * t) * 0.34 +
                Math.sin(2 * Math.PI * (3420 + v * 75) * t) * 0.18) *
              Math.exp(-t * 34);
            mechSignal =
              bpState * (pawlEnv * 0.75 + reboundEnv * 0.6) + frameRing * 0.65;
          }

          mechData[i] = Math.tanh(mechSignal * 2.2) * 0.92;
        }
        this.normalizeBuffer(mechBuf, 0.92);
        this.mechanicalLayerBuffers[weaponId].push(mechBuf);
      }
    }

    // Populate composite reference aliases for backwards compatibility with existing diagnostics
    this.rifleShotBuffers = [...this.bodyLayerBuffers.rifle];
    this.shotgunBlastBuffers = [...this.bodyLayerBuffers.shotgun];
    this.pistolShotBuffers = [...this.bodyLayerBuffers.pistol];
    this.rifleShotBuffer = this.rifleShotBuffers[0] ?? null;
    this.shotgunBlastBuffer = this.shotgunBlastBuffers[0] ?? null;
    this.pistolShotBuffer = this.pistolShotBuffers[0] ?? null;
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
    const isBossOrHeavy = archetype === 'brute' || archetype === 'heavy';
    const isFast = archetype === 'flanker';
    const options: SpatialAudioOptions = {
      refDistance: 2.0,
      maxDistance: 26.0,
      rolloffFactor: 1.35,
      baseGain:
        archetype === 'brute'
          ? 1.0
          : archetype === 'heavy'
            ? 0.95
            : isFast
              ? 0.68
              : 0.78,
    };
    const spatial = compute3DSpatialAudioParams(
      listener,
      { x: sourceX, y: sourceY, z: sourceZ },
      options,
    );
    this.lastFootstepParams = spatial;

    if (!spatial.audible) return spatial;
    this.footstepsPlayed += 1;

    if (!this.canPlay(`footstep_${archetype}`, isFast ? 42 : 55)) return spatial;
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

      // Boot sole / mutated brute stomp impact oscillator
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      if (isBossOrHeavy) {
        osc.type = 'sawtooth';
        const startHz = archetype === 'brute' ? 62 : 76;
        osc.frequency.setValueAtTime(startHz + Math.random() * 8, now);
        osc.frequency.exponentialRampToValueAtTime(22, now + 0.13);
        oscGain.gain.setValueAtTime(archetype === 'brute' ? 0.38 : 0.32, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      } else if (isFast) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(154 + Math.random() * 22, now);
        osc.frequency.exponentialRampToValueAtTime(54, now + 0.052);
        oscGain.gain.setValueAtTime(0.21, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.062);
      } else {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(102 + Math.random() * 14, now);
        osc.frequency.exponentialRampToValueAtTime(36, now + 0.08);
        oscGain.gain.setValueAtTime(0.25, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      }
      osc.connect(oscGain);
      oscGain.connect(targetNode);
      this.registerVoice(osc, oscGain);
      osc.start(now);
      osc.stop(now + 0.145);

      // Concrete grit / armor clank transient
      if (this.noiseBuffer) {
        const grit = ctx.createBufferSource();
        grit.buffer = this.noiseBuffer;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(
          isBossOrHeavy ? 480 : isFast ? 1420 : 920,
          now,
        );
        bp.Q.setValueAtTime(1.4, now);
        const gritGain = ctx.createGain();
        gritGain.gain.setValueAtTime(0.14, now);
        gritGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        grit.connect(bp);
        bp.connect(gritGain);
        gritGain.connect(targetNode);
        this.registerVoice(grit, gritGain);
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
        this.registerVoice(osc, oscGain);
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
          this.registerVoice(crack, crackGain);
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
      this.registerVoice(osc, gain);
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
        this.registerVoice(air, airGain);
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

  /**
   * Asymmetric non-linear waveshaping saturation curve:
   * Models the physical acoustic overpressure of real gunpowder detonations
   * where positive muzzle pressure shockwaves compress much harder than negative rarefaction waves.
   */
  private getAsymmetricBlastCurve(drive: number = 3.6): Float32Array<ArrayBuffer> {
    const key = Math.round(drive * 10);
    const cached = this.blastCurveCache.get(key);
    if (cached) return cached;
    const samples = 1024;
    const buffer = new ArrayBuffer(samples * 4);
    const curve = new Float32Array(buffer);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      if (x >= 0) {
        curve[i] = Math.tanh(x * drive * 1.32) * 0.96;
      } else {
        curve[i] = Math.tanh(x * drive * 0.78) * 0.86;
      }
    }
    this.blastCurveCache.set(key, curve);
    return curve;
  }

  /**
   * Positional 3D Weapon Audio:
   * Evaluates 3D distance attenuation, azimuth stereo panning, and rear-hemisphere air absorption
   * (never louder when turning away) and routes the 5-layer weapon gunshot through the spatial chain.
   */
  public playSpatialWeaponFire(
    weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle',
    sourceX?: number,
    sourceY?: number,
    sourceZ?: number,
    overrideListener?: { x: number; y: number; z: number; yaw: number },
  ): SpatialAudioParams {
    const listener = overrideListener ?? this.listenerPose;
    const sx = sourceX ?? listener.x - Math.sin(listener.yaw) * 0.45;
    const sy = sourceY ?? listener.y - 0.12;
    const sz = sourceZ ?? listener.z - Math.cos(listener.yaw) * 0.45;
    const options: SpatialAudioOptions = {
      refDistance: 2.5,
      maxDistance: 48.0,
      rolloffFactor: 1.15,
      baseGain: weaponId === 'shotgun' ? 0.98 : 0.94,
    };
    const spatial = compute3DSpatialAudioParams(
      listener,
      { x: sx, y: sy, z: sz },
      options,
    );
    this.lastSpatialWeaponShotParams = spatial;
    this.spatialWeaponShotsPlayed += 1;

    if (!spatial.audible) return spatial;
    const ctx = this.ensureContext();
    if (!ctx) {
      // Still increment shot counters if called in headless test mode before AudioContext unlock
      this.playWeaponFire(weaponId);
      return spatial;
    }

    const spatialTarget = this.createSpatialRoutingChain(
      ctx,
      { x: sx, y: sy, z: sz },
      spatial,
      options,
    );
    if (weaponId === 'shotgun') {
      this.playShotgunBlast(spatialTarget);
    } else if (weaponId === 'pistol') {
      this.playPistolShot(spatialTarget);
    } else {
      this.playGunshot(spatialTarget);
    }
    return spatial;
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
   * Layer 2 — Low-Frequency Weapon Body & Controlled Sub-Bass Layer:
   * Uses a rapid, non-whistling 14ms chamber pressure drop (142Hz -> 54Hz) that locks into the
   * 48Hz-62Hz physical chest-slam band, paired with low-passed Brownian air displacement.
   */
  private triggerSubBassCannonLayer(
    ctx: AudioContext,
    now: number,
    pitchShift: number,
    intensity: number = 1.0,
    durationSec: number = 0.24,
    destination?: AudioNode,
  ): void {
    const dest = destination ?? ctx.destination;
    const subBus = ctx.createGain();
    subBus.gain.setValueAtTime(0.84 * intensity, now);

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.setValueAtTime(135, now);
    lowShelf.gain.setValueAtTime(10.5, now);

    const chestPeak = ctx.createBiquadFilter();
    chestPeak.type = 'peaking';
    chestPeak.frequency.setValueAtTime(68, now);
    chestPeak.Q.setValueAtTime(1.2, now);
    chestPeak.gain.setValueAtTime(8.5, now);

    const subShaper = ctx.createWaveShaper();
    subShaper.curve = this.getAsymmetricBlastCurve(4.2);
    subShaper.oversample = '2x';

    subShaper.connect(lowShelf);
    lowShelf.connect(chestPeak);
    chestPeak.connect(subBus);
    subBus.connect(dest);

    // 1. Tight non-sweeping chest-slam fundamental (142Hz -> 56Hz in 16ms, then holds 56Hz -> 32Hz)
    const slamOsc = ctx.createOscillator();
    const slamGain = ctx.createGain();
    slamOsc.type = 'sine';
    slamOsc.frequency.setValueAtTime(142 * pitchShift, now);
    slamOsc.frequency.exponentialRampToValueAtTime(56, now + 0.016);
    slamOsc.frequency.exponentialRampToValueAtTime(32, now + durationSec);
    slamGain.gain.setValueAtTime(0.82, now);
    slamGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec + 0.015);
    slamOsc.connect(slamGain);
    slamGain.connect(subShaper);
    this.registerVoice(slamOsc, slamGain);
    slamOsc.start(now);
    slamOsc.stop(now + durationSec + 0.02);

    // 2. Deep sub-octave pressure lock (74Hz -> 42Hz in 18ms, holding 42Hz -> 24Hz)
    const triSub = ctx.createOscillator();
    const triSubGain = ctx.createGain();
    triSub.type = 'triangle';
    triSub.frequency.setValueAtTime(74 * pitchShift, now);
    triSub.frequency.exponentialRampToValueAtTime(42, now + 0.018);
    triSub.frequency.exponentialRampToValueAtTime(24, now + durationSec * 1.08);
    triSubGain.gain.setValueAtTime(0.7, now);
    triSubGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec * 1.1);
    triSub.connect(triSubGain);
    triSubGain.connect(subShaper);
    this.registerVoice(triSub, triSubGain);
    triSub.start(now);
    triSub.stop(now + durationSec * 1.12);

    // 3. Resonant sub-boom air displacement wave (Brownian noise through 145Hz lowpass)
    const boomBuf = this.brownNoiseBuffer ?? this.noiseBuffer;
    if (boomBuf) {
      const boomSource = ctx.createBufferSource();
      boomSource.buffer = boomBuf;
      const boomFilter = ctx.createBiquadFilter();
      boomFilter.type = 'lowpass';
      boomFilter.frequency.setValueAtTime(145 * pitchShift, now);
      boomFilter.frequency.exponentialRampToValueAtTime(46, now + durationSec);
      boomFilter.Q.setValueAtTime(2.0, now);
      const boomGain = ctx.createGain();
      boomGain.gain.setValueAtTime(0.78, now);
      boomGain.gain.exponentialRampToValueAtTime(0.001, now + durationSec + 0.02);
      boomSource.connect(boomFilter);
      boomFilter.connect(boomGain);
      boomGain.connect(subShaper);
      this.registerVoice(boomSource, boomGain);
      boomSource.start(now);
      boomSource.stop(now + durationSec + 0.03);
    }
  }

  /**
   * Layer 4 (Environmental Reflection / Tail) & Layer 5 (Optional Distant Report):
   * - INDOOR mode: Stronger enclosed-space reflections, multi-tap concrete wall bounce, and longer room reverb decay.
   * - OUTDOOR mode: Natural open-air decay, minimal artificial room reverb, and a distinct distant perimeter echo report.
   */
  private triggerEnvironmentalTailAndDistantReport(
    ctx: AudioContext,
    now: number,
    pitchShift: number,
    weaponId: 'rifle' | 'shotgun' | 'pistol',
    destination: AudioNode,
  ): void {
    const tailBuf = this.brownNoiseBuffer ?? this.noiseBuffer;
    if (!tailBuf) return;

    const isIndoor = this.environmentMode === 'indoor';
    const tailStart = now + (isIndoor ? 0.028 : 0.042);
    const tailDuration =
      weaponId === 'shotgun'
        ? isIndoor
          ? 0.44
          : 0.24
        : weaponId === 'pistol'
          ? isIndoor
            ? 0.38
            : 0.21
          : isIndoor
            ? 0.34
            : 0.18;

    // Layer 4: Environmental Reflection / Reverb Tail
    const envSource = ctx.createBufferSource();
    envSource.buffer = tailBuf;
    envSource.playbackRate.setValueAtTime(pitchShift * (isIndoor ? 0.96 : 0.88), tailStart);

    const envFilter = ctx.createBiquadFilter();
    envFilter.type = isIndoor ? 'bandpass' : 'lowpass';
    envFilter.frequency.setValueAtTime(isIndoor ? 980 : 640, tailStart);
    envFilter.frequency.exponentialRampToValueAtTime(
      isIndoor ? 210 : 160,
      tailStart + tailDuration,
    );
    envFilter.Q.setValueAtTime(isIndoor ? 1.35 : 0.7, tailStart);

    const envGain = ctx.createGain();
    const envLevel = isIndoor
      ? weaponId === 'shotgun'
        ? 0.28
        : 0.22
      : weaponId === 'shotgun'
        ? 0.14
        : 0.1;
    envGain.gain.setValueAtTime(envLevel, tailStart);
    envGain.gain.exponentialRampToValueAtTime(0.001, tailStart + tailDuration);

    envSource.connect(envFilter);
    envFilter.connect(envGain);
    envGain.connect(destination);
    this.registerVoice(envSource, envGain);
    envSource.start(tailStart);
    envSource.stop(tailStart + tailDuration + 0.015);

    // Layer 5: Optional Distant Report (rolled-off perimeter slapback / distant horizon report)
    const reportDelay = isIndoor ? 0.082 : 0.135;
    const reportStart = now + reportDelay;
    const reportDur = isIndoor ? 0.19 : 0.28;
    const reportSrc = ctx.createBufferSource();
    reportSrc.buffer = tailBuf;
    reportSrc.playbackRate.setValueAtTime(0.84 * pitchShift, reportStart);

    const reportLp = ctx.createBiquadFilter();
    reportLp.type = 'lowpass';
    reportLp.frequency.setValueAtTime(isIndoor ? 520 : 420, reportStart);
    reportLp.frequency.exponentialRampToValueAtTime(125, reportStart + reportDur);

    const reportGain = ctx.createGain();
    reportGain.gain.setValueAtTime(isIndoor ? 0.12 : 0.16, reportStart);
    reportGain.gain.exponentialRampToValueAtTime(0.001, reportStart + reportDur);

    reportSrc.connect(reportLp);
    reportLp.connect(reportGain);
    reportGain.connect(destination);
    this.registerVoice(reportSrc, reportGain);
    reportSrc.start(reportStart);
    reportSrc.stop(reportStart + reportDur + 0.015);
  }

  /**
   * Helper for authentic non-sweeping mechanical gun foley clicks, latches, and slide friction:
   * Uses a tight band-passed noise micro-burst + damped steel modal resonance (<12ms)
   * instead of artificial pitch-swept synth oscillators.
   */
  private triggerMechanicalFoleyTransient(
    ctx: AudioContext,
    startTime: number,
    options: {
      centerFreqHz: number;
      q?: number;
      durationSec?: number;
      noiseGain?: number;
      modalFreqsHz?: number[];
      modalGain?: number;
      bodyThudHz?: number;
      bodyThudGain?: number;
      destination?: AudioNode;
    },
  ): void {
    const dest = options.destination ?? ctx.destination;
    const dur = options.durationSec ?? 0.018;
    const noiseBuf = this.noiseBuffer ?? this.crackNoiseBuffer;

    if (noiseBuf && (options.noiseGain ?? 0.24) > 0) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.playbackRate.setValueAtTime(0.92 + Math.random() * 0.16, startTime);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(options.centerFreqHz, startTime);
      bp.Q.setValueAtTime(options.q ?? 2.4, startTime);
      const g = ctx.createGain();
      g.gain.setValueAtTime(options.noiseGain ?? 0.24, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
      src.connect(bp);
      bp.connect(g);
      g.connect(dest);
      this.registerVoice(src, g);
      src.start(startTime, Math.random() * 0.12, dur + 0.01);
      src.stop(startTime + dur + 0.012);
    }

    if (options.modalFreqsHz && options.modalFreqsHz.length > 0) {
      const mGain = options.modalGain ?? 0.12;
      options.modalFreqsHz.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.94, startTime + dur * 0.95);
        g.gain.setValueAtTime(mGain / (idx * 0.65 + 1), startTime);
        g.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
        osc.connect(g);
        g.connect(dest);
        this.registerVoice(osc, g);
        osc.start(startTime);
        osc.stop(startTime + dur + 0.005);
      });
    }

    if (options.bodyThudHz && (options.bodyThudGain ?? 0) > 0) {
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(options.bodyThudHz, startTime);
      thudOsc.frequency.exponentialRampToValueAtTime(
        Math.max(38, options.bodyThudHz * 0.48),
        startTime + 0.028,
      );
      thudGain.gain.setValueAtTime(options.bodyThudGain ?? 0.18, startTime);
      thudGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.034);
      thudOsc.connect(thudGain);
      thudGain.connect(dest);
      this.registerVoice(thudOsc, thudGain);
      thudOsc.start(startTime);
      thudOsc.stop(startTime + 0.038);
    }
  }

  /**
   * Unified Multi-Sample Layered Weapon Firing Architecture:
   * Plays separate, independent 48 kHz sample buffers for:
   *   1. Layer 1 — Initial Gunshot Transient (`transientLayerBuffers[weaponId][transientSampleIndex]`)
   *      with independent pitch randomization (`transientPitch`) and supersonic crack EQ.
   *   2. Layer 2 — Low-Frequency Weapon Body (`bodyLayerBuffers[weaponId][bodySampleIndex]`)
   *      with independent pitch randomization (`bodyPitch`), chamber sub-bass reinforcement, and propellant roar.
   *   3. Layer 3 — Mechanical Weapon Detail (`mechanicalLayerBuffers[weaponId][mechanicalSampleIndex]`)
   *      with independent pitch randomization (`mechanicalPitch`), scheduled at `now + mechanicalDelaySec`
   *      plus complementary steel modal transients.
   *   4. Layer 4 — Environmental Reflection / Tail (`indoor` warehouse reflections vs. `outdoor` open-air decay).
   *   5. Layer 5 — Distant Report (rolled-off perimeter horizon echo).
   */
  private triggerLayeredWeaponShot(
    weaponId: WeaponId,
    destination?: AudioNode,
  ): void {
    const throttleKey =
      weaponId === 'shotgun' ? 'shotgun' : weaponId === 'pistol' ? 'pistol' : 'gunshot';
    const minIntervalMs = weaponId === 'shotgun' ? 120 : weaponId === 'pistol' ? 80 : 55;
    if (!this.canPlay(throttleKey, minIntervalMs)) return;

    if (weaponId === 'shotgun') {
      this.shotgunBlastsPlayed += 1;
    } else if (weaponId === 'pistol') {
      this.pistolShotsPlayed += 1;
    } else {
      this.rifleShotsPlayed += 1;
    }

    // Select independent Transient, Body, and Mechanical sample indices + per-layer randomized pitches
    const { selection, nextHistory } = selectLayeredGunshotParams(
      weaponId,
      this.layerHistory[weaponId],
      3,
    );
    this.layerHistory[weaponId] = nextHistory;
    this.lastLayeredSelection[weaponId] = selection;
    this.lastVariationIndex[weaponId] = selection.bodySampleIndex;

    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const dest = destination ?? ctx.destination;
      const now = ctx.currentTime;

      // Master Anti-Clipping Bus (Low-shelf weight + presence contour + soft-knee compressor)
      const busGain = ctx.createGain();
      busGain.gain.setValueAtTime(weaponId === 'shotgun' ? 0.95 : 0.93, now);

      const bassBoost = ctx.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.setValueAtTime(weaponId === 'shotgun' ? 145 : 138, now);
      bassBoost.gain.setValueAtTime(
        weaponId === 'shotgun' ? 11.2 : weaponId === 'pistol' ? 10.6 : 9.6,
        now,
      );

      const presencePeak = ctx.createBiquadFilter();
      presencePeak.type = 'peaking';
      presencePeak.frequency.setValueAtTime(
        weaponId === 'shotgun' ? 1950 : weaponId === 'pistol' ? 2350 : 2550,
        now,
      );
      presencePeak.Q.setValueAtTime(1.15, now);
      presencePeak.gain.setValueAtTime(3.8, now);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-9.5, now);
      comp.knee.setValueAtTime(4, now);
      comp.ratio.setValueAtTime(9, now);
      comp.attack.setValueAtTime(0.001, now);
      comp.release.setValueAtTime(weaponId === 'shotgun' ? 0.11 : 0.085, now);

      busGain.connect(bassBoost);
      bassBoost.connect(presencePeak);
      presencePeak.connect(comp);
      comp.connect(dest);

      const shaper = ctx.createWaveShaper();
      shaper.curve = this.getAsymmetricBlastCurve(weaponId === 'shotgun' ? 4.2 : 3.9);
      shaper.oversample = '2x';
      shaper.connect(busGain);

      // ======================================================================
      // LAYER 1: INITIAL GUNSHOT TRANSIENT SAMPLE (Dedicated 48 kHz Sample + Pitch Randomization)
      // ======================================================================
      const transPool = this.transientLayerBuffers[weaponId];
      const transBuf = transPool[selection.transientSampleIndex] ?? transPool[0];
      if (transBuf) {
        const transSrc = ctx.createBufferSource();
        transSrc.buffer = transBuf;
        transSrc.playbackRate.setValueAtTime(selection.transientPitch, now);

        const transFilter = ctx.createBiquadFilter();
        transFilter.type = 'highpass';
        transFilter.frequency.setValueAtTime(weaponId === 'shotgun' ? 520 : 680, now);
        transFilter.Q.setValueAtTime(0.9, now);

        const transGain = ctx.createGain();
        transGain.gain.setValueAtTime(selection.transientGain, now);

        transSrc.connect(transFilter);
        transFilter.connect(transGain);
        transGain.connect(shaper);
        this.registerVoice(transSrc, transGain);
        transSrc.start(now);
      }

      // High-density supersonic crack air-tear accent
      if (this.crackNoiseBuffer) {
        const crackSrc = ctx.createBufferSource();
        crackSrc.buffer = this.crackNoiseBuffer;
        crackSrc.playbackRate.setValueAtTime(selection.transientPitch, now);

        const crackBp = ctx.createBiquadFilter();
        crackBp.type = 'bandpass';
        crackBp.frequency.setValueAtTime(
          (weaponId === 'shotgun' ? 3350 : 3850) * selection.transientPitch,
          now,
        );
        crackBp.Q.setValueAtTime(1.2, now);

        const crackGain = ctx.createGain();
        crackGain.gain.setValueAtTime(0.46, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

        crackSrc.connect(crackBp);
        crackBp.connect(crackGain);
        crackGain.connect(busGain);
        this.registerVoice(crackSrc, crackGain);
        crackSrc.start(now);
        crackSrc.stop(now + 0.032);
      }

      // ======================================================================
      // LAYER 2: LOW-FREQUENCY WEAPON BODY SAMPLE (Dedicated 48 kHz Sample + Pitch Randomization)
      // ======================================================================
      const bodyPool = this.bodyLayerBuffers[weaponId];
      const bodyBuf = bodyPool[selection.bodySampleIndex] ?? bodyPool[0];
      if (bodyBuf) {
        const bodySrc = ctx.createBufferSource();
        bodySrc.buffer = bodyBuf;
        bodySrc.playbackRate.setValueAtTime(selection.bodyPitch, now);

        const bodyLp = ctx.createBiquadFilter();
        bodyLp.type = 'lowpass';
        bodyLp.frequency.setValueAtTime(
          (weaponId === 'shotgun' ? 2450 : 2250) * selection.bodyPitch,
          now,
        );
        bodyLp.frequency.exponentialRampToValueAtTime(210, now + bodyBuf.duration * 0.9);
        bodyLp.Q.setValueAtTime(1.15, now);

        const bodyGain = ctx.createGain();
        bodyGain.gain.setValueAtTime(selection.bodyGain, now);

        bodySrc.connect(bodyLp);
        bodyLp.connect(bodyGain);
        bodyGain.connect(shaper);
        this.registerVoice(bodySrc, bodyGain);
        bodySrc.start(now);
      }

      // Sub-bass physical chest-slam reinforcement synchronized with bodyPitch
      this.triggerSubBassCannonLayer(
        ctx,
        now,
        selection.bodyPitch * (weaponId === 'shotgun' ? 0.9 : weaponId === 'pistol' ? 0.95 : 1.0),
        weaponId === 'shotgun' ? 1.18 : weaponId === 'pistol' ? 1.1 : 1.0,
        weaponId === 'shotgun' ? 0.31 : weaponId === 'pistol' ? 0.26 : 0.22,
        dest,
      );

      // ======================================================================
      // LAYER 3: MECHANICAL WEAPON DETAIL SAMPLE (Dedicated 48 kHz Sample + Pitch Randomization)
      // ======================================================================
      const mechPool = this.mechanicalLayerBuffers[weaponId];
      const mechBuf = mechPool[selection.mechanicalSampleIndex] ?? mechPool[0];
      const mechStart = now + selection.mechanicalDelaySec;
      if (mechBuf) {
        const mechSrc = ctx.createBufferSource();
        mechSrc.buffer = mechBuf;
        mechSrc.playbackRate.setValueAtTime(selection.mechanicalPitch, mechStart);

        const mechBp = ctx.createBiquadFilter();
        mechBp.type = 'bandpass';
        mechBp.frequency.setValueAtTime(
          (weaponId === 'shotgun' ? 1950 : weaponId === 'pistol' ? 2450 : 2250) *
            selection.mechanicalPitch,
          mechStart,
        );
        mechBp.Q.setValueAtTime(1.4, mechStart);

        const mechGain = ctx.createGain();
        mechGain.gain.setValueAtTime(selection.mechanicalGain, mechStart);

        mechSrc.connect(mechBp);
        mechBp.connect(mechGain);
        mechGain.connect(busGain);
        this.registerVoice(mechSrc, mechGain);
        mechSrc.start(mechStart);
      }

      // Complementary crisp steel modal transient for action lockup
      this.triggerMechanicalFoleyTransient(ctx, mechStart + 0.012, {
        centerFreqHz:
          (weaponId === 'shotgun' ? 1880 : weaponId === 'pistol' ? 2880 : 2520) *
          selection.mechanicalPitch,
        q: 2.4,
        durationSec: weaponId === 'shotgun' ? 0.042 : 0.018,
        noiseGain: 0.2,
        modalFreqsHz:
          weaponId === 'shotgun'
            ? [960 * selection.mechanicalPitch, 1920 * selection.mechanicalPitch]
            : [1340 * selection.mechanicalPitch, 2560 * selection.mechanicalPitch],
        modalGain: 0.09,
        bodyThudHz: weaponId === 'shotgun' ? 152 : 182,
        bodyThudGain: 0.14,
        destination: busGain,
      });

      // ======================================================================
      // LAYERS 4 & 5: ENVIRONMENTAL REFLECTION TAIL + DISTANT REPORT
      // ======================================================================
      this.triggerEnvironmentalTailAndDistantReport(
        ctx,
        now,
        selection.tailPitch,
        weaponId,
        busGain,
      );
    } catch {
      // Ignore audio errors
    }
  }

  public playGunshot(destination?: AudioNode): void {
    this.triggerLayeredWeaponShot('rifle', destination);
  }

  public playShotgunBlast(destination?: AudioNode): void {
    this.triggerLayeredWeaponShot('shotgun', destination);
  }

  public playPistolShot(destination?: AudioNode): void {
    this.triggerLayeredWeaponShot('pistol', destination);
  }

  /**
   * Realistic Multi-Layered Surface-Material Bullet Impact Sounds:
   * - 'metal': Ballistic steel plate spall snap + FM ricochet whine + resonant plate ring
   * - 'wood': High-velocity timber splinter crack + hollow crate cavity thud
   * - 'concrete': Sharp masonry rock-chip fracture transient + low punch + pulverized dust hiss
   */
  public playSurfaceImpact(material: SurfaceMaterial = 'concrete'): void {
    if (!this.canPlay(`impact_${material}`, 42)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const pitchVar = 0.92 + Math.random() * 0.16;

      if (material === 'metal') {
        // 1. Sharp metallic spall transient
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 3450 * pitchVar,
          q: 3.2,
          durationSec: 0.022,
          noiseGain: 0.24,
          modalFreqsHz: [1480 * pitchVar, 2760 * pitchVar, 4120 * pitchVar],
          modalGain: 0.14,
          bodyThudHz: 195 * pitchVar,
          bodyThudGain: 0.18,
        });
        // 2. High-velocity bullet ricochet whine
        const ricOsc = ctx.createOscillator();
        const ricGain = ctx.createGain();
        ricOsc.type = 'sine';
        const startHz = (2400 + Math.random() * 650) * pitchVar;
        ricOsc.frequency.setValueAtTime(startHz, now + 0.006);
        ricOsc.frequency.exponentialRampToValueAtTime(startHz * 0.38, now + 0.13);
        ricGain.gain.setValueAtTime(0.11, now + 0.006);
        ricGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        ricOsc.connect(ricGain);
        ricGain.connect(ctx.destination);
        this.registerVoice(ricOsc, ricGain);
        ricOsc.start(now + 0.006);
        ricOsc.stop(now + 0.145);
      } else if (material === 'wood') {
        // 1. Timber fiber splinter crack + hollow crate cavity resonance
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1620 * pitchVar,
          q: 1.9,
          durationSec: 0.036,
          noiseGain: 0.25,
          modalFreqsHz: [340 * pitchVar, 690 * pitchVar],
          modalGain: 0.15,
          bodyThudHz: 135 * pitchVar,
          bodyThudGain: 0.26,
        });
      } else {
        // Concrete: Sharp rock-chip fracture snap + heavy masonry thud + dust debris spray
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 2650 * pitchVar,
          q: 2.1,
          durationSec: 0.028,
          noiseGain: 0.24,
          modalFreqsHz: [520 * pitchVar, 1180 * pitchVar],
          modalGain: 0.1,
          bodyThudHz: 148 * pitchVar,
          bodyThudGain: 0.22,
        });
        if (this.noiseBuffer) {
          const dust = ctx.createBufferSource();
          dust.buffer = this.noiseBuffer;
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.frequency.setValueAtTime(1850 * pitchVar, now + 0.012);
          bp.Q.setValueAtTime(1.1, now + 0.012);
          const dustGain = ctx.createGain();
          dustGain.gain.setValueAtTime(0.11, now + 0.012);
          dustGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
          dust.connect(bp);
          bp.connect(dustGain);
          dustGain.connect(ctx.destination);
          this.registerVoice(dust, dustGain);
          dust.start(now + 0.012);
          dust.stop(now + 0.1);
        }
      }
    } catch {}
  }

  /**
   * Realistic Multi-Bounce Spent Brass Shell Casing Floor Clink:
   * Simulates a hollow brass cylinder hitting concrete and spinning to a stop with high-Q modal partials.
   */
  public playShellCasingBounce(): void {
    if (!this.canPlay('shellBounce', 52)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const basePitch = 0.93 + Math.random() * 0.14;
      const bounces = [
        { delay: 0, gain: 0.085 },
        { delay: 0.032 + Math.random() * 0.008, gain: 0.052 },
        { delay: 0.064 + Math.random() * 0.01, gain: 0.028 },
      ];
      bounces.forEach(({ delay, gain }) => {
        const start = now + delay;
        [3880 * basePitch, 5240 * basePitch, 6820 * basePitch].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, start);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.96, start + 0.034);
          g.gain.setValueAtTime(gain / (idx * 0.7 + 1), start);
          g.gain.exponentialRampToValueAtTime(0.001, start + 0.038);
          osc.connect(g);
          g.connect(ctx.destination);
          this.registerVoice(osc, g);
          osc.start(start);
          osc.stop(start + 0.042);
        });
      });
    } catch {}
  }

  /**
   * Realistic 4-Layer Hazard Fuel Barrel Detonation:
   * 1. Steel drum rupture transient crack
   * 2. Deep 135Hz -> 20Hz sub-bass shockwave slam
   * 3. Asymmetric wave-shaped fireball combustion roar
   * 4. Metallic shrapnel scatter + warehouse echo tail
   */
  public playExplosion(): void {
    if (!this.canPlay('explosion', 110)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const pitchShift = 0.94 + Math.random() * 0.12;

      // 1. Sub-bass shockwave cannon slam
      this.triggerSubBassCannonLayer(ctx, now, 0.78 * pitchShift, 1.35, 0.52, ctx.destination);

      // 2. Steel drum rupture crack
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: 2250 * pitchShift,
        q: 1.8,
        durationSec: 0.045,
        noiseGain: 0.36,
        modalFreqsHz: [620 * pitchShift, 1340 * pitchShift],
        modalGain: 0.16,
        bodyThudHz: 118,
        bodyThudGain: 0.34,
      });

      // 3. Fireball combustion roar + debris tail
      const roarBuf = this.brownNoiseBuffer ?? this.noiseBuffer;
      if (roarBuf) {
        const noise = ctx.createBufferSource();
        noise.buffer = roarBuf;
        noise.playbackRate.setValueAtTime(0.82 * pitchShift, now);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1650, now);
        filter.frequency.exponentialRampToValueAtTime(140, now + 0.56);
        filter.Q.setValueAtTime(1.25, now);

        const shaper = ctx.createWaveShaper();
        shaper.curve = this.getAsymmetricBlastCurve(4.4);
        shaper.oversample = '2x';

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.58, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

        noise.connect(filter);
        filter.connect(shaper);
        shaper.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        this.registerVoice(noise, noiseGain);
        noise.start(now);
        noise.stop(now + 0.6);
      }
    } catch {}
  }

  // ============================================================================
  // INDIVIDUAL SYNCHRONIZED WEAPON MECHANICAL AUDIO EVENTS
  // (Never played all simultaneously; each event is triggered at its exact
  // gameplay / reload animation milestone)
  // ============================================================================

  /**
   * 1. Mechanical Event — Trigger Pull:
   * Crisp steel sear disconnector click at the instant the trigger is depressed.
   */
  public playTriggerPull(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (!this.canPlay('mechTriggerPull', 35)) return;
    this.weaponFoleyEventsPlayed += 1;
    this.mechanicalEventsCounts.triggerPull += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const centerHz = weaponId === 'pistol' ? 3450 : weaponId === 'shotgun' ? 2850 : 3200;
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: centerHz,
        q: 3.6,
        durationSec: 0.009,
        noiseGain: 0.16,
        modalFreqsHz: [centerHz * 0.65, centerHz * 1.12],
        modalGain: 0.07,
      });
    } catch {}
  }

  /**
   * 2. Mechanical Event — Firing Mechanism:
   * Hammer drop, firing-pin strike, and breech block mechanical impulse during ignition.
   */
  public playFiringMechanism(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (!this.canPlay('mechFiringPin', 40)) return;
    this.weaponFoleyEventsPlayed += 1;
    this.mechanicalEventsCounts.firingMechanism += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const strikeStart = now + 0.004;
      this.triggerMechanicalFoleyTransient(ctx, strikeStart, {
        centerFreqHz: weaponId === 'shotgun' ? 2180 : weaponId === 'pistol' ? 2680 : 2420,
        q: 2.8,
        durationSec: 0.014,
        noiseGain: 0.19,
        modalFreqsHz: weaponId === 'pistol' ? [1620, 2980] : [1380, 2640],
        modalGain: 0.09,
        bodyThudHz: weaponId === 'shotgun' ? 158 : 192,
        bodyThudGain: 0.11,
      });
    } catch {}
  }

  /**
   * 3. Mechanical Event — Magazine Removal (Reload Stage 1 — Start of reload):
   * Magazine catch button detent click + magazine extraction friction (or cylinder swing-out / shell gate open).
   */
  public playMagazineRemoval(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (!this.canPlay('mechMagOut', 120)) return;
    this.weaponFoleyEventsPlayed += 1;
    this.mechanicalEventsCounts.magazineRemoval += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (weaponId === 'shotgun') {
        // Initial shell carrier gate unlatch & first shell thumb-push
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1920,
          q: 2.1,
          durationSec: 0.034,
          noiseGain: 0.24,
          modalFreqsHz: [1140, 2280],
          modalGain: 0.1,
          bodyThudHz: 155,
          bodyThudGain: 0.16,
        });
      } else if (weaponId === 'pistol') {
        // Revolver cylinder thumb-latch release & crane swing-out + spent brass ejector dump
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 2650,
          q: 3.0,
          durationSec: 0.018,
          noiseGain: 0.24,
          modalFreqsHz: [1760, 2940],
          modalGain: 0.11,
          bodyThudHz: 175,
          bodyThudGain: 0.15,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.038, {
          centerFreqHz: 3650,
          q: 3.5,
          durationSec: 0.024,
          noiseGain: 0.2,
          modalFreqsHz: [2840, 4120],
          modalGain: 0.1,
        });
      } else {
        // Assault Rifle: Magazine catch button detent click + STANAG magazine sliding out of receiver well
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 2780,
          q: 3.2,
          durationSec: 0.016,
          noiseGain: 0.25,
          modalFreqsHz: [1680, 2950],
          modalGain: 0.11,
          bodyThudHz: 168,
          bodyThudGain: 0.14,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.024, {
          centerFreqHz: 1480,
          q: 1.7,
          durationSec: 0.062,
          noiseGain: 0.23,
          modalFreqsHz: [860, 1720],
          modalGain: 0.09,
          bodyThudHz: 128,
          bodyThudGain: 0.14,
        });
      }
    } catch {}
  }

  /**
   * 4. Mechanical Event — Magazine Insertion (Reload Stage 2 — Mid-reload ~48% progress):
   * Firm magazine seating thud into magwell + steel mag-catch tooth lock (or speedloader / shell insertion).
   */
  public playMagazineInsertion(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (!this.canPlay('mechMagIn', 120)) return;
    this.weaponFoleyEventsPlayed += 1;
    this.mechanicalEventsCounts.magazineInsertion += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (weaponId === 'shotgun') {
        // Second 12-gauge brass-rimmed shell seating past spring-steel magazine tube stop
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 2060,
          q: 2.2,
          durationSec: 0.034,
          noiseGain: 0.25,
          modalFreqsHz: [1220, 2440],
          modalGain: 0.1,
          bodyThudHz: 148,
          bodyThudGain: 0.18,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.026, {
          centerFreqHz: 2980,
          q: 3.3,
          durationSec: 0.015,
          noiseGain: 0.23,
          modalFreqsHz: [2150, 3480],
          modalGain: 0.11,
        });
      } else if (weaponId === 'pistol') {
        // Speedloader rounds dropping into .500 Magnum cylinder chambers
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 2340,
          q: 2.6,
          durationSec: 0.028,
          noiseGain: 0.24,
          modalFreqsHz: [1540, 2880],
          modalGain: 0.11,
          bodyThudHz: 152,
          bodyThudGain: 0.18,
        });
      } else {
        // Assault Rifle: Firm STANAG magazine insertion thud + steel mag-catch click
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1380,
          q: 2.0,
          durationSec: 0.032,
          noiseGain: 0.26,
          modalFreqsHz: [820, 1640],
          modalGain: 0.1,
          bodyThudHz: 124,
          bodyThudGain: 0.25,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.022, {
          centerFreqHz: 2840,
          q: 3.2,
          durationSec: 0.016,
          noiseGain: 0.24,
          modalFreqsHz: [1940, 3280],
          modalGain: 0.11,
        });
      }
    } catch {}
  }

  /**
   * 5. Mechanical Event — Bolt or Slide Operation (Reload Stage 3 — ~76% progress):
   * Charging handle / bolt-release rack on Rifle, pump forend rearward stroke on Shotgun, or cylinder crane close on Pistol.
   */
  public playBoltOrSlideOperation(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (!this.canPlay('mechBoltSlide', 110)) return;
    this.weaponFoleyEventsPlayed += 1;
    this.mechanicalEventsCounts.boltOrSlideOperation += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (weaponId === 'shotgun') {
        // Rearward pump action-bar slide ("CHICK") + shell lifter carrier snap
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1880,
          q: 1.9,
          durationSec: 0.046,
          noiseGain: 0.27,
          modalFreqsHz: [940, 1880],
          modalGain: 0.11,
          bodyThudHz: 148,
          bodyThudGain: 0.19,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.028, {
          centerFreqHz: 2920,
          q: 3.1,
          durationSec: 0.016,
          noiseGain: 0.23,
          modalFreqsHz: [2240, 3380],
          modalGain: 0.11,
        });
      } else if (weaponId === 'pistol') {
        // Heavy steel cylinder crane swinging shut into revolver frame
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1750,
          q: 2.2,
          durationSec: 0.026,
          noiseGain: 0.26,
          modalFreqsHz: [1280, 2560],
          modalGain: 0.12,
          bodyThudHz: 138,
          bodyThudGain: 0.22,
        });
      } else {
        // Assault Rifle: Charging handle / bolt-catch release & steel BCG rail slide
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 2150,
          q: 2.1,
          durationSec: 0.034,
          noiseGain: 0.26,
          modalFreqsHz: [1240, 2480],
          modalGain: 0.12,
          bodyThudHz: 142,
          bodyThudGain: 0.18,
        });
      }
    } catch {}
  }

  /**
   * 6. Mechanical Event — Empty Magazine Click (Dry-Fire):
   * Sharp steel hammer sear release + hollow chamber metallic impulse when firing with 0 ammo.
   */
  public playEmptyMagazineClick(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (!this.canPlay('dryfire', 110)) return;
    this.weaponFoleyEventsPlayed += 1;
    this.mechanicalEventsCounts.emptyMagazineClick += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const isShotgun = weaponId === 'shotgun';
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: isShotgun ? 2450 : 3100,
        q: 3.4,
        durationSec: 0.014,
        noiseGain: 0.28,
        modalFreqsHz: isShotgun ? [1420, 2680] : [1840, 3360],
        modalGain: 0.14,
        bodyThudHz: isShotgun ? 165 : 210,
        bodyThudGain: 0.16,
      });
      this.triggerMechanicalFoleyTransient(ctx, now + 0.009, {
        centerFreqHz: isShotgun ? 1820 : 2250,
        q: 2.6,
        durationSec: 0.012,
        noiseGain: 0.16,
        modalFreqsHz: isShotgun ? [980] : [1260],
        modalGain: 0.08,
      });
    } catch {}
  }

  public playDryFire(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    this.playEmptyMagazineClick(weaponId);
  }

  /**
   * 7. Mechanical Event — Weapon Switching:
   * Weapon-specific draw foley + safety selector / cylinder indexing click.
   */
  public playWeaponSwitch(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (!this.canPlay('weapSwitch', 65)) return;
    this.weaponFoleyEventsPlayed += 1;
    this.mechanicalEventsCounts.weaponSwitch += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (weaponId === 'shotgun') {
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1420,
          q: 2.0,
          durationSec: 0.032,
          noiseGain: 0.22,
          modalFreqsHz: [780, 1560],
          modalGain: 0.1,
          bodyThudHz: 118,
          bodyThudGain: 0.22,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.034, {
          centerFreqHz: 2450,
          q: 2.8,
          durationSec: 0.022,
          noiseGain: 0.24,
          modalFreqsHz: [1480, 2920],
          modalGain: 0.11,
        });
      } else if (weaponId === 'pistol') {
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1680,
          q: 1.8,
          durationSec: 0.028,
          noiseGain: 0.2,
          bodyThudHz: 145,
          bodyThudGain: 0.16,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.028, {
          centerFreqHz: 3150,
          q: 3.4,
          durationSec: 0.015,
          noiseGain: 0.22,
          modalFreqsHz: [2180, 3840],
          modalGain: 0.12,
        });
      } else {
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1580,
          q: 2.1,
          durationSec: 0.026,
          noiseGain: 0.21,
          modalFreqsHz: [940, 1880],
          modalGain: 0.09,
          bodyThudHz: 135,
          bodyThudGain: 0.19,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.028, {
          centerFreqHz: 2850,
          q: 3.2,
          durationSec: 0.016,
          noiseGain: 0.25,
          modalFreqsHz: [1920, 3260],
          modalGain: 0.11,
        });
      }
    } catch {}
  }

  /**
   * Backwards-compatible alias for reload start -> triggers Stage 1 Magazine Removal.
   */
  public playReloadStart(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    this.playMagazineRemoval(weaponId);
  }

  /**
   * 8. Mechanical Event — Reload Completion (Reload Stage 4 — 100% completion):
   * Final breech battery lockup thud & forward bolt/forend latch click when weapon is ready to fire.
   */
  public playReloadComplete(weaponId: 'rifle' | 'shotgun' | 'pistol' = 'rifle'): void {
    if (!this.canPlay('reloadDone', 120)) return;
    this.weaponFoleyEventsPlayed += 1;
    this.mechanicalEventsCounts.reloadComplete += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      if (weaponId === 'shotgun') {
        // Forward pump stroke & heavy steel breech bolt lockup ("CHACK")
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 2120,
          q: 1.8,
          durationSec: 0.038,
          noiseGain: 0.25,
          modalFreqsHz: [1120, 2240],
          modalGain: 0.1,
        });
        this.triggerMechanicalFoleyTransient(ctx, now + 0.028, {
          centerFreqHz: 1620,
          q: 2.4,
          durationSec: 0.026,
          noiseGain: 0.3,
          modalFreqsHz: [1320, 2640],
          modalGain: 0.13,
          bodyThudHz: 132,
          bodyThudGain: 0.26,
        });
      } else if (weaponId === 'pistol') {
        // Revolver cylinder locking bolt snap & single-action hammer ready detent
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 3180,
          q: 3.4,
          durationSec: 0.016,
          noiseGain: 0.24,
          modalFreqsHz: [2320, 3860],
          modalGain: 0.12,
          bodyThudHz: 144,
          bodyThudGain: 0.18,
        });
      } else {
        // Assault Rifle: Heavy steel BCG locking lugs slamming into battery
        this.triggerMechanicalFoleyTransient(ctx, now, {
          centerFreqHz: 1780,
          q: 2.5,
          durationSec: 0.024,
          noiseGain: 0.28,
          modalFreqsHz: [1420, 2840],
          modalGain: 0.13,
          bodyThudHz: 146,
          bodyThudGain: 0.24,
        });
      }
    } catch {}
  }

  public playAmmoPickup(): void {
    if (!this.canPlay('ammoPickup', 100)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Steel ammo crate latch unclip + magazine bandolier clack
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: 2450,
        q: 2.6,
        durationSec: 0.024,
        noiseGain: 0.22,
        modalFreqsHz: [1420, 2840],
        modalGain: 0.11,
        bodyThudHz: 158,
        bodyThudGain: 0.18,
      });
      this.triggerMechanicalFoleyTransient(ctx, now + 0.038, {
        centerFreqHz: 3120,
        q: 3.1,
        durationSec: 0.018,
        noiseGain: 0.18,
        modalFreqsHz: [1980, 3640],
        modalGain: 0.1,
      });
    } catch {}
  }

  public playHealthPotionPickup(): void {
    if (!this.canPlay('healthPotion', 100)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Bio-flask pressurized seal pop + crystalline harmonic chime
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: 1850,
        q: 2.2,
        durationSec: 0.022,
        noiseGain: 0.18,
        bodyThudHz: 210,
        bodyThudGain: 0.16,
      });
      [587.33, 880, 1174.66].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const t = now + 0.02 + idx * 0.038;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        this.registerVoice(osc, gain);
        osc.start(t);
        osc.stop(t + 0.17);
      });
    } catch {}
  }

  public getWeaponAudioDiagnostics(): WeaponAudioDiagnostics {
    this.ensureContext();
    return {
      sampleRateHz: this.ctx?.sampleRate ?? 48000,
      environmentMode: this.environmentMode,
      activeVoiceCount: this.activeVoices.size,
      maxConcurrentVoices: this.maxConcurrentVoices,
      totalVoicesCleanedUp: this.totalVoicesCleanedUp,
      hasRifleShotBuffer: Boolean(this.rifleShotBuffer),
      hasShotgunBlastBuffer: Boolean(this.shotgunBlastBuffer),
      hasPistolShotBuffer: Boolean(this.pistolShotBuffer),
      sampleVariationsPerWeapon: {
        rifle: this.transientLayerBuffers.rifle.length || 3,
        shotgun: this.transientLayerBuffers.shotgun.length || 3,
        pistol: this.transientLayerBuffers.pistol.length || 3,
      },
      layeredSamplePools: {
        rifle: {
          transientSamples: this.transientLayerBuffers.rifle.length || 3,
          bodySamples: this.bodyLayerBuffers.rifle.length || 3,
          mechanicalSamples: this.mechanicalLayerBuffers.rifle.length || 3,
        },
        shotgun: {
          transientSamples: this.transientLayerBuffers.shotgun.length || 3,
          bodySamples: this.bodyLayerBuffers.shotgun.length || 3,
          mechanicalSamples: this.mechanicalLayerBuffers.shotgun.length || 3,
        },
        pistol: {
          transientSamples: this.transientLayerBuffers.pistol.length || 3,
          bodySamples: this.bodyLayerBuffers.pistol.length || 3,
          mechanicalSamples: this.mechanicalLayerBuffers.pistol.length || 3,
        },
      },
      lastSelectedVariation: { ...this.lastVariationIndex },
      lastLayeredSelection: {
        rifle: this.lastLayeredSelection.rifle
          ? { ...this.lastLayeredSelection.rifle }
          : null,
        shotgun: this.lastLayeredSelection.shotgun
          ? { ...this.lastLayeredSelection.shotgun }
          : null,
        pistol: this.lastLayeredSelection.pistol
          ? { ...this.lastLayeredSelection.pistol }
          : null,
      },
      layersActive: {
        initialTransient: true,
        lowFreqWeaponBody: true,
        mechanicalDetail: true,
        environmentalTail: true,
        distantReport: true,
      },
      rifleShotsPlayed: this.rifleShotsPlayed,
      shotgunBlastsPlayed: this.shotgunBlastsPlayed,
      pistolShotsPlayed: this.pistolShotsPlayed,
      spatialWeaponShotsPlayed: this.spatialWeaponShotsPlayed,
      weaponFoleyEventsPlayed: this.weaponFoleyEventsPlayed,
      mechanicalEventsCounts: { ...this.mechanicalEventsCounts },
      lastSpatialWeaponShotParams: this.lastSpatialWeaponShotParams
        ? { ...this.lastSpatialWeaponShotParams }
        : null,
      requiredExternalAudioAssets: [...REQUIRED_EXTERNAL_AUDIO_ASSETS],
    };
  }

  /**
   * Hit & Headshot ("Bullet Touches Enemy Head") Confirmation Audio:
   * - Headshot (`isHeadshot = true`):
   *   1. Heavy Sub-Bass Skull/Helmet Impact Drop (180Hz -> 22Hz through low-shelf bass boost + WaveShaper)
   *   2. Metallic Combat Helmet Armor Crunch (high-Q resonant bandpass noise burst)
   *   3. Industrial Steel-on-Steel Anvil Clank (FM-modulated metallic transient)
   *   4. Iconic Multi-Harmonic Ballistic Helmet "DINK" Bell Ring (1960Hz, 3120Hz, 4480Hz with impact pitch bend)
   *   5. Secondary Metallic Spall / Visor Shatter Ping (+22ms)
   * - Body Hit (`isHeadshot = false`):
   *   Punchy sub-bass armor plate thud (155Hz -> 32Hz) + metallic tactical chest-rig clank (680Hz -> 220Hz).
   */
  public playEnemyHit(isHeadshot: boolean = false): void {
    const throttleKey = isHeadshot ? 'headshotHit' : 'enemyHit';
    if (!this.canPlay(throttleKey, isHeadshot ? 25 : 40)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;

      if (isHeadshot) {
        const pitchVar = 0.97 + Math.random() * 0.06;

        // Headshot master bus with +9dB Sub-Bass Low-Shelf Boost + asymmetric waveshaper
        const masterBus = ctx.createGain();
        masterBus.gain.setValueAtTime(0.92, now);

        const bassShelf = ctx.createBiquadFilter();
        bassShelf.type = 'lowshelf';
        bassShelf.frequency.setValueAtTime(115, now);
        bassShelf.gain.setValueAtTime(9.0, now);

        masterBus.connect(bassShelf);
        bassShelf.connect(ctx.destination);

        const shaper = ctx.createWaveShaper();
        shaper.curve = this.getAsymmetricBlastCurve(4.2);
        shaper.oversample = '2x';
        shaper.connect(masterBus);

        // 1. Heavy Sub-Bass Helmet / Skull Impact Drop (180Hz -> 22Hz)
        const subDrop = ctx.createOscillator();
        const subDropGain = ctx.createGain();
        subDrop.type = 'sine';
        subDrop.frequency.setValueAtTime(180 * pitchVar, now);
        subDrop.frequency.exponentialRampToValueAtTime(22, now + 0.135);
        subDropGain.gain.setValueAtTime(0.72, now);
        subDropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        subDrop.connect(subDropGain);
        subDropGain.connect(shaper);
        subDrop.start(now);
        subDrop.stop(now + 0.16);

        // Deep sub-harmonic punch (82Hz -> 18Hz)
        const subPunch = ctx.createOscillator();
        const subPunchGain = ctx.createGain();
        subPunch.type = 'triangle';
        subPunch.frequency.setValueAtTime(82 * pitchVar, now);
        subPunch.frequency.exponentialRampToValueAtTime(18, now + 0.12);
        subPunchGain.gain.setValueAtTime(0.56, now);
        subPunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.135);
        subPunch.connect(subPunchGain);
        subPunchGain.connect(shaper);
        subPunch.start(now);
        subPunch.stop(now + 0.14);

        // 2. Metallic Combat Helmet Armor Crunch & Penetration Snap
        const crunchBuf = this.crackNoiseBuffer ?? this.noiseBuffer;
        if (crunchBuf) {
          const crunchNoise = ctx.createBufferSource();
          crunchNoise.buffer = crunchBuf;
          const crunchFilter = ctx.createBiquadFilter();
          crunchFilter.type = 'bandpass';
          crunchFilter.frequency.setValueAtTime(2650 * pitchVar, now);
          crunchFilter.frequency.exponentialRampToValueAtTime(720, now + 0.065);
          crunchFilter.Q.setValueAtTime(3.0, now);
          const crunchGain = ctx.createGain();
          crunchGain.gain.setValueAtTime(0.55, now);
          crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
          crunchNoise.connect(crunchFilter);
          crunchFilter.connect(crunchGain);
          crunchGain.connect(shaper);
          crunchNoise.start(now);
          crunchNoise.stop(now + 0.08);
        }

        // 3. Industrial Steel-on-Steel Anvil Clank (FM-modulated metallic strike at t = 0)
        const carrier = ctx.createOscillator();
        const modulator = ctx.createOscillator();
        const modGain = ctx.createGain();
        const clankGain = ctx.createGain();

        carrier.type = 'triangle';
        carrier.frequency.setValueAtTime(940 * pitchVar, now);
        carrier.frequency.exponentialRampToValueAtTime(360 * pitchVar, now + 0.075);

        modulator.type = 'square';
        modulator.frequency.setValueAtTime(1380 * pitchVar, now);
        modGain.gain.setValueAtTime(520, now);
        modGain.gain.exponentialRampToValueAtTime(20, now + 0.065);

        clankGain.gain.setValueAtTime(0.36, now);
        clankGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(clankGain);
        clankGain.connect(masterBus);

        modulator.start(now);
        carrier.start(now);
        modulator.stop(now + 0.09);
        carrier.stop(now + 0.09);

        // 4. Iconic Multi-Harmonic Steel Helmet "DINK" Bell Ring (deformed steel pitch bend + resonant ring)
        const bellPartials = [
          { freq: 1960, gain: 0.34, decay: 0.21 },
          { freq: 3120, gain: 0.26, decay: 0.18 },
          { freq: 4480, gain: 0.16, decay: 0.13 },
        ];
        bellPartials.forEach(({ freq, gain, decay }) => {
          const bellOsc = ctx.createOscillator();
          const bellGain = ctx.createGain();
          bellOsc.type = 'sine';
          const targetF = freq * pitchVar;
          // Slight downward metallic deformation pitch bend on bullet contact
          bellOsc.frequency.setValueAtTime(targetF * 1.06, now);
          bellOsc.frequency.exponentialRampToValueAtTime(targetF, now + 0.014);
          bellOsc.frequency.exponentialRampToValueAtTime(targetF * 0.96, now + decay);

          bellGain.gain.setValueAtTime(gain, now);
          bellGain.gain.exponentialRampToValueAtTime(0.001, now + decay);

          bellOsc.connect(bellGain);
          bellGain.connect(masterBus);
          bellOsc.start(now);
          bellOsc.stop(now + decay + 0.01);
        });

        // 5. Secondary Metallic Spall / Visor Shatter Ping (+22ms)
        const pingOsc = ctx.createOscillator();
        const pingGain = ctx.createGain();
        pingOsc.type = 'sine';
        pingOsc.frequency.setValueAtTime(3580 * pitchVar, now + 0.022);
        pingOsc.frequency.exponentialRampToValueAtTime(2540 * pitchVar, now + 0.11);
        pingGain.gain.setValueAtTime(0.22, now + 0.022);
        pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        pingOsc.connect(pingGain);
        pingGain.connect(masterBus);
        pingOsc.start(now + 0.022);
        pingOsc.stop(now + 0.13);
        return;
      }

      // Non-headshot Body Hit: Bass armor-plate thud + metallic vest clank
      const bodySub = ctx.createOscillator();
      const bodySubGain = ctx.createGain();
      bodySub.type = 'sine';
      bodySub.frequency.setValueAtTime(155, now);
      bodySub.frequency.exponentialRampToValueAtTime(32, now + 0.085);
      bodySubGain.gain.setValueAtTime(0.38, now);
      bodySubGain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
      bodySub.connect(bodySubGain);
      bodySubGain.connect(ctx.destination);
      bodySub.start(now);
      bodySub.stop(now + 0.1);

      const plateOsc = ctx.createOscillator();
      const plateGain = ctx.createGain();
      plateOsc.type = 'triangle';
      plateOsc.frequency.setValueAtTime(680, now);
      plateOsc.frequency.exponentialRampToValueAtTime(210, now + 0.065);
      plateGain.gain.setValueAtTime(0.22, now);
      plateGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
      plateOsc.connect(plateGain);
      plateGain.connect(ctx.destination);
      plateOsc.start(now);
      plateOsc.stop(now + 0.08);
    } catch {}
  }

  /**
   * Satisfying Enemy Elimination & Headshot Execution Audio:
   * - Deep sub-bass execution drop + metallic armor collapse + kill confirmation chord.
   */
  public playEnemyDeath(isHeadshot: boolean = false): void {
    if (!this.canPlay('enemyDeath', 70)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // 1. Heavy sub-bass body / execution drop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(isHeadshot ? 165 : 220, now);
      osc.frequency.exponentialRampToValueAtTime(isHeadshot ? 20 : 42, now + 0.28);
      gain.gain.setValueAtTime(isHeadshot ? 0.38 : 0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.31);

      // 2. Metallic helmet / armor shatter resonance on headshot kills
      const freqs = isHeadshot ? [1180, 1760, 2640] : [660, 990];
      freqs.forEach((f, idx) => {
        const chime = ctx.createOscillator();
        const chimeGain = ctx.createGain();
        chime.type = isHeadshot ? 'sine' : 'triangle';
        const start = now + 0.02 + idx * 0.018;
        chime.frequency.setValueAtTime(f, start);
        chime.frequency.exponentialRampToValueAtTime(f * (isHeadshot ? 1.12 : 1.05), start + 0.14);
        chimeGain.gain.setValueAtTime(isHeadshot ? 0.18 / (idx * 0.4 + 1) : 0.15, start);
        chimeGain.gain.exponentialRampToValueAtTime(0.001, start + 0.17);
        chime.connect(chimeGain);
        chimeGain.connect(ctx.destination);
        chime.start(start);
        chime.stop(start + 0.18);
      });
    } catch {}
  }

  public playPlayerDamage(): void {
    if (!this.canPlay('playerDamage', 140)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Visceral ballistic vest blunt-trauma thud + brief tactical gear jolt
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: 620,
        q: 1.5,
        durationSec: 0.055,
        noiseGain: 0.28,
        bodyThudHz: 112,
        bodyThudGain: 0.38,
      });
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(128, now);
      subOsc.frequency.exponentialRampToValueAtTime(34, now + 0.19);
      subGain.gain.setValueAtTime(0.32, now);
      subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      this.registerVoice(subOsc, subGain);
      subOsc.start(now);
      subOsc.stop(now + 0.22);
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
        this.registerVoice(osc, gain);
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
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: 2450,
        q: 3.2,
        durationSec: 0.012,
        noiseGain: 0.14,
        modalFreqsHz: [1480, 2960],
        modalGain: 0.06,
      });
    } catch {}
  }

  public playJump(): void {
    if (!this.canPlay('jump', 120)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Combat boot push-off scuff + tactical rig cloth rustle
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: 920,
        q: 1.6,
        durationSec: 0.042,
        noiseGain: 0.18,
        bodyThudHz: 118,
        bodyThudGain: 0.18,
      });
    } catch {}
  }

  public playLand(): void {
    if (!this.canPlay('land', 120)) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      // Heavy combat boot heel-strike on concrete + equipment settling clack
      this.triggerMechanicalFoleyTransient(ctx, now, {
        centerFreqHz: 780,
        q: 1.5,
        durationSec: 0.055,
        noiseGain: 0.24,
        modalFreqsHz: [1420],
        modalGain: 0.06,
        bodyThudHz: 88,
        bodyThudGain: 0.28,
      });
    } catch {}
  }
}

export const soundSystem = new SoundSystem();

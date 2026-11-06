import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AMMO_PICKUP_RADIUS,
  AMMO_RESPAWN_DURATION_SEC,
  ARENA_OBSTACLES,
  BARREL_MAX_HP,
  BARREL_RESPAWN_SEC,
  ENEMY_ATTACK_COOLDOWN_SEC,
  ENEMY_ATTACK_RANGE,
  ENEMY_CONTACT_DAMAGE,
  ENEMY_DEATH_DURATION_SEC,
  EXPLOSION_BLAST_RADIUS,
  HEALTH_POTION_RESPAWN_DURATION_SEC,
  PLAYER_EYE_HEIGHT,
  WEAPON_ORDER,
  applyPlayerDamage,
  applyWeaponRecoilImpulse,
  calculateKillScore,
  calculateWaveCompletionScore,
  canFireWeapon,
  canReloadWeapon,
  clampPitch,
  collectAmmoResupply,
  collectHealthPotion,
  computeExplosionFalloffDamage,
  createAmmoFeedEntry,
  createExplosionFeedEntry,
  createHealthPotionFeedEntry,
  createInitialAmmoPickups,
  createInitialArsenal,
  createInitialMatchStats,
  createInitialPlayerState,
  createInitialWeaponBobSwayState,
  createKillFeedEntry,
  createProceduralMuzzleFlashBurst,
  detectEnemyFootstepPhaseCrossing,
  fireWeaponRound,
  getEnemyArchetypeProfile,
  getSurfaceImpactProfile,
  getWaveConfig,
  pickEnemyArchetype,
  pushKillFeedEntry,
  rollEnemyLootDrop,
  selectEnemySpawnPoint,
  startReloadWeapon,
  stepEnemyAI,
  stepKillFeed,
  stepPlayerMovement,
  stepProceduralMuzzleFlashBurst,
  stepWeaponBobAndSway,
  stepWeaponReload,
  type AmmoPickupData,
  type EnemyArchetype,
  type EnemyData,
  type GameState,
  type KillFeedEntry,
  type MatchStats,
  type MuzzleFlashBurstData,
  type PickupKind,
  type PlayerState,
  type SpatialAudioParams,
  type SurfaceMaterial,
  type WeaponArsenal,
  type WeaponBobSwayState,
  type WeaponId,
  type WeaponState,
} from '../game/rules';
import {
  buildAmmoPickupModel,
  buildArenaEnvironment,
  buildAssaultRifleModel,
  buildEnemyModel,
  buildHealthPotionModel,
  buildPistolModel,
  buildShotgunModel,
  inspectEnemyModelMetrics,
  type AssaultRifleRig,
  type EnemyModelMetrics,
  type EnemyRig,
} from '../game/models';
import {
  soundSystem,
  type AudioEnvironmentMode,
  type SpatialAudioDebugStats,
  type WeaponAudioDiagnostics,
} from '../game/sound';
import type { HudSnapshot } from './GameHud';

// Pre-allocated math helpers outside the render loop (Zero-GC discipline)
const _rayNDC = new THREE.Vector2(0, 0);
const _raycaster = new THREE.Raycaster();
const _dummyObj = new THREE.Object3D();
const _tempColor = new THREE.Color();
const _muzzleWorldPos = new THREE.Vector3();
const _cameraDir = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _normalVec = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

const MAX_PARTICLES = 128;
const MAX_SHELL_CASINGS = 24;
const MAX_DECALS = 36;

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  r: number;
  g: number;
  b: number;
  size: number;
  age: number;
  maxAge: number;
  gravityFactor: number;
  expandRate: number;
}

interface ShellCasingSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  vRotX: number;
  vRotY: number;
  r: number;
  g: number;
  b: number;
  age: number;
  maxAge: number;
  hasBounced: boolean;
}

interface DecalSlot {
  active: boolean;
  mesh: THREE.Group;
  innerMat: THREE.MeshBasicMaterial;
  rimMat: THREE.MeshBasicMaterial;
  age: number;
  maxAge: number;
}

interface ExplosiveBarrelState {
  id: number;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  active: boolean;
  respawnTimerSec: number;
  colliderMesh: THREE.Mesh;
  drumGroup: THREE.Group;
}

interface ActiveMuzzleFlashBurst {
  data: MuzzleFlashBurstData;
  group: THREE.Group;
  parent: THREE.Object3D;
  meshes: THREE.Mesh[];
  materials: THREE.MeshBasicMaterial[];
}

export interface FpsGameController {
  startNewGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  returnToTitle: () => void;
  toggleMute: () => void;
  switchWeapon: (weaponId: WeaponId) => boolean;
  // Deterministic test helpers for browser verification
  triggerFireShot: () => boolean;
  triggerReload: () => boolean;
  triggerCollectAmmoPickup: () => boolean;
  triggerCollectHealthPotion: () => boolean;
  triggerBarrelExplosion: () => boolean;
  triggerSpatialFootstepAt: (
    x: number,
    y: number,
    z: number,
    archetype?: EnemyArchetype,
  ) => SpatialAudioParams;
  triggerSpatialDistantGunfireAt: (
    x: number,
    y: number,
    z: number,
    burstCount?: number,
  ) => SpatialAudioParams;
  triggerSpatialAmbianceAt: (emitterIndex?: number) => SpatialAudioParams;
  triggerSpatialWeaponFireAt: (
    weaponId: WeaponId,
    x: number,
    y: number,
    z: number,
  ) => SpatialAudioParams;
  setAudioEnvironmentMode: (mode: AudioEnvironmentMode) => AudioEnvironmentMode;
  spawnEnemyOfArchetype: (
    archetype: EnemyArchetype,
    x?: number,
    z?: number,
  ) => EnemyData;
  simulatePlayerDamage: (amount: number) => void;
  aimAtNearestEnemy: (headshot?: boolean) => boolean;
  getDebugState: () => {
    gameState: GameState;
    player: PlayerState;
    weapon: WeaponState;
    arsenal: WeaponArsenal;
    stats: MatchStats;
    killFeed: KillFeedEntry[];
    weaponBobSway: WeaponBobSwayState;
    spatialAudio: SpatialAudioDebugStats;
    activeEnemyCount: number;
    activeEnemies: EnemyData[];
    activeAmmoPickupCount: number;
    activeHealthPotionCount: number;
    activeDecalCount: number;
    activeShellCount: number;
    activeMuzzleFlashBurstCount: number;
    totalMuzzleFlashBurstsSpawned: number;
    explosionsTriggered: number;
    revolverPolygonCount: number;
    shotgunPolygonCount: number;
    enemyModelMetrics: Record<EnemyArchetype, EnemyModelMetrics>;
    weaponAudio: WeaponAudioDiagnostics;
  };
}

interface FpsArenaCanvasProps {
  gameState: GameState;
  onGameStateChange: (nextState: GameState, finalStats?: MatchStats) => void;
  onHudUpdate: (snapshot: HudSnapshot) => void;
  controllerRef: React.MutableRefObject<FpsGameController | null>;
}

export const FpsArenaCanvas: React.FC<FpsArenaCanvasProps> = ({
  gameState,
  onGameStateChange,
  onHudUpdate,
  controllerRef,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  const onGameStateChangeRef = useRef(onGameStateChange);
  const onHudUpdateRef = useRef(onHudUpdate);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    onGameStateChangeRef.current = onGameStateChange;
  }, [onGameStateChange]);

  useEffect(() => {
    onHudUpdateRef.current = onHudUpdate;
  }, [onHudUpdate]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Detect Software WebGL (SwiftShader / llvmpipe)
    const isSoftwareGl = (() => {
      try {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    // 2. Initialize WebGLRenderer, Scene & First-Person PerspectiveCamera
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight,
    );
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('data-testid', 'fps-canvas');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const fogColor = new THREE.Color(0x11151e);
    scene.background = fogColor;
    scene.fog = new THREE.FogExp2(0x11151e, 0.021);

    // Studio Environment Reflection Map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      72,
      (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.08,
      110,
    );
    camera.rotation.order = 'YXZ';
    scene.add(camera);

    // Dynamic Muzzle Flash PointLight attached to camera
    const muzzlePointLight = new THREE.PointLight(0xffb703, 0, 8.5, 1.8);
    muzzlePointLight.position.set(0.25, -0.15, -0.95);
    camera.add(muzzlePointLight);

    // Dynamic Explosion PointLight in world space
    const explosionPointLight = new THREE.PointLight(0xff6b00, 0, 18, 1.5);
    explosionPointLight.position.set(0, -50, 0);
    scene.add(explosionPointLight);

    // 3D Explosion Shockwave Ring & Fireball Core Meshes
    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xfbbf24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const shockwaveMesh = new THREE.Mesh(new THREE.RingGeometry(0.65, 1.0, 28), shockwaveMat);
    shockwaveMesh.rotation.x = -Math.PI / 2;
    shockwaveMesh.visible = false;
    scene.add(shockwaveMesh);

    const fireballMat = new THREE.MeshBasicMaterial({
      color: 0xff5500,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const fireballMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), fireballMat);
    fireballMesh.visible = false;
    scene.add(fireballMesh);

    // 3. Balanced Industrial Lighting Rig (Warm Key Light + Cool Hemisphere Fill)
    const hemiLight = new THREE.HemisphereLight(0x8fa8c8, 0x262930, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.65);
    keyLight.position.set(14, 24, 12);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 1024;
      keyLight.shadow.mapSize.height = 1024;
      const d = 22;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 55;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.55);
    rimLight.position.set(-16, 14, -14);
    scene.add(rimLight);

    // 4. Build 3D Arena Environment & First-Person Weapon Arsenal Rigs
    const environmentColliders = buildArenaEnvironment(scene, renderer, isSoftwareGl);
    const weaponRigs: Record<WeaponId, AssaultRifleRig> = {
      rifle: buildAssaultRifleModel(),
      shotgun: buildShotgunModel(),
      pistol: buildPistolModel(),
    };
    camera.add(weaponRigs.rifle.root);
    camera.add(weaponRigs.shotgun.root);
    camera.add(weaponRigs.pistol.root);

    // Discover interactive Explosive Red Hazard Barrels from environmentColliders
    const explosiveBarrels: ExplosiveBarrelState[] = [];
    for (let i = 0; i < environmentColliders.length; i++) {
      const obj = environmentColliders[i];
      if (obj.userData.isExplosiveBarrel && obj instanceof THREE.Mesh) {
        explosiveBarrels.push({
          id: obj.userData.barrelId as number,
          x: obj.userData.barrelWorldX as number,
          z: obj.userData.barrelWorldZ as number,
          hp: BARREL_MAX_HP,
          maxHp: BARREL_MAX_HP,
          active: true,
          respawnTimerSec: 0,
          colliderMesh: obj,
          drumGroup: obj.userData.barrelGroup as THREE.Group,
        });
      }
    }

    // 5A. Pooled Particle Ring Buffer (InstancedMesh for Sparks, Debris & Volumetric Smoke/Dust)
    const particleGeo = new THREE.BoxGeometry(1, 1, 1);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, MAX_PARTICLES);
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);

    const particles: ParticleSlot[] = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      r: 1,
      g: 1,
      b: 1,
      size: 0.05,
      age: 0,
      maxAge: 0.3,
      gravityFactor: 1,
      expandRate: 0,
    }));
    let particleCursor = 0;

    const spawnParticle = (
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      r: number,
      g: number,
      b: number,
      size: number,
      maxAge: number,
      gravityFactor: number = 1,
      expandRate: number = 0,
    ) => {
      const slot = particles[particleCursor];
      particleCursor = (particleCursor + 1) % MAX_PARTICLES;
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = vx;
      slot.vy = vy;
      slot.vz = vz;
      slot.r = r;
      slot.g = g;
      slot.b = b;
      slot.size = size;
      slot.age = 0;
      slot.maxAge = maxAge;
      slot.gravityFactor = gravityFactor;
      slot.expandRate = expandRate;
    };

    // 5B. Pooled 3D Ejected Brass Shell Casings (InstancedMesh with Floor Bounce + Audio)
    const shellGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.048, 8);
    shellGeo.rotateZ(Math.PI / 2);
    const shellMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.25,
      metalness: 0.85,
    });
    const shellInstancedMesh = new THREE.InstancedMesh(shellGeo, shellMat, MAX_SHELL_CASINGS);
    shellInstancedMesh.frustumCulled = false;
    scene.add(shellInstancedMesh);

    const shellCasings: ShellCasingSlot[] = Array.from({ length: MAX_SHELL_CASINGS }, () => ({
      active: false,
      x: 0,
      y: -100,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      vRotX: 0,
      vRotY: 0,
      r: 0.95,
      g: 0.76,
      b: 0.22,
      age: 0,
      maxAge: 2.2,
      hasBounced: false,
    }));
    let shellCursor = 0;

    const spawnShellCasing = (
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      isShotgunHull: boolean,
    ) => {
      const slot = shellCasings[shellCursor];
      shellCursor = (shellCursor + 1) % MAX_SHELL_CASINGS;
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = vx;
      slot.vy = vy;
      slot.vz = vz;
      slot.rotX = Math.random() * Math.PI;
      slot.rotY = Math.random() * Math.PI;
      slot.rotZ = Math.random() * Math.PI;
      slot.vRotX = 14 + Math.random() * 14;
      slot.vRotY = 12 + Math.random() * 14;
      slot.r = isShotgunHull ? 0.88 : 0.95;
      slot.g = isShotgunHull ? 0.18 : 0.78;
      slot.b = isShotgunHull ? 0.16 : 0.24;
      slot.age = 0;
      slot.maxAge = 2.4;
      slot.hasBounced = false;
    };

    // 5C. Pooled 3D Bullet Impact Decals (Placed flush on Concrete, Wood, and Metal surfaces)
    const decalCoreGeo = new THREE.CircleGeometry(1, 12);
    const decalRimGeo = new THREE.RingGeometry(0.85, 1.35, 12);
    const decals: DecalSlot[] = Array.from({ length: MAX_DECALS }, () => {
      const group = new THREE.Group();
      group.visible = false;
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0x111318,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const rimMat = new THREE.MeshBasicMaterial({
        color: 0x475569,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const coreMesh = new THREE.Mesh(decalCoreGeo, innerMat);
      const rimMesh = new THREE.Mesh(decalRimGeo, rimMat);
      group.add(coreMesh, rimMesh);
      scene.add(group);
      return {
        active: false,
        mesh: group,
        innerMat,
        rimMat,
        age: 0,
        maxAge: 10.0,
      };
    });
    let decalCursor = 0;

    const spawnBulletDecal = (
      point: THREE.Vector3,
      normal: THREE.Vector3,
      material: SurfaceMaterial,
      scaleMultiplier: number = 1,
    ) => {
      const profile = getSurfaceImpactProfile(material);
      const slot = decals[decalCursor];
      decalCursor = (decalCursor + 1) % MAX_DECALS;
      slot.active = true;
      slot.age = 0;
      slot.maxAge = 10.0;
      slot.innerMat.color.setHex(profile.decalColorHex);
      slot.rimMat.color.setHex(profile.decalRimColorHex);
      slot.innerMat.opacity = 0.92;
      slot.rimMat.opacity = 0.68;

      const radius = profile.decalRadius * scaleMultiplier;
      slot.mesh.position.copy(point).addScaledVector(normal, 0.012);
      _lookTarget.copy(slot.mesh.position).add(normal);
      slot.mesh.lookAt(_lookTarget);
      slot.mesh.scale.set(radius, radius, radius);
      slot.mesh.visible = true;
    };

    // 5D. Procedural Barrel-Tip Muzzle Flash Particle Burst System
    // Spawns a bright, randomized additive particle burst group at the barrel tip on every shot,
    // rapidly fades each particle's opacity, and removes the burst group from the scene when expired.
    const muzzleCoreGeo = new THREE.OctahedronGeometry(1, 0);
    const muzzleStreakGeo = new THREE.BoxGeometry(1, 1, 1);
    const activeMuzzleFlashBursts: ActiveMuzzleFlashBurst[] = [];
    let totalMuzzleFlashBurstsSpawned = 0;

    const spawnProceduralMuzzleFlash = (rig: AssaultRifleRig, weaponId: WeaponId) => {
      const burstData = createProceduralMuzzleFlashBurst(weaponId);
      const group = new THREE.Group();
      group.name = 'procedural-muzzle-flash-burst';
      group.position.copy(rig.muzzleFlashGroup.position);
      group.rotation.z = burstData.rollAngle;

      const meshes: THREE.Mesh[] = [];
      const materials: THREE.MeshBasicMaterial[] = [];

      for (let i = 0; i < burstData.particles.length; i++) {
        const p = burstData.particles[i];
        const mat = new THREE.MeshBasicMaterial({
          color: p.colorHex,
          transparent: true,
          opacity: p.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const geo = p.kind === 'streak' ? muzzleStreakGeo : muzzleCoreGeo;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(p.x, p.y, p.z);
        mesh.rotation.set(p.rotX, p.rotY, p.rotZ);
        mesh.scale.set(p.scaleX, p.scaleY, p.scaleZ);
        group.add(mesh);
        meshes.push(mesh);
        materials.push(mat);
      }

      rig.bodyGroup.add(group);
      activeMuzzleFlashBursts.push({
        data: burstData,
        group,
        parent: rig.bodyGroup,
        meshes,
        materials,
      });
      totalMuzzleFlashBurstsSpawned += 1;
    };

    const clearAllMuzzleFlashBursts = () => {
      for (let i = activeMuzzleFlashBursts.length - 1; i >= 0; i--) {
        const b = activeMuzzleFlashBursts[i];
        b.parent.remove(b.group);
        for (let m = 0; m < b.materials.length; m++) {
          b.materials[m].dispose();
        }
      }
      activeMuzzleFlashBursts.length = 0;
    };

    const clearAllParticlesAndDecals = () => {
      clearAllMuzzleFlashBursts();
      for (let i = 0; i < MAX_PARTICLES; i++) {
        particles[i].active = false;
        _dummyObj.position.set(0, -100, 0);
        _dummyObj.scale.set(0.001, 0.001, 0.001);
        _dummyObj.updateMatrix();
        particleMesh.setMatrixAt(i, _dummyObj.matrix);
      }
      particleMesh.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < MAX_SHELL_CASINGS; i++) {
        shellCasings[i].active = false;
        _dummyObj.position.set(0, -100, 0);
        _dummyObj.scale.set(0.001, 0.001, 0.001);
        _dummyObj.updateMatrix();
        shellInstancedMesh.setMatrixAt(i, _dummyObj.matrix);
      }
      shellInstancedMesh.instanceMatrix.needsUpdate = true;

      for (let i = 0; i < MAX_DECALS; i++) {
        decals[i].active = false;
        decals[i].mesh.visible = false;
      }
    };
    clearAllParticlesAndDecals();

    // 3D Bullet Tracer Line
    const tracerPositions = new Float32Array(6);
    const tracerGeo = new THREE.BufferGeometry();
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPositions, 3));
    const tracerMat = new THREE.LineBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0.85,
    });
    const tracerLine = new THREE.Line(tracerGeo, tracerMat);
    tracerLine.visible = false;
    tracerLine.frustumCulled = false;
    scene.add(tracerLine);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 6. Mutable Simulation State
    let player: PlayerState = createInitialPlayerState();
    let arsenal: WeaponArsenal = createInitialArsenal();
    let activeWeaponId: WeaponId = 'rifle';
    let weapon: WeaponState = arsenal[activeWeaponId];
    let stats: MatchStats = createInitialMatchStats();
    let killFeed: KillFeedEntry[] = [];
    let nextKillFeedId = 1;
    let enemies: EnemyData[] = [];
    const enemyRigs = new Map<number, EnemyRig>();
    let nextEnemyId = 1;

    // 3D Ammo Supply Crates & Enemy Ammo Drops
    let ammoPickups: AmmoPickupData[] = [];
    const ammoPickupMeshes = new Map<number, THREE.Group>();
    let nextAmmoPickupId = 100;

    const getActiveWeaponRig = (): AssaultRifleRig => weaponRigs[activeWeaponId];

    const updateWeaponRigVisibility = (visibleInPlay: boolean) => {
      for (const id of WEAPON_ORDER) {
        weaponRigs[id].root.visible = visibleInPlay && id === activeWeaponId;
        if (id !== activeWeaponId) {
          weaponRigs[id].muzzleFlashGroup.visible = false;
        }
      }
    };

    const clearAllAmmoPickups = () => {
      ammoPickupMeshes.forEach((group) => {
        scene.remove(group);
      });
      ammoPickupMeshes.clear();
      ammoPickups = [];
    };

    const setupInitialAmmoPickups = () => {
      clearAllAmmoPickups();
      const initialPickups = createInitialAmmoPickups();
      for (const p of initialPickups) {
        const meshGroup =
          p.pickupKind === 'health_potion'
            ? buildHealthPotionModel().root
            : buildAmmoPickupModel().root;
        meshGroup.position.set(p.x, 0, p.z);
        scene.add(meshGroup);
        ammoPickups.push(p);
        ammoPickupMeshes.set(p.id, meshGroup);
      }
    };

    const resetExplosiveBarrels = () => {
      for (const b of explosiveBarrels) {
        b.active = true;
        b.hp = b.maxHp;
        b.respawnTimerSec = 0;
        b.drumGroup.visible = true;
      }
    };

    const spawnDroppedPickup = (
      x: number,
      z: number,
      pickupKind: PickupKind = 'ammo',
    ) => {
      const id = nextAmmoPickupId++;
      const dropData: AmmoPickupData = {
        id,
        x,
        z,
        active: true,
        respawnTimerSec: 0,
        isDrop: true,
        pickupKind,
      };
      const meshGroup =
        pickupKind === 'health_potion'
          ? buildHealthPotionModel().root
          : buildAmmoPickupModel().root;
      meshGroup.position.set(x, 0, z);
      scene.add(meshGroup);
      ammoPickups.push(dropData);
      ammoPickupMeshes.set(id, meshGroup);
      return dropData;
    };

    let elapsedSimTimeSec = 0;
    let spawnTimerSec = 0.25;
    let nextWaveDelayTimerSec = 0;
    let isWaitingForNextWave = false;
    let waveAnnouncementText: string | null = 'WAVE 1 — HOSTILES INBOUND';
    let waveAnnouncementTimerSec = 2.4;

    let muzzleFlashTimerSec = 0;
    let tracerTimerSec = 0;
    let explosionVisualTimerSec = 0;
    let explosionsTriggered = 0;
    let crosshairSpread = 0;
    let hitMarkerTimer = 0;
    let hitMarkerHeadshot = false;
    let killConfirmTimer = 0;
    let killConfirmHeadshot = false;
    let combatFlashAlpha = 0;
    let damageFlashAlpha = 0;
    let cameraShakeTrauma = 0;
    let cameraRecoilPitch = 0;
    let cameraRecoilRoll = 0;
    let damageRollTilt = 0;
    let hitstopTimerSec = 0;
    let bobSwayState: WeaponBobSwayState = createInitialWeaponBobSwayState();
    let pendingLookDeltaYaw = 0;
    let pendingLookDeltaPitch = 0;

    let reloadInsertionSoundPlayed = false;
    let reloadBoltSoundPlayed = false;

    const cachedEnemyModelMetrics: Record<EnemyArchetype, EnemyModelMetrics> = {
      brute: inspectEnemyModelMetrics('brute', isSoftwareGl),
      assault: inspectEnemyModelMetrics('assault', isSoftwareGl),
      heavy: inspectEnemyModelMetrics('heavy', isSoftwareGl),
      flanker: inspectEnemyModelMetrics('flanker', isSoftwareGl),
    };

    // Input state
    const keysHeld = new Set<string>();
    let jumpJustPressed = false;
    let isMouseDown = false;
    let isPointerLocked = false;
    let lastHudSyncTime = 0;

    // Dispose and remove all enemies cleanly
    const clearAllEnemies = () => {
      enemyRigs.forEach((rig) => {
        scene.remove(rig.root);
      });
      enemyRigs.clear();
      enemies = [];
    };

    const spawnSingleEnemy = (
      waveNum: number,
      spawnIndex: number,
      atPos?: { x: number; z: number },
      forcedArchetype?: EnemyArchetype,
    ): EnemyData => {
      const cfg = getWaveConfig(waveNum);
      const pos = atPos ?? selectEnemySpawnPoint(player.x, player.z, spawnIndex, 11.5);
      const archetype = forcedArchetype ?? pickEnemyArchetype(waveNum, spawnIndex);
      const profile = getEnemyArchetypeProfile(archetype, cfg);
      const id = nextEnemyId++;

      const enemyData: EnemyData = {
        id,
        archetype,
        x: pos.x,
        y: 0,
        z: pos.z,
        vx: 0,
        vz: 0,
        yaw: Math.atan2(player.x - pos.x, player.z - pos.z),
        hp: profile.hp,
        maxHp: profile.hp,
        speed: profile.speed,
        attackDamage: profile.attackDamage ?? ENEMY_CONTACT_DAMAGE,
        attackRange: profile.attackRange ?? ENEMY_ATTACK_RANGE,
        attackCooldownSec: ENEMY_ATTACK_COOLDOWN_SEC,
        attackTimerSec: 0.35,
        windupTimerSec: 0,
        isWindingUp: false,
        hitFlashTimerSec: 0,
        walkCycle: 0,
        isDead: false,
        deathTimerSec: 0,
        flankSign: id % 2 === 0 ? 1 : -1,
      };

      const rig = buildEnemyModel(id, archetype, isSoftwareGl);
      rig.root.position.set(enemyData.x, 0, enemyData.z);
      rig.root.rotation.y = enemyData.yaw;
      scene.add(rig.root);

      enemies.push(enemyData);
      enemyRigs.set(id, rig);
      return enemyData;
    };

    const setupTitlePreviewEnemies = () => {
      clearAllEnemies();
      setupInitialAmmoPickups();
      resetExplosiveBarrels();
      spawnSingleEnemy(1, 0, { x: -7, z: -4 }, 'flanker');
      spawnSingleEnemy(2, 1, { x: 6, z: 5 }, 'brute');
      spawnSingleEnemy(3, 2, { x: 4, z: -8 }, 'assault');
    };

    const syncHudImmediate = () => {
      arsenal[activeWeaponId] = weapon;
      onHudUpdateRef.current({
        player: { ...player },
        weapon: { ...weapon },
        arsenal: {
          rifle: { ...arsenal.rifle },
          shotgun: { ...arsenal.shotgun },
          pistol: { ...arsenal.pistol },
        },
        stats: { ...stats },
        killFeed: [...killFeed],
        crosshairSpread,
        hitMarkerTimer,
        hitMarkerHeadshot,
        killConfirmTimer,
        killConfirmHeadshot,
        combatFlashAlpha,
        damageFlashAlpha,
        isPointerLocked,
        isMuted: soundSystem.isMuted,
        waveAnnouncementText,
      });
    };

    const handleEnemyEliminated = (
      targetEnemy: EnemyData,
      isHeadshot: boolean,
      weaponUsedName: string,
    ) => {
      if (targetEnemy.isDead) return;
      targetEnemy.isDead = true;
      targetEnemy.deathTimerSec = 0;
      hitstopTimerSec = 0.042;
      cameraShakeTrauma = Math.min(1.0, cameraShakeTrauma + 0.25);
      killConfirmTimer = 0.65;
      killConfirmHeadshot = isHeadshot;
      combatFlashAlpha = Math.max(combatFlashAlpha, 0.24);

      stats.score = calculateKillScore(stats.score, isHeadshot);
      stats.totalEnemiesEliminated += 1;
      if (isHeadshot) {
        stats.headshots += 1;
      }
      stats.enemiesRemainingInWave = Math.max(0, stats.enemiesRemainingInWave - 1);
      killFeed = pushKillFeedEntry(
        killFeed,
        createKillFeedEntry(
          nextKillFeedId++,
          targetEnemy.archetype,
          isHeadshot,
          4.0,
          weaponUsedName,
        ),
      );
      soundSystem.playEnemyDeath(isHeadshot);

      // Lowered enemy loot drops: 12% Health Potion, 25% Ammo Crate, 63% No Drop
      const droppedLootKind = rollEnemyLootDrop();
      if (droppedLootKind) {
        spawnDroppedPickup(targetEnemy.x, targetEnemy.z, droppedLootKind);
      }

      // Death particle burst + dark smoke puff
      for (let p = 0; p < 16; p++) {
        spawnParticle(
          targetEnemy.x + (Math.random() - 0.5) * 0.5,
          1.0 + (Math.random() - 0.5) * 0.6,
          targetEnemy.z + (Math.random() - 0.5) * 0.5,
          (Math.random() - 0.5) * 5.8,
          1.8 + Math.random() * 4.2,
          (Math.random() - 0.5) * 5.8,
          0.95,
          0.22,
          0.22,
          0.075,
          0.48,
          0.95,
          0,
        );
      }

      if (stats.enemiesRemainingInWave <= 0 && !isWaitingForNextWave) {
        stats.score = calculateWaveCompletionScore(stats.score);
        isWaitingForNextWave = true;
        nextWaveDelayTimerSec = 2.2;
        waveAnnouncementText = `WAVE ${stats.wave} CLEARED! +250 BONUS`;
        waveAnnouncementTimerSec = 2.1;
      }
    };

    /**
     * Detonates a 3D Hazard Barrel with shockwave ring, fireball core, dynamic PointLight,
     * flying sparks/debris/smoke, floor scorch decal, and AoE blast damage.
     */
    const detonateExplosiveBarrel = (barrel: ExplosiveBarrelState): boolean => {
      if (!barrel.active) return false;
      barrel.active = false;
      barrel.hp = 0;
      barrel.respawnTimerSec = BARREL_RESPAWN_SEC;
      barrel.drumGroup.visible = false;
      explosionsTriggered += 1;

      soundSystem.playExplosion();

      // Dynamic Explosion Lighting & 3D Shockwave Ring + Fireball
      explosionPointLight.position.set(barrel.x, 1.35, barrel.z);
      explosionPointLight.intensity = 7.5;
      shockwaveMesh.position.set(barrel.x, 0.06, barrel.z);
      shockwaveMesh.scale.set(0.3, 0.3, 0.3);
      shockwaveMat.opacity = 0.92;
      shockwaveMesh.visible = true;

      fireballMesh.position.set(barrel.x, 0.9, barrel.z);
      fireballMesh.scale.set(0.4, 0.4, 0.4);
      fireballMat.opacity = 0.95;
      fireballMesh.visible = true;
      explosionVisualTimerSec = 0.48;

      // Leave charred blast crater decal on the concrete floor
      _hitPoint.set(barrel.x, 0.01, barrel.z);
      _normalVec.set(0, 1, 0);
      spawnBulletDecal(_hitPoint, _normalVec, 'concrete', 4.5);

      // Multi-layered Explosion Particles: Flying Sparks, Heavy Debris & Rising Smoke Plume
      for (let i = 0; i < 18; i++) {
        // Bright orange-gold flying sparks
        const angle = Math.random() * Math.PI * 2;
        const speed = 3.5 + Math.random() * 7.5;
        spawnParticle(
          barrel.x,
          0.75 + Math.random() * 0.5,
          barrel.z,
          Math.cos(angle) * speed,
          2.5 + Math.random() * 5.5,
          Math.sin(angle) * speed,
          1.0,
          0.55 + Math.random() * 0.38,
          0.12,
          0.085,
          0.52,
          1.0,
          0,
        );
      }

      for (let i = 0; i < 10; i++) {
        // Rising volumetric dark smoke plumes
        spawnParticle(
          barrel.x + (Math.random() - 0.5) * 1.1,
          0.6 + Math.random() * 0.8,
          barrel.z + (Math.random() - 0.5) * 1.1,
          (Math.random() - 0.5) * 2.2,
          1.6 + Math.random() * 2.2,
          (Math.random() - 0.5) * 2.2,
          0.22,
          0.24,
          0.28,
          0.16,
          0.78,
          -0.25,
          0.35,
        );
      }

      // Area-of-Effect Blast Damage to Living Enemies
      let blastKills = 0;
      for (const e of enemies) {
        if (e.isDead) continue;
        const dist = Math.hypot(e.x - barrel.x, e.z - barrel.z);
        const dmg = computeExplosionFalloffDamage(dist, EXPLOSION_BLAST_RADIUS);
        if (dmg > 0) {
          e.hp = Math.max(0, e.hp - dmg);
          e.hitFlashTimerSec = 0.22;
          // Push enemy outward from blast center
          const pushDirX = (e.x - barrel.x) / Math.max(0.1, dist);
          const pushDirZ = (e.z - barrel.z) / Math.max(0.1, dist);
          e.vx += pushDirX * 5.5;
          e.vz += pushDirZ * 5.5;

          if (e.hp <= 0) {
            blastKills += 1;
            handleEnemyEliminated(e, false, 'Hazard Barrel');
          }
        }
      }

      killFeed = pushKillFeedEntry(
        killFeed,
        createExplosionFeedEntry(nextKillFeedId++, blastKills),
      );

      // Distance-attenuated Camera Shake & Screen Flash
      const playerDist = Math.hypot(player.x - barrel.x, player.z - barrel.z);
      const proximity = Math.max(0.22, 1 - playerDist / 18);
      cameraShakeTrauma = Math.min(1.0, cameraShakeTrauma + 0.65 * proximity);
      combatFlashAlpha = Math.max(combatFlashAlpha, 0.42 * proximity);
      hitMarkerTimer = 0.22;

      syncHudImmediate();
      return true;
    };

    /**
     * Spawns surface-material specific particles (metal sparks, wood splinters, concrete chips + dust)
     * plus a 3D Bullet Impact Decal on the surface.
     */
    const spawnSurfaceBulletImpact = (
      hit: THREE.Intersection,
      material: SurfaceMaterial,
      pelletCount: number,
    ) => {
      const pt = hit.point;
      const norm = hit.face?.normal ? _normalVec.copy(hit.face.normal) : _normalVec.set(0, 1, 0);
      const profile = getSurfaceImpactProfile(material);
      const scaleCount = pelletCount > 1 ? 0.5 : 1.0;

      // 1. Place 3D Bullet Impact Decal on surface
      spawnBulletDecal(pt, norm, material, pelletCount > 1 ? 0.85 : 1.0);

      // 2. Flying Sparks (especially vivid on Metal)
      const sparks = Math.max(1, Math.round(profile.sparkCount * scaleCount));
      for (let i = 0; i < sparks; i++) {
        spawnParticle(
          pt.x + norm.x * 0.03,
          pt.y + norm.y * 0.03,
          pt.z + norm.z * 0.03,
          norm.x * 2.8 + (Math.random() - 0.5) * 4.4,
          1.4 + Math.random() * 3.0,
          norm.z * 2.8 + (Math.random() - 0.5) * 4.4,
          profile.sparkColor[0],
          profile.sparkColor[1],
          profile.sparkColor[2],
          material === 'metal' ? 0.042 : 0.032,
          0.26,
          0.85,
          0,
        );
      }

      // 3. Tumbling Debris Chunks (Wood splinters / Concrete chips)
      const debris = Math.max(1, Math.round(profile.debrisCount * scaleCount));
      for (let i = 0; i < debris; i++) {
        spawnParticle(
          pt.x + norm.x * 0.04,
          pt.y + norm.y * 0.04,
          pt.z + norm.z * 0.04,
          norm.x * 1.8 + (Math.random() - 0.5) * 2.8,
          1.1 + Math.random() * 2.2,
          norm.z * 1.8 + (Math.random() - 0.5) * 2.8,
          profile.debrisColor[0],
          profile.debrisColor[1],
          profile.debrisColor[2],
          0.048,
          0.38,
          1.15,
          0,
        );
      }

      // 4. Expanding Surface Dust Cloud
      const dust = Math.max(1, Math.round(profile.dustCount * scaleCount));
      for (let i = 0; i < dust; i++) {
        spawnParticle(
          pt.x + norm.x * 0.05,
          pt.y + norm.y * 0.05,
          pt.z + norm.z * 0.05,
          norm.x * 0.9 + (Math.random() - 0.5) * 1.2,
          0.4 + Math.random() * 0.8,
          norm.z * 0.9 + (Math.random() - 0.5) * 1.2,
          profile.dustColor[0],
          profile.dustColor[1],
          profile.dustColor[2],
          0.065,
          0.34,
          -0.18,
          0.18,
        );
      }
    };

    const switchWeapon = (nextId: WeaponId): boolean => {
      if (gameStateRef.current !== 'playing') return false;
      if (nextId === activeWeaponId) return false;
      arsenal[activeWeaponId] = {
        ...weapon,
        isReloading: false,
        reloadTimerSec: 0,
        recoilAmount: 0,
      };
      activeWeaponId = nextId;
      weapon = {
        ...arsenal[activeWeaponId],
        recoilAmount: 0.25,
      };
      arsenal[activeWeaponId] = weapon;
      bobSwayState = {
        ...bobSwayState,
        drawProgress: 0,
        swayRoll: 0.09,
      };
      muzzleFlashTimerSec = 0;
      muzzlePointLight.intensity = 0;
      updateWeaponRigVisibility(true);
      soundSystem.playWeaponSwitch(activeWeaponId);
      syncHudImmediate();
      return true;
    };

    const collectPickupEntry = (
      pickup: AmmoPickupData,
      forceEvenAtFullHp: boolean = false,
    ): boolean => {
      if (!pickup.active) return false;
      const isHealthPotion = pickup.pickupKind === 'health_potion';

      if (isHealthPotion) {
        if (player.hp >= player.maxHp && !forceEvenAtFullHp) {
          return false;
        }
        const healRes = collectHealthPotion(player.hp, player.maxHp);
        player.hp = healRes.nextHp;
        stats.healthPotionsCollected = (stats.healthPotionsCollected ?? 0) + 1;

        killFeed = pushKillFeedEntry(
          killFeed,
          createHealthPotionFeedEntry(
            nextKillFeedId++,
            healRes.healedAmount > 0 ? healRes.healedAmount : 25,
          ),
        );
        soundSystem.playHealthPotionPickup();

        // Rising crimson/rose restorative sparkle burst
        for (let p = 0; p < 14; p++) {
          spawnParticle(
            pickup.x + (Math.random() - 0.5) * 0.45,
            0.35 + Math.random() * 0.35,
            pickup.z + (Math.random() - 0.5) * 0.45,
            (Math.random() - 0.5) * 2.8,
            1.6 + Math.random() * 2.6,
            (Math.random() - 0.5) * 2.8,
            0.98,
            0.26,
            0.44,
            0.058,
            0.46,
            0.45,
            0,
          );
        }
      } else {
        arsenal[activeWeaponId] = weapon;
        const res = collectAmmoResupply(arsenal);
        arsenal = res.arsenal;
        weapon = arsenal[activeWeaponId];
        stats.ammoPickupsCollected += 1;

        killFeed = pushKillFeedEntry(
          killFeed,
          createAmmoFeedEntry(nextKillFeedId++, res.rifleAdded, res.shotgunAdded, res.pistolAdded),
        );
        soundSystem.playAmmoPickup();

        for (let p = 0; p < 12; p++) {
          spawnParticle(
            pickup.x + (Math.random() - 0.5) * 0.4,
            0.35 + Math.random() * 0.3,
            pickup.z + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 3.2,
            1.4 + Math.random() * 2.4,
            (Math.random() - 0.5) * 3.2,
            0.2,
            0.95,
            0.55,
            0.055,
            0.42,
            0.6,
            0,
          );
        }
      }

      const mesh = ammoPickupMeshes.get(pickup.id);
      if (pickup.isDrop) {
        pickup.active = false;
        if (mesh) {
          scene.remove(mesh);
          ammoPickupMeshes.delete(pickup.id);
        }
      } else {
        pickup.active = false;
        pickup.respawnTimerSec = isHealthPotion
          ? HEALTH_POTION_RESPAWN_DURATION_SEC
          : AMMO_RESPAWN_DURATION_SEC;
        if (mesh) {
          mesh.visible = false;
        }
      }

      syncHudImmediate();
      return true;
    };

    const resetGameToPlaying = (requestLock: boolean = true) => {
      clearAllEnemies();
      clearAllParticlesAndDecals();
      setupInitialAmmoPickups();
      resetExplosiveBarrels();
      player = createInitialPlayerState();
      arsenal = createInitialArsenal();
      activeWeaponId = 'rifle';
      weapon = arsenal.rifle;
      stats = createInitialMatchStats();
      killFeed = [];
      elapsedSimTimeSec = 0;
      spawnTimerSec = 0.25;
      nextWaveDelayTimerSec = 0;
      isWaitingForNextWave = false;
      waveAnnouncementText = 'WAVE 1 — SURVIVE & ELIMINATE';
      waveAnnouncementTimerSec = 2.4;
      muzzleFlashTimerSec = 0;
      muzzlePointLight.intensity = 0;
      explosionPointLight.intensity = 0;
      shockwaveMesh.visible = false;
      fireballMesh.visible = false;
      explosionVisualTimerSec = 0;
      tracerTimerSec = 0;
      tracerLine.visible = false;
      crosshairSpread = 0;
      hitMarkerTimer = 0;
      hitMarkerHeadshot = false;
      killConfirmTimer = 0;
      killConfirmHeadshot = false;
      combatFlashAlpha = 0;
      damageFlashAlpha = 0;
      cameraShakeTrauma = 0;
      cameraRecoilPitch = 0;
      cameraRecoilRoll = 0;
      damageRollTilt = 0;
      hitstopTimerSec = 0;
      bobSwayState = createInitialWeaponBobSwayState();
      pendingLookDeltaYaw = 0;
      pendingLookDeltaPitch = 0;
      keysHeld.clear();
      jumpJustPressed = false;
      isMouseDown = false;

      camera.position.set(player.x, player.y + PLAYER_EYE_HEIGHT, player.z);
      camera.rotation.set(0, 0, 0, 'YXZ');
      updateWeaponRigVisibility(true);

      spawnSingleEnemy(1, 0);
      spawnSingleEnemy(1, 1);
      stats.enemiesSpawnedInWave = 2;
      spawnTimerSec = getWaveConfig(1).spawnIntervalSec;

      gameStateRef.current = 'playing';
      document.body.dataset.state = 'playing';
      onGameStateChangeRef.current('playing', { ...stats });
      soundSystem.playWaveStart();
      syncHudImmediate();

      if (requestLock) {
        try {
          renderer.domElement.requestPointerLock?.();
        } catch {}
      }
    };

    // Execute a weapon shot (supports single-ray Rifle/Pistol and multi-pellet Shotgun)
    const performWeaponShot = (): boolean => {
      if (gameStateRef.current !== 'playing') return false;
      if (weapon.isReloading) return false;
      if (weapon.magazine <= 0) {
        soundSystem.playEmptyMagazineClick(weapon.id);
        return false;
      }
      if (!canFireWeapon(weapon, elapsedSimTimeSec)) return false;

      const activeRig = getActiveWeaponRig();
      weapon = fireWeaponRound(weapon, elapsedSimTimeSec);
      arsenal[activeWeaponId] = weapon;
      stats.shotsFired += 1;

      // Dynamic 3D Muzzle Flash + Procedural Barrel-Tip Particle Burst + PointLight
      muzzleFlashTimerSec = 0.068;
      activeRig.muzzleFlashGroup.visible = true;
      activeRig.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
      const flashScale = 0.9 + Math.random() * 0.35;
      activeRig.muzzleFlashGroup.scale.set(flashScale, flashScale, flashScale);
      spawnProceduralMuzzleFlash(activeRig, weapon.id);
      muzzlePointLight.color.setHex(
        weapon.id === 'shotgun' ? 0xf97316 : weapon.id === 'pistol' ? 0xfef08a : 0xffb703,
      );
      muzzlePointLight.intensity = weapon.id === 'shotgun' ? 4.2 : 2.8;
      combatFlashAlpha = Math.max(
        combatFlashAlpha,
        weapon.id === 'shotgun' ? 0.16 : 0.08,
      );

      const recoilBoost = weapon.id === 'shotgun' ? 0.72 : weapon.id === 'pistol' ? 0.54 : 0.42;
      crosshairSpread = Math.min(1.0, crosshairSpread + recoilBoost);
      cameraShakeTrauma = Math.min(
        1.0,
        cameraShakeTrauma + (weapon.id === 'shotgun' ? 0.25 : 0.14),
      );

      // Physical 3-axis spring-damper weapon recoil impulse + camera kick & muzzle climb
      bobSwayState = applyWeaponRecoilImpulse(bobSwayState, weapon.id);
      const pitchKick = weapon.id === 'shotgun' ? 0.036 : weapon.id === 'pistol' ? 0.025 : 0.015;
      const yawDrift = (Math.random() - 0.46) * (weapon.id === 'shotgun' ? 0.014 : weapon.id === 'pistol' ? 0.008 : 0.0045);
      cameraRecoilPitch = Math.min(0.11, cameraRecoilPitch + pitchKick);
      player.yaw += yawDrift;
      cameraRecoilRoll = (Math.random() - 0.5) * (weapon.id === 'shotgun' ? 0.026 : 0.018);

      // Spawn volumetric muzzle smoke & 3D ejected shell casing
      activeRig.muzzleFlashGroup.getWorldPosition(_muzzleWorldPos);
      camera.getWorldDirection(_cameraDir);
      _cameraRight.crossVectors(_cameraDir, camera.up).normalize();

      // Synchronized Mechanical Trigger Pull + Firing Mechanism + Spatial 5-Layer Gunshot
      soundSystem.updateListenerPose(
        player.x,
        player.y + PLAYER_EYE_HEIGHT,
        player.z,
        player.yaw,
        player.pitch,
      );
      soundSystem.playTriggerPull(weapon.id);
      soundSystem.playFiringMechanism(weapon.id);
      soundSystem.playSpatialWeaponFire(
        weapon.id,
        _muzzleWorldPos.x,
        _muzzleWorldPos.y,
        _muzzleWorldPos.z,
      );

      for (let i = 0; i < 4; i++) {
        spawnParticle(
          _muzzleWorldPos.x,
          _muzzleWorldPos.y,
          _muzzleWorldPos.z,
          _cameraDir.x * 2.8 + (Math.random() - 0.5) * 1.1,
          0.55 + Math.random() * 0.75,
          _cameraDir.z * 2.8 + (Math.random() - 0.5) * 1.1,
          0.76,
          0.78,
          0.82,
          0.032,
          0.28,
          -0.22,
          0.16,
        );
      }

      // Eject 3D spinning brass shell / red shotgun hull to the right with floor bounce
      spawnShellCasing(
        _muzzleWorldPos.x + _cameraRight.x * 0.12 - _cameraDir.x * 0.18,
        _muzzleWorldPos.y - 0.03,
        _muzzleWorldPos.z + _cameraRight.z * 0.12 - _cameraDir.z * 0.18,
        _cameraRight.x * (1.8 + Math.random() * 1.1) + _cameraDir.x * 0.5,
        1.6 + Math.random() * 0.8,
        _cameraRight.z * (1.8 + Math.random() * 1.1) + _cameraDir.z * 0.5,
        weapon.id === 'shotgun',
      );

      camera.updateMatrixWorld();

      // Collect all living enemy hitboxes
      const activeHitMeshes: THREE.Object3D[] = [];
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.isDead) continue;
        const rig = enemyRigs.get(e.id);
        if (rig) {
          rig.root.updateMatrixWorld(true);
          for (let j = 0; j < rig.hitMeshes.length; j++) {
            activeHitMeshes.push(rig.hitMeshes[j]);
          }
        }
      }

      // Filter active environment colliders (skip detonated barrels)
      const activeEnvColliders = environmentColliders.filter((obj) => {
        if (obj.userData.isExplosiveBarrel) {
          const b = explosiveBarrels.find((item) => item.id === obj.userData.barrelId);
          return b ? b.active : false;
        }
        return true;
      });

      const pelletCount = Math.max(1, weapon.pelletCount);
      const damageByEnemyId = new Map<
        number,
        { totalDamage: number; anyHeadshot: boolean; hitPoint: THREE.Vector3 }
      >();
      let surfaceAudioMaterial: SurfaceMaterial | null = null;

      let primaryTracerEnd = _hitPoint
        .copy(camera.position)
        .addScaledVector(_cameraDir, 45)
        .clone();

      for (let pelletIdx = 0; pelletIdx < pelletCount; pelletIdx++) {
        if (pelletIdx === 0) {
          _rayNDC.set(0, 0);
        } else {
          const angle = (pelletIdx / pelletCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
          const radius = (0.35 + Math.random() * 0.65) * weapon.spreadRad;
          _rayNDC.set(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }

        _raycaster.setFromCamera(_rayNDC, camera);
        const enemyHits = _raycaster.intersectObjects(activeHitMeshes, false);
        const envHits = _raycaster.intersectObjects(activeEnvColliders, false);

        const closestEnvDist = envHits.length > 0 ? envHits[0].distance : Infinity;
        const closestEnemyHit = enemyHits.length > 0 ? enemyHits[0] : null;

        if (pelletIdx === 0) {
          primaryTracerEnd = _hitPoint
            .copy(camera.position)
            .addScaledVector(_cameraDir, Math.min(closestEnvDist, 45))
            .clone();
        }

        if (closestEnemyHit && closestEnemyHit.distance < closestEnvDist) {
          const hitEnemyId = closestEnemyHit.object.userData.enemyId as number;
          // If the bullet ray touches any head hitbox on this enemy before hitting environment, register headshot
          const headHitOnTarget = enemyHits.find(
            (h) =>
              h.distance < closestEnvDist &&
              h.object.userData.enemyId === hitEnemyId &&
              Boolean(h.object.userData.isHead) &&
              h.distance <= closestEnemyHit.distance + 0.48,
          );
          const effectiveHit = headHitOnTarget ?? closestEnemyHit;
          if (pelletIdx === 0) {
            primaryTracerEnd.copy(effectiveHit.point);
          }
          const isHeadshot = Boolean(effectiveHit.object.userData.isHead);
          const pelletDmg = isHeadshot ? weapon.headshotDamage : weapon.damage;

          const prev = damageByEnemyId.get(hitEnemyId);
          if (prev) {
            prev.totalDamage += pelletDmg;
            prev.anyHeadshot = prev.anyHeadshot || isHeadshot;
            if (isHeadshot) {
              prev.hitPoint.copy(effectiveHit.point);
            }
          } else {
            damageByEnemyId.set(hitEnemyId, {
              totalDamage: pelletDmg,
              anyHeadshot: isHeadshot,
              hitPoint: effectiveHit.point.clone(),
            });
          }
        } else if (envHits.length > 0) {
          const hitObj = envHits[0].object;
          const matType = (hitObj.userData.surfaceMaterial as SurfaceMaterial) ?? 'concrete';
          surfaceAudioMaterial = matType;
          spawnSurfaceBulletImpact(envHits[0], matType, pelletCount);

          // Check if player hit an Interactive Explosive Hazard Barrel
          if (hitObj.userData.isExplosiveBarrel) {
            const barrelId = hitObj.userData.barrelId as number;
            const barrel = explosiveBarrels.find((b) => b.id === barrelId && b.active);
            if (barrel) {
              barrel.hp -= weapon.damage;
              if (barrel.hp <= 0) {
                detonateExplosiveBarrel(barrel);
              }
            }
          }
        }
      }

      if (damageByEnemyId.size > 0) {
        stats.shotsHit += 1;
        let anyHeadshotInShot = false;

        damageByEnemyId.forEach(({ totalDamage, anyHeadshot, hitPoint }, hitEnemyId) => {
          const targetEnemy = enemies.find((e) => e.id === hitEnemyId && !e.isDead);
          if (!targetEnemy) return;

          if (anyHeadshot) {
            anyHeadshotInShot = true;
          }

          targetEnemy.hp = Math.max(0, targetEnemy.hp - totalDamage);
          targetEnemy.hitFlashTimerSec = 0.15;
          // Subtle enemy hit stagger / knockback along shot direction
          targetEnemy.vx += _cameraDir.x * (anyHeadshot ? 2.6 : 1.5);
          targetEnemy.vz += _cameraDir.z * (anyHeadshot ? 2.6 : 1.5);

          // Micro hit-stop on impactful hits (headshots or heavy weapons)
          if (anyHeadshot || weapon.id === 'shotgun') {
            hitstopTimerSec = Math.max(hitstopTimerSec, 0.024);
          }

          const burstCount = anyHeadshot ? 14 : 7;
          for (let p = 0; p < burstCount; p++) {
            const isMetalSpark = anyHeadshot && p % 2 === 0;
            spawnParticle(
              hitPoint.x,
              hitPoint.y,
              hitPoint.z,
              (Math.random() - 0.5) * (isMetalSpark ? 6.8 : 4.5),
              1.4 + Math.random() * (isMetalSpark ? 4.2 : 3.0),
              (Math.random() - 0.5) * (isMetalSpark ? 6.8 : 4.5),
              isMetalSpark ? 1.0 : anyHeadshot ? 1.0 : 0.94,
              isMetalSpark ? 0.92 : anyHeadshot ? 0.68 : 0.18,
              isMetalSpark ? 0.55 : 0.18,
              isMetalSpark ? 0.042 : 0.055,
              isMetalSpark ? 0.26 : 0.32,
              0.9,
              0,
            );
          }

          if (targetEnemy.hp <= 0) {
            handleEnemyEliminated(targetEnemy, anyHeadshot, weapon.name);
          }
        });

        hitMarkerTimer = 0.22;
        hitMarkerHeadshot = anyHeadshotInShot;
        soundSystem.playEnemyHit(anyHeadshotInShot);
      } else if (surfaceAudioMaterial) {
        soundSystem.playSurfaceImpact(surfaceAudioMaterial);
      }

      // Update 3D tracer line positions
      tracerPositions[0] = _muzzleWorldPos.x;
      tracerPositions[1] = _muzzleWorldPos.y;
      tracerPositions[2] = _muzzleWorldPos.z;
      tracerPositions[3] = primaryTracerEnd.x;
      tracerPositions[4] = primaryTracerEnd.y;
      tracerPositions[5] = primaryTracerEnd.z;
      tracerGeo.attributes.position.needsUpdate = true;
      tracerLine.visible = true;
      tracerTimerSec = 0.048;

      syncHudImmediate();
      return true;
    };

    const initiateReload = (): boolean => {
      if (gameStateRef.current !== 'playing') return false;
      if (!canReloadWeapon(weapon)) return false;
      weapon = startReloadWeapon(weapon);
      arsenal[activeWeaponId] = weapon;
      reloadInsertionSoundPlayed = false;
      reloadBoltSoundPlayed = false;
      // Stage 1 Mechanical Event: Magazine removal / cylinder swing-out at 0% reload progress
      soundSystem.playMagazineRemoval(weapon.id);
      syncHudImmediate();
      return true;
    };

    const inflictPlayerDamage = (dmg: number) => {
      if (gameStateRef.current !== 'playing') return;
      player.hp = applyPlayerDamage(player.hp, dmg);
      player.lastDamageTime = elapsedSimTimeSec;
      damageFlashAlpha = 0.72;
      cameraShakeTrauma = Math.min(1.0, cameraShakeTrauma + 0.42);
      damageRollTilt = (Math.random() > 0.5 ? 1 : -1) * 0.055;
      soundSystem.playPlayerDamage();

      if (player.hp <= 0) {
        isMouseDown = false;
        keysHeld.clear();
        try {
          if (document.pointerLockElement) {
            document.exitPointerLock?.();
          }
        } catch {}
        gameStateRef.current = 'gameover';
        document.body.dataset.state = 'gameover';
        syncHudImmediate();
        onGameStateChangeRef.current('gameover', { ...stats });
      } else {
        syncHudImmediate();
      }
    };

    // Expose controller methods to parent & automated tests
    const controller: FpsGameController = {
      startNewGame: () => {
        resetGameToPlaying();
      },
      pauseGame: () => {
        if (gameStateRef.current !== 'playing') return;
        isMouseDown = false;
        keysHeld.clear();
        try {
          if (document.pointerLockElement) {
            document.exitPointerLock?.();
          }
        } catch {}
        gameStateRef.current = 'paused';
        document.body.dataset.state = 'paused';
        onGameStateChangeRef.current('paused', { ...stats });
      },
      resumeGame: () => {
        if (gameStateRef.current !== 'paused') return;
        keysHeld.clear();
        isMouseDown = false;
        gameStateRef.current = 'playing';
        document.body.dataset.state = 'playing';
        onGameStateChangeRef.current('playing');
        try {
          renderer.domElement.requestPointerLock?.();
        } catch {}
      },
      returnToTitle: () => {
        isMouseDown = false;
        keysHeld.clear();
        try {
          if (document.pointerLockElement) {
            document.exitPointerLock?.();
          }
        } catch {}
        updateWeaponRigVisibility(false);
        setupTitlePreviewEnemies();
        gameStateRef.current = 'title';
        document.body.dataset.state = 'title';
        onGameStateChangeRef.current('title');
      },
      toggleMute: () => {
        soundSystem.toggleMute();
        syncHudImmediate();
      },
      switchWeapon: (weaponId: WeaponId) => switchWeapon(weaponId),
      triggerFireShot: () => performWeaponShot(),
      triggerReload: () => initiateReload(),
      triggerCollectAmmoPickup: () => {
        const activeCrate = ammoPickups.find(
          (p) => p.active && (p.pickupKind ?? 'ammo') === 'ammo',
        );
        if (!activeCrate) return false;
        return collectPickupEntry(activeCrate);
      },
      triggerCollectHealthPotion: () => {
        let activePotion = ammoPickups.find(
          (p) => p.active && p.pickupKind === 'health_potion',
        );
        if (!activePotion) {
          activePotion = spawnDroppedPickup(player.x + 0.5, player.z - 0.5, 'health_potion');
        }
        return collectPickupEntry(activePotion, true);
      },
      triggerBarrelExplosion: () => {
        const activeBarrel = explosiveBarrels.find((b) => b.active);
        if (!activeBarrel) return false;
        return detonateExplosiveBarrel(activeBarrel);
      },
      triggerSpatialFootstepAt: (
        x: number,
        y: number,
        z: number,
        archetype: EnemyArchetype = 'assault',
      ) => {
        soundSystem.updateListenerPose(
          player.x,
          player.y + PLAYER_EYE_HEIGHT,
          player.z,
          player.yaw,
          player.pitch,
        );
        return soundSystem.playSpatialEnemyFootstep(x, y, z, archetype);
      },
      triggerSpatialDistantGunfireAt: (
        x: number,
        y: number,
        z: number,
        burstCount: number = 3,
      ) => {
        soundSystem.updateListenerPose(
          player.x,
          player.y + PLAYER_EYE_HEIGHT,
          player.z,
          player.yaw,
          player.pitch,
        );
        return soundSystem.playSpatialDistantGunfire(x, y, z, burstCount);
      },
      triggerSpatialAmbianceAt: (emitterIndex: number = 0) => {
        soundSystem.updateListenerPose(
          player.x,
          player.y + PLAYER_EYE_HEIGHT,
          player.z,
          player.yaw,
          player.pitch,
        );
        return soundSystem.playSpatialAmbiancePulse(emitterIndex);
      },
      triggerSpatialWeaponFireAt: (
        weaponId: WeaponId,
        x: number,
        y: number,
        z: number,
      ) => {
        soundSystem.updateListenerPose(
          player.x,
          player.y + PLAYER_EYE_HEIGHT,
          player.z,
          player.yaw,
          player.pitch,
        );
        return soundSystem.playSpatialWeaponFire(weaponId, x, y, z);
      },
      setAudioEnvironmentMode: (mode: AudioEnvironmentMode) =>
        soundSystem.setEnvironmentMode(mode),
      spawnEnemyOfArchetype: (
        archetype: EnemyArchetype,
        x?: number,
        z?: number,
      ) =>
        spawnSingleEnemy(
          stats.wave,
          enemies.length,
          x !== undefined && z !== undefined ? { x, z } : undefined,
          archetype,
        ),
      simulatePlayerDamage: (amount: number) => inflictPlayerDamage(amount),
      aimAtNearestEnemy: (headshot: boolean = false) => {
        const living = enemies.filter((e) => !e.isDead);
        if (living.length === 0) return false;
        living.sort(
          (a, b) =>
            Math.hypot(a.x - player.x, a.z - player.z) -
            Math.hypot(b.x - player.x, b.z - player.z),
        );
        const target = living[0];
        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const targetY = headshot ? 1.58 : 1.08;
        const eyeY = player.y + PLAYER_EYE_HEIGHT;
        const dy = targetY - eyeY;
        const horizDist = Math.hypot(dx, dz);

        const nextYaw = Math.atan2(-dx, -dz);
        const nextPitch = clampPitch(Math.atan2(dy, Math.max(0.01, horizDist)));
        pendingLookDeltaYaw += nextYaw - player.yaw;
        pendingLookDeltaPitch += nextPitch - player.pitch;
        player.yaw = nextYaw;
        player.pitch = nextPitch;
        camera.position.set(player.x, eyeY, player.z);
        camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
        camera.updateMatrixWorld(true);
        return true;
      },
      getDebugState: () => ({
        gameState: gameStateRef.current,
        player: { ...player },
        weapon: { ...weapon },
        arsenal: {
          rifle: { ...arsenal.rifle },
          shotgun: { ...arsenal.shotgun },
          pistol: { ...arsenal.pistol },
        },
        stats: { ...stats },
        killFeed: [...killFeed],
        weaponBobSway: { ...bobSwayState },
        spatialAudio: soundSystem.getSpatialDebugStats(),
        activeEnemyCount: enemies.filter((e) => !e.isDead).length,
        activeEnemies: enemies
          .filter((e) => !e.isDead)
          .map((e) => ({ ...e })),
        activeAmmoPickupCount: ammoPickups.filter(
          (p) => p.active && (p.pickupKind ?? 'ammo') === 'ammo',
        ).length,
        activeHealthPotionCount: ammoPickups.filter(
          (p) => p.active && p.pickupKind === 'health_potion',
        ).length,
        activeDecalCount: decals.filter((d) => d.active).length,
        activeShellCount: shellCasings.filter((s) => s.active).length,
        activeMuzzleFlashBurstCount: activeMuzzleFlashBursts.length,
        totalMuzzleFlashBurstsSpawned,
        explosionsTriggered,
        revolverPolygonCount: Number(
          weaponRigs.pistol.root.userData.revolverPolygonCount ?? 0,
        ),
        shotgunPolygonCount: Number(
          weaponRigs.shotgun.root.userData.shotgunPolygonCount ?? 0,
        ),
        enemyModelMetrics: cachedEnemyModelMetrics,
        weaponAudio: soundSystem.getWeaponAudioDiagnostics(),
      }),
    };

    controllerRef.current = controller;
    (window as unknown as { __fpsGame?: FpsGameController }).__fpsGame = controller;

    if (gameStateRef.current === 'playing') {
      resetGameToPlaying(false);
    } else {
      updateWeaponRigVisibility(false);
      setupTitlePreviewEnemies();
      document.body.dataset.state = gameStateRef.current;
    }

    // 7. Input Event Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      if (gameStateRef.current === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          const activeTag = document.activeElement?.tagName;
          if (activeTag !== 'BUTTON' && activeTag !== 'INPUT') {
            e.preventDefault();
            soundSystem.initOnInteraction();
            resetGameToPlaying();
          }
        }
        return;
      }

      if (e.code === 'KeyM') {
        soundSystem.toggleMute();
        syncHudImmediate();
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameStateRef.current === 'playing') {
          e.preventDefault();
          controller.pauseGame();
          return;
        } else if (gameStateRef.current === 'paused') {
          e.preventDefault();
          controller.resumeGame();
          return;
        }
      }

      if (gameStateRef.current !== 'playing') return;

      if (!keysHeld.has(e.code)) {
        if (e.code === 'Space') {
          e.preventDefault();
          jumpJustPressed = true;
        } else if (e.code === 'KeyR') {
          initiateReload();
        } else if (e.code === 'Digit1') {
          switchWeapon('rifle');
        } else if (e.code === 'Digit2') {
          switchWeapon('shotgun');
        } else if (e.code === 'Digit3') {
          switchWeapon('pistol');
        } else if (e.code === 'KeyQ') {
          const curIdx = WEAPON_ORDER.indexOf(activeWeaponId);
          const nextId = WEAPON_ORDER[(curIdx + 1) % WEAPON_ORDER.length];
          switchWeapon(nextId);
        }
      }
      keysHeld.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeld.delete(e.code);
    };

    const onWheel = (e: WheelEvent) => {
      if (gameStateRef.current !== 'playing') return;
      if (Math.abs(e.deltaY) < 4) return;
      const curIdx = WEAPON_ORDER.indexOf(activeWeaponId);
      const dir = e.deltaY > 0 ? 1 : -1;
      const nextIdx = (curIdx + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length;
      switchWeapon(WEAPON_ORDER[nextIdx]);
    };

    let lastClientX: number | null = null;
    let lastClientY: number | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (gameStateRef.current !== 'playing') return;

      const sensitivity = 0.0022;
      let dx = e.movementX || 0;
      let dy = e.movementY || 0;

      if (!document.pointerLockElement && dx === 0 && dy === 0) {
        if (lastClientX !== null && lastClientY !== null) {
          dx = e.clientX - lastClientX;
          dy = e.clientY - lastClientY;
        }
      }
      lastClientX = e.clientX;
      lastClientY = e.clientY;

      if (document.pointerLockElement === renderer.domElement || dx !== 0 || dy !== 0) {
        const dYaw = -dx * sensitivity;
        const prevPitch = player.pitch;
        player.yaw += dYaw;
        player.pitch = clampPitch(player.pitch - dy * sensitivity);
        const dPitch = player.pitch - prevPitch;
        pendingLookDeltaYaw += dYaw;
        pendingLookDeltaPitch += dPitch;
      }
    };

    const onCanvasMouseDown = (e: MouseEvent) => {
      if (gameStateRef.current !== 'playing') return;
      soundSystem.initOnInteraction();

      if (document.pointerLockElement !== renderer.domElement) {
        try {
          renderer.domElement.requestPointerLock?.();
        } catch {}
      }

      if (e.button === 0) {
        isMouseDown = true;
        performWeaponShot();
      }
    };

    const onWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown = false;
      }
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      const wasLocked = isPointerLocked;
      isPointerLocked = locked;

      if (wasLocked && !locked && gameStateRef.current === 'playing') {
        controller.pauseGame();
      } else {
        syncHudImmediate();
      }
    };

    const onWindowBlur = () => {
      keysHeld.clear();
      isMouseDown = false;
      jumpJustPressed = false;
    };

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = Math.max(1, container.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('resize', onResize);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    renderer.domElement.addEventListener('mousedown', onCanvasMouseDown);

    // 8. Real-Time Render & Simulation Loop (with Software-WebGL afterDraw Pacing)
    let frameId = 0;
    let isDisposed = false;
    let lastFrameTimeMs = performance.now();

    function afterDraw(cb: () => void) {
      if (isDisposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (isDisposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    }

    function tick() {
      if (isDisposed) return;
      const nowMs = performance.now();
      const rawDt = (nowMs - lastFrameTimeMs) / 1000;
      lastFrameTimeMs = nowMs;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const currentState = gameStateRef.current;

      if (currentState === 'title') {
        elapsedSimTimeSec += dt;
        const orbitAngle = elapsedSimTimeSec * 0.22;
        camera.position.set(
          Math.sin(orbitAngle) * 14.5,
          4.8 + Math.sin(elapsedSimTimeSec * 0.45) * 0.5,
          Math.cos(orbitAngle) * 14.5,
        );
        camera.lookAt(0, 1.2, 0);

        enemies.forEach((e, idx) => {
          const rig = enemyRigs.get(e.id);
          if (rig) {
            const patrolPhase = elapsedSimTimeSec * 1.8 + idx * 2.1;
            rig.leftLegPivot.rotation.x = Math.sin(patrolPhase) * 0.35;
            rig.rightLegPivot.rotation.x = -Math.sin(patrolPhase) * 0.35;
            rig.leftArmPivot.rotation.x = -Math.sin(patrolPhase) * 0.25;
            rig.rightArmPivot.rotation.x = Math.sin(patrolPhase) * 0.25;
            rig.hpBarGroup.visible = false;
          }
        });

        ammoPickups.forEach((p, idx) => {
          const mesh = ammoPickupMeshes.get(p.id);
          if (mesh && p.active) {
            mesh.rotation.y = elapsedSimTimeSec * 1.5 + idx;
            mesh.position.y = Math.sin(elapsedSimTimeSec * 2.5 + idx) * 0.06;
          }
        });
      } else if (currentState === 'playing') {
        const simDt = hitstopTimerSec > 0 ? 0 : dt;
        hitstopTimerSec = Math.max(0, hitstopTimerSec - dt);

        elapsedSimTimeSec += simDt;
        stats.timeSurvivedSec += simDt;

        // Arrow-key camera rotation support
        const arrowTurnSpeed = 2.1;
        if (keysHeld.has('ArrowLeft')) {
          const dY = arrowTurnSpeed * dt;
          player.yaw += dY;
          pendingLookDeltaYaw += dY;
        }
        if (keysHeld.has('ArrowRight')) {
          const dY = -arrowTurnSpeed * dt;
          player.yaw += dY;
          pendingLookDeltaYaw += dY;
        }
        if (keysHeld.has('ArrowUp')) {
          const prevP = player.pitch;
          player.pitch = clampPitch(player.pitch + 1.4 * dt);
          pendingLookDeltaPitch += player.pitch - prevP;
        }
        if (keysHeld.has('ArrowDown')) {
          const prevP = player.pitch;
          player.pitch = clampPitch(player.pitch - 1.4 * dt);
          pendingLookDeltaPitch += player.pitch - prevP;
        }

        // Step Player Movement & Collision
        if (simDt > 0) {
          const prevGrounded = player.isGrounded;
          player = stepPlayerMovement(
            player,
            {
              forward: keysHeld.has('KeyW'),
              backward: keysHeld.has('KeyS'),
              left: keysHeld.has('KeyA'),
              right: keysHeld.has('KeyD'),
              sprint: keysHeld.has('ShiftLeft') || keysHeld.has('ShiftRight'),
              jumpJustPressed,
            },
            simDt,
            ARENA_OBSTACLES,
          );
          if (prevGrounded && !player.isGrounded && jumpJustPressed) {
            soundSystem.playJump();
          } else if (!prevGrounded && player.isGrounded) {
            soundSystem.playLand();
          }
          jumpJustPressed = false;
        }

        // Step Interactive Explosive Barrels Respawn
        for (const b of explosiveBarrels) {
          if (!b.active) {
            b.respawnTimerSec -= simDt;
            if (b.respawnTimerSec <= 0) {
              b.active = true;
              b.hp = b.maxHp;
              b.respawnTimerSec = 0;
              b.drumGroup.visible = true;
            }
          }
        }

        // Step 3D Ammo Supply Crates
        for (let i = ammoPickups.length - 1; i >= 0; i--) {
          const p = ammoPickups[i];
          const mesh = ammoPickupMeshes.get(p.id);
          if (!p.active) {
            if (p.isDrop) {
              ammoPickups.splice(i, 1);
              continue;
            }
            p.respawnTimerSec -= simDt;
            if (p.respawnTimerSec <= 0) {
              p.active = true;
              p.respawnTimerSec = 0;
              if (mesh) {
                mesh.visible = true;
              }
            }
            continue;
          }

          if (mesh) {
            mesh.rotation.y = elapsedSimTimeSec * 1.8 + p.id * 0.7;
            mesh.position.y = Math.sin(elapsedSimTimeSec * 3.0 + p.id) * 0.06;
          }

          const distToPlayer = Math.hypot(player.x - p.x, player.z - p.z);
          if (distToPlayer <= AMMO_PICKUP_RADIUS) {
            collectPickupEntry(p);
          }
        }

        // Step Weapon Reload & Staged Mechanical Audio Synchronization
        if (weapon.isReloading) {
          const reloadStep = stepWeaponReload(weapon, dt);
          weapon = reloadStep.weapon;
          arsenal[activeWeaponId] = weapon;
          const progress =
            weapon.reloadDurationSec > 0
              ? (weapon.reloadDurationSec - weapon.reloadTimerSec) /
                weapon.reloadDurationSec
              : 1;
          if (!reloadInsertionSoundPlayed && progress >= 0.48) {
            reloadInsertionSoundPlayed = true;
            // Stage 2 Mechanical Event: Magazine / shell insertion at ~48% reload animation
            soundSystem.playMagazineInsertion(weapon.id);
          }
          if (!reloadBoltSoundPlayed && progress >= 0.76) {
            reloadBoltSoundPlayed = true;
            // Stage 3 Mechanical Event: Bolt release / pump slide rack at ~76% reload animation
            soundSystem.playBoltOrSlideOperation(weapon.id);
          }
          if (reloadStep.completed) {
            // Stage 4 Mechanical Event: Final breech battery lockup on reload completion
            soundSystem.playReloadComplete(weapon.id);
            syncHudImmediate();
          }
        } else if (isMouseDown || keysHeld.has('KeyF')) {
          performWeaponShot();
        }

        // Wave Spawning & Next-Wave Transition Logic
        if (isWaitingForNextWave) {
          nextWaveDelayTimerSec -= simDt;
          if (nextWaveDelayTimerSec <= 0) {
            isWaitingForNextWave = false;
            const nextWaveNum = stats.wave + 1;
            const nextCfg = getWaveConfig(nextWaveNum);
            stats.wave = nextWaveNum;
            stats.totalEnemiesInWave = nextCfg.totalEnemies;
            stats.enemiesRemainingInWave = nextCfg.totalEnemies;
            stats.enemiesSpawnedInWave = 0;
            spawnTimerSec = 0.35;
            waveAnnouncementText = `WAVE ${nextWaveNum} — ${nextCfg.totalEnemies} HOSTILES INBOUND`;
            waveAnnouncementTimerSec = 2.4;
            soundSystem.playWaveStart();
            syncHudImmediate();
          }
        } else {
          const currentWaveCfg = getWaveConfig(stats.wave);
          if (stats.enemiesSpawnedInWave < currentWaveCfg.totalEnemies) {
            spawnTimerSec -= simDt;
            const activeLivingCount = enemies.filter((e) => !e.isDead).length;
            if (spawnTimerSec <= 0 && activeLivingCount < 8) {
              spawnSingleEnemy(stats.wave, stats.enemiesSpawnedInWave);
              stats.enemiesSpawnedInWave += 1;
              spawnTimerSec = currentWaveCfg.spawnIntervalSec;
            }
          }
        }

        if (waveAnnouncementTimerSec > 0) {
          waveAnnouncementTimerSec -= dt;
          if (waveAnnouncementTimerSec <= 0) {
            waveAnnouncementText = null;
          }
        }

        if (killFeed.length > 0) {
          killFeed = stepKillFeed(killFeed, dt);
        }

        // Step 3D Sound Spatializer (Listener Pose, Positional Environmental Ambiance & Distant Perimeter Gunfire)
        soundSystem.stepSpatialAmbiance(
          player.x,
          player.y + PLAYER_EYE_HEIGHT,
          player.z,
          player.yaw,
          player.pitch,
          dt,
          stats.wave,
        );

        // Step Enemy AI, Spatialized Footsteps, Hit Reactions, Animations & Death Presentation
        let activeWindingUpCount = enemies.filter((e) => !e.isDead && e.isWindingUp).length;

        for (let i = enemies.length - 1; i >= 0; i--) {
          const currentEnemy = enemies[i];
          const prevWalkCycle = currentEnemy.walkCycle;
          const canStartAttack = activeWindingUpCount < 3;
          const aiResult = stepEnemyAI(
            currentEnemy,
            player.x,
            player.z,
            simDt,
            enemies,
            ARENA_OBSTACLES,
            canStartAttack,
          );
          const updated = aiResult.enemy;
          enemies[i] = updated;

          // Trigger 3D spatialized enemy footstep on stride phase crossing
          if (
            !updated.isDead &&
            detectEnemyFootstepPhaseCrossing(prevWalkCycle, updated.walkCycle)
          ) {
            soundSystem.playSpatialEnemyFootstep(
              updated.x,
              0.15,
              updated.z,
              updated.archetype,
            );
          }

          if (aiResult.startedAttackWindup) {
            activeWindingUpCount += 1;
          }
          if (aiResult.damageToPlayer > 0) {
            inflictPlayerDamage(aiResult.damageToPlayer);
          }

          const rig = enemyRigs.get(updated.id);
          if (rig) {
            rig.root.position.set(updated.x, 0, updated.z);
            rig.root.rotation.y = updated.yaw;

            const isFlashing = updated.hitFlashTimerSec > 0;
            rig.bodyMaterials.forEach((mat, mIdx) => {
              if (isFlashing) {
                mat.emissive.setHex(0xffffff);
                mat.emissiveIntensity = 0.85;
              } else if (mIdx === 1) {
                mat.emissive.setHex(0xef4444);
                mat.emissiveIntensity = updated.isWindingUp ? 1.2 : 0.28;
              } else {
                mat.emissive.setHex(0x000000);
                mat.emissiveIntensity = 0;
              }
            });

            if (updated.isDead) {
              // Improved Death Animation: Dramatic backward topple, torso twist & limb splay
              const deathProgress = Math.min(
                1,
                updated.deathTimerSec / ENEMY_DEATH_DURATION_SEC,
              );
              const easeFall = 1 - Math.pow(1 - deathProgress, 2.2);
              rig.bodyPivot.rotation.x = -easeFall * (Math.PI * 0.49);
              rig.bodyPivot.rotation.z = easeFall * 0.22 * updated.flankSign;
              rig.bodyPivot.position.y = -easeFall * 0.28;
              rig.leftArmPivot.rotation.z = -easeFall * 0.65;
              rig.rightArmPivot.rotation.z = easeFall * 0.65;
              rig.hpBarGroup.visible = false;

              if (updated.deathTimerSec >= ENEMY_DEATH_DURATION_SEC) {
                scene.remove(rig.root);
                enemyRigs.delete(updated.id);
                enemies.splice(i, 1);
              }
            } else {
              // Subtle Enemy Hit Flinch Reaction
              const flinchRatio = Math.min(1, updated.hitFlashTimerSec / 0.15);
              rig.torsoGroup.rotation.x = -flinchRatio * 0.28;
              rig.headGroup.rotation.x = -flinchRatio * 0.35;

              const walkPhase = updated.walkCycle;
              const isMoving = Math.hypot(updated.vx, updated.vz) > 0.15;
              const legSwing = isMoving ? Math.sin(walkPhase) * 0.58 : 0;

              rig.leftLegPivot.rotation.x = THREE.MathUtils.damp(
                rig.leftLegPivot.rotation.x,
                legSwing,
                14,
                dt,
              );
              rig.rightLegPivot.rotation.x = THREE.MathUtils.damp(
                rig.rightLegPivot.rotation.x,
                -legSwing,
                14,
                dt,
              );

              if (updated.isWindingUp) {
                rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
                  rig.leftArmPivot.rotation.x,
                  -1.85,
                  18,
                  dt,
                );
                rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
                  rig.rightArmPivot.rotation.x,
                  -1.85,
                  18,
                  dt,
                );
              } else if (updated.attackTimerSec > updated.attackCooldownSec - 0.18) {
                rig.leftArmPivot.rotation.x = -0.35;
                rig.rightArmPivot.rotation.x = -0.35;
              } else {
                const armSwing = isMoving ? Math.sin(walkPhase) * 0.42 : 0;
                rig.leftArmPivot.rotation.x = THREE.MathUtils.damp(
                  rig.leftArmPivot.rotation.x,
                  -0.45 - armSwing,
                  12,
                  dt,
                );
                rig.rightArmPivot.rotation.x = THREE.MathUtils.damp(
                  rig.rightArmPivot.rotation.x,
                  -0.45 + armSwing,
                  12,
                  dt,
                );
              }

              rig.hpBarGroup.visible = updated.hp < updated.maxHp;
              if (rig.hpBarGroup.visible) {
                rig.hpBarGroup.lookAt(camera.position);
                const hpRatio = Math.max(0.01, updated.hp / updated.maxHp);
                rig.hpBarFill.scale.x = hpRatio;
                rig.hpBarFill.position.x = -(1 - hpRatio) * 0.36;
              }
            }
          }
        }

        // First-Person Weapon Bob, Sway, Strafe Tilt, Firing Vibration, Recoil & Multi-Stage Reload
        const horizSpeed = Math.hypot(player.vx, player.vz);
        const bobStrength = player.isGrounded ? Math.min(1, horizSpeed / 5.0) : 0;

        const activeRig = getActiveWeaponRig();
        weapon.recoilAmount = THREE.MathUtils.damp(weapon.recoilAmount, 0, 15, dt);
        arsenal[activeWeaponId] = weapon;
        crosshairSpread = THREE.MathUtils.damp(
          crosshairSpread,
          bobStrength * 0.22,
          12,
          dt,
        );

        let reloadTiltX = 0;
        let reloadTiltZ = 0;
        let reloadDropY = 0;
        let boltRackOffset = 0;
        if (weapon.isReloading) {
          const progress =
            (weapon.reloadDurationSec - weapon.reloadTimerSec) /
            weapon.reloadDurationSec;
          const reloadCurve = Math.sin(progress * Math.PI);
          reloadTiltX = reloadCurve * 0.38;
          reloadTiltZ = reloadCurve * 0.45;
          reloadDropY = -reloadCurve * 0.085;
          if (activeWeaponId === 'pistol') {
            // Revolver swing-out cylinder reload animation: swings left on crane arm and spins
            activeRig.magazineMesh.position.set(
              -reloadCurve * 0.048,
              0.02 - reloadCurve * 0.014,
              -0.002,
            );
            activeRig.magazineMesh.rotation.set(
              Math.PI / 2,
              progress * Math.PI * 4,
              reloadCurve * 0.42,
            );
          } else if (activeWeaponId === 'shotgun') {
            // Shotgun pump forend racks rearward at the end of shell loading
            const pumpRack =
              progress > 0.72
                ? Math.sin(((progress - 0.72) / 0.28) * Math.PI) * 0.085
                : 0;
            activeRig.magazineMesh.position.set(0, -0.02, -0.34 + pumpRack);
          } else {
            const magSlide = reloadCurve * 0.145;
            activeRig.magazineMesh.position.y = -0.125 - magSlide;
          }
          if (progress > 0.76) {
            boltRackOffset = Math.sin(((progress - 0.76) / 0.24) * Math.PI) * 0.075;
          }
        } else if (activeWeaponId === 'pistol') {
          activeRig.magazineMesh.position.set(0, 0.02, -0.002);
          const targetCylStep =
            (weapon.magazineCapacity - weapon.magazine) * (Math.PI / 4);
          activeRig.magazineMesh.rotation.set(
            Math.PI / 2,
            THREE.MathUtils.damp(
              activeRig.magazineMesh.rotation.y,
              targetCylStep,
              18,
              dt,
            ),
            0,
          );
        } else if (activeWeaponId === 'shotgun') {
          // Shotgun pump forend slides rearward and forward during post-shot pump action
          const pumpSlideZ = Math.min(
            0.082,
            Math.max(weapon.recoilAmount * 0.075, bobSwayState.recoilSpringZ * 1.1),
          );
          activeRig.magazineMesh.position.set(0, -0.02, -0.34 + pumpSlideZ);
        } else {
          activeRig.magazineMesh.position.y = -0.125;
        }

        const isSprintingNow = keysHeld.has('ShiftLeft') || keysHeld.has('ShiftRight');
        const strafeInput =
          (keysHeld.has('KeyD') ? 1 : 0) - (keysHeld.has('KeyA') ? 1 : 0);
        const forwardInput =
          (keysHeld.has('KeyW') ? 1 : 0) - (keysHeld.has('KeyS') ? 1 : 0);

        bobSwayState = stepWeaponBobAndSway(bobSwayState, {
          dt,
          elapsedTimeSec: elapsedSimTimeSec,
          horizSpeed,
          velocityX: player.vx,
          velocityZ: player.vz,
          playerYaw: player.yaw,
          isSprinting: isSprintingNow,
          isGrounded: player.isGrounded,
          verticalVelocity: player.vy,
          strafeInput,
          forwardInput,
          lookDeltaYaw: pendingLookDeltaYaw,
          lookDeltaPitch: pendingLookDeltaPitch,
          recoilAmount: weapon.recoilAmount,
          reloadTiltX,
          reloadTiltZ,
          reloadDropY,
        });
        pendingLookDeltaYaw = 0;
        pendingLookDeltaPitch = 0;

        activeRig.bodyGroup.position.set(
          bobSwayState.totalPosX,
          bobSwayState.totalPosY,
          bobSwayState.totalPosZ,
        );
        activeRig.bodyGroup.rotation.set(
          bobSwayState.totalRotX,
          bobSwayState.totalRotY,
          bobSwayState.totalRotZ,
        );
        if (activeWeaponId === 'pistol') {
          // Revolver hammer spur cocks back & strikes on every shot
          const hammerKick = Math.min(
            1,
            Math.max(weapon.recoilAmount, bobSwayState.recoilSpringZ * 12),
          );
          activeRig.boltMesh.position.set(0, 0.048, 0.072);
          activeRig.boltMesh.rotation.x = -0.35 - hammerKick * 0.85;
        } else {
          activeRig.boltMesh.position.z =
            -0.02 +
            Math.max(weapon.recoilAmount * 0.068, bobSwayState.recoilSpringZ * 1.15) +
            boltRackOffset;
        }

        // First-Person Camera Position, Walking Bob, Landing Impact, Firing Kick & Trauma Shake
        const bobOffsetY = Math.sin(player.walkDistance * 2.8) * 0.042 * bobStrength;
        const bobOffsetX = Math.cos(player.walkDistance * 1.4) * 0.024 * bobStrength;

        cameraShakeTrauma = Math.max(0, cameraShakeTrauma - dt * 2.8);
        cameraRecoilPitch = THREE.MathUtils.damp(cameraRecoilPitch, 0, 14, dt);
        cameraRecoilRoll = THREE.MathUtils.damp(cameraRecoilRoll, 0, 16, dt);
        damageRollTilt = THREE.MathUtils.damp(damageRollTilt, 0, 10, dt);

        const shakeAmt = cameraShakeTrauma * cameraShakeTrauma;
        const shakePitch = (Math.random() - 0.5) * 0.038 * shakeAmt;
        const shakeYaw = (Math.random() - 0.5) * 0.038 * shakeAmt;
        const shakeRoll = (Math.random() - 0.5) * 0.028 * shakeAmt;

        camera.position.set(
          player.x + bobOffsetX,
          player.y +
            PLAYER_EYE_HEIGHT +
            bobOffsetY +
            bobSwayState.cameraLandOffsetY,
          player.z,
        );
        camera.rotation.set(
          clampPitch(
            player.pitch +
              cameraRecoilPitch +
              bobSwayState.cameraLandPitch +
              shakePitch,
          ),
          player.yaw + shakeYaw,
          shakeRoll + cameraRecoilRoll + damageRollTilt,
          'YXZ',
        );

        // Step Muzzle Flash, Procedural Barrel-Tip Flash Bursts, Explosion Shockwave, Tracer & HUD Timers
        if (muzzleFlashTimerSec > 0) {
          muzzleFlashTimerSec -= dt;
          muzzlePointLight.intensity = Math.max(0, muzzlePointLight.intensity - dt * 45);
          if (muzzleFlashTimerSec <= 0) {
            activeRig.muzzleFlashGroup.visible = false;
            muzzlePointLight.intensity = 0;
          }
        }

        for (let i = activeMuzzleFlashBursts.length - 1; i >= 0; i--) {
          const burst = activeMuzzleFlashBursts[i];
          burst.data = stepProceduralMuzzleFlashBurst(burst.data, dt);
          if (burst.data.expired) {
            burst.parent.remove(burst.group);
            for (let m = 0; m < burst.materials.length; m++) {
              burst.materials[m].dispose();
            }
            activeMuzzleFlashBursts.splice(i, 1);
          } else {
            for (let pIdx = 0; pIdx < burst.data.particles.length; pIdx++) {
              const p = burst.data.particles[pIdx];
              const mesh = burst.meshes[pIdx];
              const mat = burst.materials[pIdx];
              mesh.position.set(p.x, p.y, p.z);
              mesh.scale.set(p.scaleX, p.scaleY, p.scaleZ);
              mat.opacity = p.opacity;
              mesh.visible = p.opacity > 0.01;
            }
          }
        }

        if (explosionVisualTimerSec > 0) {
          explosionVisualTimerSec -= dt;
          const progress = 1 - Math.max(0, explosionVisualTimerSec) / 0.48;
          const ringScale = 0.4 + progress * EXPLOSION_BLAST_RADIUS * 1.05;
          shockwaveMesh.scale.set(ringScale, ringScale, ringScale);
          shockwaveMat.opacity = Math.max(0, (1 - progress) * 0.88);

          const fbScale = 0.5 + Math.sin(progress * Math.PI) * 2.4;
          fireballMesh.scale.set(fbScale, fbScale, fbScale);
          fireballMat.opacity = Math.max(0, (1 - progress) * 0.9);
          explosionPointLight.intensity = Math.max(0, (1 - progress) * 7.5);

          if (explosionVisualTimerSec <= 0) {
            shockwaveMesh.visible = false;
            fireballMesh.visible = false;
            explosionPointLight.intensity = 0;
          }
        }

        if (tracerTimerSec > 0) {
          tracerTimerSec -= dt;
          if (tracerTimerSec <= 0) {
            tracerLine.visible = false;
          }
        }
        if (hitMarkerTimer > 0) {
          hitMarkerTimer = Math.max(0, hitMarkerTimer - dt);
        }
        if (killConfirmTimer > 0) {
          killConfirmTimer = Math.max(0, killConfirmTimer - dt);
        }
        if (combatFlashAlpha > 0) {
          combatFlashAlpha = Math.max(0, combatFlashAlpha - dt * 2.8);
        }
        if (damageFlashAlpha > 0) {
          damageFlashAlpha = Math.max(0, damageFlashAlpha - dt * 2.2);
        }

        // Step Pooled Particles (Sparks, Debris, Expanding Smoke/Dust)
        let anyParticlesUpdated = false;
        for (let i = 0; i < MAX_PARTICLES; i++) {
          const p = particles[i];
          if (!p.active) continue;
          anyParticlesUpdated = true;
          p.age += dt;
          if (p.age >= p.maxAge) {
            p.active = false;
            _dummyObj.position.set(0, -100, 0);
            _dummyObj.scale.set(0.001, 0.001, 0.001);
            _dummyObj.updateMatrix();
            particleMesh.setMatrixAt(i, _dummyObj.matrix);
            continue;
          }

          p.vy -= 9.8 * p.gravityFactor * dt;
          p.x += p.vx * dt;
          p.y = Math.max(0.02, p.y + p.vy * dt);
          p.z += p.vz * dt;

          const lifeRatio = 1 - p.age / p.maxAge;
          const curScale =
            p.expandRate > 0
              ? (p.size + p.age * p.expandRate) * Math.min(1, lifeRatio * 1.4)
              : p.size * lifeRatio;
          _dummyObj.position.set(p.x, p.y, p.z);
          _dummyObj.scale.set(curScale, curScale, curScale);
          _dummyObj.rotation.set(p.age * 6, p.age * 4, 0);
          _dummyObj.updateMatrix();
          particleMesh.setMatrixAt(i, _dummyObj.matrix);
          _tempColor.setRGB(p.r, p.g, p.b);
          particleMesh.setColorAt(i, _tempColor);
        }

        if (anyParticlesUpdated) {
          particleMesh.instanceMatrix.needsUpdate = true;
          if (particleMesh.instanceColor) {
            particleMesh.instanceColor.needsUpdate = true;
          }
        }

        // Step Pooled 3D Ejected Brass Shell Casings (with Floor Bounce & Clink Audio)
        let anyShellsUpdated = false;
        for (let i = 0; i < MAX_SHELL_CASINGS; i++) {
          const s = shellCasings[i];
          if (!s.active) continue;
          anyShellsUpdated = true;
          s.age += dt;
          if (s.age >= s.maxAge) {
            s.active = false;
            _dummyObj.position.set(0, -100, 0);
            _dummyObj.scale.set(0.001, 0.001, 0.001);
            _dummyObj.updateMatrix();
            shellInstancedMesh.setMatrixAt(i, _dummyObj.matrix);
            continue;
          }

          s.vy -= 12.5 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.z += s.vz * dt;

          if (s.y <= 0.022) {
            s.y = 0.022;
            s.vy = Math.abs(s.vy) * 0.42;
            s.vx *= 0.65;
            s.vz *= 0.65;
            s.vRotX *= 0.5;
            s.vRotY *= 0.5;
            if (!s.hasBounced) {
              s.hasBounced = true;
              soundSystem.playShellCasingBounce();
            }
          }

          s.rotX += s.vRotX * dt;
          s.rotY += s.vRotY * dt;
          const fadeScale = s.age > s.maxAge - 0.3 ? (s.maxAge - s.age) / 0.3 : 1;

          _dummyObj.position.set(s.x, s.y, s.z);
          _dummyObj.rotation.set(s.rotX, s.rotY, s.rotZ);
          _dummyObj.scale.set(fadeScale, fadeScale, fadeScale);
          _dummyObj.updateMatrix();
          shellInstancedMesh.setMatrixAt(i, _dummyObj.matrix);
          _tempColor.setRGB(s.r, s.g, s.b);
          shellInstancedMesh.setColorAt(i, _tempColor);
        }

        if (anyShellsUpdated) {
          shellInstancedMesh.instanceMatrix.needsUpdate = true;
          if (shellInstancedMesh.instanceColor) {
            shellInstancedMesh.instanceColor.needsUpdate = true;
          }
        }

        // Step Pooled 3D Bullet Impact Decals
        for (let i = 0; i < MAX_DECALS; i++) {
          const d = decals[i];
          if (!d.active) continue;
          d.age += dt;
          if (d.age >= d.maxAge) {
            d.active = false;
            d.mesh.visible = false;
          } else if (d.age > d.maxAge - 2.0) {
            const alpha = (d.maxAge - d.age) / 2.0;
            d.innerMat.opacity = 0.9 * alpha;
            d.rimMat.opacity = 0.65 * alpha;
          }
        }

        // Throttled HUD Sync (12Hz + immediate on discrete events)
        if (nowMs - lastHudSyncTime >= 80) {
          lastHudSyncTime = nowMs;
          syncHudImmediate();
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.removeEventListener('mousedown', onCanvasMouseDown);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full bg-[#11151e] overflow-hidden"
      data-testid="canvas-container"
    />
  );
};

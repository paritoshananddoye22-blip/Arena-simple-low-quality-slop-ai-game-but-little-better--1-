export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type EnemyArchetype = 'assault' | 'flanker' | 'heavy';

export type WeaponId = 'rifle' | 'shotgun' | 'pistol';

export interface ObstacleBox {
  id: string;
  kind: 'barrier' | 'crate' | 'barrel' | 'pillar';
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotationY?: number;
}

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  hp: number;
  maxHp: number;
  isGrounded: boolean;
  isSprinting: boolean;
  walkDistance: number;
  lastDamageTime: number;
}

export interface WeaponState {
  id: WeaponId;
  keySlot: 1 | 2 | 3;
  name: string;
  caliber: string;
  magazine: number;
  magazineCapacity: number;
  reserve: number;
  maxReserve: number;
  pickupReserveBonus: number;
  damage: number;
  headshotDamage: number;
  headshotMultiplier: number;
  pelletCount: number;
  spreadRad: number;
  lowAmmoThreshold: number;
  fireCooldownSec: number;
  reloadDurationSec: number;
  isReloading: boolean;
  reloadTimerSec: number;
  lastFireTimeSec: number;
  recoilAmount: number;
}

export type WeaponArsenal = Record<WeaponId, WeaponState>;

export type PickupKind = 'ammo' | 'health_potion';

export interface AmmoPickupData {
  id: number;
  x: number;
  z: number;
  active: boolean;
  respawnTimerSec: number;
  isDrop: boolean;
  pickupKind?: PickupKind;
}

export interface EnemyData {
  id: number;
  archetype: EnemyArchetype;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  speed: number;
  attackDamage: number;
  attackRange: number;
  attackCooldownSec: number;
  attackTimerSec: number;
  windupTimerSec: number;
  isWindingUp: boolean;
  hitFlashTimerSec: number;
  walkCycle: number;
  isDead: boolean;
  deathTimerSec: number;
  flankSign: 1 | -1;
}

export interface WaveConfig {
  wave: number;
  totalEnemies: number;
  enemyHp: number;
  spawnIntervalSec: number;
  baseSpeed: number;
}

export interface KillFeedEntry {
  id: number;
  kind?: 'kill' | 'ammo' | 'health';
  title: string;
  archetypeLabel: string;
  weaponName: string;
  points: number;
  badgeText?: string;
  isHeadshot: boolean;
  archetype: EnemyArchetype;
  remainingSec: number;
  maxLifetimeSec: number;
}

export interface MatchStats {
  score: number;
  wave: number;
  enemiesRemainingInWave: number;
  enemiesSpawnedInWave: number;
  totalEnemiesInWave: number;
  totalEnemiesEliminated: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  ammoPickupsCollected: number;
  healthPotionsCollected?: number;
  timeSurvivedSec: number;
  waveClearBannerTimerSec: number;
}

export const ARENA_SIZE = 40;
export const ARENA_HALF_SIZE = ARENA_SIZE / 2; // 20
export const ARENA_PLAYABLE_HALF = 18.8; // Inside surrounding walls

export const PLAYER_MAX_HP = 100;
export const PLAYER_EYE_HEIGHT = 1.65;
export const PLAYER_RADIUS = 0.55;
export const NORMAL_MOVE_SPEED = 5.0;
export const SPRINT_MOVE_SPEED = 8.0;
export const JUMP_HEIGHT = 1.5;
export const GRAVITY = 22.0;
export const JUMP_VELOCITY = Math.sqrt(2 * GRAVITY * JUMP_HEIGHT); // ~8.124
export const PITCH_LIMIT = Math.PI * 0.44; // ~79 degrees

export const MAGAZINE_CAPACITY = 30;
export const STARTING_MAGAZINE = 30;
export const STARTING_RESERVE = 120;
export const BULLET_DAMAGE = 25;
export const HEADSHOT_DAMAGE = 50;
export const FIRE_RATE_RPS = 10;
export const FIRE_COOLDOWN_SEC = 1 / FIRE_RATE_RPS; // 0.1s
export const RELOAD_DURATION_SEC = 1.8;
export const LOW_AMMO_THRESHOLD = 8;

export const ENEMY_BASE_HP = 100;
export const ENEMY_BASE_SPEED = 2.5;
export const ENEMY_CONTACT_DAMAGE = 10;
export const ENEMY_ATTACK_COOLDOWN_SEC = 1.0;
export const ENEMY_ATTACK_RANGE = 2.15;
export const ENEMY_WINDUP_SEC = 0.28;
export const ENEMY_RADIUS = 0.55;
export const ENEMY_DEATH_DURATION_SEC = 0.55;

export const SCORE_ENEMY_ELIMINATED = 100;
export const SCORE_HEADSHOT_BONUS = 150;
export const SCORE_WAVE_COMPLETE = 250;

/**
 * Deterministic combat arena layout (40x40 world units).
 * Center (0, 0) is open so the player spawns on a wide clear zone with sightlines.
 */
export const ARENA_OBSTACLES: ObstacleBox[] = [
  // Four tactical concrete cover barriers around the mid-ring
  { id: 'barrier-nw', kind: 'barrier', x: -7.5, z: -7.5, width: 3.4, depth: 0.9, height: 1.45 },
  { id: 'barrier-ne', kind: 'barrier', x: 7.5, z: -7.5, width: 3.4, depth: 0.9, height: 1.45 },
  { id: 'barrier-sw', kind: 'barrier', x: -7.5, z: 7.5, width: 3.4, depth: 0.9, height: 1.45 },
  { id: 'barrier-se', kind: 'barrier', x: 7.5, z: 7.5, width: 3.4, depth: 0.9, height: 1.45 },

  // Side concrete defense walls along East/West flanks
  { id: 'barrier-w', kind: 'barrier', x: -11.5, z: 0, width: 0.9, depth: 3.6, height: 1.45 },
  { id: 'barrier-e', kind: 'barrier', x: 11.5, z: 0, width: 0.9, depth: 3.6, height: 1.45 },

  // Military supply crates in outer quadrants
  { id: 'crate-n1', kind: 'crate', x: 0, z: -12.5, width: 1.8, depth: 1.8, height: 1.8 },
  { id: 'crate-s1', kind: 'crate', x: 0, z: 12.5, width: 1.8, depth: 1.8, height: 1.8 },
  { id: 'crate-nw-stack', kind: 'crate', x: -13.5, z: -11.5, width: 2.0, depth: 2.0, height: 2.1 },
  { id: 'crate-se-stack', kind: 'crate', x: 13.5, z: 11.5, width: 2.0, depth: 2.0, height: 2.1 },

  // Industrial barrel clusters
  { id: 'barrel-ne', kind: 'barrel', x: 13.2, z: -11.5, width: 1.5, depth: 1.5, height: 1.35 },
  { id: 'barrel-sw', kind: 'barrel', x: -13.2, z: 11.5, width: 1.5, depth: 1.5, height: 1.35 },
  { id: 'barrel-nw-mid', kind: 'barrel', x: -4.2, z: -11.8, width: 1.3, depth: 1.3, height: 1.35 },
  { id: 'barrel-se-mid', kind: 'barrel', x: 4.2, z: 11.8, width: 1.3, depth: 1.3, height: 1.35 },
];

export const SPAWN_POINTS: Array<{ x: number; z: number }> = [
  { x: -3.2, z: -15.5 },
  { x: 3.4, z: -15.5 },
  { x: -14.5, z: -5.0 },
  { x: 14.5, z: -5.0 },
  { x: -3.4, z: 15.5 },
  { x: 3.2, z: 15.5 },
  { x: -14.5, z: 5.0 },
  { x: 14.5, z: 5.0 },
  { x: -15.5, z: -15.5 },
  { x: 15.5, z: -15.5 },
  { x: -15.5, z: 15.5 },
  { x: 15.5, z: 15.5 },
];

export function createInitialPlayerState(): PlayerState {
  return {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    isGrounded: true,
    isSprinting: false,
    walkDistance: 0,
    lastDamageTime: -10,
  };
}

export const AMMO_PICKUP_RADIUS = 1.65;
export const AMMO_RESPAWN_DURATION_SEC = 20.0;
export const HEALTH_POTION_RESPAWN_DURATION_SEC = 45.0;
export const HEALTH_POTION_HEAL_AMOUNT = 25;

// Lowered enemy loot drop rates:
// - 5% chance for an enemy to drop a Health Potion (very rare)
// - 25% chance for an enemy to drop an Ammo Supply Crate
// - 70% chance for no drop
export const ENEMY_AMMO_DROP_CHANCE = 0.25;
export const ENEMY_HEALTH_POTION_DROP_CHANCE = 0.05;

export const AMMO_STATION_POSITIONS: Array<{
  x: number;
  z: number;
  pickupKind: PickupKind;
}> = [
  { x: -5.2, z: 0, pickupKind: 'ammo' },
  { x: 5.2, z: 0, pickupKind: 'ammo' },
  { x: 0, z: -5.8, pickupKind: 'ammo' },
  { x: 0, z: 5.8, pickupKind: 'health_potion' },
];

export const WEAPON_ORDER: WeaponId[] = ['rifle', 'shotgun', 'pistol'];

export function createInitialWeaponState(weaponId: WeaponId = 'rifle'): WeaponState {
  if (weaponId === 'shotgun') {
    return {
      id: 'shotgun',
      keySlot: 2,
      name: 'Tactical Shotgun',
      caliber: '12-Gauge · 6-Pellet Spread',
      magazine: 8,
      magazineCapacity: 8,
      reserve: 32,
      maxReserve: 64,
      pickupReserveBonus: 4,
      damage: 18,
      headshotDamage: 34,
      headshotMultiplier: 34 / 18,
      pelletCount: 6,
      spreadRad: 0.046,
      lowAmmoThreshold: 2,
      fireCooldownSec: 0.55,
      reloadDurationSec: 2.0,
      isReloading: false,
      reloadTimerSec: 0,
      lastFireTimeSec: -10,
      recoilAmount: 0,
    };
  }
  if (weaponId === 'pistol') {
    return {
      id: 'pistol',
      keySlot: 3,
      name: 'Heavy Magnum',
      caliber: '.50 Cal · High-Precision',
      magazine: 10,
      magazineCapacity: 10,
      reserve: 50,
      maxReserve: 100,
      pickupReserveBonus: 6,
      damage: 45,
      headshotDamage: 100,
      headshotMultiplier: 100 / 45,
      pelletCount: 1,
      spreadRad: 0.0015,
      lowAmmoThreshold: 3,
      fireCooldownSec: 0.26,
      reloadDurationSec: 1.25,
      isReloading: false,
      reloadTimerSec: 0,
      lastFireTimeSec: -10,
      recoilAmount: 0,
    };
  }
  return {
    id: 'rifle',
    keySlot: 1,
    name: 'Assault Rifle',
    caliber: '5.56mm NATO · Full-Auto',
    magazine: STARTING_MAGAZINE,
    magazineCapacity: MAGAZINE_CAPACITY,
    reserve: STARTING_RESERVE,
    maxReserve: 240,
    pickupReserveBonus: 15,
    damage: BULLET_DAMAGE,
    headshotDamage: HEADSHOT_DAMAGE,
    headshotMultiplier: 2.0,
    pelletCount: 1,
    spreadRad: 0.003,
    lowAmmoThreshold: LOW_AMMO_THRESHOLD,
    fireCooldownSec: FIRE_COOLDOWN_SEC,
    reloadDurationSec: RELOAD_DURATION_SEC,
    isReloading: false,
    reloadTimerSec: 0,
    lastFireTimeSec: -10,
    recoilAmount: 0,
  };
}

export function createInitialArsenal(): WeaponArsenal {
  return {
    rifle: createInitialWeaponState('rifle'),
    shotgun: createInitialWeaponState('shotgun'),
    pistol: createInitialWeaponState('pistol'),
  };
}

export function createInitialAmmoPickups(): AmmoPickupData[] {
  return AMMO_STATION_POSITIONS.map((pos, idx) => ({
    id: idx + 1,
    x: pos.x,
    z: pos.z,
    active: true,
    respawnTimerSec: 0,
    isDrop: false,
    pickupKind: pos.pickupKind,
  }));
}

/**
 * Rolls enemy loot drop on elimination:
 * - 12% chance: 'health_potion' (rare crimson Health Potion)
 * - 25% chance: 'ammo' (lowered Ammo Supply Crate drop)
 * - 63% chance: null (no drop)
 */
export function rollEnemyLootDrop(rng: () => number = Math.random): PickupKind | null {
  const r = Math.max(0, Math.min(1, rng()));
  if (r < ENEMY_HEALTH_POTION_DROP_CHANCE) {
    return 'health_potion';
  }
  if (r < ENEMY_HEALTH_POTION_DROP_CHANCE + ENEMY_AMMO_DROP_CHANCE) {
    return 'ammo';
  }
  return null;
}

/**
 * Applies a Health Potion pickup to the player's current HP, restoring up to +25 HP (clamped to maxHp).
 */
export function collectHealthPotion(
  currentHp: number,
  maxHp: number = PLAYER_MAX_HP,
  healAmount: number = HEALTH_POTION_HEAL_AMOUNT,
): { nextHp: number; healedAmount: number } {
  const clampedCurrent = Math.max(0, Math.min(maxHp, currentHp));
  const nextHp = Math.min(maxHp, Math.round(clampedCurrent + Math.max(1, healAmount)));
  return {
    nextHp,
    healedAmount: Math.max(0, nextHp - clampedCurrent),
  };
}

export function collectAmmoResupply(arsenal: WeaponArsenal): {
  arsenal: WeaponArsenal;
  totalAdded: number;
  rifleAdded: number;
  shotgunAdded: number;
  pistolAdded: number;
} {
  const addFor = (w: WeaponState) => {
    const nextReserve = Math.min(w.maxReserve, w.reserve + w.pickupReserveBonus);
    const added = nextReserve - w.reserve;
    return {
      weapon: { ...w, reserve: nextReserve },
      added,
    };
  };

  const r = addFor(arsenal.rifle);
  const s = addFor(arsenal.shotgun);
  const p = addFor(arsenal.pistol);

  return {
    arsenal: {
      rifle: r.weapon,
      shotgun: s.weapon,
      pistol: p.weapon,
    },
    totalAdded: r.added + s.added + p.added,
    rifleAdded: r.added,
    shotgunAdded: s.added,
    pistolAdded: p.added,
  };
}

export function getWaveConfig(waveNumber: number): WaveConfig {
  const wave = Math.max(1, Math.floor(waveNumber));
  if (wave === 1) {
    return {
      wave: 1,
      totalEnemies: 3,
      enemyHp: 100,
      spawnIntervalSec: 2.0,
      baseSpeed: 2.5,
    };
  }
  if (wave === 2) {
    return {
      wave: 2,
      totalEnemies: 5,
      enemyHp: 100,
      spawnIntervalSec: 1.5,
      baseSpeed: 2.65,
    };
  }
  if (wave === 3) {
    return {
      wave: 3,
      totalEnemies: 7,
      enemyHp: 125,
      spawnIntervalSec: 1.25,
      baseSpeed: 2.8,
    };
  }
  const extraWaves = wave - 3;
  return {
    wave,
    totalEnemies: 7 + extraWaves * 2,
    enemyHp: 125 + extraWaves * 25,
    spawnIntervalSec: Math.max(0.65, Number((1.25 - extraWaves * 0.12).toFixed(2))),
    baseSpeed: Math.min(4.1, Number((2.8 + extraWaves * 0.12).toFixed(2))),
  };
}

export function createInitialMatchStats(): MatchStats {
  const wave1 = getWaveConfig(1);
  return {
    score: 0,
    wave: 1,
    enemiesRemainingInWave: wave1.totalEnemies,
    enemiesSpawnedInWave: 0,
    totalEnemiesInWave: wave1.totalEnemies,
    totalEnemiesEliminated: 0,
    headshots: 0,
    shotsFired: 0,
    shotsHit: 0,
    ammoPickupsCollected: 0,
    timeSurvivedSec: 0,
    waveClearBannerTimerSec: 0,
  };
}

export function getHealthBarColor(hp: number): 'green' | 'yellow' | 'red' {
  if (hp > 60) return 'green';
  if (hp >= 30) return 'yellow';
  return 'red';
}

export function applyPlayerDamage(currentHp: number, damage: number): number {
  const next = currentHp - Math.max(0, damage);
  return Math.max(0, Math.min(PLAYER_MAX_HP, Math.round(next)));
}

export function canFireWeapon(weapon: WeaponState, currentTimeSec: number): boolean {
  if (weapon.isReloading) return false;
  if (weapon.magazine <= 0) return false;
  if (currentTimeSec - weapon.lastFireTimeSec < weapon.fireCooldownSec - 1e-5) {
    return false;
  }
  return true;
}

export function fireWeaponRound(weapon: WeaponState, currentTimeSec: number): WeaponState {
  if (!canFireWeapon(weapon, currentTimeSec)) {
    return weapon;
  }
  const recoilKick =
    weapon.id === 'shotgun' ? 0.68 : weapon.id === 'pistol' ? 0.48 : 0.35;
  return {
    ...weapon,
    magazine: weapon.magazine - 1,
    lastFireTimeSec: currentTimeSec,
    recoilAmount: Math.min(1.0, weapon.recoilAmount + recoilKick),
  };
}

export function canReloadWeapon(weapon: WeaponState): boolean {
  if (weapon.isReloading) return false;
  if (weapon.magazine >= weapon.magazineCapacity) return false;
  if (weapon.reserve <= 0) return false;
  return true;
}

export function startReloadWeapon(weapon: WeaponState): WeaponState {
  if (!canReloadWeapon(weapon)) return weapon;
  return {
    ...weapon,
    isReloading: true,
    reloadTimerSec: weapon.reloadDurationSec,
  };
}

export function completeReloadWeapon(weapon: WeaponState): WeaponState {
  if (!weapon.isReloading) return weapon;
  const needed = weapon.magazineCapacity - weapon.magazine;
  const transfer = Math.max(0, Math.min(needed, weapon.reserve));
  return {
    ...weapon,
    magazine: weapon.magazine + transfer,
    reserve: weapon.reserve - transfer,
    isReloading: false,
    reloadTimerSec: 0,
  };
}

export function stepWeaponReload(weapon: WeaponState, dt: number): { weapon: WeaponState; completed: boolean } {
  if (!weapon.isReloading) {
    return { weapon, completed: false };
  }
  const remaining = weapon.reloadTimerSec - dt;
  if (remaining <= 0) {
    return {
      weapon: completeReloadWeapon(weapon),
      completed: true,
    };
  }
  return {
    weapon: {
      ...weapon,
      reloadTimerSec: remaining,
    },
    completed: false,
  };
}

export function calculateKillScore(currentScore: number, isHeadshot: boolean): number {
  return currentScore + SCORE_ENEMY_ELIMINATED + (isHeadshot ? SCORE_HEADSHOT_BONUS : 0);
}

export function calculateWaveCompletionScore(currentScore: number): number {
  return currentScore + SCORE_WAVE_COMPLETE;
}

export const KILL_FEED_LIFETIME_SEC = 4.0;
export const MAX_KILL_FEED_ITEMS = 5;

export function getArchetypeDisplayName(archetype: EnemyArchetype): string {
  if (archetype === 'flanker') return 'Recon Flanker';
  if (archetype === 'heavy') return 'Heavy Breacher';
  return 'Assault Trooper';
}

export function createKillFeedEntry(
  id: number,
  archetype: EnemyArchetype,
  isHeadshot: boolean,
  lifetimeSec: number = KILL_FEED_LIFETIME_SEC,
  weaponName: string = 'Assault Rifle',
): KillFeedEntry {
  const points = SCORE_ENEMY_ELIMINATED + (isHeadshot ? SCORE_HEADSHOT_BONUS : 0);
  return {
    id,
    kind: 'kill',
    title: isHeadshot ? 'Headshot · Enemy Eliminated' : 'Enemy Eliminated',
    archetypeLabel: getArchetypeDisplayName(archetype),
    weaponName,
    points,
    badgeText: `+${points}`,
    isHeadshot,
    archetype,
    remainingSec: lifetimeSec,
    maxLifetimeSec: lifetimeSec,
  };
}

export function createAmmoFeedEntry(
  id: number,
  rifleAdded: number,
  shotgunAdded: number,
  pistolAdded: number,
  lifetimeSec: number = KILL_FEED_LIFETIME_SEC,
): KillFeedEntry {
  return {
    id,
    kind: 'ammo',
    title: 'Ammo Resupplied',
    archetypeLabel: `+${rifleAdded} Rifle · +${shotgunAdded} Shells · +${pistolAdded} Mag`,
    weaponName: 'Supply Crate',
    points: 0,
    badgeText: '+AMMO',
    isHeadshot: false,
    archetype: 'assault',
    remainingSec: lifetimeSec,
    maxLifetimeSec: lifetimeSec,
  };
}

export function createHealthPotionFeedEntry(
  id: number,
  healedAmount: number,
  lifetimeSec: number = KILL_FEED_LIFETIME_SEC,
): KillFeedEntry {
  return {
    id,
    kind: 'health',
    title: 'Health Potion',
    archetypeLabel: `+${healedAmount} HP Restored · Bio-Flask`,
    weaponName: 'Health Potion',
    points: 0,
    badgeText: `+${healedAmount} HP`,
    isHeadshot: false,
    archetype: 'assault',
    remainingSec: lifetimeSec,
    maxLifetimeSec: lifetimeSec,
  };
}

export function pushKillFeedEntry(
  entries: KillFeedEntry[],
  newEntry: KillFeedEntry,
  maxItems: number = MAX_KILL_FEED_ITEMS,
): KillFeedEntry[] {
  return [newEntry, ...entries].slice(0, maxItems);
}

export function stepKillFeed(entries: KillFeedEntry[], dt: number): KillFeedEntry[] {
  if (entries.length === 0) return entries;
  const clampedDt = Math.max(0, dt);
  const next: KillFeedEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    const remaining = item.remainingSec - clampedDt;
    if (remaining > 0) {
      next.push({
        ...item,
        remainingSec: remaining,
      });
    }
  }
  return next;
}

export function clampPitch(pitch: number): number {
  return Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
}

/**
 * Resolves 2D circle vs axis-aligned bounding boxes + arena perimeter walls.
 * Prevents the player or enemies from walking through walls or obstacles.
 */
export function resolveEntityCollision(
  x: number,
  z: number,
  radius: number,
  obstacles: ObstacleBox[] = ARENA_OBSTACLES,
  playableHalf: number = ARENA_PLAYABLE_HALF,
): { x: number; z: number; hitWall: boolean } {
  let resolvedX = x;
  let resolvedZ = z;
  let hitWall = false;

  // 1. Arena outer walls
  const limit = playableHalf - radius;
  if (resolvedX < -limit) {
    resolvedX = -limit;
    hitWall = true;
  } else if (resolvedX > limit) {
    resolvedX = limit;
    hitWall = true;
  }

  if (resolvedZ < -limit) {
    resolvedZ = -limit;
    hitWall = true;
  } else if (resolvedZ > limit) {
    resolvedZ = limit;
    hitWall = true;
  }

  // 2. Obstacles (iterated twice for corner stability)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < obstacles.length; i++) {
      const obs = obstacles[i];
      const halfW = obs.width * 0.5;
      const halfD = obs.depth * 0.5;
      const minX = obs.x - halfW;
      const maxX = obs.x + halfW;
      const minZ = obs.z - halfD;
      const maxZ = obs.z + halfD;

      const closestX = Math.max(minX, Math.min(resolvedX, maxX));
      const closestZ = Math.max(minZ, Math.min(resolvedZ, maxZ));

      const dx = resolvedX - closestX;
      const dz = resolvedZ - closestZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        hitWall = true;
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const overlap = radius - dist;
          resolvedX += (dx / dist) * overlap;
          resolvedZ += (dz / dist) * overlap;
        } else {
          // Inside box center: push out along shallowest axis
          const penLeft = Math.abs(resolvedX - minX);
          const penRight = Math.abs(maxX - resolvedX);
          const penTop = Math.abs(resolvedZ - minZ);
          const penBottom = Math.abs(maxZ - resolvedZ);
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) resolvedX = minX - radius;
          else if (minPen === penRight) resolvedX = maxX + radius;
          else if (minPen === penTop) resolvedZ = minZ - radius;
          else resolvedZ = maxZ + radius;
        }
      }
    }
  }

  // Final clamp to arena bounds
  resolvedX = Math.max(-limit, Math.min(limit, resolvedX));
  resolvedZ = Math.max(-limit, Math.min(limit, resolvedZ));

  return { x: resolvedX, z: resolvedZ, hitWall };
}

export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
  jumpJustPressed: boolean;
}

/**
 * Updates player movement with camera-relative input, normalized diagonal speed,
 * smooth exponential acceleration/deceleration, gravity, ground & obstacle collision.
 */
export function stepPlayerMovement(
  player: PlayerState,
  input: MovementInput,
  dt: number,
  obstacles: ObstacleBox[] = ARENA_OBSTACLES,
): PlayerState {
  const clampedDt = Math.min(Math.max(dt, 0), 0.05);

  const forwardAxis = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  const strafeAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  // Camera forward in Three.js (-Z when yaw = 0, rotated by yaw around Y)
  const sinYaw = Math.sin(player.yaw);
  const cosYaw = Math.cos(player.yaw);

  // Forward vector: (-sinYaw, -cosYaw); Right vector: (cosYaw, -sinYaw)
  let wishX = -sinYaw * forwardAxis + cosYaw * strafeAxis;
  let wishZ = -cosYaw * forwardAxis - sinYaw * strafeAxis;

  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-5) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  const isMoving = wishLen > 1e-5;
  const isSprinting = isMoving && input.sprint;
  const targetSpeed = isSprinting ? SPRINT_MOVE_SPEED : NORMAL_MOVE_SPEED;

  const targetVx = wishX * targetSpeed;
  const targetVz = wishZ * targetSpeed;

  // Smooth acceleration & deceleration (not slippery)
  const accelRate = isMoving ? 18.0 : 16.0;
  const blend = 1 - Math.exp(-accelRate * clampedDt);

  const nextVx = player.vx + (targetVx - player.vx) * blend;
  const nextVz = player.vz + (targetVz - player.vz) * blend;

  let nextVy = player.vy;
  let nextIsGrounded = player.isGrounded;

  if (player.isGrounded && input.jumpJustPressed) {
    nextVy = JUMP_VELOCITY;
    nextIsGrounded = false;
  }

  // Apply gravity
  nextVy -= GRAVITY * clampedDt;

  const rawX = player.x + nextVx * clampedDt;
  const rawZ = player.z + nextVz * clampedDt;
  let nextY = player.y + nextVy * clampedDt;

  if (nextY <= 0) {
    nextY = 0;
    nextVy = 0;
    nextIsGrounded = true;
  }

  const resolved = resolveEntityCollision(rawX, rawZ, PLAYER_RADIUS, obstacles);
  const frameDist = Math.hypot(resolved.x - player.x, resolved.z - player.z);

  return {
    ...player,
    x: resolved.x,
    y: nextY,
    z: resolved.z,
    vx: Math.abs(nextVx) < 0.01 ? 0 : nextVx,
    vy: nextVy,
    vz: Math.abs(nextVz) < 0.01 ? 0 : nextVz,
    isGrounded: nextIsGrounded,
    isSprinting,
    walkDistance: player.walkDistance + (nextIsGrounded ? frameDist : frameDist * 0.35),
  };
}

/**
 * Selects a spawn point around the outer edges of the arena that is outside
 * the immediate player area (at least minDistance away).
 */
export function selectEnemySpawnPoint(
  playerX: number,
  playerZ: number,
  spawnSequenceIndex: number,
  minDistance: number = 11.0,
): { x: number; z: number } {
  const count = SPAWN_POINTS.length;
  const startIdx = Math.abs(spawnSequenceIndex) % count;

  let bestPoint = SPAWN_POINTS[startIdx];
  let bestDist = -1;

  for (let offset = 0; offset < count; offset++) {
    const candidate = SPAWN_POINTS[(startIdx + offset * 3) % count];
    const dist = Math.hypot(candidate.x - playerX, candidate.z - playerZ);
    if (dist >= minDistance) {
      return { x: candidate.x, z: candidate.z };
    }
    if (dist > bestDist) {
      bestDist = dist;
      bestPoint = candidate;
    }
  }

  return { x: bestPoint.x, z: bestPoint.z };
}

export function pickEnemyArchetype(wave: number, spawnIndex: number): EnemyArchetype {
  if (wave === 1) {
    return spawnIndex % 2 === 0 ? 'assault' : 'flanker';
  }
  const mod = spawnIndex % 3;
  if (mod === 0) return 'assault';
  if (mod === 1) return 'flanker';
  return 'heavy';
}

/**
 * Steps a single enemy's AI movement, obstacle avoidance, and attack cooldown/windup logic.
 * Returns updated enemy and any player damage dealt on this frame.
 */
export function stepEnemyAI(
  enemy: EnemyData,
  playerX: number,
  playerZ: number,
  dt: number,
  allEnemies: EnemyData[],
  obstacles: ObstacleBox[] = ARENA_OBSTACLES,
  canStartNewAttack: boolean = true,
): { enemy: EnemyData; damageToPlayer: number; startedAttackWindup: boolean } {
  const clampedDt = Math.min(Math.max(dt, 0), 0.05);

  if (enemy.isDead) {
    return {
      enemy: {
        ...enemy,
        deathTimerSec: enemy.deathTimerSec + clampedDt,
        hitFlashTimerSec: Math.max(0, enemy.hitFlashTimerSec - clampedDt),
      },
      damageToPlayer: 0,
      startedAttackWindup: false,
    };
  }

  const dx = playerX - enemy.x;
  const dz = playerZ - enemy.z;
  const distToPlayer = Math.hypot(dx, dz);

  // Face the player smoothly
  const targetYaw = Math.atan2(dx, dz);
  let nextAttackTimer = Math.max(0, enemy.attackTimerSec - clampedDt);
  let nextWindupTimer = enemy.windupTimerSec;
  let nextIsWindingUp = enemy.isWindingUp;
  let damageToPlayer = 0;
  let startedAttackWindup = false;

  const withinAttackDistance = distToPlayer <= enemy.attackRange;

  if (nextIsWindingUp) {
    nextWindupTimer -= clampedDt;
    if (nextWindupTimer <= 0) {
      nextIsWindingUp = false;
      nextWindupTimer = 0;
      nextAttackTimer = enemy.attackCooldownSec;
      // Verify player is still within strike reach (with slight lunge tolerance)
      if (distToPlayer <= enemy.attackRange + 0.55) {
        damageToPlayer = enemy.attackDamage;
      }
    }
  } else if (withinAttackDistance && nextAttackTimer <= 0 && canStartNewAttack) {
    nextIsWindingUp = true;
    nextWindupTimer = ENEMY_WINDUP_SEC;
    startedAttackWindup = true;
  }

  let nextX = enemy.x;
  let nextZ = enemy.z;
  let nextVx = 0;
  let nextVz = 0;
  let nextWalkCycle = enemy.walkCycle;

  // Move toward player if outside stop distance and not mid-strike
  const stopDist = enemy.attackRange * 0.82;
  if (distToPlayer > stopDist && !nextIsWindingUp) {
    let dirX = dx / Math.max(distToPlayer, 1e-4);
    let dirZ = dz / Math.max(distToPlayer, 1e-4);

    // Distinct archetype policies:
    // 1. 'flanker': approaches at an angled flanking curve when at medium range
    if (enemy.archetype === 'flanker' && distToPlayer > 4.2) {
      const flankAngle = 0.52 * enemy.flankSign; // ~30 deg
      const cosA = Math.cos(flankAngle);
      const sinA = Math.sin(flankAngle);
      const rotX = dirX * cosA - dirZ * sinA;
      const rotZ = dirX * sinA + dirZ * cosA;
      dirX = rotX;
      dirZ = rotZ;
    }

    // 2. 'heavy': steady advance with brief surge when medium-close
    let effectiveSpeed = enemy.speed;
    if (enemy.archetype === 'heavy' && distToPlayer > 3.0 && distToPlayer < 8.5) {
      effectiveSpeed = enemy.speed * 1.15;
    } else if (enemy.archetype === 'flanker') {
      effectiveSpeed = enemy.speed * 1.12;
    }

    // Soft separation from other living enemies so they don't stack on one point
    let sepX = 0;
    let sepZ = 0;
    for (let i = 0; i < allEnemies.length; i++) {
      const other = allEnemies[i];
      if (other.id === enemy.id || other.isDead) continue;
      const odx = enemy.x - other.x;
      const odz = enemy.z - other.z;
      const odistSq = odx * odx + odz * odz;
      const minSep = ENEMY_RADIUS * 2.2;
      if (odistSq > 1e-5 && odistSq < minSep * minSep) {
        const odist = Math.sqrt(odistSq);
        const push = (minSep - odist) / minSep;
        sepX += (odx / odist) * push * 0.9;
        sepZ += (odz / odist) * push * 0.9;
      }
    }

    // Obstacle feeler steering so enemies steer around barriers instead of getting stuck
    let steerX = dirX + sepX;
    let steerZ = dirZ + sepZ;
    const steerLen = Math.hypot(steerX, steerZ);
    if (steerLen > 1e-5) {
      steerX /= steerLen;
      steerZ /= steerLen;
    }

    const probeDist = 1.15;
    const probeX = enemy.x + steerX * probeDist;
    const probeZ = enemy.z + steerZ * probeDist;
    const probeCollision = resolveEntityCollision(probeX, probeZ, ENEMY_RADIUS, obstacles);
    if (probeCollision.hitWall) {
      // Try left and right tangent directions and pick the one closer to the player
      const leftX = -steerZ;
      const leftZ = steerX;
      const rightX = steerZ;
      const rightZ = -steerX;

      const leftDist = Math.hypot(playerX - (enemy.x + leftX), playerZ - (enemy.z + leftZ));
      const rightDist = Math.hypot(playerX - (enemy.x + rightX), playerZ - (enemy.z + rightZ));

      if (leftDist <= rightDist) {
        steerX = steerX * 0.35 + leftX * 0.9;
        steerZ = steerZ * 0.35 + leftZ * 0.9;
      } else {
        steerX = steerX * 0.35 + rightX * 0.9;
        steerZ = steerZ * 0.35 + rightZ * 0.9;
      }
      const norm = Math.hypot(steerX, steerZ) || 1;
      steerX /= norm;
      steerZ /= norm;
    }

    nextVx = steerX * effectiveSpeed;
    nextVz = steerZ * effectiveSpeed;

    const candidateX = enemy.x + nextVx * clampedDt;
    const candidateZ = enemy.z + nextVz * clampedDt;
    const resolved = resolveEntityCollision(candidateX, candidateZ, ENEMY_RADIUS, obstacles);

    nextX = resolved.x;
    nextZ = resolved.z;
    const moved = Math.hypot(nextX - enemy.x, nextZ - enemy.z);
    nextWalkCycle += moved * 3.6;
  }

  return {
    enemy: {
      ...enemy,
      x: nextX,
      z: nextZ,
      vx: nextVx,
      vz: nextVz,
      yaw: targetYaw,
      attackTimerSec: nextAttackTimer,
      windupTimerSec: nextWindupTimer,
      isWindingUp: nextIsWindingUp,
      hitFlashTimerSec: Math.max(0, enemy.hitFlashTimerSec - clampedDt),
      walkCycle: nextWalkCycle,
    },
    damageToPlayer,
    startedAttackWindup,
  };
}

export type SurfaceMaterial = 'concrete' | 'metal' | 'wood';

export interface SurfaceImpactProfile {
  material: SurfaceMaterial;
  sparkCount: number;
  dustCount: number;
  debrisCount: number;
  sparkColor: [number, number, number];
  debrisColor: [number, number, number];
  dustColor: [number, number, number];
  decalColorHex: number;
  decalRimColorHex: number;
  decalRadius: number;
}

export function getSurfaceImpactProfile(material: SurfaceMaterial): SurfaceImpactProfile {
  if (material === 'metal') {
    return {
      material: 'metal',
      sparkCount: 10,
      dustCount: 2,
      debrisCount: 3,
      sparkColor: [1.0, 0.78, 0.24],
      debrisColor: [0.62, 0.68, 0.78],
      dustColor: [0.55, 0.58, 0.64],
      decalColorHex: 0x0f172a,
      decalRimColorHex: 0x94a3b8,
      decalRadius: 0.075,
    };
  }
  if (material === 'wood') {
    return {
      material: 'wood',
      sparkCount: 1,
      dustCount: 5,
      debrisCount: 7,
      sparkColor: [0.95, 0.72, 0.35],
      debrisColor: [0.54, 0.38, 0.21],
      dustColor: [0.68, 0.56, 0.4],
      decalColorHex: 0x29180b,
      decalRimColorHex: 0x78350f,
      decalRadius: 0.095,
    };
  }
  return {
    material: 'concrete',
    sparkCount: 4,
    dustCount: 6,
    debrisCount: 5,
    sparkColor: [0.98, 0.84, 0.42],
    debrisColor: [0.42, 0.46, 0.54],
    dustColor: [0.64, 0.67, 0.72],
    decalColorHex: 0x111318,
    decalRimColorHex: 0x475569,
    decalRadius: 0.105,
  };
}

export const EXPLOSION_BLAST_RADIUS = 6.2;
export const EXPLOSION_MAX_DAMAGE = 140;
export const BARREL_MAX_HP = 50;
export const BARREL_RESPAWN_SEC = 16.0;

export function computeExplosionFalloffDamage(
  distance: number,
  blastRadius: number = EXPLOSION_BLAST_RADIUS,
  maxDamage: number = EXPLOSION_MAX_DAMAGE,
): number {
  if (distance >= blastRadius || blastRadius <= 0) return 0;
  const normalized = Math.max(0, 1 - distance / blastRadius);
  // Smooth falloff curve that rewards direct proximity
  return Math.round(maxDamage * Math.pow(normalized, 0.85));
}

export function createExplosionFeedEntry(
  id: number,
  eliminatedCount: number,
  lifetimeSec: number = KILL_FEED_LIFETIME_SEC,
): KillFeedEntry {
  const points = eliminatedCount * SCORE_ENEMY_ELIMINATED + 50;
  return {
    id,
    kind: 'kill',
    title: eliminatedCount > 0 ? 'Explosive Elimination' : 'Hazard Barrel Detonated',
    archetypeLabel:
      eliminatedCount > 0 ? `${eliminatedCount} Hostile${eliminatedCount > 1 ? 's' : ''} Eliminated` : 'Shockwave Blast',
    weaponName: 'Hazard Barrel',
    points,
    badgeText: eliminatedCount > 0 ? `+${points}` : 'BLAST',
    isHeadshot: eliminatedCount > 0,
    archetype: 'heavy',
    remainingSec: lifetimeSec,
    maxLifetimeSec: lifetimeSec,
  };
}

export interface WeaponBobSwayState {
  bobPhase: number;
  bobOffsetX: number;
  bobOffsetY: number;
  bobRollZ: number;
  bobPitchX: number;
  bobYawY: number;
  swayX: number;
  swayY: number;
  swayYaw: number;
  swayPitch: number;
  swayRoll: number;
  velLagX: number;
  velLagZ: number;
  strafeTilt: number;
  sprintCantRoll: number;
  landingDip: number;
  drawProgress: number;
  wasGrounded: boolean;
  firingVibrationX: number;
  firingVibrationY: number;
  firingVibrationRoll: number;
  // Second-order spring-damper physical recoil state
  recoilSpringZ: number;
  recoilVelZ: number;
  recoilSpringPitch: number;
  recoilVelPitch: number;
  recoilSpringYaw: number;
  recoilVelYaw: number;
  recoilSpringRoll: number;
  recoilVelRoll: number;
  sustainedClimbPitch: number;
  sustainedDriftYaw: number;
  cameraLandOffsetY: number;
  cameraLandPitch: number;
  // Final combined transform offsets applied to the 3D weapon bodyGroup
  totalPosX: number;
  totalPosY: number;
  totalPosZ: number;
  totalRotX: number;
  totalRotY: number;
  totalRotZ: number;
}

export interface WeaponBobSwayInput {
  dt: number;
  elapsedTimeSec: number;
  horizSpeed: number;
  velocityX?: number;
  velocityZ?: number;
  playerYaw?: number;
  isSprinting: boolean;
  isGrounded: boolean;
  verticalVelocity: number;
  strafeInput: number; // -1 left (A), 0 neutral, +1 right (D)
  forwardInput: number; // -1 backward (S), 0 neutral, +1 forward (W)
  lookDeltaYaw: number;
  lookDeltaPitch: number;
  recoilAmount: number;
  reloadTiltX?: number;
  reloadTiltZ?: number;
  reloadDropY?: number;
}

function clampVal(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dampVal(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * Math.max(0, dt));
}

export function createInitialWeaponBobSwayState(): WeaponBobSwayState {
  return {
    bobPhase: 0,
    bobOffsetX: 0,
    bobOffsetY: 0,
    bobRollZ: 0,
    bobPitchX: 0,
    bobYawY: 0,
    swayX: 0,
    swayY: 0,
    swayYaw: 0,
    swayPitch: 0,
    swayRoll: 0,
    velLagX: 0,
    velLagZ: 0,
    strafeTilt: 0,
    sprintCantRoll: 0,
    landingDip: 0,
    drawProgress: 1,
    wasGrounded: true,
    firingVibrationX: 0,
    firingVibrationY: 0,
    firingVibrationRoll: 0,
    recoilSpringZ: 0,
    recoilVelZ: 0,
    recoilSpringPitch: 0,
    recoilVelPitch: 0,
    recoilSpringYaw: 0,
    recoilVelYaw: 0,
    recoilSpringRoll: 0,
    recoilVelRoll: 0,
    sustainedClimbPitch: 0,
    sustainedDriftYaw: 0,
    cameraLandOffsetY: 0,
    cameraLandPitch: 0,
    totalPosX: 0,
    totalPosY: 0,
    totalPosZ: 0,
    totalRotX: 0,
    totalRotY: 0,
    totalRotZ: 0,
  };
}

/**
 * Injects a physical 3-axis spring-damper recoil impulse into the weapon state when a round is fired.
 * Models shoulder kickback (+Z), upward barrel muzzle climb (+Pitch), horizontal muzzle drift (Yaw),
 * and rifling torque twist (Roll) with weapon-specific ballistic profiles.
 */
export function applyWeaponRecoilImpulse(
  state: WeaponBobSwayState,
  weaponId: WeaponId = 'rifle',
  rng: () => number = Math.random,
): WeaponBobSwayState {
  const isShotgun = weaponId === 'shotgun';
  const isPistol = weaponId === 'pistol';

  const kickVelZ = isShotgun ? 1.85 : isPistol ? 1.35 : 0.98;
  const climbVelPitch = isShotgun ? 2.95 : isPistol ? 2.45 : 1.55;
  const driftVelYaw = (rng() - 0.46) * (isShotgun ? 1.15 : isPistol ? 0.75 : 0.68);
  const torqueVelRoll = (rng() - 0.5) * (isShotgun ? 2.4 : isPistol ? 1.8 : 1.35);

  const climbAdd = isShotgun ? 0.042 : isPistol ? 0.028 : 0.016;
  const driftAdd = (rng() - 0.48) * (isShotgun ? 0.022 : 0.012);

  return {
    ...state,
    recoilSpringZ: Math.min(0.14, state.recoilSpringZ + (isShotgun ? 0.045 : 0.024)),
    recoilVelZ: clampVal(state.recoilVelZ + kickVelZ, -2.5, 3.2),
    recoilSpringPitch: Math.min(0.28, state.recoilSpringPitch + (isShotgun ? 0.065 : 0.032)),
    recoilVelPitch: clampVal(state.recoilVelPitch + climbVelPitch, -3.0, 4.5),
    recoilVelYaw: clampVal(state.recoilVelYaw + driftVelYaw, -2.0, 2.0),
    recoilVelRoll: clampVal(state.recoilVelRoll + torqueVelRoll, -3.2, 3.2),
    sustainedClimbPitch: clampVal(state.sustainedClimbPitch + climbAdd, 0, 0.16),
    sustainedDriftYaw: clampVal(state.sustainedDriftYaw + driftAdd, -0.075, 0.075),
  };
}

/**
 * Pure procedural first-person weapon viewmodel animation:
 * - Velocity-projected Figure-8 Walking & Sprinting Bob (position X/Y + roll/pitch/yaw oscillation)
 * - Camera-Local Movement Velocity Inertial Lag & Strafe Banking Roll
 * - Sprint Tactical Diagonal Cant
 * - Idle Breathing Sway
 * - Mouse-Look / Camera Rotation Rotational & Positional Sway (inertia lag + spring return)
 * - Jump Airborne Momentum Lag & Landing Impulse Dip (both weapon & camera)
 * - Second-Order Spring-Damper Firearm Recoil & Cumulative Muzzle Climb Recovery
 * - Weapon Switch Draw-Up Arc
 */
export function stepWeaponBobAndSway(
  state: WeaponBobSwayState,
  input: WeaponBobSwayInput,
): WeaponBobSwayState {
  const dt = clampVal(input.dt, 0.0005, 0.05);
  const moveRatio = input.isGrounded ? clampVal(input.horizSpeed / NORMAL_MOVE_SPEED, 0, 1.65) : 0;

  // Project world velocity (velocityX, velocityZ) onto camera-local right & forward axes if provided
  let localRightSpeed = input.strafeInput * input.horizSpeed;
  let localForwardSpeed = input.forwardInput * input.horizSpeed;
  if (
    typeof input.velocityX === 'number' &&
    typeof input.velocityZ === 'number' &&
    typeof input.playerYaw === 'number'
  ) {
    const rightX = Math.cos(input.playerYaw);
    const rightZ = -Math.sin(input.playerYaw);
    const forwardX = -Math.sin(input.playerYaw);
    const forwardZ = -Math.cos(input.playerYaw);
    localRightSpeed = input.velocityX * rightX + input.velocityZ * rightZ;
    localForwardSpeed = input.velocityX * forwardX + input.velocityZ * forwardZ;
  }

  const normRightVel = clampVal(localRightSpeed / SPRINT_MOVE_SPEED, -1.2, 1.2);
  const normForwardVel = clampVal(localForwardSpeed / SPRINT_MOVE_SPEED, -1.2, 1.2);

  // 1. Advance figure-8 walk/sprint bob phase scaled by real movement speed
  const stepFreq = input.isSprinting ? 14.2 : 10.4;
  const nextBobPhase =
    moveRatio > 0.03 ? state.bobPhase + dt * stepFreq * Math.max(0.45, moveRatio) : state.bobPhase;

  const sprintBobMult = input.isSprinting ? 1.28 : 1.0;
  const targetBobX = Math.sin(nextBobPhase * 0.5) * 0.031 * moveRatio * sprintBobMult;
  const targetBobY = -Math.abs(Math.cos(nextBobPhase * 0.5)) * 0.035 * moveRatio * sprintBobMult;
  const targetBobRollZ = Math.sin(nextBobPhase * 0.5) * 0.056 * moveRatio * sprintBobMult;
  const sprintPitchLean = input.isSprinting && moveRatio > 0.85 ? -0.065 : 0;
  const targetBobPitchX = Math.cos(nextBobPhase) * 0.025 * moveRatio + sprintPitchLean;
  const targetBobYawY = Math.sin(nextBobPhase * 0.5) * 0.038 * moveRatio * sprintBobMult;

  const bobOffsetX = dampVal(state.bobOffsetX, targetBobX, 14, dt);
  const bobOffsetY = dampVal(state.bobOffsetY, targetBobY, 14, dt);
  const bobRollZ = dampVal(state.bobRollZ, targetBobRollZ, 14, dt);
  const bobPitchX = dampVal(state.bobPitchX, targetBobPitchX, 14, dt);
  const bobYawY = dampVal(state.bobYawY, targetBobYawY, 14, dt);

  // 2. Idle breathing figure-8 sway (subtle when stationary, blends down while sprinting)
  const idleScale = clampVal(1 - moveRatio * 0.55, 0.25, 1.0);
  const idleX = Math.sin(input.elapsedTimeSec * 1.65) * 0.0048 * idleScale;
  const idleY = Math.cos(input.elapsedTimeSec * 3.3) * 0.004 * idleScale;
  const idleRoll = Math.sin(input.elapsedTimeSec * 1.65) * 0.009 * idleScale;

  // 3. Camera rotation (mouse-look) inertia sway + velocity-driven inertial lag
  const injectedSwayX = clampVal(
    state.swayX + input.lookDeltaYaw * 0.105 - input.strafeInput * dt * 0.085,
    -0.072,
    0.072,
  );
  const injectedSwayY = clampVal(
    state.swayY - input.lookDeltaPitch * 0.092,
    -0.06,
    0.06,
  );
  const injectedSwayYaw = clampVal(
    state.swayYaw + input.lookDeltaYaw * 0.46,
    -0.24,
    0.24,
  );
  const injectedSwayPitch = clampVal(
    state.swayPitch - input.lookDeltaPitch * 0.39,
    -0.2,
    0.2,
  );
  const injectedSwayRoll = clampVal(
    state.swayRoll - input.lookDeltaYaw * 0.38,
    -0.22,
    0.22,
  );

  const swayX = dampVal(injectedSwayX, 0, 10.5, dt);
  const swayY = dampVal(injectedSwayY, 0, 10.5, dt);
  const swayYaw = dampVal(injectedSwayYaw, 0, 10.5, dt);
  const swayPitch = dampVal(injectedSwayPitch, 0, 10.5, dt);
  const swayRoll = dampVal(injectedSwayRoll, 0, 10.5, dt);

  // Velocity-driven weapon drag (weapon lags slightly opposite to lateral & forward movement velocity)
  const targetVelLagX = -normRightVel * 0.018;
  const targetVelLagZ = normForwardVel * 0.016;
  const velLagX = dampVal(state.velLagX, targetVelLagX, 12, dt);
  const velLagZ = dampVal(state.velLagZ, targetVelLagZ, 12, dt);

  // 4. Strafe banking roll, sprint tactical diagonal cant & jump/landing impulse
  const effectiveStrafe =
    Math.abs(normRightVel) > 0.05 ? normRightVel : input.strafeInput;
  const targetStrafeTilt = -effectiveStrafe * 0.082;
  const strafeTilt = dampVal(state.strafeTilt, targetStrafeTilt, 11.5, dt);

  const targetSprintCant = input.isSprinting && moveRatio > 0.85 ? 0.11 : 0;
  const sprintCantRoll = dampVal(state.sprintCantRoll, targetSprintCant, 10, dt);

  let landingDip = state.landingDip;
  if (input.isGrounded && !state.wasGrounded) {
    landingDip = -0.058;
  }
  landingDip = dampVal(landingDip, 0, 12, dt);

  const cameraLandOffsetY = landingDip * 2.1;
  const cameraLandPitch = landingDip * 0.65;

  const airLagY = input.isGrounded ? 0 : clampVal(-input.verticalVelocity * 0.006, -0.038, 0.038);
  const airPitch = input.isGrounded ? 0 : clampVal(input.verticalVelocity * 0.016, -0.085, 0.085);

  // 5. Weapon switch draw-up progress
  const drawProgress = Math.min(1, state.drawProgress + dt * 4.8);
  const drawEase = 1 - Math.pow(1 - drawProgress, 3);
  const drawDropY = -(1 - drawEase) * 0.14;
  const drawPitchX = -(1 - drawEase) * 0.35;

  // 6. Second-Order Spring-Damper Firearm Recoil Physics + Sustained Muzzle Climb
  const springStiffness = 195;
  const springDamping = 19.5;

  const stepSpring = (pos: number, vel: number) => {
    const accel = -springStiffness * pos - springDamping * vel;
    const nextVel = vel + accel * dt;
    const nextPos = pos + nextVel * dt;
    return { pos: nextPos, vel: nextVel };
  };

  const zSpring = stepSpring(state.recoilSpringZ, state.recoilVelZ);
  const pitchSpring = stepSpring(state.recoilSpringPitch, state.recoilVelPitch);
  const yawSpring = stepSpring(state.recoilSpringYaw, state.recoilVelYaw);
  const rollSpring = stepSpring(state.recoilSpringRoll, state.recoilVelRoll);

  const sustainedClimbPitch = dampVal(state.sustainedClimbPitch, 0, 8.5, dt);
  const sustainedDriftYaw = dampVal(state.sustainedDriftYaw, 0, 9.0, dt);

  // High-frequency weapon firing micro-vibration & recoil recovery
  const vibStrength = Math.max(0, input.recoilAmount);
  const firingVibrationX = Math.sin(input.elapsedTimeSec * 96) * 0.0045 * vibStrength;
  const firingVibrationY = Math.cos(input.elapsedTimeSec * 118) * 0.004 * vibStrength;
  const firingVibrationRoll = Math.sin(input.elapsedTimeSec * 82) * 0.02 * vibStrength;

  // Combine spring-damper recoil with input.recoilAmount so both impulse & legacy callers work seamlessly
  const recoilZ = Math.max(0, zSpring.pos) + input.recoilAmount * 0.068;
  const recoilRiseY = Math.max(0, pitchSpring.pos) * 0.08 + input.recoilAmount * 0.012;
  const recoilPitch =
    pitchSpring.pos + sustainedClimbPitch + input.recoilAmount * 0.115;
  const recoilYaw = yawSpring.pos + sustainedDriftYaw;
  const recoilRoll = rollSpring.pos;

  const reloadDropY = input.reloadDropY ?? 0;
  const reloadTiltX = input.reloadTiltX ?? 0;
  const reloadTiltZ = input.reloadTiltZ ?? 0;

  const totalPosX = bobOffsetX + idleX + swayX + velLagX + firingVibrationX;
  const totalPosY =
    bobOffsetY +
    idleY +
    swayY +
    landingDip +
    airLagY +
    drawDropY +
    reloadDropY +
    recoilRiseY +
    firingVibrationY;
  const totalPosZ = recoilZ + velLagZ;

  const totalRotX =
    recoilPitch +
    reloadTiltX +
    bobPitchX +
    swayPitch +
    airPitch +
    drawPitchX +
    landingDip * 1.4;
  const totalRotY = bobYawY + swayYaw + recoilYaw;
  const totalRotZ =
    reloadTiltZ +
    bobRollZ +
    idleRoll +
    swayRoll +
    strafeTilt +
    sprintCantRoll +
    recoilRoll +
    firingVibrationRoll;

  return {
    bobPhase: nextBobPhase,
    bobOffsetX,
    bobOffsetY,
    bobRollZ,
    bobPitchX,
    bobYawY,
    swayX,
    swayY,
    swayYaw,
    swayPitch,
    swayRoll,
    velLagX,
    velLagZ,
    strafeTilt,
    sprintCantRoll,
    landingDip,
    drawProgress,
    wasGrounded: input.isGrounded,
    firingVibrationX,
    firingVibrationY,
    firingVibrationRoll,
    recoilSpringZ: zSpring.pos,
    recoilVelZ: zSpring.vel,
    recoilSpringPitch: pitchSpring.pos,
    recoilVelPitch: pitchSpring.vel,
    recoilSpringYaw: yawSpring.pos,
    recoilVelYaw: yawSpring.vel,
    recoilSpringRoll: rollSpring.pos,
    recoilVelRoll: rollSpring.vel,
    sustainedClimbPitch,
    sustainedDriftYaw,
    cameraLandOffsetY,
    cameraLandPitch,
    totalPosX,
    totalPosY,
    totalPosZ,
    totalRotX,
    totalRotY,
    totalRotZ,
  };
}

export interface MuzzleFlashParticleSpec {
  kind: 'core' | 'streak' | 'spark';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  colorHex: number;
  opacity: number;
  age: number;
  maxAge: number;
}

export interface MuzzleFlashBurstData {
  weaponId: WeaponId;
  age: number;
  maxAge: number;
  expired: boolean;
  rollAngle: number;
  particles: MuzzleFlashParticleSpec[];
}

const MUZZLE_FLASH_COLORS = [0xffffff, 0xfef08a, 0xfbbf24, 0xf59e0b, 0xf97316];

/**
 * Generates a bright, randomized procedural muzzle flash particle burst at the barrel tip
 * tailored to the active weapon ('rifle' | 'shotgun' | 'pistol').
 */
export function createProceduralMuzzleFlashBurst(
  weaponId: WeaponId = 'rifle',
  rng: () => number = Math.random,
): MuzzleFlashBurstData {
  const isShotgun = weaponId === 'shotgun';
  const isPistol = weaponId === 'pistol';
  const count = isShotgun ? 18 : isPistol ? 12 : 14;
  const sizeMult = isShotgun ? 1.45 : isPistol ? 0.95 : 1.15;
  const baseMaxAge = isShotgun ? 0.088 : 0.072;

  const particles: MuzzleFlashParticleSpec[] = [];

  // 1. White-hot incandescent core flash right at the barrel crown
  particles.push({
    kind: 'core',
    x: 0,
    y: 0,
    z: -0.02,
    vx: 0,
    vy: 0,
    vz: -0.6,
    scaleX: 0.085 * sizeMult * (0.9 + rng() * 0.35),
    scaleY: 0.085 * sizeMult * (0.9 + rng() * 0.35),
    scaleZ: 0.16 * sizeMult * (0.9 + rng() * 0.4),
    rotX: 0,
    rotY: 0,
    rotZ: rng() * Math.PI * 2,
    colorHex: 0xffffff,
    opacity: 1.0,
    age: 0,
    maxAge: baseMaxAge * (0.75 + rng() * 0.25),
  });

  // 2. Randomized radial star / vent jet streaks
  const streakCount = isShotgun ? 6 : 5;
  for (let i = 0; i < streakCount; i++) {
    const angle = (i / streakCount) * Math.PI * 2 + (rng() - 0.5) * 0.45;
    const radialSpeed = (1.1 + rng() * 1.4) * sizeMult;
    const forwardSpeed = -(1.4 + rng() * 2.2) * sizeMult;
    const length = (0.14 + rng() * 0.14) * sizeMult;
    const thickness = (0.022 + rng() * 0.016) * sizeMult;

    particles.push({
      kind: 'streak',
      x: Math.cos(angle) * 0.015,
      y: Math.sin(angle) * 0.015,
      z: -0.015,
      vx: Math.cos(angle) * radialSpeed,
      vy: Math.sin(angle) * radialSpeed,
      vz: forwardSpeed,
      scaleX: length,
      scaleY: thickness,
      scaleZ: thickness,
      rotX: (rng() - 0.5) * 0.35,
      rotY: (rng() - 0.5) * 0.35,
      rotZ: angle,
      colorHex: MUZZLE_FLASH_COLORS[1 + Math.floor(rng() * 3)],
      opacity: 1.0,
      age: 0,
      maxAge: baseMaxAge * (0.8 + rng() * 0.3),
    });
  }

  // 3. High-velocity forward & radial muzzle plasma sparks
  const sparkCount = count - 1 - streakCount;
  for (let i = 0; i < sparkCount; i++) {
    const angle = rng() * Math.PI * 2;
    const spreadRadius = (0.35 + rng() * 1.65) * (isShotgun ? 1.4 : 1.0);
    const forwardSpeed = -(2.8 + rng() * 4.8) * sizeMult;
    const sparkSize = (0.018 + rng() * 0.024) * sizeMult;

    particles.push({
      kind: 'spark',
      x: (rng() - 0.5) * 0.02,
      y: (rng() - 0.5) * 0.02,
      z: -0.02 - rng() * 0.04,
      vx: Math.cos(angle) * spreadRadius,
      vy: Math.sin(angle) * spreadRadius,
      vz: forwardSpeed,
      scaleX: sparkSize,
      scaleY: sparkSize,
      scaleZ: sparkSize * (1.8 + rng() * 1.6),
      rotX: rng() * Math.PI,
      rotY: rng() * Math.PI,
      rotZ: rng() * Math.PI,
      colorHex: MUZZLE_FLASH_COLORS[2 + Math.floor(rng() * 3)],
      opacity: 1.0,
      age: 0,
      maxAge: baseMaxAge * (0.7 + rng() * 0.45),
    });
  }

  let maxParticleAge = baseMaxAge;
  for (let i = 0; i < particles.length; i++) {
    if (particles[i].maxAge > maxParticleAge) {
      maxParticleAge = particles[i].maxAge;
    }
  }

  return {
    weaponId,
    age: 0,
    maxAge: maxParticleAge,
    expired: false,
    rollAngle: rng() * Math.PI * 2,
    particles,
  };
}

/**
 * Steps a procedural muzzle flash particle burst forward in time, rapidly fading particle opacity
 * and marking the burst `expired: true` once all particles have faded so it can be removed from the scene.
 */
export function stepProceduralMuzzleFlashBurst(
  burst: MuzzleFlashBurstData,
  dt: number,
): MuzzleFlashBurstData {
  const clampedDt = Math.max(0, dt);
  const nextAge = burst.age + clampedDt;
  let anyAlive = false;

  const nextParticles = burst.particles.map((p) => {
    const pAge = p.age + clampedDt;
    if (pAge >= p.maxAge) {
      return {
        ...p,
        age: p.maxAge,
        opacity: 0,
      };
    }
    anyAlive = true;
    const lifeRatio = 1 - pAge / p.maxAge;
    // Rapid non-linear fade out
    const opacity = Math.pow(lifeRatio, 1.65);
    const expansion = p.kind === 'core' ? 1 + clampedDt * 8.5 : 1 - clampedDt * 2.5;

    return {
      ...p,
      x: p.x + p.vx * clampedDt,
      y: p.y + p.vy * clampedDt,
      z: p.z + p.vz * clampedDt,
      scaleX: Math.max(0.002, p.scaleX * expansion),
      scaleY: Math.max(0.002, p.scaleY * expansion),
      scaleZ: Math.max(0.002, p.scaleZ * expansion),
      age: pAge,
      opacity,
    };
  });

  return {
    ...burst,
    age: nextAge,
    expired: !anyAlive || nextAge >= burst.maxAge,
    particles: nextParticles,
  };
}

export type SpatialSoundCategory = 'footstep' | 'distant_gunfire' | 'ambiance';

export interface SpatialAudioParams {
  distance: number;
  attenuationGain: number;
  stereoPan: number;
  lowpassCutoffHz: number;
  frontBackFactor: number;
  audible: boolean;
}

export interface SpatialAudioOptions {
  refDistance?: number;
  maxDistance?: number;
  rolloffFactor?: number;
  baseGain?: number;
}

export interface AmbientSoundEmitterSpec {
  id: string;
  label: string;
  x: number;
  y: number;
  z: number;
  baseFreqHz: number;
  kind: 'turbine' | 'generator' | 'ventilation' | 'transformer';
}

export const AMBIENT_SOUND_EMITTERS: AmbientSoundEmitterSpec[] = [
  {
    id: 'nw_turbine',
    label: 'North-West Exhaust Turbine',
    x: -18.0,
    y: 4.2,
    z: -18.0,
    baseFreqHz: 58,
    kind: 'turbine',
  },
  {
    id: 'ne_generator',
    label: 'North-East Diesel Generator',
    x: 18.0,
    y: 2.4,
    z: -18.0,
    baseFreqHz: 72,
    kind: 'generator',
  },
  {
    id: 'sw_ventilation',
    label: 'South-West Air Handling Duct',
    x: -18.0,
    y: 3.8,
    z: 18.0,
    baseFreqHz: 110,
    kind: 'ventilation',
  },
  {
    id: 'se_transformer',
    label: 'South-East High-Voltage Transformer',
    x: 18.0,
    y: 3.5,
    z: 18.0,
    baseFreqHz: 120,
    kind: 'transformer',
  },
];

/**
 * Computes 3D spatial audio parameters (Euclidean distance, inverse-distance + boundary
 * rolloff attenuation gain, head-relative azimuth stereo pan [-1..1], and air-absorption
 * low-pass filter cutoff frequency) between the player listener and a 3D world sound source.
 */
export function compute3DSpatialAudioParams(
  listener: { x: number; y: number; z: number; yaw: number },
  source: { x: number; y: number; z: number },
  options: SpatialAudioOptions = {},
): SpatialAudioParams {
  const refDistance = Math.max(0.1, options.refDistance ?? 2.2);
  const maxDistance = Math.max(refDistance + 0.5, options.maxDistance ?? 32.0);
  const rolloffFactor = Math.max(0.1, options.rolloffFactor ?? 1.25);
  const baseGain = Math.max(0, options.baseGain ?? 1.0);

  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const dz = source.z - listener.z;
  const distance = Math.hypot(dx, dy, dz);

  if (distance >= maxDistance || baseGain <= 0) {
    return {
      distance,
      attenuationGain: 0,
      stereoPan: 0,
      lowpassCutoffHz: 450,
      frontBackFactor: 0,
      audible: false,
    };
  }

  // Inverse-distance rolloff combined with smooth outer-perimeter fade to zero at maxDistance
  const clampedDist = Math.max(refDistance, distance);
  const inverseAttenuation =
    refDistance / (refDistance + rolloffFactor * (clampedDist - refDistance));
  const normalizedDist = Math.max(0, (distance - refDistance) / (maxDistance - refDistance));
  const boundaryFade = Math.max(0, 1 - Math.pow(normalizedDist, 2.1));
  const attenuationGain = Number((baseGain * inverseAttenuation * boundaryFade).toFixed(5));

  // Listener forward & right horizontal basis vectors in Three.js YXZ convention:
  // yaw = 0 looks along -Z, right is +X.
  const forwardX = -Math.sin(listener.yaw);
  const forwardZ = -Math.cos(listener.yaw);
  const rightX = Math.cos(listener.yaw);
  const rightZ = -Math.sin(listener.yaw);

  const horizDist = Math.hypot(dx, dz);
  let stereoPan = 0;
  let frontBackFactor = 1;

  if (horizDist > 0.001) {
    const dirX = dx / horizDist;
    const dirZ = dz / horizDist;
    const rawRightDot = dirX * rightX + dirZ * rightZ;
    const rawForwardDot = dirX * forwardX + dirZ * forwardZ;
    // Near-field blend so a source right on top of the player doesn't hard-snap pan
    const nearFieldBlend = Math.min(1, horizDist / Math.max(0.75, refDistance * 0.6));
    stereoPan = Math.max(-1, Math.min(1, rawRightDot * nearFieldBlend));
    frontBackFactor = Math.max(-1, Math.min(1, rawForwardDot));
  }

  // Air-absorption high-frequency damping + subtle rear-hemisphere pinna shadowing
  const maxCutoffHz = 15500;
  const minCutoffHz = 580;
  const distCutoff =
    minCutoffHz + (maxCutoffHz - minCutoffHz) * Math.pow(1 - normalizedDist, 1.45);
  const rearShadowMult = frontBackFactor < 0 ? 1 + frontBackFactor * 0.28 : 1.0;
  const lowpassCutoffHz = Math.round(Math.max(minCutoffHz, distCutoff * rearShadowMult));

  return {
    distance,
    attenuationGain,
    stereoPan,
    lowpassCutoffHz,
    frontBackFactor,
    audible: attenuationGain > 0.002,
  };
}

/**
 * Detects when an enemy's walkCycle crosses a stride foot-plant boundary (every PI radians).
 */
export function detectEnemyFootstepPhaseCrossing(
  prevWalkCycle: number,
  nextWalkCycle: number,
): boolean {
  if (nextWalkCycle <= prevWalkCycle) return false;
  const prevStepIndex = Math.floor(prevWalkCycle / Math.PI);
  const nextStepIndex = Math.floor(nextWalkCycle / Math.PI);
  return nextStepIndex > prevStepIndex;
}

/**
 * Selects a 3D world position outside the 40x40 enclosed arena walls for distant combat gunfire echoes.
 */
export function selectDistantGunfirePosition(
  wave: number,
  eventIndex: number,
  rng: () => number = Math.random,
): { x: number; y: number; z: number } {
  const goldenAngle = 2.399963229728653;
  const angle = (wave * 1.7 + eventIndex * goldenAngle + rng() * 0.45) % (Math.PI * 2);
  const radius = 24 + rng() * 14; // 24m to 38m from arena center (outside the 20m walls)
  return {
    x: Math.cos(angle) * radius,
    y: 1.5 + rng() * 2.5,
    z: Math.sin(angle) * radius,
  };
}

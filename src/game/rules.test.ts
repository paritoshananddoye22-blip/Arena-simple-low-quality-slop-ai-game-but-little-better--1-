import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_PLAYABLE_HALF,
  BULLET_DAMAGE,
  ENEMY_ATTACK_COOLDOWN_SEC,
  ENEMY_ATTACK_RANGE,
  ENEMY_CONTACT_DAMAGE,
  HEADSHOT_DAMAGE,
  MAGAZINE_CAPACITY,
  NORMAL_MOVE_SPEED,
  PLAYER_MAX_HP,
  PLAYER_RADIUS,
  SCORE_ENEMY_ELIMINATED,
  SCORE_HEADSHOT_BONUS,
  SCORE_WAVE_COMPLETE,
  SPRINT_MOVE_SPEED,
  STARTING_MAGAZINE,
  STARTING_RESERVE,
  applyPlayerDamage,
  calculateKillScore,
  calculateWaveCompletionScore,
  canFireWeapon,
  canReloadWeapon,
  completeReloadWeapon,
  createInitialMatchStats,
  createInitialPlayerState,
  createInitialWeaponState,
  fireWeaponRound,
  getHealthBarColor,
  getWaveConfig,
  resolveEntityCollision,
  selectEnemySpawnPoint,
  startReloadWeapon,
  stepEnemyAI,
  stepPlayerMovement,
  stepWeaponReload,
  createKillFeedEntry,
  createAmmoFeedEntry,
  createInitialArsenal,
  createInitialAmmoPickups,
  collectAmmoResupply,
  pushKillFeedEntry,
  stepKillFeed,
  type EnemyData,
  type KillFeedEntry,
} from './rules';

test('initial player, weapon, and match states match specification', () => {
  const player = createInitialPlayerState();
  assert.equal(player.hp, 100);
  assert.equal(player.maxHp, PLAYER_MAX_HP);
  assert.equal(player.x, 0);
  assert.equal(player.z, 0);
  assert.equal(player.isGrounded, true);

  const weapon = createInitialWeaponState();
  assert.equal(weapon.magazine, STARTING_MAGAZINE);
  assert.equal(weapon.magazineCapacity, MAGAZINE_CAPACITY);
  assert.equal(weapon.reserve, STARTING_RESERVE);
  assert.equal(weapon.damage, BULLET_DAMAGE);
  assert.equal(HEADSHOT_DAMAGE, 50);

  const stats = createInitialMatchStats();
  assert.equal(stats.wave, 1);
  assert.equal(stats.score, 0);
  assert.equal(stats.enemiesRemainingInWave, 3);
});

test('health bar color thresholds and damage clamping work properly', () => {
  assert.equal(getHealthBarColor(100), 'green');
  assert.equal(getHealthBarColor(61), 'green');
  assert.equal(getHealthBarColor(60), 'yellow');
  assert.equal(getHealthBarColor(30), 'yellow');
  assert.equal(getHealthBarColor(29), 'red');
  assert.equal(getHealthBarColor(0), 'red');

  assert.equal(applyPlayerDamage(100, 10), 90);
  assert.equal(applyPlayerDamage(15, 25), 0);
  assert.equal(applyPlayerDamage(0, 10), 0);
});

test('weapon firing, cooldown, empty stop, and reload transfer work accurately', () => {
  let weapon = createInitialWeaponState();

  // Can fire at t = 0
  assert.equal(canFireWeapon(weapon, 0), true);
  weapon = fireWeaponRound(weapon, 0);
  assert.equal(weapon.magazine, 29);

  // Cooldown prevents firing immediately at t = 0.02
  assert.equal(canFireWeapon(weapon, 0.02), false);
  // Can fire after 0.1s cooldown
  assert.equal(canFireWeapon(weapon, 0.11), true);

  // Cannot reload when full
  const fullWeapon = createInitialWeaponState();
  assert.equal(canReloadWeapon(fullWeapon), false);

  // Can reload after firing
  assert.equal(canReloadWeapon(weapon), true);
  weapon = startReloadWeapon(weapon);
  assert.equal(weapon.isReloading, true);
  // Cannot shoot while reloading
  assert.equal(canFireWeapon(weapon, 1.0), false);

  // Advance reload timer partially
  const partial = stepWeaponReload(weapon, 1.0);
  assert.equal(partial.completed, false);
  assert.equal(partial.weapon.isReloading, true);

  // Finish reload (total 1.8s)
  const finished = stepWeaponReload(partial.weapon, 0.9);
  assert.equal(finished.completed, true);
  assert.equal(finished.weapon.isReloading, false);
  assert.equal(finished.weapon.magazine, 30);
  assert.equal(finished.weapon.reserve, 119);

  // Empty magazine cannot fire
  const emptyWeapon = { ...createInitialWeaponState(), magazine: 0 };
  assert.equal(canFireWeapon(emptyWeapon, 5.0), false);

  // Reloading from partial reserve transfers only available bullets
  let lowReserve = { ...createInitialWeaponState(), magazine: 10, reserve: 12 };
  lowReserve = startReloadWeapon(lowReserve);
  lowReserve = completeReloadWeapon(lowReserve);
  assert.equal(lowReserve.magazine, 22);
  assert.equal(lowReserve.reserve, 0);
});

test('wave configurations scale enemy count, HP, and spawn interval', () => {
  const w1 = getWaveConfig(1);
  assert.equal(w1.totalEnemies, 3);
  assert.equal(w1.enemyHp, 100);
  assert.equal(w1.spawnIntervalSec, 2.0);

  const w2 = getWaveConfig(2);
  assert.equal(w2.totalEnemies, 5);
  assert.equal(w2.enemyHp, 100);
  assert.ok(w2.spawnIntervalSec < w1.spawnIntervalSec);

  const w3 = getWaveConfig(3);
  assert.equal(w3.totalEnemies, 7);
  assert.equal(w3.enemyHp, 125);

  const w4 = getWaveConfig(4);
  assert.ok(w4.totalEnemies > w3.totalEnemies);
  assert.ok(w4.enemyHp > w3.enemyHp);
});

test('scoring system awards +100 per kill, +150 headshot bonus, and +250 wave bonus', () => {
  let score = 0;
  score = calculateKillScore(score, false);
  assert.equal(score, SCORE_ENEMY_ELIMINATED); // 100

  score = calculateKillScore(score, true);
  assert.equal(score, 100 + SCORE_ENEMY_ELIMINATED + SCORE_HEADSHOT_BONUS); // 350

  score = calculateWaveCompletionScore(score);
  assert.equal(score, 350 + SCORE_WAVE_COMPLETE); // 600
});

test('player movement normalizes diagonal speed, respects sprint and jump, and collides with walls', () => {
  let player = createInitialPlayerState();

  // Move straight forward for 1s (20 steps of 0.05s)
  for (let i = 0; i < 20; i++) {
    player = stepPlayerMovement(
      player,
      {
        forward: true,
        backward: false,
        left: false,
        right: false,
        sprint: false,
        jumpJustPressed: false,
      },
      0.05,
      [],
    );
  }
  const straightSpeed = Math.hypot(player.vx, player.vz);
  assert.ok(Math.abs(straightSpeed - NORMAL_MOVE_SPEED) < 0.05);

  // Move diagonally forward + right: speed must not exceed NORMAL_MOVE_SPEED
  let diagPlayer = createInitialPlayerState();
  for (let i = 0; i < 20; i++) {
    diagPlayer = stepPlayerMovement(
      diagPlayer,
      {
        forward: true,
        backward: false,
        left: false,
        right: true,
        sprint: false,
        jumpJustPressed: false,
      },
      0.05,
      [],
    );
  }
  const diagSpeed = Math.hypot(diagPlayer.vx, diagPlayer.vz);
  assert.ok(Math.abs(diagSpeed - NORMAL_MOVE_SPEED) < 0.05);

  // Sprint movement reaches 8 u/s
  let sprintPlayer = createInitialPlayerState();
  for (let i = 0; i < 20; i++) {
    sprintPlayer = stepPlayerMovement(
      sprintPlayer,
      {
        forward: true,
        backward: false,
        left: false,
        right: false,
        sprint: true,
        jumpJustPressed: false,
      },
      0.05,
      [],
    );
  }
  const sprintSpeed = Math.hypot(sprintPlayer.vx, sprintPlayer.vz);
  assert.ok(Math.abs(sprintSpeed - SPRINT_MOVE_SPEED) < 0.05);

  // Jump only works when grounded
  let jumpPlayer = createInitialPlayerState();
  jumpPlayer = stepPlayerMovement(
    jumpPlayer,
    {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jumpJustPressed: true,
    },
    0.02,
    [],
  );
  assert.equal(jumpPlayer.isGrounded, false);
  assert.ok(jumpPlayer.y > 0);

  // Arena wall boundary clamp
  const wallCheck = resolveEntityCollision(50, -50, PLAYER_RADIUS, []);
  assert.ok(wallCheck.x <= ARENA_PLAYABLE_HALF - PLAYER_RADIUS + 1e-5);
  assert.ok(wallCheck.z >= -(ARENA_PLAYABLE_HALF - PLAYER_RADIUS) - 1e-5);
  assert.equal(wallCheck.hitWall, true);
});

test('enemy spawn points avoid spawning on top of the player and enemy AI approaches and attacks on cooldown', () => {
  const spawn = selectEnemySpawnPoint(0, 0, 0, 11.0);
  const distFromCenter = Math.hypot(spawn.x, spawn.z);
  assert.ok(distFromCenter >= 11.0);

  let enemy: EnemyData = {
    id: 1,
    archetype: 'assault',
    x: 0,
    z: -6,
    y: 0,
    vx: 0,
    vz: 0,
    yaw: 0,
    hp: 100,
    maxHp: 100,
    speed: 2.5,
    attackDamage: ENEMY_CONTACT_DAMAGE,
    attackRange: ENEMY_ATTACK_RANGE,
    attackCooldownSec: ENEMY_ATTACK_COOLDOWN_SEC,
    attackTimerSec: 0,
    windupTimerSec: 0,
    isWindingUp: false,
    hitFlashTimerSec: 0,
    walkCycle: 0,
    isDead: false,
    deathTimerSec: 0,
    flankSign: 1,
  };

  // Step AI toward player at (0, 0): enemy should move closer
  const initialDist = Math.hypot(enemy.x, enemy.z);
  const step1 = stepEnemyAI(enemy, 0, 0, 0.05, [enemy], []);
  enemy = step1.enemy;
  const newDist = Math.hypot(enemy.x, enemy.z);
  assert.ok(newDist < initialDist);
  assert.equal(step1.damageToPlayer, 0);

  // Place enemy within attack range: triggers windup, then deals 10 HP damage and enters 1s cooldown
  enemy.x = 0;
  enemy.z = -1.5;
  const windupStart = stepEnemyAI(enemy, 0, 0, 0.05, [enemy], []);
  enemy = windupStart.enemy;
  assert.equal(windupStart.startedAttackWindup, true);
  assert.equal(enemy.isWindingUp, true);

  // Advance past windup (0.28s) in 0.05s steps
  let totalDmg = 0;
  for (let i = 0; i < 8; i++) {
    const res = stepEnemyAI(enemy, 0, 0, 0.05, [enemy], []);
    enemy = res.enemy;
    totalDmg += res.damageToPlayer;
  }
  assert.equal(totalDmg, ENEMY_CONTACT_DAMAGE);
  assert.ok(enemy.attackTimerSec > 0.5);
});

test('kill feed entries format Enemy Eliminated and Headshot notifications and expire over time', () => {
  let feed: KillFeedEntry[] = [];

  const normalKill = createKillFeedEntry(1, 'assault', false, 4.0);
  assert.equal(normalKill.title, 'Enemy Eliminated');
  assert.equal(normalKill.archetypeLabel, 'Assault Trooper');
  assert.equal(normalKill.points, 100);
  assert.equal(normalKill.isHeadshot, false);

  const headshotKill = createKillFeedEntry(2, 'flanker', true, 4.0);
  assert.equal(headshotKill.title, 'Headshot · Enemy Eliminated');
  assert.equal(headshotKill.archetypeLabel, 'Recon Flanker');
  assert.equal(headshotKill.points, 250);
  assert.equal(headshotKill.isHeadshot, true);

  feed = pushKillFeedEntry(feed, normalKill);
  feed = pushKillFeedEntry(feed, headshotKill);
  assert.equal(feed.length, 2);
  assert.equal(feed[0].id, 2); // Most recent first

  // Step 2 seconds: both remain active
  feed = stepKillFeed(feed, 2.0);
  assert.equal(feed.length, 2);
  assert.ok(Math.abs(feed[0].remainingSec - 2.0) < 1e-5);

  // Step another 2.1 seconds: both expire
  feed = stepKillFeed(feed, 2.1);
  assert.equal(feed.length, 0);
});

test('multi-weapon arsenal, lowered ammo resupply crates, and rarer health potion drops work accurately', async () => {
  const {
    ENEMY_AMMO_DROP_CHANCE,
    ENEMY_HEALTH_POTION_DROP_CHANCE,
    collectHealthPotion,
    createHealthPotionFeedEntry,
    rollEnemyLootDrop,
  } = await import('./rules');

  const arsenal = createInitialArsenal();
  assert.equal(arsenal.rifle.magazine, 30);
  assert.equal(arsenal.rifle.reserve, 120);
  assert.equal(arsenal.shotgun.magazine, 8);
  assert.equal(arsenal.shotgun.reserve, 32);
  assert.equal(arsenal.shotgun.pelletCount, 6);
  assert.equal(arsenal.pistol.magazine, 10);
  assert.equal(arsenal.pistol.reserve, 50);

  const pickups = createInitialAmmoPickups();
  assert.equal(pickups.length, 4);
  assert.equal(pickups.filter((p) => p.pickupKind === 'ammo').length, 3);
  assert.equal(pickups.filter((p) => p.pickupKind === 'health_potion').length, 1);

  // Lowered ammo resupply per pickup (+15 Rifle, +4 Shotgun Shells, +6 Magnum)
  const res = collectAmmoResupply(arsenal);
  assert.equal(res.rifleAdded, 15);
  assert.equal(res.shotgunAdded, 4);
  assert.equal(res.pistolAdded, 6);
  assert.equal(res.arsenal.rifle.reserve, 135);
  assert.equal(res.arsenal.shotgun.reserve, 36);
  assert.equal(res.arsenal.pistol.reserve, 56);

  const ammoEntry = createAmmoFeedEntry(99, res.rifleAdded, res.shotgunAdded, res.pistolAdded);
  assert.equal(ammoEntry.kind, 'ammo');
  assert.equal(ammoEntry.title, 'Ammo Resupplied');
  assert.ok(ammoEntry.archetypeLabel.includes('+15 Rifle'));
  assert.ok(ammoEntry.archetypeLabel.includes('+4 Shells'));
  assert.ok(ammoEntry.archetypeLabel.includes('+6 Mag'));

  // Health potion drop chance (5%) is strictly lower than ammo drop chance (25%), and most kills (70%) drop nothing
  assert.equal(ENEMY_HEALTH_POTION_DROP_CHANCE, 0.05);
  assert.ok(ENEMY_HEALTH_POTION_DROP_CHANCE < ENEMY_AMMO_DROP_CHANCE);
  assert.equal(rollEnemyLootDrop(() => 0.03), 'health_potion');
  assert.equal(rollEnemyLootDrop(() => 0.15), 'ammo');
  assert.equal(rollEnemyLootDrop(() => 0.55), null);

  // Health potion restores +25 HP and clamps at 100 max HP
  const heal1 = collectHealthPotion(60, 100);
  assert.equal(heal1.nextHp, 85);
  assert.equal(heal1.healedAmount, 25);

  const healClamped = collectHealthPotion(90, 100);
  assert.equal(healClamped.nextHp, 100);
  assert.equal(healClamped.healedAmount, 10);

  const hpEntry = createHealthPotionFeedEntry(101, heal1.healedAmount);
  assert.equal(hpEntry.kind, 'health');
  assert.equal(hpEntry.title, 'Health Potion');
  assert.equal(hpEntry.badgeText, '+25 HP');
});

test('weapon bob, velocity lag, camera-rotation sway, and spring-damper recoil impulse work accurately', async () => {
  const {
    applyWeaponRecoilImpulse,
    createInitialWeaponBobSwayState,
    stepWeaponBobAndSway,
  } = await import('./rules');
  let state = createInitialWeaponBobSwayState();

  // 1. Velocity-projected walking bob advances phase, produces figure-8 offsets, and lags behind forward/strafe velocity
  for (let i = 0; i < 6; i++) {
    state = stepWeaponBobAndSway(state, {
      dt: 0.03,
      elapsedTimeSec: 0.5 + i * 0.03,
      horizSpeed: 5.0,
      velocityX: 2.0,
      velocityZ: -4.6,
      playerYaw: 0,
      isSprinting: false,
      isGrounded: true,
      verticalVelocity: 0,
      strafeInput: 1,
      forwardInput: 1,
      lookDeltaYaw: 0,
      lookDeltaPitch: 0,
      recoilAmount: 0,
    });
  }
  assert.ok(state.bobPhase > 0);
  assert.ok(Math.abs(state.bobOffsetX) > 0.001);
  assert.ok(Math.abs(state.bobOffsetY) > 0.001);
  assert.ok(Math.abs(state.bobRollZ) > 0.001);
  assert.ok(state.velLagX < 0); // Moving right (+X when yaw=0) lags weapon slightly left
  assert.ok(state.velLagZ > 0); // Moving forward (-Z when yaw=0) pulls weapon slightly back (+Z)
  assert.ok(state.strafeTilt < 0);

  // 2. Camera-rotation yaw & pitch delta injects rotational and positional inertia sway
  const turned = stepWeaponBobAndSway(state, {
    dt: 0.02,
    elapsedTimeSec: 1.0,
    horizSpeed: 0,
    velocityX: 0,
    velocityZ: 0,
    playerYaw: 0.25,
    isSprinting: false,
    isGrounded: true,
    verticalVelocity: 0,
    strafeInput: 1,
    forwardInput: 0,
    lookDeltaYaw: 0.25,
    lookDeltaPitch: -0.15,
    recoilAmount: 0,
  });
  assert.ok(Math.abs(turned.swayX) > 0.005);
  assert.ok(Math.abs(turned.swayYaw) > 0.02);
  assert.ok(Math.abs(turned.swayPitch) > 0.01);

  // 3. Spring-damper physical recoil impulse kicks weapon back (+Z) and pitches muzzle upward (+X), then recovers
  let recoiling = applyWeaponRecoilImpulse(turned, 'shotgun', () => 0.75);
  assert.ok(recoiling.recoilVelZ > 1.0);
  assert.ok(recoiling.recoilVelPitch > 2.0);
  assert.ok(recoiling.sustainedClimbPitch > 0.02);

  recoiling = stepWeaponBobAndSway(recoiling, {
    dt: 0.025,
    elapsedTimeSec: 1.025,
    horizSpeed: 0,
    velocityX: 0,
    velocityZ: 0,
    playerYaw: 0.25,
    isSprinting: false,
    isGrounded: true,
    verticalVelocity: 0,
    strafeInput: 0,
    forwardInput: 0,
    lookDeltaYaw: 0,
    lookDeltaPitch: 0,
    recoilAmount: 0.8,
  });
  assert.ok(recoiling.recoilSpringZ > 0.02);
  assert.ok(recoiling.recoilSpringPitch > 0.04);
  assert.ok(recoiling.totalPosZ > -0.34); // Kicked backward from resting -0.36
  assert.ok(recoiling.totalRotX > 0.05); // Pitched upward
});

test('surface material impact profiles and explosive barrel blast falloff work accurately', async () => {
  const {
    getSurfaceImpactProfile,
    computeExplosionFalloffDamage,
    createExplosionFeedEntry,
  } = await import('./rules');

  const metalProfile = getSurfaceImpactProfile('metal');
  const woodProfile = getSurfaceImpactProfile('wood');
  const concreteProfile = getSurfaceImpactProfile('concrete');

  // Metal produces the most sparks; wood produces the most splinter debris; concrete produces strong dust
  assert.ok(metalProfile.sparkCount > concreteProfile.sparkCount);
  assert.ok(woodProfile.debrisCount > metalProfile.debrisCount);
  assert.ok(concreteProfile.dustCount >= metalProfile.dustCount);

  // Explosion falloff damage scales from max at center to 0 outside radius
  const centerDmg = computeExplosionFalloffDamage(0, 6.2, 140);
  const midDmg = computeExplosionFalloffDamage(3.1, 6.2, 140);
  const outDmg = computeExplosionFalloffDamage(6.5, 6.2, 140);
  assert.equal(centerDmg, 140);
  assert.ok(midDmg > 50 && midDmg < 140);
  assert.equal(outDmg, 0);

  const blastFeed = createExplosionFeedEntry(12, 2);
  assert.equal(blastFeed.title, 'Explosive Elimination');
  assert.equal(blastFeed.weaponName, 'Hazard Barrel');
  assert.ok(blastFeed.points >= 250);
});

test('procedural muzzle flash particle burst generates bright randomized barrel-tip particles and quickly fades to expiration', async () => {
  const {
    createProceduralMuzzleFlashBurst,
    stepProceduralMuzzleFlashBurst,
  } = await import('./rules');

  const rifleBurst = createProceduralMuzzleFlashBurst('rifle');
  const shotgunBurst = createProceduralMuzzleFlashBurst('shotgun');

  // Shotgun produces more particles and larger burst scale than rifle
  assert.ok(rifleBurst.particles.length >= 12);
  assert.ok(shotgunBurst.particles.length > rifleBurst.particles.length);
  assert.equal(rifleBurst.expired, false);

  // Includes incandescent core, radial streaks, and forward sparks
  const kinds = new Set(rifleBurst.particles.map((p) => p.kind));
  assert.ok(kinds.has('core'));
  assert.ok(kinds.has('streak'));
  assert.ok(kinds.has('spark'));

  // Stepping halfway rapidly fades particle opacity and advances forward (-Z) position
  const initialSparkZ = rifleBurst.particles[rifleBurst.particles.length - 1].z;
  const midBurst = stepProceduralMuzzleFlashBurst(rifleBurst, 0.035);
  assert.equal(midBurst.expired, false);
  assert.ok(midBurst.particles[0].opacity < 1.0 && midBurst.particles[0].opacity > 0);
  assert.ok(midBurst.particles[midBurst.particles.length - 1].z < initialSparkZ);

  // Stepping past maxAge marks burst as expired with 0 opacity so it is removed from the scene
  const expiredBurst = stepProceduralMuzzleFlashBurst(midBurst, 0.08);
  assert.equal(expiredBurst.expired, true);
  assert.ok(expiredBurst.particles.every((p) => p.opacity === 0));
});

test('3D sound spatializer attenuates gain and lowpass cutoff with distance, pans left/right by listener yaw, and detects footstep stride crossings', async () => {
  const {
    AMBIENT_SOUND_EMITTERS,
    compute3DSpatialAudioParams,
    detectEnemyFootstepPhaseCrossing,
    selectDistantGunfirePosition,
  } = await import('./rules');

  const listener = { x: 0, y: 1.65, z: 0, yaw: 0 };

  // 1. Distance attenuation: close source (2.5m) vs medium (10m) vs far (22m) vs beyond maxDistance (35m)
  const closeSound = compute3DSpatialAudioParams(
    listener,
    { x: 0, y: 0.15, z: -2.5 },
    { refDistance: 2.0, maxDistance: 26.0, rolloffFactor: 1.35 },
  );
  const midSound = compute3DSpatialAudioParams(
    listener,
    { x: 0, y: 0.15, z: -10.0 },
    { refDistance: 2.0, maxDistance: 26.0, rolloffFactor: 1.35 },
  );
  const farSound = compute3DSpatialAudioParams(
    listener,
    { x: 0, y: 0.15, z: -22.0 },
    { refDistance: 2.0, maxDistance: 26.0, rolloffFactor: 1.35 },
  );
  const outOfRangeSound = compute3DSpatialAudioParams(
    listener,
    { x: 0, y: 0.15, z: -35.0 },
    { refDistance: 2.0, maxDistance: 26.0, rolloffFactor: 1.35 },
  );

  assert.equal(closeSound.audible, true);
  assert.ok(closeSound.attenuationGain > midSound.attenuationGain);
  assert.ok(midSound.attenuationGain > farSound.attenuationGain);
  assert.ok(farSound.attenuationGain > 0);
  assert.equal(outOfRangeSound.attenuationGain, 0);
  assert.equal(outOfRangeSound.audible, false);

  // Air-absorption low-pass filter rolls off high frequencies as distance increases
  assert.ok(closeSound.lowpassCutoffHz > midSound.lowpassCutoffHz);
  assert.ok(midSound.lowpassCutoffHz > farSound.lowpassCutoffHz);

  // 2. Azimuth stereo panning: when listener faces -Z (yaw = 0), +X is right (+pan) and -X is left (-pan)
  const rightSound = compute3DSpatialAudioParams(listener, { x: 8, y: 1.65, z: 0 });
  const leftSound = compute3DSpatialAudioParams(listener, { x: -8, y: 1.65, z: 0 });
  assert.ok(rightSound.stereoPan > 0.85);
  assert.ok(leftSound.stereoPan < -0.85);

  // 3. Enemy footstep stride phase crossing triggers once per PI radian boundary
  assert.equal(detectEnemyFootstepPhaseCrossing(0.4, 2.9), false);
  assert.equal(detectEnemyFootstepPhaseCrossing(2.9, 3.25), true);
  assert.equal(detectEnemyFootstepPhaseCrossing(6.1, 6.4), true);

  // 4. Environmental emitters & distant gunfire positions are valid 3D coordinates
  assert.equal(AMBIENT_SOUND_EMITTERS.length, 4);
  const distantPos = selectDistantGunfirePosition(2, 5, () => 0.5);
  const distFromCenter = Math.hypot(distantPos.x, distantPos.z);
  assert.ok(distFromCenter >= 24 && distFromCenter <= 38);

  // 5. Turning away from a gunshot or emitter never makes it louder than facing it
  const facingSource = compute3DSpatialAudioParams(
    { x: 0, y: 1.65, z: 0, yaw: 0 },
    { x: 0, y: 1.65, z: -8 },
  );
  const turnedAwayFromSource = compute3DSpatialAudioParams(
    { x: 0, y: 1.65, z: 0, yaw: Math.PI },
    { x: 0, y: 1.65, z: -8 },
  );
  assert.ok(turnedAwayFromSource.attenuationGain <= facingSource.attenuationGain);
  assert.ok(turnedAwayFromSource.lowpassCutoffHz < facingSource.lowpassCutoffHz);
});

test('Zoiemre mini-boss (<=500 triangles) respects strict low-poly geometry budget, runner zombie is removed, and layered gunshot system randomizes Transient, Body, and Mechanical samples and pitches independently', async () => {
  const { inspectEnemyModelMetrics, buildEnemyModel } = await import('./models');
  const {
    getEnemyArchetypeProfile,
    getWaveConfig,
    createKillFeedEntry,
    pickEnemyArchetype,
    selectLayeredGunshotParams,
  } = await import('./rules');

  // Verify Zoiemre ('brute') geometry budget and separated non-rendered hitboxes
  const zoiemreMetrics = inspectEnemyModelMetrics('brute', true);
  assert.ok(
    zoiemreMetrics.characterTriangles <= 500 && zoiemreMetrics.characterTriangles >= 380,
    `Expected Zoiemre character triangles in 380..500, got ${zoiemreMetrics.characterTriangles}`,
  );
  assert.ok(
    zoiemreMetrics.totalVisibleTriangles <= 500,
    `Expected Zoiemre total visible triangles <= 500, got ${zoiemreMetrics.totalVisibleTriangles}`,
  );
  assert.ok(
    zoiemreMetrics.materialCount >= 1 && zoiemreMetrics.materialCount <= 3,
    `Expected Zoiemre material count 1..3, got ${zoiemreMetrics.materialCount}`,
  );
  assert.equal(zoiemreMetrics.textureSize, '256x256');

  const zoiemreRig = buildEnemyModel(502, 'brute', true);
  assert.equal(zoiemreRig.hitMeshes.length, 2);
  assert.ok(zoiemreRig.hitMeshes.every((m) => ((m as any).material?.visible === false)));

  // Verify Zoiemre combat profile and kill feed label ('Zoiemre')
  const wave2Cfg = getWaveConfig(2);
  const zoiemreProfile = getEnemyArchetypeProfile('brute', wave2Cfg);
  assert.equal(zoiemreProfile.displayName, 'Zoiemre');
  assert.ok(zoiemreProfile.hp >= wave2Cfg.enemyHp * 2.4);

  const zoiemreKill = createKillFeedEntry(11, 'brute', true, 4.0);
  assert.equal(zoiemreKill.archetypeLabel, 'Zoiemre');

  // Verify 'runner' is completely removed from wave spawning across waves 1..4
  for (let w = 1; w <= 4; w++) {
    for (let i = 0; i < 12; i++) {
      const arch = pickEnemyArchetype(w, i);
      assert.notEqual(arch as string, 'runner');
    }
  }

  // Verify layered weapon audio system selects separate Transient, Body, and Mechanical samples
  // with anti-repeat per layer and independent pitch randomization
  let history = {
    lastTransientIndex: -1,
    lastBodyIndex: -1,
    lastMechanicalIndex: -1,
  };
  let rngStep = 0;
  const mockRng = () => {
    rngStep = (rngStep + 1) % 29;
    return (rngStep * 0.137) % 1;
  };

  for (const weaponId of ['rifle', 'shotgun', 'pistol'] as const) {
    let prevRes = selectLayeredGunshotParams(weaponId, history, 3, mockRng);
    history = prevRes.nextHistory;

    for (let shot = 0; shot < 15; shot++) {
      const nextRes = selectLayeredGunshotParams(weaponId, history, 3, mockRng);
      const nextSelection = nextRes.selection;
      const prevSelection = prevRes.selection;
      // Anti-repeat guarantees consecutive shots never repeat the same sample index in any layer
      assert.notEqual(
        nextSelection.transientSampleIndex,
        prevSelection.transientSampleIndex,
        `Transient sample repeated on consecutive ${weaponId} shots`,
      );
      assert.notEqual(
        nextSelection.bodySampleIndex,
        prevSelection.bodySampleIndex,
        `Body sample repeated on consecutive ${weaponId} shots`,
      );
      assert.notEqual(
        nextSelection.mechanicalSampleIndex,
        prevSelection.mechanicalSampleIndex,
        `Mechanical sample repeated on consecutive ${weaponId} shots`,
      );

      // Verify pitch randomization stays within natural acoustic bounds
      assert.ok(nextSelection.transientPitch >= 0.9 && nextSelection.transientPitch <= 1.1);
      assert.ok(nextSelection.bodyPitch >= 0.91 && nextSelection.bodyPitch <= 1.09);
      assert.ok(nextSelection.mechanicalPitch >= 0.9 && nextSelection.mechanicalPitch <= 1.1);
      assert.ok(nextSelection.tailPitch >= 0.92 && nextSelection.tailPitch <= 1.08);

      prevRes = nextRes;
      history = nextRes.nextHistory;
    }
  }
});

test('advanced A* + string-pulling + context-steering pathfinding routes enemies around wide obstacles without getting stuck', async () => {
  const {
    computeAdvancedPathfindingDirection,
    hasClearLineOfSight2D,
  } = await import('./rules');

  const wideWallObstacle = [
    {
      id: 'test-wide-wall',
      kind: 'barrier' as const,
      x: 0,
      z: 0,
      width: 8.4,
      depth: 2.4,
      height: 1.8,
    },
  ];

  // Direct line from (0, -5) to (0, 5) is blocked by the wide wall
  assert.equal(hasClearLineOfSight2D(0, -5, 0, 5, 0.55, wideWallObstacle), false);
  // Line around the side from (6, -5) to (6, 5) is clear
  assert.equal(hasClearLineOfSight2D(6, -5, 6, 5, 0.55, wideWallObstacle), true);

  // Pathfinding at (0, -5) aiming for (0, 5) produces a lateral steering vector around the wall
  const dir = computeAdvancedPathfindingDirection(0, -5, 0, 5, wideWallObstacle, 0.55);
  assert.ok(Math.abs(dir.dirX) > 0.35, `Expected lateral detour dirX, got ${dir.dirX}`);

  // Simulate an enemy starting at (0, -4.5) navigating around the wide wall to reach player at (0, 4.5)
  let enemy: EnemyData = {
    id: 77,
    archetype: 'flanker',
    x: 0,
    y: 0,
    z: -4.5,
    vx: 0,
    vz: 0,
    yaw: 0,
    hp: 80,
    maxHp: 80,
    speed: 4.2,
    attackDamage: 10,
    attackRange: 1.9,
    attackCooldownSec: 1.0,
    attackTimerSec: 0,
    windupTimerSec: 0,
    isWindingUp: false,
    hitFlashTimerSec: 0,
    walkCycle: 0,
    isDead: false,
    deathTimerSec: 0,
    flankSign: 1,
  };

  for (let step = 0; step < 120; step++) {
    const res = stepEnemyAI(enemy, 0, 4.5, 0.05, [enemy], wideWallObstacle, true);
    enemy = res.enemy;
    if (Math.hypot(enemy.x - 0, enemy.z - 4.5) <= 1.8) {
      break;
    }
  }

  const finalDistToPlayer = Math.hypot(enemy.x - 0, enemy.z - 4.5);
  assert.ok(
    finalDistToPlayer < 2.2,
    `Expected enemy to navigate around wide wall and reach player (<2.2m), got ${finalDistToPlayer.toFixed(2)}m at (${enemy.x.toFixed(2)}, ${enemy.z.toFixed(2)})`,
  );
});


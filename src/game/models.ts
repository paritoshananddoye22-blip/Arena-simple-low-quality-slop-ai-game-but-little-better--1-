import * as THREE from 'three';
import {
  ARENA_HALF_SIZE,
  ARENA_OBSTACLES,
  ARENA_SIZE,
  type EnemyArchetype,
} from './rules';

export interface AssaultRifleRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  magazineMesh: THREE.Mesh;
  muzzleFlashGroup: THREE.Group;
  boltMesh: THREE.Mesh;
}

export interface EnemyRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  headGroup: THREE.Group;
  torsoGroup: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  visorMesh: THREE.Mesh;
  hpBarFill: THREE.Mesh;
  hpBarGroup: THREE.Group;
  hitMeshes: THREE.Object3D[];
  bodyMaterials: THREE.MeshStandardMaterial[];
}

function createConcreteTexture(
  renderer: THREE.WebGLRenderer,
  baseHex: string,
  gridHex: string,
  wearHex: string,
  repeatCount: number,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle worn concrete speckles
  for (let i = 0; i < 900; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const sz = (i % 3) + 1;
    ctx.fillStyle = i % 2 === 0 ? wearHex : gridHex;
    ctx.globalAlpha = 0.14;
    ctx.fillRect(x, y, sz, sz);
  }

  // Expansion joint grid lines
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = gridHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, 252, 252);

  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatCount, repeatCount);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function createHazardStripeTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#181b20';
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = '#d97706';
  for (let i = -128; i < 256; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 16, 0);
    ctx.lineTo(i - 48, 128);
    ctx.lineTo(i - 64, 128);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(6, 1);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

/**
 * Builds the 40x40 enclosed industrial military training combat arena.
 */
export function buildArenaEnvironment(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
): THREE.Object3D[] {
  const environmentColliders: THREE.Object3D[] = [];

  const floorTex = createConcreteTexture(renderer, '#262a31', '#171a1f', '#353b45', 14);
  const wallTex = createConcreteTexture(renderer, '#2e333d', '#1c2026', '#3d4452', 8);
  const hazardTex = createHazardStripeTexture(renderer);

  // 1. Flat Concrete Floor (40 x 40)
  const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE, 1, 1);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: floorTex,
    roughness: 0.86,
    metalness: 0.08,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = 0;
  floorMesh.receiveShadow = !isSoftwareGl;
  floorMesh.userData.surfaceMaterial = 'concrete';
  scene.add(floorMesh);
  environmentColliders.push(floorMesh);

  // Center tactical target ring decal (offset Y >= 0.02 so no Z-fighting)
  const centerRingGeo = new THREE.RingGeometry(2.8, 3.05, 32);
  const centerRingMat = new THREE.MeshBasicMaterial({
    color: 0x3b4352,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const centerRing = new THREE.Mesh(centerRingGeo, centerRingMat);
  centerRing.rotation.x = -Math.PI / 2;
  centerRing.position.y = 0.02;
  scene.add(centerRing);

  // 2. Four Surrounding Enclosed Walls + Industrial Buttress Pillars
  const wallHeight = 6.5;
  const wallThickness = 1.2;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: wallTex,
    roughness: 0.82,
    metalness: 0.14,
  });
  const trimDarkMat = new THREE.MeshStandardMaterial({
    color: 0x1a1d24,
    roughness: 0.5,
    metalness: 0.6,
  });
  const hazardMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: hazardTex,
    roughness: 0.65,
    metalness: 0.2,
  });

  const wallConfigs = [
    { x: 0, z: -ARENA_HALF_SIZE, w: ARENA_SIZE + wallThickness * 2, d: wallThickness }, // North
    { x: 0, z: ARENA_HALF_SIZE, w: ARENA_SIZE + wallThickness * 2, d: wallThickness },  // South
    { x: -ARENA_HALF_SIZE, z: 0, w: wallThickness, d: ARENA_SIZE },                    // West
    { x: ARENA_HALF_SIZE, z: 0, w: wallThickness, d: ARENA_SIZE },                     // East
  ];

  wallConfigs.forEach((cfg) => {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(cfg.x, 0, cfg.z);

    const mainWall = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.w, wallHeight, cfg.d),
      wallMat,
    );
    mainWall.position.y = wallHeight / 2;
    mainWall.castShadow = !isSoftwareGl;
    mainWall.receiveShadow = !isSoftwareGl;
    mainWall.userData.surfaceMaterial = 'concrete';
    wallGroup.add(mainWall);
    environmentColliders.push(mainWall);

    // Baseboard hazard stripe
    const basePlinth = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.w + 0.08, 0.38, cfg.d + 0.08),
      hazardMat,
    );
    basePlinth.position.y = 0.19;
    wallGroup.add(basePlinth);

    // Top steel coping beam
    const topCap = new THREE.Mesh(
      new THREE.BoxGeometry(cfg.w + 0.16, 0.45, cfg.d + 0.16),
      trimDarkMat,
    );
    topCap.position.y = wallHeight - 0.22;
    wallGroup.add(topCap);

    scene.add(wallGroup);
  });

  // Structural wall buttress columns around perimeter + overhead industrial light fixtures
  const lampEmissiveMat = new THREE.MeshStandardMaterial({
    color: 0xffe4b5,
    emissive: 0xffb347,
    emissiveIntensity: 2.2,
    roughness: 0.2,
  });

  const pillarPositions = [-15, -5, 5, 15];
  pillarPositions.forEach((offset) => {
    // North & South buttresses
    [-19.2, 19.2].forEach((zPos) => {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, wallHeight, 0.9),
        trimDarkMat,
      );
      col.position.set(offset, wallHeight / 2, zPos);
      scene.add(col);

      // Industrial wall sconce light fixture
      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.25, 0.4),
        lampEmissiveMat,
      );
      fixture.position.set(offset, wallHeight - 1.1, zPos > 0 ? zPos - 0.45 : zPos + 0.45);
      scene.add(fixture);
    });

    // West & East buttresses
    [-19.2, 19.2].forEach((xPos) => {
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, wallHeight, 0.9),
        trimDarkMat,
      );
      col.position.set(xPos, wallHeight / 2, offset);
      scene.add(col);

      const fixture = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.25, 1.4),
        lampEmissiveMat,
      );
      fixture.position.set(xPos > 0 ? xPos - 0.45 : xPos + 0.45, wallHeight - 1.1, offset);
      scene.add(fixture);
    });
  });

  // Overhead steel roof trusses for enclosed military hangar/training arena feel
  for (let z = -12; z <= 12; z += 12) {
    const truss = new THREE.Mesh(
      new THREE.BoxGeometry(ARENA_SIZE, 0.35, 0.45),
      trimDarkMat,
    );
    truss.position.set(0, wallHeight + 0.15, z);
    scene.add(truss);

    // Suspended industrial light banks along the truss
    [-10, 0, 10].forEach((x) => {
      const housing = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.18, 0.65),
        trimDarkMat,
      );
      housing.position.set(x, wallHeight - 0.08, z);
      scene.add(housing);

      const tube = new THREE.Mesh(
        new THREE.BoxGeometry(1.9, 0.08, 0.42),
        lampEmissiveMat,
      );
      tube.position.set(x, wallHeight - 0.16, z);
      scene.add(tube);
    });
  }

  // 3. Build Composite Props for each Obstacle in ARENA_OBSTACLES
  const barrierConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x4a5260,
    roughness: 0.85,
    metalness: 0.12,
  });
  const crateBodyMat = new THREE.MeshStandardMaterial({
    color: 0x4b5340, // Olive drab military crate
    roughness: 0.78,
    metalness: 0.18,
  });
  const crateFrameMat = new THREE.MeshStandardMaterial({
    color: 0x262b22,
    roughness: 0.55,
    metalness: 0.48,
  });
  const barrelRedMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.42,
    metalness: 0.52,
  });
  const barrelGreyMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.48,
    metalness: 0.58,
  });

  let nextHazardBarrelId = 1;

  ARENA_OBSTACLES.forEach((obs) => {
    const group = new THREE.Group();
    group.position.set(obs.x, 0, obs.z);

    if (obs.kind === 'barrier') {
      // Composite Jersey-style Concrete Barrier (5 parts)
      const baseFoot = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width, 0.32, obs.depth + 0.16),
        barrierConcreteMat,
      );
      baseFoot.position.y = 0.16;
      baseFoot.castShadow = !isSoftwareGl;
      baseFoot.receiveShadow = !isSoftwareGl;
      group.add(baseFoot);

      const mainWall = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width - 0.08, obs.height - 0.32, obs.depth - 0.08),
        barrierConcreteMat,
      );
      mainWall.position.y = 0.32 + (obs.height - 0.32) / 2;
      mainWall.castShadow = !isSoftwareGl;
      mainWall.receiveShadow = !isSoftwareGl;
      mainWall.userData.surfaceMaterial = 'concrete';
      group.add(mainWall);
      environmentColliders.push(mainWall);

      const hazardBand = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width - 0.04, 0.22, obs.depth - 0.04),
        hazardMat,
      );
      hazardBand.position.y = obs.height - 0.22;
      group.add(hazardBand);

      // Steel lifting hooks on top
      [-obs.width * 0.28, obs.width * 0.28].forEach((hx) => {
        const hook = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.14, 0.18),
          trimDarkMat,
        );
        hook.position.set(hx, obs.height + 0.06, 0);
        group.add(hook);
      });
    } else if (obs.kind === 'crate') {
      // Composite Military Supply Crate (5 parts)
      const coreBox = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width - 0.1, obs.height - 0.08, obs.depth - 0.1),
        crateBodyMat,
      );
      coreBox.position.y = obs.height / 2;
      coreBox.castShadow = !isSoftwareGl;
      coreBox.receiveShadow = !isSoftwareGl;
      coreBox.userData.surfaceMaterial = 'wood';
      group.add(coreBox);
      environmentColliders.push(coreBox);

      // Bottom & Top reinforced steel frames
      const bottomFrame = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width, 0.18, obs.depth),
        crateFrameMat,
      );
      bottomFrame.position.y = 0.09;
      group.add(bottomFrame);

      const topFrame = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width, 0.18, obs.depth),
        crateFrameMat,
      );
      topFrame.position.y = obs.height - 0.09;
      group.add(topFrame);

      // Diagonal cross-brace slats
      const brace1 = new THREE.Mesh(
        new THREE.BoxGeometry(obs.width + 0.02, 0.14, obs.depth + 0.02),
        crateFrameMat,
      );
      brace1.position.y = obs.height * 0.5;
      group.add(brace1);
    } else if (obs.kind === 'barrel') {
      // Cluster of 2 explosive red hazard drums + 1 heavy steel drum
      const offsets = [
        { dx: -0.28, dz: -0.22, mat: barrelRedMat, isExplosive: true },
        { dx: 0.32, dz: -0.18, mat: barrelGreyMat, isExplosive: false },
        { dx: 0.0, dz: 0.32, mat: barrelRedMat, isExplosive: true },
      ];
      offsets.forEach((drum) => {
        const drumGroup = new THREE.Group();
        drumGroup.position.set(drum.dx, 0, drum.dz);

        const cyl = new THREE.Mesh(
          new THREE.CylinderGeometry(0.36, 0.36, obs.height, 14),
          drum.mat,
        );
        cyl.position.y = obs.height / 2;
        cyl.castShadow = !isSoftwareGl;
        cyl.receiveShadow = !isSoftwareGl;
        cyl.userData.surfaceMaterial = 'metal';
        if (drum.isExplosive) {
          const bId = nextHazardBarrelId++;
          cyl.userData.isExplosiveBarrel = true;
          cyl.userData.barrelId = bId;
          cyl.userData.barrelWorldX = obs.x + drum.dx;
          cyl.userData.barrelWorldZ = obs.z + drum.dz;
          cyl.userData.barrelGroup = drumGroup;
        }
        drumGroup.add(cyl);
        environmentColliders.push(cyl);

        // Ribbed rings
        [0.06, obs.height * 0.5, obs.height - 0.06].forEach((ry) => {
          const ring = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.38, 0.06, 14),
            trimDarkMat,
          );
          ring.position.y = ry;
          drumGroup.add(ring);
        });

        group.add(drumGroup);
      });
    }

    scene.add(group);
  });

  return environmentColliders;
}

/**
 * Builds the 3D First-Person Assault Rifle attached to the player's camera.
 * Positioned in the bottom-right view with barrel, receiver, magazine, grip, stock, and iron sight.
 */
export function buildAssaultRifleModel(): AssaultRifleRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const gunMetalMat = new THREE.MeshStandardMaterial({
    color: 0x1e2229,
    roughness: 0.32,
    metalness: 0.82,
  });
  const polymerMat = new THREE.MeshStandardMaterial({
    color: 0x111317,
    roughness: 0.68,
    metalness: 0.22,
  });
  const accentSteelMat = new THREE.MeshStandardMaterial({
    color: 0x384152,
    roughness: 0.25,
    metalness: 0.88,
  });
  const sightGlowMat = new THREE.MeshBasicMaterial({
    color: 0x22c55e,
  });

  // 1. Upper & Lower Receiver Body
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.068, 0.088, 0.38), gunMetalMat);
  receiver.position.set(0, 0, 0);
  bodyGroup.add(receiver);

  // 2. Top Picatinny Rail
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.016, 0.46), accentSteelMat);
  topRail.position.set(0, 0.052, -0.05);
  bodyGroup.add(topRail);

  // 3. Handguard / Barrel Shroud
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.064, 0.28), polymerMat);
  handguard.position.set(0, 0.004, -0.31);
  bodyGroup.add(handguard);

  // 4. Rifled Barrel & Flash Suppressor
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.32, 12),
    accentSteelMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.014, -0.52);
  bodyGroup.add(barrel);

  const suppressor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.08, 12),
    gunMetalMat,
  );
  suppressor.rotation.x = Math.PI / 2;
  suppressor.position.set(0, 0.014, -0.68);
  bodyGroup.add(suppressor);

  // 5. Detachable Curved Magazine (animated during reload)
  const magazineMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.044, 0.19, 0.075),
    polymerMat,
  );
  magazineMesh.position.set(0, -0.125, -0.08);
  magazineMesh.rotation.x = 0.22;
  bodyGroup.add(magazineMesh);

  // 6. Ergonomic Pistol Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.058), polymerMat);
  grip.position.set(0, -0.095, 0.11);
  grip.rotation.x = -0.28;
  bodyGroup.add(grip);

  // 7. Tactical Buttstock
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.095, 0.22), polymerMat);
  stock.position.set(0, -0.01, 0.28);
  bodyGroup.add(stock);

  // 8. Rear & Front Iron Sights with Tritium Dot
  const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.032, 0.025), gunMetalMat);
  rearSight.position.set(0, 0.072, 0.12);
  bodyGroup.add(rearSight);

  const frontSightPost = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.036, 0.02),
    gunMetalMat,
  );
  frontSightPost.position.set(0, 0.072, -0.41);
  bodyGroup.add(frontSightPost);

  const frontSightDot = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.008), sightGlowMat);
  frontSightDot.position.set(0, 0.088, -0.41);
  bodyGroup.add(frontSightDot);

  // 9. Reciprocating Bolt Carrier on Right Side
  const boltMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.026, 0.09),
    accentSteelMat,
  );
  boltMesh.position.set(0.036, 0.018, -0.02);
  bodyGroup.add(boltMesh);

  // 10. Dynamic Multi-Layered 3D Muzzle Flash Star at Barrel Tip
  const muzzleFlashGroup = new THREE.Group();
  muzzleFlashGroup.position.set(0, 0.014, -0.74);
  muzzleFlashGroup.visible = false;

  const flashOuterMat = new THREE.MeshBasicMaterial({
    color: 0xffb703,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const flashInnerMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
  });
  const flashCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.068, 0), flashOuterMat);
  flashCore.scale.set(1.3, 1.3, 2.7);
  muzzleFlashGroup.add(flashCore);

  const hotCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.038, 0), flashInnerMat);
  hotCore.scale.set(1.1, 1.1, 2.1);
  muzzleFlashGroup.add(hotCore);

  const flashCross1 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.032, 0.032), flashOuterMat);
  const flashCross2 = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.25, 0.032), flashOuterMat);
  const flashDiag1 = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.024, 0.024), flashInnerMat);
  flashDiag1.rotation.z = Math.PI / 4;
  const flashDiag2 = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.024, 0.024), flashInnerMat);
  flashDiag2.rotation.z = -Math.PI / 4;
  muzzleFlashGroup.add(flashCross1, flashCross2, flashDiag1, flashDiag2);
  bodyGroup.add(muzzleFlashGroup);

  // Position weapon in bottom-right camera space
  root.position.set(0.27, -0.24, -0.46);
  root.rotation.set(0.02, -0.04, 0);

  return {
    root,
    bodyGroup,
    magazineMesh,
    muzzleFlashGroup,
    boltMesh,
  };
}

/**
 * Builds the 3D First-Person Tactical Shotgun (12-Gauge Pump-Action).
 */
export function buildShotgunModel(): AssaultRifleRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const receiverMat = new THREE.MeshStandardMaterial({
    color: 0x262b34,
    roughness: 0.35,
    metalness: 0.85,
  });
  const pumpMat = new THREE.MeshStandardMaterial({
    color: 0x7c2d12, // Tactical dark walnut / composite pump & stock
    roughness: 0.65,
    metalness: 0.15,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.28,
    metalness: 0.9,
  });
  const shellRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.4,
    metalness: 0.3,
  });

  // Heavy Receiver
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.092, 0.36), receiverMat);
  bodyGroup.add(receiver);

  // Side Shell Saddle (4 visible red 12-gauge shells mounted on receiver)
  [-0.1, -0.04, 0.02, 0.08].forEach((zOff) => {
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 0.065, 8),
      shellRedMat,
    );
    shell.position.set(-0.042, 0.005, zOff);
    bodyGroup.add(shell);
  });

  // Top Bore Barrel
  const topBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.021, 0.021, 0.56, 14),
    barrelMat,
  );
  topBarrel.rotation.x = Math.PI / 2;
  topBarrel.position.set(0, 0.022, -0.44);
  bodyGroup.add(topBarrel);

  // Under-barrel Tubular Magazine
  const tubeMag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.48, 12),
    receiverMat,
  );
  tubeMag.rotation.x = Math.PI / 2;
  tubeMag.position.set(0, -0.018, -0.4);
  bodyGroup.add(tubeMag);

  // Ribbed Forend Pump (used as magazineMesh so it slides during reload/pump)
  const magazineMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.064, 0.058, 0.24),
    pumpMat,
  );
  magazineMesh.position.set(0, -0.02, -0.34);
  bodyGroup.add(magazineMesh);

  // Stock & Grip
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.105, 0.26), pumpMat);
  stock.position.set(0, -0.022, 0.28);
  bodyGroup.add(stock);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.12, 0.06), pumpMat);
  grip.position.set(0, -0.09, 0.12);
  grip.rotation.x = -0.32;
  bodyGroup.add(grip);

  // Ghost Ring Rear & Amber Front Bead Sight
  const frontBead = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.022, 0.018),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
  );
  frontBead.position.set(0, 0.05, -0.68);
  bodyGroup.add(frontBead);

  const boltMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.028, 0.095),
    barrelMat,
  );
  boltMesh.position.set(0.04, 0.016, -0.02);
  bodyGroup.add(boltMesh);

  // Large Volumetric Shotgun Muzzle Blast Star & Ring
  const muzzleFlashGroup = new THREE.Group();
  muzzleFlashGroup.position.set(0, 0.022, -0.76);
  muzzleFlashGroup.visible = false;

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xf97316,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const hotMat = new THREE.MeshBasicMaterial({
    color: 0xfef08a,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  });
  const flashCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.105, 0), flashMat);
  flashCore.scale.set(1.55, 1.55, 2.8);
  muzzleFlashGroup.add(flashCore);

  const innerCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), hotMat);
  innerCore.scale.set(1.2, 1.2, 2.2);
  muzzleFlashGroup.add(innerCore);

  const blastSpikes1 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.045), flashMat);
  const blastSpikes2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.34, 0.045), flashMat);
  muzzleFlashGroup.add(blastSpikes1, blastSpikes2);
  bodyGroup.add(muzzleFlashGroup);

  root.position.set(0.28, -0.25, -0.44);
  root.rotation.set(0.02, -0.04, 0);

  return {
    root,
    bodyGroup,
    magazineMesh,
    muzzleFlashGroup,
    boltMesh,
  };
}

/**
 * Builds the 3D First-Person Heavy Magnum Sidearm (.50 Cal Precision Pistol).
 */
export function buildPistolModel(): AssaultRifleRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const chromeSteelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.22,
    metalness: 0.92,
  });
  const darkFrameMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.65,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.78,
    metalness: 0.15,
  });

  // Heavy Triangular/Block Slide (boltMesh slides back on recoil)
  const boltMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.056, 0.064, 0.34),
    chromeSteelMat,
  );
  boltMesh.position.set(0, 0.032, -0.08);
  bodyGroup.add(boltMesh);

  // Lower Frame & Trigger Guard
  const lowerFrame = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.036, 0.32),
    darkFrameMat,
  );
  lowerFrame.position.set(0, -0.012, -0.07);
  bodyGroup.add(lowerFrame);

  // Grip & Removable Magazine inside Grip
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.145, 0.068), gripMat);
  grip.position.set(0, -0.095, 0.04);
  grip.rotation.x = -0.22;
  bodyGroup.add(grip);

  const magazineMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.14, 0.056),
    chromeSteelMat,
  );
  magazineMesh.position.set(0, -0.11, 0.045);
  magazineMesh.rotation.x = -0.22;
  bodyGroup.add(magazineMesh);

  // Glowing Cyan/Green Precision Sight Dots
  const sightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const frontDot = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.014, 0.014), sightMat);
  frontDot.position.set(0, 0.07, -0.23);
  bodyGroup.add(frontDot);

  const muzzleFlashGroup = new THREE.Group();
  muzzleFlashGroup.position.set(0, 0.032, -0.29);
  muzzleFlashGroup.visible = false;

  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
  });
  const hotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  });
  const flashCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), flashMat);
  flashCore.scale.set(1.25, 1.25, 2.3);
  muzzleFlashGroup.add(flashCore);

  const flashCross1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.03), hotMat);
  const flashCross2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.03), hotMat);
  muzzleFlashGroup.add(flashCross1, flashCross2);
  bodyGroup.add(muzzleFlashGroup);

  root.position.set(0.23, -0.22, -0.4);
  root.rotation.set(0.01, -0.03, 0);

  return {
    root,
    bodyGroup,
    magazineMesh,
    muzzleFlashGroup,
    boltMesh,
  };
}

/**
 * Builds a 3D Military Ammo Supply Box pickup placed in the arena.
 */
export function buildAmmoPickupModel(): { root: THREE.Group; boxGroup: THREE.Group } {
  const root = new THREE.Group();
  const boxGroup = new THREE.Group();
  boxGroup.position.y = 0.28;
  root.add(boxGroup);

  // Ground contact ring
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.56, 24),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    }),
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.022;
  root.add(ringMesh);

  const caseMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.45,
    metalness: 0.5,
  });
  const lidMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.35,
    metalness: 0.75,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xd97706,
    emissiveIntensity: 0.55,
    roughness: 0.25,
    metalness: 0.85,
  });

  const mainBox = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.36), caseMat);
  boxGroup.add(mainBox);

  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.4), lidMat);
  lid.position.y = 0.17;
  boxGroup.add(lid);

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.08, 0.38), brassMat);
  stripe.position.y = 0.0;
  boxGroup.add(stripe);

  return { root, boxGroup };
}

/**
 * Builds a 3D Glowing Crimson Health Potion Flask pickup placed or dropped in the arena.
 */
export function buildHealthPotionModel(): { root: THREE.Group; boxGroup: THREE.Group } {
  const root = new THREE.Group();
  const boxGroup = new THREE.Group();
  boxGroup.position.y = 0.32;
  root.add(boxGroup);

  // Glowing crimson-rose ground ring
  const ringMesh = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.54, 24),
    new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
  );
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = 0.022;
  root.add(ringMesh);

  const potionLiquidMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xe11d48,
    emissiveIntensity: 0.75,
    roughness: 0.2,
    metalness: 0.35,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.3,
    metalness: 0.85,
  });
  const corkMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.65,
    metalness: 0.15,
  });
  const crossMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
  });

  // Faceted ruby potion flask body
  const flaskBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.22, 0.34, 8),
    potionLiquidMat,
  );
  boxGroup.add(flaskBody);

  // Flask shoulder & neck collar
  const neckMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.11, 0.12, 8),
    collarMat,
  );
  neckMesh.position.y = 0.21;
  boxGroup.add(neckMesh);

  // Stopper cork
  const corkMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.065, 0.08, 8),
    corkMat,
  );
  corkMesh.position.y = 0.29;
  boxGroup.add(corkMesh);

  // Glowing white medical cross emblem on front & back
  const crossVert = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.46), crossMat);
  const crossHoriz = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.055, 0.46), crossMat);
  boxGroup.add(crossVert, crossHoriz);

  return { root, boxGroup };
}

/**
 * Builds a 3D Humanoid Enemy with head, torso, two arms, two legs, dark military clothing,
 * and crimson red tactical accents. Includes distinct head vs body raycast hitboxes.
 */
export function buildEnemyModel(
  id: number,
  archetype: EnemyArchetype,
  isSoftwareGl: boolean,
): EnemyRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const hitMeshes: THREE.Object3D[] = [];
  const bodyMaterials: THREE.MeshStandardMaterial[] = [];

  // Dark military uniform material
  const uniformColor =
    archetype === 'heavy' ? 0x181b22 : archetype === 'flanker' ? 0x222630 : 0x1e232b;
  const uniformMat = new THREE.MeshStandardMaterial({
    color: uniformColor,
    roughness: 0.72,
    metalness: 0.22,
  });
  bodyMaterials.push(uniformMat);

  // Red tactical armor details to distinguish enemies clearly
  const redAccentHex =
    archetype === 'flanker' ? 0xf97316 : archetype === 'heavy' ? 0xdc2626 : 0xef4444;
  const redAccentMat = new THREE.MeshStandardMaterial({
    color: redAccentHex,
    emissive: redAccentHex,
    emissiveIntensity: 0.28,
    roughness: 0.38,
    metalness: 0.45,
  });
  bodyMaterials.push(redAccentMat);

  const darkGearMat = new THREE.MeshStandardMaterial({
    color: 0x111318,
    roughness: 0.5,
    metalness: 0.55,
  });
  bodyMaterials.push(darkGearMat);

  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xff2a2a,
    emissive: 0xff1e1e,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    metalness: 0.8,
  });

  const tagHitbox = (obj: THREE.Object3D, isHead: boolean) => {
    obj.userData.enemyId = id;
    obj.userData.isHead = isHead;
    hitMeshes.push(obj);
  };

  // Ground contact shadow disc (offset Y = 0.018 to prevent Z-fighting)
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 16),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.018;
  root.add(shadowDisc);

  // 1. Torso Group (Y: 0.75 to 1.42)
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.08, 0);
  bodyPivot.add(torsoGroup);

  const torsoWidth = archetype === 'heavy' ? 0.62 : 0.52;
  const torsoMesh = new THREE.Mesh(
    new THREE.BoxGeometry(torsoWidth, 0.66, 0.32),
    uniformMat,
  );
  torsoMesh.castShadow = !isSoftwareGl;
  torsoGroup.add(torsoMesh);
  tagHitbox(torsoMesh, false);

  // Red tactical chest rig & shoulder stripes
  const chestPlate = new THREE.Mesh(
    new THREE.BoxGeometry(torsoWidth - 0.06, 0.36, 0.35),
    redAccentMat,
  );
  chestPlate.position.set(0, 0.06, 0);
  torsoGroup.add(chestPlate);
  tagHitbox(chestPlate, false);

  // Tactical belt
  const belt = new THREE.Mesh(
    new THREE.BoxGeometry(torsoWidth + 0.02, 0.1, 0.34),
    darkGearMat,
  );
  belt.position.set(0, -0.28, 0);
  torsoGroup.add(belt);

  // 2. Head Group (Y: 1.42 to 1.82)
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.58, 0);
  bodyPivot.add(headGroup);

  const headBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), uniformMat);
  headBox.castShadow = !isSoftwareGl;
  headGroup.add(headBox);
  tagHitbox(headBox, true);

  // Military helmet dome
  const helmet = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.16, 0.38),
    darkGearMat,
  );
  helmet.position.set(0, 0.12, 0);
  headGroup.add(helmet);
  tagHitbox(helmet, true);

  // Crimson combat visor on front (+Z faces forward in local enemy space)
  const visorMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.1, 0.06),
    visorMat,
  );
  visorMesh.position.set(0, 0.02, 0.16);
  headGroup.add(visorMesh);
  tagHitbox(visorMesh, true);

  //Generous invisible headshot sphere for clean, rewarding raycast registration
  const headHitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.44, 0.46),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  headGroup.add(headHitProxy);
  tagHitbox(headHitProxy, true);

  // Generous invisible torso/body raycast proxy
  const bodyHitProxy = new THREE.Mesh(
    new THREE.BoxGeometry(torsoWidth + 0.22, 1.38, 0.52),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  bodyHitProxy.position.set(0, 0.72, 0);
  bodyPivot.add(bodyHitProxy);
  tagHitbox(bodyHitProxy, false);

  // 3. Left & Right Articulated Arms (pivoted at shoulder Y = 1.35)
  const armOffset = torsoWidth * 0.5 + 0.11;

  const createArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * armOffset, 1.35, 0);

    // Red shoulder pauldron
    const pauldron = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.18, 0.24),
      redAccentMat,
    );
    pauldron.position.set(0, -0.04, 0);
    pivot.add(pauldron);
    tagHitbox(pauldron, false);

    // Upper & lower arm
    const armMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.56, 0.17),
      uniformMat,
    );
    armMesh.position.set(0, -0.28, 0.04);
    armMesh.castShadow = !isSoftwareGl;
    pivot.add(armMesh);
    tagHitbox(armMesh, false);

    // Forearm melee gauntlet
    const gauntlet = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.2, 0.22),
      darkGearMat,
    );
    gauntlet.position.set(0, -0.48, 0.08);
    pivot.add(gauntlet);

    bodyPivot.add(pivot);
    return pivot;
  };

  const leftArmPivot = createArm(-1);
  const rightArmPivot = createArm(1);

  // 4. Left & Right Articulated Legs (pivoted at hip Y = 0.75)
  const createLeg = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.75, 0);

    const legMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.62, 0.22),
      uniformMat,
    );
    legMesh.position.set(0, -0.31, 0);
    legMesh.castShadow = !isSoftwareGl;
    pivot.add(legMesh);
    tagHitbox(legMesh, false);

    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.16, 0.28),
      darkGearMat,
    );
    boot.position.set(0, -0.67, 0.03);
    pivot.add(boot);

    bodyPivot.add(pivot);
    return pivot;
  };

  const leftLegPivot = createLeg(-1);
  const rightLegPivot = createLeg(1);

  // 5. Floating 3D Health Bar above Enemy Head
  const hpBarGroup = new THREE.Group();
  hpBarGroup.position.set(0, 2.02, 0);
  root.add(hpBarGroup);

  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.76, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x090b10, side: THREE.DoubleSide }),
  );
  hpBarGroup.add(hpBg);

  const hpBarFill = new THREE.Mesh(
    new THREE.PlaneGeometry(0.72, 0.055),
    new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }),
  );
  hpBarFill.position.z = 0.005;
  hpBarGroup.add(hpBarFill);

  if (archetype === 'heavy') {
    bodyPivot.scale.set(1.12, 1.08, 1.12);
  }

  return {
    root,
    bodyPivot,
    headGroup,
    torsoGroup,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    visorMesh,
    hpBarFill,
    hpBarGroup,
    hitMeshes,
    bodyMaterials,
  };
}

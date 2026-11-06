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
 * Builds the 3D First-Person Low-Poly Tactical Shotgun (12-Gauge Pump-Action, 128-Polygon Budget).
 * Polygon breakdown (128 triangles across the 9 shotgun body meshes; 144 including muzzle flash):
 * - Hexagonal 12-Gauge Bore Barrel (Cylinder 6-seg): 24 tris
 * - Hexagonal Under-Barrel Tubular Magazine (Cylinder 6-seg): 24 tris
 * - 6 Low-Poly Box Components (Heavy Receiver, Crimson Side Shell Saddle, Ribbed Pump Forend [magazineMesh],
 *   Angled Tactical Stock, Pistol Grip, Steel Breech Bolt [boltMesh]): 6 × 12 = 72 tris
 * - Pyramid Amber Front Sight Bead (Cone 4-seg): 8 tris
 * Total Shotgun Weapon Body Polygons = 24 + 24 + 72 + 8 = 128 Polygons (strictly within 100–150 budget).
 */
export function buildShotgunModel(): AssaultRifleRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const receiverMat = new THREE.MeshStandardMaterial({
    color: 0x262b34,
    roughness: 0.35,
    metalness: 0.85,
    flatShading: true,
  });
  const pumpMat = new THREE.MeshStandardMaterial({
    color: 0x7c2d12, // Tactical dark walnut / composite pump & stock
    roughness: 0.65,
    metalness: 0.15,
    flatShading: true,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x161920,
    roughness: 0.28,
    metalness: 0.9,
    flatShading: true,
  });
  const shellRedMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    roughness: 0.4,
    metalness: 0.3,
    flatShading: true,
  });

  // 1. Heavy Faceted Receiver Block (Box = 12 triangles)
  const receiver = new THREE.Mesh(
    new THREE.BoxGeometry(0.076, 0.092, 0.36),
    receiverMat,
  );
  bodyGroup.add(receiver);

  // 2. Low-Poly Side Shell Saddle Pack (Crimson 12-gauge shell rack on left receiver, Box = 12 triangles)
  const shellSaddle = new THREE.Mesh(
    new THREE.BoxGeometry(0.016, 0.058, 0.21),
    shellRedMat,
  );
  shellSaddle.position.set(-0.044, 0.006, -0.01);
  bodyGroup.add(shellSaddle);

  // 3. Hexagonal Top Bore Barrel (6 radial segments = 24 triangles)
  const topBarrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.021, 0.022, 0.56, 6),
    barrelMat,
  );
  topBarrel.rotation.x = Math.PI / 2;
  topBarrel.position.set(0, 0.022, -0.44);
  bodyGroup.add(topBarrel);

  // 4. Hexagonal Under-Barrel Tubular Magazine (6 radial segments = 24 triangles)
  const tubeMag = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.48, 6),
    receiverMat,
  );
  tubeMag.rotation.x = Math.PI / 2;
  tubeMag.position.set(0, -0.018, -0.4);
  bodyGroup.add(tubeMag);

  // 5. Low-Poly Ribbed Forend Pump (`magazineMesh` slides rearward along Z on pump rack & reload, Box = 12 triangles)
  const magazineMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.064, 0.058, 0.24),
    pumpMat,
  );
  magazineMesh.position.set(0, -0.02, -0.34);
  bodyGroup.add(magazineMesh);

  // 6. Angled Low-Poly Combat Stock (Box = 12 triangles)
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.058, 0.105, 0.26),
    pumpMat,
  );
  stock.position.set(0, -0.022, 0.28);
  bodyGroup.add(stock);

  // 7. Faceted Pistol Grip (Box = 12 triangles)
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.048, 0.12, 0.06),
    pumpMat,
  );
  grip.position.set(0, -0.09, 0.12);
  grip.rotation.x = -0.32;
  bodyGroup.add(grip);

  // 8. Reciprocating Steel Breech Bolt (`boltMesh`, Box = 12 triangles)
  const boltMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.028, 0.095),
    barrelMat,
  );
  boltMesh.position.set(0.04, 0.016, -0.02);
  bodyGroup.add(boltMesh);

  // 9. Pyramid Amber Front Bead Sight (4-sided Cone = 8 triangles -> 128 Polygon Weapon Body Total)
  const frontBead = new THREE.Mesh(
    new THREE.ConeGeometry(0.012, 0.026, 4),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
  );
  frontBead.rotation.y = Math.PI / 4;
  frontBead.position.set(0, 0.05, -0.68);
  bodyGroup.add(frontBead);

  // Count weapon body triangles (128) and record on root.userData for verification
  let shotgunTriangleCount = 0;
  bodyGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const geom = (obj as THREE.Mesh).geometry;
      const triCount = geom.index
        ? geom.index.count / 3
        : geom.attributes.position.count / 3;
      shotgunTriangleCount += triCount;
    }
  });
  root.userData.shotgunPolygonCount = shotgunTriangleCount;

  // Low-Poly Volumetric Shotgun Muzzle Blast Octahedrons (2 × 8 = 16 triangles -> 144 total with flash)
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
 * Builds the 3D First-Person Low-Poly .500 Magnum Revolver (200-Polygon Faceted Budget).
 * Polygon breakdown (exact 200 triangles across the 12 revolver meshes):
 * - Octagonal Bull Barrel (Cylinder 8-seg): 32 tris
 * - Hexagonal Ejector Rod Underlug (Cylinder 6-seg): 24 tris
 * - 8-Faceted Revolving Cylinder Drum (Cylinder 8-seg, magazineMesh): 32 tris
 * - 5-Faceted Recoil Shield Dome (Cylinder 5-seg): 20 tris
 * - Pyramid Front Ramp Sight (Cone 4-seg): 8 tris
 * - 7 Low-Poly Box Components (Ventilated Top Rib, Top Strap, Lower Receiver Frame,
 *   Swing-Out Crane Arm, Articulated Hammer Spur [boltMesh], Trigger Guard, Walnut Grip): 7 × 12 = 84 tris
 * Total Revolver Body Polygons = 32 + 24 + 32 + 20 + 8 + 84 = 200 Polygons (Triangles).
 */
export function buildPistolModel(): AssaultRifleRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const chromeSteelMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    roughness: 0.24,
    metalness: 0.92,
    flatShading: true,
  });
  const darkFrameMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.42,
    metalness: 0.78,
    flatShading: true,
  });
  const cylinderSteelMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.28,
    metalness: 0.88,
    flatShading: true,
  });
  const walnutGripMat = new THREE.MeshStandardMaterial({
    color: 0x5c2d16,
    roughness: 0.72,
    metalness: 0.12,
    flatShading: true,
  });
  const sightMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });

  // 1. Octagonal Heavy Bull Barrel (8 radial segments = 32 triangles)
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.019, 0.021, 0.27, 8),
    chromeSteelMat,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.036, -0.175);
  bodyGroup.add(barrel);

  // 2. Hexagonal Full-Length Under-Barrel Ejector Shroud / Counterweight Lug (6 radial segments = 24 triangles)
  const underLug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.016, 0.245, 6),
    darkFrameMat,
  );
  underLug.rotation.x = Math.PI / 2;
  underLug.position.set(0, 0.012, -0.165);
  bodyGroup.add(underLug);

  // 3. Ventilated Top Barrel Rib (Box = 12 triangles)
  const ventRib = new THREE.Mesh(
    new THREE.BoxGeometry(0.022, 0.014, 0.265),
    chromeSteelMat,
  );
  ventRib.position.set(0, 0.054, -0.172);
  bodyGroup.add(ventRib);

  // 4. Revolver Receiver Top Strap over Cylinder Window (Box = 12 triangles)
  const frameTopStrap = new THREE.Mesh(
    new THREE.BoxGeometry(0.038, 0.014, 0.115),
    chromeSteelMat,
  );
  frameTopStrap.position.set(0, 0.056, -0.005);
  bodyGroup.add(frameTopStrap);

  // 5. Lower Revolver Frame & Cylinder Window Base (Box = 12 triangles)
  const frameLower = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.034, 0.145),
    darkFrameMat,
  );
  frameLower.position.set(0, -0.012, 0.005);
  bodyGroup.add(frameLower);

  // 6. Faceted Recoil Shield & Standing Breech (5 radial segments = 20 triangles)
  const recoilShield = new THREE.Mesh(
    new THREE.CylinderGeometry(0.034, 0.034, 0.042, 5),
    darkFrameMat,
  );
  recoilShield.rotation.x = Math.PI / 2;
  recoilShield.position.set(0, 0.022, 0.055);
  bodyGroup.add(recoilShield);

  // 7. 8-Faceted Revolving .500 Magnum Cylinder Drum (8 radial segments = 32 triangles)
  // Assigned to `magazineMesh` so it swings out on reload and indexes/rotates on firing
  const magazineMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, 0.084, 8),
    cylinderSteelMat,
  );
  magazineMesh.rotation.x = Math.PI / 2;
  magazineMesh.position.set(0, 0.02, -0.002);
  bodyGroup.add(magazineMesh);

  // 8. Cylinder Swing-Out Crane Yoke Arm (Box = 12 triangles)
  const cylinderCrane = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.02, 0.088),
    darkFrameMat,
  );
  cylinderCrane.position.set(-0.016, 0.0, -0.042);
  bodyGroup.add(cylinderCrane);

  // 9. Articulated Low-Poly Revolver Hammer Spur (`boltMesh` cocks/kicks on every shot, Box = 12 triangles)
  const boltMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.014, 0.044, 0.038),
    chromeSteelMat,
  );
  boltMesh.position.set(0, 0.048, 0.072);
  boltMesh.rotation.x = -0.35;
  bodyGroup.add(boltMesh);

  // 10. Low-Poly Trigger Guard Loop (Box = 12 triangles)
  const triggerGuard = new THREE.Mesh(
    new THREE.BoxGeometry(0.018, 0.034, 0.072),
    darkFrameMat,
  );
  triggerGuard.position.set(0, -0.042, 0.012);
  bodyGroup.add(triggerGuard);

  // 11. Ergonomic Angled Walnut Revolver Grip (Box = 12 triangles)
  const revolverGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.044, 0.155, 0.068),
    walnutGripMat,
  );
  revolverGrip.position.set(0, -0.095, 0.075);
  revolverGrip.rotation.x = -0.34;
  bodyGroup.add(revolverGrip);

  // 12. Pyramid Front Ramp Sight (4-sided Cone = 8 triangles -> Exact 200 Polygon Total)
  const frontRampSight = new THREE.Mesh(
    new THREE.ConeGeometry(0.011, 0.03, 4),
    sightMat,
  );
  frontRampSight.rotation.y = Math.PI / 4;
  frontRampSight.position.set(0, 0.072, -0.285);
  bodyGroup.add(frontRampSight);

  // Record exact 200-polygon count on rig root for verification
  let revolverTriangleCount = 0;
  bodyGroup.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const geom = (obj as THREE.Mesh).geometry;
      const triCount = geom.index
        ? geom.index.count / 3
        : geom.attributes.position.count / 3;
      revolverTriangleCount += triCount;
    }
  });
  root.userData.revolverPolygonCount = revolverTriangleCount;

  const muzzleFlashGroup = new THREE.Group();
  muzzleFlashGroup.position.set(0, 0.036, -0.32);
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

export interface EnemyModelMetrics {
  archetype: EnemyArchetype;
  characterVisibleTriangles: number;
  characterTriangles: number;
  totalVisibleTriangles: number;
  materialCount: number;
  textureAtlasSize: string;
  textureSize: string;
}

/**
 * Counts actual rendered triangles across all visible Mesh objects in a hierarchy
 * (skips invisible raycast hit proxies where `mesh.visible === false` or `material.visible === false`).
 */
export function countVisibleTriangles(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((obj) => {
    if (!obj.visible) return;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (mat && mat.visible === false) return;
    const geom = mesh.geometry;
    const triCount = geom.index
      ? geom.index.count / 3
      : (geom.attributes.position?.count ?? 0) / 3;
    triangles += triCount;
  });
  return Math.round(triangles);
}

// Shared procedural texture atlas (256x256 for Zoiemre Mini-Boss)
let _bruteAtlasTex256: THREE.Texture | null = null;

function getBruteAtlasTexture256(): THREE.Texture {
  if (_bruteAtlasTex256) return _bruteAtlasTex256;
  if (typeof document === 'undefined') {
    const data = new Uint8Array(256 * 256 * 4);
    const tex = new THREE.DataTexture(data, 256, 256);
    tex.needsUpdate = true;
    _bruteAtlasTex256 = tex;
    return tex;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Base hypertrophic mutated hide (256x256 atlas)
    ctx.fillStyle = '#3b333b';
    ctx.fillRect(0, 0, 256, 256);
    // Upper half: Muscular chest & back sinew contours + dark crimson veins
    ctx.fillStyle = '#4a3b47';
    ctx.fillRect(8, 8, 240, 112);
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 3;
    for (let i = 16; i < 240; i += 28) {
      ctx.beginPath();
      ctx.moveTo(i, 12);
      ctx.lineTo(i + 12, 64);
      ctx.lineTo(i - 6, 116);
      ctx.stroke();
    }
    // Lower half: Heavy armored combat trousers & scarred hide
    ctx.fillStyle = '#1f242d';
    ctx.fillRect(0, 128, 256, 128);
    ctx.fillStyle = '#571b1b';
    ctx.fillRect(16, 140, 224, 24);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  _bruteAtlasTex256 = tex;
  return tex;
}

// Shared Geometry Cache for Zero-GC Enemy Spawning & Instanced Buffer Reuse
let _sharedGeos: Record<string, THREE.BufferGeometry> | null = null;
let _sharedInvisibleMat: THREE.MeshBasicMaterial | null = null;
let _sharedShadowMat: THREE.MeshBasicMaterial | null = null;
let _sharedHpBgMat: THREE.MeshBasicMaterial | null = null;

function getSharedEnemyGeometries(): Record<string, THREE.BufferGeometry> {
  if (_sharedGeos) return _sharedGeos;
  _sharedGeos = {
    // Shared UI / Shadow / Hitbox proxies
    shadowQuad: new THREE.PlaneGeometry(0.95, 0.95, 1, 1), // 2 tris
    shadowHex: new THREE.CircleGeometry(0.88, 6), // 6 tris
    shadowCircle12: new THREE.CircleGeometry(0.62, 12), // 12 tris
    hpBgPlane: new THREE.PlaneGeometry(0.76, 0.09, 1, 1), // 2 tris
    hpFillPlane: new THREE.PlaneGeometry(0.72, 0.055, 1, 1), // 2 tris
    headHitBox: new THREE.BoxGeometry(0.52, 0.5, 0.52),
    bodyHitBoxNormal: new THREE.BoxGeometry(0.72, 1.24, 0.46),
    bodyHitBoxBrute: new THREE.BoxGeometry(0.96, 1.48, 0.62),

    // Zoiemre Mini-Boss Low-Poly Geometries (476 character tris + 10 shadow/UI = 486 total visible tris <= 500)
    brutePelvis: new THREE.CylinderGeometry(0.32, 0.28, 0.24, 8), // 32 tris
    bruteBelt: new THREE.BoxGeometry(0.66, 0.12, 0.44), // 12 tris
    bruteAbdomen: new THREE.CylinderGeometry(0.4, 0.3, 0.36, 8), // 32 tris
    bruteUpperChest: new THREE.CylinderGeometry(0.52, 0.38, 0.48, 8), // 32 tris
    bruteTrapsHump: new THREE.CylinderGeometry(0.34, 0.42, 0.26, 6), // 24 tris
    brutePecPlate: new THREE.BoxGeometry(0.28, 0.24, 0.14), // 12 tris
    bruteSpineCone: new THREE.ConeGeometry(0.075, 0.24, 4), // 8 tris
    bruteCranium: new THREE.CylinderGeometry(0.2, 0.18, 0.28, 8), // 32 tris
    bruteJaw: new THREE.BoxGeometry(0.28, 0.13, 0.26), // 12 tris
    bruteHorn: new THREE.ConeGeometry(0.07, 0.18, 4), // 8 tris
    bruteVisor: new THREE.BoxGeometry(0.28, 0.08, 0.08), // 12 tris
    brutePauldron: new THREE.CylinderGeometry(0.22, 0.18, 0.26, 6), // 24 tris
    bruteShoulderSpike: new THREE.ConeGeometry(0.07, 0.22, 4), // 8 tris
    bruteBicep: new THREE.CylinderGeometry(0.16, 0.14, 0.34, 5), // 20 tris
    bruteForearm: new THREE.CylinderGeometry(0.18, 0.13, 0.38, 5), // 20 tris
    bruteFist: new THREE.BoxGeometry(0.24, 0.22, 0.26), // 12 tris
    bruteThigh: new THREE.CylinderGeometry(0.18, 0.15, 0.38, 5), // 20 tris
    bruteBoot: new THREE.BoxGeometry(0.26, 0.26, 0.34), // 12 tris

    // Standard Normal Zombie ('assault' / 'flanker') & Big Zombie ('heavy') shared boxes
    stdTorso: new THREE.BoxGeometry(0.52, 0.66, 0.32),
    heavyTorso: new THREE.BoxGeometry(0.62, 0.66, 0.32),
    stdChestPlate: new THREE.BoxGeometry(0.46, 0.36, 0.35),
    heavyChestPlate: new THREE.BoxGeometry(0.56, 0.36, 0.35),
    stdBelt: new THREE.BoxGeometry(0.54, 0.1, 0.34),
    heavyBelt: new THREE.BoxGeometry(0.64, 0.1, 0.34),
    stdHead: new THREE.BoxGeometry(0.34, 0.34, 0.34),
    stdHelmet: new THREE.BoxGeometry(0.38, 0.16, 0.38),
    stdVisor: new THREE.BoxGeometry(0.3, 0.1, 0.06),
    stdPauldron: new THREE.BoxGeometry(0.22, 0.18, 0.24),
    stdArm: new THREE.BoxGeometry(0.17, 0.56, 0.17),
    stdGauntlet: new THREE.BoxGeometry(0.19, 0.2, 0.22),
    stdLeg: new THREE.BoxGeometry(0.2, 0.62, 0.22),
    stdBoot: new THREE.BoxGeometry(0.22, 0.16, 0.28),
  };
  return _sharedGeos;
}

/**
 * Builds a 3D Enemy Rig for all 4 archetypes:
 * - 'brute' (Zoiemre Mini-Boss): 476 character triangles (486 total visible with shadow/HP bar), <= 500 budget, 3 materials, 256x256 atlas
 * - 'assault' (Assault Trooper), 'flanker' (Recon Flanker), 'heavy' (Heavy Breacher)
 */
export function buildEnemyModel(
  id: number,
  archetype: EnemyArchetype,
  isSoftwareGl: boolean,
): EnemyRig {
  const geos = getSharedEnemyGeometries();
  if (!_sharedInvisibleMat) {
    _sharedInvisibleMat = new THREE.MeshBasicMaterial({ visible: false });
  }
  if (!_sharedShadowMat) {
    _sharedShadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
  }
  if (!_sharedHpBgMat) {
    _sharedHpBgMat = new THREE.MeshBasicMaterial({ color: 0x090b10, side: THREE.DoubleSide });
  }

  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const hitMeshes: THREE.Object3D[] = [];
  const bodyMaterials: THREE.MeshStandardMaterial[] = [];

  const tagHitbox = (obj: THREE.Object3D, isHead: boolean) => {
    obj.userData.enemyId = id;
    obj.userData.isHead = isHead;
    hitMeshes.push(obj);
  };

  // ============================================================================
  // ZOIEMRE MINI-BOSS ('brute') — Strict <= 500 Triangle Budget
  // Exact Breakdown: 476 character body triangles + 6 shadow + 4 HP bar = 486 visible triangles
  // Materials: 3 (256x256 Muscular Hide Atlas + Dark Carapace Armor + Toxic Bio-Mutation Glow)
  // ============================================================================
  if (archetype === 'brute') {
    const bruteAtlasMat = new THREE.MeshStandardMaterial({
      color: 0xd6c7d2,
      map: getBruteAtlasTexture256(),
      roughness: 0.74,
      metalness: 0.16,
      flatShading: true,
    });
    const bruteArmorMat = new THREE.MeshStandardMaterial({
      color: 0x1e222a,
      roughness: 0.42,
      metalness: 0.68,
      flatShading: true,
    });
    const bruteMutantGlowMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      emissive: 0xe11d48,
      emissiveIntensity: 0.95,
      roughness: 0.28,
      metalness: 0.45,
      flatShading: true,
    });
    bodyMaterials.push(bruteAtlasMat, bruteArmorMat, bruteMutantGlowMat);

    // Ground contact hexagonal boss shadow (6 triangles)
    const shadowHex = new THREE.Mesh(geos.shadowHex, _sharedShadowMat);
    shadowHex.rotation.x = -Math.PI / 2;
    shadowHex.position.y = 0.018;
    root.add(shadowHex);

    // 1. Colossal V-Taper Muscular Torso (32 + 12 + 32 + 32 + 24 + 24 + 24 = 180 triangles)
    const torsoGroup = new THREE.Group();
    torsoGroup.position.set(0, 1.18, 0);
    bodyPivot.add(torsoGroup);

    const pelvis = new THREE.Mesh(geos.brutePelvis, bruteArmorMat);
    pelvis.position.set(0, -0.42, 0);
    torsoGroup.add(pelvis);

    const belt = new THREE.Mesh(geos.bruteBelt, bruteArmorMat);
    belt.position.set(0, -0.32, 0);
    torsoGroup.add(belt);

    const abdomen = new THREE.Mesh(geos.bruteAbdomen, bruteAtlasMat);
    abdomen.position.set(0, -0.12, 0);
    torsoGroup.add(abdomen);

    const upperChest = new THREE.Mesh(geos.bruteUpperChest, bruteAtlasMat);
    upperChest.position.set(0, 0.22, 0.03);
    torsoGroup.add(upperChest);

    const trapsHump = new THREE.Mesh(geos.bruteTrapsHump, bruteAtlasMat);
    trapsHump.position.set(0, 0.48, -0.06);
    torsoGroup.add(trapsHump);

    // Sculpted Left & Right Pectoral Carapace Plates (2 × 12 = 24 triangles)
    [-0.18, 0.18].forEach((px) => {
      const pec = new THREE.Mesh(geos.brutePecPlate, bruteMutantGlowMat);
      pec.position.set(px, 0.24, 0.28);
      torsoGroup.add(pec);
    });

    // 3 Dorsal Mutation Bone Spines (3 × 8 = 24 triangles)
    [0.05, 0.26, 0.46].forEach((sy) => {
      const spine = new THREE.Mesh(geos.bruteSpineCone, bruteArmorMat);
      spine.position.set(0, sy, -0.32);
      spine.rotation.x = -Math.PI * 0.42;
      torsoGroup.add(spine);
    });

    // 2. Mutated Boss Head Group (32 + 12 + 8 + 12 = 64 triangles)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.82, 0.12);
    bodyPivot.add(headGroup);

    const cranium = new THREE.Mesh(geos.bruteCranium, bruteAtlasMat);
    headGroup.add(cranium);

    const heavyJaw = new THREE.Mesh(geos.bruteJaw, bruteArmorMat);
    heavyJaw.position.set(0, -0.12, 0.06);
    headGroup.add(heavyJaw);

    const browHorn = new THREE.Mesh(geos.bruteHorn, bruteMutantGlowMat);
    browHorn.position.set(0.06, 0.19, 0.08);
    browHorn.rotation.z = -0.25;
    headGroup.add(browHorn);

    const visorMesh = new THREE.Mesh(geos.bruteVisor, bruteMutantGlowMat);
    visorMesh.position.set(0, 0.02, 0.18);
    headGroup.add(visorMesh);

    // Simple invisible collision shapes separate from visual mesh (0 rendered triangles)
    const headHitProxy = new THREE.Mesh(geos.headHitBox, _sharedInvisibleMat);
    headGroup.add(headHitProxy);
    tagHitbox(headHitProxy, true);

    const bodyHitProxy = new THREE.Mesh(geos.bodyHitBoxBrute, _sharedInvisibleMat);
    bodyHitProxy.position.set(0, 0.78, 0);
    bodyPivot.add(bodyHitProxy);
    tagHitbox(bodyHitProxy, false);

    // 3. Wide Shoulders & Thick Crusher Arms (2 × (24 + 8 + 20 + 20 + 12) = 168 triangles)
    const createBruteArm = (side: -1 | 1) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.62, 1.54, 0);

      const pauldron = new THREE.Mesh(geos.brutePauldron, bruteArmorMat);
      pauldron.position.set(side * 0.04, 0.04, 0);
      pauldron.rotation.z = -side * 0.28;
      pivot.add(pauldron);

      const spike = new THREE.Mesh(geos.bruteShoulderSpike, bruteMutantGlowMat);
      spike.position.set(side * 0.08, 0.24, 0);
      spike.rotation.z = -side * 0.35;
      pivot.add(spike);

      const bicep = new THREE.Mesh(geos.bruteBicep, bruteAtlasMat);
      bicep.position.set(side * 0.05, -0.22, 0.02);
      pivot.add(bicep);

      const forearm = new THREE.Mesh(geos.bruteForearm, bruteAtlasMat);
      forearm.position.set(side * 0.06, -0.52, 0.12);
      forearm.rotation.x = -0.35;
      pivot.add(forearm);

      const fist = new THREE.Mesh(geos.bruteFist, bruteArmorMat);
      fist.position.set(side * 0.06, -0.74, 0.22);
      pivot.add(fist);

      bodyPivot.add(pivot);
      return pivot;
    };

    const leftArmPivot = createBruteArm(-1);
    const rightArmPivot = createBruteArm(1);

    // 4. Thick Pillar Legs (2 × (20 + 12) = 64 triangles)
    const createBruteLeg = (side: -1 | 1) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.22, 0.76, 0);

      const thigh = new THREE.Mesh(geos.bruteThigh, bruteAtlasMat);
      thigh.position.set(0, -0.24, 0);
      pivot.add(thigh);

      const boot = new THREE.Mesh(geos.bruteBoot, bruteArmorMat);
      boot.position.set(0, -0.62, 0.04);
      pivot.add(boot);

      bodyPivot.add(pivot);
      return pivot;
    };

    const leftLegPivot = createBruteLeg(-1);
    const rightLegPivot = createBruteLeg(1);

    // 5. Floating Boss Health Bar (2 + 2 = 4 triangles)
    const hpBarGroup = new THREE.Group();
    hpBarGroup.position.set(0, 2.34, 0);
    hpBarGroup.scale.set(1.25, 1.25, 1);
    root.add(hpBarGroup);

    const hpBg = new THREE.Mesh(geos.hpBgPlane, _sharedHpBgMat);
    hpBarGroup.add(hpBg);

    const hpBarFill = new THREE.Mesh(
      geos.hpFillPlane,
      new THREE.MeshBasicMaterial({ color: 0xe11d48, side: THREE.DoubleSide }),
    );
    hpBarFill.position.z = 0.005;
    hpBarGroup.add(hpBarFill);

    const charTris = countVisibleTriangles(bodyPivot);
    const totalTris = countVisibleTriangles(root);
    root.userData.enemyArchetype = 'brute';
    root.userData.characterVisibleTriangles = charTris;
    root.userData.totalVisibleTriangles = totalTris;
    root.userData.materialCount = 3;
    root.userData.textureAtlasSize = '256x256';

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

  // ============================================================================
  // EXISTING ENEMIES: Normal Zombie ('assault'), Flanker ('flanker'), Big Zombie ('heavy')
  // Uses shared BufferGeometries to minimize draw calls and memory allocations
  // ============================================================================
  const uniformColor =
    archetype === 'heavy' ? 0x181b22 : archetype === 'flanker' ? 0x222630 : 0x1e232b;
  const uniformMat = new THREE.MeshStandardMaterial({
    color: uniformColor,
    roughness: 0.72,
    metalness: 0.22,
  });
  bodyMaterials.push(uniformMat);

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

  const shadowDisc = new THREE.Mesh(geos.shadowCircle12, _sharedShadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = 0.018;
  root.add(shadowDisc);

  const isHeavy = archetype === 'heavy';
  const torsoWidth = isHeavy ? 0.62 : 0.52;

  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 1.08, 0);
  bodyPivot.add(torsoGroup);

  const torsoMesh = new THREE.Mesh(isHeavy ? geos.heavyTorso : geos.stdTorso, uniformMat);
  torsoMesh.castShadow = !isSoftwareGl;
  torsoGroup.add(torsoMesh);
  tagHitbox(torsoMesh, false);

  const chestPlate = new THREE.Mesh(
    isHeavy ? geos.heavyChestPlate : geos.stdChestPlate,
    redAccentMat,
  );
  chestPlate.position.set(0, 0.06, 0);
  torsoGroup.add(chestPlate);
  tagHitbox(chestPlate, false);

  const belt = new THREE.Mesh(isHeavy ? geos.heavyBelt : geos.stdBelt, darkGearMat);
  belt.position.set(0, -0.28, 0);
  torsoGroup.add(belt);

  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.58, 0);
  bodyPivot.add(headGroup);

  const headBox = new THREE.Mesh(geos.stdHead, uniformMat);
  headBox.castShadow = !isSoftwareGl;
  headGroup.add(headBox);
  tagHitbox(headBox, true);

  const helmet = new THREE.Mesh(geos.stdHelmet, darkGearMat);
  helmet.position.set(0, 0.12, 0);
  headGroup.add(helmet);
  tagHitbox(helmet, true);

  const visorMesh = new THREE.Mesh(geos.stdVisor, visorMat);
  visorMesh.position.set(0, 0.02, 0.16);
  headGroup.add(visorMesh);
  tagHitbox(visorMesh, true);

  const headHitProxy = new THREE.Mesh(geos.headHitBox, _sharedInvisibleMat);
  headHitProxy.position.set(0, 0.02, 0);
  headGroup.add(headHitProxy);
  tagHitbox(headHitProxy, true);

  const bodyHitProxy = new THREE.Mesh(geos.bodyHitBoxNormal, _sharedInvisibleMat);
  bodyHitProxy.position.set(0, 0.65, 0);
  bodyPivot.add(bodyHitProxy);
  tagHitbox(bodyHitProxy, false);

  const armOffset = torsoWidth * 0.5 + 0.11;
  const createArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * armOffset, 1.35, 0);

    const pauldron = new THREE.Mesh(geos.stdPauldron, redAccentMat);
    pauldron.position.set(0, -0.04, 0);
    pivot.add(pauldron);
    tagHitbox(pauldron, false);

    const armMesh = new THREE.Mesh(geos.stdArm, uniformMat);
    armMesh.position.set(0, -0.28, 0.04);
    armMesh.castShadow = !isSoftwareGl;
    pivot.add(armMesh);
    tagHitbox(armMesh, false);

    const gauntlet = new THREE.Mesh(geos.stdGauntlet, darkGearMat);
    gauntlet.position.set(0, -0.48, 0.08);
    pivot.add(gauntlet);

    bodyPivot.add(pivot);
    return pivot;
  };

  const leftArmPivot = createArm(-1);
  const rightArmPivot = createArm(1);

  const createLeg = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.15, 0.75, 0);

    const legMesh = new THREE.Mesh(geos.stdLeg, uniformMat);
    legMesh.position.set(0, -0.31, 0);
    legMesh.castShadow = !isSoftwareGl;
    pivot.add(legMesh);
    tagHitbox(legMesh, false);

    const boot = new THREE.Mesh(geos.stdBoot, darkGearMat);
    boot.position.set(0, -0.67, 0.03);
    pivot.add(boot);

    bodyPivot.add(pivot);
    return pivot;
  };

  const leftLegPivot = createLeg(-1);
  const rightLegPivot = createLeg(1);

  const hpBarGroup = new THREE.Group();
  hpBarGroup.position.set(0, 2.02, 0);
  root.add(hpBarGroup);

  const hpBg = new THREE.Mesh(geos.hpBgPlane, _sharedHpBgMat);
  hpBarGroup.add(hpBg);

  const hpBarFill = new THREE.Mesh(
    geos.hpFillPlane,
    new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }),
  );
  hpBarFill.position.z = 0.005;
  hpBarGroup.add(hpBarFill);

  if (isHeavy) {
    bodyPivot.scale.set(1.12, 1.08, 1.12);
  }

  const charTris = countVisibleTriangles(bodyPivot);
  const totalTris = countVisibleTriangles(root);
  root.userData.enemyArchetype = archetype;
  root.userData.characterVisibleTriangles = charTris;
  root.userData.totalVisibleTriangles = totalTris;
  root.userData.materialCount = 3;
  root.userData.textureAtlasSize = 'procedural-material';

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

export function inspectEnemyModelMetrics(
  archetype: EnemyArchetype,
  isSoftwareGl: boolean = true,
): EnemyModelMetrics {
  const rig = buildEnemyModel(999, archetype, isSoftwareGl);
  const characterVisibleTriangles = Number(rig.root.userData.characterVisibleTriangles ?? 0);
  const totalVisibleTriangles = Number(rig.root.userData.totalVisibleTriangles ?? 0);
  const materialCount = Number(rig.root.userData.materialCount ?? 0);
  const textureAtlasSize = String(rig.root.userData.textureAtlasSize ?? '');
  return {
    archetype,
    characterVisibleTriangles,
    characterTriangles: characterVisibleTriangles,
    totalVisibleTriangles,
    materialCount,
    textureAtlasSize,
    textureSize: textureAtlasSize,
  };
}

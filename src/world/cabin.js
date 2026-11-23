import * as THREE from 'three';
import { getShingleTexture, getSoftDiscTexture } from './textures.js';
import { terrainHeight } from './terrain.js';
import {
  buildRailing,
  buildBrackets,
  buildRubbleChimney,
  createGableWindow,
  addPropModel,
  buildLogPile,
  buildRoofMoss,
  buildTrail,
  mergeStatic,
} from './cabinDetails.js';

const W = 5.2; // 面宽（x）
const D = 4.2; // 进深（z）
const LOG_R = 0.175;
const LOG_STEP = 0.315;
const LOG_ROWS = 7;
const WALL_Y0 = 0.52;
const WALL_TOP = WALL_Y0 + (LOG_ROWS - 1) * LOG_STEP + LOG_R; // ≈ 2.59
const PITCH = THREE.MathUtils.degToRad(31);
const RUN = W / 2 + 0.55; // 檐口外挑后的水平投影
const RISE = RUN * Math.tan(PITCH);
const RIDGE_Y = WALL_TOP + RISE;
const SLOPE_LEN = RUN / Math.cos(PITCH);

function withRepeat(material, rx, ry) {
  const clone = material.clone();
  for (const key of ['map', 'normalMap', 'roughnessMap']) {
    if (!clone[key]) continue;
    clone[key] = clone[key].clone();
    clone[key].repeat.set(rx, ry);
    clone[key].needsUpdate = true;
  }
  return clone;
}

function makeMaterials(surfaces) {
  const shingle = getShingleTexture();

  return {
    log: withRepeat(surfaces.bark, 1, 2),
    plank: withRepeat(surfaces.planks, 4, 1),
    gable: withRepeat(surfaces.planks, 2, 1),
    shingle: new THREE.MeshStandardMaterial({
      map: shingle,
      bumpMap: shingle,
      bumpScale: 0.05,
      roughness: 0.92,
      metalness: 0,
    }),
    stone: withRepeat(surfaces.stone, 2, 1),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x2f2016, roughness: 0.82 }),
    frame: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.78 }),
    door: withRepeat(surfaces.planks, 1, 1),
    glass: new THREE.MeshStandardMaterial({
      color: 0x241206,
      emissive: new THREE.Color(0xff9d4a),
      emissiveIntensity: 2.4,
      roughness: 0.35,
      metalness: 0,
    }),
    lantern: new THREE.MeshStandardMaterial({
      color: 0x2a1a0c,
      emissive: new THREE.Color(0xffb067),
      emissiveIntensity: 3.2,
      roughness: 0.4,
    }),
    interior: new THREE.MeshStandardMaterial({
      color: 0x261811,
      roughness: 1,
      metalness: 0,
      side: THREE.BackSide,
      emissive: new THREE.Color(0x8a3f12),
      emissiveIntensity: 0.35,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xb98a4a,
      roughness: 0.35,
      metalness: 0.85,
    }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.55, metalness: 0.7 }),
    cutWood: new THREE.MeshStandardMaterial({
      map: surfaces.planks.clone().map,
      color: 0xd9b98d,
      roughness: 0.82,
    }),
    stoneCore: new THREE.MeshStandardMaterial({ color: 0x4a443d, roughness: 1 }),
    moss: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 }),
    glowTexture: getSoftDiscTexture(),
  };
}

/** 从区间里挖去洞口，返回该高度上仍然连续的原木段 */
function subtractIntervals(from, to, holes) {
  let segments = [[from, to]];
  for (const hole of holes) {
    const next = [];
    for (const [a, b] of segments) {
      if (hole[1] <= a || hole[0] >= b) {
        next.push([a, b]);
        continue;
      }
      if (hole[0] > a) next.push([a, hole[0]]);
      if (hole[1] < b) next.push([hole[1], b]);
    }
    segments = next;
  }
  return segments.filter(([a, b]) => b - a > 0.12);
}

/**
 * 逐层堆叠原木墙，转角处交叉出挑，并在门窗处按层截断
 */
function buildLogWall(group, material, { axis, fixed, from, to, openings = [], seed = 1 }) {
  const logGeometry = new THREE.CylinderGeometry(LOG_R, LOG_R * 0.97, 1, 10, 1);

  for (let row = 0; row < LOG_ROWS; row++) {
    const y = WALL_Y0 + row * LOG_STEP;
    const holes = openings
      .filter((opening) => y > opening.y0 - LOG_R && y < opening.y1 + LOG_R)
      .map((opening) => [opening.a, opening.b]);

    const segments = subtractIntervals(from, to, holes);

    for (const [a, b] of segments) {
      const atEdgeStart = Math.abs(a - from) < 1e-4;
      const atEdgeEnd = Math.abs(b - to) < 1e-4;
      // 墙端出头，形成木屋转角
      const start = atEdgeStart ? a - 0.4 : a;
      const end = atEdgeEnd ? b + 0.4 : b;
      const length = end - start;
      const mid = (start + end) / 2;
      const jitter = ((row * 37 + seed * 17) % 7) * 0.012;

      const mesh = new THREE.Mesh(logGeometry, material);
      mesh.scale.y = length;
      if (axis === 'x') {
        mesh.rotation.z = Math.PI / 2;
        mesh.position.set(mid, y + jitter, fixed);
      } else {
        mesh.rotation.x = Math.PI / 2;
        mesh.position.set(fixed, y + jitter, mid);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  logGeometry.dispose();
}

function createWindow(materials, width, height, { glowSprite = true } = {}) {
  const group = new THREE.Group();

  const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), materials.glass);
  glass.position.z = 0.01;
  group.add(glass);

  const frameThickness = 0.09;
  const frameDepth = 0.13;

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, frameThickness, frameDepth),
    materials.frame
  );
  top.position.set(0, height / 2 + frameThickness / 2, 0.04);
  group.add(top);

  const bottom = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, 0.12, 0.2),
    materials.frame
  );
  bottom.position.set(0, -height / 2 - 0.06, 0.06);
  group.add(bottom);

  for (const side of [-1, 1]) {
    const jamb = new THREE.Mesh(
      new THREE.BoxGeometry(frameThickness, height + 0.24, frameDepth),
      materials.frame
    );
    jamb.position.set(side * (width / 2 + frameThickness / 2), 0, 0.04);
    group.add(jamb);
  }

  // 十字窗棂
  const mullionV = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, height, 0.05),
    materials.frame
  );
  mullionV.position.z = 0.07;
  group.add(mullionV);

  const mullionH = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.045, 0.05),
    materials.frame
  );
  mullionH.position.z = 0.07;
  group.add(mullionH);

  [...group.children].forEach((child) => {
    child.castShadow = false;
    child.receiveShadow = true;
  });

  let glow = null;
  if (glowSprite) {
    glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getSoftDiscTexture(),
        color: 0xffb168,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
      })
    );
    glow.scale.setScalar(Math.max(width, height) * 2.6);
    glow.position.set(0, 0, 0.35);
    group.add(glow);
  }

  return { group, glow };
}

/** 烟囱青烟：粒子随高度膨胀并淡出 */
function createSmoke(position) {
  const count = 40;
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const offsets = new Float32Array(count);
  const scales = new Float32Array(count);
  const rand = Math.random;

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (rand() - 0.5) * 0.25;
    positions[i * 3 + 1] = 0;
    positions[i * 3 + 2] = (rand() - 0.5) * 0.25;
    speeds[i] = 0.05 + rand() * 0.06;
    offsets[i] = rand();
    scales[i] = 4.5 + rand() * 6;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
  geometry.setAttribute('aOffset', new THREE.BufferAttribute(offsets, 1));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMap: { value: getSoftDiscTexture() },
      uColor: { value: new THREE.Color(0xb0a79c) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aSpeed;
      attribute float aOffset;
      attribute float aScale;
      varying float vAlpha;

      void main() {
        float t = fract(uTime * aSpeed + aOffset);
        vec3 p = position;
        p.y += t * 3.2;
        p.x += t * t * 1.4;
        p.z += sin(t * 6.283 + aOffset * 12.0) * 0.45 * t;
        p.x += sin(t * 3.1 + aOffset * 7.0) * 0.2;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aScale * (0.3 + t * 1.4) * (24.0 / max(-mv.z, 0.1));
        gl_Position = projectionMatrix * mv;
        vAlpha = sin(t * 3.14159) * 0.26;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uColor;
      varying float vAlpha;

      void main() {
        float mask = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(uColor, mask * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const points = new THREE.Points(geometry, material);
  points.position.copy(position);
  points.frustumCulled = false;

  return {
    points,
    update(elapsed) {
      material.uniforms.uTime.value = elapsed;
    },
  };
}

/** 门廊前踏石小径 */
function createPath(group, materials) {
  const stoneGeometry = new THREE.CylinderGeometry(1, 1, 0.16, 7);
  const stoneMaterial = materials.stone.clone();
  stoneMaterial.color.setHex(0xd8cfbe);
  const rand = Math.random;

  for (let i = 0; i < 11; i++) {
    const t = i / 10;
    const z = 5.95 + t * 8.6;
    const x = 0.85 + Math.sin(t * 3.4) * 0.9 + (rand() - 0.5) * 0.5;
    const radius = 0.42 - t * 0.14 + rand() * 0.15;

    const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
    stone.scale.set(radius, 1, radius * (0.8 + rand() * 0.4));
    stone.rotation.y = rand() * Math.PI;
    stone.position.set(x, terrainHeight(x, z) + 0.03, z);
    stone.receiveShadow = true;
    stone.castShadow = true;
    group.add(stone);
  }

  stoneGeometry.dispose();
}

export function createCabin(scene, surfaces, props = {}) {
  const materials = makeMaterials(surfaces);
  const group = new THREE.Group();
  group.name = 'cabin';

  const doorOpening = { a: 0.275, b: 1.425, y0: 0.52, y1: 2.32 };
  const frontWindowOpening = { a: -1.875, b: -0.825, y0: 1.35, y1: 2.2 };
  const sideWindowOpening = { a: -0.65, b: 0.35, y0: 1.35, y1: 2.2 };

  // ---- 石砌地基 ----
  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.55, 0.62, D + 0.55),
    materials.stone
  );
  foundation.position.y = 0.16;
  foundation.castShadow = true;
  foundation.receiveShadow = true;
  group.add(foundation);

  // ---- 室内壳体（防止透视看到穿帮） ----
  const interior = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, 2.2, D - 0.2), materials.interior);
  interior.position.y = 1.33;
  group.add(interior);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.2, D - 0.1), materials.plank);
  floor.position.y = 0.47;
  floor.receiveShadow = true;
  group.add(floor);

  // ---- 四面原木墙 ----
  buildLogWall(group, materials.log, {
    axis: 'x',
    fixed: D / 2,
    from: -W / 2,
    to: W / 2,
    openings: [doorOpening, frontWindowOpening],
    seed: 1,
  });
  buildLogWall(group, materials.log, {
    axis: 'x',
    fixed: -D / 2,
    from: -W / 2,
    to: W / 2,
    seed: 2,
  });
  buildLogWall(group, materials.log, {
    axis: 'z',
    fixed: W / 2,
    from: -D / 2,
    to: D / 2,
    openings: [sideWindowOpening],
    seed: 3,
  });
  buildLogWall(group, materials.log, {
    axis: 'z',
    fixed: -W / 2,
    from: -D / 2,
    to: D / 2,
    seed: 4,
  });

  // ---- 山墙 ----
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-W / 2, 0);
  gableShape.lineTo(W / 2, 0);
  gableShape.lineTo(0, RISE);
  gableShape.closePath();

  const gableGeometry = new THREE.ExtrudeGeometry(gableShape, {
    depth: 0.2,
    bevelEnabled: false,
  });

  for (const side of [1, -1]) {
    const gable = new THREE.Mesh(gableGeometry, materials.gable);
    gable.position.set(0, WALL_TOP, side * (D / 2) - 0.1);
    gable.castShadow = true;
    gable.receiveShadow = true;
    group.add(gable);
  }

  // ---- 双坡屋顶 ----
  for (const side of [1, -1]) {
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(SLOPE_LEN, 0.14, D + 1.15),
      materials.shingle
    );
    panel.position.set((side * RUN) / 2, WALL_TOP + RISE / 2, 0);
    panel.rotation.z = -side * PITCH;
    panel.castShadow = true;
    panel.receiveShadow = true;
    group.add(panel);
  }

  const ridge = new THREE.Mesh(
    new THREE.BoxGeometry(0.26, 0.16, D + 1.2),
    materials.darkWood
  );
  ridge.position.set(0, RIDGE_Y + 0.04, 0);
  ridge.castShadow = true;
  group.add(ridge);

  // ---- 石砌烟囱 ----
  const chimney = buildRubbleChimney(group, materials);

  // ---- 门 ----
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.8, 0.1), materials.door);
  door.name = 'door';
  door.position.set(0.85, 1.42, 2.32);
  door.castShadow = true;
  door.receiveShadow = true;
  group.add(door);

  const battenGeometry = new THREE.BoxGeometry(0.08, 1.68, 0.05);
  for (const offset of [-0.38, 0, 0.38]) {
    const batten = new THREE.Mesh(battenGeometry, materials.darkWood);
    batten.position.set(0.85 + offset, 1.42, 2.38);
    batten.castShadow = true;
    group.add(batten);
  }

  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.28, 0.05), materials.darkWood);
  brace.position.set(0.85, 1.42, 2.385);
  brace.rotation.z = Math.PI / 4;
  brace.castShadow = true;
  group.add(brace);

  const handle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), materials.brass);
  handle.position.set(1.3, 1.36, 2.4);
  group.add(handle);

  // 门板凹槽与铁艺合页
  for (const panelY of [1.08, 1.78]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.025), materials.frame);
    panel.position.set(0.85, panelY, 2.39);
    group.add(panel);
  }
  for (const hingeY of [0.92, 1.86]) {
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.02), materials.iron);
    hinge.position.set(0.52, hingeY, 2.4);
    group.add(hinge);
  }

  // 门框，遮住被截断的原木端面
  const doorFrameParts = [
    { size: [0.14, 1.94, 0.16], pos: [0.2, 1.46, 2.34] },
    { size: [0.14, 1.94, 0.16], pos: [1.5, 1.46, 2.34] },
    { size: [1.44, 0.14, 0.16], pos: [0.85, 2.4, 2.34] },
  ];
  for (const part of doorFrameParts) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), materials.frame);
    mesh.position.set(...part.pos);
    mesh.castShadow = true;
    group.add(mesh);
  }

  // ---- 窗 ----
  const frontWindow = createWindow(materials, 1.05, 0.85);
  frontWindow.group.position.set(-1.35, 1.775, D / 2 + 0.18);
  group.add(frontWindow.group);

  const sideWindow = createWindow(materials, 1.0, 0.85);
  sideWindow.group.position.set(W / 2 + 0.18, 1.775, -0.15);
  sideWindow.group.rotation.y = Math.PI / 2;
  group.add(sideWindow.group);

  // 山墙拱窗
  const gableWindow = createGableWindow(materials, { width: 0.86, rectHeight: 0.72 });
  gableWindow.group.position.set(0, 2.92, D / 2 + 0.12);
  group.add(gableWindow.group);

  // ---- 门廊 ----
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.18, 2.8), materials.plank);
  deck.position.set(0, 0.37, 3.55);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const stepA = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 0.42), materials.plank);
  stepA.position.set(0.85, 0.31, 5.08);
  stepA.castShadow = true;
  stepA.receiveShadow = true;
  group.add(stepA);

  const stepB = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.16, 0.42), materials.plank);
  stepB.position.set(0.85, 0.16, 5.49);
  stepB.castShadow = true;
  stepB.receiveShadow = true;
  group.add(stepB);

  const porchPostGeometry = new THREE.CylinderGeometry(0.14, 0.16, 2.05, 9);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(porchPostGeometry, materials.log);
    post.position.set(side * 2.85, 1.42, 4.78);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
  }

  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.12, 3.0), materials.shingle);
  porchRoof.position.set(0, 2.52, 3.45);
  porchRoof.rotation.x = 0.13;
  porchRoof.castShadow = true;
  porchRoof.receiveShadow = true;
  group.add(porchRoof);

  // 门廊顶棚（木板），避免看到漆黑的底面
  const porchCeiling = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.05, 2.9), materials.plank);
  porchCeiling.position.set(0, 2.43, 3.45);
  porchCeiling.rotation.x = 0.13;
  porchCeiling.receiveShadow = true;
  group.add(porchCeiling);

  const porchBeam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.15, 0.15), materials.frame);
  porchBeam.position.set(0, 2.34, 4.9);
  porchBeam.castShadow = true;
  group.add(porchBeam);

  const porchFascia = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.18, 0.12), materials.darkWood);
  porchFascia.position.set(0, 2.37, 4.94);
  porchFascia.castShadow = true;
  group.add(porchFascia);

  buildRailing(group, materials);
  buildBrackets(group, materials);
  buildLogPile(group, materials);
  buildRoofMoss(group, materials);

  // ---- 门廊家具与灯 ----
  const chairScale = 1.05 / (props.rocking_chair?.height || 1);
  addPropModel(group, props.rocking_chair, {
    position: new THREE.Vector3(-1.55, 0.46, 3.55),
    rotationY: 2.5,
    scale: chairScale,
  });

  const plantHeight = (prepared, target) => target / (prepared?.height || 1);
  addPropModel(group, props.potted_plant_01, {
    position: new THREE.Vector3(-0.38, 0.46, 2.72),
    rotationY: 0.5,
    scale: plantHeight(props.potted_plant_01, 0.85),
  });
  addPropModel(group, props.potted_plant_02, {
    position: new THREE.Vector3(2.52, 0.46, 2.72),
    rotationY: -0.7,
    scale: plantHeight(props.potted_plant_02, 0.7),
  });
  addPropModel(group, props.planter_pot, {
    position: new THREE.Vector3(-2.5, 0.46, 4.58),
    rotationY: 0.2,
    scale: plantHeight(props.planter_pot, 0.42),
  });

  const lanternScale = 0.52 / (props.lantern?.height || 1);
  addPropModel(group, props.lantern, {
    position: new THREE.Vector3(1.3, 1.92, 4.45),
    rotationY: 0.3,
    scale: lanternScale,
  });

  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), materials.iron);
  chain.position.set(1.3, 2.24, 4.45);
  group.add(chain);

  // 灯芯与光晕
  const lanternGlass = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.24, 0.17), materials.lantern);
  lanternGlass.position.set(1.3, 1.95, 4.45);
  group.add(lanternGlass);

  const lanternCore = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), materials.lantern);
  lanternCore.position.set(1.3, 1.9, 4.45);
  group.add(lanternCore);

  const lanternHalo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: materials.glowTexture,
      color: 0xffb06a,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    })
  );
  lanternHalo.scale.setScalar(2.0);
  lanternHalo.position.set(1.3, 1.94, 4.45);
  group.add(lanternHalo);

  // 泥土小径
  const trailMap = surfaces.ground.map.clone();
  trailMap.repeat.set(1, 1);
  trailMap.needsUpdate = true;
  const trailMaterial = new THREE.MeshStandardMaterial({
    map: trailMap,
    color: 0xc3a878,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  buildTrail(group, trailMaterial, 5.75, 16.5);

  createPath(group, materials);

  // ---- 室内外灯火 ----
  const lights = [];
  const addLight = (position, baseIntensity, distance, color = 0xffa054) => {
    const light = new THREE.PointLight(color, baseIntensity, distance, 2);
    light.position.copy(position);
    group.add(light);
    lights.push({ light, baseIntensity });
    return light;
  };

  addLight(new THREE.Vector3(0, 1.9, 0), 8, 9);
  addLight(new THREE.Vector3(-1.35, 1.78, 2.85), 4, 7);
  addLight(new THREE.Vector3(3.25, 1.78, -0.15), 3.5, 6.5);
  addLight(new THREE.Vector3(0.85, 2.0, 3.2), 3.6, 6, 0xffa159);
  addLight(new THREE.Vector3(0, 2.32, 3.6), 3.4, 9, 0xffb070);
  addLight(new THREE.Vector3(1.3, 1.92, 4.45), 8, 10, 0xffb069);
  addLight(new THREE.Vector3(0, 3.35, 2.7), 2.2, 5, 0xffa85e);

  const smoke = createSmoke(chimney.top.clone().add(new THREE.Vector3(0, 0.05, 0)));
  scene.add(smoke.points);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = child.castShadow ?? true;
      child.receiveShadow = true;
    }
  });

  // 静态部件按材质合并，减少 draw call（窗组保留用于点击）
  mergeStatic(group, [frontWindow.group, sideWindow.group, gableWindow.group]);

  scene.add(group);

  // 点击窗灯交互
  const clickTargets = [frontWindow.group, sideWindow.group, gableWindow.group];
  const glows = [frontWindow.glow, sideWindow.glow, gableWindow.glow, lanternHalo].filter(Boolean);

  let lightLevel = 1;
  let targetLevel = 1;
  let lightsOn = true;
  let elapsed = 0;

  return {
    group,
    clickTargets,
    get lightsOn() {
      return lightsOn;
    },
    setLights(on) {
      lightsOn = on;
      targetLevel = on ? 1 : 0;
    },
    toggleLights() {
      lightsOn = !lightsOn;
      targetLevel = lightsOn ? 1 : 0;
      return lightsOn;
    },
    update(dt) {
      elapsed += dt;
      smoke.update(elapsed);

      const k = Math.min(1, dt * 4.5);
      lightLevel += (targetLevel - lightLevel) * k;

      for (const entry of lights) {
        entry.light.intensity = entry.baseIntensity * lightLevel;
      }
      materials.glass.emissiveIntensity = 0.06 + 1.7 * lightLevel;
      materials.lantern.emissiveIntensity = 0.1 + 2.2 * lightLevel;
      for (const glow of glows) {
        glow.material.opacity = 0.04 + 0.26 * lightLevel;
      }
    },
  };
}

import * as THREE from 'three';
import { instantiate, instantiateSplit } from './models.js';
import { terrainHeight } from './terrain.js';

/** 固定种子，保证森林布局可复现 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CAMERA_X = 7.9;
const CAMERA_Z = 12.4;

const TREE_TINTS = [0x7d9163, 0x6b8555, 0x5d7a4e, 0x8a9c70, 0x547046];

// 手工放置的“框景树”：贴近机位与木屋，枝条会压进画面
const HERO_TREES = [
  { x: 8.9, z: 7.2, h: 15.5 },   // 右前景：枝条压住画面右上角
  { x: 2.9, z: 10.9, h: 14.0 },  // 左前景：树干与低枝入画
  { x: 9.3, z: 3.6, h: 17.0 },
  { x: -6.9, z: 5.2, h: 16.5 },
];

export function createForest(scene, assets) {
  const group = new THREE.Group();
  group.name = 'forest';
  scene.add(group);

  const rand = mulberry32(0x5eed2025);
  const meshes = [];
  const stats = { near: 0, mid: 0, far: 0, mature: 0, saplings: 0, props: 0 };

  const inCabin = (x, z) => Math.abs(x) < 6.0 && Math.abs(z) < 6.2;
  const inPath = (x, z) => Math.abs(x) < 2.6 && z > 3.6 && z < 16;
  const nearCamera = (x, z) => Math.hypot(x - CAMERA_X, z - CAMERA_Z) < 8.0;

  // 机位到木屋的视线走廊：不要被整棵树完全挡住（枝条擦边可以）
  function blocksView(x, z) {
    const dx = -CAMERA_X;
    const dz = -CAMERA_Z;
    const len2 = dx * dx + dz * dz;
    const t = ((x - CAMERA_X) * dx + (z - CAMERA_Z) * dz) / len2;
    if (t < 0.08 || t > 0.95) return false;
    const px = CAMERA_X + dx * t;
    const pz = CAMERA_Z + dz * t;
    return Math.hypot(x - px, z - pz) < 2.3;
  }

  const allowed = (x, z) => !inCabin(x, z) && !inPath(x, z) && !nearCamera(x, z) && !blocksView(x, z);

  function tint() {
    const color = new THREE.Color(TREE_TINTS[Math.floor(rand() * TREE_TINTS.length)]);
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    color.setHSL(
      hsl.h + (rand() - 0.5) * 0.03,
      THREE.MathUtils.clamp(hsl.s + (rand() - 0.5) * 0.18, 0.1, 0.7),
      THREE.MathUtils.clamp(hsl.l + (rand() - 0.5) * 0.12, 0.18, 0.8)
    );
    return color;
  }

  function makePlacement(x, z, targetHeight, offset = 0) {
    return {
      position: new THREE.Vector3(x, terrainHeight(x, z) + offset, z),
      rotationY: rand() * Math.PI * 2,
      targetHeight,
      tint: tint(),
    };
  }

  const clusters = [];
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2;
    const r = 14 + rand() * 55;
    clusters.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, spread: 5 + rand() * 9 });
  }

  /** 环形采样，带簇状聚集；允许贴着木屋生长 */
  function samplePoint(minR, maxR, { clustered = 0.55, guard = 60 } = {}) {
    for (let attempt = 0; attempt < guard; attempt++) {
      let x;
      let z;
      if (rand() < clustered) {
        const c = clusters[Math.floor(rand() * clusters.length)];
        const a = rand() * Math.PI * 2;
        const r = Math.pow(rand(), 0.55) * c.spread;
        x = c.x + Math.cos(a) * r;
        z = c.z + Math.sin(a) * r;
      } else {
        const a = rand() * Math.PI * 2;
        const r = minR + Math.sqrt(rand()) * (maxR - minR);
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      const dist = Math.hypot(x, z);
      if (dist < minR * 0.85 || dist > maxR) continue;
      if (allowed(x, z)) return { x, z, dist };
    }
    return null;
  }

  /** 把同一组实例分配给多个变体，避免所有树长得一样 */
  function distribute(variants, placements, options) {
    if (!variants?.length || !placements.length) return;
    const buckets = variants.map(() => []);
    placements.forEach((placement, index) => buckets[index % variants.length].push(placement));

    variants.forEach((variant, index) => {
      const list = buckets[index];
      if (!list.length) return;
      const scaled = list.map((placement) => ({
        ...placement,
        scale: placement.targetHeight / variant.height,
      }));
      meshes.push(
        ...instantiate(variant.entries, scaled, {
          name: options.name,
          castShadow: options.castShadow,
          receiveShadow: true,
          sectors: options.sectors,
        })
      );
    });
  }

  const belowRadius = (list, r) => list.filter((p) => Math.hypot(p.position.x, p.position.z) < r);
  const aboveRadius = (list, r) => list.filter((p) => Math.hypot(p.position.x, p.position.z) >= r);

  // ---------------------------------------------------------------- 分距离 LOD
  // 近景：8~20m，高模，只有最靠近的几棵投阴影
  const close = [];
  for (let i = 0; i < 18; i++) {
    const point = samplePoint(8, 20, { clustered: 0.35 });
    if (point) close.push(makePlacement(point.x, point.z, 9.5 + rand() * 5.5));
  }

  // 紧贴木屋的几棵，让房子被林子包住
  for (const spot of [
    [-7.6, -2.2, 13],
    [7.2, -3.6, 12.5],
    [-5.6, 7.4, 11.5],
    [3.2, -8.4, 14],
  ]) {
    close.push(makePlacement(spot[0], spot[1], spot[2]));
  }

  // 只有最靠近的几棵用最高 LOD，外围立刻降到中模
  distribute(assets.trees.fir_medium.lod0, belowRadius(close, 14), {
    name: 'fir-near',
    castShadow: true,
  });
  distribute(assets.trees.fir_medium.lodmid, aboveRadius(close, 14), {
    name: 'fir-near',
    castShadow: false,
  });
  stats.near += close.length;

  // 中景：18~36m，3 万面
  const mid = [];
  for (let i = 0; i < 40; i++) {
    const point = samplePoint(18, 36, { clustered: 0.55 });
    if (point) mid.push(makePlacement(point.x, point.z, 10 + rand() * 6));
  }
  distribute(assets.trees.fir_medium.lodmid, mid, {
    name: 'fir-mid',
    castShadow: false,
  });
  stats.mid += mid.length;

  // 外圈：34~58m，1 万面
  const outer = [];
  for (let i = 0; i < 46; i++) {
    const point = samplePoint(34, 58, { clustered: 0.65 });
    if (point) outer.push(makePlacement(point.x, point.z, 10 + rand() * 7));
  }
  distribute(assets.trees.fir_medium.lod1, outer, {
    name: 'fir-outer',
    castShadow: false,
  });
  stats.mid += outer.length;

  // 远景：54~120m，4 千面，扇区剔除
  const far = [];
  for (let i = 0; i < 130; i++) {
    const point = samplePoint(54, 120, { clustered: 0.7 });
    if (point) far.push(makePlacement(point.x, point.z, 11 + rand() * 8));
  }
  distribute(assets.trees.fir_medium.lodfar, far, {
    name: 'fir-far',
    castShadow: false,
    sectors: 4,
  });
  stats.far += far.length;

  // 远处树墙：把地平线封住，价格便宜（4 千面）
  const treeline = [];
  for (let i = 0; i < 90; i++) {
    const point = samplePoint(40, 78, { clustered: 0.5 });
    if (point) treeline.push(makePlacement(point.x, point.z, 13 + rand() * 7));
  }
  distribute(assets.trees.fir_medium.lodfar, treeline, {
    name: 'fir-treeline',
    castShadow: false,
    sectors: 4,
  });
  stats.far += treeline.length;

  // 更远的天际线，只在雾里留一层剪影
  const backdrop = [];
  for (let i = 0; i < 50; i++) {
    const point = samplePoint(88, 150, { clustered: 0.4 });
    if (point) backdrop.push(makePlacement(point.x, point.z, 18 + rand() * 8));
  }
  distribute(assets.trees.fir_medium.lodfar, backdrop, {
    name: 'fir-backdrop',
    castShadow: false,
    sectors: 4,
  });
  stats.far += backdrop.length;

  // ---------------------------------------------------------------- 框景 + 成熟杉木
  const hero = HERO_TREES.map(({ x, z, h }) => makePlacement(x, z, h));
  distribute(assets.trees.fir_mature.lod0, hero, {
    name: 'fir-hero',
    castShadow: true,
  });
  stats.mature += hero.length;

  const mature = [];
  for (let i = 0; i < 4; i++) {
    const point = samplePoint(20, 50, { clustered: 0.6 });
    if (point) mature.push(makePlacement(point.x, point.z, 12 + rand() * 4));
  }
  distribute(assets.trees.fir_medium.lodmid, mature, {
    name: 'fir-mature',
    castShadow: false,
  });
  stats.mature += mature.length;

  // ---------------------------------------------------------------- 幼树
  const pineSaplings = [];
  for (let i = 0; i < 24; i++) {
    const point = samplePoint(6.5, 46, { clustered: 0.4 });
    if (point) pineSaplings.push(makePlacement(point.x, point.z, 1.8 + rand() * 2.8));
  }
  distribute(assets.trees.pine_small.lod0, pineSaplings, {
    name: 'pine-sapling',
    castShadow: false,
  });

  const firSaplings = [];
  for (let i = 0; i < 20; i++) {
    const point = samplePoint(6.5, 46, { clustered: 0.4 });
    if (point) firSaplings.push(makePlacement(point.x, point.z, 1.5 + rand() * 2.4));
  }
  distribute(assets.trees.fir_small.lod0, firSaplings, {
    name: 'fir-sapling',
    castShadow: false,
  });
  stats.saplings += pineSaplings.length + firSaplings.length;

  const understory = [];
  for (let i = 0; i < 16; i++) {
    const point = samplePoint(4.5, 18, { clustered: 0.3 });
    if (point) understory.push(makePlacement(point.x, point.z, 2.4 + rand() * 2.2));
  }
  distribute(assets.trees.fir_small.lod0, understory, {
    name: 'fir-understory',
    castShadow: false,
  });

  // 机位两侧的幼树：低矮茂密，正好把枝叶探进画面左右上角
  const foregroundSaplings = [
    makePlacement(2.4, 10.9, 3.6),
    makePlacement(9.7, 6.3, 3.9),
  ];
  distribute(assets.trees.fir_small.lod0, foregroundSaplings, {
    name: 'fir-foreground',
    castShadow: true,
  });

  // ---------------------------------------------------------------- 地被 / 道具
  const propPlacements = (count, minR, maxR, scaleRange, offsetMin = 0, offsetMax = 0) => {
    const list = [];
    for (let i = 0; i < count; i++) {
      const point = samplePoint(minR, maxR, { clustered: 0.25 });
      if (!point) continue;
      const s = scaleRange[0] + rand() * (scaleRange[1] - scaleRange[0]);
      const p = makePlacement(point.x, point.z, s);
      p.scale = s;
      p.position.y += offsetMin + rand() * (offsetMax - offsetMin);
      list.push(p);
    }
    return list;
  };

  const addProps = (name, placements, options = {}) => {
    if (!assets.props[name] || !placements.length) return;
    meshes.push(
      ...instantiateSplit(assets.props[name].entries, placements, {
        name: `prop-${name}`,
        castShadow: options.castShadow ?? false,
        receiveShadow: true,
      })
    );
    stats.props += placements.length;
  };

  addProps('moss_01', propPlacements(90, 3.2, 46, [0.7, 1.7], 0.01, 0.03));
  addProps('fern_02', propPlacements(52, 4, 16, [0.9, 1.7]));
  addProps('grass_medium_01', propPlacements(70, 4, 16, [0.4, 0.8]));
  addProps('fern_02', propPlacements(130, 5, 48, [0.8, 1.6]));
  addProps('grass_medium_01', propPlacements(150, 4, 52, [0.35, 0.75]));
  addProps('shrub_01', propPlacements(22, 7, 48, [0.7, 1.4]), { castShadow: true });
  addProps('shrub_02', propPlacements(18, 7, 48, [0.8, 1.5]), { castShadow: true });
  addProps('rock_moss_set_01', propPlacements(24, 5, 56, [0.5, 2.2], -0.05, 0.02), { castShadow: true });
  addProps('rock_moss_set_02', propPlacements(20, 5, 56, [0.5, 2.1], -0.05, 0.02), { castShadow: true });
  addProps('tree_stump_01', propPlacements(8, 8, 44, [0.8, 1.5], -0.02, 0), { castShadow: true });
  addProps('dead_tree_trunk', propPlacements(6, 9, 46, [0.9, 1.6]), { castShadow: true });
  addProps('dead_tree_trunk_02', propPlacements(6, 9, 46, [0.9, 1.6]), { castShadow: true });
  addProps('pine_roots', propPlacements(12, 8, 42, [0.8, 1.5], 0, 0.04), { castShadow: true });
  addProps('dry_branches_medium_01', propPlacements(26, 5, 46, [0.8, 1.6], 0, 0.02));

  meshes.forEach((mesh) => group.add(mesh));

  return { group, meshes, stats };
}

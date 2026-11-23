import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { terrainHeight } from './terrain.js';

/** 小范围可复现随机 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DECK_Y = 0.46;
const PORCH_FRONT = 4.9;
const PORCH_HALF = 2.85;

/** 门廊栏杆：上下横杆 + 栏杆柱 + 端柱 */
export function buildRailing(group, materials) {
  const segments = [
    { a: new THREE.Vector2(-PORCH_HALF, PORCH_FRONT), b: new THREE.Vector2(-0.45, PORCH_FRONT) },
    { a: new THREE.Vector2(2.15, PORCH_FRONT), b: new THREE.Vector2(PORCH_HALF, PORCH_FRONT) },
    { a: new THREE.Vector2(-PORCH_HALF, 2.55), b: new THREE.Vector2(-PORCH_HALF, PORCH_FRONT) },
    { a: new THREE.Vector2(PORCH_HALF, 2.55), b: new THREE.Vector2(PORCH_HALF, PORCH_FRONT) },
  ];

  const railGeo = new THREE.BoxGeometry(1, 0.075, 0.075);
  const postGeo = new THREE.BoxGeometry(0.13, 1.06, 0.13);
  const balusterGeo = new THREE.BoxGeometry(0.045, 0.78, 0.045);
  const balusters = [];

  for (const { a, b } of segments) {
    const length = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const horizontal = Math.abs(a.y - b.y) < 1e-4;
    const rotY = horizontal ? 0 : Math.PI / 2;

    for (const y of [1.39, 0.63]) {
      const rail = new THREE.Mesh(railGeo, materials.frame);
      rail.position.set(mid.x, y + DECK_Y, mid.y);
      rail.rotation.y = rotY;
      rail.scale.x = length;
      rail.castShadow = false;
      rail.receiveShadow = true;
      group.add(rail);
    }

    const count = Math.max(2, Math.round(length / 0.28));
    for (let i = 1; i < count; i++) {
      const t = i / count;
      balusters.push({
        x: a.x + (b.x - a.x) * t,
        z: a.y + (b.y - a.y) * t,
      });
    }

    // 端柱
    for (const end of [a, b]) {
      const post = new THREE.Mesh(postGeo, materials.frame);
      post.position.set(end.x, DECK_Y + 0.53, end.y);
      post.castShadow = false;
      post.receiveShadow = true;
      group.add(post);
    }
  }

  const instanced = new THREE.InstancedMesh(balusterGeo, materials.frame, balusters.length);
  const matrix = new THREE.Matrix4();
  balusters.forEach((b, i) => {
    matrix.makeTranslation(b.x, DECK_Y + 0.51, b.z);
    instanced.setMatrixAt(i, matrix);
  });
  instanced.instanceMatrix.needsUpdate = true;
  instanced.castShadow = false;
  instanced.receiveShadow = true;
  group.add(instanced);
}

/** 斜撑：柱与檐梁之间 */
export function buildBrackets(group, materials) {
  for (const side of [-1, 1]) {
    for (const dir of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.08), materials.frame);
      brace.position.set(side * PORCH_HALF, 2.0, PORCH_FRONT + dir * 0.22);
      brace.rotation.x = dir * 0.72;
      brace.castShadow = false;
      group.add(brace);
    }
  }
}

/** 石砌烟囱：锥形砌体 + 少量凸出毛石 + 石帽 */
export function buildRubbleChimney(group, materials) {
  const x = 3.0;
  const z = -0.5;
  const baseY = 0.04;
  const height = 4.28;
  const rand = rng(0xc0ffee);

  const stoneMat = materials.stone.clone();
  for (const key of ['map', 'normalMap']) {
    if (!stoneMat[key]) continue;
    stoneMat[key] = stoneMat[key].clone();
    stoneMat[key].repeat.set(1.4, 2.6);
    stoneMat[key].needsUpdate = true;
  }

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.62, 1.14), materials.stone);
  plinth.position.set(x, 0.31, z);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  const shaftHeight = height - 0.5;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.56, shaftHeight, 4, 1), stoneMat);
  shaft.rotation.y = Math.PI / 4;
  shaft.position.set(x, 0.5 + shaftHeight / 2, z);
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  // 少数凸出的毛石，打破光滑轮廓
  const bumps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), materials.stone, 34);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < 34; i++) {
    const y = 0.75 + rand() * (shaftHeight - 0.3);
    const side = Math.floor(rand() * 4);
    const angle = (side * Math.PI) / 2 + Math.PI / 4;
    const r = 0.5 + rand() * 0.04;
    pos.set(x + Math.cos(angle) * r, y, z + Math.sin(angle) * r);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
    scale.set(0.22 + rand() * 0.2, 0.1 + rand() * 0.09, 0.1 + rand() * 0.08);
    matrix.compose(pos, quat, scale);
    bumps.setMatrixAt(i, matrix);
    color.setScalar(0.55 + rand() * 0.35);
    bumps.setColorAt(i, color);
  }
  bumps.instanceMatrix.needsUpdate = true;
  if (bumps.instanceColor) bumps.instanceColor.needsUpdate = true;
  bumps.castShadow = true;
  group.add(bumps);

  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 1.0), materials.stone);
  cap.position.set(x, height + 0.02, z);
  cap.castShadow = true;
  group.add(cap);

  const crown = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.2, 0.58), stoneMat);
  crown.position.set(x, height + 0.16, z);
  crown.castShadow = true;
  group.add(crown);

  const hole = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.05, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x080605, roughness: 1 })
  );
  hole.position.set(x, height + 0.27, z);
  group.add(hole);

  return { top: new THREE.Vector3(x, height + 0.32, z), center: new THREE.Vector3(x, height * 0.55, z) };
}

/** 山墙上的拱形窗 */
export function createGableWindow(materials, { width = 0.86, rectHeight = 0.72 } = {}) {
  const radius = width / 2;
  const group = new THREE.Group();

  const inner = new THREE.Shape();
  inner.moveTo(-radius, 0);
  inner.lineTo(radius, 0);
  inner.lineTo(radius, rectHeight);
  inner.absarc(0, rectHeight, radius, 0, Math.PI, false);
  inner.lineTo(-radius, 0);

  const outer = new THREE.Shape();
  const o = 0.09;
  outer.moveTo(-radius - o, -o);
  outer.lineTo(radius + o, -o);
  outer.lineTo(radius + o, rectHeight);
  outer.absarc(0, rectHeight, radius + o, 0, Math.PI, false);
  outer.lineTo(-radius - o, -o);
  outer.holes.push(inner);

  const frameGeo = new THREE.ExtrudeGeometry(outer, { depth: 0.12, bevelEnabled: false, curveSegments: 24 });
  const frame = new THREE.Mesh(frameGeo, materials.frame);
  frame.castShadow = false;
  frame.receiveShadow = true;
  group.add(frame);

  const glassGeo = new THREE.ShapeGeometry(inner, 24);
  const glass = new THREE.Mesh(glassGeo, materials.glass);
  glass.position.z = 0.03;
  group.add(glass);

  const barV = new THREE.Mesh(new THREE.BoxGeometry(0.035, rectHeight + radius, 0.04), materials.frame);
  barV.position.set(0, (rectHeight + radius) / 2, 0.11);
  group.add(barV);

  const barH = new THREE.Mesh(new THREE.BoxGeometry(width, 0.035, 0.04), materials.frame);
  barH.position.set(0, rectHeight * 0.78, 0.11);
  group.add(barH);

  const sill = new THREE.Mesh(new THREE.BoxGeometry(width + 0.34, 0.08, 0.26), materials.frame);
  sill.position.set(0, -0.06, 0.1);
  sill.castShadow = false;
  group.add(sill);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: materials.glowTexture,
      color: 0xffb168,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    })
  );
  glow.scale.setScalar(1.5);
  glow.position.set(0, rectHeight * 0.5, 0.4);
  group.add(glow);

  return { group, glow };
}

/** 把加载好的道具模型放到指定位置（静态网格，不走实例化） */
export function addPropModel(parent, prepared, { position, rotationY = 0, scale = 1 }) {
  if (!prepared) return null;
  const holderMatrix = new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY),
    new THREE.Vector3(scale, scale, scale)
  );

  for (const entry of prepared.entries) {
    const mesh = new THREE.Mesh(entry.geometry, entry.material);
    mesh.matrix.copy(holderMatrix).multiply(entry.matrixWorld);
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    parent.add(mesh);
  }

  return true;
}

/** 门廊边的柴堆 */
export function buildLogPile(group, materials) {
  const base = new THREE.Vector3(-2.3, DECK_Y, 4.2);
  const rand = rng(0xbeef);
  const logGeo = new THREE.CylinderGeometry(0.115, 0.12, 0.92, 10);
  const endGeo = new THREE.CircleGeometry(0.115, 10);

  const rows = [
    { y: 0.12, xs: [-0.27, 0, 0.27] },
    { y: 0.34, xs: [-0.14, 0.14] },
    { y: 0.54, xs: [0] },
  ];

  for (const row of rows) {
    for (const dx of row.xs) {
      const log = new THREE.Mesh(logGeo, materials.log);
      log.rotation.x = Math.PI / 2;
      log.position.set(base.x + dx + (rand() - 0.5) * 0.03, base.y + row.y, base.z);
      log.castShadow = false;
      log.receiveShadow = true;
      group.add(log);

      const end = new THREE.Mesh(endGeo, materials.cutWood);
      end.position.set(log.position.x, log.position.y, base.z + 0.47);
      group.add(end);
    }
  }
}

/** 屋檐与屋脊上的青苔簇 */
export function buildRoofMoss(group, materials) {
  const rand = rng(0x51a7);
  const count = 90;
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geo, materials.moss, count);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  const pitchTan = Math.tan(THREE.MathUtils.degToRad(31));
  for (let i = 0; i < count; i++) {
    const onRidge = false;
    let x;
    let y;
    let z;
    if (onRidge) {
      x = (rand() - 0.5) * 0.36;
      y = 4.53;
      z = -2.5 + rand() * 5.0;
    } else {
      const side = rand() > 0.5 ? 1 : -1;
      // 越靠檐口越密，贴着瓦面
      const edge = Math.pow(rand(), 0.4);
      x = side * (2.15 + edge * 0.98);
      const roofY = 4.48 - Math.abs(x) * pitchTan;
      y = roofY + 0.05;
      z = -2.55 + rand() * 5.1;
    }
    pos.set(x, y, z);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    const s = 0.06 + rand() * 0.12;
    scale.set(s, s * 0.42, s * (0.8 + rand() * 0.6));
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(i, matrix);
    color.setHSL(0.24 + rand() * 0.06, 0.22 + rand() * 0.16, 0.07 + rand() * 0.07);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
}

/** 门前土径：用重叠的泥土地块铺出一条自然小径 */
export function buildTrail(group, material, fromZ = 5.3, toZ = 15.5) {
  const rand = rng(0x7a11);
  const count = 70;
  const geo = new THREE.CircleGeometry(1, 12);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.InstancedMesh(geo, material, count);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const z = fromZ + t * (toZ - fromZ);
    const x = 0.85 + Math.sin(t * 3.2) * 0.75 + (rand() - 0.5) * 0.7;
    const r = 0.55 + rand() * 0.45;
    pos.set(x, terrainHeight(x, z) + 0.02, z);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
    scale.set(r, 1, r * (0.7 + rand() * 0.5));
    matrix.compose(pos, quat, scale);
    mesh.setMatrixAt(i, matrix);
    color.setHSL(0.09 + rand() * 0.03, 0.2 + rand() * 0.1, 0.22 + rand() * 0.08);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.receiveShadow = false;
  group.add(mesh);
}


/**
 * 把木屋里的静态网格按材质合并，显著减少 draw call。
 * 需要保留交互的窗组通过 exclude 传入，不参与合并。
 */
export function mergeStatic(group, exclude = []) {
  group.updateMatrixWorld(true);
  const excluded = new Set();
  for (const root of exclude) root.traverse((o) => excluded.add(o));

  const buckets = new Map();
  const meshes = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (excluded.has(o)) return;
    meshes.push(o);
  });

  for (const mesh of meshes) {
    const key = mesh.material.uuid;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(mesh);
  }

  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geometries = [];
    let cast = false;
    let receive = true;
    for (const mesh of list) {
      const geo = mesh.geometry.clone();
      geo.applyMatrix4(mesh.matrixWorld);
      // 统一属性集合，避免合并失败
      for (const name of Object.keys(geo.attributes)) {
        if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      }
      if (!geo.attributes.uv) {
        const count = geo.attributes.position.count;
        geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      geometries.push(geo);
      cast = cast || mesh.castShadow;
      receive = receive || mesh.receiveShadow;
    }

    let merged = null;
    try {
      merged = mergeGeometries(geometries, false);
    } catch (error) {
      merged = null;
    }
    if (!merged) {
      geometries.forEach((g) => g.dispose());
      continue;
    }

    const target = new THREE.Mesh(merged, list[0].material);
    target.castShadow = cast;
    target.receiveShadow = receive;
    group.add(target);
    for (const mesh of list) mesh.parent?.remove(mesh);
    geometries.forEach((g) => g.dispose());
  }
}

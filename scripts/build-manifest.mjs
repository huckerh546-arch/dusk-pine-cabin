// 扫描处理好的 glTF，生成运行时清单（含高度、面数、来源、授权）
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MODELS = path.join(ROOT, 'public', 'assets', 'models');
const TREES = path.join(MODELS, 'trees');
const PROPS = path.join(MODELS, 'props');

const COMPONENT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const NUM_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

function accessorFloats(gltf, index) {
  const acc = gltf.accessors[index];
  return { count: acc.count, type: acc.type, min: acc.min, max: acc.max };
}

function nodeMatrix(node) {
  if (node.matrix) return node.matrix;
  const t = node.translation ?? [0, 0, 0];
  const r = node.rotation ?? [0, 0, 0, 1];
  const s = node.scale ?? [1, 1, 1];
  // 只处理无旋转/等比缩放的情况（Poly Haven 导出满足）
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function apply(m, v) {
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

async function analyzeTree(filename) {
  const file = path.join(TREES, filename);
  const text = await readFile(file, 'utf8');
  const gltf = JSON.parse(text);

  let tris = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];

  const walk = (nodeIndex, parentMatrix) => {
    const node = gltf.nodes[nodeIndex];
    const local = nodeMatrix(node);
    // 行优先 4x4 乘法
    const world = parentMatrix ? matMul(parentMatrix, local) : local;

    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh].primitives) {
        const idx = gltf.accessors[prim.indices];
        if (idx) tris += idx.count / 3;
      }
      const mesh = gltf.meshes[node.mesh];
      for (const prim of mesh.primitives) {
        const pos = accessorFloats(gltf, prim.attributes.POSITION);
        if (!pos.min || !pos.max) continue;
        for (const corner of [
          [pos.min[0], pos.min[1], pos.min[2]],
          [pos.max[0], pos.min[1], pos.min[2]],
          [pos.min[0], pos.max[1], pos.min[2]],
          [pos.max[0], pos.max[1], pos.min[2]],
          [pos.min[0], pos.min[1], pos.max[2]],
          [pos.max[0], pos.min[1], pos.max[2]],
          [pos.min[0], pos.max[1], pos.max[2]],
          [pos.max[0], pos.max[1], pos.max[2]],
        ]) {
          const p = apply(world, corner);
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], p[k]);
            max[k] = Math.max(max[k], p[k]);
          }
        }
      }
    }

    for (const child of node.children ?? []) walk(child, world);
  };

  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const nodeIndex of gltf.scenes[gltf.scene ?? 0].nodes) walk(nodeIndex, identity);

  return {
    url: `trees/${filename}`,
    tris: Math.round(tris),
    height: Number((max[1] - min[1]).toFixed(2)),
    sizeKB: Math.round((await readFile(file)).length / 1024),
  };
}

function matMul(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      out[r * 4 + c] =
        a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + a[r * 4 + 3] * b[12 + c];
    }
  }
  return out;
}

const treeFiles = (await readdir(TREES)).filter((f) => f.endsWith('.gltf')).sort();
const propFiles = (await readdir(PROPS)).filter((f) => f.endsWith('.glb')).sort();

const trees = {};
for (const file of treeFiles) {
  const info = await analyzeTree(file);
  const match = file.match(/^(.+)_([a-z])_(lod[a-z0-9]+)\.gltf$/);
  if (!match) continue;
  const [, prefix, letter, lod] = match;
  trees[prefix] ??= { variants: 0, lods: {}, license: 'CC0', source: 'https://polyhaven.com/a/' + prefix.replace(/_(lod\d|medium|small|mature)$/g, '') };
  trees[prefix].variants++;
  trees[prefix].lods[lod] ??= [];
  trees[prefix].lods[lod].push(info);
}
for (const entry of Object.values(trees)) {
  for (const lod of Object.keys(entry.lods)) entry.lods[lod].sort((a, b) => a.url.localeCompare(b.url));
}

const props = {};
for (const file of propFiles) props[file.replace(/\.glb$/, '')] = `props/${file}`;

const manifest = {
  generatedAt: new Date().toISOString(),
  license: 'CC0-1.0',
  attribution: 'Models and textures by Poly Haven (polyhaven.com), licensed CC0.',
  trees,
  props,
};

await writeFile(path.join(MODELS, 'manifest.json'), JSON.stringify(manifest, null, 2));
const treeTris = Object.values(trees)
  .flatMap((t) => Object.values(t.lods).flat())
  .reduce((a, b) => a + b.tris, 0);
console.log('trees:', Object.keys(trees).join(', '));
console.log('tree gltf total tris:', treeTris, 'props:', propFiles.length);
console.log('written', path.join(MODELS, 'manifest.json'));

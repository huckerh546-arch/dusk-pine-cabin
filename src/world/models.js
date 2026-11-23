import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

/**
 * Poly Haven CC0 素材加载与实例化工具。
 *
 * 树木的 glTF 由 Blender 预处理过：3 个变体、两级 LOD、Draco 压缩、1k 贴图，
 * 不同变体共享同一套贴图，所以这里统一走 GLTFLoader 的缓存。
 */

const FOLIAGE_RE = /twig|leaf|leaves|needle|foliage|frond|grass|fern/i;

export function createModels() {
  const draco = new DRACOLoader();
  draco.setDecoderPath('/draco/');

  const manager = new THREE.LoadingManager();
  const loader = new GLTFLoader(manager);
  loader.setDRACOLoader(draco);
  loader.setPath('/assets/models/');

  let onProgress = null;
  manager.onProgress = (_url, loaded, total) => {
    onProgress?.({ loaded, total, ratio: total ? loaded / total : 0 });
  };

  const cache = new Map();

  async function load(url) {
    if (cache.has(url)) return cache.get(url);
    const promise = loader.loadAsync(url);
    cache.set(url, promise);
    return promise;
  }

  return {
    setProgressHandler(handler) {
      onProgress = handler;
    },
    /**
     * 加载一棵树的所有 LOD / 变体，返回可直接实例化的网格条目
     */
    async loadTrees(manifest) {
      const groups = {};
      for (const [name, entry] of Object.entries(manifest.trees)) {
        groups[name] = {};
        for (const [lod, urls] of Object.entries(entry.lods)) {
          const models = await Promise.all(urls.map((entry) => load(entry.url)));
          groups[name][lod] = models.map((gltf) => prepareModel(gltf.scene));
        }
      }
      return groups;
    },
    async loadProps(manifest) {
      const props = {};
      await Promise.all(
        Object.entries(manifest.props).map(async ([name, url]) => {
          try {
            const gltf = await load(url);
            props[name] = prepareModel(gltf.scene);
          } catch (error) {
            console.warn(`[models] 跳过无法加载的素材 ${name}`, error);
          }
        })
      );
      return props;
    },
    dispose() {
      draco.dispose();
    },
  };
}

/** 规范化模型：修正材质、预计算每个子网格的变换与包围盒 */
function prepareModel(root) {
  root.updateMatrixWorld(true);

  const entries = [];
  const bounds = new THREE.Box3();

  root.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.geometry?.attributes?.position) return;

    const material = tuneMaterial(child.material);
    child.material = material;

    const geometry = child.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const box = geometry.boundingBox.clone().applyMatrix4(child.matrixWorld);
    bounds.union(box);

    entries.push({
      geometry,
      material,
      matrixWorld: child.matrixWorld.clone(),
      name: child.name,
    });
  });

  const size = new THREE.Vector3();
  bounds.getSize(size);

  return {
    entries,
    bounds,
    height: size.y,
    width: Math.max(size.x, size.z),
  };
}

function tuneMaterial(material) {
  const shared = material;
  const isFoliage = FOLIAGE_RE.test(shared.name || '');

  // 玻璃类材质如果开着 transmission，Three 会为整帧额外渲染一次透射 pass；
  // 这个场景不需要真实折射，直接退化为不透明/自发光，省掉一整趟场景绘制。
  if (shared.transmission > 0) {
    shared.transmission = 0;
    shared.transparent = false;
    shared.opacity = 1;
  }

  if (shared.map) {
    shared.map.anisotropy = 8;
    shared.map.colorSpace = THREE.SRGBColorSpace;
  }
  if (shared.normalMap) shared.normalMap.anisotropy = 4;

  // 半透明面片改成 alpha test：避免排序错误，同时能投出正确阴影
  if (shared.transparent || isFoliage) {
    shared.transparent = false;
    shared.depthWrite = true;
    shared.alphaTest = shared.alphaTest && shared.alphaTest > 0 ? shared.alphaTest : 0.38;
    shared.side = THREE.DoubleSide;
  }

  if (isFoliage) {
    shared.shadowSide = THREE.DoubleSide;
    shared.roughness = Math.min(1, (shared.roughness ?? 1) * 1.05);
  }

  shared.envMapIntensity = 0.65;
  shared.needsUpdate = true;
  return shared;
}

const scratchMatrix = new THREE.Matrix4();
const scratchQuat = new THREE.Quaternion();
const scratchScale = new THREE.Vector3();
const scratchPos = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

/**
 * 把同一棵树的各个子网格实例化。
 * placements: [{ position, rotationY, scale, tint }]
 */
export function instantiate(entries, placements, { castShadow = true, receiveShadow = true, sectors = 1, name = 'instanced' } = {}) {
  if (!placements.length || !entries.length) return [];

  const groups = sectors > 1 ? splitBySector(placements, sectors) : [placements];
  const result = [];

  groups.forEach((group, groupIndex) => {
    if (!group.length) return;

    entries.forEach((entry, entryIndex) => {
      const mesh = new THREE.InstancedMesh(entry.geometry, entry.material, group.length);
      mesh.name = `${name}_${groupIndex}_${entryIndex}`;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.frustumCulled = true;

      group.forEach((placement, index) => {
        scratchPos.copy(placement.position);
        scratchQuat.setFromAxisAngle(up, placement.rotationY ?? 0);
        const s = placement.scale ?? 1;
        scratchScale.set(s, s, s);
        scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
        scratchMatrix.multiply(entry.matrixWorld);
        mesh.setMatrixAt(index, scratchMatrix);
        if (placement.tint) mesh.setColorAt(index, placement.tint);
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

      result.push(mesh);
    });
  });

  return result;
}

/**
 * 多对象素材（例如苔藓、乱石堆）按实例随机挑一个子网格，避免整组重复。
 */
export function instantiateSplit(entries, placements, { castShadow = false, receiveShadow = true, name = 'prop' } = {}) {
  if (!placements.length || !entries.length) return [];

  const buckets = entries.map(() => []);
  placements.forEach((placement) => {
    const index = Math.floor(Math.random() * entries.length);
    buckets[index].push(placement);
  });

  const result = [];
  buckets.forEach((group, entryIndex) => {
    if (!group.length) return;
    const entry = entries[entryIndex];
    const mesh = new THREE.InstancedMesh(entry.geometry, entry.material, group.length);
    mesh.name = `${name}_${entryIndex}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = receiveShadow;

    group.forEach((placement, index) => {
      scratchPos.copy(placement.position);
      scratchQuat.setFromAxisAngle(up, placement.rotationY ?? 0);
      const s = placement.scale ?? 1;
      scratchScale.set(s, s, s);
      scratchMatrix.compose(scratchPos, scratchQuat, scratchScale);
      scratchMatrix.multiply(entry.matrixWorld);
      mesh.setMatrixAt(index, scratchMatrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
    result.push(mesh);
  });

  return result;
}

/** 按方位角把实例切成若干扇区，让视锥剔除真正生效 */
function splitBySector(placements, sectors) {
  const buckets = Array.from({ length: sectors }, () => []);
  for (const placement of placements) {
    const angle = Math.atan2(placement.position.x, placement.position.z);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    const index = Math.min(sectors - 1, Math.floor((normalized / (Math.PI * 2)) * sectors));
    buckets[index].push(placement);
  }
  return buckets;
}

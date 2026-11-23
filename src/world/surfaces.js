import * as THREE from 'three';

/** 加载 Poly Haven CC0 的 PBR 贴图，组装地面 / 木屋材质 */
const loader = new THREE.TextureLoader();
const cache = new Map();

function texture(url, { srgb = false, repeat = [1, 1] } = {}) {
  const key = `${url}|${srgb}|${repeat.join(',')}`;
  if (cache.has(key)) return cache.get(key);

  const promise = loader.loadAsync(url).then((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  });

  cache.set(key, promise);
  return promise;
}

export async function loadSurfaces() {
  const base = '/assets/textures/';

  const [groundDiff, groundNor, groundRough] = await Promise.all([
    texture(base + 'forrest_ground_03_diff_1k.jpg', { srgb: true, repeat: [48, 48] }),
    texture(base + 'forrest_ground_03_nor_1k.jpg', { repeat: [48, 48] }),
    texture(base + 'forrest_ground_03_rough_1k.jpg', { repeat: [48, 48] }),
  ]);

  const [barkDiff, barkNor, plankDiff, plankNor, stoneDiff, stoneNor] = await Promise.all([
    texture(base + 'bark_brown_02_diff_1k.jpg', { srgb: true, repeat: [1, 2] }),
    texture(base + 'bark_brown_02_nor_1k.jpg', { repeat: [1, 2] }),
    texture(base + 'dark_planks_diff_1k.jpg', { srgb: true, repeat: [1, 1] }),
    texture(base + 'dark_planks_nor_1k.jpg', { repeat: [1, 1] }),
    texture(base + 'mossy_stone_wall_diff_1k.jpg', { srgb: true, repeat: [1, 2] }),
    texture(base + 'mossy_stone_wall_nor_1k.jpg', { repeat: [1, 2] }),
  ]);

  const ground = new THREE.MeshStandardMaterial({
    map: groundDiff,
    normalMap: groundNor,
    roughnessMap: groundRough,
    roughness: 1,
    metalness: 0,
    color: 0xa9b092,
    normalScale: new THREE.Vector2(1.4, 1.4),
  });

  const bark = new THREE.MeshStandardMaterial({
    map: barkDiff,
    normalMap: barkNor,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.92,
    metalness: 0,
  });

  const planks = new THREE.MeshStandardMaterial({
    map: plankDiff,
    normalMap: plankNor,
    roughness: 0.9,
    metalness: 0,
  });

  const stone = new THREE.MeshStandardMaterial({
    map: stoneDiff,
    normalMap: stoneNor,
    roughness: 0.96,
    metalness: 0,
  });

  return { ground, bark, planks, stone };
}

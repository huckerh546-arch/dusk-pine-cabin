import * as THREE from 'three';
import { getSoftDiscTexture, getSparkTexture } from './textures.js';
import { terrainHeight } from './terrain.js';

/** 贴地薄雾 + 萤火虫 + 远处雾幕 */
export function createMist(scene) {
  const group = new THREE.Group();
  group.name = 'mist';
  const rand = Math.random;
  const disc = getSoftDiscTexture();

  // ---- 贴地雾团 ----
  const puffCount = 560;
  const puffPositions = new Float32Array(puffCount * 3);
  const puffBase = new Float32Array(puffCount * 3);
  const puffPhase = new Float32Array(puffCount);

  for (let i = 0; i < puffCount; i++) {
    const radius = 4 + Math.pow(rand(), 0.65) * 62;
    const angle = rand() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = terrainHeight(x, z) + 0.18 + rand() * 3.1;

    puffBase[i * 3] = x;
    puffBase[i * 3 + 1] = y;
    puffBase[i * 3 + 2] = z;
    puffPositions[i * 3] = x;
    puffPositions[i * 3 + 1] = y;
    puffPositions[i * 3 + 2] = z;
    puffPhase[i] = rand() * Math.PI * 2;
  }

  const puffGeometry = new THREE.BufferGeometry();
  puffGeometry.setAttribute('position', new THREE.BufferAttribute(puffPositions, 3));

  const puffMaterial = new THREE.PointsMaterial({
    map: disc,
    color: 0xd8ccd0,
    size: 7.5,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const puffs = new THREE.Points(puffGeometry, puffMaterial);
  puffs.frustumCulled = false;
  group.add(puffs);

  // ---- 远处雾幕 ----
  const hazeMaterial = new THREE.SpriteMaterial({
    map: disc,
    color: 0xdfcfc9,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const hazes = [];
  for (let i = 0; i < 5; i++) {
    const sprite = new THREE.Sprite(hazeMaterial.clone());
    const angle = (i / 5) * Math.PI * 2 + rand();
    const radius = 22 + rand() * 22;
    sprite.position.set(
      Math.cos(angle) * radius,
      0.9 + rand() * 1.3,
      Math.sin(angle) * radius
    );
    sprite.scale.set(46 + rand() * 20, 9 + rand() * 5, 1);
    sprite.userData.phase = rand() * Math.PI * 2;
    sprite.userData.speed = 0.015 + rand() * 0.015;
    hazes.push(sprite);
    group.add(sprite);
  }

  // ---- 萤火虫 ----
  const fireflyCount = 64;
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  const fireflyBase = new Float32Array(fireflyCount * 3);
  const fireflyPhase = new Float32Array(fireflyCount);

  for (let i = 0; i < fireflyCount; i++) {
    const radius = 5 + rand() * 17;
    const angle = rand() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const y = 0.8 + rand() * 2.4;

    fireflyBase[i * 3] = x;
    fireflyBase[i * 3 + 1] = y;
    fireflyBase[i * 3 + 2] = z;
    fireflyPositions[i * 3] = x;
    fireflyPositions[i * 3 + 1] = y;
    fireflyPositions[i * 3 + 2] = z;
    fireflyPhase[i] = rand() * Math.PI * 2;
  }

  const fireflyGeometry = new THREE.BufferGeometry();
  fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));

  const fireflyMaterial = new THREE.PointsMaterial({
    map: getSparkTexture(),
    color: 0xffc37a,
    size: 0.22,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
  fireflies.frustumCulled = false;
  group.add(fireflies);

  scene.add(group);

  let density = 0.38;
  let nightFactor = 0;

  const applyDensity = () => {
    puffMaterial.opacity = 0.025 + density * 0.1;
    for (const haze of hazes) haze.material.opacity = 0.008 + density * 0.035;
  };
  applyDensity();

  return {
    group,
    setDensity(value) {
      density = value;
      applyDensity();
    },
    setNight(value) {
      nightFactor = value;
      fireflyMaterial.opacity = 0.18 + nightFactor * 0.62;
    },
    update(dt, elapsed) {
      const positions = puffGeometry.attributes.position.array;
      for (let i = 0; i < puffCount; i++) {
        const i3 = i * 3;
        const phase = puffPhase[i];
        positions[i3] = puffBase[i3] + Math.sin(elapsed * 0.12 + phase) * 1.8;
        positions[i3 + 1] = puffBase[i3 + 1] + Math.sin(elapsed * 0.24 + phase * 1.7) * 0.22;
        positions[i3 + 2] = puffBase[i3 + 2] + Math.cos(elapsed * 0.1 + phase * 0.8) * 1.8;
      }
      puffGeometry.attributes.position.needsUpdate = true;

      for (const haze of hazes) {
        haze.position.x += Math.sin(elapsed * 0.05 + haze.userData.phase) * dt * 0.35;
        haze.position.z += Math.cos(elapsed * 0.04 + haze.userData.phase) * dt * 0.3;
        haze.material.rotation = Math.sin(elapsed * 0.03 + haze.userData.phase) * 0.05;
      }

      const flyPositions = fireflyGeometry.attributes.position.array;
      for (let i = 0; i < fireflyCount; i++) {
        const i3 = i * 3;
        const phase = fireflyPhase[i];
        flyPositions[i3] = fireflyBase[i3] + Math.sin(elapsed * 0.35 + phase) * 0.9;
        flyPositions[i3 + 1] = fireflyBase[i3 + 1] + Math.sin(elapsed * 0.7 + phase * 2.1) * 0.45;
        flyPositions[i3 + 2] = fireflyBase[i3 + 2] + Math.cos(elapsed * 0.3 + phase * 1.3) * 0.9;
      }
      fireflyGeometry.attributes.position.needsUpdate = true;
    },
  };
}

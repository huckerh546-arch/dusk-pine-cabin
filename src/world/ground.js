import * as THREE from 'three';
import { terrainHeight } from './terrain.js';

export function createGround(scene, material) {
  const size = 340;
  const segments = 170;

  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    position.setY(i, terrainHeight(x, z));
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  const ground = new THREE.Mesh(geometry, material);
  ground.receiveShadow = true;
  scene.add(ground);

  return ground;
}

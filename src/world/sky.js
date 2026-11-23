import * as THREE from 'three';
import { getSoftDiscTexture } from './textures.js';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  varying vec3 vWorldPos;

  void main() {
    vec3 dir = normalize(vWorldPos);

    float height = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.16, height));
    col = mix(col, uZenith, smoothstep(0.1, 0.72, height));

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    // 大范围暖光 + 靠近太阳的高光
    col += uSunColor * pow(sunDot, 5.0) * 0.55;
    col += uSunColor * pow(sunDot, 180.0) * 2.2;
    // 贴着地平线的暖色带
    col += uSunColor * exp(-abs(dir.y) * 16.0) * 0.16;

    // 轻微抖动，消除天空色带
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (dither - 0.5) * 0.0012;

    gl_FragColor = vec4(max(col, 0.0), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSky(scene) {
  const uniforms = {
    uZenith: { value: new THREE.Color(0x272a63) },
    uMid: { value: new THREE.Color(0x9a4c6d) },
    uHorizon: { value: new THREE.Color(0xff9a55) },
    uSunColor: { value: new THREE.Color(0xffc07a) },
    uSunDir: { value: new THREE.Vector3(0.3, 0.15, -0.9).normalize() },
  };

  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(400, 40, 24),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
  );
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  // 太阳光晕
  const glowMaterial = new THREE.SpriteMaterial({
    map: getSoftDiscTexture(),
    color: 0xffbe86,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    fog: false,
  });
  const sunGlow = new THREE.Sprite(glowMaterial);
  sunGlow.scale.setScalar(62);
  scene.add(sunGlow);

  // 日轮本体
  const sunDisc = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getSoftDiscTexture(),
      color: 0xfff2d6,
      blending: THREE.AdditiveBlending,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    })
  );
  sunDisc.scale.setScalar(17);
  scene.add(sunDisc);

  // 星空
  const starCount = 700;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const y = Math.pow(Math.random(), 0.7) * 0.92 + 0.06;
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * r * 380;
    positions[i * 3 + 1] = y * 380;
    positions[i * 3 + 2] = Math.sin(theta) * r * 380;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xdae4ff,
    size: 1.7,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  scene.add(stars);

  return {
    dome,
    sunGlow,
    stars,
    uniforms,
    sunDisc,
    setPalette({ zenith, mid, horizon, sunColor, sunDir }) {
      uniforms.uZenith.value.copy(zenith);
      uniforms.uMid.value.copy(mid);
      uniforms.uHorizon.value.copy(horizon);
      uniforms.uSunColor.value.copy(sunColor);
      uniforms.uSunDir.value.copy(sunDir);

      sunGlow.position.copy(sunDir).multiplyScalar(330);
      sunGlow.material.color.copy(sunColor);
      sunDisc.position.copy(sunDir).multiplyScalar(325);
      sunDisc.material.color.copy(sunColor).lerp(new THREE.Color(0xfff4dd), 0.55);
    },
    setStarOpacity(value) {
      starMaterial.opacity = value;
      stars.visible = value > 0.002;
    },
  };
}

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createSky } from './world/sky.js';
import { createGround } from './world/ground.js';
import { createForest } from './world/forest.js';
import { createCabin } from './world/cabin.js';
import { createMist } from './world/mist.js';
import { loadSurfaces } from './world/surfaces.js';
import { createModels } from './world/models.js';

const canvas = document.querySelector('#scene');
const loader = document.querySelector('#loader');
const loaderText = loader?.querySelector('.loader-text');
const loaderBar = document.querySelector('#loaderBar');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- renderer
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
} catch (error) {
  if (loaderText) loaderText.textContent = '当前浏览器未启用 WebGL，无法渲染场景';
  loader?.querySelector('.loader-ring')?.remove();
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.93;
renderer.outputColorSpace = THREE.SRGBColorSpace;

// ---------------------------------------------------------------- scene
const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x6b8595);
scene.fog = new THREE.FogExp2(fogColor, 0.032);
scene.background = fogColor;

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 1200);

const BASE_POSITION = new THREE.Vector3(7.9, 2.15, 12.4);
const TARGET = new THREE.Vector3(0, 2.35, 0);

/** 竖屏时稍微拉远机位并放宽视场 */
function aspectBoost() {
  const aspect = window.innerWidth / window.innerHeight;
  return aspect < 1 ? THREE.MathUtils.lerp(1, 1.22, THREE.MathUtils.clamp((1 - aspect) / 0.5, 0, 1)) : 1;
}

function defaultPosition() {
  return BASE_POSITION.clone().multiplyScalar(aspectBoost());
}

function responsiveFov() {
  const aspect = window.innerWidth / window.innerHeight;
  return aspect < 1 ? THREE.MathUtils.lerp(52, 70, THREE.MathUtils.clamp((1 - aspect) / 0.5, 0, 1)) : 52;
}

camera.position.copy(defaultPosition()).multiplyScalar(1.5);
camera.lookAt(TARGET);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.minDistance = 4.5;
controls.maxDistance = 42;
controls.minPolarAngle = 0.35;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotate = !prefersReducedMotion;
controls.autoRotateSpeed = 0.22;
controls.enabled = false;

// ---------------------------------------------------------------- 灯光
const sunLight = new THREE.DirectionalLight(0xffc79a, 3.4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -38;
sunLight.shadow.camera.right = 38;
sunLight.shadow.camera.top = 38;
sunLight.shadow.camera.bottom = -38;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 170;
sunLight.shadow.bias = -0.0006;
sunLight.shadow.normalBias = 0.035;
sunLight.shadow.camera.updateProjectionMatrix();
scene.add(sunLight);
scene.add(sunLight.target);

const hemiLight = new THREE.HemisphereLight(0x8fb2d0, 0x2f2f26, 1.15);
scene.add(hemiLight);

const fillLight = new THREE.DirectionalLight(0x8fb3d8, 0.55);
fillLight.position.set(12, 14, 16);
scene.add(fillLight);

// ---------------------------------------------------------------- 世界
const sky = createSky(scene);
const mist = createMist(scene);

// 用天空生成环境贴图，让 PBR 树木有正确的环境光与反射
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileCubemapShader();
let envTarget = null;

function updateEnvironment() {
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 18),
    sky.dome.material
  );
  envScene.add(envDome);
  const previous = envTarget;
  envTarget = pmrem.fromScene(envScene, 0.02, 0.1, 300);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.75;
  previous?.dispose();
  envDome.geometry.dispose();
}

// ---------------------------------------------------------------- 色板
const PALETTE = {
  dusk: {
    zenith: new THREE.Color(0x2c2f63),
    mid: new THREE.Color(0x8f4a63),
    horizon: new THREE.Color(0xf49a58),
    sun: new THREE.Color(0xffa95c),
    sunLight: new THREE.Color(0xffd0a4),
    fog: new THREE.Color(0xc78f72),
    hemiSky: new THREE.Color(0x9aabd6),
    hemiGround: new THREE.Color(0x3a3323),
    sunIntensity: 3.4,
    hemiIntensity: 0.9,
    fillIntensity: 0.5,
    exposure: 1.05,
    star: 0,
  },
  night: {
    zenith: new THREE.Color(0x040714),
    mid: new THREE.Color(0x0c1222),
    horizon: new THREE.Color(0x18213a),
    sun: new THREE.Color(0x93a8dc),
    sunLight: new THREE.Color(0x8fa8e0),
    fog: new THREE.Color(0x101a2a),
    hemiSky: new THREE.Color(0x223055),
    hemiGround: new THREE.Color(0x0d0b12),
    sunIntensity: 0.5,
    hemiIntensity: 0.34,
    fillIntensity: 0.16,
    exposure: 0.92,
    star: 1,
  },
};

const scratch = {
  zenith: new THREE.Color(),
  mid: new THREE.Color(),
  horizon: new THREE.Color(),
  sun: new THREE.Color(),
  sunLight: new THREE.Color(),
  fog: new THREE.Color(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
};

const sunDir = new THREE.Vector3();
let timeOfDay = 0.12;

function updateSunDirection(elevationDeg, azimuthDeg) {
  const el = THREE.MathUtils.degToRad(elevationDeg);
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  return sunDir;
}

function applyTimeOfDayRaw(t) {
  const ease = t * t * (3 - 2 * t);
  const pick = (key) => scratch[key].lerpColors(PALETTE.dusk[key], PALETTE.night[key], ease);
  const lerpNumber = (key) => THREE.MathUtils.lerp(PALETTE.dusk[key], PALETTE.night[key], ease);

  pick('zenith');
  pick('mid');
  pick('horizon');
  pick('sun');
  pick('sunLight');
  pick('fog');
  pick('hemiSky');
  pick('hemiGround');

  updateSunDirection(THREE.MathUtils.lerp(15, 1.5, ease), THREE.MathUtils.lerp(252, 238, ease));

  sky.setPalette({
    zenith: scratch.zenith,
    mid: scratch.mid,
    horizon: scratch.horizon,
    sunColor: scratch.sun,
    sunDir,
  });
  sky.setStarOpacity(lerpNumber('star'));

  sunLight.position.copy(sunDir).multiplyScalar(90);
  sunLight.color.copy(scratch.sunLight);
  sunLight.intensity = lerpNumber('sunIntensity');

  hemiLight.color.copy(scratch.hemiSky);
  hemiLight.groundColor.copy(scratch.hemiGround);
  hemiLight.intensity = lerpNumber('hemiIntensity');
  fillLight.intensity = lerpNumber('fillIntensity');

  fogColor.copy(scratch.fog);
  scene.fog.color.copy(scratch.fog);
  scene.background.copy(scratch.fog);
  renderer.toneMappingExposure = lerpNumber('exposure');
  mist.setNight(ease);
}

let envTimer = 0;
function applyTimeOfDay(t) {
  timeOfDay = t;
  applyTimeOfDayRaw(t);
  clearTimeout(envTimer);
  envTimer = setTimeout(updateEnvironment, 180);
}

function applyFogDensity(value) {
  scene.fog.density = 0.004 + value * 0.05;
  mist.setDensity(value);
}

applyTimeOfDay(timeOfDay);
applyFogDensity(0.42);
updateEnvironment();

// ---------------------------------------------------------------- 相机动画
let tween = null;

function easeInOutCubic(x) {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function tweenCamera(to, duration = 1.3) {
  tween = {
    from: camera.position.clone(),
    to: to.clone(),
    elapsed: 0,
    duration,
  };
  controls.enabled = false;
}

function cancelTween() {
  if (!tween) return;
  tween = null;
  controls.enabled = true;
}

// ---------------------------------------------------------------- UI
const timeInput = document.querySelector('#time');
const timeOut = document.querySelector('#timeOut');
const fogInput = document.querySelector('#fog');
const fogOut = document.querySelector('#fogOut');
const lightsButton = document.querySelector('#lights');
const orbitButton = document.querySelector('#orbit');
const resetButton = document.querySelector('#reset');

timeInput.value = String(Math.round(timeOfDay * 100));
timeOut.textContent = `${timeInput.value}%`;

timeInput.addEventListener('input', () => {
  timeOut.textContent = `${timeInput.value}%`;
  applyTimeOfDay(Number(timeInput.value) / 100);
});

fogInput.addEventListener('input', () => {
  fogOut.textContent = `${fogInput.value}%`;
  applyFogDensity(Number(fogInput.value) / 100);
});

orbitButton.addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  orbitButton.classList.toggle('is-on', controls.autoRotate);
  orbitButton.setAttribute('aria-pressed', String(controls.autoRotate));
  orbitButton.textContent = controls.autoRotate ? '开启' : '关闭';
});

resetButton.addEventListener('click', () => {
  tweenCamera(defaultPosition(), 1.2);
});

orbitButton.classList.toggle('is-on', controls.autoRotate);
orbitButton.setAttribute('aria-pressed', String(controls.autoRotate));
orbitButton.textContent = controls.autoRotate ? '开启' : '关闭';

// ---------------------------------------------------------------- 拾取
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downPoint = null;
let cabin = null;

function hitWindow(clientX, clientY) {
  if (!cabin) return false;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(cabin.clickTargets, true).length > 0;
}

function syncLightsButton() {
  if (!cabin) return;
  const on = cabin.lightsOn;
  lightsButton.classList.toggle('is-on', on);
  lightsButton.setAttribute('aria-pressed', String(on));
  lightsButton.textContent = on ? '已点亮' : '已熄灭';
}

lightsButton.addEventListener('click', () => {
  cabin?.toggleLights();
  syncLightsButton();
});

canvas.addEventListener('pointerdown', (event) => {
  downPoint = { x: event.clientX, y: event.clientY };
  cancelTween();
});

canvas.addEventListener('pointerup', (event) => {
  if (!downPoint) return;
  const moved = Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y);
  downPoint = null;
  if (moved > 7) return;

  if (hitWindow(event.clientX, event.clientY)) {
    cabin?.toggleLights();
    syncLightsButton();
  }
});

canvas.addEventListener('pointermove', (event) => {
  if (downPoint) return;
  canvas.classList.toggle('is-pointing', hitWindow(event.clientX, event.clientY));
});

canvas.addEventListener('pointerleave', () => {
  canvas.classList.remove('is-pointing');
});

// ---------------------------------------------------------------- 尺寸
function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.fov = responsiveFov();
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(width, height);
  if (tween) tween.to.copy(defaultPosition());
}

window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// ---------------------------------------------------------------- 渲染循环
const clock = new THREE.Clock();
let started = false;

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  if (tween) {
    tween.elapsed += dt;
    const k = Math.min(1, tween.elapsed / tween.duration);
    camera.position.lerpVectors(tween.from, tween.to, easeInOutCubic(k));
    camera.lookAt(controls.target);

    if (k >= 1) {
      tween = null;
      controls.enabled = true;
      controls.update();
    }
  } else {
    controls.update();
  }

  cabin?.update(dt);
  mist.update(dt, elapsed);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

// ---------------------------------------------------------------- 资产加载
function setLoaderProgress(ratio, label) {
  if (loaderBar) loaderBar.style.width = `${Math.round(Math.min(1, ratio) * 100)}%`;
  if (loaderText && label) loaderText.textContent = label;
}

function hideLoader() {
  if (!loader) return;
  loader.classList.add('is-done');
  setTimeout(() => loader.remove(), 1400);
}

async function initAssets() {
  const models = createModels();
  let lastShown = 0;
  models.setProgressHandler(({ ratio }) => {
    // 贴图与二进制会持续增加，进度取 5%~95% 区间，避免视觉上倒退
    const mapped = 0.05 + ratio * 0.9;
    if (mapped > lastShown + 0.005) {
      lastShown = mapped;
      setLoaderProgress(mapped, `正在加载森林资产 ${Math.round(mapped * 100)}%`);
    }
  });

  setLoaderProgress(0.04, '正在加载森林资产 4%');

  const manifest = await fetch('/assets/models/manifest.json').then((res) => {
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    return res.json();
  });

  const surfaces = await loadSurfaces();
  createGround(scene, surfaces.ground);

  const [trees, props] = await Promise.all([
    models.loadTrees(manifest),
    models.loadProps(manifest),
  ]);

  cabin = createCabin(scene, surfaces, props);
  syncLightsButton();

  const forest = createForest(scene, { trees, props });
  setLoaderProgress(1, '正在走进松林…');

  window.__forest = forest;
  window.__assets = { manifest, trees, props };

  const introFrom = defaultPosition().multiplyScalar(1.55).setY(6.5);
  camera.position.copy(introFrom);
  tween = {
    from: introFrom.clone(),
    to: defaultPosition(),
    elapsed: 0,
    duration: prefersReducedMotion ? 0.8 : 3.4,
  };

  setTimeout(hideLoader, 250);
  started = true;
}

initAssets().catch((error) => {
  console.error('[assets] 加载失败', error);
  if (loaderText) loaderText.textContent = '素材加载失败，请检查 public/assets 目录';
  if (loaderBar) loaderBar.style.background = '#ff6b6b';
});

// 便于在控制台微调
window.__scene = {
  THREE,
  scene,
  camera,
  renderer,
  controls,
  applyTimeOfDay,
  applyFogDensity,
  get cabin() {
    return cabin;
  },
  get started() {
    return started;
  },
};

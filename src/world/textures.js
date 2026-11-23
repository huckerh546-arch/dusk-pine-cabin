import * as THREE from 'three';

/** 固定种子随机数，保证每次刷新纹理一致 */
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

const cache = new Map();

function makeTexture(key, size, draw, { repeat = [1, 1], srgb = true, clamp = false } = {}) {
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size, mulberry32(key.length * 7919 + 13));

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 8;
  if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  cache.set(key, texture);
  return texture;
}

/** 原木：竖向纹理（圆柱 UV 的 v 方向 = 原木长度方向） */
export function getBarkTexture() {
  return makeTexture('bark', 512, (ctx, size, rand) => {
    ctx.fillStyle = '#7a5a3c';
    ctx.fillRect(0, 0, size, size);

    // 底色色块，让木色有起伏
    for (let i = 0; i < 240; i++) {
      const x = rand() * size;
      const w = 6 + rand() * 46;
      const light = 30 + rand() * 26;
      ctx.fillStyle = `hsla(${26 + rand() * 12}, ${28 + rand() * 18}%, ${light}%, ${
        0.1 + rand() * 0.18
      })`;
      ctx.fillRect(x, 0, w, size);
    }

    // 顺纹的深浅条纹
    for (let i = 0; i < 900; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 40 + rand() * size;
      const light = rand() > 0.5 ? 18 + rand() * 16 : 48 + rand() * 16;
      ctx.strokeStyle = `hsla(${22 + rand() * 14}, 30%, ${light}%, ${0.06 + rand() * 0.22})`;
      ctx.lineWidth = 0.6 + rand() * 2.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 6, y + len * 0.33, x + (rand() - 0.5) * 6, y + len * 0.66, x, y + len);
      ctx.stroke();
    }

    // 木节
    for (let i = 0; i < 16; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 4 + rand() * 9;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(46, 28, 15, 0.75)');
      g.addColorStop(0.55, 'rgba(70, 44, 24, 0.35)');
      g.addColorStop(1, 'rgba(70, 44, 24, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 1.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 苔痕
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(${60 + rand() * 20}, ${70 + rand() * 30}, ${40 + rand() * 20}, ${
        0.04 + rand() * 0.1
      })`;
      ctx.beginPath();
      ctx.arc(rand() * size, rand() * size, 2 + rand() * 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: [1, 2] });
}

/** 木板：水平板材（门廊、山墙） */
export function getPlankTexture() {
  return makeTexture('plank', 512, (ctx, size, rand) => {
    ctx.fillStyle = '#5c4028';
    ctx.fillRect(0, 0, size, size);

    const rows = 7;
    const h = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * h;
      const light = 22 + rand() * 12;
      ctx.fillStyle = `hsl(${26 + rand() * 8}, 32%, ${light}%)`;
      ctx.fillRect(0, y + 1, size, h - 2);

      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = `hsla(24, 30%, ${light + (rand() > 0.5 ? 12 : -8)}%, ${0.12 + rand() * 0.2})`;
        ctx.lineWidth = 0.7 + rand() * 1.4;
        const yy = y + 3 + rand() * (h - 6);
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(size * 0.3, yy + (rand() - 0.5) * 4, size * 0.7, yy + (rand() - 0.5) * 4, size, yy);
        ctx.stroke();
      }

      // 板缝
      ctx.fillStyle = 'rgba(18, 11, 6, 0.55)';
      ctx.fillRect(0, y, size, 2);
      // 钉子
      ctx.fillStyle = 'rgba(14, 9, 5, 0.55)';
      ctx.beginPath();
      ctx.arc(size * (0.06 + rand() * 0.06), y + h * 0.5, 1.6, 0, Math.PI * 2);
      ctx.arc(size * (0.88 + rand() * 0.06), y + h * 0.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, { repeat: [1, 1] });
}

/** 屋顶木瓦 */
export function getShingleTexture() {
  return makeTexture('shingle', 512, (ctx, size, rand) => {
    ctx.fillStyle = '#2a2320';
    ctx.fillRect(0, 0, size, size);

    const rows = 10;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const cols = 8;
      const w = size / cols;
      const offset = (r % 2) * w * 0.5;
      for (let c = -1; c <= cols; c++) {
        const x = c * w + offset;
        const light = 16 + rand() * 12;
        ctx.fillStyle = `hsl(${22 + rand() * 10}, ${12 + rand() * 10}%, ${light}%)`;
        ctx.beginPath();
        ctx.roundRect(x + 1, y + 1, w - 2, rowH - 1, 1.5);
        ctx.fill();

        // 瓦片下缘阴影
        ctx.fillStyle = 'rgba(8, 6, 5, 0.5)';
        ctx.fillRect(x + 1, y + rowH - 3, w - 2, 3);

        // 木纹
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(x + 4, y + rowH * 0.4);
        ctx.lineTo(x + w - 5, y + rowH * 0.45);
        ctx.stroke();
      }
    }
  }, { repeat: [3, 2] });
}

/** 石砌：地基与烟囱 */
export function getStoneTexture() {
  return makeTexture('stone', 512, (ctx, size, rand) => {
    ctx.fillStyle = '#3a3733';
    ctx.fillRect(0, 0, size, size);

    const rows = 8;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 40;
      const y = r * rowH;
      while (x < size) {
        const w = 36 + rand() * 62;
        const g = 34 + rand() * 22;
        ctx.fillStyle = `hsl(${34 + rand() * 14}, ${5 + rand() * 8}%, ${g}%)`;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, w - 4, rowH - 4, 3 + rand() * 4);
        ctx.fill();

        // 高光与阴影
        ctx.fillStyle = 'rgba(255, 240, 220, 0.07)';
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 3, w - 8, rowH * 0.34, 3);
        ctx.fill();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.roundRect(x + 4, y + rowH * 0.68, w - 8, rowH * 0.26, 3);
        ctx.fill();

        // 颗粒
        for (let i = 0; i < 12; i++) {
          ctx.fillStyle = `rgba(${rand() > 0.5 ? 255 : 0}, ${rand() > 0.5 ? 240 : 0}, 220, ${0.03 + rand() * 0.06})`;
          ctx.beginPath();
          ctx.arc(x + 6 + rand() * (w - 12), y + 4 + rand() * (rowH - 8), 1 + rand() * 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        x += w;
      }
    }
  }, { repeat: [1, 2] });
}

/** 林地：落叶、苔藓、泥土 */
export function getGroundTexture() {
  return makeTexture('ground', 512, (ctx, size, rand) => {
    ctx.fillStyle = '#495234';
    ctx.fillRect(0, 0, size, size);

    for (let i = 0; i < 2600; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 2 + rand() * 14;
      const moss = rand() > 0.45;
      ctx.fillStyle = moss
        ? `hsla(${84 + rand() * 30}, ${32 + rand() * 22}%, ${18 + rand() * 18}%, ${0.07 + rand() * 0.2})`
        : `hsla(${28 + rand() * 18}, ${22 + rand() * 18}%, ${14 + rand() * 16}%, ${0.05 + rand() * 0.16})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 落叶碎屑
    for (let i = 0; i < 340; i++) {
      ctx.save();
      ctx.translate(rand() * size, rand() * size);
      ctx.rotate(rand() * Math.PI);
      ctx.fillStyle = `hsla(${20 + rand() * 30}, 42%, ${28 + rand() * 16}%, ${0.2 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, 2 + rand() * 5, 0.8 + rand() * 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }, { repeat: [26, 26] });
}

/** 柔和圆点：雾团 / 光晕 */
export function getSoftDiscTexture() {
  return makeTexture('disc', 256, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)');
    g.addColorStop(0.7, 'rgba(255, 255, 255, 0.14)');
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { srgb: false, clamp: true });
}

/** 火星 / 萤火虫光点 */
export function getSparkTexture() {
  return makeTexture('spark', 128, (ctx, size) => {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 255, 255, 1)');
    g.addColorStop(0.18, 'rgba(255, 240, 205, 0.95)');
    g.addColorStop(0.45, 'rgba(255, 176, 92, 0.35)');
    g.addColorStop(1, 'rgba(255, 150, 70, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }, { srgb: false, clamp: true });
}

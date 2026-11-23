/** 共享的地形高度场：地面、树木、薄雾都基于它对齐 */

export function smoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function terrainHeight(x, z) {
  const d = Math.hypot(x, z);
  // 木屋周围保持平整，远处才起伏
  const flat = smoothstep(8, 30, d);

  const h =
    1.15 * Math.sin(x * 0.052 + 1.3) * Math.cos(z * 0.047 - 0.7) +
    0.55 * Math.sin(x * 0.131 - 2.0) * Math.sin(z * 0.108 + 1.7) +
    0.35 * Math.sin(d * 0.21 + 0.6);

  return h * flat;
}

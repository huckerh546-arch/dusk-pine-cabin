// 从 Poly Haven 下载 CC0 模型（glTF 1k 版）到本地暂存目录
// 用法: node scripts/download-assets.mjs <assetId> [assetId...]
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const STAGING = path.join(ROOT, '.assets-src');

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error('usage: node scripts/download-assets.mjs <assetId...>');
  process.exit(1);
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'dusk-pine-cabin/2.0 (asset fetch)' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function download(url, dest, expectedSize) {
  try {
    const info = await stat(dest);
    if (expectedSize && info.size === expectedSize) {
      console.log('  skip (exists)', path.basename(dest));
      return;
    }
  } catch {}

  const res = await fetch(url, { headers: { 'user-agent': 'dusk-pine-cabin/2.0 (asset fetch)' } });
  if (!res.ok || !res.body) throw new Error(`${url} -> HTTP ${res.status}`);

  await mkdir(path.dirname(dest), { recursive: true });
  await pipeline(res.body, createWriteStream(dest));

  if (expectedSize) {
    const info = await stat(dest);
    if (info.size !== expectedSize) {
      throw new Error(`size mismatch for ${dest}: ${info.size} != ${expectedSize}`);
    }
  }
  console.log('  saved', path.basename(dest), ((expectedSize ?? 0) / 1048576).toFixed(2) + 'MB');
}

for (const id of ids) {
  console.log(`\n== ${id}`);
  const files = await fetchJson(`https://api.polyhaven.com/files/${id}`);
  const entry = files.gltf?.['1k']?.gltf;
  if (!entry) {
    console.warn('  no 1k gltf entry, skipping');
    continue;
  }

  const dir = path.join(STAGING, id);
  await mkdir(dir, { recursive: true });

  const gltfUrl = entry.url;
  await download(gltfUrl, path.join(dir, path.basename(gltfUrl)), entry.size);

  for (const [rel, info] of Object.entries(entry.include ?? {})) {
    // include 的 key 形如 textures/xxx.jpg（gltf 内引用的相对路径）
    await download(info.url, path.join(dir, rel), info.size);
  }

  const meta = {
    id,
    name: id,
    source: `https://polyhaven.com/a/${id}`,
    license: 'CC0',
    filesUrl: `https://api.polyhaven.com/files/${id}`,
    downloadedAt: new Date().toISOString(),
    gltf: path.basename(gltfUrl),
  };
  await writeFile(path.join(dir, 'source.json'), JSON.stringify(meta, null, 2));
  console.log('  done', id);
}

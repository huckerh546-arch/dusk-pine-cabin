// 下载 Poly Haven CC0 贴图（JPG）到 public/assets/textures
// 用法: node scripts/download-textures.mjs <res> <assetId>:<Map,Map> ...
import { mkdir, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets', 'textures');

const [res = '1k', ...specs] = process.argv.slice(2);

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'dusk-pine-cabin/2.0 (asset fetch)' } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

const manifest = [];

for (const spec of specs) {
  const [id, mapList] = spec.split(':');
  const maps = (mapList || 'Diffuse,nor_gl,Rough').split(',');
  const files = await fetchJson(`https://api.polyhaven.com/files/${id}`);

  for (const map of maps) {
    const entry = files[map]?.[res]?.jpg;
    if (!entry) {
      console.warn(`missing ${id} ${map} ${res}`);
      continue;
    }
    const ext = path.extname(new URL(entry.url).pathname);
    const suffix = map === 'Diffuse' ? 'diff' : map === 'nor_gl' ? 'nor' : map.toLowerCase();
    const filename = `${id}_${suffix}_${res}${ext}`;
    const dest = path.join(OUT, filename);

    const response = await fetch(entry.url, {
      headers: { 'user-agent': 'dusk-pine-cabin/2.0 (asset fetch)' },
    });
    if (!response.ok || !response.body) throw new Error(`${entry.url} -> HTTP ${response.status}`);
    await mkdir(OUT, { recursive: true });
    await pipeline(response.body, createWriteStream(dest));
    console.log(`saved ${filename} (${(entry.size / 1048576).toFixed(2)}MB)`);

    manifest.push({
      file: filename,
      asset: id,
      map,
      resolution: res,
      source: `https://polyhaven.com/a/${id}`,
      license: 'CC0',
      url: entry.url,
      md5: entry.md5,
    });
  }
}

await writeFile(
  path.join(OUT, 'sources.json'),
  JSON.stringify({ downloadedAt: new Date().toISOString(), files: manifest }, null, 2)
);
console.log('done');

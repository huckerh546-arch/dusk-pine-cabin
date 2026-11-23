// 通过 CDP 截图 / 取运行时信息（仅用于本地验证，不参与构建）
const [, , outPath = 'preview/shot.png', evalExpr = '', waitMs = '9000'] = process.argv;
let page = null;
for (let i = 0; i < 20 && !page; i++) {
  const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  page = list.find((p) => p.type === 'page');
  if (!page) await new Promise((r) => setTimeout(r, 500));
}
if (!page) throw new Error('page not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const messageId = ++id;
  pending.set(messageId, { resolve, reject });
  ws.send(JSON.stringify({ id: messageId, method, params }));
});
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
  }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Runtime.enable');
await send('Page.enable');

const nav = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
if (!String(nav.result?.value ?? '').includes('127.0.0.1:5173')) {
  await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
  await new Promise((r) => setTimeout(r, 6000));
} else if (process.env.RELOAD === '1') {
  await send('Page.reload', { ignoreCache: true });
}
if (process.env.MOBILE === '1') {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
} else {
  await send('Emulation.clearDeviceMetricsOverride');
}
await new Promise((r) => setTimeout(r, Number(waitMs)));

// 等待资产加载完成
for (let i = 0; i < 60; i++) {
  const check = await send('Runtime.evaluate', { expression: 'Boolean(window.__scene && window.__scene.started)', returnByValue: true });
  if (check.result.value) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 1200));

let evalResult = null;
if (evalExpr) {
  const result = await send('Runtime.evaluate', { expression: evalExpr, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) console.error('eval error:', JSON.stringify(result.exceptionDetails).slice(0, 500));
  evalResult = result.result?.value ?? null;
  await new Promise((r) => setTimeout(r, 900));
}

const stats = await send('Runtime.evaluate', { expression: `(() => {
  if (!window.__scene) return null;
  const s = window.__scene;
  return { calls: s.renderer.info.render.calls, tris: s.renderer.info.render.triangles,
           geometries: s.renderer.info.memory.geometries, textures: s.renderer.info.memory.textures };
})()`, returnByValue: true });

const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFile } = await import('node:fs/promises');
await writeFile(outPath, Buffer.from(shot.data, 'base64'));
console.log(JSON.stringify({ saved: outPath, evalResult, stats: stats.result?.value, errors: errors.slice(0, 6) }));
ws.close();

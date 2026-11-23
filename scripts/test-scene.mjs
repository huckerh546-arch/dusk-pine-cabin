// 场景功能回归：窗灯点击、滑块、重置、控制台错误
const list = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = list.find((p) => p.type === 'page');
if (!page) throw new Error('page not found');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id; pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.id && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result); }
});
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
await send('Runtime.enable'); await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
for (let i = 0; i < 80; i++) {
  const r = await send('Runtime.evaluate', { expression: 'Boolean(window.__scene && window.__scene.started)', returnByValue: true });
  if (r.result.value) break;
  await new Promise((r) => setTimeout(r, 500));
}
await new Promise((r) => setTimeout(r, 3500));
errors.length = 0;

const expr = `(() => {
  const s = window.__scene, c = document.querySelector('#scene'), out = {};
  const t0 = performance.now();
  out.ready = Boolean(s && window.__forest);
  out.forest = window.__forest?.stats;
  out.tris = s.renderer.info.render.triangles;
  out.calls = s.renderer.info.render.calls;
  out.drawables = window.__forest?.meshes.length;
  out.assetsBytes = performance.getEntriesByType('resource')
    .filter(e => /assets\\/(models|textures)/.test(e.name))
    .reduce((a, e) => a + (e.transferSize || 0), 0);

  const { THREE, camera, cabin } = s;
  const target = cabin.clickTargets[1];
  const world = new THREE.Vector3(); target.getWorldPosition(world);
  const projected = world.clone().project(camera);
  const rect = c.getBoundingClientRect();
  const x = (projected.x * 0.5 + 0.5) * rect.width + rect.left;
  const y = (-projected.y * 0.5 + 0.5) * rect.height + rect.top;
  out.lightsBefore = cabin.lightsOn;
  out.windowPoint = [Math.round(x), Math.round(y)];

  const time = document.querySelector('#time');
  time.value = 90; time.dispatchEvent(new Event('input', { bubbles: true }));
  out.exposure = +s.renderer.toneMappingExposure.toFixed(3);
  const fog = document.querySelector('#fog');
  fog.value = 70; fog.dispatchEvent(new Event('input', { bubbles: true }));
  out.fogDensity = +s.scene.fog.density.toFixed(4);
  document.querySelector('#reset').click();
  out.propHeight = window.__assets.props.fern_02.bounds.max.y;
  return out;
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
const info = r.result.value;
if (info?.windowPoint) {
  const [x, y] = info.windowPoint;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await new Promise((res) => setTimeout(res, 300));
  const after = await send('Runtime.evaluate', { expression: '({ on: window.__scene.cabin.lightsOn, text: document.querySelector("#lights").textContent })', returnByValue: true });
  info.lightsAfter = after.result.value.on;
  info.buttonText = after.result.value.text;
}
console.log(JSON.stringify({ result: info, errors: errors.slice(0, 5) }, null, 2));
ws.close();

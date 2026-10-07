const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8101;
(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,640'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 640, hasTouch: true, isMobile: true });
  await p.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__game && window.__game.city', { timeout: 120000 });
  await p.evaluate(() => document.getElementById('btn-new').click());
  await new Promise(r => setTimeout(r, 1200));
  await p.evaluate(() => {
    document.getElementById('cc-name').value = 'Тест';
    document.getElementById('cc-random').click();
  });
  await new Promise(r => setTimeout(r, 500));
  await p.evaluate(() => document.getElementById('cc-start').click());
  await new Promise(r => setTimeout(r, 3000));

  // тянем джойстик «вверх» настоящими тач-событиями
  const box = await p.evaluate(() => {
    const r = document.getElementById('stick').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width };
  });
  const before = await p.evaluate(() => {
    const g = window.__game, p = g.player3d;
    return { x: p.pos.x, z: p.pos.z, camYaw: p.camYaw,
             cam: { x: g.engine.camera.position.x, z: g.engine.camera.position.z } };
  });
  const t = await p.target().createCDPSession();
  await t.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y, id: 1 }] });
  await t.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x, y: box.y - box.w * 0.4, id: 1 }] });
  const inp = await p.evaluate(() => ({ ...window.__game.controls.input }));
  await new Promise(r => setTimeout(r, 2000));
  const after = await p.evaluate(() => {
    const g = window.__game, p = g.player3d;
    return { x: p.pos.x, z: p.pos.z, cam: { x: g.engine.camera.position.x, z: g.engine.camera.position.z } };
  });
  await t.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  const dx = after.x - before.x, dz = after.z - before.z;
  const fx = before.x - before.cam.x, fz = before.z - before.cam.z; // от камеры к игроку = «вперёд»
  const n = Math.hypot(fx, fz) || 1;
  const dot = (dx * fx + dz * fz) / n;
  console.log(JSON.stringify({ input: inp, moved: +Math.hypot(dx, dz).toFixed(2),
    'вперёд(+)/назад(-)': +dot.toFixed(2), camYaw: +before.camYaw.toFixed(2) }, null, 1));
  await b.close(); srv.kill();
})();

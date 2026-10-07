const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8102;
(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction('window.__game && window.__game.city', { timeout: 120000 });
  await p.evaluate(() => document.getElementById('btn-new').click());
  await new Promise(r => setTimeout(r, 1000));
  await p.evaluate(() => { document.getElementById('cc-name').value = 'Тест'; document.getElementById('cc-random').click(); });
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => document.getElementById('cc-start').click());
  await new Promise(r => setTimeout(r, 3000));

  async function probe(mx, my) {
    return await p.evaluate(async (mx, my) => {
      const g = window.__game, pl = g.player3d, cam = g.engine.camera; g.paused = false;
      const c0 = { x: cam.position.x, z: cam.position.z };
      const p0 = { x: pl.pos.x, z: pl.pos.z };
      g.controls.input.mx = mx; g.controls.input.my = my;
      await new Promise(r => setTimeout(r, 1200));
      g.controls.input.mx = 0; g.controls.input.my = 0;
      const d = { x: pl.pos.x - p0.x, z: pl.pos.z - p0.z };
      // forward = от камеры к игроку
      let fx = p0.x - c0.x, fz = p0.z - c0.z; const n = Math.hypot(fx, fz) || 1; fx /= n; fz /= n;
      // screen-right (three.js): (-Fz, Fx)
      const rx = -fz, rz = fx;
      return { paused: g.paused, mode: pl.mode, speed: +pl.speed.toFixed(2), fps: g.engine.fps, fwd: +(d.x * fx + d.z * fz).toFixed(2), right: +(d.x * rx + d.z * rz).toFixed(2),
               moved: +Math.hypot(d.x, d.z).toFixed(2) };
    }, mx, my);
  }
  console.log('стик ВВЕРХ   (my=+1):', JSON.stringify(await probe(0, 1)));
  console.log('стик ВНИЗ    (my=-1):', JSON.stringify(await probe(0, -1)));
  console.log('стик ВПРАВО  (mx=+1):', JSON.stringify(await probe(1, 0)));
  console.log('стик ВЛЕВО   (mx=-1):', JSON.stringify(await probe(-1, 0)));

  // ===== машина =====
  await p.evaluate(() => {
    const g = window.__game;
    g.paused = false;
    const v = g.buyVehicle ? null : null;
    g.player.money = 999999;
    g.buyVehicle('sedan');
    g.summonVehicle(Object.keys(g.player.vehicles || {})[0] || 0);
  });
  await new Promise(r => setTimeout(r, 1500));
  const car = await p.evaluate(async () => {
    const g = window.__game, pl = g.player3d;
    const v = g.worldVehicles.find(x => x.owned) || g.worldVehicles[0];
    if (!v) return 'нет машины';
    pl.enterVehicle(v);
    g.paused = false;
    const h0 = v.heading;
    g.controls.input.my = 1; g.controls.input.mx = 1;   // газ + руль вправо
    await new Promise(r => setTimeout(r, 2500));
    const h1 = v.heading, sp = v.speed;
    g.controls.input.my = 0; g.controls.input.mx = 0;
    // направление движения машины = -(sin h, cos h)
    const turn = ((h1 - h0 + Math.PI) % (2 * Math.PI)) - Math.PI;
    return { speed: +sp.toFixed(1), dHeading: +turn.toFixed(3) };
  });
  console.log('машина: газ + руль ВПРАВО:', JSON.stringify(car));
  await b.close(); srv.kill();
})();

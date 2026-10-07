const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8103;
(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1100, height: 620 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("window.__game && window.__game.city && !document.getElementById('menu').classList.contains('hidden')", { timeout: 120000 });
  await p.evaluate(() => document.getElementById('btn-new').click());
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate(() => { document.getElementById('cc-name').value = 'Тест'; document.getElementById('cc-random').click(); });
  await new Promise(r => setTimeout(r, 400));
  await p.evaluate(() => document.getElementById('cc-start').click());
  await new Promise(r => setTimeout(r, 6000));
  const info = await p.evaluate(() => {
    const g = window.__game;
    g.paused = false;
    const pl = g.player3d;
    pl.camTargetDist = 4.2; pl.camDist = 4.2; pl.camPitch = 0.12;
    return { menuHidden: document.getElementById('menu').classList.contains('hidden'), hudHidden: document.getElementById('hud').classList.contains('hidden'), creatorHidden: document.getElementById('creator').classList.contains('hidden'), usingModel: pl.usingModel, anim: pl.body.current || null, tris: g.engine.renderer.info.render.triangles };
  });
  await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: 'shots/player-idle.png' });
  await p.evaluate(async () => {
    const g = window.__game; g.controls.input.my = 1; g.controls.touch.run = true;
  });
  await new Promise(r => setTimeout(r, 2500));
  await p.screenshot({ path: 'shots/player-run.png' });
  console.log(JSON.stringify(info), 'errors:', errs.slice(0, 3));
  await b.close(); srv.kill();
})();

/* pose.cjs — крупные планы игрока: покой, удар, прицел. Для визуальной отладки поз. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8107;

(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.setViewport({ width: 700, height: 700 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("window.__game && window.__game.city && !document.getElementById('menu').classList.contains('hidden')", { timeout: 120000 });
  await p.evaluate(() => document.getElementById('btn-new').click());
  await new Promise(r => setTimeout(r, 900));
  await p.evaluate(() => { document.getElementById('cc-name').value = 'Поза'; });
  await new Promise(r => setTimeout(r, 300));
  await p.evaluate(() => document.getElementById('cc-start').click());
  await new Promise(r => setTimeout(r, 7000));

  const setCam = async (side) => p.evaluate((side) => {
    const g = window.__game, pl = g.player3d;
    document.getElementById('hud').style.opacity = '0.15';
    pl.camYaw = pl.heading + (side === 'front' ? Math.PI : Math.PI / 2);
    pl.camPitch = 0.05;
    pl.camTargetDist = 3.0; pl.camDist = 3.0;
  }, side);

  const info = await p.evaluate(() => {
    const pl = window.__game.player3d;
    return { usingModel: pl.usingModel, bones: !!pl._armBones() };
  });

  await setCam('front');
  await new Promise(r => setTimeout(r, 1200));
  await p.screenshot({ path: 'shots/pose-idle.png' });

  await setCam('side');
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: 'shots/pose-idle-side.png' });

  // удар — ловим середину
  await setCam('side');
  await p.evaluate(() => window.__game.punch());
  await new Promise(r => setTimeout(r, 230));
  await p.screenshot({ path: 'shots/pose-punch.png' });

  await new Promise(r => setTimeout(r, 900));
  await p.evaluate(() => window.__game.toggleAim(true));
  await new Promise(r => setTimeout(r, 900));
  await p.screenshot({ path: 'shots/pose-aim.png' });
  await p.evaluate(() => window.__game.toggleAim(false));

  // оружие: стойка и отдача
  await p.evaluate(() => {
    const g = window.__game;
    window.S = g.player; g.player.ammo = 30; g.player.equipped = 'pistol';
    g.syncWeapon(); g.toggleAim(true);
  });
  await new Promise(r => setTimeout(r, 1200));
  await setCam('side');
  await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: 'shots/pose-gun.png' });
  await p.evaluate(() => {
    const pl = window.__game.player3d;
    pl.camYaw = pl.heading + Math.PI * 0.72; pl.camPitch = 0.25;
    pl.camTargetDist = 1.4; pl.camDist = 1.4;
  });
  await new Promise(r => setTimeout(r, 700));
  await p.screenshot({ path: 'shots/pose-gun-close.png' });
  await p.evaluate(() => window.__game.shoot());
  await new Promise(r => setTimeout(r, 120));
  await p.screenshot({ path: 'shots/pose-recoil.png' });
  const gun = await p.evaluate(() => {
    const pl = window.__game.player3d;
    const THREE = window.__THREE || null;
    let size = null, hs = null;
    if (pl.weapon) {
      const b = pl._armBones();
      const v = new pl.pos.constructor();
      b.handR.getWorldScale(v); hs = +v.x.toFixed(4);
      const bb = new (Object.getPrototypeOf(pl.root).constructor === Object ? Object : Object)();
    }
    return { weapon: !!pl.weapon, kind: pl.weaponKind, ammo: window.__game.player.ammo, handScale: hs };
  });
  console.log(JSON.stringify(info), JSON.stringify(gun), 'errors:', errs.slice(0, 3));
  await b.close(); srv.kill();
})();

/* tap.cjs — проверка экранных кнопок настоящими касаниями (touch), а не вызовом методов. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8112;

(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--touch-events=enabled'] });
  const p = await b.newPage();
  await p.setViewport({ width: 900, height: 480, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("window.__game && window.__game.city && !document.getElementById('menu').classList.contains('hidden')", { timeout: 120000 });

  // меню: тап по «Новая игра» и «В город»
  const tap = async (sel) => {
    const el = await p.$(sel);
    if (!el) return { ok: false, why: 'нет элемента ' + sel };
    const box = await el.boundingBox();
    if (!box) return { ok: false, why: 'элемент не виден ' + sel };
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const top = await p.evaluate((x, y) => {
      const e = document.elementFromPoint(x, y);
      return e ? (e.id || e.className || e.tagName) : null;
    }, x, y);
    await p.touchscreen.tap(x, y);
    await new Promise(r => setTimeout(r, 350));
    return { ok: true, top };
  };

  const out = { menu: {}, hud: {} };
  out.menu.new = await tap('#btn-new');
  await new Promise(r => setTimeout(r, 600));
  out.menu.start = await tap('#cc-start');
  await new Promise(r => setTimeout(r, 6000));

  out.inGame = await p.evaluate(() => !document.getElementById('hud').classList.contains('hidden'));

  // кнопки HUD
  const probe = async (sel, check) => {
    const before = await p.evaluate(check);
    const t = await tap(sel);
    const after = await p.evaluate(check);
    return { top: t.top, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) };
  };

  out.hud.punch = await probe('#b-punch', () => ({ cd: window.__game.player3d.punchCd > 0 }));
  await new Promise(r => setTimeout(r, 800));
  out.hud.aim = await probe('#b-aim', () => ({ aim: window.__game.player3d.aiming }));
  await new Promise(r => setTimeout(r, 300));
  out.hud.aimOff = await probe('#b-aim', () => ({ aim: window.__game.player3d.aiming }));
  out.hud.radial = await probe('#radial-btn', () => ({ open: document.getElementById('radial').classList.contains('open') }));
  out.hud.jump = await probe('#b-jump', () => ({ y: +window.__game.player3d.yOffset.toFixed(2) }));
  out.hud.action = await probe('#b-action', () => ({ toasts: document.getElementById('toasts').children.length }));

  console.log(JSON.stringify(out, null, 1));
  console.log('errors:', errs.slice(0, 5));
  await b.close(); srv.kill();
})();

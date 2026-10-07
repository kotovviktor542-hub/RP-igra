/* roomtest.cjs — два браузера заходят в одну публичную комнату и должны увидеть друг друга. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8114;
const ROOM = 'ci' + Math.random().toString(36).slice(2, 8);
const BROKER = 'wss://broker.emqx.io:8084/mqtt';

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  \u001b[32m✓\u001b[0m ' + n); } else { fail++; console.log('  \u001b[31m✗\u001b[0m ' + n + (e ? ' — ' + e : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function startGame(browser, name) {
  const p = await browser.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setViewport({ width: 900, height: 480 });
  await p.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForFunction("window.__game && window.__game.city && !document.getElementById('menu').classList.contains('hidden')", { timeout: 120000 });
  await p.evaluate(() => document.getElementById('btn-new').click());
  await wait(700);
  await p.evaluate((n) => { document.getElementById('cc-name').value = n; }, name);
  await p.evaluate(() => document.getElementById('cc-start').click());
  await wait(5000);
  p._errs = errs;
  return p;
}

(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await wait(1200);
  // два отдельных браузера: иначе фоновая вкладка засыпает и перестаёт слать состояние
  const launch = () => puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'] });
  const b = await launch();
  const b2 = await launch();

  console.log('\n\u001b[1mПубличная комната (MQTT)\u001b[0m   room=' + ROOM);
  const a = await startGame(b, 'Игрок А');
  const c = await startGame(b2, 'Игрок Б');

  const join = (page, x) => page.evaluate(async (room, broker, x) => {
    const g = window.__game;
    g.auth.signInGuest('тест');
    g.player3d.teleport(x, 0, 0);
    g.connectServer({ kind: 'room', name: 'CI комната', broker, room });
    await new Promise(r => setTimeout(r, 2500));
    return { connected: g.net.connected, kind: g.net.kind };
  }, ROOM, BROKER, x);

  const ra = await join(a, 0);
  const rc = await join(c, 14);
  ok('первый подключился к комнате', ra.connected === true && ra.kind === 'room', JSON.stringify(ra));
  ok('второй подключился к комнате', rc.connected === true, JSON.stringify(rc));

  await wait(6000);

  const seen = async (page) => page.evaluate(() => {
    const g = window.__game;
    const list = [...g.net.players.values()].map(p => ({ name: p.name, x: +p.tx.toFixed(1), z: +p.tz.toFixed(1) }));
    return { count: g.net.players.size, list };
  });
  const sa = await seen(a), sc = await seen(c);
  console.log('    A видит: ' + JSON.stringify(sa) + '\n    Б видит: ' + JSON.stringify(sc));
  ok('первый видит второго', sa.count >= 1, JSON.stringify(sa));
  ok('второй видит первого', sc.count >= 1, JSON.stringify(sc));
  ok('имена игроков синхронизированы', sa.list.some(p => /Игрок/.test(p.name)) && sc.list.some(p => /Игрок/.test(p.name)));
  ok('позиции не схлопнулись в ноль', sa.list.some(p => Math.abs(p.x) > 5) || sc.list.some(p => Math.abs(p.x) > 5),
    JSON.stringify([sa.list, sc.list]));

  // чат
  await a.evaluate(() => window.__game.chat.send ? window.__game.chat.send('привет из теста')
    : window.__game.net.send({ t: 'chat', text: 'привет из теста', kind: '' }));
  await wait(2500);
  const chatSeen = await c.evaluate(() => document.getElementById('chat-log').textContent);
  ok('чат долетает между игроками', /привет из теста/.test(chatSeen), chatSeen.slice(-80));

  // выход
  await a.evaluate(() => window.__game.net.disconnect());
  await wait(3000);
  const after = await seen(c);
  ok('после отключения игрок пропадает', after.count === 0, JSON.stringify(after));

  const errs = [...a._errs, ...c._errs];
  ok('без ошибок в консоли', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close(); await b2.close(); srv.kill();
  console.log('\n────────────────────────────────');
  console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : '0'}`);
  process.exit(fail === 0 ? 0 : 1);
})();

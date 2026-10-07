/* smoke.cjs — прогон игры в headless-браузере: ловим ошибки рантайма,
   проверяем что мир строится, персонаж создаётся, машина заводится, панели открываются.
   Запуск: node tools/smoke.cjs   (нужен puppeteer) */

const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8099;
const URL = `http://127.0.0.1:${PORT}/game.html`;

let pass = 0, fail = 0;
const ok = (n, c, extra) => {
  if (c) { pass++; console.log('  \u001b[32m✓\u001b[0m ' + n); }
  else { fail++; console.log('  \u001b[31m✗\u001b[0m ' + n + (extra ? ' — ' + extra : '')); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const server = spawn('node', ['tools/serve.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore'
  });
  await sleep(900);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--use-gl=angle', '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader', '--disable-dev-shm-usage',
      '--window-size=900,600'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });

  const errors = [];
  // проверка обновлений ходит на GitHub Pages — локально её ошибки ожидаемы
  const IGNORE = /github\.io|version\.json|ERR_FAILED|Failed to load resource/;
  const push = (s) => { if (!IGNORE.test(s)) errors.push(s); };
  const warnings = [];
  page.on('pageerror', e => push('pageerror: ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') {
      if (/WebGL|SwiftShader|GroupMarker|Automatic fallback/i.test(t)) return;
      push('console: ' + t);
    } else if (m.type() === 'warning') warnings.push(t);
  });
  page.on('requestfailed', r => push('404/fail: ' + r.url()));

  console.log('\n\u001b[1mЗагрузка игры\u001b[0m');
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // ждём, пока уйдёт лоадер (мир сгенерирован)
  let loaded = false;
  try {
    await page.waitForFunction(
      () => document.getElementById('loader').classList.contains('hidden'),
      { timeout: 240000, polling: 500 });
    loaded = true;
  } catch (e) {
    const txt = await page.evaluate(() => document.getElementById('load-text')?.textContent);
    ok('мир сгенерирован', false, 'застряло на: ' + txt);
  }
  if (loaded) ok('мир сгенерирован, загрузчик скрыт', true);

  const stats = await page.evaluate(() => {
    const g = window.__game;
    if (!g || !g.city) return null;
    return {
      colliders: g.city.colliders.length,
      pois: g.city.pois.length,
      chunks: g.city.chunks.size,
      nodes: g.city.roadNodes.length,
      parkSlots: g.parkedSlots.length,
      props: g.city.props.meshes.length,
      sceneChildren: g.scene.children.length,
      shops: g.city.pois.filter(p => p.type === 'shop').length,
      houses: g.city.pois.filter(p => p.type === 'house').length,
      jobs: g.city.pois.filter(p => p.type === 'job').length
    };
  });

  console.log('\n\u001b[1mМир\u001b[0m');
  ok('город построен', !!stats, 'game.city отсутствует');
  if (stats) {
    console.log('    ' + JSON.stringify(stats));
    ok('здания с коллизиями (>400)', stats.colliders > 400, String(stats.colliders));
    ok('POI размечены (>150)', stats.pois > 150, String(stats.pois));
    ok('чанки геометрии (>20)', stats.chunks > 20, String(stats.chunks));
    ok('граф дорог (>100 узлов)', stats.nodes > 100, String(stats.nodes));
    ok('инстансы реквизита (>10)', stats.props > 10, String(stats.props));
    ok('магазины есть', stats.shops > 10, String(stats.shops));
    ok('дома на продажу есть', stats.houses > 20, String(stats.houses));
    ok('работы размечены', stats.jobs > 2, String(stats.jobs));
    ok('места парковки', stats.parkSlots > 50, String(stats.parkSlots));
  }

  console.log('\n\u001b[1mСоздание персонажа\u001b[0m');
  await page.evaluate(() => document.getElementById('btn-new').click());
  await sleep(1200);
  const creatorVisible = await page.evaluate(() =>
    !document.getElementById('creator').classList.contains('hidden'));
  ok('экран создания открылся', creatorVisible);

  await page.evaluate(() => {
    document.getElementById('cc-name').value = 'Смоук Тестов';
    document.getElementById('cc-random').click();
  });
  await sleep(600);
  await page.evaluate(() => document.getElementById('cc-start').click());
  await sleep(2500);

  const inGame = await page.evaluate(() => {
    const g = window.__game;
    return g.player ? {
      name: g.player.name, money: g.player.money,
      hudVisible: !document.getElementById('hud').classList.contains('hidden'),
      paused: g.paused,
      x: Math.round(g.player3d.pos.x), z: Math.round(g.player3d.pos.z),
      inv: g.player.inventory.length
    } : null;
  });
  ok('игра стартовала', !!inGame);
  if (inGame) {
    console.log('    ' + JSON.stringify(inGame));
    ok('имя персонажа применено', inGame.name === 'Смоук Тестов');
    ok('HUD показан', inGame.hudVisible);
    ok('игра не на паузе', inGame.paused === false);
    ok('стартовый набор выдан', inGame.inv >= 2);
  }

  console.log('\n\u001b[1mРендер и производительность\u001b[0m');
  await sleep(3500);
  const perf = await page.evaluate(() => {
    const g = window.__game;
    const info = g.engine.renderer.info;
    return {
      fps: g.engine.fps,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      traffic: g.traffic.cars.length,
      peds: g.peds.list.length,
      parked: g.worldVehicles.length
    };
  });
  console.log('    ' + JSON.stringify(perf));
  ok('кадры рисуются', perf.drawCalls > 0, String(perf.drawCalls));
  ok('треугольники в сцене (>50k)', perf.triangles > 50000, String(perf.triangles));
  ok('draw calls в разумных пределах (<400)', perf.drawCalls < 400, String(perf.drawCalls));
  ok('текстур не слишком много (<60)', perf.textures < 60, String(perf.textures));
  ok('трафик заспавнен', perf.traffic > 0, String(perf.traffic));
  ok('пешеходы заспавнены', perf.peds > 0, String(perf.peds));
  ok('припаркованные авто есть', perf.parked > 0, String(perf.parked));

  console.log('\n\u001b[1mДвижение и физика\u001b[0m');
  const move = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player3d;
    const start = { x: p.pos.x, z: p.pos.z };
    g.controls.input.mx = 0; g.controls.input.my = 1; g.controls.touch.run = true;
    await new Promise(r => setTimeout(r, 4000));
    g.controls.input.my = 0; g.controls.touch.run = false;
    return { start, end: { x: p.pos.x, z: p.pos.z }, state: p.moveState, walked: p.distWalked };
  });
  const dist = Math.hypot(move.end.x - move.start.x, move.end.z - move.start.z);
  ok('персонаж перемещается', dist > 2, 'прошёл ' + dist.toFixed(1) + ' м');
  ok('счётчик пути работает', move.walked > 1, String(move.walked));

  const nan = await page.evaluate(() => {
    const p = window.__game.player3d.pos;
    return Number.isFinite(p.x) && Number.isFinite(p.z);
  });
  ok('координаты не NaN', nan);

  console.log('\n\u001b[1mТранспорт\u001b[0m');
  const drive = await page.evaluate(async () => {
    const g = window.__game;
    // телепорт к ближайшей машине и посадка
    const v = g.worldVehicles[0];
    if (!v) return { err: 'нет машин в мире' };
    // ставим машину на свободную полосу, чтобы не упереться в бордюр
    const node = g.city.roadNodes[Math.floor(g.city.roadNodes.length / 2)];
    const slot = g.parkedSlots.find(s => s.live === v);
    v.pos.x = node.x + 4.4; v.pos.z = node.z + 20;
    v.heading = 0; v.speed = 0;
    v.mesh.position.set(v.pos.x, 0, v.pos.z);
    if (slot) { slot.x = v.pos.x; slot.z = v.pos.z; }   // чтобы стриминг её не выгрузил
    g.player3d.teleport(v.pos.x + 1.5, v.pos.z, 0);
    await new Promise(r => setTimeout(r, 300));
    const found = g._findInteraction();
    g.interact();
    await new Promise(r => setTimeout(r, 300));
    const driving = g.player3d.mode === 'drive';
    if (!driving) return { err: 'не сел в машину, нашёл: ' + (found ? found.kind : 'ничего') };

    const p0 = { x: v.pos.x, z: v.pos.z };
    g.controls.input.my = 1;
    await new Promise(r => setTimeout(r, 6000));   // при софтверном рендере игровое время идёт медленнее
    g.controls.input.my = 0;
    const res = {
      driving: true,
      speed: v.speedKmh,
      moved: Math.hypot(v.pos.x - p0.x, v.pos.z - p0.z),
      fuel: v.fuel,
      finite: Number.isFinite(v.pos.x) && Number.isFinite(v.heading)
    };
    g.player3d.vehicle.speed = 0;
    g.interact();   // выйти
    await new Promise(r => setTimeout(r, 300));
    res.exited = g.player3d.mode === 'foot';
    return res;
  });
  if (drive.err) { ok('посадка в машину', false, drive.err); }
  else {
    console.log('    ' + JSON.stringify(drive));
    ok('сел за руль', drive.driving);
    ok('машина поехала', drive.moved > 3, drive.moved.toFixed(1) + ' м');
    ok('набрана скорость', drive.speed > 5, drive.speed.toFixed(1) + ' км/ч');
    ok('топливо расходуется', drive.fuel < 80);
    ok('координаты машины валидны', drive.finite);
    ok('вышел из машины', drive.exited);
  }

  console.log('\n\u001b[1mИнтерфейс\u001b[0m');
  const ui = await page.evaluate(async () => {
    const g = window.__game;
    const out = {};
    for (const name of ['inventory', 'jobs', 'phone', 'quests', 'dealership', 'bank', 'settings', 'servers', 'properties', 'vehicles']) {
      g.panels.open(name);
      await new Promise(r => setTimeout(r, 90));
      out[name] = document.getElementById('panel-body').children.length > 0 &&
                  !document.getElementById('panel').classList.contains('hidden');
    }
    g.panels.close();
    g.panels.open('shop', { name: 'Тест', shopKind: 'market' });
    await new Promise(r => setTimeout(r, 90));
    out.shop = document.getElementById('panel-body').children.length > 3;
    g.panels.close();

    g.openMap();
    await new Promise(r => setTimeout(r, 400));
    out.map = !document.getElementById('bigmap').classList.contains('hidden');
    g.closeMap();

    g.chat.handle('привет город');
    g.chat.handle('/me машет рукой');
    g.chat.handle('/help');
    g.chat.handle('/stats');
    g.chat.handle('/нетакой');
    out.chatLines = document.getElementById('chat-log').children.length;
    return out;
  });
  Object.entries(ui).forEach(([k, v]) => {
    if (k === 'chatLines') ok('чат принимает команды', v >= 4, 'строк ' + v);
    else ok('панель «' + k + '» рисуется', v === true);
  });

  console.log('\n\u001b[1mИгровые действия\u001b[0m');
  const actions = await page.evaluate(async () => {
    const g = window.__game;
    const out = {};
    const m0 = g.player.money;
    g.buyItem('burger', 1);
    out.bought = g.player.money < m0;
    out.inInv = g.player.inventory.some(i => i.id === 'burger');
    g.useItem('burger');
    out.used = !g.player.inventory.some(i => i.id === 'burger');

    g.player.licenses.drive = true;
    g.startJob('taxi');
    out.jobStarted = !!g.player.job;
    out.stops = g.player.job ? g.player.job.stops.length : 0;
    out.waypoint = !!g.waypoint;
    // телепорт на точку и сдача
    if (g.player.job) {
      const s = g.player.job.stops[0];
      g.player3d.teleport(s.x, s.z, 0);
      await new Promise(r => setTimeout(r, 250));
      const it = g._findInteraction();
      out.stopDetected = it && it.kind === 'jobstop';
      g.interact();
      out.stopDone = g.player.job && g.player.job.current === 1;
    }
    g.cancelJob();
    out.jobCancelled = g.player.job === null;

    g.player.money = 500000;
    g.buyVehicle('sedan');
    out.carBought = g.player.vehicles.length > 0;
    if (out.carBought) {
      g.summonVehicle(g.player.vehicles[0].plate);
      out.carSpawned = g.isVehicleSpawned(g.player.vehicles[0].plate);
    }

    g.setWaypoint(100, 100, 'Тест');
    out.wp = !!g.waypoint;

    g.saveGame(false);
    out.saved = !!localStorage.getItem('rp:save:v2');

    g.setQuality('LOW');
    out.qLow = g.engine.qualityName === 'LOW';
    g.setQuality('MEDIUM');
    return out;
  });
  console.log('    ' + JSON.stringify(actions));
  ok('покупка в магазине', actions.bought && actions.inInv);
  ok('использование предмета', actions.used);
  ok('смена начинается', actions.jobStarted && actions.stops > 0);
  ok('маршрут к точке ставится', actions.waypoint);
  ok('точка смены детектится', actions.stopDetected === true);
  ok('точка сдаётся', actions.stopDone === true);
  ok('смена отменяется', actions.jobCancelled);
  ok('авто покупается', actions.carBought);
  ok('авто подаётся на улицу', actions.carSpawned === true);
  ok('метка на карте ставится', actions.wp);
  ok('игра сохраняется', actions.saved);
  ok('переключение качества', actions.qLow);

  console.log('\n\u001b[1mДень/ночь и стабильность\u001b[0m');
  const night = await page.evaluate(async () => {
    const g = window.__game;
    g.engine.time = 1;         // глубокая ночь
    await new Promise(r => setTimeout(r, 900));
    const n = g.engine.nightAmount;
    g.engine.time = 13;        // день
    await new Promise(r => setTimeout(r, 900));
    return { night: n, day: g.engine.nightAmount, sunI: g.engine.sun.intensity };
  });
  ok('ночью темно', night.night > 0.8, String(night.night));
  ok('днём светло', night.day < 0.2, String(night.day));
  ok('солнце светит днём', night.sunI > 1.5, String(night.sunI));

  // долгий прогон
  await page.evaluate(async () => {
    const g = window.__game;
    g.controls.input.mx = 0.4; g.controls.input.my = 1; g.controls.touch.run = true;
    await new Promise(r => setTimeout(r, 6000));
    g.controls.input.mx = 0; g.controls.input.my = 0; g.controls.touch.run = false;
  });
  const final = await page.evaluate(() => {
    const g = window.__game;
    return {
      fps: g.engine.fps,
      finite: Number.isFinite(g.player3d.pos.x) && Number.isFinite(g.player3d.pos.z),
      health: g.player.stats.health,
      alive: g.player.stats.health > 0,
      drawCalls: g.engine.renderer.info.render.calls
    };
  });
  console.log('    ' + JSON.stringify(final));
  ok('после 6 с бега позиция валидна', final.finite);
  ok('игра не развалилась', final.alive && final.drawCalls > 0);

  console.log('\n\u001b[1mОшибки рантайма\u001b[0m');
  const real = errors.filter(e => !/favicon/i.test(e));
  ok('нет ошибок в консоли', real.length === 0, real.slice(0, 6).join(' | '));
  if (real.length) real.slice(0, 12).forEach(e => console.log('      ' + e));

  await browser.close();
  server.kill();

  console.log('\n────────────────────────────────');
  console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : '0'}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => {
  console.error('\nSMOKE CRASH:', e);
  process.exit(1);
});

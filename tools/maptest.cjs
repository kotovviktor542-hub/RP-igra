/* maptest.cjs — карта области в духе Black Russia: несколько населённых
   пунктов, трассы между ними, ориентиры городов, поля между городами. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8149;

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  \u001b[32m✓\u001b[0m ' + n); } else { fail++; console.log('  \u001b[31m✗\u001b[0m ' + n + (e ? ' — ' + e : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await wait(1200);
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error') {
      const t = m.text();
      if (!/WebSocket|mqtt|mosquitto|WebGL|SwiftShader/i.test(t)) errs.push(t);
    }
  });
  await page.setViewport({ width: 1100, height: 620 });
  await page.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    "window.__game && window.__game.city && !document.getElementById('menu').classList.contains('hidden')",
    { timeout: 120000 });
  await page.evaluate(() => document.getElementById('btn-new').click());
  await wait(1500);
  await page.evaluate(() => {
    document.getElementById('cc-name').value = 'Карта';
    document.getElementById('cc-start').click();
  });
  await wait(4000);
  await page.waitForFunction("window.__game && window.__game.player3d", { timeout: 60000 });

  console.log('\n\u001b[1mНаселённые пункты\u001b[0m');
  const geo = await page.evaluate(async () => {
    const C = await import('/js/world/city.js');
    const g = window.__game;
    const out = { settlements: C.SETTLEMENTS.length, names: [], towns: {}, fields: 0, empty: 0 };

    C.SETTLEMENTS.forEach(s => out.names.push(s.name));

    // каждый квартал должен принадлежать городу или быть полем
    for (let i = 0; i < C.GRID; i++) {
      for (let j = 0; j < C.GRID; j++) {
        const s = C.settlementAtCell(i, j);
        const d = g.city.districts[i][j];
        if (!s) { out.fields++; continue; }
        out.towns[s.id] = out.towns[s.id] || { cells: 0, types: {} };
        out.towns[s.id].cells++;
        out.towns[s.id].types[d] = (out.towns[s.id].types[d] || 0) + 1;
        if (!d) out.empty++;
      }
    }
    out.highways = C.HIGHWAYS.length;

    // ориентиры
    const lm = g.city.pois.filter(p => p.type === 'landmark');
    out.landmarks = lm.map(p => p.name);

    // работы у ориентиров
    out.jobsAtLandmarks = g.city.pois
      .filter(p => p.type === 'job' && ['mine', 'miner', 'diver'].includes(p.job))
      .map(p => p.job + ':' + p.name);

    return out;
  });
  console.log('    города: ' + geo.names.join(', '));
  console.log('    ориентиры: ' + geo.landmarks.join(', '));
  ok('на карте 10 населённых пунктов', geo.settlements === 10, String(geo.settlements));
  ['Нижегородск', 'Гарель', 'Лыткарино', 'Новая Рублёвка', 'Егоровка',
   'Арзамас', 'Корякино', 'Южный', 'Бусаево', 'Батырево']
    .forEach(n => ok(`есть город «${n}»`, geo.names.includes(n)));
  ok('города не пересекаются и покрывают кварталы',
     Object.values(geo.towns).every(t => t.cells > 0)
     && Object.values(geo.towns).reduce((a, t) => a + t.cells, 0) + geo.fields === 121,
     `занято ${Object.values(geo.towns).reduce((a, t) => a + t.cells, 0)}, поля ${geo.fields}`);
  ok('между городами есть поля', geo.fields > 10, String(geo.fields));
  ok('нет пустых кварталов', geo.empty === 0, String(geo.empty));
  ok('обозначены магистрали между городами', geo.highways === 2, String(geo.highways));

  console.log('\n\u001b[1mОриентиры городов\u001b[0m');
  ['Телебашня Южного', 'Правительство', 'Аукцион', 'Порт Нижегородска', 'Ж/д вокзал',
   'Шахта', 'Военкомат', 'Казино «Батырево»', 'Рынок Лыткарино', 'Авторынок', 'Завод Бусаево']
    .forEach(n => ok(`ориентир «${n}»`, geo.landmarks.includes(n)));
  ok('у шахты есть работа забойщика', geo.jobsAtLandmarks.some(s => s.startsWith('mine:')));
  ok('у шахты есть работа рудокопа', geo.jobsAtLandmarks.some(s => s.startsWith('miner:')));
  ok('в порту есть работа дайвера', geo.jobsAtLandmarks.some(s => s.startsWith('diver:')));

  console.log('\n\u001b[1mЗастройка по характеру города\u001b[0m');
  const build = await page.evaluate(() => {
    const g = window.__game;
    const C = { GRID: 11 };
    const find = id => {
      for (let i = 0; i < C.GRID; i++) for (let j = 0; j < C.GRID; j++) {
        if (g.city.cellTown[i][j] && g.city.cellTown[i][j].id === id) {
          return { i, j, d: g.city.districts[i][j] };
        }
      }
      return null;
    };
    // собираем все типы застройки по каждому городу
    const byTown = {};
    for (let i = 0; i < C.GRID; i++) for (let j = 0; j < C.GRID; j++) {
      const t = g.city.cellTown[i][j];
      if (!t) continue;
      byTown[t.id] = byTown[t.id] || {};
      byTown[t.id][g.city.districts[i][j]] = 1;
    }
    return { byTown, firstArzamas: find('arzamas') };
  });
  console.log('    ' + JSON.stringify(build.byTown));
  ok('в Арзамасе есть деловое ядро', !!build.byTown.arzamas.downtown);
  ok('в Арзамасе есть жильё', !!build.byTown.arzamas.residential);
  ok('в Южном есть административный квартал', !!build.byTown.yuzhny.civic);
  ok('в Нижегородске есть промзона порта', !!build.byTown.nizhegorodsk.industrial);
  ok('в Батырево есть промзона у шахты', !!build.byTown.batyrevo.industrial);
  ok('в Бусаево заводская зона', !!build.byTown.busaevo.industrial);
  ok('в Лыткарино торговый квартал', !!build.byTown.lytkarino.commercial);

  console.log('\n\u001b[1mБазы организаций по городам\u001b[0m');
  const bases = await page.evaluate(() => {
    const g = window.__game;
    const b = g.city.pois.filter(p => p.type === 'base' || p.type === 'prison');
    return b.map(p => ({ f: p.faction || p.name, x: Math.round(p.x), z: Math.round(p.z) }));
  });
  console.log('    ' + JSON.stringify(bases));
  ok('баз организаций не меньше 10', bases.length >= 10, String(bases.length));

  console.log('\n\u001b[1mПроизводительность и ошибки\u001b[0m');
  const perf = await page.evaluate(() => {
    const g = window.__game;
    const R = g.engine.renderer;
    return {
      calls: R.info.render.calls,
      geoms: R.info.memory.geometries,
      pois: g.city.pois.length,
      landmarkMeshes: (() => {
        let n = 0;
        g.scene.traverse(o => { if (o.isMesh) n++; });
        return n;
      })()
    };
  });
  console.log('    ' + JSON.stringify(perf));
  ok('POI на карте достаточно', perf.pois > 100, String(perf.pois));
  ok('геометрий в памяти в разумных пределах', perf.geoms < 9000, String(perf.geoms));
  ok('вызовов отрисовки в пределах бюджета', perf.calls < 900, String(perf.calls));
  ok('в сцене есть меши ориентиров', perf.landmarkMeshes > 500, String(perf.landmarkMeshes));
  ok('нет ошибок в консоли', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\n────────────────────────────────');
  console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : fail}`);
  await browser.close();
  srv.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });

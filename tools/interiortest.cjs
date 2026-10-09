/* interiortest.cjs — интерьеры: вход в магазин и в жильё, мебель, действия, выход. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8117;

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
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.setViewport({ width: 1100, height: 620 });
  await page.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    "window.__game && window.__game.city && !document.getElementById('menu').classList.contains('hidden')",
    { timeout: 120000 });
  await page.evaluate(() => document.getElementById('btn-new').click());
  await wait(1500);
  await page.evaluate(() => {
    document.getElementById('cc-name').value = 'Тестер';
    document.getElementById('cc-random').click();
  });
  await wait(700);
  await page.evaluate(() => document.getElementById('cc-start').click());
  await wait(4000);
  await page.waitForFunction("window.__game && window.__game.player3d", { timeout: 60000 });

  console.log('\n\u001b[1mИнтерьеры: магазин\u001b[0m');
  const shop = await page.evaluate(async () => {
    const g = window.__game;
    const poi = g.city.pois.find(p => p.type === 'shop' && p.shopKind === 'guns')
      || g.city.pois.find(p => p.type === 'shop');
    g.enterInterior({ kind: 'shop', shopKind: poi.shopKind, name: poi.name, poi, id: 'shop_' + poi.shopKind });
    await new Promise(r => setTimeout(r, 500));
    const p3 = g.player3d;
    const room = g.interiors.current.room;
    const tris = (() => { let n = 0; room.parts.traverse(o => { if (o.geometry?.index) n += o.geometry.index.count / 3; else if (o.geometry?.attributes?.position) n += o.geometry.attributes.position.count / 3; }); return Math.round(n); })();
    const calls = g.engine.renderer.info.render.calls;
    const meshes = (() => { let n = 0; room.parts.traverse(o => { if (o.isMesh) n++; }); return n; })();
    const lights = (() => { let n = 0; room.parts.traverse(o => { if (o.isLight) n++; }); return n; })();
    return {
      active: g.interiors.active,
      cityHidden: g.city.hidden === true,
      inside: Math.hypot(p3.pos.x + 4200, p3.pos.z + 4200) < 40,
      meshes, tris, lights,
      hasSeller: !!g.interiors.seller && g.interiors.seller.root.visible,
      actions: room.actions.map(a => a.kind),
      shopKind: poi.shopKind
    };
  });
  console.log('    ' + JSON.stringify(shop));
  ok('игрок внутри помещения', shop.active && shop.inside, JSON.stringify(shop));
  ok('город выключен ради кадров', shop.cityHidden === true);
  ok('интерьер собран из множества деталей', shop.tris > 1500, 'треугольников: ' + shop.tris);
  ok('в зале есть освещение', shop.lights >= 3, 'ламп: ' + shop.lights);
  ok('за кассой стоит продавец', shop.hasSeller === true);
  ok('есть касса и товар', shop.actions.includes('cashier') && shop.actions.length >= 2, shop.actions.join(','));

  const buy = await page.evaluate(async () => {
    const g = window.__game;
    g.player.money = 50000;
    const a = g.interiors.current.room.actions.find(x => x.kind === 'cashier');
    g.player3d.teleport(-4200 + a.x, -4200 + a.z + 0.5, 0);
    await new Promise(r => setTimeout(r, 120));
    const found = g._findInteraction();
    g.interact();
    await new Promise(r => setTimeout(r, 120));
    const panelOpen = !document.getElementById('panel').classList.contains('hidden');
    const title = document.getElementById('panel-title').textContent;
    const before = g.player.money;
    const id = g.interiors.current.def.shopKind === 'guns' ? 'pistol' : 'water';
    g.buyItem(id, 1);
    return { label: found?.label, panelOpen, title, bought: g.player.money < before,
      hasItem: g.player.inventory.some(i => i.id === id) };
  });
  console.log('    ' + JSON.stringify(buy));
  ok('подсказка у кассы появляется', !!buy.label, buy.label);
  ok('касса открывает витрину', buy.panelOpen === true, buy.title);
  ok('товар покупается внутри магазина', buy.bought && buy.hasItem);

  const walls = await page.evaluate(async () => {
    const g = window.__game, p3 = g.player3d;
    const room = g.interiors.current.room;
    const start = { x: p3.pos.x, z: p3.pos.z };
    // пытаемся пройти сквозь северную стену
    for (let i = 0; i < 90; i++) {
      p3.update(1 / 30, { mx: 0, my: 1, run: true }, g.interiors);
      p3.camYaw = 0;
    }
    const col = g.interiors.collidersNear(p3.pos.x, p3.pos.z, 2).length;
    return { moved: Math.hypot(p3.pos.x - start.x, p3.pos.z - start.z), col,
      insideBounds: Math.abs(p3.pos.z + 4200) < 7 };
  });
  console.log('    ' + JSON.stringify(walls));
  ok('стены не пропускают игрока', walls.insideBounds === true, JSON.stringify(walls));
  ok('коллайдеры интерьера работают', walls.col > 0);

  const out = await page.evaluate(async () => {
    const g = window.__game;
    g.leaveInterior();
    await new Promise(r => setTimeout(r, 300));
    return { active: g.interiors.active, cityBack: g.city.hidden === false,
      outside: Math.abs(g.player3d.pos.x) < 1200 };
  });
  ok('выход возвращает на улицу', out.active === false && out.outside === true, JSON.stringify(out));
  ok('город снова виден', out.cityBack === true);

  console.log('\n\u001b[1mИнтерьеры: жильё\u001b[0m');
  const home = await page.evaluate(async () => {
    const g = window.__game;
    const p = g.player;
    p.money = 400000;
    const flat = g.city.pois.find(x => x.type === 'apartment');
    const house = g.city.pois.find(x => x.type === 'house');
    const target = flat || house;
    const bought = window.S ? null : null;
    const r = g.interiors && target ? true : false;
    // покупаем и заходим
    const S = await import('/js/game/state.js');
    const buy = S.buyProperty(p, target);
    g.enterInterior({ kind: 'home', big: target.type === 'house', id: target.id, name: target.name, poi: target });
    await new Promise(r2 => setTimeout(r2, 400));
    const room = g.interiors.current.room;
    const kinds = room.actions.map(a => a.kind);

    // кровать
    const bedA = room.actions.find(a => a.kind === 'bed');
    p.stats.energy = 20;
    g._doIndoor(bedA);
    const slept = p.stats.energy > 70;
    document.querySelectorAll('#dialog .btn').forEach(b => b.click());

    // сейф
    S.addItem(p, 'bandage', 2);
    const put = S.stashPut(p, target.id, 'bandage', 1);
    const inStash = S.stashList(p, target.id).some(i => i.id === 'bandage');
    const take = S.stashTake(p, target.id, 'bandage', 1);

    // холодильник
    g._fridgeCd = 0;
    const invBefore = p.inventory.reduce((s, i) => s + i.qty, 0);
    g._doIndoor({ kind: 'fridge' });
    const invAfter = p.inventory.reduce((s, i) => s + i.qty, 0);

    // гардероб
    g._doIndoor({ kind: 'wardrobe' });
    const wardrobeOpen = document.getElementById('panel-title').textContent;

    return {
      hasApartments: !!flat, bought: buy.ok, apartments: g.city.pois.filter(x => x.type === 'apartment').length,
      kinds, slept, stash: put.ok && inStash && take.ok,
      fridge: invAfter > invBefore, wardrobeOpen,
      tris: (() => { let n = 0; room.parts.traverse(o => { if (o.geometry?.index) n += o.geometry.index.count / 3; else if (o.geometry?.attributes?.position) n += o.geometry.attributes.position.count / 3; }); return Math.round(n); })()
    };
  });
  console.log('    ' + JSON.stringify(home));
  ok('в городе есть квартиры с подъездами', home.hasApartments === true, 'квартир: ' + home.apartments);
  ok('жильё покупается', home.bought === true);
  ok('в квартире есть кровать, шкаф, сейф, кухня',
    ['bed', 'wardrobe', 'stash', 'fridge', 'tv'].every(k => home.kinds.includes(k)), home.kinds.join(','));
  ok('мебель детализирована', home.tris > 1500, 'треугольников: ' + home.tris);
  ok('в кровати можно выспаться', home.slept === true);
  ok('сейф хранит вещи', home.stash === true);
  ok('из холодильника берут еду', home.fridge === true);
  ok('гардероб открывается', /Гардероб/.test(home.wardrobeOpen), home.wardrobeOpen);

  const perf = await page.evaluate(async () => {
    const g = window.__game;
    const info = g.engine.renderer.info;
    await new Promise(r => setTimeout(r, 1500));
    return { drawCalls: info.render.calls, tris: info.render.triangles };
  });
  console.log('    ' + JSON.stringify(perf));
  ok('внутри сцена лёгкая', perf.drawCalls < 120, JSON.stringify(perf));

  await page.evaluate(() => window.__game.leaveInterior());
  await wait(500);
  ok('без ошибок в консоли', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close(); srv.kill();
  console.log('\n────────────────────────────────');
  console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : '0'}`);
  process.exit(fail === 0 ? 0 : 1);
})();

/* citytest.cjs — машины (фары, физика, гараж), скамейки, производительность города. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8123;

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
  await page.setViewport({ width: 1100, height: 620 });
  await page.goto(`http://127.0.0.1:${PORT}/game.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    "window.__game && window.__game.city && !document.getElementById('menu').classList.contains('hidden')",
    { timeout: 120000 });
  await page.evaluate(() => document.getElementById('btn-new').click());
  await wait(1500);
  await page.evaluate(() => {
    document.getElementById('cc-name').value = 'Водитель';
    document.getElementById('cc-random').click();
  });
  await wait(700);
  await page.evaluate(() => document.getElementById('cc-start').click());
  await wait(3500);
  await page.waitForFunction("window.__game && window.__game.player3d", { timeout: 60000 });

  console.log('\n\u001b[1mМашины\u001b[0m');
  const car = await page.evaluate(async () => {
    const g = window.__game, p3 = g.player3d;
    g.player.money = 500000;
    g.player.licenses.drive = true;
    g.buyVehicle('sports');
    const plate = g.player.vehicles[0].plate;
    g.summonVehicle(plate);
    await new Promise(r => setTimeout(r, 300));
    const v = g.worldVehicles.find(x => x.plate === plate);
    const parts = (() => { let n = 0; v.mesh.traverse(o => { if (o.isMesh) n++; }); return n; })();
    const tris = (() => { let n = 0; v.mesh.traverse(o => { if (o.geometry?.index) n += o.geometry.index.count / 3; else if (o.geometry?.attributes?.position) n += o.geometry.attributes.position.count / 3; }); return Math.round(n); })();
    p3.teleport(v.pos.x + 1.5, v.pos.z, 0);
    const found = g._findInteraction();
    g.interact();
    const driving = p3.mode === 'drive';

    // разгон и торможение
    for (let i = 0; i < 90; i++) p3.update(1 / 30, { throttle: 1, steer: 0, brake: 0 }, g.city);
    const topSpeed = v.speedKmh;
    for (let i = 0; i < 60; i++) p3.update(1 / 30, { throttle: 0, steer: 0, brake: 1 }, g.city);
    const afterBrake = v.speedKmh;

    // поворот руля меняет курс
    const h0 = v.heading;
    for (let i = 0; i < 60; i++) p3.update(1 / 30, { throttle: 1, steer: 1, brake: 0 }, g.city);
    const turned = Math.abs(v.heading - h0) > 0.2;

    // фары
    g.toggleLights();
    v.update(0.1, { throttle: 0, steer: 0, brake: 1 }, g.city);
    const lights = v.headlights.map(l => ({ on: l.visible, i: l.intensity, spot: l.isSpotLight === true }));
    const fuelDrop = v.fuel < v.maxFuel;

    return { parts, tris, found: found?.kind, driving, topSpeed, afterBrake, turned, lights, fuelDrop,
      damage: v.damage, plate };
  });
  console.log('    ' + JSON.stringify(car).slice(0, 320));
  ok('модель машины из множества деталей', car.parts >= 8 && car.tris > 800, `детали ${car.parts}, тр. ${car.tris}`);
  ok('в машину можно сесть', car.found === 'enter' && car.driving === true);
  ok('машина разгоняется', car.topSpeed > 40, 'км/ч: ' + Math.round(car.topSpeed));
  ok('тормоза работают', car.afterBrake < car.topSpeed * 0.6, `${Math.round(car.topSpeed)} → ${Math.round(car.afterBrake)}`);
  ok('руль поворачивает машину', car.turned === true);
  ok('фары светят по-настоящему', car.lights.every(l => l.on && l.i > 0 && l.spot), JSON.stringify(car.lights));
  ok('топливо расходуется', car.fuelDrop === true);

  const garage = await page.evaluate(async () => {
    const g = window.__game;
    const house = g.city.pois.find(x => x.type === 'house');
    const S = await import('/js/game/state.js');
    g.player.money = 500000;
    S.buyProperty(g.player, house);
    g.player3d.exitVehicle();
    g.player3d.teleport(house.garage.x, house.garage.z + 1, 0);
    const found = g._findInteraction();
    g.storeVehicle(g.player.vehicles[0].plate);
    const stored = g.player.vehicles[0].stored === true
      && !g.worldVehicles.some(v => v.plate === g.player.vehicles[0].plate);
    g._garageSpot = house.garage;
    g.summonVehicle(g.player.vehicles[0].plate);
    await new Promise(r => setTimeout(r, 200));
    const back = g.worldVehicles.find(v => v.plate === g.player.vehicles[0].plate);
    const atGarage = back && Math.hypot(back.pos.x - house.garage.x, back.pos.z - house.garage.z) < 3;
    return { found: found?.kind, stored, atGarage };
  });
  console.log('    ' + JSON.stringify(garage));
  ok('у дома есть гараж', garage.found === 'garage');
  ok('машина убирается в гараж', garage.stored === true);
  ok('машина выезжает из гаража', garage.atGarage === true);

  console.log('\n\u001b[1mПерсонаж\u001b[0m');
  const ped = await page.evaluate(async () => {
    const g = window.__game, p3 = g.player3d;
    const b = g.city.benches[0];
    p3.teleport(b.x, b.z + 1, 0);
    const found = g._findInteraction();
    g.interact();
    const sitting = p3.sitting === true && p3.yOffset > 0.3;
    const standLabel = g._findInteraction()?.kind;
    // шаг вперёд поднимает со скамейки
    p3.update(1 / 30, { mx: 0, my: 1, run: false }, g.city);
    const stoodUp = p3.sitting === false;
    // прыжок
    p3.teleport(b.x + 4, b.z + 4, 0);
    p3.grounded = true;
    p3.update(1 / 30, { mx: 0, my: 0, jump: true }, g.city);
    const jumped = p3.vy > 0 && p3.grounded === false;
    for (let i = 0; i < 60; i++) p3.update(1 / 30, {}, g.city);
    const landed = p3.grounded === true && Math.abs(p3.yOffset) < 0.01;
    return { benches: g.city.benches.length, found: found?.kind, sitting, standLabel, stoodUp, jumped, landed };
  });
  console.log('    ' + JSON.stringify(ped));
  ok('в городе есть скамейки', ped.benches > 20, 'скамеек: ' + ped.benches);
  ok('на скамейку можно присесть', ped.found === 'bench' && ped.sitting === true);
  ok('сидя предлагают встать', ped.standLabel === 'stand');
  ok('шаг поднимает со скамейки', ped.stoodUp === true);
  ok('персонаж прыгает', ped.jumped === true);
  ok('и приземляется', ped.landed === true);

  console.log('\n\u001b[1mКадры\u001b[0m');
  const perf = await page.evaluate(async () => {
    const g = window.__game;
    g.player3d.teleport(0, 0, 0);
    await new Promise(r => setTimeout(r, 2500));
    const info = g.engine.renderer.info;
    return { fps: g.engine.fps, calls: info.render.calls, tris: info.render.triangles, lights: (() => {
      let n = 0; g.scene.traverse(o => { if (o.isLight) n++; }); return n;
    })() };
  });
  console.log('    ' + JSON.stringify(perf));
  ok('сцена не перегружена вызовами отрисовки', perf.calls < 420, JSON.stringify(perf));
  ok('источников света немного', perf.lights < 40, 'ламп: ' + perf.lights);
  ok('без ошибок в консоли', errs.length === 0, errs.slice(0, 3).join(' | '));

  await browser.close(); srv.kill();
  console.log('\n────────────────────────────────');
  console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : '0'}`);
  process.exit(fail === 0 ? 0 : 1);
})();

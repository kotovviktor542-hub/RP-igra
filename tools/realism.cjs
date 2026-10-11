/* realism.cjs — проверка «живого мира»: погода, рабочие светофоры и ПДД,
   физика машины (занос, передачи, урон, взрыв), звук, медицина. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8137;

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  \u001b[32m✓\u001b[0m ' + n); } else { fail++; console.log('  \u001b[31m✗\u001b[0m ' + n + (e ? ' — ' + e : '')); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn('node', ['tools/serve.js'], { env: { ...process.env, PORT }, stdio: 'ignore' });
  await wait(1200);
  const browser = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
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

  /* ---------------- ПОГОДА ---------------- */
  console.log('\n\u001b[1mПогода\u001b[0m');
  const wx = await page.evaluate(() => {
    const g = window.__game, w = g.weather;
    if (!w) return null;
    const out = { ids: [], grips: {}, fogs: {}, wired: g.engine.weather === w };
    ['clear', 'clouds', 'overcast', 'rain', 'storm', 'fog'].forEach(id => {
      w.setType(id);
      w.update(2.5, g.player3d.pos, 0.2);
      out.ids.push(id);
      out.grips[id] = +w.grip.toFixed(2);
      out.fogs[id] = +w.fogMul.toFixed(2);
    });
    w.setType('storm');
    for (let k = 0; k < 6; k++) w.update(1.0, g.player3d.pos, 0.5);
    out.pointsVisible = w.points.visible;
    out.opacity = +w.points.material.opacity.toFixed(2);
    out.temp = Math.round(w.temp);
    w.setType('clear');
    w.update(2.5, g.player3d.pos, 0.2);
    return out;
  });
  console.log('    ' + JSON.stringify(wx));
  ok('система погоды создана и привязана к движку', wx && wx.wired === true);
  ok('6 состояний погоды', wx.ids.length === 6);
  ok('дождь ухудшает сцепление', wx.grips.rain < wx.grips.clear && wx.grips.rain < 0.85,
     JSON.stringify(wx.grips));
  ok('гроза — самое скользкое покрытие', wx.grips.storm < wx.grips.rain);
  ok('туман режет видимость', wx.fogs.fog < 0.4 && wx.fogs.clear === 1, JSON.stringify(wx.fogs));
  ok('в грозу идут частицы дождя', wx.pointsVisible === true && wx.opacity > 0.3);
  ok('температура считается', wx.temp > -20 && wx.temp < 45, String(wx.temp));

  /* ---------------- СВЕТОФОРЫ ---------------- */
  console.log('\n\u001b[1mСветофоры и ПДД\u001b[0m');
  const tl = await page.evaluate(() => {
    const g = window.__game, L = g.city.lights;
    const out = {
      count: L.list.length,
      heads: L.heads.length,
      emitted: L.emittedTris,
      lamps: L.lamps ? L.lamps.count : 0,
      lampTris: L.lamps ? L.lamps.geometry.attributes.position.count / 3 * L.lamps.count : 0
    };
    // фазы должны переключаться
    const inter = L.list[0];
    const seen = new Set();
    for (let t = 0; t < 40; t++) { L.time = t; seen.add(L.axisState(inter, 0)); }
    out.phases = [...seen].sort().join(',');
    // на одной оси зелёный — на другой красный
    L.time = 0;
    out.cross = L.axisState(inter, 0) !== L.axisState(inter, 1);
    return out;
  });
  console.log('    ' + JSON.stringify(tl));
  ok('светофоры расставлены по перекрёсткам', tl.count >= 20, String(tl.count));
  ok('на каждом 4 стойки с головками', tl.heads === tl.count * 4);
  ok('корпуса уезжают в стриминг кварталов', tl.emitted > 3000 && tl.emitted < 20000, String(tl.emitted));
  ok('линзы — один InstancedMesh на весь город', tl.lamps === tl.heads * 3);
  ok('линзы дешёвые (< 6 тыс. треугольников)', tl.lampTris < 6000, String(tl.lampTris));
  ok('цикл проходит красный, жёлтый и зелёный', tl.phases === 'green,red,yellow', tl.phases);
  ok('пересекающиеся направления не горят вместе', tl.cross === true);

  const obey = await page.evaluate(async () => {
    const g = window.__game;
    // ставим машину трафика перед перекрёстком со светофором и ждём красный
    const L = g.city.lights;
    const inter = L.list[Math.floor(L.list.length / 2)];
    const node = g.city.nearestNode(inter.x, inter.z);
    // находим узел-подход по оси X
    const approach = g.city.roadNodes.find(n => n.j === node.j && n.i === node.i - 1);
    if (!approach) return null;
    g.traffic.cars.length = 0;
    g.traffic.max = 1;
    const before = g.traffic.cars.length;
    g.traffic._spawn(inter.x, inter.z);
    const car = g.traffic.cars[0];
    if (!car) return null;
    car.node = approach;
    car.next = node;
    g.traffic._placeOnLane(car);
    // дождаться красного по оси X
    let guard = 0;
    while (L.axisState(inter, 0) !== 'red' && guard++ < 600) L.time += 0.1;
    const stopped = [];
    for (let k = 0; k < 120; k++) {
      g.traffic.update(1 / 30, inter.x, inter.z, null, 1);
      L.time += 1 / 30;
      stopped.push(car.v.speedKmh);
      if (L.axisState(inter, 0) === 'green') break;
    }
    return { before, minSpeed: +Math.min(...stopped).toFixed(2), signal: car.signal };
  });
  console.log('    ' + JSON.stringify(obey));
  ok('трафик останавливается на красный', obey && obey.minSpeed < 2.5, JSON.stringify(obey));

  const fine = await page.evaluate(() => {
    const g = window.__game;
    const L = g.city.lights;
    const inter = L.list[1];
    L.time = 0;
    // ищем фазу, где ось 0 красная
    let guard = 0;
    while (L.axisState(inter, 0) !== 'red' && guard++ < 600) L.time += 0.1;
    const v = g.player3d.vehicle || g._forceVehicle;
    return { hasRuleCheck: typeof g._checkTrafficRules === 'function',
             hasAxis: typeof g._travelAxis === 'function',
             axisX: g._travelAxis(Math.PI / 2), axisZ: g._travelAxis(0) };
  });
  console.log('    ' + JSON.stringify(fine));
  ok('проверка ПДД подключена', fine.hasRuleCheck && fine.hasAxis);
  ok('ось движения определяется верно', fine.axisX === 0 && fine.axisZ === 1);

  /* ---------------- ФИЗИКА МАШИНЫ ---------------- */
  console.log('\n\u001b[1mФизика машины\u001b[0m');
  // выдаём игроку машину и сажаем за руль
  await page.evaluate(() => {
    const g = window.__game;
    g.player.money = 500000;
    if (!g.player.vehicles.length) g.buyVehicle('sedan');
    const plate = g.player.vehicles[0].plate;
    g.summonVehicle(plate);
    const v = g.worldVehicles.find(c => c.plate === plate);
    g._bindVehicleEvents(v);
    g.player3d.enterVehicle(v);
  });
  await wait(600);

  const phys = await page.evaluate(() => {
    const g = window.__game;
    const v = g.player3d.vehicle;
    if (!v) return null;
    v.engineOn = true; v.fuel = 60; v.damage = 0; v.destroyed = false;
    v.speed = 0; v.latSpeed = 0; v.heading = 0;

    // разгон до максимума (седан: 44 м/с = 158 км/ч, нужен длинный разгон)
    const gearsUsed = new Set();
    for (let i = 0; i < 1500; i++) {
      v.update(1 / 60, { throttle: 1, steer: 0, brake: 0 }, null, 1);
      gearsUsed.add(v.gear);
    }
    const topSpeed = v.speedKmh;
    const specKmh = v.spec.maxSpeed * 3.6;

    // занос на ручнике
    v.speed = 22; v.latSpeed = 0; v.heading = 0;
    let maxLat = 0;
    for (let i = 0; i < 90; i++) {
      v.update(1 / 60, { throttle: 0.6, steer: 1, brake: 0, handbrake: true }, null, 1);
      maxLat = Math.max(maxLat, Math.abs(v.latSpeed));
    }
    const drift = maxLat;

    // на сухом сцеплении занос меньше, чем на мокром
    v.speed = 22; v.latSpeed = 0;
    let wetLat = 0;
    for (let i = 0; i < 90; i++) {
      v.update(1 / 60, { throttle: 0.6, steer: 1, brake: 0, handbrake: true }, null, 0.6);
      wetLat = Math.max(wetLat, Math.abs(v.latSpeed));
    }

    // крен корпуса
    v.speed = 18; v.latSpeed = 3;
    for (let i = 0; i < 30; i++) v.update(1 / 60, { throttle: 0.4, steer: 1, brake: 0 }, null, 1);
    const roll = v.roll;

    // тормозной путь на сухом и мокром
    const brakeDist = (grip) => {
      v.speed = 25; v.latSpeed = 0; v.pos.set(0, 0, 0);
      let d = 0;
      for (let i = 0; i < 600 && v.speedKmh > 1; i++) {
        const p0 = v.pos.z;
        v.update(1 / 60, { throttle: 0, steer: 0, brake: 1 }, null, grip);
        d += Math.abs(v.pos.z - p0);
      }
      return +d.toFixed(1);
    };
    const dry = brakeDist(1), wet = brakeDist(0.6);

    return {
      topSpeed: +topSpeed.toFixed(1),
      specKmh: +specKmh.toFixed(0),
      gears: gearsUsed.size,
      rpm: +v.rpm.toFixed(2),
      drift: +drift.toFixed(2),
      wetDrift: +wetLat.toFixed(2),
      roll: +roll.toFixed(3),
      dryBrake: dry, wetBrake: wet
    };
  });
  console.log('    ' + JSON.stringify(phys));
  ok('машина выходит на паспортную скорость', phys.topSpeed > phys.specKmh * 0.9,
     `${phys.topSpeed} из ${phys.specKmh} км/ч`);
  ok('коробка переключает несколько передач', phys.gears >= 3, String(phys.gears));
  ok('обороты считаются для звука и тахометра', phys.rpm > 0.1 && phys.rpm <= 1, String(phys.rpm));
  ok('ручник срывает машину в занос', phys.drift > 1.5, String(phys.drift));
  ok('на мокром асфальте занос сильнее', phys.wetDrift > phys.drift,
     `${phys.wetDrift} vs ${phys.drift}`);
  ok('кузов кренится в повороте', Math.abs(phys.roll) > 0.02, String(phys.roll));
  ok('тормозной путь на мокром длиннее', phys.wetBrake > phys.dryBrake,
     `${phys.wetBrake} vs ${phys.dryBrake}`);

  /* ---------------- УРОН И ВЗРЫВ ---------------- */
  console.log('\n\u001b[1mПовреждения техники\u001b[0m');
  const dmg = await page.evaluate(() => {
    const g = window.__game;
    const v = g.player3d.vehicle;
    if (!v) return null;
    v.damage = 0; v.destroyed = false; v.burning = false; v._burnT = 0;
    let hitEvents = 0, explode = 0, burnCalls = 0;
    g._bindVehicleEvents(v);
    v.onHit = () => hitEvents++;
    v.onExplode = () => explode++;
    v.onBurn = () => burnCalls++;
    v.hit(30);
    const afterHit = +v.damage.toFixed(3);
    v.damage = 0.9; v.burning = false; v._burnT = 0;
    for (let i = 0; i < 600; i++) v.update(1 / 60, { throttle: 0, steer: 0, brake: 0 }, null, 1);
    return {
      afterHit, burnCalls, explode,
      destroyed: v.destroyed, engineOff: !v.engineOn,
      powerLoss: +((1 - v.damage) * 100).toFixed(0)
    };
  });
  console.log('    ' + JSON.stringify(dmg));
  ok('удар наносит урон', dmg.afterHit > 0, String(dmg.afterHit));
  ok('подбитая машина начинает гореть', dmg.burnCalls > 10, String(dmg.burnCalls));
  ok('через несколько секунд горения — взрыв', dmg.explode === 1);
  ok('после взрыва машина уничтожена и двигатель заглох', dmg.destroyed && dmg.engineOff);

  const rep = await page.evaluate(() => {
    const g = window.__game, v = g.player3d.vehicle;
    v.damage = 0.8; v.burning = true;
    v.repair(1);
    return { damage: v.damage, burning: v.burning, destroyed: v.destroyed };
  });
  console.log('    ' + JSON.stringify(rep));
  ok('ремонт восстанавливает машину', rep.damage === 0 && rep.burning === false, JSON.stringify(rep));

  /* ---------------- ЗВУК ---------------- */
  console.log('\n\u001b[1mЗвук\u001b[0m');
  const audio = await page.evaluate(async () => {
    const m = await import('/js/core/audio.js');
    const A = m.SFX;
    A.init();
    const out = { ready: A.ready };
    if (!A.ready) return out;
    A.setVolume(0.5);
    A.engine({ on: true, rpm: 0.6, load: 0.5, vol: 1 });
    out.engineGain = A.engGain.gain.value > 0 || true;
    A.siren(true, 1, 0);
    A.sirenTick(0.05);
    A.gunshot('rifle', 0);
    A.gunshot('pistol', 30);
    A.step('asphalt', true);
    A.impact(1.4, 0);
    A.glass();
    A.hurt();
    A.explosion();
    A.thunder(0.8);
    A.cash();
    A.notify(true);
    A.radio();
    A.horn(0);
    A.door(true);
    A.ui('click');
    A.setWeather(0.8, 0.4, false);
    A.skid(0.7, 1);
    A.engine({ on: false });
    out.muted = A.muted;
    A.setMuted(true); out.muteWorks = A.master.gain.value === 0;
    A.setMuted(false);
    return out;
  });
  console.log('    ' + JSON.stringify(audio));
  ok('звуковой движок инициализируется', audio.ready === true);
  ok('все звуковые события отрабатывают без ошибок', audio.muteWorks === true);

  /* ---------------- МЕДИЦИНА ---------------- */
  console.log('\n\u001b[1mМедицина\u001b[0m');
  const med = await page.evaluate(() => {
    const g = window.__game, p = g.player;
    p.stats.health = 100;
    g.bleeding = 0;
    g._startBleed(50);
    const started = g.bleeding;
    const h0 = p.stats.health;
    for (let i = 0; i < 600; i++) g._tickBleed(1 / 60);
    const h1 = p.stats.health;
    g.stopBleed(true);
    return { started, lost: +(h0 - h1).toFixed(2), after: g.bleeding };
  });
  console.log('    ' + JSON.stringify(med));
  ok('кровотечение открывается от тяжёлого урона', med.started >= 50, String(med.started));
  ok('кровотечение отнимает здоровье', med.lost > 0.5, String(med.lost));
  ok('перевязка останавливает кровь', med.after === 0);

  /* ---------------- HUD ---------------- */
  console.log('\n\u001b[1mHUD\u001b[0m');
  const hud = await page.evaluate(() => {
    const g = window.__game;
    g.hud.drawSpeedo(g.player3d.vehicle);
    const gear = document.getElementById('speed-gear');
    const dmgEl = document.getElementById('dmg-fill');
    const wx = document.getElementById('hud-weather');
    g.hud.update(g.player, g.engine, g.player3d, {
      wanted: 0, ammoText: '', armed: false,
      weather: { icon: '🌧', name: 'Дождь', temp: 11.4 }, bleeding: 0
    });
    return {
      gearExists: !!gear, gearText: gear ? gear.textContent : null,
      dmgExists: !!dmgEl,
      wxVisible: wx ? !wx.classList.contains('hidden') : false,
      wxText: wx ? document.getElementById('wx-txt').textContent : null
    };
  });
  console.log('    ' + JSON.stringify(hud));
  ok('в спидометре появилась передача', hud.gearExists && !!hud.gearText, hud.gearText);
  ok('в спидометре есть индикатор повреждений', hud.dmgExists === true);
  ok('погода показывается в HUD', hud.wxVisible === true && /Дождь/.test(hud.wxText || ''), hud.wxText);

  /* ---------------- ОШИБКИ ---------------- */
  const real = errs.filter(e => !/WebSocket|mqtt|mosquitto/i.test(e));
  console.log('\n\u001b[1mОшибки рантайма\u001b[0m');
  ok('нет ошибок в консоли', real.length === 0, real.slice(0, 4).join(' | '));

  console.log('\n────────────────────────────────');
  console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : fail}`);
  await browser.close();
  srv.kill();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });

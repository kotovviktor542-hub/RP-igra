/* check.js — проверка игровой логики без браузера.  node tools/check.js */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');

// localStorage-заглушка до импорта модулей
globalThis.localStorage = {
  _d: new Map(),
  getItem(k) { return this._d.has(k) ? this._d.get(k) : null; },
  setItem(k, v) { this._d.set(k, String(v)); },
  removeItem(k) { this._d.delete(k); }
};

const { ITEMS, SHOP_STOCK, JOBS, QUESTS, ECONOMY, DEALERSHIP } =
  await import(path.join(WWW, 'js/game/content.js'));
const S = await import(path.join(WWW, 'js/game/state.js'));
const { makeRNG, clamp, resolveCircleBoxes, scaleBoxUV, SpatialGrid, fmtMoney } =
  await import(path.join(WWW, 'js/core/utils.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  \u001b[32m✓\u001b[0m ' + name); }
  else { fail++; console.log('  \u001b[31m✗\u001b[0m ' + name + (extra ? ' — ' + extra : '')); }
};
const group = (n, f) => { console.log('\n\u001b[1m' + n + '\u001b[0m'); f(); };

/* ======================= СТРУКТУРА ======================= */
group('Файлы проекта', () => {
  const need = [
    'index.html', 'game.html', 'manifest.webmanifest', 'version.json', 'css/ui.css',
    'img/icon-192.png', 'img/icon-512.png', 'js/core/updater.js',
    'vendor/three.module.js', 'vendor/BufferGeometryUtils.js',
    'js/main.js', 'js/core/engine.js', 'js/core/textures.js', 'js/core/utils.js',
    'js/world/city.js', 'js/world/buildings.js', 'js/world/props.js',
    'js/entities/player.js', 'js/entities/vehicle.js', 'js/entities/humanoid.js', 'js/entities/ai.js',
    'js/game/content.js', 'js/game/state.js',
    'js/ui/hud.js', 'js/ui/panels.js', 'js/ui/chat.js', 'js/ui/map.js', 'js/ui/creator.js', 'js/ui/controls.js',
    'js/net/client.js'
  ];
  need.forEach(f => ok(f, fs.existsSync(path.join(WWW, f))));
  ok('server/server.js', fs.existsSync(path.join(ROOT, 'server/server.js')));
  ok('capacitor.config.json', fs.existsSync(path.join(ROOT, 'capacitor.config.json')));

  const html = fs.readFileSync(path.join(WWW, 'game.html'), 'utf8');
  ok('game.html грузит main.js как модуль', /type="module"[^>]*js\/main\.js/.test(html));
  ok('нет внешних CDN-ссылок', !/src="https?:\/\//.test(html));
  ok('заголовок Horizons RP', /<title>Horizons RP<\/title>/.test(html));
  ok('бренд в меню переименован', !/CITY<span>/.test(html) && /HORIZONS<span>/.test(html));
  ok('есть оверлей "поверни телефон"', /id="rotate"/.test(html));
  ok('есть кнопка обновления', /id="btn-update"/.test(html));

  const loader = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  ok('лаунчер знает номер сборки', /var LOCAL_BUILD = \d+;/.test(loader));
  ok('лаунчер ведёт на онлайн-версию', /github\.io\/RP-igra\//.test(loader));
  ok('лаунчер умеет запускать офлайн', /\.\/game\.html/.test(loader));

  const manifest = JSON.parse(fs.readFileSync(path.join(WWW, 'manifest.webmanifest'), 'utf8'));
  ok('манифест: имя Horizons RP', manifest.name === 'Horizons RP');
  ok('манифест: ландшафтная ориентация', manifest.orientation === 'landscape');

  const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  ok('Capacitor: appName Horizons RP', cap.appName === 'Horizons RP');
  ok('Capacitor: разрешён переход на онлайн-версию',
    (cap.server.allowNavigation || []).includes('kotovviktor542-hub.github.io'));

  ok('есть ресурсы иконок для Android', fs.existsSync(path.join(ROOT, 'resources/android/mipmap-xxxhdpi/ic_launcher.png')));
  ok('есть скрипт патча Android', fs.existsSync(path.join(ROOT, 'tools/patch-android.js')));
  const patch = fs.readFileSync(path.join(ROOT, 'tools/patch-android.js'), 'utf8');
  ok('патч ставит ландшафтную ориентацию', /sensorLandscape/.test(patch));

  const apkWf = fs.readFileSync(path.join(ROOT, '.github/workflows/build-apk.yml'), 'utf8');
  ok('APK собирается только вручную', !/^on:[\s\S]*?push:/m.test(apkWf.split('jobs:')[0]));
  ok('CI патчит Android при сборке APK', /tools\/patch-android\.js/.test(apkWf));

  const webWf = fs.readFileSync(path.join(ROOT, '.github/workflows/deploy-web.yml'), 'utf8');
  ok('пуш публикует обновление игры', /push:/.test(webWf) && /deploy-pages/.test(webWf));
  ok('обновление проставляет номер сборки', /tools\/stamp\.js/.test(webWf));
  ok('номер новой сборки больше установленного APK', /100 \+/.test(webWf));

  // все import внутри www резолвятся
  const files = [];
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js') && !p.includes('vendor')) files.push(p);
  });
  walk(path.join(WWW, 'js'));

  let broken = [];
  files.forEach(f => {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      const target = path.resolve(path.dirname(f), m[1]);
      if (!fs.existsSync(target)) broken.push(path.relative(WWW, f) + ' → ' + m[1]);
    }
  });
  ok(`все относительные импорты существуют (${files.length} файлов)`, broken.length === 0, broken.join('; '));
});

/* ======================= КОНТЕНТ ======================= */
group('Целостность контента', () => {
  const ids = Object.keys(ITEMS);
  ok('предметов ≥ 25', ids.length >= 25, 'есть ' + ids.length);
  ok('у всех предметов есть name/cat/weight',
    ids.every(i => ITEMS[i].name && ITEMS[i].cat && typeof ITEMS[i].weight === 'number'));
  ok('вес неотрицательный', ids.every(i => ITEMS[i].weight >= 0));

  let badStock = [];
  Object.entries(SHOP_STOCK).forEach(([shop, list]) =>
    list.forEach(i => { if (!ITEMS[i]) badStock.push(shop + ':' + i); }));
  ok('ассортимент ссылается на существующие предметы', badStock.length === 0, badStock.join(','));

  ok('работ ≥ 6', Object.keys(JOBS).length >= 6);
  ok('у работ корректные поля', Object.values(JOBS).every(j =>
    j.name && j.stops > 0 && j.payPerStop > 0 && typeof j.bonus === 'number'));
  ok('грузы работ существуют', Object.values(JOBS).every(j => !j.cargo || ITEMS[j.cargo]));

  ok('квестов ≥ 5', QUESTS.length >= 5);
  ok('у квестов уникальные id', new Set(QUESTS.map(q => q.id)).size === QUESTS.length);
  ok('у шагов квестов есть type', QUESTS.every(q => q.steps.every(s => s.type && s.text)));
  ok('у квестов есть награда', QUESTS.every(q => q.reward && q.reward.money >= 0));

  ok('автосалон непустой', DEALERSHIP.length >= 5);
  ok('экономика задана', ECONOMY.startMoney > 0 && ECONOMY.inventoryMaxWeight > 0);
});

/* ======================= УТИЛИТЫ ======================= */
group('Утилиты', () => {
  const a = makeRNG(123), b = makeRNG(123), c = makeRNG(124);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  const seqC = Array.from({ length: 5 }, () => c());
  ok('ГПСЧ детерминирован', JSON.stringify(seqA) === JSON.stringify(seqB));
  ok('разные сиды дают разное', JSON.stringify(seqA) !== JSON.stringify(seqC));
  ok('ГПСЧ в диапазоне [0,1)', seqA.every(v => v >= 0 && v < 1));
  ok('rng.int в границах', Array.from({ length: 200 }, () => a.int(3, 7)).every(v => v >= 3 && v <= 7));

  ok('clamp работает', clamp(5, 0, 3) === 3 && clamp(-1, 0, 3) === 0 && clamp(2, 0, 3) === 2);
  ok('fmtMoney форматирует', fmtMoney(1234567).includes('1 234 567'));

  // коллизии
  const box = [{ minX: -1, maxX: 1, minZ: -1, maxZ: 1 }];
  const r1 = resolveCircleBoxes(1.4, 0, 0.5, box);
  ok('круг выталкивается из коробки', r1.hit && r1.x > 1.4, `x=${r1.x}`);
  const r2 = resolveCircleBoxes(5, 5, 0.5, box);
  ok('далёкий круг не трогается', !r2.hit && r2.x === 5);
  const r3 = resolveCircleBoxes(0, 0, 0.5, box);
  ok('центр внутри — выталкивает наружу', r3.hit && Math.max(Math.abs(r3.x), Math.abs(r3.z)) >= 1);

  const grid = new SpatialGrid(10);
  grid.insert('a', 5, 5);
  grid.insert('b', 95, 95);
  ok('сетка находит ближнее', grid.query(5, 5, 1).includes('a'));
  ok('сетка не находит дальнее', !grid.query(5, 5, 1).includes('b'));
});

/* ======================= ИГРОК И ИНВЕНТАРЬ ======================= */
group('Создание игрока', () => {
  const p = S.createPlayer({ name: 'Тест Тестов' });
  ok('имя сохранено', p.name === 'Тест Тестов');
  ok('стартовые деньги', p.money === ECONOMY.startMoney);
  ok('уровень 1', p.level === 1);
  ok('статы 0..100', Object.values(p.stats).every(v => v >= 0 && v <= 100));
  ok('инвентарь пуст', p.inventory.length === 0);
  ok('длинное имя обрезается', S.createPlayer({ name: 'x'.repeat(80) }).name.length === 24);
});

group('Инвентарь', () => {
  const p = S.createPlayer({});
  ok('добавление предмета', S.addItem(p, 'burger', 2).ok && S.invCount(p, 'burger') === 2);
  ok('вес считается', Math.abs(S.invWeight(p) - ITEMS.burger.weight * 2) < 1e-9);
  ok('стакание', S.addItem(p, 'burger', 1).ok && S.invCount(p, 'burger') === 3);
  ok('удаление', S.removeItem(p, 'burger', 2).ok && S.invCount(p, 'burger') === 1);
  ok('нельзя удалить больше чем есть', !S.removeItem(p, 'burger', 5).ok);
  ok('несуществующий предмет', !S.addItem(p, 'nope', 1).ok);

  const over = S.createPlayer({});
  ok('перегруз блокируется', !S.addItem(over, 'jerrycan', 99).ok);
  ok('вес не превышает лимит', S.invWeight(over) <= ECONOMY.inventoryMaxWeight);

  // использование
  const u = S.createPlayer({});
  u.stats.hunger = 20;
  S.addItem(u, 'burger', 1);
  const r = S.useItem(u, 'burger');
  ok('еда восстанавливает сытость', r.ok && u.stats.hunger === 20 + ITEMS.burger.hunger);
  ok('предмет расходуется', S.invCount(u, 'burger') === 0);
  ok('нельзя использовать отсутствующее', !S.useItem(u, 'burger').ok);

  u.stats.health = 100;
  S.addItem(u, 'medkit', 1);
  S.useItem(u, 'medkit');
  ok('здоровье не выше 100', u.stats.health === 100);

  const veh = { refuel(n) { this.f = n; }, repair() { this.r = true; } };
  S.addItem(u, 'jerrycan', 1);
  ok('канистра требует машину', !S.useItem(u, 'jerrycan').ok);
  ok('канистра заливает топливо', S.useItem(u, 'jerrycan', { vehicle: veh }).ok && veh.f === ITEMS.jerrycan.fuel);
});

/* ======================= ТОРГОВЛЯ ======================= */
group('Магазин и деньги', () => {
  const p = S.createPlayer({});
  const start = p.money;
  const r = S.buyItem(p, 'burger', 2);
  ok('покупка проходит', r.ok);
  ok('деньги списались', p.money === start - ITEMS.burger.price * 2, 'got ' + p.money);
  ok('товар в инвентаре', S.invCount(p, 'burger') === 2);

  p.money = 1;
  ok('без денег не купить', !S.buyItem(p, 'laptop', 1).ok);

  p.money = 100000;
  ok('перегруз блокирует покупку', !S.buyItem(p, 'jerrycan', 50).ok);

  const before = p.money;
  const s = S.sellItem(p, 'burger', 1);
  ok('продажа работает', s.ok && p.money > before);
  ok('продажа дешевле покупки', s.gain < ITEMS.burger.price);
  ok('нельзя продать чего нет', !S.sellItem(p, 'laptop', 1).ok);

  // банк
  const b = S.createPlayer({});
  b.money = 1000;
  ok('вклад', S.deposit(b, 400).ok && b.bank === 400 && b.money === 600);
  ok('снятие', S.withdraw(b, 150).ok && b.bank === 250 && b.money === 750);
  ok('нельзя снять лишнее', !S.withdraw(b, 9999).ok);
  ok('нельзя внести лишнее', !S.deposit(b, 9999).ok);
});

/* ======================= ТРАНСПОРТ И ЖИЛЬЁ ======================= */
group('Транспорт и недвижимость', () => {
  const p = S.createPlayer({});
  p.money = 200000;
  const r = S.buyVehicle(p, 'sedan', 18000, 0xff0000);
  ok('покупка авто', r.ok && p.vehicles.length === 1);
  ok('номер выдан', /^[A-Z]\d{3}[A-Z]{2}$/.test(r.plate), r.plate);
  ok('деньги списаны', p.money === 182000);
  ok('неизвестная модель отклоняется', !S.buyVehicle(p, 'ufo', 1, 0).ok);

  p.money = 10;
  ok('без денег авто не купить', !S.buyVehicle(p, 'sports', 125000, 0).ok);

  p.money = 100000;
  const sell = S.sellVehicle(p, r.plate);
  ok('продажа авто', sell.ok && p.vehicles.length === 0 && sell.gain > 0);
  ok('нельзя продать чужой номер', !S.sellVehicle(p, 'X000XX').ok);

  // дом
  const h = { type: 'house', id: 'h1', name: 'Дом 1', x: 10, z: 20, price: 50000, garage: {} };
  p.money = 60000;
  ok('покупка дома', S.buyProperty(p, h).ok && S.ownsProperty(p, 'h1'));
  ok('повторно не купить', !S.buyProperty(p, h).ok);
  ok('не дом — не продаётся', !S.buyProperty(p, { type: 'shop' }).ok);
  p.money = 10;
  ok('без денег дом не купить', !S.buyProperty(p, { type: 'house', id: 'h2', price: 99999 }).ok);
});

/* ======================= РАБОТЫ ======================= */
group('Работы', () => {
  const p = S.createPlayer({});
  const stops = [{ x: 0, z: 0 }, { x: 10, z: 10 }, { x: 20, z: 20 }, { x: 30, z: 30 }, { x: 40, z: 40 }];

  ok('такси требует права', !S.startJob(p, 'taxi', stops).ok);
  p.licenses.drive = true;
  ok('с правами такси доступно', S.startJob(p, 'taxi', stops.slice(0, 4)).ok);
  ok('нельзя взять две смены', !S.startJob(p, 'delivery', stops).ok);

  const def = JOBS.taxi;
  const money0 = p.money;
  let res;
  for (let i = 0; i < 4; i++) res = S.completeStop(p);
  ok('смена завершается', res.finished === true);
  ok('оплата начислена', p.money === money0 + def.payPerStop * 4 + def.bonus, 'got ' + (p.money - money0));
  ok('смена очищена', p.job === null);
  ok('счётчик смен', p.jobsDone.taxi === 1);
  ok('опыт начислен', p.xp > 0 || p.level > 1);
  ok('репутация выросла', p.rep >= 1);

  // отмена
  S.startJob(p, 'taxi', stops.slice(0, 4));
  S.completeStop(p);
  const m = p.money;
  const c = S.cancelJob(p);
  ok('отмена даёт половину', c.ok && p.money === m + Math.floor(def.payPerStop / 2));
  ok('без смены нечего отменять', !S.cancelJob(p).ok);

  const rep = S.createPlayer({});
  rep.licenses.drive = true;
  ok('полиция требует репутацию', !S.startJob(rep, 'police', stops).ok);
  rep.rep = 50;
  ok('с репутацией полиция доступна', S.startJob(rep, 'police', stops).ok);
});

/* ======================= УРОВНИ ======================= */
group('Уровни', () => {
  const p = S.createPlayer({});
  p.xp = ECONOMY.levelXp(1) + ECONOMY.levelXp(2) + 5;
  const ups = S.levelUpCheck(p);
  ok('несколько уровней за раз', ups === 2 && p.level === 3, `ups=${ups} lvl=${p.level}`);
  ok('остаток опыта сохранён', p.xp === 5, 'xp=' + p.xp);
  ok('без опыта уровень не растёт', S.levelUpCheck(S.createPlayer({})) === 0);
});

/* ======================= КВЕСТЫ ======================= */
group('Задания', () => {
  const p = S.createPlayer({});
  ok('все квесты активны в начале', S.activeQuests(p).length === QUESTS.length);

  const money0 = p.money;
  S.questEvent(p, 'buy_cat', { cat: 'food' });
  ok('первый шаг засчитан', S.questState(p, 'q_start').step === 1);
  S.questEvent(p, 'use_cat', { cat: 'tech' });
  ok('неверная категория не засчитывается', S.questState(p, 'q_start').step === 1);
  const done = S.questEvent(p, 'use_cat', { cat: 'food' });
  ok('квест завершён', S.questState(p, 'q_start').done === true);
  ok('награда выдана', p.money === money0 + QUESTS[0].reward.money);
  ok('возвращён список завершённых', done.length === 1 && done[0].id === 'q_start');

  // права через квест
  const q = S.createPlayer({});
  S.questEvent(q, 'enter_vehicle');
  q.stats2.distDriven = 600;
  S.questEvent(q, 'drive_dist');
  ok('квест выдаёт права', q.licenses.drive === true);

  ok('завершённый квест не повторяется', S.questEvent(q, 'enter_vehicle').length === 0);
});

/* ======================= ПОТРЕБНОСТИ ======================= */
group('Потребности и смерть', () => {
  const p = S.createPlayer({});
  const h0 = p.stats.hunger;
  S.tickNeeds(p, 600);  // 10 игровых минут
  ok('сытость падает', p.stats.hunger < h0);
  ok('жажда падает быстрее голода', (80 - p.stats.thirst) > (80 - p.stats.hunger));

  const d = S.createPlayer({});
  d.stats.hunger = 0; d.stats.thirst = 0; d.stats.health = 3;
  const died = S.tickNeeds(d, 600);
  ok('голод и жажда убивают', died === true && d.stats.health <= 0);

  d.money = 1000;
  const r = S.respawn(d);
  ok('респавн лечит', d.stats.health > 0);
  ok('респавн берёт плату', r.fee === ECONOMY.hospitalFee && d.money === 1000 - ECONOMY.hospitalFee);

  const poor = S.createPlayer({});
  poor.money = 50;
  S.respawn(poor);
  ok('деньги не уходят в минус при респавне', poor.money >= 0);
});

/* ======================= СОХРАНЕНИЕ ======================= */
group('Сохранение', () => {
  const p = S.createPlayer({ name: 'Сейв Сейвов' });
  p.money = 54321;
  S.addItem(p, 'medkit', 3);
  ok('сохранение проходит', S.save(p) === true);

  const l = S.load();
  ok('загрузка возвращает данные', !!l);
  ok('деньги сохранились', l.money === 54321);
  ok('инвентарь сохранился', S.invCount(l, 'medkit') === 3);
  ok('имя сохранилось', l.name === 'Сейв Сейвов');

  localStorage.setItem('rp:save:v2', JSON.stringify({ version: 999 }));
  ok('чужая версия отбрасывается', S.load() === null);
  localStorage.setItem('rp:save:v2', '{ сломанный json');
  ok('битый сейв не роняет игру', S.load() === null);

  S.save(p);
  S.wipe();
  ok('удаление сейва', S.load() === null);
});

/* ======================= СИМУЛЯЦИЯ ======================= */
group('Симуляция: 200 смен подряд', () => {
  [1, 7, 99].forEach(seed => {
    const rng = makeRNG(seed);
    const p = S.createPlayer({ name: 'Бот' });
    p.licenses.drive = true;
    let err = null;
    try {
      for (let i = 0; i < 200; i++) {
        const jobIds = Object.keys(JOBS).filter(id => {
          const d = JOBS[id];
          return (!d.reqRep || p.rep >= d.reqRep) && (!d.reqLicense || p.licenses[d.reqLicense]);
        });
        const id = jobIds[rng.int(0, jobIds.length - 1)];
        const def = JOBS[id];
        const stops = Array.from({ length: def.stops }, () => ({ x: rng.range(-500, 500), z: rng.range(-500, 500) }));
        const st = S.startJob(p, id, stops);
        if (!st.ok) throw new Error('не стартовала смена ' + id + ': ' + st.reason);
        for (let k = 0; k < def.stops; k++) {
          const r = S.completeStop(p);
          if (!r.ok) throw new Error('точка не сдалась: ' + r.reason);
        }
        if (p.job !== null) throw new Error('смена не закрылась');

        S.tickNeeds(p, 1200);
        if (p.stats.hunger < 30) { S.addItem(p, 'pizza', 1); S.useItem(p, 'pizza'); }
        if (p.stats.thirst < 30) { S.addItem(p, 'water', 1); S.useItem(p, 'water'); }
        if (p.stats.health <= 0) S.respawn(p);

        for (const k of Object.keys(p.stats)) {
          const v = p.stats[k];
          if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`стат ${k}=${v} вне диапазона`);
        }
        if (!Number.isFinite(p.money) || p.money < 0) throw new Error('money=' + p.money);
        if (S.invWeight(p) > ECONOMY.inventoryMaxWeight + 0.01) throw new Error('перегруз ' + S.invWeight(p));
      }
    } catch (e) { err = e.message; }
    ok(`сид ${seed}: 200 смен (ур.${p.level}, ${Math.round(p.money)} $, реп ${p.rep})`, err === null, err);
  });
});

/* ======================= ИТОГ ======================= */
console.log('\n────────────────────────────────');
console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : '0'}`);
process.exit(fail === 0 ? 0 : 1);

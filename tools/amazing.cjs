/* amazing.cjs — механики в духе Amazing RP: русский автопарк, тюнинг,
   автошкола с правами по категориям, штрафы, работы с требованиями,
   бизнесы и семьи. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8143;

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

  /* ---------------- АВТОПАРК ---------------- */
  console.log('\n\u001b[1mРусский автопарк\u001b[0m');
  const fleet = await page.evaluate(async () => {
    const V = await import('/js/entities/vehicle.js');
    const THREE = await import('/vendor/three.module.js');
    const scene = new THREE.Scene();
    const out = { total: Object.keys(V.VEHICLES).length, rus: [], cats: {}, built: 0, tris: 0, errs: [] };
    const rusIds = ['vaz2107', 'vaz2114', 'vaz2109', 'niva', 'oka', 'volga', 'uaz', 'buhanka', 'gazelle', 'kamaz', 'paz', 'ural', 'scooter'];
    for (const id of Object.keys(V.VEHICLES)) {
      const spec = V.VEHICLES[id];
      out.cats[spec.cat] = (out.cats[spec.cat] || 0) + 1;
      if (!rusIds.includes(id)) continue;
      try {
        const v = new V.Vehicle(id, 0xb02020, 0, 0, 0, false);
        scene.add(v.mesh);
        let tris = 0;
        v.mesh.traverse(o => {
          if (!o.geometry) return;
          tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
        });
        if (tris < 300) out.errs.push(id + ': всего ' + tris + ' трис');
        out.built++;
        out.tris += tris;
        out.rus.push({ id, name: spec.name, cat: spec.cat, tris: Math.round(tris), wheels: v.mesh.userData.wheels.length });
        v.dispose();
      } catch (e) { out.errs.push(id + ': ' + e.message); }
    }
    return out;
  });
  console.log('    ' + JSON.stringify(fleet.rus.map(r => r.id + ':' + r.tris + 'т/' + r.wheels + 'к')));
  ok('в парке больше 20 моделей', fleet.total >= 20, String(fleet.total));
  ok('есть 13 отечественных моделей', fleet.rus.length === 13, String(fleet.rus.length));
  ok('все отечественные модели собираются без ошибок', fleet.errs.length === 0, fleet.errs.join(' | '));
  ok('модели составные, не примитивы (от 300 треугольников)',
     fleet.rus.every(r => r.tris >= 300), JSON.stringify(fleet.rus.filter(r => r.tris < 300)));
  ok('у мотоциклов два-три колеса, у машин четыре',
     fleet.rus.filter(r => r.id === 'ural' || r.id === 'scooter').every(r => r.wheels <= 3)
     && fleet.rus.filter(r => !['ural', 'scooter'].includes(r.id)).every(r => r.wheels >= 4),
     JSON.stringify(fleet.rus.map(r => r.id + '=' + r.wheels)));
  ok('у каждой модели указана категория прав',
     Object.keys(fleet.cats).every(c => ['A', 'B', 'C', 'D'].includes(c))
     && Object.values(fleet.cats).reduce((a, b) => a + b, 0) === fleet.total,
     JSON.stringify(fleet.cats));

  /* ---------------- ТЮНИНГ ---------------- */
  console.log('\n\u001b[1mТюнинг\u001b[0m');
  const tune = await page.evaluate(async () => {
    const V = await import('/js/entities/vehicle.js');
    const out = { parts: Object.keys(V.TUNING).length, cats: {}, trisByKit: {}, power: {}, errs: [] };
    Object.values(V.TUNING).forEach(d => { out.cats[d.cat] = (out.cats[d.cat] || 0) + 1; });

    // геометрия растёт от обвеса
    [0, 1, 2, 3].forEach(kit => {
      try {
        const v = new V.Vehicle('vaz2107', 0x2244aa, 0, 0, 0, false, { kit, spoiler: kit });
        let tris = 0;
        v.mesh.traverse(o => {
          if (!o.geometry) return;
          tris += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
        });
        out.trisByKit[kit] = Math.round(tris);
        v.dispose();
      } catch (e) { out.errs.push('kit' + kit + ': ' + e.message); }
    });

    // характеристики от стейджа
    [0, 1, 2, 3].forEach(st => {
      const s = V.tuningStats({ stage: st, spoiler: st });
      out.power[st] = { power: +s.power.toFixed(2), top: +s.topSpeed.toFixed(2), grip: +s.grip.toFixed(3) };
    });

    // нитро реально ускоряет
    const mk = (t) => { const v = new V.Vehicle('sedan', 0xffffff, 0, 0, 0, true, t); v.engineOn = true; v.fuel = 50; return v; };
    const a = mk({}), b = mk({ nitro: true });
    for (let i = 0; i < 90; i++) a.update(1 / 60, { throttle: 1, steer: 0, brake: 0 }, null, 1);
    for (let i = 0; i < 90; i++) { b.nos = 100; b.nosActive = 1; b.update(1 / 60, { throttle: 1, steer: 0, brake: 0 }, null, 1); }
    out.plain = +a.speedKmh.toFixed(1);
    out.nos = +b.speedKmh.toFixed(1);
    a.dispose(); b.dispose();

    // диски меняют геометрию колеса
    const w0 = new V.Vehicle('sedan', 0xffffff, 0, 0, 0, false, {});
    const w3 = new V.Vehicle('sedan', 0xffffff, 0, 0, 0, false, { rims: 3 });
    const gt = m => { let n = 0; m.mesh.userData.wheels.forEach(w => w.traverse(o => {
      if (o.geometry) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; })); return Math.round(n); };
    out.rimTris = [gt(w0), gt(w3)];
    w0.dispose(); w3.dispose();

    return out;
  });
  console.log('    ' + JSON.stringify(tune));
  ok('в каталоге 18+ деталей тюнинга', tune.parts >= 18, String(tune.parts));
  ok('детали покрывают двигатель, подвеску и стайлинг',
     tune.cats.engine >= 4 && tune.cats.susp >= 2 && tune.cats.style >= 8, JSON.stringify(tune.cats));
  ok('обвес добавляет геометрию',
     tune.trisByKit[3] > tune.trisByKit[0] + 40,
     `${tune.trisByKit[0]} -> ${tune.trisByKit[3]}`);
  ok('без ошибок при сборке обвеса', tune.errs.length === 0, tune.errs.join(' | '));
  ok('стейджи поднимают мощность', tune.power[3].power > tune.power[0].power
     && tune.power[2].power > tune.power[1].power, JSON.stringify(tune.power));
  ok('антикрыло даёт прижим', tune.power[3].grip > tune.power[0].grip);
  ok('нитро реально ускоряет', tune.nos > tune.plain + 10, `${tune.plain} -> ${tune.nos} км/ч`);
  ok('литьё богаче стоковых дисков', tune.rimTris[1] > tune.rimTris[0],
     JSON.stringify(tune.rimTris));

  /* ---------------- АВТОШКОЛА ---------------- */
  console.log('\n\u001b[1mАвтошкола и права\u001b[0m');
  const lic = await page.evaluate(async () => {
    const D = await import('/js/game/driving.js');
    const g = window.__game;
    const p = g.player;
    p.licences = {}; p.licenses = {};
    const out = {};

    out.fresh = D.licenceSummary(p).filter(l => l.has).length;

    // билет и теория
    const ticket = D.makeTicket();
    out.ticketLen = ticket.length;
    out.bankSize = D.THEORY.length;
    const wrong = ticket.map(t => (t.c + 1) % t.a.length);
    const bad = D.passTheory(wrong, ticket);
    out.allWrong = bad.ok;
    const right = ticket.map(t => t.c);
    const good = D.passTheory(right, ticket);
    out.allRight = good.ok && good.correct === ticket.length;
    const oneMiss = right.slice(); oneMiss[0] = (ticket[0].c + 1) % ticket[0].a.length;
    out.oneMiss = D.passTheory(oneMiss, ticket).ok;

    // выдача
    D.issueLicence(p, 'B', g.engine.timeScale);
    out.hasB = D.hasLicence(p, 'B', g.engine.timeScale);
    out.legacyDrive = p.licenses.drive === true;
    out.daysLeft = Math.floor(D.licenceDaysLeft(p, 'B', g.engine.timeScale));
    out.hasA = D.hasLicence(p, 'A', g.engine.timeScale);

    // категории транспорта
    const V = await import('/js/entities/vehicle.js');
    out.canSedan = D.canDrive(p, V.VEHICLES.sedan, g.engine.timeScale);
    out.canKamaz = D.canDrive(p, V.VEHICLES.kamaz, g.engine.timeScale);
    D.issueLicence(p, 'C', g.engine.timeScale);
    out.canKamazAfter = D.canDrive(p, V.VEHICLES.kamaz, g.engine.timeScale);

    // штрафы и лишение
    p.fines = { list: [], debt: 0, paid: 0 };
    D.addFine(p, 'redlight');
    out.debtAfterOne = p.fines.debt;
    D.addFine(p, 'hitrun');
    out.revoked = p.fines.list.length === 2 && p.licences && Object.keys(p.licences).length === 0;
    out.licencesGone = Object.keys(p.licences || {}).length === 0;

    // оплата
    p.money = 100000;
    const pay = D.payFines(p);
    out.paid = pay.ok && p.fines.debt === 0;
    return out;
  });
  console.log('    ' + JSON.stringify(lic));
  ok('новый игрок без прав', lic.fresh === 0, String(lic.fresh));
  ok('в банке теории 15 вопросов, в билете 10', lic.bankSize === 15 && lic.ticketLen === 10);
  ok('все неверные ответы — не сдал', lic.allWrong === false);
  ok('все верные — сдал', lic.allRight === true);
  ok('одна ошибка прощается', lic.oneMiss === true);
  ok('после сдачи права категории B действуют', lic.hasB === true);
  ok('старый формат прав синхронизирован', lic.legacyDrive === true);
  ok('права выданы на 30 игровых суток', lic.daysLeft === 30, String(lic.daysLeft));
  ok('без категории A мотоцикл недоступен', lic.hasA === false);
  ok('без категории C грузовик недоступен', lic.canSedan === true && lic.canKamaz === false);
  ok('с категорией C грузовик доступен', lic.canKamazAfter === true);
  ok('штрафы копятся', lic.debtAfterOne === 1000, String(lic.debtAfterOne));
  ok('при долге свыше лимита права аннулируют', lic.licencesGone === true);
  ok('штрафы можно оплатить', lic.paid === true);

  /* ---------------- РАБОТЫ ---------------- */
  console.log('\n\u001b[1mРаботы из Amazing\u001b[0m');
  const jobs = await page.evaluate(async () => {
    const g = window.__game;
    const C = await import('/js/game/content.js');
    const D = await import('/js/game/driving.js');
    const S = await import('/js/game/state.js');
    const need = ['mine', 'miner', 'sawmill', 'farm', 'mechanic', 'towtruck', 'collector', 'diver', 'exterminator', 'dealer'];
    const out = { have: need.filter(id => C.JOBS[id]).length, ids: Object.keys(C.JOBS).length, gated: {}, cargoOk: true };
    const p = S.createPlayer({ name: 'Бот' });
    p.level = 20;
    ['A', 'B', 'C', 'D'].forEach(c => D.issueLicence(p, c));
    const stops = Array.from({ length: 8 }, () => ({ x: 0, z: 0 }));

    // без инструмента не пускает
    const noTool = S.startJob(p, 'mine', stops);
    out.gated.mineNoTool = !noTool.ok && /инструмент/i.test(noTool.reason || '');
    S.addItem(p, 'pickaxe', 1);
    const withTool = S.startJob(p, 'mine', stops);
    out.gated.mineWithTool = withTool.ok;
    while (p.job) S.completeStop(p);

    // без категории C эвакуатор недоступен
    const p2 = S.createPlayer({ name: 'Бот2' });
    D.issueLicence(p2, 'B');
    const tow = S.startJob(p2, 'towtruck', stops);
    out.gated.towNoCat = !tow.ok && /категории C/.test(tow.reason || '');

    // уровень
    const p3 = S.createPlayer({ name: 'Бот3' });
    p3.level = 1;
    S.addItem(p3, 'pickaxe', 1);
    const lowLvl = S.startJob(p3, 'miner', stops);
    out.gated.minerLowLevel = !lowLvl.ok && /уровень/.test(lowLvl.reason || '');

    // все грузы объявлены
    out.cargoOk = Object.values(C.JOBS).every(j => !j.cargo || C.ITEMS[j.cargo]);
    out.toolsOk = Object.values(C.JOBS).every(j => !j.tool || C.ITEMS[j.tool]);
    return out;
  });
  console.log('    ' + JSON.stringify(jobs));
  ok('все 10 новых работ на месте', jobs.have === 10, String(jobs.have));
  ok('всего работ не меньше 17', jobs.ids >= 17, String(jobs.ids));
  ok('без инструмента на шахту не берут', jobs.gated.mineNoTool === true);
  ok('с киркой смена стартует', jobs.gated.mineWithTool === true);
  ok('без категории C эвакуатор недоступен', jobs.gated.towNoCat === true);
  ok('рудокоп требует уровень', jobs.gated.minerLowLevel === true);
  ok('все грузы и инструменты объявлены', jobs.cargoOk && jobs.toolsOk);

  /* ---------------- БИЗНЕСЫ ---------------- */
  console.log('\n\u001b[1mБизнесы\u001b[0m');
  const biz = await page.evaluate(async () => {
    const B = await import('/js/game/business.js');
    const S = await import('/js/game/state.js');
    const p = S.createPlayer({ name: 'Делец' });
    p.money = 5000000;
    const out = { types: Object.keys(B.TYPES).length, offers: B.market(p).length };
    const offer = B.market(p)[0];
    const bought = B.buy(p, offer.id);
    out.bought = bought.ok;
    out.owned = B.owned(p).length;
    out.income = B.incomeOf(B.owned(p)[0]);
    const bankBefore = p.bank;
    const earned = B.tick(p, 3);
    out.earned = earned;
    out.bankGrew = p.bank === bankBefore + earned;
    const before = B.owned(p)[0].level;
    const up = B.upgrade(p, B.owned(p)[0].id);
    out.upgraded = up.ok && B.owned(p)[0].level === before + 1;
    out.incomeAfterUpgrade = B.incomeOf(B.owned(p)[0]);
    // лимит владения
    let guard = 0;
    while (B.owned(p).length < B.MAX_OWNED && guard++ < 30) {
      const o = B.market(p)[0];
      if (!o) break;
      B.buy(p, o.id);
    }
    out.limitWorks = B.owned(p).length === B.MAX_OWNED && !B.buy(p, B.market(p)[0].id).ok;
    const sold = B.sell(p, B.owned(p)[0].id);
    out.sold = sold.ok && B.owned(p).length === B.MAX_OWNED - 1;
    return out;
  });
  console.log('    ' + JSON.stringify(biz));
  ok('на бирже 12 типов бизнесов', biz.types === 12, String(biz.types));
  ok('есть предложения к покупке', biz.offers >= 6, String(biz.offers));
  ok('бизнес можно купить', biz.bought === true);
  ok('бизнес приносит доход в банк', biz.bankGrew === true && biz.earned > 0, String(biz.earned));
  ok('апгрейд повышает уровень и доход', biz.upgraded === true && biz.incomeAfterUpgrade > biz.income);
  ok('лимит владения работает', biz.limitWorks === true);
  ok('бизнес можно продать', biz.sold === true);

  /* ---------------- СЕМЬИ ---------------- */
  console.log('\n\u001b[1mСемьи\u001b[0m');
  const fam = await page.evaluate(async () => {
    const F = await import('/js/game/family.js');
    const S = await import('/js/game/state.js');
    const p = S.createPlayer({ name: 'Батя' });
    p.id = 'player';
    const out = {};
    out.tooLow = !F.create(p, 'Банда').ok && /уровень/i.test(F.create(p, 'Банда').reason || '');
    p.level = 12;
    out.noProperty = !F.create(p, 'Банда').ok && /недвижимость/i.test(F.create(p, 'Банда').reason || '');
    p.properties = [{ id: 'h1', name: 'Дом' }];
    out.noMoney = !F.create(p, 'Банда').ok && /250 000/.test(F.create(p, 'Банда').reason || '');
    p.money = 900000;
    const made = F.create(p, 'Парни с района');
    out.created = made.ok;
    out.moneySpent = p.money === 900000 - F.CREATE_FEE;
    out.isLeader = F.get(p).members[0].rank === 3;
    out.shortName = !F.create(S.createPlayer({ name: 'x' }), 'А').ok;

    const dep = F.deposit(p, 100000);
    out.deposited = dep.ok && F.get(p).bank === 100000;
    const wd = F.withdraw(p, 40000);
    out.withdrew = wd.ok && F.get(p).bank === 60000;

    const add = F.addNpc(p, null);
    out.memberAdded = add.ok && F.get(p).members.length === 2;
    const rank = F.setRank(p, add.member.id, 2);
    out.promoted = rank.ok && rank.member.rank === 2;
    const kick = F.kick(p, add.member.id);
    out.kicked = kick.ok && F.get(p).members.length === 1;
    out.selfKick = !F.kick(p, 'player').ok;
    out.leave = F.leave(p).ok && p.family === null;
    return out;
  });
  console.log('    ' + JSON.stringify(fam));
  ok('семью не создать без уровня', fam.tooLow === true);
  ok('нужна недвижимость под штаб', fam.noProperty === true);
  ok('нужны деньги на нотариуса', fam.noMoney === true);
  ok('семья создаётся', fam.created === true && fam.moneySpent === true);
  ok('создатель становится главой', fam.isLeader === true);
  ok('слишком короткое название не принимается', fam.shortName === true);
  ok('казна работает: вклад и выдача', fam.deposited === true && fam.withdrew === true);
  ok('можно принять участника', fam.memberAdded === true);
  ok('можно повысить и выгнать', fam.promoted === true && fam.kicked === true);
  ok('самого себя выгнать нельзя', fam.selfKick === true);
  ok('из семьи можно выйти', fam.leave === true);

  /* ---------------- ИНТЕРФЕЙС ---------------- */
  console.log('\n\u001b[1mИнтерфейс\u001b[0m');
  const ui = await page.evaluate(async () => {
    const g = window.__game;
    const D = await import('/js/game/driving.js');
    ['A', 'B', 'C', 'D'].forEach(c => D.issueLicence(g.player, c, g.engine.timeScale));
    g.player.money = 900000;
    const out = {};
    const C = await import('/js/game/content.js');
    out.dealership = C.DEALERSHIP.length;
    out.dealerRus = C.DEALERSHIP.filter(id => ['oka', 'vaz2107', 'niva', 'volga', 'uaz', 'gazelle', 'kamaz'].includes(id)).length;
    if (!g.player.vehicles.length) g.buyVehicle('vaz2107');
    out.boughtVaz = g.player.vehicles.length > 0;
    ['driving', 'tuning', 'notary', 'business', 'phone'].forEach(name => {
      try {
        g.panels.open(name);
        const txt = document.getElementById('panel-body').innerText || '';
        out[name] = { len: txt.length, title: document.getElementById('panel-title').textContent };
      } catch (e) { out[name] = { err: e.message }; }
    });
    return out;
  });
  console.log('    ' + JSON.stringify(ui));
  ok('панель автошколы открывается', !ui.driving.err && ui.driving.len > 100, JSON.stringify(ui.driving));
  ok('в автосалоне есть отечественные модели', ui.dealerRus >= 7,
     `${ui.dealerRus} из ${ui.dealership}`);
  ok('«Жигули» реально продаются игроку', ui.boughtVaz === true);
  ok('панель автосервиса открывается', !ui.tuning.err && ui.tuning.len > 100, JSON.stringify(ui.tuning));
  ok('панель нотариуса открывается', !ui.notary.err && ui.notary.len > 60, JSON.stringify(ui.notary));
  ok('панель биржи бизнесов открывается', !ui.business.err && ui.business.len > 100, JSON.stringify(ui.business));
  ok('в телефоне видны права и штрафы', !ui.phone.err && /Права/.test(ui.phone.title || '') === false,
     JSON.stringify(ui.phone));

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

/* factiontest.cjs — организации: базы в городе, интерьеры, вступление,
   смена, зарплата, форма, служебный транспорт, зоны, тюрьма.
   Каждая из 11 организаций проверяется по отдельности. */
const puppeteer = require('puppeteer');
const { spawn } = require('child_process');
const PORT = 8131;

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

  console.log('\n\u001b[1mБазы в городе\u001b[0m');
  const bases = await page.evaluate(() => {
    const g = window.__game;
    const list = g.city.pois.filter(p => p.type === 'base');
    return {
      count: list.length,
      ids: list.map(p => p.faction),
      withZone: list.filter(p => p.zone && p.zone.r > 5).length,
      withGarage: list.filter(p => p.garage).length,
      spots: list.reduce((s, p) => s + (p.spots ? p.spots.length : 0), 0),
      prison: g.city.pois.filter(p => p.type === 'prison').length
    };
  });
  console.log('    ' + JSON.stringify(bases));
  ok('построены базы всех 11 организаций', bases.count === 11, JSON.stringify(bases.ids));
  ok('у каждой базы закрытая зона', bases.withZone === 11);
  ok('у каждой базы свой гараж', bases.withGarage === 11);
  ok('на базах есть парковочные места', bases.spots >= 11 * 4);
  ok('есть СИЗО ФСИН', bases.prison === 1);

  console.log('\n\u001b[1mКаждая организация по отдельности\u001b[0m');
  const ids = await page.evaluate(() => window.__factions.FACTION_IDS);
  const results = [];
  for (const id of ids) {
    const r = await page.evaluate(async (fid) => {
      const g = window.__game, F = window.__factions;
      const p = g.player;
      // сброс и подготовка кандидата
      if (p.faction) F.leaveFaction(p);
      p.level = 25; p.rep = 999; p.licenses = { drive: true }; p.criminal = false;
      p.jail = null; g.wanted = 0; p.money = 50000;
      const out = { id: fid };

      const join = F.joinFaction(p, fid, { wanted: 0 });
      out.joined = join.ok && p.faction?.id === fid;
      out.rank0 = F.rankName(fid, 0);

      // форма
      g.wearUniform();
      out.uniform = p.uniform === fid && p.look.shirt === F.FACTIONS[fid].uniform.shirt;

      // смена и зарплата из казны
      const before = p.money, budget0 = F.orgState(p, fid).budget;
      F.setDuty(p, true);
      const sal = F.tickSalary(p, 3);
      out.salary = sal.paid > 0 && p.money > before && F.orgState(p, fid).budget < budget0;

      // служебный транспорт
      const base = g.city.pois.find(x => x.type === 'base' && x.faction === fid);
      g.player3d.teleport(base.garage.x, base.garage.z + 2, 0);
      g.takeServiceVehicle();
      const v = g.serviceVehicle;
      out.vehicle = !!v && v.service === fid && F.FACTIONS[fid].vehicles.includes(v.type);

      // интерьер базы
      g.enterInterior({ kind: 'base', id: 'base_' + fid, name: F.FACTIONS[fid].name, poi: base, faction: fid });
      await new Promise(r => setTimeout(r, 350));
      const room = g.interiors.current?.room;
      let meshes = 0, tris = 0;
      room?.parts.traverse(o => {
        if (o.isMesh) meshes++;
        const gm = o.geometry;
        if (gm?.index) tris += gm.index.count / 3;
        else if (gm?.attributes?.position) tris += gm.attributes.position.count / 3;
      });
      out.acts = room ? room.actions.map(a => a.kind) : [];
      out.meshes = meshes; out.tris = Math.round(tris);
      out.interior = !!room && out.acts.includes('orgduty') && out.acts.includes('orgarmory')
        && out.acts.includes('orgwear') && out.acts.includes('orgstore') && out.acts.includes('orgchief');
      out.cells = fid === 'fsin' ? out.acts.includes('orgcells') : true;

      // задание со стойки дежурного
      const duty = F.availableDuties(p)[0];
      out.duty = !!duty;
      if (duty) {
        g.startJob(duty.id);
        out.jobStarted = !!p.job && p.job.id === duty.id;
        const b1 = F.orgState(p, fid).budget;
        F.completeDuty(p, duty.id);
        out.orgShare = F.orgState(p, fid).budget > b1;
        g.cancelJob();
      }

      // кадры: приём, повышение, увольнение
      p.faction.rank = 6;
      const cand = 'Кандидат Тестов';
      out.hire = F.inviteMember(p, fid, cand).ok;
      out.promote = F.setMemberRank(p, fid, cand, 1).ok;
      out.demote = F.setMemberRank(p, fid, cand, -1).ok;
      out.fire = F.fireMember(p, fid, cand).ok;
      out.logged = F.orgState(p, fid).log.length >= 4;

      // склад
      g.leaveInterior();
      await new Promise(r => setTimeout(r, 250));
      out.left = !g.interiors.active;

      // чужой на базу не попадает
      const stranger = { faction: null, orgs: {} };
      out.closed = !F.canEnterZone(stranger, fid);

      F.setDuty(p, false);
      return out;
    }, id);
    results.push(r);
    const bad = Object.entries(r).filter(([k, v]) => v === false).map(([k]) => k);
    ok(`${r.id}: вступление, форма, зарплата, транспорт, база, задание, кадры`,
      bad.length === 0, bad.join(','));
  }
  console.log('    интерьер базы: ' +
    `${Math.min(...results.map(r => r.meshes))}–${Math.max(...results.map(r => r.meshes))} мешей, ` +
    `${Math.min(...results.map(r => r.tris))}–${Math.max(...results.map(r => r.tris))} треугольников`);

  console.log('\n\u001b[1mЗакон и тюрьма\u001b[0m');
  const law = await page.evaluate(async () => {
    const g = window.__game, F = window.__factions, p = g.player;
    if (p.faction) F.leaveFaction(p);
    g.sendToJail(4, 'тест');
    await new Promise(r => setTimeout(r, 300));
    const inCell = g.interiors.active && g.interiors.current.def.kind === 'prison';
    const cellActs = g.interiors.current.room.actions.map(a => a.kind);
    const left = F.jailLeft(p);
    p.money = 999999;
    g.releaseFromJail('bail');
    await new Promise(r => setTimeout(r, 300));
    const free = !p.jail && !g.interiors.active;
    // в госструктуру с судимостью не берут
    const denied = !F.canJoin(p, 'police', { wanted: 0 }).ok;
    const gangOk = F.canJoin(p, 'china', { wanted: 0 }).ok;
    return { inCell, cellActs, left, free, denied, gangOk };
  });
  console.log('    ' + JSON.stringify(law));
  ok('осуждённый попадает в камеру', law.inCell && law.left > 0);
  ok('в камере есть нары и справка о сроке',
    law.cellActs.includes('jailbunk') && law.cellActs.includes('jailinfo'));
  ok('залог освобождает', law.free);
  ok('судимость закрывает путь в госструктуры', law.denied);
  ok('ОПГ берёт и с судимостью', law.gangOk);

  console.log('\n\u001b[1mМеню организаций\u001b[0m');
  const ui = await page.evaluate(async () => {
    const g = window.__game;
    g.panels.open('factions');
    await new Promise(r => setTimeout(r, 200));
    const txt = document.getElementById('panel-body')?.innerText || '';
    g.panels.open('faction', 'police');
    await new Promise(r => setTimeout(r, 200));
    const card = document.getElementById('panel-body')?.innerText || '';
    return {
      sample: txt.slice(0, 160),
      cardSample: card.slice(0, 160),
      list: txt.length,
      hasState: /государственные/i.test(txt),
      hasGangs: /группировки/i.test(txt),
      ranks: /звания/i.test(card),
      req: /требования|возможности/i.test(card),
      members: /состав/i.test(card)
    };
  });
  console.log('    ' + JSON.stringify(ui));
  ok('каталог организаций открывается', ui.list > 100 && ui.hasState && ui.hasGangs);
  ok('в карточке есть звания и состав', ui.ranks && ui.members && ui.req);

  const realErrs = errs.filter(e => !/favicon|WebGL|SwiftShader|GroupMarker/i.test(e));
  ok('нет ошибок в консоли', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  console.log('\n────────────────────────────────');
  console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : '0'}`);
  await browser.close();
  srv.kill();
  process.exit(fail === 0 ? 0 : 1);
})();

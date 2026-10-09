/* panels.js — выдвижные панели: инвентарь, магазин, работы, телефон/меню,
   автосалон, недвижимость, банк, заправка, настройки, серверы. */

import { ITEMS, JOBS, QUESTS, ECONOMY, DEALERSHIP } from '../game/content.js';
import { VEHICLES, CAR_COLORS } from '../entities/vehicle.js';
import * as S from '../game/state.js';
import { WEAPONS, AMMO, ammoLabel } from '../game/weapons.js';
import * as F from '../game/factions.js';
import { fmtMoney, dist2D } from '../core/utils.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

const CAT_ICON = {
  food: '🍔', med: '💊', tech: '📱', tool: '🔧',
  cloth: '👕', cargo: '📦', misc: '🎲'
};

export class Panels {
  constructor(game) {
    this.game = game;
    this.root = $('panel');
    this.body = $('panel-body');
    this.title = $('panel-title');
    this.current = null;
    $('panel-close').addEventListener('click', () => this.close());

  }

  close() {
    this.root.classList.add('hidden');
    this.current = null;
    if (this.game.radial) this.game.radial.setActive(null);
  }

  toggle(name, arg) {
    if (this.current === name && !arg) { this.close(); return; }
    this.open(name, arg);
  }

  open(name, arg) {
    this.current = name;
    this.root.classList.remove('hidden');
    this.body.scrollTop = 0;
    if (this.game.radial) this.game.radial.setActive(name);

    const fn = this['render_' + name];
    if (fn) fn.call(this, arg);
    else { this.title.textContent = name; this.body.innerHTML = '<div class="empty">Пусто</div>'; }
  }

  refresh() { if (this.current) this.open(this.current, this._arg); }

  /* ======================= ИНВЕНТАРЬ ======================= */
  render_inventory() {
    const p = this.game.player;
    this.title.textContent = 'Инвентарь';
    const b = this.body;
    b.innerHTML = '';

    const w = S.invWeight(p);
    const head = el('div', 'row');
    head.innerHTML = `<div class="ic">⚖️</div><div class="grow">
      <div class="t">${w.toFixed(1)} / ${ECONOMY.inventoryMaxWeight} кг</div>
      <div class="d">Наличные ${fmtMoney(p.money)} · Банк ${fmtMoney(p.bank)}</div></div>`;
    b.appendChild(head);

    if (!p.inventory.length) {
      b.appendChild(el('div', 'empty', 'Карманы пусты. Загляни в магазин.'));
      return;
    }

    const byCat = {};
    p.inventory.forEach(it => {
      const cat = ITEMS[it.id]?.cat || 'misc';
      (byCat[cat] || (byCat[cat] = [])).push(it);
    });

    Object.keys(byCat).forEach(cat => {
      b.appendChild(el('div', 'sec', (CAT_ICON[cat] || '') + ' ' + cat));
      byCat[cat].forEach(entry => {
        const it = ITEMS[entry.id];
        const row = el('div', 'row');
        row.innerHTML = `<div class="ic">${CAT_ICON[it.cat] || '•'}</div>
          <div class="grow"><div class="t">${it.name} ×${entry.qty}</div>
          <div class="d">${(it.weight * entry.qty).toFixed(1)} кг${this._effects(it)}</div></div>`;
        const actions = el('div', 'btn-row');

        const usable = it.hunger || it.thirst || it.health || it.energy || it.fuel
          || it.repair || it.wear || it.equip || it.ammo;
        if (usable) {
          const label = it.equip ? (p.equipped === it.equip ? 'Убрать' : 'В руки')
            : it.ammo ? 'Зарядить' : it.wear ? 'Надеть' : 'Исп.';
          const u = el('button', 'btn sm good', label);
          u.onclick = () => this.game.useItem(entry.id);
          actions.appendChild(u);
        }
        if (!it.questOnly) {
          const s = el('button', 'btn sm', 'Продать');
          s.onclick = () => this.game.sellItem(entry.id);
          actions.appendChild(s);
        }
        const d = el('button', 'btn sm danger', '✕');
        d.onclick = () => { S.removeItem(p, entry.id, 1); this.refresh(); };
        actions.appendChild(d);
        row.appendChild(actions);
        b.appendChild(row);
      });
    });
  }

  _effects(it) {
    const parts = [];
    if (it.hunger) parts.push(`сытость +${it.hunger}`);
    if (it.thirst) parts.push(`жажда +${it.thirst}`);
    if (it.energy) parts.push(`энергия +${it.energy}`);
    if (it.health) parts.push(`здоровье ${it.health > 0 ? '+' : ''}${it.health}`);
    if (it.fuel) parts.push(`топливо +${it.fuel} л`);
    if (it.repair) parts.push('ремонт авто');
    if (it.equip) parts.push('оружие');
    if (it.ammo) parts.push(`+${it.ammo} патронов`);
    if (WEAPONS[it.id || '']) parts.push('ствол');
    return parts.length ? ' · ' + parts.join(', ') : '';
  }

  /* ======================= МАГАЗИН ======================= */
  render_shop(poi) {
    this._arg = poi;
    const p = this.game.player;
    const kind = poi?.shopKind || 'market';
    this.title.textContent = poi ? poi.name : 'Магазин';
    const b = this.body;
    b.innerHTML = '';

    if (kind === 'guns') { this._renderGunShop(poi, p); return; }

    b.appendChild(el('div', 'sec', `Наличные: ${fmtMoney(p.money)} · вес ${S.invWeight(p).toFixed(1)} кг`));

    const list = S.shopCatalog(kind);
    list.forEach(it => {
      const row = el('div', 'row');
      const afford = p.money >= it.price;
      const fits = S.canCarry(p, it.id, 1);
      if (!afford || !fits) row.classList.add('locked');
      row.innerHTML = `<div class="ic">${CAT_ICON[it.cat] || '•'}</div>
        <div class="grow"><div class="t">${it.name}</div>
        <div class="d">${it.weight} кг${this._effects(it)}</div></div>
        <div class="price">${it.price} $</div>`;
      const buy = el('button', 'btn sm primary', 'Купить');
      buy.disabled = !afford || !fits;
      buy.onclick = () => this.game.buyItem(it.id, 1);
      row.appendChild(buy);
      b.appendChild(row);
    });
  }

  /** Оружейный магазин: продавец, характеристики стволов, покупка и продажа. */
  _renderGunShop(poi, p) {
    const b = this.body;
    const seller = poi?.seller || 'Продавец Марк';
    b.appendChild(el('div', 'sec',
      `${seller}: «Лицензия? Ладно, не моё дело. Смотри товар.»<br>
       Наличные: ${fmtMoney(p.money)} · вес ${S.invWeight(p).toFixed(1)} кг`));

    b.appendChild(el('div', 'sec', 'Оружие'));
    for (const id of ['pistol', 'revolver', 'shotgun', 'smg', 'rifle']) {
      const w = WEAPONS[id];
      const item = ITEMS[id];
      const have = S.invCount(p, id);
      const row = el('div', 'row');
      const afford = p.money >= item.price;
      if (!afford && !have) row.classList.add('locked');
      row.innerHTML = `<div class="ic">🔫</div>
        <div class="grow"><div class="t">${w.name}${have ? ' · есть' : ''}</div>
        <div class="d">урон ${w.dmg}${w.pellets ? '×' + w.pellets : ''} · магазин ${w.mag} · ${AMMO[w.ammo].name} · ${w.auto ? 'очередь' : 'одиночный'}<br>${w.desc}</div></div>
        <div class="price">${item.price} $</div>`;
      const buy = el('button', 'btn sm primary', 'Купить');
      buy.disabled = !afford || !S.canCarry(p, id, 1);
      buy.onclick = () => this.game.buyItem(id, 1);
      row.appendChild(buy);
      if (have) {
        const sell = el('button', 'btn sm', `Продать ${Math.round(item.price / 2)} $`);
        sell.onclick = () => this.game.sellItem(id);
        row.appendChild(sell);
      }
      b.appendChild(row);
    }

    b.appendChild(el('div', 'sec', 'Патроны и снаряжение'));
    for (const id of ['ammo9', 'ammo357', 'ammo12', 'ammo762', 'armor', 'holster']) {
      const item = ITEMS[id];
      const row = el('div', 'row');
      const afford = p.money >= item.price;
      if (!afford) row.classList.add('locked');
      row.innerHTML = `<div class="ic">${id === 'armor' ? '🛡' : id === 'holster' ? '🎒' : '📦'}</div>
        <div class="grow"><div class="t">${item.name}</div>
        <div class="d">${item.weight} кг${item.ammo ? ' · +' + item.ammo + ' патронов' : ''}${item.armor ? ' · +' + item.armor + ' брони' : ''}</div></div>
        <div class="price">${item.price} $</div>`;
      const buy = el('button', 'btn sm primary', 'Купить');
      buy.disabled = !afford || !S.canCarry(p, id, 1);
      buy.onclick = () => this.game.buyItem(id, 1);
      row.appendChild(buy);
      b.appendChild(row);
    }
  }

  /* ======================= ДОМ: ГАРДЕРОБ И СЕЙФ ======================= */
  render_wardrobe() {
    const p = this.game.player;
    this.title.textContent = 'Гардероб';
    const b = this.body;
    b.innerHTML = '';
    p.worn = p.worn || {};

    const SLOTS = [['shirt', 'Верх'], ['pants', 'Низ'], ['shoes', 'Обувь']];
    b.appendChild(el('div', 'sec', 'Надето'));
    SLOTS.forEach(([slot, title]) => {
      const id = p.worn[slot];
      const row = el('div', 'row', `<div class="ic">👕</div>
        <div class="grow"><div class="t">${title}</div>
        <div class="d">${id ? ITEMS[id].name : 'ничего'}</div></div>`);
      if (id) {
        const off = el('button', 'btn sm', 'Снять');
        off.onclick = () => { S.takeOff(p, slot); this.game.applyLook(); this.refresh(); };
        row.appendChild(off);
      }
      b.appendChild(row);
    });

    b.appendChild(el('div', 'sec', 'В инвентаре'));
    const cloth = p.inventory.filter(i => ITEMS[i.id]?.wear);
    if (!cloth.length) b.appendChild(el('div', 'empty', 'Одежду можно купить в магазине одежды.'));
    cloth.forEach(entry => {
      const it = ITEMS[entry.id];
      const row = el('div', 'row', `<div class="ic">👕</div>
        <div class="grow"><div class="t">${it.name} ×${entry.qty}</div>
        <div class="d">слот: ${it.wear}</div></div>`);
      const on = el('button', 'btn sm primary', 'Надеть');
      on.onclick = () => {
        const r = S.wearItem(p, entry.id);
        this.game.hud.toast(r.ok ? 'Надето: ' + it.name : r.reason, r.ok ? 'good' : 'bad');
        this.game.applyLook();
        this.refresh();
      };
      row.appendChild(on);
      b.appendChild(row);
    });

    b.appendChild(el('div', 'sec', 'Цвет одежды'));
    const colors = [['Серый', 0x8d949c], ['Синий', 0x33507a], ['Зелёный', 0x3d6b4a],
      ['Бордовый', 0x7a3340], ['Чёрный', 0x23262b], ['Белый', 0xdedfe2]];
    const rowC = el('div', 'row');
    colors.forEach(([name, hex]) => {
      const bt = el('button', 'btn sm', name);
      bt.onclick = () => {
        p.look = { ...(p.look || {}), shirt: hex };
        this.game.applyLook();
        this.game.hud.toast('Цвет: ' + name, 'good');
      };
      rowC.appendChild(bt);
    });
    b.appendChild(rowC);
  }

  render_stash(where) {
    this._arg = where;
    const p = this.game.player;
    const key = where || 'home';
    this.title.textContent = 'Сейф';
    const b = this.body;
    b.innerHTML = '';
    const list = S.stashList(p, key);
    const total = list.reduce((s, i) => s + i.qty, 0);
    b.appendChild(el('div', 'sec', `В сейфе ${total} / ${S.STASH_MAX} предметов. Вещи в сейфе не отнимут при аресте.`));

    if (!list.length) b.appendChild(el('div', 'empty', 'Пусто. Сложи сюда лишнее — разгрузишь карманы.'));
    list.forEach(entry => {
      const it = ITEMS[entry.id];
      const row = el('div', 'row', `<div class="ic">${CAT_ICON[it?.cat] || '•'}</div>
        <div class="grow"><div class="t">${it?.name || entry.id} ×${entry.qty}</div>
        <div class="d">${(it?.weight || 0).toFixed(1)} кг за штуку</div></div>`);
      const take = el('button', 'btn sm primary', 'Забрать');
      take.onclick = () => {
        const r = S.stashTake(p, key, entry.id, 1);
        this.game.hud.toast(r.ok ? 'Забрал: ' + it.name : r.reason, r.ok ? 'good' : 'bad');
        this.refresh();
      };
      row.appendChild(take);
      b.appendChild(row);
    });

    b.appendChild(el('div', 'sec', 'Положить из инвентаря'));
    if (!p.inventory.length) b.appendChild(el('div', 'empty', 'Инвентарь пуст.'));
    p.inventory.forEach(entry => {
      const it = ITEMS[entry.id];
      const row = el('div', 'row', `<div class="ic">${CAT_ICON[it?.cat] || '•'}</div>
        <div class="grow"><div class="t">${it?.name || entry.id} ×${entry.qty}</div></div>`);
      const put = el('button', 'btn sm', 'В сейф');
      put.onclick = () => {
        const r = S.stashPut(p, key, entry.id, 1);
        this.game.hud.toast(r.ok ? 'Убрал в сейф: ' + it.name : r.reason, r.ok ? 'good' : 'bad');
        this.refresh();
      };
      row.appendChild(put);
      b.appendChild(row);
    });
  }

  /* ======================= РАБОТЫ ======================= */
  render_jobs() {
    const p = this.game.player;
    this.title.textContent = 'Работа';
    const b = this.body;
    b.innerHTML = '';

    if (p.job) {
      const def = JOBS[p.job.id];
      const done = p.job.current;
      const total = p.job.stops.length;
      const row = el('div', 'row active');
      row.innerHTML = `<div class="ic">${def.icon}</div><div class="grow">
        <div class="t">${def.name} — смена идёт</div>
        <div class="d">Точек: ${done}/${total} · заработано ${fmtMoney(p.job.earned)}</div></div>`;
      b.appendChild(row);

      const nav = el('button', 'btn primary', 'Показать точку на карте');
      nav.onclick = () => { this.close(); this.game.openMap(); };
      b.appendChild(nav);
      const stop = el('button', 'btn danger', 'Бросить смену (−50% оплаты)');
      stop.onclick = () => this.game.cancelJob();
      b.appendChild(stop);
      return;
    }

    b.appendChild(el('div', 'sec', 'Доступные вакансии'));
    Object.entries(JOBS).forEach(([id, def]) => {
      // служебные задания организаций видны только своим и только на дежурстве
      if (def.faction) {
        if (!F.isMember(p, def.faction)) return;
        if (!F.onDuty(p)) return;
        if ((def.minRank || 0) > F.myRank(p)) return;
      }
      const row = el('div', 'row');
      const locked = (def.reqRep && p.rep < def.reqRep) ||
                     (def.reqLicense && !p.licenses[def.reqLicense]);
      if (locked) row.classList.add('locked');
      const reason = def.reqRep && p.rep < def.reqRep ? `нужна репутация ${def.reqRep}`
        : (def.reqLicense && !p.licenses[def.reqLicense] ? 'нужны права' : '');
      row.innerHTML = `<div class="ic">${def.icon}</div><div class="grow">
        <div class="t">${def.name}</div>
        <div class="d">${locked ? '🔒 ' + reason : def.desc}</div>
        <div class="d">${def.stops} точек · ${def.payPerStop} $/точка · бонус ${def.bonus} $ · выполнено ${p.jobsDone[id] || 0}</div>
        </div>`;
      const go = el('button', 'btn sm primary', 'Начать');
      go.disabled = locked;
      go.onclick = () => this.game.startJob(id);
      row.appendChild(go);
      b.appendChild(row);
    });

    b.appendChild(el('div', 'sec', 'Статистика'));
    const st = el('div');
    st.innerHTML = `
      <div class="kv"><span>Репутация</span><b>${p.rep}</b></div>
      <div class="kv"><span>Уровень</span><b>${p.level} (${p.xp}/${ECONOMY.levelXp(p.level)} XP)</b></div>
      <div class="kv"><span>Права</span><b>${p.licenses.drive ? 'есть' : 'нет'}</b></div>
      <div class="kv"><span>Проехал</span><b>${((p.stats2.distDriven || 0) / 1000).toFixed(1)} км</b></div>
      <div class="kv"><span>Прошёл</span><b>${((p.stats2.distWalked || 0) / 1000).toFixed(2)} км</b></div>`;
    b.appendChild(st);
  }

  /* ======================= ОРГАНИЗАЦИИ ======================= */
  /** Общий каталог: описания, требования, ранги, состав, вступление. */
  render_factions(arg) {
    this._arg = arg;
    const p = this.game.player;
    this.title.textContent = 'Организации города';
    const b = this.body;
    b.innerHTML = '';

    const mine = F.myFaction(p);
    if (mine) {
      const f = F.FACTIONS[mine.id];
      const row = el('div', 'row active', `<div class="ic">🏛</div><div class="grow">
        <div class="t">${f.name} · ${F.rankName(mine.id, mine.rank)}</div>
        <div class="d">${F.onDuty(p) ? 'на дежурстве' : 'не на смене'} · зарплата ${F.rankPerms(mine.id, mine.rank).pay} $/мин</div></div>`);
      const go = el('button', 'btn sm primary', 'Моя организация');
      go.onclick = () => this.open('org', mine.id);
      row.appendChild(go);
      b.appendChild(row);
    }

    const section = (title, ids) => {
      b.appendChild(el('div', 'sec', title));
      ids.forEach(id => {
        const f = F.FACTIONS[id];
        const org = F.orgState(p, id);
        const online = org.members.filter(m => m.online).length;
        const row = el('div', 'row');
        const req = f.req || {};
        const reqText = [req.level ? `ур. ${req.level}+` : null,
          req.rep ? `репутация ${req.rep}+` : null,
          req.license ? 'права' : null,
          req.clean ? 'без судимости' : null].filter(Boolean).join(' · ') || 'без требований';
        row.innerHTML = `<div class="ic" style="color:#${f.accent.toString(16).padStart(6, '0')}">
          ${f.type === 'state' ? '🛡' : '💀'}</div>
          <div class="grow"><div class="t">${f.name}</div>
          <div class="d">${f.desc}<br>Требования: ${reqText} · состав ${org.members.length}, в сети ${online}</div></div>`;
        const info = el('button', 'btn sm', 'Подробнее');
        info.onclick = () => this.open('faction', id);
        row.appendChild(info);
        b.appendChild(row);
      });
    };
    section('Государственные структуры', F.STATE_FACTIONS);
    section('Нелегальные группировки', F.GANG_FACTIONS);

    b.appendChild(el('div', 'sec', 'Влияние группировок'));
    F.gangStandings(p).forEach((g, i) => {
      b.appendChild(el('div', 'kv', `<span>${i + 1}. ${g.name}</span><b>${g.war} очков</b>`));
    });
  }

  /** Карточка организации: ранги, перки, состав, вступление. */
  render_faction(id) {
    this._arg = id;
    const p = this.game.player;
    const f = F.FACTIONS[id];
    if (!f) { this.render_factions(); return; }
    const org = F.orgState(p, id);
    this.title.textContent = f.name;
    const b = this.body;
    b.innerHTML = '';

    b.appendChild(el('div', 'sec', f.full));
    b.appendChild(el('div', 'd', f.desc));

    b.appendChild(el('div', 'sec', 'Звания и оклад'));
    f.ranks.forEach((r, i) => {
      const me = F.isMember(p, id) && F.myRank(p) === i;
      const row = el('div', me ? 'row active' : 'row', `<div class="ic">${i + 1}</div>
        <div class="grow"><div class="t">${r.name}${me ? ' — ты' : ''}</div>
        <div class="d">${r.pay} $/мин${r.invite ? ' · приём' : ''}${r.fire ? ' · увольнение' : ''}${r.treasury ? ' · казна' : ''}${r.leader ? ' · руководитель' : ''}</div></div>`);
      b.appendChild(row);
    });

    b.appendChild(el('div', 'sec', 'Возможности'));
    b.appendChild(el('div', 'd', (f.perks || []).join(' · ')));
    b.appendChild(el('div', 'sec', 'Транспорт и форма'));
    b.appendChild(el('div', 'd', `${f.vehicles.map(v => VEHICLES[v]?.name || v).join(', ')} · ${f.uniform.name}`));

    b.appendChild(el('div', 'sec', `Состав (${org.members.length})`));
    org.members.slice().sort((a, c) => c.rank - a.rank).forEach(m => {
      b.appendChild(el('div', 'kv',
        `<span>${m.online ? '🟢' : '⚫'} ${m.name}${m.player ? ' (ты)' : ''}</span><b>${F.rankName(id, m.rank)}</b>`));
    });

    if (F.isMember(p, id)) {
      const go = el('button', 'btn primary', 'Управление организацией');
      go.onclick = () => this.open('org', id);
      b.appendChild(go);
    } else {
      const check = F.canJoin(p, id, { wanted: this.game.wanted });
      const join = el('button', 'btn primary', check.ok ? 'Подать заявление' : check.reason);
      join.disabled = !check.ok;
      join.onclick = () => this.game.joinFaction(id);
      b.appendChild(join);
    }
    const back = el('button', 'btn', '← Ко всем организациям');
    back.onclick = () => this.open('factions');
    b.appendChild(back);
  }

  /** Моя организация: дежурство, казна, склад, кадры, журнал. */
  render_org(id) {
    const p = this.game.player;
    const fid = id || p.faction?.id;
    if (!fid || !F.isMember(p, fid)) { this.render_factions(); return; }
    this._arg = fid;
    const f = F.FACTIONS[fid];
    const org = F.orgState(p, fid);
    const perms = F.myPerms(p);
    this.title.textContent = f.name;
    const b = this.body;
    b.innerHTML = '';

    b.appendChild(el('div', 'sec', 'Я'));
    b.appendChild(el('div', 'kv', `<span>Звание</span><b>${F.rankName(fid, F.myRank(p))}</b>`));
    b.appendChild(el('div', 'kv', `<span>Оклад</span><b>${perms.pay} $/мин на смене</b>`));
    b.appendChild(el('div', 'kv', `<span>Заданий выполнено</span><b>${p.faction.duties || 0}</b>`));
    b.appendChild(el('div', 'kv', `<span>Получено зарплаты</span><b>${fmtMoney(Math.round(p.faction.salaryAcc || 0))}</b>`));

    const duty = el('button', 'btn ' + (F.onDuty(p) ? 'danger' : 'primary'),
      F.onDuty(p) ? '🔴 Закончить смену' : '🟢 Заступить на смену');
    duty.onclick = () => this.game.toggleDuty();
    b.appendChild(duty);

    const uni = el('button', 'btn', '👕 Переодеться в форму');
    uni.onclick = () => this.game.wearUniform();
    b.appendChild(uni);

    const car = el('button', 'btn', '🚓 Служебный транспорт');
    car.onclick = () => this.game.takeServiceVehicle();
    b.appendChild(car);

    b.appendChild(el('div', 'sec', 'Служебные задания'));
    const duties = F.availableDuties(p);
    duties.forEach(d => {
      const row = el('div', 'row', `<div class="ic">📋</div><div class="grow">
        <div class="t">${d.name}</div><div class="d">${d.desc} · ${d.pay} $ за точку</div></div>`);
      const go = el('button', 'btn sm primary', 'Взять');
      go.disabled = !F.onDuty(p) || !!p.job;
      go.onclick = () => this.game.startJob(d.id);
      row.appendChild(go);
      b.appendChild(row);
    });
    if (!F.onDuty(p)) b.appendChild(el('div', 'd', 'Задания доступны только на смене.'));

    b.appendChild(el('div', 'sec', `Казна: ${fmtMoney(Math.round(org.budget))}`));
    const amounts = [100, 1000, 10000];
    const rowT = el('div', 'btn-row');
    amounts.forEach(a => {
      const dep = el('button', 'btn sm', `+${a}`);
      dep.onclick = () => { const r = F.depositOrg(p, fid, a); this.game.hud.toast(r.ok ? `Внесено ${a} $` : r.reason, r.ok ? 'good' : 'bad'); this.refresh(); };
      rowT.appendChild(dep);
    });
    if (perms.treasury) amounts.forEach(a => {
      const w = el('button', 'btn sm danger', `−${a}`);
      w.onclick = () => { const r = F.withdrawOrg(p, fid, a); this.game.hud.toast(r.ok ? `Снято ${a} $` : r.reason, r.ok ? 'good' : 'bad'); this.refresh(); };
      rowT.appendChild(w);
    });
    b.appendChild(rowT);

    const store = el('button', 'btn', '📦 Склад организации');
    store.onclick = () => this.open('orgstore', fid);
    b.appendChild(store);

    b.appendChild(el('div', 'sec', `Состав (${org.members.length})`));
    org.members.slice().sort((a, c) => c.rank - a.rank).forEach(m => {
      const row = el('div', 'row', `<div class="ic">${m.online ? '🟢' : '⚫'}</div>
        <div class="grow"><div class="t">${m.name}${m.player ? ' (ты)' : ''}</div>
        <div class="d">${F.rankName(fid, m.rank)}</div></div>`);
      if (perms.promote && !m.player) {
        const up = el('button', 'btn sm', '▲');
        up.onclick = () => { const r = F.setMemberRank(p, fid, m.name, 1); this.game.hud.toast(r.ok ? `${m.name}: ${r.name}` : r.reason, r.ok ? 'good' : 'bad'); this.refresh(); };
        const down = el('button', 'btn sm', '▼');
        down.onclick = () => { const r = F.setMemberRank(p, fid, m.name, -1); this.game.hud.toast(r.ok ? `${m.name}: ${r.name}` : r.reason, r.ok ? 'good' : 'bad'); this.refresh(); };
        row.appendChild(up); row.appendChild(down);
      }
      if (perms.fire && !m.player) {
        const fire = el('button', 'btn sm danger', '✕');
        fire.onclick = () => { const r = F.fireMember(p, fid, m.name); this.game.hud.toast(r.ok ? `${m.name} уволен` : r.reason, r.ok ? 'good' : 'bad'); this.refresh(); };
        row.appendChild(fire);
      }
      b.appendChild(row);
    });
    if (perms.invite) {
      const hire = el('button', 'btn', '➕ Принять кандидата');
      hire.onclick = () => this.game.hireCandidate(fid);
      b.appendChild(hire);
    }

    b.appendChild(el('div', 'sec', 'Журнал действий'));
    if (!org.log.length) b.appendChild(el('div', 'empty', 'Пока пусто.'));
    org.log.slice(0, 12).forEach(l => {
      const d = new Date(l.at);
      b.appendChild(el('div', 'kv',
        `<span>${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span><b style="font-weight:500">${l.text}</b>`));
    });

    const quit = el('button', 'btn danger', 'Уволиться по собственному');
    quit.onclick = () => this.game.leaveFaction();
    b.appendChild(quit);
  }

  render_orgstore(id) {
    const p = this.game.player;
    const fid = id || p.faction?.id;
    if (!fid) { this.render_factions(); return; }
    this._arg = fid;
    const org = F.orgState(p, fid);
    this.title.textContent = 'Склад: ' + F.FACTIONS[fid].name;
    const b = this.body;
    b.innerHTML = '';
    const total = org.warehouse.reduce((s, i) => s + i.qty, 0);
    b.appendChild(el('div', 'sec', `Занято ${total} / ${F.ORG_STORAGE_MAX}`));

    if (!org.warehouse.length) b.appendChild(el('div', 'empty', 'Склад пуст. Сдай сюда снаряжение.'));
    org.warehouse.forEach(e => {
      const it = ITEMS[e.id];
      const row = el('div', 'row', `<div class="ic">${CAT_ICON[it?.cat] || '•'}</div>
        <div class="grow"><div class="t">${it?.name || e.id} ×${e.qty}</div></div>`);
      const take = el('button', 'btn sm primary', 'Взять');
      take.onclick = () => {
        const r = F.orgStoreTake(p, fid, e.id, 1, S.addItem);
        this.game.hud.toast(r.ok ? 'Получено: ' + (it?.name || e.id) : r.reason, r.ok ? 'good' : 'bad');
        this.refresh();
      };
      row.appendChild(take);
      b.appendChild(row);
    });

    b.appendChild(el('div', 'sec', 'Сдать со своего инвентаря'));
    p.inventory.forEach(e => {
      const it = ITEMS[e.id];
      const row = el('div', 'row', `<div class="ic">${CAT_ICON[it?.cat] || '•'}</div>
        <div class="grow"><div class="t">${it?.name || e.id} ×${e.qty}</div></div>`);
      const put = el('button', 'btn sm', 'На склад');
      put.onclick = () => {
        const r = F.orgStorePut(p, fid, e.id, 1, S.invCount, S.removeItem);
        this.game.hud.toast(r.ok ? 'Сдано на склад' : r.reason, r.ok ? 'good' : 'bad');
        this.refresh();
      };
      row.appendChild(put);
      b.appendChild(row);
    });
  }

  /* ======================= ТЕЛЕФОН / МЕНЮ ======================= */
  render_phone() {
    const p = this.game.player;
    this.title.textContent = p.name;
    const b = this.body;
    b.innerHTML = '';

    const info = el('div');
    info.innerHTML = `
      <div class="kv"><span>Наличные</span><b style="color:var(--good)">${fmtMoney(p.money)}</b></div>
      <div class="kv"><span>Счёт в банке</span><b>${fmtMoney(p.bank)}</b></div>
      <div class="kv"><span>Уровень</span><b>${p.level}</b></div>
      <div class="kv"><span>Репутация</span><b>${p.rep}</b></div>
      <div class="kv"><span>Транспорт</span><b>${p.vehicles.length}</b></div>
      <div class="kv"><span>Недвижимость</span><b>${p.properties.length}</b></div>
      <div class="kv"><span>В игре</span><b>${Math.floor(p.playtime / 60)} мин</b></div>`;
    b.appendChild(info);

    b.appendChild(el('div', 'sec', 'Разделы'));
    const nav = [
      ['🚗 Мой транспорт', 'vehicles'],
      ['🏠 Недвижимость', 'properties'],
      ['🏛 Организации', 'factions'],
      ['🎯 Задания', 'quests'],
      ['🏦 Банк', 'bank'],
      ['🌐 Мультиплеер', 'servers'],
      ['⚙️ Настройки', 'settings']
    ];
    nav.forEach(([label, panel]) => {
      const btn = el('button', 'btn', label);
      btn.onclick = () => this.open(panel);
      b.appendChild(btn);
    });

    b.appendChild(el('div', 'sec', 'Опасная зона'));
    const sv = el('button', 'btn good', '💾 Сохранить игру');
    sv.onclick = () => this.game.saveGame(true);
    b.appendChild(sv);
    const q = el('button', 'btn danger', '🚪 Выйти в меню');
    q.onclick = () => this.game.quitToMenu();
    b.appendChild(q);
  }

  /* ======================= ТРАНСПОРТ ИГРОКА ======================= */
  render_vehicles() {
    const p = this.game.player;
    this.title.textContent = 'Мой транспорт';
    const b = this.body;
    b.innerHTML = '';

    const buy = el('button', 'btn primary', '🛒 Автосалон');
    buy.onclick = () => this.open('dealership');
    b.appendChild(buy);

    if (!p.vehicles.length) {
      b.appendChild(el('div', 'empty', 'Своего транспорта нет. Загляни в автосалон или угони… шутка.'));
      return;
    }

    b.appendChild(el('div', 'sec', 'Гараж'));
    p.vehicles.forEach(v => {
      const spec = VEHICLES[v.type];
      const row = el('div', 'row');
      const spawned = this.game.isVehicleSpawned(v.plate);
      row.innerHTML = `<div class="ic">🚗</div><div class="grow">
        <div class="t">${spec.name} · ${v.plate}</div>
        <div class="d">Топливо ${Math.round(v.fuel)} л · износ ${Math.round(v.damage * 100)}%
        ${spawned ? ' · <span style="color:var(--good)">на улице</span>' : ' · в гараже'}</div></div>`;
      const acts = el('div', 'btn-row');
      const call = el('button', 'btn sm primary', spawned ? 'Найти' : 'Подать');
      call.onclick = () => this.game.summonVehicle(v.plate);
      acts.appendChild(call);
      if (spawned) {
        const store = el('button', 'btn sm', 'В гараж');
        store.onclick = () => this.game.storeVehicle(v.plate);
        acts.appendChild(store);
      }
      const sell = el('button', 'btn sm danger', 'Продать');
      sell.onclick = () => this.game.sellVehicle(v.plate);
      acts.appendChild(sell);
      row.appendChild(acts);
      b.appendChild(row);
    });
  }

  /* ======================= АВТОСАЛОН ======================= */
  render_dealership() {
    const p = this.game.player;
    this.title.textContent = 'Автосалон';
    const b = this.body;
    b.innerHTML = '';
    b.appendChild(el('div', 'sec', `Наличные: ${fmtMoney(p.money)}`));

    DEALERSHIP.forEach(type => {
      const spec = VEHICLES[type];
      const row = el('div', 'row');
      const afford = p.money >= spec.price;
      if (!afford) row.classList.add('locked');
      row.innerHTML = `<div class="ic">🚘</div><div class="grow">
        <div class="t">${spec.name}</div>
        <div class="d">Макс. ${Math.round(spec.maxSpeed * 3.6)} км/ч · разгон ${spec.accel} · мест ${spec.seats} · багажник ${spec.trunk} кг</div>
        </div><div class="price">${spec.price} $</div>`;
      const go = el('button', 'btn sm primary', 'Купить');
      go.disabled = !afford;
      go.onclick = () => this.game.buyVehicle(type);
      row.appendChild(go);
      b.appendChild(row);
    });
  }

  /* ======================= НЕДВИЖИМОСТЬ ======================= */
  render_properties() {
    const p = this.game.player;
    this.title.textContent = 'Недвижимость';
    const b = this.body;
    b.innerHTML = '';

    if (!p.properties.length) {
      b.appendChild(el('div', 'empty', 'Жилья нет. Подойди к дому с табличкой «Продаётся» и нажми взаимодействие.'));
    } else {
      p.properties.forEach(h => {
        const row = el('div', 'row');
        row.innerHTML = `<div class="ic">🏠</div><div class="grow">
          <div class="t">${h.name}</div><div class="d">Куплен за ${fmtMoney(h.price)}</div></div>`;
        const go = el('button', 'btn sm', 'На карту');
        go.onclick = () => { this.close(); this.game.setWaypoint(h.x, h.z, h.name); };
        row.appendChild(go);
        b.appendChild(row);
      });
    }

    b.appendChild(el('div', 'sec', 'Дома в продаже рядом'));
    const near = this.game.city.pois
      .filter(x => x.type === 'house' && !S.ownsProperty(p, x.id))
      .map(x => ({ x, d: dist2D(x.x, x.z, this.game.player3d.pos.x, this.game.player3d.pos.z) }))
      .sort((a, b2) => a.d - b2.d).slice(0, 8);

    near.forEach(({ x: h, d }) => {
      const row = el('div', 'row');
      const afford = p.money >= h.price;
      if (!afford) row.classList.add('locked');
      row.innerHTML = `<div class="ic">🏡</div><div class="grow">
        <div class="t">${h.name}</div><div class="d">${Math.round(d)} м отсюда · с гаражом</div></div>
        <div class="price">${h.price} $</div>`;
      const go = el('button', 'btn sm', 'Маршрут');
      go.onclick = () => { this.close(); this.game.setWaypoint(h.x, h.z, h.name); };
      row.appendChild(go);
      b.appendChild(row);
    });
  }

  /* ======================= ЗАДАНИЯ ======================= */
  render_quests() {
    const p = this.game.player;
    this.title.textContent = 'Задания';
    const b = this.body;
    b.innerHTML = '';

    QUESTS.forEach(q => {
      const st = S.questState(p, q.id);
      const row = el('div', 'row' + (st.done ? '' : ' active'));
      const stepsHtml = q.steps.map((s, i) => {
        const mark = st.done || i < st.step ? '✅' : (i === st.step ? '▶️' : '⬜');
        return `${mark} ${s.text}`;
      }).join('<br>');
      row.innerHTML = `<div class="ic">${st.done ? '🏆' : '🎯'}</div><div class="grow">
        <div class="t">${q.name}</div>
        <div class="d">${q.desc}</div>
        <div class="d" style="margin-top:5px">${stepsHtml}</div>
        <div class="d" style="margin-top:4px;color:var(--gold)">Награда: ${q.reward.money} $ · ${q.reward.xp} XP${q.reward.license ? ' · права' : ''}</div>
        </div>`;
      b.appendChild(row);
    });
  }

  /* ======================= БАНК ======================= */
  render_bank() {
    const p = this.game.player;
    this.title.textContent = 'Банк';
    const b = this.body;
    b.innerHTML = '';
    b.innerHTML = `<div class="kv"><span>Наличные</span><b>${fmtMoney(p.money)}</b></div>
      <div class="kv"><span>На счету</span><b>${fmtMoney(p.bank)}</b></div>`;

    [100, 500, 1000, 5000].forEach(amt => {
      const r = el('div', 'btn-row');
      const d = el('button', 'btn sm', `Положить ${amt}`);
      d.disabled = p.money < amt;
      d.onclick = () => { S.deposit(p, amt); this.game.hud.toast(`Внесено ${amt} $`, 'good'); this.refresh(); };
      const w = el('button', 'btn sm', `Снять ${amt}`);
      w.disabled = p.bank < amt;
      w.onclick = () => { S.withdraw(p, amt); this.game.hud.toast(`Снято ${amt} $`, 'good'); this.refresh(); };
      r.appendChild(d); r.appendChild(w);
      b.appendChild(r);
    });

    const all = el('button', 'btn', 'Положить всё');
    all.onclick = () => { S.deposit(p, p.money); this.refresh(); };
    b.appendChild(all);
  }

  /* ======================= НАСТРОЙКИ ======================= */
  render_settings() {
    this.title.textContent = 'Настройки';
    const b = this.body;
    b.innerHTML = '';

    b.appendChild(el('div', 'sec', 'Качество графики'));
    const seg = el('div', 'seg');
    ['AUTO', 'LOW', 'MEDIUM', 'HIGH'].forEach(q => {
      const btn = el('button', 'seg-btn' + (this.game.engine.qualityName === q ? ' active' : ''),
        { AUTO: 'Авто', LOW: 'Низкое', MEDIUM: 'Среднее', HIGH: 'Высокое' }[q]);
      btn.onclick = () => { this.game.setQuality(q); this.refresh(); };
      seg.appendChild(btn);
    });
    b.appendChild(seg);

    const eng = this.game.engine;
    const info = el('div', 'row');
    info.innerHTML = `<div class="ic">🎛</div><div class="grow">
      <div class="t">Сейчас: уровень ${eng.level} из 7 · ${eng.fps} fps</div>
      <div class="d">Авто поднимает графику до максимума, пока держится ${eng.targetFps}+ fps,
      и снижает, если просело. Тени, дальность, трафик и чёткость подбираются сами.</div></div>`;
    b.appendChild(info);

    b.appendChild(el('div', 'sec', 'Чёткость картинки'));
    const sharpSeg = el('div', 'seg');
    [['Мягко', 0.85], ['Норма', 1.1], ['Чётко', 1.4], ['Макс', 2]].forEach(([label, v]) => {
      const btn = el('button', 'seg-btn' + (Math.abs(eng.sharpness - v) < 0.01 ? ' active' : ''), label);
      btn.onclick = () => { eng.setSharpness(v); this.refresh(); };
      sharpSeg.appendChild(btn);
    });
    b.appendChild(sharpSeg);
    b.appendChild(el('div', 'd', '<div class="d" style="margin-top:6px">Если картинка мыльная — поставь «Чётко» или «Макс». Чем выше, тем резче, но тяжелее для видео.</div>'));

    b.appendChild(el('div', 'sec', 'Минимальный FPS'));
    const fpsSeg = el('div', 'seg');
    [30, 45, 60].forEach(v => {
      const btn = el('button', 'seg-btn' + (eng.targetFps === v ? ' active' : ''), v + ' fps');
      btn.onclick = () => {
        eng.targetFps = v;
        try { localStorage.setItem('rp:targetFps', String(v)); } catch { /* ignore */ }
        this.refresh();
      };
      fpsSeg.appendChild(btn);
    });
    b.appendChild(fpsSeg);
    b.appendChild(el('div', 'd', '<div class="d" style="margin-top:6px">30 — красивее, 60 — плавнее. По умолчанию 45.</div>'));

    b.appendChild(el('div', 'sec', 'Вид'));
    const camSeg = el('div', 'seg');
    [['Третье лицо', false], ['Первое лицо', true]].forEach(([label, fp]) => {
      const btn = el('button', 'seg-btn' + (this.game.player3d.firstPerson === fp ? ' active' : ''), label);
      btn.onclick = () => { this.game.player3d.firstPerson = fp; this.refresh(); };
      camSeg.appendChild(btn);
    });
    b.appendChild(camSeg);

    b.appendChild(el('div', 'sec', 'Время суток'));
    const t = el('div', 'btn-row');
    [['Утро', 8], ['День', 13], ['Закат', 19], ['Ночь', 1]].forEach(([label, h]) => {
      const btn = el('button', 'btn sm', label);
      btn.onclick = () => { this.game.engine.time = h; this.refresh(); };
      t.appendChild(btn);
    });
    b.appendChild(t);

    b.appendChild(el('div', 'sec', 'Данные'));
    const wipe = el('button', 'btn danger', 'Удалить сохранение');
    wipe.onclick = () => this.game.confirmWipe();
    b.appendChild(wipe);
  }

  /* ======================= СЕРВЕРЫ ======================= */
  render_servers() {
    this.title.textContent = 'Мультиплеер';
    const b = this.body;
    b.innerHTML = '';
    const net = this.game.net;

    const status = el('div', 'row');
    status.innerHTML = `<div class="ic">${net.connected ? '🟢' : '⚪'}</div><div class="grow">
      <div class="t">${net.connected ? 'Подключён: ' + net.serverName : 'Оффлайн (одиночная игра)'}</div>
      <div class="d">${net.connected ? net.players.size + ' игроков на сервере' : 'Город живёт локально, NPC и трафик работают'}</div></div>`;
    b.appendChild(status);

    b.appendChild(el('div', 'sec', 'Подключение к серверу'));
    const inp = el('input');
    inp.type = 'text';
    inp.placeholder = 'ws://адрес:8787';
    inp.value = net.lastUrl || localStorage.getItem('rp:lastServer') || '';
    inp.style.cssText = 'width:100%;background:rgba(255,255,255,.06);border:1px solid var(--line);border-radius:11px;padding:12px;color:var(--text);outline:none;user-select:text;margin-bottom:8px';
    b.appendChild(inp);

    const row = el('div', 'btn-row');
    const conn = el('button', 'btn sm primary', 'Подключиться');
    conn.onclick = () => {
      const url = inp.value.trim();
      if (!url) { this.game.hud.toast('Введи адрес сервера', 'bad'); return; }
      localStorage.setItem('rp:lastServer', url);
      this.game.connectServer(url);
      setTimeout(() => this.refresh(), 900);
    };
    const disc = el('button', 'btn sm danger', 'Отключиться');
    disc.disabled = !net.connected;
    disc.onclick = () => { net.disconnect(); this.refresh(); };
    row.appendChild(conn); row.appendChild(disc);
    b.appendChild(row);

    if (net.connected && net.players.size) {
      b.appendChild(el('div', 'sec', 'Игроки онлайн'));
      net.players.forEach(pl => {
        const r = el('div', 'row');
        r.innerHTML = `<div class="ic">👤</div><div class="grow"><div class="t">${pl.name}</div>
          <div class="d">${pl.inVehicle ? 'за рулём' : 'пешком'} · ${Math.round(dist2D(pl.x, pl.z, this.game.player3d.pos.x, this.game.player3d.pos.z))} м</div></div>`;
        b.appendChild(r);
      });
    }

    b.appendChild(el('div', 'sec', 'Как поднять свой сервер'));
    b.appendChild(el('div', 'd', `<div class="d" style="line-height:1.6">
      Сервер лежит в репозитории в папке <b>server/</b>. На компьютере:<br>
      <code style="color:var(--acc)">cd server && npm install && npm start</code><br>
      Он поднимется на порту <b>8787</b>. Узнай локальный IP компьютера
      (<code>ipconfig</code> / <code>ifconfig</code>) и введи сюда
      <code style="color:var(--acc)">ws://192.168.х.х:8787</code>.<br>
      Телефон и компьютер должны быть в одной Wi-Fi сети.
      Мир детерминированный (один сид), поэтому город у всех одинаковый.</div>`));
  }
}

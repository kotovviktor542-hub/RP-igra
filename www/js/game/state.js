/* state.js — состояние игрока, инвентарь, экономика, работы, задания, сохранение.
   Чистая логика без three.js — покрыта тестами. */

import { ITEMS, SHOP_STOCK, JOBS, QUESTS, ECONOMY, DEALERSHIP } from './content.js';
import { WEAPONS, normalizeAmmo, addAmmo } from './weapons.js';

const SAVE_KEY = 'rp:save:v2';
export const SAVE_VERSION = 2;

export function createPlayer(opts = {}) {
  return {
    version: SAVE_VERSION,
    name: (opts.name || 'Игрок').slice(0, 24),
    look: opts.look || {},
    created: Date.now(),

    money: ECONOMY.startMoney,
    bank: ECONOMY.bankStart,
    level: 1,
    xp: 0,
    rep: 0,

    stats: { health: 100, hunger: 80, thirst: 80, energy: 90 },
    ammo: {},                 // калибр -> патронов в запасе
    mags: {},                 // ствол -> патронов в магазине
    armor: 0,
    equipped: null,
    licenses: {},

    pos: { x: opts.x ?? 0, z: opts.z ?? 0, rot: 0 },

    inventory: [],            // [{id, qty}]
    vehicles: [],             // [{type, color, plate, x, z, rot, fuel, damage, stored}]
    properties: [],           // [{id, name, x, z, price, garage}]

    stash: {},                // id недвижимости -> [{id, qty}] (сейф/хранилище)
    worn: {},                 // слот одежды -> id предмета
    job: null,                // {id, stops:[{x,z,done}], current, earned}
    jobsDone: {},
    quests: {},               // id -> {step, done}
    stats2: { distDriven: 0, distWalked: 0, visited: {} },

    playtime: 0,
    lastSave: Date.now()
  };
}

/* ======================= ИНВЕНТАРЬ ======================= */
export function invWeight(p) {
  return p.inventory.reduce((s, it) => s + (ITEMS[it.id]?.weight || 0) * it.qty, 0);
}

export function invCount(p, id) {
  const e = p.inventory.find(i => i.id === id);
  return e ? e.qty : 0;
}

export function canCarry(p, id, qty = 1) {
  const w = (ITEMS[id]?.weight || 0) * qty;
  return invWeight(p) + w <= ECONOMY.inventoryMaxWeight + 1e-6;
}

export function addItem(p, id, qty = 1) {
  if (!ITEMS[id]) return { ok: false, reason: 'Нет такого предмета' };
  if (!canCarry(p, id, qty)) return { ok: false, reason: 'Слишком тяжело' };
  const e = p.inventory.find(i => i.id === id);
  if (e) e.qty += qty;
  else p.inventory.push({ id, qty });
  return { ok: true };
}

export function removeItem(p, id, qty = 1) {
  const e = p.inventory.find(i => i.id === id);
  if (!e || e.qty < qty) return { ok: false, reason: 'Нет предмета' };
  e.qty -= qty;
  if (e.qty <= 0) p.inventory = p.inventory.filter(i => i !== e);
  return { ok: true };
}

/** Использовать предмет: еда/медицина/топливо. */
export function useItem(p, id, ctx = {}) {
  const it = ITEMS[id];
  if (!it) return { ok: false, reason: 'Неизвестный предмет' };
  if (invCount(p, id) <= 0) return { ok: false, reason: 'Нет в инвентаре' };

  const msgs = [];

  if (it.fuel) {
    if (!ctx.vehicle) return { ok: false, reason: 'Нужно быть рядом с машиной' };
    ctx.vehicle.refuel(it.fuel);
    msgs.push(`Залил ${it.fuel} л топлива`);
  } else if (it.repair) {
    if (!ctx.vehicle) return { ok: false, reason: 'Нужно быть рядом с машиной' };
    ctx.vehicle.repair();
    msgs.push('Машина отремонтирована');
  } else if (it.hunger || it.thirst || it.health || it.energy || it.mood) {
    const before = { ...p.stats };
    if (it.hunger) p.stats.hunger = clamp100(p.stats.hunger + it.hunger);
    if (it.thirst) p.stats.thirst = clamp100(p.stats.thirst + it.thirst);
    if (it.health) p.stats.health = clamp100(p.stats.health + it.health);
    if (it.energy) p.stats.energy = clamp100(p.stats.energy + it.energy);
    const parts = [];
    if (p.stats.hunger !== before.hunger) parts.push(`сытость ${sign(p.stats.hunger - before.hunger)}`);
    if (p.stats.thirst !== before.thirst) parts.push(`жажда ${sign(p.stats.thirst - before.thirst)}`);
    if (p.stats.health !== before.health) parts.push(`здоровье ${sign(p.stats.health - before.health)}`);
    if (p.stats.energy !== before.energy) parts.push(`энергия ${sign(p.stats.energy - before.energy)}`);
    msgs.push(`${it.name}: ${parts.join(', ') || 'без эффекта'}`);
  } else if (it.armor) {
    p.armor = Math.min(100, (p.armor || 0) + it.armor);
    msgs.push(`Надел бронежилет (броня ${p.armor})`);
  } else if (it.ammo) {
    const type = it.ammoType || '9mm';
    addAmmo(p, type, it.ammo);
    msgs.push(`+${it.ammo} патронов ${type} (в запасе ${p.ammo[type]})`);
  } else if (it.equip) {
    normalizeAmmo(p);
    p.equipped = p.equipped === it.equip ? null : it.equip;
    return { ok: true, messages: [p.equipped ? `В руках: ${it.name}` : `Убрал: ${it.name}`], equip: p.equipped };
  } else if (it.wear) {
    msgs.push(`Надел: ${it.name}`);
    p.worn = p.worn || {};
    p.worn[it.wear] = id;
    return { ok: true, messages: msgs, worn: it.wear };
  } else {
    return { ok: false, reason: 'Этот предмет не используется' };
  }

  removeItem(p, id, 1);
  return { ok: true, messages: msgs };
}

const clamp100 = v => Math.max(0, Math.min(100, Math.round(v)));
const sign = v => (v > 0 ? '+' : '') + v;

/* ======================= ДЕНЬГИ ======================= */
export function pay(p, amount) {
  if (p.money < amount) return { ok: false, reason: 'Недостаточно денег' };
  p.money -= amount;
  return { ok: true };
}

export function earn(p, amount) {
  p.money += Math.round(amount);
  return { ok: true };
}

export function deposit(p, amount) {
  if (amount <= 0 || p.money < amount) return { ok: false, reason: 'Нечего класть' };
  p.money -= amount; p.bank += amount;
  return { ok: true };
}

export function withdraw(p, amount) {
  if (amount <= 0 || p.bank < amount) return { ok: false, reason: 'Недостаточно на счету' };
  p.bank -= amount; p.money += amount;
  return { ok: true };
}

/* ======================= МАГАЗИН ======================= */
export function shopCatalog(kind) {
  return (SHOP_STOCK[kind] || SHOP_STOCK.market).map(id => ({ id, ...ITEMS[id] }));
}

export function buyItem(p, id, qty = 1) {
  const it = ITEMS[id];
  if (!it) return { ok: false, reason: 'Нет такого товара' };
  const cost = it.price * qty;
  if (p.money < cost) return { ok: false, reason: 'Не хватает денег' };
  if (!canCarry(p, id, qty)) return { ok: false, reason: 'Не унесёшь — перегруз' };
  p.money -= cost;
  addItem(p, id, qty);
  return { ok: true, cost, messages: [`Куплено: ${it.name} ×${qty} за ${cost} $`] };
}

export function sellItem(p, id, qty = 1) {
  const it = ITEMS[id];
  if (!it) return { ok: false, reason: 'Нет такого товара' };
  if (invCount(p, id) < qty) return { ok: false, reason: 'Нет в инвентаре' };
  const gain = Math.floor(it.price * 0.45) * qty;
  removeItem(p, id, qty);
  p.money += gain;
  return { ok: true, gain, messages: [`Продано: ${it.name} ×${qty} за ${gain} $`] };
}

/* ======================= ТРАНСПОРТ ======================= */
export function buyVehicle(p, type, price, color) {
  if (!DEALERSHIP.includes(type)) return { ok: false, reason: 'Этой модели нет в салоне' };
  if (p.money < price) return { ok: false, reason: 'Не хватает денег' };
  p.money -= price;
  const plate = randomPlate();
  p.vehicles.push({ type, color, plate, x: 0, z: 0, rot: 0, fuel: 80, damage: 0, stored: true });
  return { ok: true, plate, messages: [`Куплен транспорт: ${type} (${plate})`] };
}

export function randomPlate() {
  const L = 'ABCEHKMOPTXY';
  const r = n => Array.from({ length: n }, () => L[(Math.random() * L.length) | 0]).join('');
  return `${r(1)}${(100 + Math.random() * 900) | 0}${r(2)}`;
}

export function sellVehicle(p, plate) {
  const idx = p.vehicles.findIndex(v => v.plate === plate);
  if (idx < 0) return { ok: false, reason: 'Нет такого транспорта' };
  const v = p.vehicles[idx];
  const base = 10000;
  const gain = Math.round(base * 0.5 * (1 - v.damage * 0.5));
  p.vehicles.splice(idx, 1);
  p.money += gain;
  return { ok: true, gain };
}

/* ======================= НЕДВИЖИМОСТЬ ======================= */
export function buyProperty(p, poi) {
  if (!poi || (poi.type !== 'house' && poi.type !== 'apartment')) return { ok: false, reason: 'Это не продаётся' };
  if (p.properties.some(h => h.id === poi.id)) return { ok: false, reason: 'Уже твоё' };
  if (p.money < poi.price) return { ok: false, reason: 'Не хватает денег' };
  p.money -= poi.price;
  p.properties.push({ id: poi.id, name: poi.name, x: poi.x, z: poi.z, price: poi.price,
    garage: poi.garage, kind: poi.type, floor: poi.floor });
  return { ok: true, messages: [`Куплен ${poi.name} за ${poi.price} $`] };
}

export function ownsProperty(p, id) {
  return p.properties.some(h => h.id === id);
}

/* ======================= ХРАНИЛИЩЕ (сейф в жилье) ======================= */
export function stashList(p, where = 'home') {
  if (!p.stash || typeof p.stash !== 'object') p.stash = {};
  if (!Array.isArray(p.stash[where])) p.stash[where] = [];
  return p.stash[where];
}

export const STASH_MAX = 60;   // предметов в сейфе

/** Кладёт предмет из инвентаря в сейф. */
export function stashPut(p, where, id, qty = 1) {
  if (invCount(p, id) < qty) return { ok: false, reason: 'Нет в инвентаре' };
  const list = stashList(p, where);
  const total = list.reduce((s, i) => s + i.qty, 0);
  if (total + qty > STASH_MAX) return { ok: false, reason: 'В сейфе нет места' };
  removeItem(p, id, qty);
  const e = list.find(i => i.id === id);
  if (e) e.qty += qty; else list.push({ id, qty });
  return { ok: true };
}

/** Забирает предмет из сейфа обратно в инвентарь. */
export function stashTake(p, where, id, qty = 1) {
  const list = stashList(p, where);
  const e = list.find(i => i.id === id);
  if (!e || e.qty < qty) return { ok: false, reason: 'Нет в сейфе' };
  if (!canCarry(p, id, qty)) return { ok: false, reason: 'Слишком тяжело' };
  e.qty -= qty;
  if (e.qty <= 0) list.splice(list.indexOf(e), 1);
  addItem(p, id, qty);
  return { ok: true };
}

/* ======================= ОДЕЖДА ======================= */
/** Надевает вещь из инвентаря в свой слот (футболка/штаны/обувь). */
export function wearItem(p, id) {
  const it = ITEMS[id];
  if (!it || !it.wear) return { ok: false, reason: 'Это не одежда' };
  if (invCount(p, id) <= 0) return { ok: false, reason: 'Нет в инвентаре' };
  p.worn = p.worn || {};
  p.worn[it.wear] = id;
  return { ok: true, slot: it.wear };
}

export function takeOff(p, slot) {
  p.worn = p.worn || {};
  if (!p.worn[slot]) return { ok: false, reason: 'Слот пуст' };
  delete p.worn[slot];
  return { ok: true };
}

/* ======================= РАБОТЫ ======================= */
export function startJob(p, jobId, stops) {
  const def = JOBS[jobId];
  if (!def) return { ok: false, reason: 'Нет такой работы' };
  if (p.job) return { ok: false, reason: 'Уже на смене' };
  if (def.reqRep && p.rep < def.reqRep) return { ok: false, reason: `Нужна репутация ${def.reqRep}` };
  if (def.reqLicense && !p.licenses[def.reqLicense]) return { ok: false, reason: 'Нужны права' };

  p.job = {
    id: jobId,
    stops: stops.map(s => ({ x: s.x, z: s.z, done: false })),
    current: 0,
    earned: 0,
    started: Date.now()
  };
  return { ok: true, def, messages: [`Смена начата: ${def.name}`] };
}

/** Отметить текущую точку выполненной. */
export function completeStop(p) {
  if (!p.job) return { ok: false, reason: 'Нет активной смены' };
  const def = JOBS[p.job.id];
  const stop = p.job.stops[p.job.current];
  if (!stop) return { ok: false, reason: 'Нет точки' };
  stop.done = true;
  p.job.earned += def.payPerStop;
  p.job.current++;

  if (p.job.current >= p.job.stops.length) {
    const total = p.job.earned + def.bonus;
    p.money += total;
    p.xp += def.xp;
    p.rep += 1;
    p.jobsDone[p.job.id] = (p.jobsDone[p.job.id] || 0) + 1;
    const jid = p.job.id;
    p.job = null;
    levelUpCheck(p);
    return { ok: true, finished: true, total, jobId: jid, messages: [`Смена завершена: +${total} $`] };
  }
  return { ok: true, finished: false, pay: def.payPerStop, messages: [`Точка сдана: +${def.payPerStop} $`] };
}

export function cancelJob(p) {
  if (!p.job) return { ok: false, reason: 'Нет смены' };
  const earned = Math.floor(p.job.earned * 0.5);
  p.money += earned;
  p.job = null;
  return { ok: true, earned, messages: [`Смена брошена. Получено ${earned} $`] };
}

/* ======================= УРОВНИ ======================= */
export function levelUpCheck(p) {
  let ups = 0;
  while (p.xp >= ECONOMY.levelXp(p.level)) {
    p.xp -= ECONOMY.levelXp(p.level);
    p.level++;
    ups++;
  }
  return ups;
}

/* ======================= ЗАДАНИЯ ======================= */
export function questState(p, id) {
  if (!p.quests[id]) p.quests[id] = { step: 0, done: false };
  return p.quests[id];
}

export function activeQuests(p) {
  return QUESTS.filter(q => !questState(p, q.id).done);
}

/**
 * Прокидываем событие в систему заданий.
 * @param {string} type тип события
 * @param {object} data payload
 * @returns {Array} список завершённых квестов
 */
export function questEvent(p, type, data = {}) {
  const finished = [];
  for (const q of QUESTS) {
    const st = questState(p, q.id);
    if (st.done) continue;
    const step = q.steps[st.step];
    if (!step || step.type !== type) continue;

    let match = false;
    switch (type) {
      case 'buy_cat':      match = data.cat === step.cat; break;
      case 'use_cat':      match = data.cat === step.cat; break;
      case 'enter_vehicle':match = true; break;
      case 'drive_dist':   match = (p.stats2.distDriven || 0) >= step.amount; break;
      case 'job_start':    match = true; break;
      case 'job_finish':   match = true; break;
      case 'money':        match = p.money >= step.amount; break;
      case 'buy_house':    match = true; break;
      case 'buy_vehicle':  match = true; break;
      case 'visit':        match = data.poi === step.poi; break;
      default: match = false;
    }
    if (!match) continue;

    st.step++;
    if (st.step >= q.steps.length) {
      st.done = true;
      const r = q.reward || {};
      if (r.money) p.money += r.money;
      if (r.rep) p.rep += r.rep;
      if (r.xp) p.xp += r.xp;
      if (r.license) p.licenses[r.license] = true;
      levelUpCheck(p);
      finished.push(q);
    }
  }
  return finished;
}

/* ======================= ПОТРЕБНОСТИ ======================= */
/** dt в секундах игрового времени. */
export function tickNeeds(p, dtSeconds) {
  const m = dtSeconds / 60;
  p.stats.hunger = clamp100(p.stats.hunger - ECONOMY.hungerRate * m);
  p.stats.thirst = clamp100(p.stats.thirst - ECONOMY.thirstRate * m);
  p.stats.energy = clamp100(p.stats.energy - ECONOMY.energyRate * m);

  let dmg = 0;
  if (p.stats.hunger <= 0) dmg += 1.2 * m;
  if (p.stats.thirst <= 0) dmg += 1.8 * m;
  if (p.stats.energy <= 0) dmg += 0.4 * m;
  if (dmg > 0) p.stats.health = clamp100(p.stats.health - dmg);

  p.playtime += dtSeconds;
  return p.stats.health <= 0;
}

/** Смерть: респавн в больнице со штрафом. */
export function respawn(p) {
  const fee = Math.min(p.money, ECONOMY.hospitalFee);
  p.money -= fee;
  p.stats.health = 70;
  p.stats.hunger = Math.max(p.stats.hunger, 35);
  p.stats.thirst = Math.max(p.stats.thirst, 35);
  p.stats.energy = Math.max(p.stats.energy, 50);
  if (p.job) p.job = null;
  return { fee };
}

/* ======================= СОХРАНЕНИЕ ======================= */
export function save(p) {
  try {
    p.lastSave = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
    return true;
  } catch (e) { return false; }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.version !== SAVE_VERSION) return null;
    // защита от битых сейвов
    if (!d.stats || !d.inventory) return null;
    d.stats2 = d.stats2 || { distDriven: 0, distWalked: 0, visited: {} };
    d.quests = d.quests || {};
    d.licenses = d.licenses || {};
    normalizeAmmo(d);          // старые сейвы: ammo было числом
    if (!d.stash || typeof d.stash !== 'object') d.stash = {};
    if (!d.worn || typeof d.worn !== 'object') d.worn = {};
    if (!Number.isFinite(d.armor)) d.armor = 0;
    if (d.equipped && !WEAPONS[d.equipped]) d.equipped = null;
    return d;
  } catch (e) { return null; }
}

export function wipe() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no-op */ }
}

export { SAVE_KEY };

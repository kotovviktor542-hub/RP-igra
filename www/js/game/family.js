/* family.js — семьи как в Amazing: создание через нотариуса, ранги, общая казна,
   штаб в своей недвижимости, приём участников и вклады. */

import { fmtMoney } from '../core/utils.js';

export const MIN_LEVEL = 10;
export const CREATE_FEE = 250000;
export const MAX_MEMBERS = 20;

export const ROLES = [
  { id: 0, name: 'Участник',      icon: '👤', perms: [] },
  { id: 1, name: 'Доверенный',    icon: '🤝', perms: ['invite'] },
  { id: 2, name: 'Заместитель',   icon: '⭐', perms: ['invite', 'treasury', 'promote'] },
  { id: 3, name: 'Глава семьи',   icon: '👑', perms: ['invite', 'treasury', 'promote', 'leader'] }
];

const NPC_NAMES = [
  'Витя Батя', 'Серёга Кувалда', 'Лёха Пельмень', 'Гена Тормоз', 'Толян Шпала',
  'Димон Штирлиц', 'Коля Бетон', 'Саня Кастет', 'Игорь Рубль', 'Паша Шлагбаум'
];

/** Возвращает семью игрока или null. */
export function get(p) {
  if (!p.family) return null;
  return p.family;
}

/** Проверка возможности создать семью. */
export function canCreate(p) {
  if (p.level < MIN_LEVEL) return { ok: false, reason: `Нужен ${MIN_LEVEL} уровень` };
  if (p.family) return { ok: false, reason: 'Ты уже в семье' };
  if (!(p.properties && p.properties.length)) {
    return { ok: false, reason: 'Нужна своя недвижимость под штаб' };
  }
  if (p.money < CREATE_FEE) {
    return { ok: false, reason: `Нужно ${fmtMoney(CREATE_FEE)} на регистрацию` };
  }
  return { ok: true };
}

/** Создаёт семью. Игрок становится главой. */
export function create(p, name) {
  const clean = (name || '').trim().slice(0, 22);
  if (clean.length < 2) return { ok: false, reason: 'Название слишком короткое' };
  const chk = canCreate(p);
  if (!chk.ok) return chk;

  p.money -= CREATE_FEE;
  p.family = {
    id: 'fam_' + Date.now(),
    name: clean,
    created: Date.now(),
    bank: 0,
    members: [{ id: p.id || 'player', name: p.name, rank: 3, contrib: 0 }],
    log: [{ at: Date.now(), text: `Семья «${clean}» зарегистрирована у нотариуса` }],
    homeId: p.properties[0].id
  };
  return { ok: true, family: p.family };
}

/** Вклад в общую казну. */
export function deposit(p, amount) {
  const f = get(p);
  if (!f) return { ok: false, reason: 'Нет семьи' };
  const amt = Math.max(0, Math.min(p.money, amount));
  if (amt <= 0) return { ok: false, reason: 'Нет денег' };
  p.money -= amt;
  f.bank += amt;
  const me = f.members.find(m => m.id === (p.id || 'player'));
  if (me) me.contrib += amt;
  f.log.push({ at: Date.now(), text: `${p.name} внёс ${fmtMoney(amt)} в казну` });
  return { ok: true, amount: amt };
}

/** Взять из казны — только зам и глава. */
export function withdraw(p, amount) {
  const f = get(p);
  if (!f) return { ok: false, reason: 'Нет семьи' };
  const me = f.members.find(m => m.id === (p.id || 'player'));
  if (!me || !ROLES[me.rank].perms.includes('treasury')) {
    return { ok: false, reason: 'Нет прав на казну' };
  }
  const amt = Math.max(0, Math.min(f.bank, amount));
  if (amt <= 0) return { ok: false, reason: 'Казна пуста' };
  f.bank -= amt;
  p.money += amt;
  f.log.push({ at: Date.now(), text: `${p.name} взял ${fmtMoney(amt)} из казны` });
  return { ok: true, amount: amt };
}

/** Принять NPC в семью (в одиночной игре — боты-участники). */
export function addNpc(p, game) {
  const f = get(p);
  if (!f) return { ok: false, reason: 'Нет семьи' };
  const me = f.members.find(m => m.id === (p.id || 'player'));
  if (!me || !ROLES[me.rank].perms.includes('invite')) {
    return { ok: false, reason: 'Приглашать могут только старшие' };
  }
  if (f.members.length >= MAX_MEMBERS) return { ok: false, reason: 'Семья полная' };
  const used = new Set(f.members.map(m => m.name));
  const name = NPC_NAMES.find(n => !used.has(n)) || ('Участник ' + (f.members.length + 1));
  const member = { id: 'npc_' + f.members.length, name, rank: 0, contrib: 0, npc: true };
  f.members.push(member);
  f.log.push({ at: Date.now(), text: `${name} принят в семью` });
  void game;
  return { ok: true, member };
}

/** Повысить/понизить участника. */
export function setRank(p, memberId, rank) {
  const f = get(p);
  if (!f) return { ok: false, reason: 'Нет семьи' };
  const me = f.members.find(m => m.id === (p.id || 'player'));
  if (!me || !ROLES[me.rank].perms.includes('promote')) {
    return { ok: false, reason: 'Нет прав' };
  }
  const target = f.members.find(m => m.id === memberId);
  if (!target) return { ok: false, reason: 'Нет такого участника' };
  if (target.id === (p.id || 'player')) return { ok: false, reason: 'Себя повышать нельзя' };
  target.rank = Math.max(0, Math.min(me.rank - 1, rank));
  f.log.push({ at: Date.now(), text: `${target.name} → ${ROLES[target.rank].name}` });
  return { ok: true, member: target };
}

/** Выгнать участника. */
export function kick(p, memberId) {
  const f = get(p);
  if (!f) return { ok: false, reason: 'Нет семьи' };
  const me = f.members.find(m => m.id === (p.id || 'player'));
  if (!me || !ROLES[me.rank].perms.includes('promote')) return { ok: false, reason: 'Нет прав' };
  const i = f.members.findIndex(m => m.id === memberId);
  if (i < 0) return { ok: false, reason: 'Нет такого участника' };
  if (f.members[i].id === (p.id || 'player')) return { ok: false, reason: 'Себя выгнать нельзя' };
  const [gone] = f.members.splice(i, 1);
  f.log.push({ at: Date.now(), text: `${gone.name} исключён из семьи` });
  return { ok: true, member: gone };
}

/** Покинуть семью. */
export function leave(p) {
  const f = get(p);
  if (!f) return { ok: false, reason: 'Нет семьи' };
  const me = f.members.find(m => m.id === (p.id || 'player'));
  if (me && me.rank === 3 && f.members.length > 1) {
    return { ok: false, reason: 'Сначала передай leadership' };
  }
  p.family = null;
  return { ok: true };
}

/** Сводка для интерфейса. */
export function summary(p) {
  const f = get(p);
  if (!f) return null;
  const me = f.members.find(m => m.id === (p.id || 'player'));
  return {
    name: f.name,
    members: f.members.length,
    bank: f.bank,
    role: me ? ROLES[me.rank].name : '—',
    rank: me ? me.rank : 0
  };
}

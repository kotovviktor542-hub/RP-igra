/* business.js — бизнесы как в Amazing: покупка на бирже, уровни, доход в казну,
   управление и продажа. Доход капает раз в игровой час. */

import { fmtMoney } from '../core/utils.js';

export const MAX_LEVEL = 5;
export const MAX_OWNED = 6;

export const TYPES = {
  gas:      { name: 'АЗС',              icon: '⛽', kind: 'топливо',    price: 480000,  base: 4200, desc: 'Заправка с магазином' },
  market24: { name: 'Магазин 24/7',     icon: '🏪', kind: 'торговля',   price: 320000,  base: 3100, desc: 'Круглосуточный продуктовый' },
  pharmacy: { name: 'Аптека',           icon: '💊', kind: 'торговля',   price: 390000,  base: 3600, desc: 'Медикаменты и химия' },
  parking:  { name: 'Автостоянка',      icon: '🅿', kind: 'услуги',     price: 210000,  base: 1900, desc: 'Платная парковка у центра' },
  kiosk:    { name: 'Ларёк',            icon: '🛒', kind: 'торговля',   price: 95000,   base: 1100, desc: 'Мелкая розница на остановке' },
  carwash:  { name: 'Автомойка',        icon: '🚿', kind: 'услуги',     price: 165000,  base: 1600, desc: 'Мойка и химчистка салона' },
  garage:   { name: 'Гаражный кооператив', icon: '🔧', kind: 'услуги',  price: 275000,  base: 2400, desc: 'Аренда боксов под ремонт' },
  electronics:{ name: 'Магазин электроники «ADS»', icon: '📱', kind: 'торговля', price: 620000, base: 5100, desc: 'Техника и комплектующие' },
  bar:      { name: 'Бар',              icon: '🍺', kind: 'общепит',    price: 430000,  base: 3800, desc: 'Вечерняя выручка и алкоголь' },
  farm:     { name: 'Ферма',            icon: '🌾', kind: 'производство', price: 240000, base: 2200, desc: 'Грядки и сбыт урожая' },
  sawmill:  { name: 'Лесопилка',        icon: '🪵', kind: 'производство', price: 355000, base: 3300, desc: 'Доска и пиломатериалы' },
  mine:     { name: 'Шахта',            icon: '⛏', kind: 'производство', price: 520000,  base: 4700, desc: 'Руда и порода' }
};

const MARKET_SIZE = 8;

/** Начисляем состояние бизнесов игроку, если его ещё нет. */
function ensure(p) {
  if (!p.business) {
    p.business = { owned: [], market: seedMarket(), lastTick: Date.now() };
  }
  if (!p.business.market) p.business.market = seedMarket();
  if (!p.business.lastTick) p.business.lastTick = Date.now();
  return p.business;
}

/** Случайный, но стабильный в рамках сейва список предложений. */
function seedMarket() {
  const ids = Object.keys(TYPES);
  const out = [];
  for (let i = 0; i < MARKET_SIZE; i++) {
    const type = ids[i % ids.length];
    out.push({
      id: 'biz_' + type + '_' + i,
      type,
      name: TYPES[type].name + (i >= ids.length ? ' №' + (i + 1) : ''),
      price: Math.round(TYPES[type].price * (0.85 + ((i * 37) % 30) / 100))
    });
  }
  return out;
}

export function market(p) {
  const s = ensure(p);
  const ownedNames = new Set(s.owned.map(o => o.name));
  return s.market.filter(o => !ownedNames.has(o.name));
}

export function owned(p) {
  return ensure(p).owned;
}

/** Базовый доход типа за игровой час. */
export function baseIncome(type) {
  return TYPES[type] ? TYPES[type].base : 0;
}

/** Доход конкретного бизнеса с учётом уровня. */
export function incomeOf(o) {
  return Math.round(baseIncome(o.type) * (1 + (o.level - 1) * 0.35));
}

export function upgradeCost(o) {
  return Math.round(TYPES[o.type].price * 0.35 * o.level);
}

export function buy(p, id) {
  const s = ensure(p);
  if (s.owned.length >= MAX_OWNED) return { ok: false, reason: 'Лимит бизнесов' };
  const offer = s.market.find(o => o.id === id);
  if (!offer) return { ok: false, reason: 'Предложение не найдено' };
  if (s.owned.some(o => o.name === offer.name)) return { ok: false, reason: 'Уже владеешь таким' };
  if (p.money < offer.price) return { ok: false, reason: 'Не хватает денег' };
  p.money -= offer.price;
  const rec = { id: offer.id, type: offer.type, name: offer.name, level: 1, bought: Date.now() };
  s.owned.push(rec);
  return { ok: true, biz: rec };
}

export function upgrade(p, id) {
  const s = ensure(p);
  const o = s.owned.find(x => x.id === id);
  if (!o) return { ok: false, reason: 'Нет такого бизнеса' };
  if (o.level >= MAX_LEVEL) return { ok: false, reason: 'Максимальный уровень' };
  const cost = upgradeCost(o);
  if (p.money < cost) return { ok: false, reason: 'Не хватает денег' };
  p.money -= cost;
  o.level++;
  return { ok: true, biz: o };
}

export function sell(p, id) {
  const s = ensure(p);
  const i = s.owned.findIndex(x => x.id === id);
  if (i < 0) return { ok: false, reason: 'Нет такого бизнеса' };
  const o = s.owned[i];
  const price = Math.round((TYPES[o.type].price * 0.55) * (1 + (o.level - 1) * 0.25));
  p.money += price;
  s.owned.splice(i, 1);
  return { ok: true, price };
}

/**
 * Начисляет доход. Вызывается из игрового цикла.
 * @param {number} gameHours сколько игровых часов прошло
 * @returns {number} сколько денег пришло
 */
export function tick(p, gameHours) {
  const s = ensure(p);
  if (!s.owned.length || gameHours <= 0) return 0;
  let total = 0;
  s.owned.forEach(o => { total += incomeOf(o); });
  const earned = Math.round(total * gameHours);
  if (earned > 0) {
    // выручка идёт в банк, как на Amazing
    p.bank = (p.bank || 0) + earned;
    s.lastEarn = (s.lastEarn || 0) + earned;
  }
  return earned;
}

/** Сводка для HUD/телефона. */
export function summary(p) {
  const s = ensure(p);
  let perHour = 0;
  s.owned.forEach(o => { perHour += incomeOf(o); });
  return {
    count: s.owned.length,
    perHour,
    perHourText: fmtMoney(perHour),
    earnedTotal: s.lastEarn || 0
  };
}

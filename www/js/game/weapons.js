/* weapons.js — боевая система: стволы, магазины, патроны.
   Чистая логика без three.js, покрыта тестами (tools/check.js). */

/** Типы патронов. */
export const AMMO = {
  '9mm':  { name: '9 мм',        item: 'ammo9',   pack: 24, price: 45 },
  '357':  { name: '.357 Magnum', item: 'ammo357', pack: 18, price: 70 },
  '12g':  { name: '12 калибр',   item: 'ammo12',  pack: 16, price: 80 },
  '762':  { name: '7.62 мм',     item: 'ammo762', pack: 30, price: 120 }
};

/**
 * Стволы. dmg — урон в корпус, rate — задержка между выстрелами (с),
 * spread — разброс в градусах, pellets — дробин за выстрел,
 * two — двуручный хват (меняет анимацию рук).
 */
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'Пистолет', short: 'Глок-9',
    ammo: '9mm', mag: 12, dmg: 34, rate: 0.3, range: 60, spread: 1.2,
    recoil: 0.07, auto: false, two: false, price: 900, reloadTime: 1.5,
    desc: 'Надёжный и дешёвый. Хорош для самообороны.'
  },
  revolver: {
    id: 'revolver', name: 'Револьвер', short: '.357',
    ammo: '357', mag: 6, dmg: 68, rate: 0.72, range: 55, spread: 1.0,
    recoil: 0.14, auto: false, two: false, price: 2200, reloadTime: 2.6,
    desc: 'Бьёт как молот, но стреляет редко и мало патронов.'
  },
  smg: {
    id: 'smg', name: 'Пистолет-пулемёт', short: 'ПП-9',
    ammo: '9mm', mag: 30, dmg: 21, rate: 0.085, range: 45, spread: 2.6,
    recoil: 0.05, auto: true, two: true, price: 4800, reloadTime: 2.1,
    desc: 'Поливает очередью. Разброс большой, зато темп бешеный.'
  },
  shotgun: {
    id: 'shotgun', name: 'Дробовик', short: '12к',
    ammo: '12g', mag: 6, dmg: 26, pellets: 6, rate: 0.85, range: 24, spread: 5.5,
    recoil: 0.18, auto: false, two: true, price: 3600, reloadTime: 3.0,
    desc: 'В упор сносит с ног, на дистанции бесполезен.'
  },
  rifle: {
    id: 'rifle', name: 'Автомат', short: 'АР-15',
    ammo: '762', mag: 30, dmg: 40, rate: 0.115, range: 95, spread: 1.6,
    recoil: 0.09, auto: true, two: true, price: 9500, reloadTime: 2.4,
    desc: 'Тяжёлый ствол на все дистанции. Полиция такое не любит.'
  }
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export const isWeapon = id => !!WEAPONS[id];

/* ======================= ПАТРОНЫ ======================= */

/** Приводит старые сейвы (p.ammo было числом) к формату {тип: количество}. */
export function normalizeAmmo(p) {
  if (typeof p.ammo === 'number') p.ammo = { '9mm': p.ammo };
  if (!p.ammo || typeof p.ammo !== 'object') p.ammo = {};
  for (const t of Object.keys(AMMO)) if (!Number.isFinite(p.ammo[t])) p.ammo[t] = p.ammo[t] | 0;
  if (!p.mags || typeof p.mags !== 'object') p.mags = {};
  for (const w of WEAPON_IDS) if (!Number.isFinite(p.mags[w])) p.mags[w] = 0;
  return p;
}

export function ammoCount(p, type) {
  normalizeAmmo(p);
  return p.ammo[type] | 0;
}

export function addAmmo(p, type, n) {
  normalizeAmmo(p);
  if (!AMMO[type]) return { ok: false, reason: 'Неизвестный калибр' };
  p.ammo[type] = Math.max(0, (p.ammo[type] | 0) + n);
  return { ok: true, total: p.ammo[type] };
}

/** Патронов в магазине конкретного ствола. */
export function magCount(p, wid) {
  normalizeAmmo(p);
  return p.mags[wid] | 0;
}

/* ======================= СТРЕЛЬБА ======================= */

/**
 * Перезарядка: досыпает в магазин из запаса.
 * @returns {{ok:boolean, reason?:string, loaded?:number, mag?:number}}
 */
export function reload(p, wid) {
  const w = WEAPONS[wid];
  if (!w) return { ok: false, reason: 'Нечего перезаряжать' };
  normalizeAmmo(p);
  const inMag = p.mags[wid] | 0;
  if (inMag >= w.mag) return { ok: false, reason: 'Магазин полный' };
  const have = p.ammo[w.ammo] | 0;
  if (have <= 0) return { ok: false, reason: `Нет патронов ${AMMO[w.ammo].name}` };
  const take = Math.min(w.mag - inMag, have);
  p.mags[wid] = inMag + take;
  p.ammo[w.ammo] = have - take;
  return { ok: true, loaded: take, mag: p.mags[wid], left: p.ammo[w.ammo] };
}

/**
 * Снимает один патрон из магазина. Стрелять без перезарядки нельзя.
 * @returns {{ok:boolean, reason?:string, mag?:number, empty?:boolean}}
 */
export function fireShot(p, wid) {
  const w = WEAPONS[wid];
  if (!w) return { ok: false, reason: 'Нет оружия в руках' };
  normalizeAmmo(p);
  const inMag = p.mags[wid] | 0;
  if (inMag <= 0) {
    const spare = p.ammo[w.ammo] | 0;
    return { ok: false, reason: spare > 0 ? 'Пустой магазин — перезарядись' : 'Патроны кончились', empty: true };
  }
  p.mags[wid] = inMag - 1;
  return { ok: true, mag: p.mags[wid], last: p.mags[wid] === 0 };
}

/** Урон с учётом дистанции: на пределе дальности бьёт слабее. */
export function damageAt(wid, distance) {
  const w = WEAPONS[wid];
  if (!w) return 0;
  const t = Math.max(0, Math.min(1, distance / w.range));
  const falloff = w.pellets ? (1 - t) * (1 - t) : 1 - 0.45 * t;
  const hits = w.pellets ? Math.max(1, Math.round(w.pellets * (1 - t * 0.7))) : 1;
  return Math.max(4, Math.round(w.dmg * falloff * hits));
}

/** Текст для HUD: «12 / 48». */
export function ammoLabel(p, wid) {
  const w = WEAPONS[wid];
  if (!w) return '';
  normalizeAmmo(p);
  return `${p.mags[wid] | 0} / ${p.ammo[w.ammo] | 0}`;
}

/** Все стволы, которые есть в инвентаре игрока. */
export function ownedWeapons(p) {
  return (p.inventory || []).filter(it => WEAPONS[it.id]).map(it => it.id);
}

/* vehicle.js — модели транспорта и аркадная физика вождения. */

import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { clamp, resolveCircleBoxes, angleDiff } from '../core/utils.js';

const matCache = new Map();
function M(key, params) {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(params));
  return matCache.get(key);
}
const paint = (c, metal) => M('paint' + c + (metal === undefined ? '' : 'm' + metal),
  { color: c, roughness: metal === undefined ? 0.28 : 0.34, metalness: metal === undefined ? 0.55 : metal });
// тонировка: 0 — сток, 1 — «в круг»
const glassM = (tint) => {
  const k = Math.max(0, Math.min(1, tint || 0));
  return M('vglass' + k.toFixed(2), {
    color: 0x1c2a36, roughness: 0.06, metalness: 0.3,
    transparent: true, opacity: 0.68 + k * 0.3
  });
};
// подсветка днища
const neonM = c => M('vneon' + c, { color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.4 });
const tyreM = () => M('tyre', { color: 0x16181b, roughness: 0.95 });
const rimM = () => M('rim', { color: 0xc5cad0, roughness: 0.3, metalness: 0.9 });
const chromeM = () => M('chrome', { color: 0xd8dde2, roughness: 0.18, metalness: 0.95 });
const darkM = () => M('vdark', { color: 0x1f2328, roughness: 0.7, metalness: 0.3 });
const lightM = () => M('vlight', { color: 0xfff4d8, emissive: 0xfff0c8, emissiveIntensity: 0.0, roughness: 0.2 });
const brakeM = () => M('vbrake', { color: 0x8a1518, emissive: 0xff2020, emissiveIntensity: 0.0, roughness: 0.3 });
const plateM = () => M('plate', { color: 0xe8e8e0, roughness: 0.6 });

/* ======================= КАТАЛОГ ======================= */
export const VEHICLES = {
  /* ---- отечественная классика ---- */
  vaz2107: { name: 'ВАЗ-2107 «Жигули»', L: 4.15, W: 1.62, H: 1.44, maxSpeed: 41, accel: 7.2, mass: 1.0, price: 4200,  seats: 5, trunk: 20, cat: 'B', style: 'vaz', body: 'sedan' },
  vaz2114: { name: 'ВАЗ-2114',          L: 4.12, W: 1.65, H: 1.40, maxSpeed: 43, accel: 7.6, mass: 0.98, price: 6800, seats: 5, trunk: 18, cat: 'B', style: 'vaz', body: 'hatch' },
  vaz2109: { name: 'ВАЗ-2109 «Девятка»',L: 4.20, W: 1.65, H: 1.40, maxSpeed: 42, accel: 7.4, mass: 0.97, price: 5600, seats: 5, trunk: 18, cat: 'B', style: 'vaz', body: 'hatch' },
  niva:    { name: 'Нива ВАЗ-2121',     L: 3.72, W: 1.68, H: 1.64, maxSpeed: 38, accel: 6.9, mass: 1.15, price: 9500, seats: 4, trunk: 22, cat: 'B', style: 'niva', body: 'suv', awd: true },
  oka:     { name: 'Ока ВАЗ-1111',      L: 3.20, W: 1.42, H: 1.40, maxSpeed: 33, accel: 5.8, mass: 0.64, price: 1800, seats: 4, trunk: 10, cat: 'B', style: 'vaz', body: 'hatch' },
  volga:   { name: 'Волга ГАЗ-3110',    L: 4.90, W: 1.80, H: 1.47, maxSpeed: 44, accel: 7.8, mass: 1.35, price: 11000, seats: 5, trunk: 30, cat: 'B', style: 'volga', body: 'sedan' },
  uaz:     { name: 'УАЗ-469 «Бобик»',   L: 4.02, W: 1.78, H: 2.02, maxSpeed: 34, accel: 6.2, mass: 1.5, price: 13500, seats: 5, trunk: 25, cat: 'B', style: 'uaz', body: 'suv', awd: true },
  buhanka: { name: 'УАЗ-452 «Буханка»', L: 4.36, W: 1.94, H: 2.25, maxSpeed: 32, accel: 5.4, mass: 1.75, price: 16000, seats: 8, trunk: 60, cat: 'B', style: 'uaz', body: 'van', awd: true },
  gazelle: { name: 'ГАЗель',            L: 5.50, W: 2.06, H: 2.35, maxSpeed: 33, accel: 6.0, mass: 1.9, price: 26000, seats: 3, trunk: 140, cat: 'C', style: 'gazelle', body: 'van' },
  kamaz:   { name: 'КамАЗ-5320',        L: 7.60, W: 2.50, H: 3.10, maxSpeed: 28, accel: 4.4, mass: 3.4, price: 68000, seats: 3, trunk: 420, cat: 'C', style: 'kamaz', body: 'truck' },
  paz:     { name: 'ПАЗ-3205',          L: 7.00, W: 2.40, H: 2.95, maxSpeed: 24, accel: 3.4, mass: 3.0, price: 0, seats: 22, trunk: 40, cat: 'D', style: 'paz', body: 'bus' },
  ural:    { name: 'Мотоцикл «Урал»',   L: 2.25, W: 0.85, H: 1.10, maxSpeed: 33, accel: 6.4, mass: 0.36, price: 7200, seats: 2, trunk: 6, cat: 'A', style: 'moto', body: 'moto' },
  scooter: { name: 'Скутер',            L: 1.85, W: 0.68, H: 1.05, maxSpeed: 22, accel: 4.6, mass: 0.18, price: 1400, seats: 1, trunk: 4, cat: 'A', style: 'moto', body: 'moto' },

  /* ---- иномарки ---- */
  sedan:   { name: 'Седан',       L: 4.55, W: 1.82, H: 1.42, maxSpeed: 44, accel: 9.5,  mass: 1, price: 18000, seats: 4, trunk: 25, cat: 'B', body: 'sedan' },
  hatch:   { name: 'Хэтчбек',     L: 4.05, W: 1.74, H: 1.48, maxSpeed: 38, accel: 9.0,  mass: 0.9, price: 11000, seats: 4, trunk: 20, cat: 'B', body: 'hatch' },
  suv:     { name: 'Внедорожник', L: 4.85, W: 1.95, H: 1.82, maxSpeed: 42, accel: 8.6,  mass: 1.3, price: 32000, seats: 5, trunk: 45, cat: 'B', body: 'suv' },
  sports:  { name: 'Спорткар',    L: 4.42, W: 1.92, H: 1.22, maxSpeed: 68, accel: 17.0, mass: 0.85, price: 125000, seats: 2, trunk: 10, cat: 'B', body: 'sports' },
  pickup:  { name: 'Пикап',       L: 5.3,  W: 1.98, H: 1.82, maxSpeed: 38, accel: 7.8,  mass: 1.4, price: 27000, seats: 2, trunk: 70, cat: 'B', body: 'pickup' },
  van:     { name: 'Фургон',      L: 5.4,  W: 2.0,  H: 2.35, maxSpeed: 34, accel: 6.5,  mass: 1.6, price: 24000, seats: 2, trunk: 120, cat: 'C', body: 'van' },
  taxi:    { name: 'Такси',       L: 4.6,  W: 1.84, H: 1.46, maxSpeed: 42, accel: 9.2,  mass: 1, price: 0, seats: 4, trunk: 25, cat: 'B', body: 'sedan' },
  police:  { name: 'Полиция',     L: 4.8,  W: 1.9,  H: 1.5,  maxSpeed: 52, accel: 12.5, mass: 1.1, price: 0, seats: 4, trunk: 25, cat: 'B', body: 'sedan' },
  truck:   { name: 'Грузовик',    L: 7.6,  W: 2.35, H: 3.0,  maxSpeed: 28, accel: 4.6,  mass: 2.6, price: 58000, seats: 2, trunk: 300, cat: 'C', body: 'truck' },
  bus:     { name: 'Автобус',     L: 10.5, W: 2.5,  H: 3.1,  maxSpeed: 26, accel: 3.8,  mass: 3.2, price: 0, seats: 20, trunk: 80, cat: 'D', body: 'bus' }
};

/** Категория прав, нужная для управления. */
/* ======================= ТЮНИНГ ======================= */
/** Каталог деталей автосервиса — как в Amazing: стейджи, подвеска, диски, стайлинг. */
export const TUNING = {
  stage1:  { name: 'Чип-тюнинг Stage 1', icon: '⚙', price: 18000,  cat: 'engine', lvl: 1, power: 1.10, top: 1.06, desc: 'Прошивка ЭБУ: +10 % мощности, +6 % к максималке' },
  stage2:  { name: 'Чип-тюнинг Stage 2', icon: '⚙', price: 52000,  cat: 'engine', lvl: 2, power: 1.22, top: 1.13, req: 'stage1', desc: 'Впуск-выпуск + прошивка: +22 % мощности' },
  stage3:  { name: 'Чип-тюнинг Stage 3', icon: '⚙', price: 130000, cat: 'engine', lvl: 3, power: 1.38, top: 1.22, req: 'stage2', desc: 'Турбина и форсунки: +38 % мощности' },
  nitro:   { name: 'Закись азота (NOS)',  icon: '💨', price: 46000,  cat: 'engine', lvl: 1, desc: 'Кнопка нитро: короткий рывок ускорения' },
  air:     { name: 'Пневмоподвеска',     icon: '📉', price: 34000,  cat: 'susp',   lvl: 1, drop: 1, desc: 'Регулируемый клиренс, машина ниже' },
  air2:    { name: 'Гидравлика',         icon: '📉', price: 78000,  cat: 'susp',   lvl: 2, drop: 2, req: 'air', desc: 'Прыгающая подвеска, ещё ниже посадка' },
  rims1:   { name: 'Литые диски R15',    icon: '🛞', price: 14000,  cat: 'style',  rims: 1, desc: 'Семь спиц и полированный обод' },
  rims2:   { name: 'Кованые диски R17',  icon: '🛞', price: 38000,  cat: 'style',  rims: 2, req: 'rims1', desc: 'Десять спиц, легче и шире' },
  rims3:   { name: 'Диски R19 «Хром»',   icon: '🛞', price: 92000,  cat: 'style',  rims: 3, req: 'rims2', desc: 'Полный хром с центральным колпачком' },
  kit1:    { name: 'Обвес «Спорт»',      icon: '🏁', price: 26000,  cat: 'style',  kit: 1, desc: 'Пороги и юбки по кругу' },
  kit2:    { name: 'Обвес «Агрессор»',   icon: '🏁', price: 64000,  cat: 'style',  kit: 2, req: 'kit1', desc: 'Плюс расширители арок' },
  kit3:    { name: 'Обвес «Карбон»',     icon: '🏁', price: 145000, cat: 'style',  kit: 3, req: 'kit2', desc: 'Плюс капот с воздухозаборником' },
  spoiler1:{ name: 'Лип-спойлер',        icon: '🔝', price: 9000,   cat: 'style',  spoiler: 1, desc: 'Небольшая губа на крышку багажника' },
  spoiler2:{ name: 'Спойлер «Лопата»',   icon: '🔝', price: 24000,  cat: 'style',  spoiler: 2, req: 'spoiler1', desc: 'Высокое антикрыло на стойках' },
  spoiler3:{ name: 'Антикрыло GT',       icon: '🔝', price: 58000,  cat: 'style',  spoiler: 3, req: 'spoiler2', desc: 'Настоящее антикрыло с прижимом' },
  tint:    { name: 'Тонировка «в круг»', icon: '🕶', price: 12000,  cat: 'style',  tint: 1, desc: 'Тёмные стёкла по кругу' },
  stripe:  { name: 'Винил «Полосы»',     icon: '🎨', price: 16000,  cat: 'style',  vinylStripe: 1, desc: 'Гоночные полосы через кузов' },
  neon:    { name: 'Неон под днищем',    icon: '💡', price: 21000,  cat: 'style',  neon: 1, desc: 'Подсветка днища, цвет на выбор' }
};

/** Приводит сохранённый тюнинг к полному виду. */
export function normalizeTuning(t) {
  const src = t || {};
  return {
    stage: Math.max(0, Math.min(3, src.stage || 0)),
    nitro: !!src.nitro,
    drop: Math.max(0, Math.min(2, src.drop || 0)),
    rims: Math.max(0, Math.min(3, src.rims || 0)),
    kit: Math.max(0, Math.min(3, src.kit || 0)),
    spoiler: Math.max(0, Math.min(3, src.spoiler || 0)),
    tint: Math.max(0, Math.min(1, src.tint || 0)),
    vinylStripe: !!src.vinylStripe,
    neon: !!src.neon,
    paint: src.paint || null,
    neonColor: src.neonColor || 0x35c8ff,
    vinylColor: src.vinylColor || 0x1b1f26
  };
}

/** Множители характеристик от установленного тюнинга. */
export function tuningStats(t) {
  const n = normalizeTuning(t);
  const powerByStage = [1, 1.10, 1.22, 1.38][n.stage] || 1;
  const topByStage = [1, 1.06, 1.13, 1.22][n.stage] || 1;
  return {
    power: powerByStage,
    topSpeed: topByStage,
    // антикрыло даёт прижим: лучше держит дорогу на скорости
    grip: 1 + n.spoiler * 0.045,
    nitro: n.nitro,
    drop: n.drop
  };
}

export const LICENCE_CATS = {
  A: { name: 'Мотоциклы', desc: 'Мотоциклы, скутеры и всё с двумя колёсами', order: 1 },
  B: { name: 'Легковые',  desc: 'Легковые автомобили до 3,5 т и до 8 пассажиров', order: 2 },
  C: { name: 'Грузовики', desc: 'Грузовики и фургоны свыше 3,5 т', order: 3 },
  D: { name: 'Автобусы',  desc: 'Автобусы и транспорт с числом мест больше 8', order: 4 }
};

export const CAR_COLORS = [
  0xb02a2a, 0x1f4f8f, 0x2b2b30, 0xe4e4e0, 0x6b7076, 0x1f6b4a,
  0xd8a520, 0x7a3f8f, 0x2a8f9f, 0xc45a1a, 0x8a8f96, 0xf0f0ea
];

/* ======================= ПОСТРОЕНИЕ МОДЕЛИ ======================= */

/** Колесо. rimLvl — тюнинговые диски: 0 = сток, 1..3 = литьё. */
function wheel(radius, width, rimLvl = 0) {
  const tyreR = radius * (1 - rimLvl * 0.045);
  const t = new THREE.CylinderGeometry(tyreR, tyreR, width, 16);
  t.rotateZ(Math.PI / 2);

  const hubR = radius * (0.58 + rimLvl * 0.11);
  const parts = [];
  const hub = new THREE.CylinderGeometry(hubR, hubR, width + 0.014, 12);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);

  // спицы: сток — 5 широких, литьё — больше и тоньше
  const n = rimLvl >= 2 ? 10 : rimLvl === 1 ? 7 : 5;
  const sw = rimLvl >= 2 ? 0.03 : 0.045;
  for (let i = 0; i < n; i++) {
    const s = new THREE.BoxGeometry(width * 0.92, (hubR - 0.03) * 2, sw);
    s.applyMatrix4(new THREE.Matrix4().makeRotationX((i / n) * Math.PI));
    parts.push(s);
  }
  if (rimLvl >= 1) {
    const lip = new THREE.TorusGeometry(radius * 0.9, 0.028, 5, 16);
    lip.rotateY(Math.PI / 2);
    parts.push(lip);
  }
  if (rimLvl >= 3) {
    const cap = new THREE.CylinderGeometry(hubR * 0.42, hubR * 0.42, width + 0.05, 10);
    cap.rotateZ(Math.PI / 2);
    parts.push(cap);
  }
  return { tyre: t, rim: mergeGeometries(parts, false) };
}

/**
 * Строит визуальную модель транспорта.
 * @param {boolean} simple — упрощённый вариант для припаркованных машин:
 *   колёса слиты в две меши вместо восьми (экономит ~6 draw calls на машину).
 * @returns {THREE.Group} с userData.wheels = [меши колёс]
 */
/** Мотоцикл/скутер: рама, бак, седло, вилка, крылья, руль. */
function buildMoto(type, L, W, H, groundY, wheelR, P, spec) {
  const isUral = type === 'ural';
  const frameY = groundY + (isUral ? 0.42 : 0.34);

  // рама
  const frame = new THREE.BoxGeometry(W * 0.22, 0.09, L * 0.62);
  frame.translate(0, frameY + 0.16, 0);
  P('body', frame);

  // бак
  const tankL = L * 0.26;
  const tank = new THREE.BoxGeometry(W * 0.5, 0.24, tankL);
  tank.translate(0, frameY + 0.36, L * 0.1);
  P('body', tank);
  const tankTop = new THREE.BoxGeometry(W * 0.34, 0.08, tankL * 0.86);
  tankTop.translate(0, frameY + 0.5, L * 0.1);
  P('chrome', tankTop);

  // седло
  const seat = new THREE.BoxGeometry(W * 0.44, 0.12, L * 0.34);
  seat.translate(0, frameY + 0.42, -L * 0.14);
  P('dark', seat);
  const seatBack = new THREE.BoxGeometry(W * 0.4, 0.1, L * 0.12);
  seatBack.translate(0, frameY + 0.46, -L * 0.3);
  P('dark', seatBack);

  // двигатель
  const eng = new THREE.CylinderGeometry(W * 0.24, W * 0.26, W * 0.4, 8);
  eng.rotateZ(Math.PI / 2);
  eng.translate(0, frameY + 0.06, L * 0.02);
  P('chrome', eng);
  [-1, 1].forEach(s => {
    const fin = new THREE.BoxGeometry(W * 0.06, 0.2, 0.24);
    fin.translate(s * W * 0.24, frameY + 0.06, L * 0.02);
    P('dark', fin);
  });

  // выхлоп
  const pipe = new THREE.CylinderGeometry(0.05, 0.07, L * 0.62, 8);
  pipe.rotateX(Math.PI / 2);
  pipe.translate(W * 0.3, groundY + 0.16, -L * 0.06);
  P('chrome', pipe);
  const muff = new THREE.CylinderGeometry(0.09, 0.09, 0.34, 8);
  muff.rotateX(Math.PI / 2);
  muff.translate(W * 0.3, groundY + 0.2, -L * 0.4);
  P('chrome', muff);

  // передняя вилка и руль
  const fork = new THREE.CylinderGeometry(0.045, 0.045, groundY + 0.66, 8);
  fork.rotateX(0.28);
  fork.translate(0, groundY + 0.4, L * 0.44);
  P('chrome', fork);
  const bar = new THREE.CylinderGeometry(0.035, 0.035, W * 1.5, 8);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, frameY + 0.78, L * 0.36);
  P('chrome', bar);
  [-1, 1].forEach(s => {
    const grip = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 8);
    grip.rotateZ(Math.PI / 2);
    grip.translate(s * W * 0.72, frameY + 0.78, L * 0.36);
    P('dark', grip);
  });

  // фара
  const hl = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12);
  hl.rotateX(Math.PI / 2);
  hl.translate(0, frameY + 0.6, L * 0.48);
  P('light', hl);
  const hlRing = new THREE.TorusGeometry(0.125, 0.02, 5, 12);
  hlRing.translate(0, frameY + 0.6, L * 0.49);
  P('chrome', hlRing);

  // задний фонарь
  const tl = new THREE.BoxGeometry(0.16, 0.08, 0.05);
  tl.translate(0, frameY + 0.5, -L * 0.47);
  P('brake', tl);

  // крылья
  const ff = new THREE.TorusGeometry(wheelR + 0.05, 0.05, 5, 10, Math.PI);
  ff.rotateY(Math.PI / 2);
  ff.translate(0, groundY, L * 0.44);
  P('body', ff);
  const rf = new THREE.TorusGeometry(wheelR + 0.05, 0.05, 5, 10, Math.PI);
  rf.rotateY(Math.PI / 2);
  rf.translate(0, groundY, -L * 0.44);
  P('body', rf);

  // у «Урала» — люлька
  if (isUral) {
    const side = new THREE.BoxGeometry(0.6, 0.5, L * 0.4);
    side.translate(W * 0.85, groundY + 0.3, -L * 0.02);
    P('body', side);
    const rimS = new THREE.BoxGeometry(0.62, 0.08, L * 0.42);
    rimS.translate(W * 0.85, groundY + 0.55, -L * 0.02);
    P('chrome', rimS);
  }

  // номера
  const pf = new THREE.BoxGeometry(0.24, 0.12, 0.02);
  pf.translate(0, frameY + 0.4, -L * 0.5);
  P('plate', pf);
}

export function buildVehicleMesh(type, color, simple = false, tuning = null) {
  const spec = VEHICLES[type] || VEHICLES.sedan;
  const g = new THREE.Group();
  const L = spec.L, W = spec.W, H = spec.H;
  const bodyCol = type === 'taxi' ? 0xf0c020 : (type === 'police' ? 0xf0f0f0 : color);
  // форма кузова берётся из spec.body, а spec.style добавляет национальный колорит
  const shape = spec.body || type;
  const style = spec.style || '';
  const T = tuning || {};

  const parts = { body: [], glass: [], dark: [], chrome: [], light: [], brake: [], plate: [], vinyl: [], neon: [] };
  const P = (k, geo) => parts[k].push(geo);

  const isMoto = shape === 'moto';
  const isTall = shape === 'van' || shape === 'truck' || shape === 'bus';
  let wheelR = isTall ? 0.46 : (shape === 'suv' || shape === 'pickup' ? 0.40 : 0.33);
  if (isMoto) wheelR = type === 'ural' ? 0.36 : 0.26;
  // тюнингованные диски крупнее, пневмоподвеска меняет клиренс
  if (T.rims) wheelR *= 1 + T.rims * 0.06;
  const groundY = wheelR * (1 + (T.drop || 0) * -0.16);

  if (isMoto) {
    buildMoto(type, L, W, H, groundY, wheelR, P, spec);
  } else if (shape === 'bus' || shape === 'truck') {
    /* --- кабина/кузов крупного транспорта --- */
    const cabL = shape === 'bus' ? L : 2.4;
    const bodyH = H - groundY - 0.1;

    if (shape === 'bus') {
      const main = new THREE.BoxGeometry(W, bodyH, L);
      main.translate(0, groundY + bodyH / 2 + 0.1, 0);
      P('body', main);
      // окна лентой
      [-1, 1].forEach(s => {
        const win = new THREE.BoxGeometry(0.06, bodyH * 0.42, L * 0.84);
        win.translate(s * (W / 2 + 0.01), groundY + bodyH * 0.72, 0);
        P('glass', win);
      });
      const front = new THREE.BoxGeometry(W * 0.92, bodyH * 0.5, 0.08);
      front.translate(0, groundY + bodyH * 0.72, L / 2 + 0.01);
      P('glass', front);
      const back = new THREE.BoxGeometry(W * 0.92, bodyH * 0.4, 0.08);
      back.translate(0, groundY + bodyH * 0.72, -L / 2 - 0.01);
      P('glass', back);
      // двери
      const door = new THREE.BoxGeometry(0.05, bodyH * 0.8, 1.1);
      door.translate(W / 2 + 0.02, groundY + bodyH * 0.45, L * 0.25);
      P('dark', door);
      // юбка
      const skirt = new THREE.BoxGeometry(W + 0.06, 0.45, L * 0.96);
      skirt.translate(0, groundY + 0.1, 0);
      P('dark', skirt);
    } else {
      // грузовик: кабина + кузов
      const cab = new THREE.BoxGeometry(W, 2.1, cabL);
      cab.translate(0, groundY + 1.15, L / 2 - cabL / 2);
      P('body', cab);
      const wind = new THREE.BoxGeometry(W * 0.9, 0.95, 0.08);
      wind.translate(0, groundY + 1.65, L / 2 - 0.02);
      P('glass', wind);
      [-1, 1].forEach(s => {
        const sw = new THREE.BoxGeometry(0.06, 0.8, cabL * 0.55);
        sw.translate(s * (W / 2 + 0.01), groundY + 1.6, L / 2 - cabL * 0.45);
        P('glass', sw);
      });
      const boxBody = new THREE.BoxGeometry(W + 0.1, 2.5, L - cabL - 0.3);
      boxBody.translate(0, groundY + 1.5, -cabL / 2 - 0.1);
      P('body', boxBody);
      const rail = new THREE.BoxGeometry(W + 0.16, 0.12, L - cabL - 0.3);
      rail.translate(0, groundY + 2.76, -cabL / 2 - 0.1);
      P('chrome', rail);
      const bumper = new THREE.BoxGeometry(W + 0.12, 0.35, 0.3);
      bumper.translate(0, groundY + 0.25, L / 2 + 0.1);
      P('dark', bumper);
    }
  } else {
    /* --- легковой: нижний кузов + капот/багажник + кабина --- */
    const bodyH = (shape === 'sports' ? 0.52 : 0.62);
    const sillY = groundY + 0.12;

    // основной объём
    const main = new THREE.BoxGeometry(W, bodyH, L);
    main.translate(0, sillY + bodyH / 2, 0);
    P('body', main);

    // скруглённые борта (накладки)
    [-1, 1].forEach(s => {
      const side = new THREE.BoxGeometry(0.1, bodyH * 0.6, L * 0.95);
      side.translate(s * (W / 2 - 0.02), sillY + bodyH * 0.35, 0);
      P('body', side);
    });

    // капот
    const hoodL = shape === 'van' ? 0.9 : L * 0.27;
    const hood = new THREE.BoxGeometry(W * 0.97, 0.2, hoodL);
    hood.translate(0, sillY + bodyH + 0.08, L / 2 - hoodL / 2 - 0.05);
    P('body', hood);

    // багажник
    const trunkL = shape === 'hatch' ? L * 0.1 : L * 0.2;
    const trunk = new THREE.BoxGeometry(W * 0.97, 0.18, trunkL);
    trunk.translate(0, sillY + bodyH + 0.07, -L / 2 + trunkL / 2 + 0.05);
    P('body', trunk);

    // кабина
    const cabL = L - hoodL - trunkL - 0.2;
    const cabH = H - (sillY + bodyH) - 0.05;
    const cabZ = (L / 2 - hoodL) - cabL / 2 - 0.05;

    const roof = new THREE.BoxGeometry(W * 0.86, 0.12, cabL * 0.82);
    roof.translate(0, sillY + bodyH + cabH, cabZ - cabL * 0.03);
    P('body', roof);

    // стойки
    const pillarGeo = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const p = new THREE.BoxGeometry(0.09, cabH, 0.12);
      p.translate(sx * W * 0.41, sillY + bodyH + cabH / 2, cabZ + sz * cabL * 0.42);
      pillarGeo.push(p);
    });
    P('dark', mergeGeometries(pillarGeo));

    // стёкла
    const wsAngle = shape === 'sports' ? 0.75 : 0.55;
    const ws = new THREE.BoxGeometry(W * 0.84, cabH * 1.12, 0.07);
    ws.rotateX(-wsAngle);
    ws.translate(0, sillY + bodyH + cabH * 0.52, cabZ + cabL * 0.44);
    P('glass', ws);

    const rw = new THREE.BoxGeometry(W * 0.8, cabH * 1.05, 0.07);
    rw.rotateX(shape === 'hatch' ? 0.75 : 0.5);
    rw.translate(0, sillY + bodyH + cabH * 0.52, cabZ - cabL * 0.44);
    P('glass', rw);

    [-1, 1].forEach(s => {
      const sw = new THREE.BoxGeometry(0.06, cabH * 0.8, cabL * 0.78);
      sw.translate(s * (W * 0.43), sillY + bodyH + cabH * 0.55, cabZ);
      P('glass', sw);
    });

    // бамперы
    const fb = new THREE.BoxGeometry(W * 1.01, 0.3, 0.26);
    fb.translate(0, sillY + 0.16, L / 2 + 0.03);
    P('dark', fb);
    const rb = new THREE.BoxGeometry(W * 1.01, 0.3, 0.26);
    rb.translate(0, sillY + 0.16, -L / 2 - 0.03);
    P('dark', rb);

    // решётка радиатора
    const grille = new THREE.BoxGeometry(W * 0.5, 0.17, 0.08);
    grille.translate(0, sillY + bodyH * 0.6, L / 2 + 0.04);
    P('dark', grille);
    const chromeBar = new THREE.BoxGeometry(W * 0.52, 0.05, 0.1);
    chromeBar.translate(0, sillY + bodyH * 0.72, L / 2 + 0.05);
    P('chrome', chromeBar);

    /* --- национальный колорит --- */
    if (style === 'vaz') {
      // «семёрка»: хромированные бампера с клыками, круглые фары, шильдик
      const cb = new THREE.BoxGeometry(W * 1.04, 0.16, 0.2);
      cb.translate(0, sillY + 0.22, L / 2 + 0.09);
      P('chrome', cb);
      const cb2 = cb.clone(); cb2.translate(0, 0, -L - 0.18);
      P('chrome', cb2);
      [-1, 1].forEach(s => {
        const fang = new THREE.BoxGeometry(0.07, 0.26, 0.09);
        fang.translate(s * W * 0.36, sillY + 0.26, L / 2 + 0.16);
        P('chrome', fang);
      });
      const vert = new THREE.BoxGeometry(0.06, 0.34, 0.06);
      vert.translate(0, sillY + bodyH * 0.62, L / 2 + 0.07);
      P('chrome', vert);
      [-1, 1].forEach(s => {
        [-1, 1].forEach(k => {
          const rib = new THREE.BoxGeometry(0.035, 0.13, 0.05);
          rib.translate(s * W * 0.06 * (k > 0 ? 1 : 3), sillY + bodyH * 0.6, L / 2 + 0.07);
          P('chrome', rib);
        });
      });
      const badge = new THREE.BoxGeometry(0.11, 0.11, 0.03);
      badge.translate(W * 0.3, sillY + bodyH * 0.85, L / 2 + 0.06);
      P('chrome', badge);
    }
    if (style === 'volga') {
      // «олень» на капоте и широкая хромированная решётка
      const vgr = new THREE.BoxGeometry(W * 0.62, 0.22, 0.07);
      vgr.translate(0, sillY + bodyH * 0.62, L / 2 + 0.07);
      P('chrome', vgr);
      const deer = new THREE.BoxGeometry(0.08, 0.2, 0.1);
      deer.translate(0, sillY + bodyH + 0.18, L / 2 - 0.2);
      P('chrome', deer);
      const horn = new THREE.BoxGeometry(0.04, 0.04, 0.16);
      horn.translate(0, sillY + bodyH + 0.3, L / 2 - 0.14);
      P('chrome', horn);
    }
    if (style === 'uaz') {
      // круглые фары-«глаза», плоская решётка с прорезями, кенгурятник
      const flat = new THREE.BoxGeometry(W * 0.7, 0.3, 0.05);
      flat.translate(0, sillY + bodyH * 0.62, L / 2 + 0.06);
      P('dark', flat);
      for (let k = -3; k <= 3; k++) {
        const slot = new THREE.BoxGeometry(0.05, 0.22, 0.06);
        slot.translate(k * W * 0.08, sillY + bodyH * 0.62, L / 2 + 0.08);
        P('chrome', slot);
      }
      const bar1 = new THREE.BoxGeometry(W * 0.8, 0.08, 0.08);
      bar1.translate(0, sillY + 0.55, L / 2 + 0.24);
      P('chrome', bar1);
      const bar2 = bar1.clone(); bar2.translate(0, -0.32, 0);
      P('chrome', bar2);
      [-1, 1].forEach(s => {
        const leg = new THREE.BoxGeometry(0.07, 0.62, 0.07);
        leg.translate(s * W * 0.36, sillY + 0.36, L / 2 + 0.24);
        P('chrome', leg);
      });
    }
    if (style === 'niva') {
      // багажник на крыше и защита порогов
      [-1, 1].forEach(s => {
        const rail = new THREE.BoxGeometry(0.07, 0.06, L * 0.34);
        rail.translate(s * W * 0.3, sillY + bodyH + cabH + 0.14, cabZ);
        P('dark', rail);
      });
      [-1, 1].forEach(s => {
        const slat = new THREE.BoxGeometry(W * 0.66, 0.05, 0.06);
        slat.translate(0, sillY + bodyH + cabH + 0.16, cabZ + s * L * 0.14);
        P('dark', slat);
      });
      const guard = new THREE.BoxGeometry(W * 0.86, 0.1, 0.1);
      guard.translate(0, sillY + 0.14, L / 2 + 0.14);
      P('chrome', guard);
    }
    if (style === 'gazelle') {
      // «морда» ГАЗели: хромированная решётка с тремя планками
      for (let k = 0; k < 3; k++) {
        const bar = new THREE.BoxGeometry(W * 0.5, 0.05, 0.05);
        bar.translate(0, sillY + bodyH * (0.5 + k * 0.1), L / 2 + 0.07);
        P('chrome', bar);
      }
    }
    if (style === 'kamaz') {
      const kb = new THREE.BoxGeometry(W * 0.7, 0.1, 0.1);
      kb.translate(0, sillY + 0.5, L / 2 + 0.2);
      P('chrome', kb);
      const tankG = new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8);
      tankG.rotateZ(Math.PI / 2);
      tankG.translate(W / 2 - 0.1, sillY + 0.45, 0.4);
      P('chrome', tankG);
    }

    // фары
    const round = style === 'vaz' || style === 'uaz';
    [-1, 1].forEach(s => {
      if (round) {
        const hl = new THREE.CylinderGeometry(W * 0.11, W * 0.11, 0.07, 12);
        hl.rotateX(Math.PI / 2);
        hl.translate(s * W * 0.32, sillY + bodyH * 0.68, L / 2 + 0.05);
        P('light', hl);
        const ring = new THREE.TorusGeometry(W * 0.115, 0.02, 5, 12);
        ring.translate(s * W * 0.32, sillY + bodyH * 0.68, L / 2 + 0.06);
        P('chrome', ring);
        if (style === 'vaz') {
          // дальний свет под основным
          const hl2 = new THREE.CylinderGeometry(W * 0.09, W * 0.09, 0.06, 10);
          hl2.rotateX(Math.PI / 2);
          hl2.translate(s * W * 0.17, sillY + bodyH * 0.68, L / 2 + 0.05);
          P('light', hl2);
        }
      } else {
        const hl = new THREE.BoxGeometry(W * 0.2, 0.13, 0.08);
        hl.translate(s * W * 0.33, sillY + bodyH * 0.68, L / 2 + 0.045);
        P('light', hl);
      }
      const tl = new THREE.BoxGeometry(W * 0.18, 0.12, 0.07);
      tl.translate(s * W * 0.34, sillY + bodyH * 0.7, -L / 2 - 0.045);
      P('brake', tl);
    });

    // зеркала
    [-1, 1].forEach(s => {
      const arm = new THREE.BoxGeometry(0.12, 0.05, 0.05);
      arm.translate(s * (W / 2 + 0.06), sillY + bodyH + cabH * 0.55, cabZ + cabL * 0.34);
      P('dark', arm);
      const mir = new THREE.BoxGeometry(0.07, 0.11, 0.14);
      mir.translate(s * (W / 2 + 0.15), sillY + bodyH + cabH * 0.55, cabZ + cabL * 0.34);
      P('body', mir);
    });

    // номера
    const pf = new THREE.BoxGeometry(0.52, 0.12, 0.02);
    pf.translate(0, sillY + 0.2, L / 2 + 0.17);
    P('plate', pf);
    const pr = new THREE.BoxGeometry(0.52, 0.12, 0.02);
    pr.translate(0, sillY + 0.2, -L / 2 - 0.17);
    P('plate', pr);

    // спойлер у спорткара
    if (shape === 'sports') {
      const sp = new THREE.BoxGeometry(W * 0.9, 0.05, 0.3);
      sp.translate(0, sillY + bodyH + 0.42, -L / 2 + 0.25);
      P('dark', sp);
      [-1, 1].forEach(s => {
        const st = new THREE.BoxGeometry(0.06, 0.3, 0.12);
        st.translate(s * W * 0.38, sillY + bodyH + 0.26, -L / 2 + 0.25);
        P('dark', st);
      });
    }

    // кузов пикапа
    if (shape === 'pickup') {
      const bedL = L * 0.38;
      [-1, 1].forEach(s => {
        const w2 = new THREE.BoxGeometry(0.08, 0.5, bedL);
        w2.translate(s * (W / 2 - 0.04), sillY + bodyH + 0.25, -L / 2 + bedL / 2 + 0.1);
        P('body', w2);
      });
      const tail = new THREE.BoxGeometry(W * 0.96, 0.5, 0.08);
      tail.translate(0, sillY + bodyH + 0.25, -L / 2 + 0.1);
      P('body', tail);
    }

    /* ---------- ТЮНИНГ ---------- */
    if (T.spoiler) {
      const lvl = T.spoiler;                       // 1 — лип, 2 — «лопата», 3 — антикрыло
      const hgt = lvl === 1 ? 0.06 : lvl === 2 ? 0.3 : 0.5;
      const wing = new THREE.BoxGeometry(W * (0.8 + lvl * 0.05), 0.05, 0.26 + lvl * 0.05);
      wing.translate(0, sillY + bodyH + hgt, -L / 2 + 0.18);
      P('vinyl', wing);
      if (lvl >= 2) {
        [-1, 1].forEach(s => {
          const st = new THREE.BoxGeometry(0.07, hgt, 0.14);
          st.translate(s * W * 0.36, sillY + bodyH + hgt / 2, -L / 2 + 0.18);
          P('vinyl', st);
        });
      }
    }
    if (T.kit) {
      [-1, 1].forEach(s => {
        const sill = new THREE.BoxGeometry(0.1, 0.14, L * 0.52);
        sill.translate(s * (W / 2 + 0.04), sillY - 0.02, 0);
        P('vinyl', sill);
      });
      const fsk = new THREE.BoxGeometry(W * 1.02, 0.12, 0.3);
      fsk.translate(0, sillY - 0.02, L / 2 + 0.06);
      P('vinyl', fsk);
      const rsk = new THREE.BoxGeometry(W * 1.02, 0.14, 0.28);
      rsk.translate(0, sillY - 0.02, -L / 2 - 0.06);
      P('vinyl', rsk);
      if (T.kit >= 2) {
        [-1, 1].forEach(s => {
          const arch = new THREE.BoxGeometry(0.12, 0.16, L * 0.2);
          arch.translate(s * (W / 2 + 0.03), sillY + 0.14, L * 0.29);
          P('vinyl', arch);
          const arch2 = arch.clone(); arch2.translate(0, 0, -L * 0.58);
          P('vinyl', arch2);
        });
      }
      if (T.kit >= 3) {
        const scoop = new THREE.BoxGeometry(W * 0.3, 0.1, L * 0.16);
        scoop.translate(0, sillY + bodyH + 0.2, L * 0.24);
        P('vinyl', scoop);
        const duct = new THREE.BoxGeometry(W * 0.24, 0.05, L * 0.12);
        duct.translate(0, sillY + bodyH + 0.26, L * 0.24);
        P('dark', duct);
      }
    }
    if (T.neon) {
      [-1, 1].forEach(s => {
        const st = new THREE.BoxGeometry(0.06, 0.05, L * 0.72);
        st.translate(s * (W / 2 - 0.1), groundY * 0.34, 0);
        P('neon', st);
      });
      [-1, 1].forEach(s => {
        const cr = new THREE.BoxGeometry(W * 0.7, 0.05, 0.06);
        cr.translate(0, groundY * 0.34, s * L * 0.36);
        P('neon', cr);
      });
    }
    if (T.vinylStripe) {
      [-1, 1].forEach(s => {
        const band = new THREE.BoxGeometry(0.16, 0.02, L * 0.98);
        band.translate(s * 0.22, sillY + bodyH + 0.1, 0);
        P('vinyl', band);
      });
    }

    // мигалки / шашечки
    if (type === 'police') {
      const barB = new THREE.BoxGeometry(0.5, 0.12, 0.22);
      barB.translate(-0.3, sillY + bodyH + cabH + 0.12, cabZ);
      P('light', barB);
      const barR = new THREE.BoxGeometry(0.5, 0.12, 0.22);
      barR.translate(0.3, sillY + bodyH + cabH + 0.12, cabZ);
      P('brake', barR);
      const base = new THREE.BoxGeometry(1.3, 0.06, 0.26);
      base.translate(0, sillY + bodyH + cabH + 0.05, cabZ);
      P('dark', base);
      [-1, 1].forEach(s => {
        const stripe = new THREE.BoxGeometry(0.04, 0.3, L * 0.6);
        stripe.translate(s * (W / 2 + 0.01), sillY + bodyH * 0.5, 0);
        P('dark', stripe);
      });
    }
    if (type === 'taxi') {
      const sign = new THREE.BoxGeometry(0.75, 0.2, 0.25);
      sign.translate(0, sillY + bodyH + cabH + 0.14, cabZ + cabL * 0.2);
      P('light', sign);
      for (let i = 0; i < 8; i++) {
        const chk = new THREE.BoxGeometry(0.04, 0.16, 0.16);
        chk.translate((i % 2 ? 1 : -1) * (W / 2 + 0.01), sillY + bodyH * 0.45, -L * 0.3 + i * 0.18);
        P('dark', chk);
      }
    }
  }

  /* --- сборка материалов --- */
  // номера рисуем тем же материалом, что хром: минус один draw call на машину
  if (parts.plate.length) { parts.chrome.push(...parts.plate); parts.plate.length = 0; }

  const map = {
    body: paint(T.paint || bodyCol), glass: glassM(T.tint || 0), dark: darkM(),
    chrome: chromeM(), light: lightM(), brake: brakeM(), plate: plateM(),
    vinyl: paint(T.vinylColor || 0x1b1f26, T.vinylMetal || 0.15),
    neon: neonM(T.neonColor || 0x35c8ff)
  };
  for (const k in parts) {
    if (!parts[k].length) continue;
    const merged = mergeGeometries(parts[k]);
    parts[k].forEach(p => p.dispose());
    const mesh = new THREE.Mesh(merged, map[k]);
    mesh.castShadow = k !== 'glass';
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  /* --- колёса --- */
  const ww = wheel(wheelR, isTall ? 0.3 : (isMoto ? 0.14 : 0.24), T.rims || 0);
  const wheelGroup = [];
  const wheelbase = isMoto ? L * 0.88 : L * 0.58;
  const track = isMoto ? 0 : W / 2 - (isTall ? 0.1 : 0.06);
  let positions;
  if (isMoto) {
    positions = [[0, wheelR, wheelbase / 2], [0, wheelR, -wheelbase / 2]];
    if (type === 'ural') positions.push([W * 0.85, wheelR, -L * 0.02]);
  } else {
    positions = [
      [-track, wheelR, wheelbase / 2], [track, wheelR, wheelbase / 2],
      [-track, wheelR, -wheelbase / 2], [track, wheelR, -wheelbase / 2]
    ];
  }
  if (shape === 'truck' || shape === 'bus') {
    positions.push([-track, wheelR, -wheelbase / 2 + 1.1], [track, wheelR, -wheelbase / 2 + 1.1]);
  }
  if (simple) {
    // статичная машина: все колёса одной парой мешей
    const tyres = [], rims = [];
    positions.forEach(([x, y, z]) => {
      const t = ww.tyre.clone(); t.translate(x, y, z); tyres.push(t);
      const r = ww.rim.clone(); r.translate(x, y, z); rims.push(r);
    });
    const tm = new THREE.Mesh(mergeGeometries(tyres), tyreM());
    const rm = new THREE.Mesh(mergeGeometries(rims), rimM());
    tm.castShadow = true;
    g.add(tm, rm);
    tyres.forEach(t => t.dispose());
    rims.forEach(r => r.dispose());
  } else {
    positions.forEach(([x, y, z], i) => {
      const wg = new THREE.Group();
      const tyre = new THREE.Mesh(ww.tyre, tyreM());
      const rim = new THREE.Mesh(ww.rim, rimM());
      tyre.castShadow = true;
      wg.add(tyre, rim);
      wg.position.set(x, y, z);
      wg.userData.steer = i < 2;
      g.add(wg);
      wheelGroup.push(wg);
    });
  }

  g.userData.wheels = wheelGroup;
  g.userData.simple = simple;
  g.userData.wheelR = wheelR;
  g.userData.lightMat = map.light;
  g.userData.brakeMat = map.brake;
  g.userData.spec = spec;
  g.userData.type = type;
  return g;
}

/* ======================= ФИЗИКА ======================= */
export class Vehicle {
  constructor(type, color, x = 0, z = 0, rot = 0, simple = false, tuning = null) {
    this.type = type;
    this.spec = VEHICLES[type] || VEHICLES.sedan;
    this.color = color;
    this.simple = simple;
    this.tuning = normalizeTuning(tuning);
    this._tune = tuningStats(this.tuning);
    this.mesh = buildVehicleMesh(type, color, simple, this.tuning);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = rot;

    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = rot;
    this.speed = 0;            // м/с, + вперёд
    this.steer = 0;            // текущий угол руля
    this.wheelSpin = 0;
    this.engineOn = false;
    this.fuel = 55 + Math.random() * 25;
    this.maxFuel = 80;
    this.damage = 0;
    this.locked = false;
    this.owner = null;
    this.plate = Vehicle.randomPlate();
    this.driver = null;
    this.lightsOn = false;
    this.braking = false;
    this.radius = Math.max(this.spec.L, this.spec.W) * 0.42;

    // --- расширенная физика ---
    this.latSpeed = 0;         // поперечная скорость, м/с (занос)
    this.rpm = 0.12;           // 0..1 нормализованные обороты
    this.gear = 1;
    this.gears = Math.max(4, Math.min(7, Math.round(this.spec.maxSpeed / 9)));
    this.slip = 0;             // пробуксовка ведущих колёс 0..1
    this.bounce = 0;           // вертикальная тряска подвески
    this.bounceV = 0;
    this.roll = 0;             // сглаженный крен
    this.pitch = 0;            // сглаженный клевóк
    // сопротивление подобрано так, чтобы машина выходила на свою паспортную скорость
    this.nos = 0;              // остаток закиси азота, 0..100
    this.nosActive = 0;
    this.rollC = 0.045;
    this.dragC = Math.max(0.00004,
      (this.spec.accel * 0.3 - this.rollC * this.spec.maxSpeed)
      / (this.spec.maxSpeed * this.spec.maxSpeed));
    this.smokeT = 0;
    this.burning = false;
    this.destroyed = false;
    this._burnT = 0;
    this.lastImpact = 0;
  }

  static randomPlate() {
    const L = 'ABCEHKMOPTXY';
    const r = n => Array.from({ length: n }, () => L[(Math.random() * L.length) | 0]).join('');
    return `${r(1)}${(100 + Math.random() * 900) | 0}${r(2)}`;
  }

  /**
   * Физика: продольная тяга + поперечное скольжение (занос), сцепление зависит от погоды.
   * @param {object} input {throttle:-1..1, steer:-1..1, brake:0..1, handbrake:bool}
   * @param {object} city  город с коллайдерами (может быть null)
   * @param {number} gripMul множитель сцепления от погоды (1 = сухо)
   */
  update(dt, input, city, gripMul = 1) {
    const sp = this.spec;
    const i = input || { throttle: 0, steer: 0, brake: 0 };
    const dead = this.destroyed;

    // топливо
    if (!dead && this.engineOn && (Math.abs(this.speed) > 0.3 || i.throttle > 0.1)) {
      this.fuel = Math.max(0, this.fuel - dt * (0.014 + Math.abs(this.speed) * 0.0026 + i.throttle * 0.02) * sp.mass);
    }
    const hasFuel = this.fuel > 0 && !dead;
    const health = 1 - this.damage;
    const powerMul = (0.45 + health * 0.55) * (hasFuel ? 1 : 0);

    // ---------- тюнинг ----------
    const ts = this._tune;

    // ---------- сцепление ----------
    const grip = clamp(gripMul * (0.55 + health * 0.45) * ts.grip, 0.25, 1.25);

    // ---------- закись азота ----------
    if (this.nosActive > 0 && this.nos > 0) {
      this.nos = Math.max(0, this.nos - dt * 26);
      this.nosActive = this.nos > 0 ? this.nosActive : 0;
    } else this.nosActive = 0;
    const boost = this.nosActive > 0 ? 1.85 : 1;

    // ---------- продольная динамика ----------
    const maxSp = sp.maxSpeed * (0.6 + health * 0.4) * ts.topSpeed;
    let acc = 0;
    if (this.engineOn && hasFuel) {
      if (i.throttle > 0) {
        const falloff = 1 - clamp(this.speed / maxSp, 0, 1);
        acc = sp.accel * i.throttle * (0.3 + falloff * 0.7) * powerMul * ts.power * boost;
      } else if (i.throttle < 0) {
        const falloff = 1 - clamp(-this.speed / (maxSp * 0.35), 0, 1);
        acc = sp.accel * 0.6 * i.throttle * falloff * powerMul;
      }
    }

    // тормоза: эффективность падает на мокром и убитых колёсах
    const brakePower = (16 + 8 * grip) * (0.6 + health * 0.4);
    const brakeF = ((i.brake || 0) * brakePower + (i.handbrake ? brakePower * 1.5 : 0)) * grip;
    if (Math.abs(this.speed) > 0.05) acc -= Math.sign(this.speed) * brakeF;
    const wet = 1 + (1 - grip) * 0.3;                 // мокрый асфальт чуть вязче
    acc -= (this.speed * Math.abs(this.speed) * this.dragC + this.speed * this.rollC) * wet;
    if (Math.abs(i.throttle) < 0.05 && !i.brake && !i.handbrake) acc -= Math.sign(this.speed) * 1.5;

    // ABS: на грани блокировки тормоз чуть ослабевает
    const absSlip = (i.brake || 0) > 0.5 && Math.abs(this.speed) > 3 && grip < 0.95;
    if (absSlip) acc += Math.sign(this.speed) * brakeF * 0.28;

    this.speed += acc * dt;
    if (Math.abs(this.speed) < 0.06 && Math.abs(i.throttle) < 0.05) this.speed = 0;
    this.speed = clamp(this.speed, -maxSp * 0.42, maxSp);
    this.braking = brakeF > 1 || (i.throttle < 0 && this.speed > 1);

    // пробуксовка ведущих колёс
    const wantSlip = (i.throttle > 0.4 && Math.abs(this.speed) < 8 ? i.throttle * (1.25 - grip) : 0)
      + (i.handbrake && Math.abs(this.speed) > 4 ? 0.5 : 0);
    this.slip += (clamp(wantSlip, 0, 1) - this.slip) * clamp(dt * 6, 0, 1);

    // ---------- руль ----------
    const speedFactor = 1 - clamp(Math.abs(this.speed) / maxSp, 0, 1) * 0.66;
    const targetSteer = (i.steer || 0) * 0.64 * speedFactor;
    this.steer += (targetSteer - this.steer) * clamp(dt * 9, 0, 1);

    // ---------- поворот и занос ----------
    const wheelbase = sp.L * 0.58;
    let yawRate = 0;
    if (Math.abs(this.speed) > 0.12) {
      yawRate = -(this.speed / wheelbase) * Math.tan(this.steer);
      // на ручнике задняя ось срывается: занос растёт, поворот усиливается
      const hb = i.handbrake ? 1 : 0;
      yawRate *= (1 + hb * 0.45) * grip;
      this.latSpeed += -yawRate * this.speed * dt * (0.55 + hb * 0.8);
    }
    this.heading += yawRate * dt;

    // поперечная скорость гасится сцеплением; на мокром держится дольше
    const latGrip = (i.handbrake ? 1.4 : 6.5) * grip;
    this.latSpeed -= this.latSpeed * clamp(latGrip * dt, 0, 1);
    this.latSpeed = clamp(this.latSpeed, -maxSp * 0.55, maxSp * 0.55);
    if (Math.abs(this.latSpeed) < 0.02) this.latSpeed = 0;

    // ---------- перемещение ----------
    const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
    const rx = -fz, rz = fx;
    const vx = fx * this.speed + rx * this.latSpeed;
    const vz = fz * this.speed + rz * this.latSpeed;
    let nx = this.pos.x + vx * dt;
    let nz = this.pos.z + vz * dt;

    // ---------- коллизии ----------
    this.lastImpact = 0;
    if (city) {
      const boxes = city.collidersNear(nx, nz, this.radius + 2);
      const res = resolveCircleBoxes(nx, nz, this.radius, boxes);
      if (res.hit) {
        const impact = Math.hypot(vx, vz);
        this.lastImpact = impact;
        if (impact > 3) this.hit(impact);
        // отскок: часть энергии уходит вбок
        const k = impact > 10 ? -0.18 : 0.3;
        this.speed *= k;
        this.latSpeed += (Math.random() - 0.5) * impact * 0.35;
        this.bounceV += impact * 0.05;
      }
      nx = res.x; nz = res.z;
    }
    this.pos.x = nx;
    this.pos.z = nz;

    // ---------- обороты и передача ----------
    const spd = Math.abs(this.speed);
    const topGear = this.gears;
    let g = 1;
    for (let n = topGear; n >= 1; n--) {
      if (spd > maxSp * (n - 1) / topGear * 0.92) { g = n; break; }
    }
    this.gear = g;
    const lo = maxSp * (g - 1) / topGear, hi = maxSp * g / topGear;
    const inGear = clamp((spd - lo) / Math.max(1, hi - lo), 0, 1);
    const targetRpm = dead ? 0
      : (this.engineOn ? 0.12 + inGear * 0.72 + (i.throttle > 0.1 && spd < 2 ? 0.22 * i.throttle : 0) : 0);
    this.rpm += (targetRpm - this.rpm) * clamp(dt * (targetRpm > this.rpm ? 7 : 4), 0, 1);
    this.rpm = clamp(this.rpm, 0, 1);

    // ---------- подвеска и наклон корпуса ----------
    const rough = 0.5 + Math.min(1, spd / 26);
    this.bounceV += (Math.random() - 0.5) * dt * 3.2 * rough * grip;
    this.bounceV -= this.bounce * 42 * dt;
    this.bounceV *= 1 - clamp(dt * 5, 0, 1);
    this.bounce = clamp(this.bounce + this.bounceV * dt, -0.09, 0.09);

    const targetRoll = clamp(-(this.latSpeed * 0.012 + Math.tan(this.steer) * this.speed * 0.008), -0.13, 0.13);
    this.roll += (targetRoll - this.roll) * clamp(dt * 6, 0, 1);
    const targetPitch = clamp(-acc * 0.0042 + (i.handbrake ? 0.02 : 0), -0.07, 0.07);
    this.pitch += (targetPitch - this.pitch) * clamp(dt * 7, 0, 1);

    this.mesh.position.set(this.pos.x, Math.max(0, this.bounce * 0.35), this.pos.z);
    this.mesh.rotation.set(this.pitch, this.heading, this.roll);

    // ---------- колёса ----------
    this.wheelSpin += (this.speed / this.mesh.userData.wheelR) * dt + this.slip * dt * 22;
    this.mesh.userData.wheels.forEach(w => {
      w.rotation.x = this.wheelSpin;
      w.rotation.y = w.userData.steer ? this.steer : 0;
    });

    // ---------- повреждения: дым, огонь, взрыв ----------
    this._damageFx(dt);

    // ---------- свет ----------
    if (this.headlights) {
      const on = this.lightsOn ? 1 : 0;
      this.headlights.forEach(l => { l.intensity = on * 2.6; l.visible = !!on; });
    }
    const bm = this.mesh.userData.brakeMat;
    if (bm) bm.emissiveIntensity = this.braking ? 2.2 : (this.lightsOn ? 0.5 : 0);
    const lm = this.mesh.userData.lightMat;
    if (lm) lm.emissiveIntensity = this.lightsOn && !this.destroyed ? 2.0 : 0;
  }

  /** Удар о препятствие: урон + событие для звука. */
  hit(impact) {
    if (this.destroyed) return;
    const dmg = impact * 0.006 * (1.4 - this.spec.mass * 0.2);
    this.damage = clamp(this.damage + dmg, 0, 1);
    if (this.damage >= 1 && !this.burning) this.burning = true;
    if (this.onHit) this.onHit(impact, this.damage);
  }

  _damageFx(dt) {
    if (this.damage >= 0.88 && !this.burning && !this.destroyed) this.burning = true;
    // дым из-под капота
    if (this.damage > 0.55 && !this.destroyed) {
      this.smokeT -= dt;
      if (this.smokeT <= 0 && this.smokePuff) {
        this.smokeT = this.damage > 0.85 ? 0.07 : 0.2;
        const fx = -Math.sin(this.heading), fz = -Math.cos(this.heading);
        this.smokePuff(this.pos.x + fx * this.spec.L * 0.45, 1.1, this.pos.z + fz * this.spec.L * 0.45, this.damage);
      }
    }
    if (!this.burning) return;
    this._burnT += dt;
    if (this.onBurn) this.onBurn(this.pos.x, this.pos.z, this._burnT);
    if (this._burnT > 5.5 && !this.destroyed) {
      this.destroyed = true;
      this.engineOn = false;
      if (this.onExplode) this.onExplode(this.pos.x, this.pos.z);
    }
  }

  /** Ставит/снимает деталь тюнинга и пересобирает кузов на месте. */
  setTuning(patch) {
    this.tuning = normalizeTuning(Object.assign({}, this.tuning, patch || {}));
    this._tune = tuningStats(this.tuning);
    if (this.simple) return;
    const old = this.mesh;
    const parent = old.parent;
    const px = old.position.x, py = old.position.y, pz = old.position.z;
    const ry = old.rotation.y;
    if (parent) parent.remove(old);
    old.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.mesh = buildVehicleMesh(this.type, this.color, false, this.tuning);
    this.mesh.position.set(px, py, pz);
    this.mesh.rotation.y = ry;
    this.headlights = null;
    if (parent) parent.add(this.mesh);
  }

  /** Включить/выключить нитро. */
  useNos(on) {
    if (!this.tuning.nitro) return false;
    if (on && this.nos <= 0) return false;
    this.nosActive = on ? 1 : 0;
    return true;
  }

  /** Заправить бак закиси (на СТО). */
  refillNos() { if (this.tuning.nitro) this.nos = 100; }

  /** Чинит машину (гараж/СТО). */
  repair(amount = 1) {
    this.damage = clamp(this.damage - amount, 0, 1);
    if (this.damage < 0.95) { this.burning = false; this._burnT = 0; }
    if (this.damage < 0.5) this.destroyed = false;
  }

  get speedKmh() { return Math.abs(this.speed) * 3.6; }

  /** Точка посадки/высадки сбоку. */
  doorPoint() {
    const side = this.spec.W / 2 + 0.75;
    return {
      x: this.pos.x + Math.cos(this.heading) * side,
      z: this.pos.z - Math.sin(this.heading) * side
    };
  }

  /**
   * Вешает на машину два прожектора-фары. Зовётся только для авто игрока,
   * чтобы не плодить источники света на весь трафик.
   */
  ensureHeadlights() {
    if (this.headlights) return this.headlights;
    const L = this.spec.L, W = this.spec.W;
    this.headlights = [];
    for (const side of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff0d0, 0, 55, 0.62, 0.45, 1.2);
      l.position.set(side * W * 0.33, 0.72, L * 0.47);
      l.target.position.set(side * W * 0.3, -0.4, L * 0.47 + 14);
      l.castShadow = false;
      l.visible = false;
      this.mesh.add(l);
      this.mesh.add(l.target);
      this.headlights.push(l);
    }
    return this.headlights;
  }

  refuel(amount) { this.fuel = Math.min(this.maxFuel, this.fuel + amount); }

  /** Припаркованную машину «оживляем» перед поездкой: возвращаем крутящиеся колёса. */
  upgradeMesh(scene) {
    if (!this.simple) return;
    const old = this.mesh;
    scene.remove(old);
    old.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.simple = false;
    this.mesh = buildVehicleMesh(this.type, this.color, false);
    this.mesh.position.set(this.pos.x, 0, this.pos.z);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
  }

  dispose() {
    this.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

/* interior.js — интерьеры: квартиры, частные дома, торговые залы, оружейный.

   Интерьер собирается на лету далеко от города (BASE), туда телепортируется
   игрок, а город на это время выключается — это и честный «вход внутрь»,
   и серьёзная экономия кадров: снаружи ничего не рисуется.

   Каждая комната отдаёт:
     parts      — геометрия,
     colliders  — стены и мебель для столкновений,
     actions    — точки взаимодействия (кровать, шкаф, касса, выход…),
     spawn      — где появляется игрок,
     seller     — где стоит продавец (если он нужен). */

import * as THREE from '../../vendor/three.module.js';
import { getTex, flatColor } from '../core/textures.js';
import { Humanoid } from '../entities/humanoid.js';
import { makeWeaponMesh } from '../entities/weaponmodels.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { FACTIONS } from '../game/factions.js';

export const BASE = { x: -4200, z: -4200 };   // где строим комнаты
const WALL_H = 3.0;

/* ======================= МАТЕРИАЛЫ ======================= */
const M = {};
function mat(key, make) {
  if (!M[key]) M[key] = make();
  return M[key];
}
const texMat = (name, repeat, params = {}) => mat('t_' + name + repeat, () => {
  const t = getTex(name);
  const map = t.map.clone(); map.needsUpdate = true; map.repeat.set(repeat, repeat);
  const nm = t.normalMap ? t.normalMap.clone() : null;
  if (nm) { nm.needsUpdate = true; nm.repeat.set(repeat, repeat); }
  return new THREE.MeshStandardMaterial({ map, normalMap: nm, roughness: 0.85, ...params });
});
const plain = (hex, rough = 0.8, metal = 0) => mat(`p${hex}_${rough}_${metal}`,
  () => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal }));
const glass = () => mat('glassI', () => new THREE.MeshStandardMaterial({
  color: 0xbcd6e6, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.35
}));
const glowMat = (hex, i = 1.4) => mat(`gl${hex}${i}`, () => new THREE.MeshStandardMaterial({
  color: 0x111111, emissive: hex, emissiveIntensity: i, roughness: 0.4
}));

/* ======================= ПРИМИТИВЫ-ПОМОЩНИКИ ======================= */
function box(w, h, d, x, y, z, m, ry = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.y = ry;
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
function cyl(r1, r2, h, x, y, z, m, seg = 12) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/* ======================= МЕБЕЛЬ ======================= */
/** Диван: основание, спинка, подлокотники, подушки. */
function sofa(x, z, ry, color = 0x4a5a6b) {
  const g = new THREE.Group();
  const m = plain(color, 0.95);
  g.add(box(2.2, 0.35, 0.9, 0, 0.3, 0, m));
  g.add(box(2.2, 0.65, 0.22, 0, 0.62, -0.34, m));
  g.add(box(0.22, 0.52, 0.9, -1.0, 0.55, 0, m));
  g.add(box(0.22, 0.52, 0.9, 1.0, 0.55, 0, m));
  for (let i = -1; i <= 1; i++) g.add(box(0.62, 0.16, 0.72, i * 0.68, 0.55, 0.04, plain(color + 0x080808, 0.98)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(0.04, 0.04, 0.14, sx * 0.95, 0.07, sz * 0.35, plain(0x2a2017, 0.6), 8));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Кровать: каркас, матрас, одеяло, подушки, изголовье. */
function bed(x, z, ry) {
  const g = new THREE.Group();
  const wood = plain(0x5a3c22, 0.75);
  g.add(box(1.5, 0.3, 2.05, 0, 0.2, 0, wood));
  g.add(box(1.52, 0.22, 2.0, 0, 0.44, 0, plain(0xe6e2d8, 0.95)));      // матрас
  g.add(box(1.54, 0.1, 1.3, 0, 0.56, 0.3, plain(0x3f5d7a, 0.95)));      // одеяло
  g.add(box(0.62, 0.14, 0.38, -0.36, 0.58, -0.76, plain(0xf2f0ea, 0.95)));
  g.add(box(0.62, 0.14, 0.38, 0.36, 0.58, -0.76, plain(0xf2f0ea, 0.95)));
  g.add(box(1.6, 0.9, 0.1, 0, 0.6, -1.06, wood));                       // изголовье
  g.add(box(0.5, 0.5, 0.42, 1.12, 0.26, -0.8, wood));                   // тумбочка
  g.add(cyl(0.11, 0.14, 0.2, 1.12, 0.62, -0.8, glowMat(0xffd9a0, 0.8), 10));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Шкаф-гардероб с дверцами и ручками. */
function wardrobe(x, z, ry) {
  const g = new THREE.Group();
  const wood = plain(0x4c3522, 0.7);
  g.add(box(1.5, 2.2, 0.6, 0, 1.1, 0, wood));
  g.add(box(0.72, 2.0, 0.04, -0.37, 1.1, 0.31, plain(0x5e442c, 0.55)));
  g.add(box(0.72, 2.0, 0.04, 0.37, 1.1, 0.31, plain(0x5e442c, 0.55)));
  g.add(cyl(0.02, 0.02, 0.18, -0.06, 1.1, 0.35, plain(0xc8b273, 0.3, 0.8), 8));
  g.add(cyl(0.02, 0.02, 0.18, 0.06, 1.1, 0.35, plain(0xc8b273, 0.3, 0.8), 8));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Кухня: тумбы, столешница, мойка, плита, вытяжка, верхние шкафы. */
function kitchen(x, z, ry) {
  const g = new THREE.Group();
  const body = plain(0xe8e8e4, 0.6);
  const top = plain(0x2e3338, 0.35, 0.2);
  g.add(box(3.0, 0.86, 0.6, 0, 0.43, 0, body));
  g.add(box(3.05, 0.06, 0.64, 0, 0.89, 0, top));
  for (let i = 0; i < 4; i++) g.add(box(0.68, 0.76, 0.03, -1.14 + i * 0.76, 0.45, 0.31, plain(0xd6d6d0, 0.5)));
  g.add(box(0.5, 0.04, 0.4, -0.9, 0.9, 0, plain(0x9aa1a8, 0.25, 0.9)));        // мойка
  g.add(cyl(0.02, 0.02, 0.3, -0.9, 1.05, -0.18, plain(0xa8b0b8, 0.2, 0.95), 8));
  g.add(box(0.6, 0.03, 0.5, 0.75, 0.92, 0, plain(0x1b1e22, 0.3, 0.6)));        // плита
  for (const dx of [-0.14, 0.14]) for (const dz of [-0.12, 0.12]) g.add(cyl(0.09, 0.09, 0.02, 0.75 + dx, 0.94, dz, plain(0x33373c, 0.4), 10));
  g.add(box(0.7, 0.3, 0.5, 0.75, 1.95, -0.05, plain(0xb9bdc2, 0.4, 0.6)));     // вытяжка
  g.add(box(1.4, 0.7, 0.35, -0.7, 1.75, -0.1, body));                          // верхние шкафы
  g.add(box(0.7, 1.8, 0.65, 1.85, 0.9, 0, plain(0xd9dde0, 0.35, 0.5)));        // холодильник
  g.add(box(0.03, 0.5, 0.04, 1.52, 1.3, 0.2, plain(0x8e949a, 0.3, 0.8)));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Обеденный стол со стульями. */
function diningSet(x, z, ry, chairs = 4) {
  const g = new THREE.Group();
  const wood = plain(0x6b4a2b, 0.7);
  g.add(box(1.5, 0.07, 0.9, 0, 0.76, 0, wood));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.08, 0.76, 0.08, sx * 0.65, 0.38, sz * 0.35, wood));
  const spots = [[0, -0.8, 0], [0, 0.8, Math.PI], [-1.05, 0, Math.PI / 2], [1.05, 0, -Math.PI / 2]];
  for (let i = 0; i < Math.min(chairs, 4); i++) {
    const [cx, cz, cr] = spots[i];
    const c = new THREE.Group();
    c.add(box(0.44, 0.06, 0.44, 0, 0.45, 0, wood));
    c.add(box(0.44, 0.5, 0.06, 0, 0.72, -0.19, wood));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(box(0.05, 0.45, 0.05, sx * 0.18, 0.22, sz * 0.18, wood));
    c.position.set(cx, 0, cz); c.rotation.y = cr;
    g.add(c);
  }
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Телевизор на тумбе — экран светится. */
function tvSet(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.6, 0.45, 0.42, 0, 0.22, 0, plain(0x33261a, 0.65)));
  g.add(box(1.25, 0.72, 0.05, 0, 0.92, 0, plain(0x14161a, 0.4, 0.5)));
  const screen = box(1.16, 0.64, 0.02, 0, 0.92, 0.035, glowMat(0x5fa8ff, 0.9));
  screen.name = 'tvscreen';
  g.add(screen);
  g.add(box(0.3, 0.06, 0.2, 0, 0.56, 0, plain(0x14161a, 0.5)));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Журнальный столик с мелочью. */
function coffeeTable(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.1, 0.05, 0.6, 0, 0.42, 0, plain(0x6b4a2b, 0.6)));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.06, 0.4, 0.06, sx * 0.48, 0.21, sz * 0.24, plain(0x3a2a1a, 0.7)));
  g.add(cyl(0.05, 0.06, 0.14, 0.25, 0.51, 0.08, plain(0x9aa6b2, 0.3, 0.6), 10));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Сейф с ручкой и замком. */
function safeBox(x, z, ry) {
  const g = new THREE.Group();
  const steel = plain(0x3a4048, 0.45, 0.8);
  g.add(box(0.7, 0.8, 0.6, 0, 0.4, 0, steel));
  g.add(box(0.62, 0.72, 0.05, 0, 0.4, 0.3, plain(0x2b3036, 0.5, 0.7)));
  g.add(cyl(0.08, 0.08, 0.06, 0.16, 0.4, 0.34, plain(0xc8b273, 0.3, 0.9), 12));
  g.add(box(0.14, 0.03, 0.03, 0.16, 0.4, 0.37, plain(0xc8b273, 0.3, 0.9)));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Потолочный светильник (+ настоящий свет). */
function ceilingLamp(x, z, color = 0xffe3b8, power = 1.1) {
  const g = new THREE.Group();
  g.add(cyl(0.02, 0.02, 0.35, 0, WALL_H - 0.18, 0, plain(0x2a2a2a, 0.6), 6));
  g.add(cyl(0.26, 0.16, 0.14, 0, WALL_H - 0.4, 0, glowMat(color, 1.6), 12));
  const l = new THREE.PointLight(color, power, 11, 2);
  l.position.set(0, WALL_H - 0.45, 0);
  g.add(l);
  g.position.set(x, 0, z);
  return g;
}

/** Стеллаж с товаром — коробки разных цветов. */
function shelfRack(x, z, ry, rng) {
  const g = new THREE.Group();
  const frame = plain(0x8e949a, 0.5, 0.5);
  g.add(box(2.2, 0.08, 0.6, 0, 0.35, 0, frame));
  g.add(box(2.2, 0.08, 0.6, 0, 0.95, 0, frame));
  g.add(box(2.2, 0.08, 0.6, 0, 1.55, 0, frame));
  g.add(box(2.2, 0.08, 0.6, 0, 2.05, 0, frame));
  for (const sx of [-1, 1]) g.add(box(0.07, 2.1, 0.6, sx * 1.1, 1.05, 0, frame));
  const colors = [0xcf4b3a, 0xe0a33a, 0x4a8f55, 0x3f6fa8, 0xd4d4cc, 0x8b5a9c];
  for (let s = 0; s < 3; s++) {
    const y = 0.39 + s * 0.6;
    for (let i = 0; i < 7; i++) {
      const c = colors[Math.floor(rng() * colors.length)];
      const h = 0.18 + rng() * 0.16;
      g.add(box(0.22, h, 0.3, -0.95 + i * 0.32, y + h / 2, (rng() - 0.5) * 0.14, plain(c, 0.8)));
    }
  }
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Холодильная витрина с напитками. */
function fridgeCase(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(1.8, 2.1, 0.75, 0, 1.05, 0, plain(0xbfc6cc, 0.4, 0.5)));
  g.add(box(1.6, 1.8, 0.04, 0, 1.1, 0.38, glass()));
  for (let s = 0; s < 4; s++) {
    const y = 0.35 + s * 0.45;
    g.add(box(1.55, 0.04, 0.6, 0, y, 0, plain(0x9aa1a8, 0.4, 0.6)));
    for (let i = 0; i < 9; i++) {
      g.add(cyl(0.045, 0.045, 0.24, -0.68 + i * 0.17, y + 0.14, -0.08, plain(i % 3 === 0 ? 0xcf4b3a : i % 3 === 1 ? 0x3f6fa8 : 0x4a8f55, 0.5), 8));
    }
  }
  const l = new THREE.PointLight(0xaad4ff, 0.5, 4, 2);
  l.position.set(0, 1.6, 0.4);
  g.add(l);
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Касса: прилавок, кассовый аппарат, терминал, сканер. */
function counter(x, z, ry) {
  const g = new THREE.Group();
  const body = plain(0x7a6a58, 0.7);
  g.add(box(2.6, 1.0, 0.8, 0, 0.5, 0, body));
  g.add(box(2.7, 0.08, 0.9, 0, 1.03, 0, plain(0x2e3338, 0.35, 0.25)));
  g.add(box(0.45, 0.28, 0.35, -0.7, 1.21, 0, plain(0x33373c, 0.5)));
  g.add(box(0.4, 0.22, 0.03, -0.7, 1.33, 0.1, glowMat(0x7fe2a8, 0.7)));
  g.add(box(0.16, 0.1, 0.12, 0.5, 1.12, 0.1, plain(0x1c1f23, 0.6)));
  g.add(box(0.5, 0.03, 0.4, 1.0, 1.08, 0, plain(0x1c1f23, 0.4)));
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Витрина оружейного: настоящие 3D-стволы под стеклом. */
function gunDisplay(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(2.4, 0.95, 0.8, 0, 0.47, 0, plain(0x3a3f45, 0.6, 0.3)));
  g.add(box(2.4, 0.5, 0.78, 0, 1.2, 0, glass()));
  g.add(box(2.4, 0.05, 0.8, 0, 1.46, 0, plain(0x2b3036, 0.5, 0.4)));
  const kinds = ['pistol', 'revolver', 'smg'];
  kinds.forEach((k, i) => {
    const w = makeWeaponMesh(k);
    if (!w) return;
    w.scale.setScalar(1.25);
    w.position.set(-0.75 + i * 0.75, 1.02, 0);
    w.rotation.y = Math.PI / 2;
    g.add(w);
  });
  const l = new THREE.PointLight(0xfff0d0, 0.5, 4, 2);
  l.position.set(0, 1.4, 0);
  g.add(l);
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/** Стойка с длинными стволами на стене. */
function gunWallRack(x, z, ry) {
  const g = new THREE.Group();
  g.add(box(3.0, 1.8, 0.12, 0, 1.6, 0, plain(0x4a3626, 0.75)));
  ['rifle', 'shotgun', 'smg'].forEach((k, i) => {
    const w = makeWeaponMesh(k);
    if (!w) return;
    w.scale.setScalar(1.4);
    w.position.set(-0.95 + i * 0.95, 1.35 + (i % 2) * 0.45, 0.16);
    w.rotation.set(0, 0, Math.PI / 2);
    g.add(w);
  });
  g.position.set(x, 0, z); g.rotation.y = ry;
  return g;
}

/* ======================= КОМНАТЫ ======================= */
/** Коробка помещения: пол, потолок, 4 стены с проёмом под дверь. */
function shell(w, d, opts = {}) {
  const parts = new THREE.Group();
  const colliders = [];
  const floorMat = opts.floor === 'tile' ? texMat('tile', Math.max(w, d) / 2)
    : opts.floor === 'concrete' ? texMat('concrete', Math.max(w, d) / 3)
    : opts.floor === 'carpet' ? texMat('carpet', Math.max(w, d) / 3)
      : texMat('parquet', Math.max(w, d) / 2.4);
  const wallMat = opts.wall === 'shop' ? plain(0xdfe2e4, 0.9) : texMat('wallpaper', Math.max(w, d) / 3);

  const floor = box(w, 0.1, d, 0, -0.05, 0, floorMat);
  floor.receiveShadow = true;
  parts.add(floor);
  parts.add(box(w, 0.08, d, 0, WALL_H + 0.04, 0, plain(0xf0f0ee, 0.95)));   // потолок

  const T = 0.18;
  const doorW = 1.4;
  // южная стена с дверным проёмом по центру
  const side = (w - doorW) / 2;
  parts.add(box(side, WALL_H, T, -(doorW / 2 + side / 2), WALL_H / 2, d / 2, wallMat));
  parts.add(box(side, WALL_H, T, (doorW / 2 + side / 2), WALL_H / 2, d / 2, wallMat));
  parts.add(box(doorW, WALL_H - 2.15, T, 0, WALL_H - (WALL_H - 2.15) / 2, d / 2, wallMat));
  colliders.push({ x: -(doorW / 2 + side / 2), z: d / 2, w: side, d: T });
  colliders.push({ x: (doorW / 2 + side / 2), z: d / 2, w: side, d: T });

  parts.add(box(w, WALL_H, T, 0, WALL_H / 2, -d / 2, wallMat));
  parts.add(box(T, WALL_H, d, -w / 2, WALL_H / 2, 0, wallMat));
  parts.add(box(T, WALL_H, d, w / 2, WALL_H / 2, 0, wallMat));
  colliders.push({ x: 0, z: -d / 2, w, d: T });
  colliders.push({ x: -w / 2, z: 0, w: T, d });
  colliders.push({ x: w / 2, z: 0, w: T, d });

  // плинтус
  parts.add(box(w, 0.1, T + 0.04, 0, 0.05, -d / 2 + 0.01, plain(0xe8e4dc, 0.8)));

  // окна на северной стене: светящаяся «улица» за стеклом
  const wins = Math.max(1, Math.floor(w / 3.2));
  for (let i = 0; i < wins; i++) {
    const wx = -w / 2 + (w / (wins + 1)) * (i + 1);
    parts.add(box(1.5, 1.3, 0.06, wx, 1.65, -d / 2 + 0.1, glass()));
    parts.add(box(1.62, 1.42, 0.05, wx, 1.65, -d / 2 + 0.14, plain(0x8e949a, 0.6)));
    const l = new THREE.PointLight(0xbfd8ff, 0.35, 8, 2);
    l.position.set(wx, 1.7, -d / 2 + 0.6);
    parts.add(l);
  }

  // дверь (створка сбоку от проёма)
  const door = box(doorW * 0.96, 2.1, 0.07, doorW * 0.45, 1.05, d / 2 - 0.12, plain(0x55402a, 0.7));
  door.rotation.y = -0.5;
  parts.add(door);

  return { parts, colliders };
}

/** Жилая квартира/дом. big=true — просторный дом с камином. */
function makeHome(big, rng) {
  const w = big ? 16 : 11, d = big ? 12 : 9;
  const { parts, colliders } = shell(w, d, { floor: 'parquet' });
  const actions = [];

  parts.add(ceilingLamp(-w * 0.25, -d * 0.15));
  parts.add(ceilingLamp(w * 0.25, d * 0.2));

  // гостиная
  parts.add(sofa(-w * 0.26, d * 0.1, 0));
  parts.add(coffeeTable(-w * 0.26, d * 0.1 - 1.3, 0));
  parts.add(tvSet(-w * 0.26, d * 0.1 - 2.6, Math.PI));
  colliders.push({ x: -w * 0.26, z: d * 0.1, w: 2.3, d: 1.0 });
  colliders.push({ x: -w * 0.26, z: d * 0.1 - 2.6, w: 1.7, d: 0.5 });
  actions.push({ x: -w * 0.26, z: d * 0.1 - 2.2, r: 1.6, kind: 'tv', label: 'Посмотреть телевизор' });

  // кухня и столовая
  parts.add(kitchen(w * 0.22, -d / 2 + 0.6, 0));
  colliders.push({ x: w * 0.22, z: -d / 2 + 0.6, w: 3.6, d: 0.7 });
  actions.push({ x: w * 0.22 + 1.85, z: -d / 2 + 1.5, r: 1.5, kind: 'fridge', label: 'Заглянуть в холодильник' });
  parts.add(diningSet(w * 0.2, -d * 0.02, 0));
  colliders.push({ x: w * 0.2, z: -d * 0.02, w: 1.6, d: 1.0 });

  // спальня
  parts.add(bed(-w / 2 + 1.3, -d / 2 + 1.6, Math.PI / 2));
  colliders.push({ x: -w / 2 + 1.3, z: -d / 2 + 1.6, w: 2.2, d: 1.7 });
  actions.push({ x: -w / 2 + 2.6, z: -d / 2 + 1.6, r: 1.6, kind: 'bed', label: 'Поспать' });

  parts.add(wardrobe(-w / 2 + 1.0, d * 0.22, Math.PI / 2));
  colliders.push({ x: -w / 2 + 1.0, z: d * 0.22, w: 0.7, d: 1.6 });
  actions.push({ x: -w / 2 + 2.0, z: d * 0.22, r: 1.5, kind: 'wardrobe', label: 'Гардероб' });

  parts.add(safeBox(w / 2 - 0.8, d * 0.3, -Math.PI / 2));
  colliders.push({ x: w / 2 - 0.8, z: d * 0.3, w: 0.7, d: 0.8 });
  actions.push({ x: w / 2 - 1.7, z: d * 0.3, r: 1.4, kind: 'stash', label: 'Сейф-хранилище' });

  if (big) {
    // камин и ковёр
    parts.add(box(2.0, 1.2, 0.5, 0, 0.6, -d / 2 + 0.35, plain(0x8a8278, 0.85)));
    parts.add(box(1.2, 0.7, 0.2, 0, 0.45, -d / 2 + 0.62, glowMat(0xff7a2a, 1.6)));
    const fire = new THREE.PointLight(0xff8a3a, 0.8, 7, 2);
    fire.position.set(0, 0.7, -d / 2 + 0.9);
    parts.add(fire);
    parts.add(box(3.4, 0.02, 2.4, 0, 0.01, 0.6, texMat('carpet', 2)));
  }

  return {
    parts, colliders, actions,
    spawn: { x: 0, z: d / 2 - 1.3, rot: Math.PI },
    exitAt: { x: 0, z: d / 2 - 0.9 }
  };
}

/* ======================= МЕБЕЛЬ БАЗ ОРГАНИЗАЦИЙ ======================= */

/** Ряд металлических шкафчиков для формы. */
function lockerRow(x, z, ry, n = 4, accent = 0x2f6fb0) {
  const g = new THREE.Group();
  const body = plain(0x8d949c, 0.55, 0.5);
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 0.62;
    g.add(box(0.58, 1.9, 0.5, lx, 0.95, 0, body));
    g.add(box(0.5, 0.86, 0.04, lx, 1.36, 0.26, plain(accent, 0.5, 0.3)));
    g.add(box(0.5, 0.86, 0.04, lx, 0.46, 0.26, plain(accent, 0.5, 0.3)));
    g.add(cyl(0.025, 0.025, 0.14, lx + 0.2, 1.3, 0.3, plain(0x30343a, 0.4, 0.8), 8));
  }
  g.add(box(n * 0.62 + 0.06, 0.06, 0.56, 0, 1.93, 0, plain(0x6d747c, 0.6, 0.4)));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

/** Стойка дежурного: тумба, столешница, монитор, лампа. */
function dutyDesk(x, z, ry, accent = 0x2f6fb0) {
  const g = new THREE.Group();
  g.add(box(2.6, 1.05, 0.72, 0, 0.52, 0, plain(0x3a4049, 0.7)));
  g.add(box(2.8, 0.08, 0.9, 0, 1.08, 0.02, plain(0x24282d, 0.4, 0.3)));
  g.add(box(2.7, 0.22, 0.06, 0, 0.92, -0.37, plain(accent, 0.5, 0.35)));
  // монитор
  g.add(cyl(0.12, 0.16, 0.04, -0.7, 1.14, 0, plain(0x1c1f23, 0.5, 0.6), 10));
  g.add(box(0.07, 0.3, 0.07, -0.7, 1.28, 0, plain(0x1c1f23, 0.5, 0.6)));
  const scr = box(0.78, 0.46, 0.04, -0.7, 1.62, 0, glowMat(0x7fd4ff, 0.9));
  scr.rotation.y = 0.25;
  g.add(scr);
  // рация и журнал
  g.add(box(0.1, 0.22, 0.06, 0.45, 1.23, 0.05, plain(0x202327, 0.6)));
  g.add(box(0.34, 0.03, 0.26, 0.9, 1.13, 0.0, plain(0xe8e4d8, 0.9)));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

/** Оружейная витрина-стеллаж вдоль стены. */
function armoryRack(x, z, ry, accent = 0x2f6fb0) {
  const g = new THREE.Group();
  const steel = plain(0x737a82, 0.5, 0.6);
  g.add(box(2.8, 2.1, 0.44, 0, 1.05, 0, plain(0x30353b, 0.7)));
  for (let i = 0; i < 3; i++) g.add(box(2.7, 0.05, 0.4, 0, 0.45 + i * 0.6, 0.02, steel));
  const gl = box(2.74, 2.0, 0.03, 0, 1.08, 0.23, glass());
  g.add(gl);
  for (let i = 0; i < 4; i++) {
    const w = box(0.9, 0.08, 0.1, -0.95 + (i % 2) * 1.0, 1.1 + Math.floor(i / 2) * 0.6, 0.0, plain(0x1d2024, 0.6, 0.3));
    w.rotation.z = 0.06;
    g.add(w);
  }
  g.add(box(2.8, 0.08, 0.5, 0, 2.14, 0, plain(accent, 0.5, 0.4)));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

/** Доска объявлений / карта оперативной обстановки. */
function briefBoard(x, z, ry, accent = 0x2f6fb0) {
  const g = new THREE.Group();
  g.add(box(2.4, 1.5, 0.08, 0, 1.75, 0, plain(0x2a2e34, 0.8)));
  g.add(box(2.2, 1.3, 0.02, 0, 1.75, 0.06, plain(0xdad4c4, 0.9)));
  for (let i = 0; i < 6; i++) {
    const px = -0.85 + (i % 3) * 0.85, py = 1.45 + Math.floor(i / 3) * 0.5;
    g.add(box(0.42, 0.3, 0.01, px, py, 0.08, plain(i % 2 ? 0xffffff : accent, 0.9)));
  }
  g.add(box(2.5, 0.1, 0.14, 0, 2.56, 0.02, plain(accent, 0.5, 0.4)));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

/** Стол руководителя с креслом и флагом организации. */
function chiefDesk(x, z, ry, accent = 0x2f6fb0) {
  const g = new THREE.Group();
  g.add(box(2.2, 0.72, 1.0, 0, 0.36, 0, plain(0x4a3524, 0.75)));
  g.add(box(2.4, 0.08, 1.15, 0, 0.76, 0, plain(0x6b4a2f, 0.5)));
  // кресло
  g.add(box(0.62, 0.12, 0.6, 0, 0.47, -0.95, plain(0x24262a, 0.7)));
  g.add(box(0.62, 0.8, 0.12, 0, 0.9, -1.2, plain(0x24262a, 0.7)));
  g.add(cyl(0.05, 0.05, 0.42, 0, 0.21, -0.95, plain(0x3c3f45, 0.4, 0.7), 8));
  g.add(cyl(0.3, 0.3, 0.05, 0, 0.03, -0.95, plain(0x3c3f45, 0.4, 0.7), 10));
  // флаг
  g.add(cyl(0.04, 0.04, 2.3, 1.5, 1.15, -0.6, plain(0x9aa0a8, 0.4, 0.8), 8));
  const flag = box(0.06, 1.0, 0.7, 1.5, 1.7, -0.25, plain(accent, 0.8));
  g.add(flag);
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

/** Тюремная камера: решётка, нары, раковина. */
function cellBlock(x, z, ry) {
  const g = new THREE.Group();
  const bar = plain(0x6a7078, 0.45, 0.75);
  for (let i = 0; i < 11; i++) g.add(cyl(0.035, 0.035, 2.6, -1.5 + i * 0.3, 1.3, 0, bar, 8));
  g.add(box(3.2, 0.1, 0.1, 0, 2.6, 0, bar));
  g.add(box(3.2, 0.1, 0.1, 0, 0.05, 0, bar));
  // нары
  g.add(box(1.9, 0.12, 0.72, -0.5, 0.5, -1.1, plain(0x5b6069, 0.6, 0.4)));
  g.add(box(1.8, 0.14, 0.64, -0.5, 0.62, -1.1, plain(0x9a9484, 0.9)));
  g.add(box(0.1, 0.5, 0.72, -1.45, 0.26, -1.1, plain(0x5b6069, 0.6, 0.4)));
  g.add(box(0.1, 0.5, 0.72, 0.45, 0.26, -1.1, plain(0x5b6069, 0.6, 0.4)));
  // раковина и ведро
  g.add(box(0.44, 0.18, 0.34, 1.2, 0.85, -1.6, plain(0xd8dce0, 0.35)));
  g.add(cyl(0.05, 0.05, 0.28, 1.2, 1.07, -1.72, plain(0x9aa0a8, 0.3, 0.8), 8));
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

/** Зал базы организации: дежурка, оружейка, шкафчики, доска, кабинет, сейф. */
function makeBaseRoom(factionId, rng) {
  const f = FACTIONS[factionId] || FACTIONS.police;
  const accent = f.accent || 0x2f6fb0;
  const gang = f.type === 'gang';
  const w = 18, d = 13;
  const { parts, colliders } = shell(w, d, { floor: gang ? 'concrete' : 'tile', wall: 'shop' });
  const actions = [];

  parts.add(ceilingLamp(-5, -3, gang ? 0xffc48a : 0xffffff, 1.0));
  parts.add(ceilingLamp(5, -3, gang ? 0xffc48a : 0xffffff, 1.0));
  parts.add(ceilingLamp(0, 3, 0xffffff, 0.85));

  // дежурная часть
  parts.add(dutyDesk(-w / 2 + 2.2, 3.2, Math.PI / 2, accent));
  colliders.push({ x: -w / 2 + 2.2, z: 3.2, w: 1.0, d: 2.9 });
  actions.push({ x: -w / 2 + 3.6, z: 3.2, r: 1.8, kind: 'orgduty', label: gang ? 'Сходка: взять дело' : 'Дежурная часть' });

  // оружейная
  parts.add(armoryRack(-3.5, -d / 2 + 0.35, 0, accent));
  colliders.push({ x: -3.5, z: -d / 2 + 0.35, w: 2.9, d: 0.6 });
  actions.push({ x: -3.5, z: -d / 2 + 1.5, r: 1.7, kind: 'orgarmory', label: gang ? 'Схрон со стволами' : 'Оружейная комната' });

  // шкафчики с формой
  parts.add(lockerRow(3.0, -d / 2 + 0.4, 0, 5, accent));
  colliders.push({ x: 3.0, z: -d / 2 + 0.4, w: 3.2, d: 0.6 });
  actions.push({ x: 3.0, z: -d / 2 + 1.5, r: 1.7, kind: 'orgwear', label: 'Переодеться в форму' });

  // доска с заданиями
  parts.add(briefBoard(-0.2, d / 2 - 0.3, Math.PI, accent));
  actions.push({ x: -0.2, z: d / 2 - 1.5, r: 1.8, kind: 'orgboard', label: 'Доска: состав и задания' });

  // кабинет руководителя
  parts.add(chiefDesk(w / 2 - 3.0, -2.6, -Math.PI / 2, accent));
  colliders.push({ x: w / 2 - 3.0, z: -2.6, w: 1.3, d: 2.4 });
  actions.push({ x: w / 2 - 4.4, z: -2.6, r: 1.8, kind: 'orgchief', label: gang ? 'Кабинет главы' : 'Кабинет руководителя' });

  // сейф-склад
  parts.add(safeBox(w / 2 - 0.8, 2.6, -Math.PI / 2));
  colliders.push({ x: w / 2 - 0.8, z: 2.6, w: 0.7, d: 0.8 });
  actions.push({ x: w / 2 - 1.8, z: 2.6, r: 1.5, kind: 'orgstore', label: 'Склад организации' });

  // совещательный стол в центре
  parts.add(diningSet(0, -1.4, 0, 6));
  colliders.push({ x: 0, z: -1.4, w: 1.8, d: 1.2 });

  if (factionId === 'fsin') {
    parts.add(cellBlock(-5.6, 1.0, 0));
    parts.add(cellBlock(-1.6, 1.0, 0));
    colliders.push({ x: -5.6, z: 1.0, w: 3.2, d: 0.3 });
    colliders.push({ x: -1.6, z: 1.0, w: 3.2, d: 0.3 });
    actions.push({ x: -3.6, z: 2.0, r: 2.0, kind: 'orgcells', label: 'Камеры: список заключённых' });
  }

  return {
    parts, colliders, actions,
    spawn: { x: 0, z: d / 2 - 1.4, rot: Math.PI },
    exitAt: { x: 0, z: d / 2 - 0.9 }
  };
}

/** Камера СИЗО, куда попадает осуждённый игрок. */
function makePrisonRoom(rng) {
  const w = 7, d = 6;
  const { parts, colliders } = shell(w, d, { floor: 'concrete', wall: 'shop' });
  const actions = [];
  parts.add(ceilingLamp(0, 0, 0xcfd8e0, 0.7));

  const bar = plain(0x6a7078, 0.45, 0.75);
  for (let i = 0; i < 16; i++) parts.add(cyl(0.04, 0.04, 2.9, -2.6 + i * 0.35, 1.45, d / 2 - 0.5, bar, 8));
  parts.add(box(6.0, 0.12, 0.12, 0, 2.9, d / 2 - 0.5, bar));
  colliders.push({ x: 0, z: d / 2 - 0.5, w: 6.0, d: 0.3 });

  parts.add(box(2.0, 0.14, 0.8, -w / 2 + 1.3, 0.52, -1.0, plain(0x5b6069, 0.6, 0.4)));
  parts.add(box(1.9, 0.16, 0.72, -w / 2 + 1.3, 0.66, -1.0, plain(0x9a9484, 0.9)));
  colliders.push({ x: -w / 2 + 1.3, z: -1.0, w: 2.0, d: 0.8 });
  actions.push({ x: -w / 2 + 1.3, z: 0.2, r: 1.6, kind: 'jailbunk', label: 'Лечь на нары (ждать срок)' });

  parts.add(box(0.5, 0.2, 0.4, w / 2 - 0.6, 0.85, -1.8, plain(0xd8dce0, 0.35)));
  parts.add(box(0.7, 0.05, 0.7, w / 2 - 0.6, 0.78, 0.4, plain(0x7a8089, 0.5, 0.4)));
  actions.push({ x: w / 2 - 1.6, z: 0.4, r: 1.6, kind: 'jailinfo', label: 'Срок, залог, адвокат' });

  return {
    parts, colliders, actions,
    spawn: { x: 0, z: -2.0, rot: 0 },
    exitAt: { x: 0, z: d / 2 - 1.2 }
  };
}

/** Торговый зал магазина. kind — вид магазина, нужен для вывески и ассортимента. */
function makeShopRoom(kind, rng) {
  const w = 14, d = 11;
  const { parts, colliders } = shell(w, d, { floor: 'tile', wall: 'shop' });
  const actions = [];

  parts.add(ceilingLamp(-4, -2, 0xffffff, 1.0));
  parts.add(ceilingLamp(4, -2, 0xffffff, 1.0));
  parts.add(ceilingLamp(0, 2.5, 0xffffff, 0.9));

  if (kind === 'guns') {
    parts.add(gunDisplay(-3.4, -1.5, 0));
    colliders.push({ x: -3.4, z: -1.5, w: 2.4, d: 0.8 });
    parts.add(gunDisplay(-3.4, 1.4, Math.PI));
    colliders.push({ x: -3.4, z: 1.4, w: 2.4, d: 0.8 });
    parts.add(gunWallRack(0, -d / 2 + 0.3, 0));
    parts.add(gunWallRack(-4.5, -d / 2 + 0.3, 0));
    // мишень на стене
    for (let i = 0; i < 3; i++) {
      const ring = cyl(0.3 - i * 0.09, 0.3 - i * 0.09, 0.02, 5.2, 1.8, -d / 2 + 0.2 + i * 0.01,
        plain(i % 2 ? 0xffffff : 0xcf4b3a, 0.9), 16);
      ring.rotation.x = Math.PI / 2;
      parts.add(ring);
    }
  } else {
    for (let i = 0; i < 3; i++) {
      parts.add(shelfRack(-4.6 + i * 3.0, -1.2, 0, rng));
      colliders.push({ x: -4.6 + i * 3.0, z: -1.2, w: 2.2, d: 0.7 });
      actions.push({ x: -4.6 + i * 3.0, z: -0.3, r: 1.5, kind: 'shelf', label: 'Взять товар с полки' });
    }
    parts.add(fridgeCase(5.4, -2.5, -Math.PI / 2));
    colliders.push({ x: 5.4, z: -2.5, w: 0.8, d: 1.9 });
    actions.push({ x: 4.3, z: -2.5, r: 1.6, kind: 'fridgecase', label: 'Холодильник с напитками' });
  }

  // касса с продавцом
  parts.add(counter(3.0, 2.6, Math.PI));
  colliders.push({ x: 3.0, z: 2.6, w: 2.7, d: 0.9 });
  actions.push({ x: 3.0, z: 1.6, r: 2.0, kind: 'cashier', label: 'Подойти к кассе' });

  // корзины у входа
  for (let i = 0; i < 3; i++) {
    parts.add(box(0.5, 0.3, 0.36, -6.0, 0.15 + i * 0.12, 3.6, plain(0xcf4b3a, 0.8)));
  }

  return {
    parts, colliders, actions,
    spawn: { x: -2, z: d / 2 - 1.3, rot: Math.PI },
    exitAt: { x: 0, z: d / 2 - 0.9 },
    seller: { x: 3.0, z: 3.5, rot: Math.PI }
  };
}

/**
 * Склеивает статичную геометрию комнаты по материалам: было ~150 вызовов
 * отрисовки, стало ~15. Источники света и оружие в витринах не трогаем.
 */
function bakeRoom(parts) {
  const byMat = new Map();
  const keep = [];
  parts.traverse(o => {
    if (o.isLight) { keep.push(o); return; }
    if (!o.isMesh || !o.geometry) return;
    if (o.name === 'tvscreen' || (o.parent && /^weapon_/.test(o.parent.name))) { keep.push(o); return; }
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!byMat.has(m)) byMat.set(m, []);
    o.updateWorldMatrix(true, false);
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(o.matrixWorld);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    byMat.get(m).push(g);
  });

  const baked = new THREE.Group();
  byMat.forEach((geos, m) => {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    geos.forEach(g => { if (g !== merged) g.dispose(); });
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    baked.add(mesh);
  });
  // всё, что нельзя склеивать, переносим как есть (с сохранением мировой позиции)
  for (const o of keep) {
    o.updateWorldMatrix(true, false);
    const parent = o.parent;
    if (parent) parent.remove(o);
    o.matrix.copy(o.matrixWorld);
    o.matrix.decompose(o.position, o.quaternion, o.scale);
    baked.add(o);
  }
  return baked;
}

/* ======================= СИСТЕМА ======================= */
export class Interiors {
  /** @param {object} game ссылка на игру (нужны сцена, игрок, HUD) */
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.group = new THREE.Group();
    this.group.position.set(BASE.x, 0, BASE.z);
    this.group.visible = false;
    this.scene.add(this.group);

    this.current = null;      // {def, colliders, actions, exitAt}
    this.seller = null;
    this._cache = new Map();
    this._rngState = 12345;
  }

  get active() { return !!this.current; }

  _rng() {
    this._rngState = (this._rngState * 1664525 + 1013904223) % 4294967296;
    return this._rngState / 4294967296;
  }

  /**
   * Заходим внутрь.
   * @param {object} def {kind:'home'|'house'|'shop', id, name, shopKind, poi}
   */
  enter(def) {
    if (this.current) this.exit();
    const key = def.kind + ':' + (def.shopKind || def.faction || '') + ':' + (def.big ? 'big' : 'small');
    let room = this._cache.get(key);
    if (!room) {
      const rng = () => this._rng();
      room = def.kind === 'shop' ? makeShopRoom(def.shopKind || 'market', rng)
        : def.kind === 'base' ? makeBaseRoom(def.faction || 'police', rng)
        : def.kind === 'prison' ? makePrisonRoom(rng)
        : makeHome(!!def.big, rng);
      room.parts = bakeRoom(room.parts);     // склейка ради кадров
      this._cache.set(key, room);
    }
    // показываем нужную комнату, прочие прячем
    this.group.children.forEach(c => { c.visible = false; });
    if (room.parts.parent !== this.group) this.group.add(room.parts);
    room.parts.visible = true;
    this.group.visible = true;

    this.current = { def, room };
    this._ensureSeller(room, def);
    return {
      spawn: { x: BASE.x + room.spawn.x, z: BASE.z + room.spawn.z, rot: room.spawn.rot }
    };
  }

  _ensureSeller(room, def) {
    if (!room.seller) { if (this.seller) this.seller.root.visible = false; return; }
    if (!this.seller) {
      const look = Humanoid.randomLook(() => this._rng());
      this.seller = new Humanoid(look);
      this.group.add(this.seller.root);
    }
    this.seller.root.visible = true;
    this.seller.root.position.set(room.seller.x, 0, room.seller.z);
    this.seller.root.rotation.y = room.seller.rot;
    this.sellerName = def.shopKind === 'guns' ? 'Оружейник Марк' : 'Кассир Лена';
  }

  exit() {
    if (!this.current) return null;
    const { def, room } = this.current;
    this.group.visible = false;
    if (this.seller) this.seller.root.visible = false;
    this.current = null;
    return { poi: def.poi, exitAt: room.exitAt };
  }

  /** Стены и мебель как препятствия — тот же интерфейс, что у города. */
  collidersNear(x, z, r) {
    if (!this.current) return [];
    const out = [];
    const lx = x - BASE.x, lz = z - BASE.z;
    for (const c of this.current.room.colliders) {
      if (Math.abs(c.x - lx) < c.w / 2 + r + 1 && Math.abs(c.z - lz) < c.d / 2 + r + 1) {
        out.push({
          minX: BASE.x + c.x - c.w / 2, maxX: BASE.x + c.x + c.w / 2,
          minZ: BASE.z + c.z - c.d / 2, maxZ: BASE.z + c.z + c.d / 2,
          h: WALL_H
        });
      }
    }
    return out;
  }

  /** Ближайшее действие к игроку (в мировых координатах). */
  nearestAction(x, z) {
    if (!this.current) return null;
    const lx = x - BASE.x, lz = z - BASE.z;
    let best = null, bd = 1e9;
    for (const a of this.current.room.actions) {
      const d = Math.hypot(a.x - lx, a.z - lz);
      if (d < a.r && d < bd) { bd = d; best = a; }
    }
    // выход
    const ex = this.current.room.exitAt;
    const de = Math.hypot(ex.x - lx, ex.z - lz);
    if (de < 2.0 && de < bd) return { kind: 'leave', label: 'Выйти на улицу' };
    return best;
  }

  update(dt) {
    if (!this.current) return;
    if (this.seller && this.seller.root.visible) this.seller.update(dt, 'idle', 0);
  }

  dispose() {
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.scene.remove(this.group);
    this._cache.clear();
    this.current = null;
  }
}

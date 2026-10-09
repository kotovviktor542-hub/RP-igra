/* weaponmodels.js — 3D-модели оружия из множества деталей.
   Никаких «кубиков вместо ствола»: у каждого ствола есть рамка, затвор, ствол,
   рукоять, магазин, прицельные, а у длинных — приклад, цевьё и крепления.
   Все модели лежат в локальных осях: +X — направление выстрела, +Y — вверх. */

import * as THREE from '../../vendor/three.module.js';

const CACHE = {};
function mat(key, params) {
  if (!CACHE[key]) CACHE[key] = new THREE.MeshStandardMaterial(params);
  return CACHE[key];
}
const steel    = () => mat('w_steel',   { color: 0x2b2f35, metalness: 0.9,  roughness: 0.3 });
const blued    = () => mat('w_blued',   { color: 0x17191d, metalness: 0.8,  roughness: 0.42 });
const polymer  = () => mat('w_poly',    { color: 0x1b1e22, metalness: 0.1,  roughness: 0.78 });
const wood     = () => mat('w_wood',    { color: 0x6b4426, metalness: 0.05, roughness: 0.65 });
const brass    = () => mat('w_brass',   { color: 0xb8863b, metalness: 0.95, roughness: 0.3 });
const rubber   = () => mat('w_rubber',  { color: 0x101215, metalness: 0.0,  roughness: 0.95 });
const flashMat = () => mat('w_flash',   { color: 0xffd27a, emissive: 0xffb545, emissiveIntensity: 2 });

function box(w, h, d, x, y, z, m, rz = 0, ry = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.z = rz; o.rotation.y = ry;
  return o;
}
function tube(r1, r2, len, x, y, z, m, axis = 'x', seg = 12) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, len, seg), m);
  o.position.set(x, y, z);
  if (axis === 'x') o.rotation.z = Math.PI / 2;
  if (axis === 'z') o.rotation.x = Math.PI / 2;
  return o;
}

/** Общая мушка + целик + дульная вспышка. */
function sights(g, barrelY, frontX, backX, m) {
  g.add(box(0.008, 0.011, 0.007, frontX, barrelY + 0.022, 0, m));
  g.add(box(0.012, 0.010, 0.026, backX, barrelY + 0.021, 0, m));
}
function addFlash(g, x, y, size = 1) {
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.035 * size, 0.09 * size, 7), flashMat());
  f.name = 'flash';
  f.rotation.z = -Math.PI / 2;
  f.position.set(x, y, 0);
  f.visible = false;
  g.add(f);
  const light = new THREE.PointLight(0xffc266, 0, 9, 2);
  light.name = 'flashLight';
  light.position.set(x + 0.1, y, 0);
  g.add(light);
}

/* ======================= ПИСТОЛЕТ ======================= */
function makePistol() {
  const g = new THREE.Group();
  const s = steel(), p = polymer();
  // затвор с фрезеровками
  g.add(box(0.185, 0.040, 0.030, 0.025, 0.055, 0, s));
  g.add(box(0.050, 0.028, 0.032, -0.045, 0.055, 0, s));
  for (let i = 0; i < 5; i++) g.add(box(0.004, 0.026, 0.033, -0.030 + i * 0.010, 0.055, 0, blued()));
  // рамка и спусковая группа
  g.add(box(0.155, 0.024, 0.026, 0.015, 0.030, 0, p));
  g.add(tube(0.0085, 0.0085, 0.034, 0.120, 0.055, 0, s));
  // рукоять с насечкой
  const grip = box(0.040, 0.105, 0.028, -0.048, -0.028, 0, p, 0.2);
  g.add(grip);
  g.add(box(0.034, 0.016, 0.026, -0.058, -0.082, 0, blued(), 0.2));  // пятка магазина
  // скоба и крючок
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0055, 6, 14, Math.PI * 1.25), p);
  guard.rotation.set(Math.PI / 2, 0, -0.45);
  guard.position.set(-0.004, -0.004, 0);
  g.add(guard);
  g.add(box(0.006, 0.020, 0.006, -0.006, 0.004, 0, s, 0.25));
  sights(g, 0.055, 0.100, -0.050, s);
  addFlash(g, 0.155, 0.055, 1);
  return g;
}

/* ======================= РЕВОЛЬВЕР ======================= */
function makeRevolver() {
  const g = new THREE.Group();
  const s = steel(), w = wood();
  g.add(tube(0.016, 0.016, 0.16, 0.085, 0.055, 0, s));             // ствол
  g.add(box(0.16, 0.016, 0.020, 0.085, 0.034, 0, s));              // подствольная планка
  const cyl = tube(0.030, 0.030, 0.052, -0.005, 0.050, 0, blued(), 'x', 14);
  g.add(cyl);
  for (let i = 0; i < 6; i++) {                                     // каморы
    const a = (i / 6) * Math.PI * 2;
    g.add(tube(0.006, 0.006, 0.054, -0.005, 0.050 + Math.sin(a) * 0.019, Math.cos(a) * 0.019, brass()));
  }
  g.add(box(0.075, 0.048, 0.024, -0.062, 0.048, 0, s));            // рамка
  g.add(box(0.016, 0.018, 0.012, -0.095, 0.072, 0, s, 0.4));       // курок
  const grip = box(0.046, 0.110, 0.030, -0.078, -0.020, 0, w, 0.26);
  g.add(grip);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.005, 6, 14, Math.PI * 1.2), s);
  guard.rotation.set(Math.PI / 2, 0, -0.5);
  guard.position.set(-0.035, -0.006, 0);
  g.add(guard);
  sights(g, 0.055, 0.155, -0.080, s);
  addFlash(g, 0.175, 0.055, 1.25);
  return g;
}

/* ======================= ПП ======================= */
function makeSmg() {
  const g = new THREE.Group();
  const s = steel(), p = polymer();
  g.add(box(0.26, 0.060, 0.044, 0.02, 0.055, 0, p));               // ствольная коробка
  g.add(box(0.10, 0.030, 0.030, 0.19, 0.058, 0, s));               // кожух ствола
  g.add(tube(0.009, 0.009, 0.10, 0.25, 0.058, 0, blued()));
  for (let i = 0; i < 4; i++) g.add(tube(0.004, 0.004, 0.031, 0.17 + i * 0.02, 0.070, 0, blued(), 'y', 6));
  g.add(box(0.036, 0.095, 0.030, -0.03, -0.015, 0, p, 0.12));      // рукоять
  g.add(box(0.030, 0.130, 0.026, 0.055, -0.030, 0, blued(), 0.06));// магазин
  g.add(box(0.045, 0.030, 0.030, 0.145, 0.012, 0, p));             // передняя рукоять
  g.add(box(0.010, 0.022, 0.024, -0.095, 0.060, 0, s));            // затыльник
  const stock = box(0.115, 0.016, 0.022, -0.155, 0.062, 0, s);     // выдвижной приклад
  g.add(stock);
  g.add(box(0.022, 0.055, 0.024, -0.205, 0.045, 0, rubber()));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 12, Math.PI * 1.1), p);
  guard.rotation.set(Math.PI / 2, 0, -0.5);
  guard.position.set(0.0, -0.002, 0);
  g.add(guard);
  // планка Пикатинни
  for (let i = 0; i < 7; i++) g.add(box(0.008, 0.008, 0.028, -0.07 + i * 0.022, 0.090, 0, s));
  sights(g, 0.090, 0.215, -0.060, s);
  addFlash(g, 0.305, 0.058, 1.1);
  return g;
}

/* ======================= ДРОБОВИК ======================= */
function makeShotgun() {
  const g = new THREE.Group();
  const s = steel(), w = wood();
  g.add(tube(0.0155, 0.0155, 0.52, 0.30, 0.062, 0, blued()));      // ствол
  g.add(tube(0.013, 0.013, 0.42, 0.26, 0.034, 0, s));              // подствольный магазин
  g.add(box(0.14, 0.055, 0.042, 0.015, 0.052, 0, s));              // коробка
  g.add(box(0.015, 0.012, 0.030, 0.045, 0.020, 0, brass()));       // окно выброса
  const pump = box(0.13, 0.040, 0.044, 0.17, 0.034, 0, w);         // цевьё-помпа
  pump.name = 'pump';
  g.add(pump);
  for (let i = 0; i < 6; i++) g.add(box(0.004, 0.042, 0.046, 0.12 + i * 0.022, 0.034, 0, blued()));
  g.add(box(0.075, 0.100, 0.034, -0.065, 0.000, 0, w, 0.35));      // шейка приклада
  g.add(box(0.20, 0.070, 0.036, -0.175, -0.012, 0, w, 0.12));      // приклад
  g.add(box(0.022, 0.085, 0.036, -0.280, -0.025, 0, rubber(), 0.12));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.005, 6, 12, Math.PI * 1.1), s);
  guard.rotation.set(Math.PI / 2, 0, -0.5);
  guard.position.set(-0.025, 0.006, 0);
  g.add(guard);
  g.add(box(0.010, 0.012, 0.008, 0.545, 0.082, 0, s));             // мушка
  addFlash(g, 0.58, 0.062, 1.6);
  return g;
}

/* ======================= АВТОМАТ ======================= */
function makeRifle() {
  const g = new THREE.Group();
  const s = steel(), p = polymer();
  g.add(box(0.22, 0.062, 0.040, 0.02, 0.060, 0, p));               // ствольная коробка
  g.add(box(0.19, 0.046, 0.040, 0.215, 0.062, 0, p));              // цевьё
  for (let i = 0; i < 6; i++) g.add(box(0.006, 0.048, 0.042, 0.14 + i * 0.03, 0.062, 0, blued()));
  g.add(tube(0.0085, 0.0085, 0.22, 0.40, 0.062, 0, blued()));      // ствол
  g.add(tube(0.016, 0.013, 0.05, 0.50, 0.062, 0, s));              // пламегаситель
  g.add(tube(0.011, 0.011, 0.14, 0.26, 0.088, 0, s));              // газовая трубка
  g.add(box(0.038, 0.100, 0.030, -0.05, -0.012, 0, p, 0.14));      // пистолетная рукоять
  const magz = box(0.040, 0.155, 0.030, 0.045, -0.040, 0, polymer(), 0.10); // изогнутый магазин
  g.add(magz);
  g.add(box(0.030, 0.030, 0.028, 0.045, -0.118, 0, blued(), 0.10));
  g.add(box(0.075, 0.040, 0.030, -0.125, 0.062, 0, p));            // труба приклада
  g.add(box(0.105, 0.075, 0.034, -0.205, 0.052, 0, p, 0.04));      // приклад
  g.add(box(0.020, 0.085, 0.034, -0.262, 0.046, 0, rubber()));
  // планка + коллиматор
  for (let i = 0; i < 9; i++) g.add(box(0.008, 0.008, 0.030, -0.08 + i * 0.022, 0.095, 0, s));
  g.add(box(0.055, 0.045, 0.036, 0.015, 0.120, 0, s));
  g.add(tube(0.016, 0.016, 0.050, 0.015, 0.120, 0, blued()));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.005, 6, 12, Math.PI * 1.1), p);
  guard.rotation.set(Math.PI / 2, 0, -0.5);
  guard.position.set(-0.018, 0.004, 0);
  g.add(guard);
  addFlash(g, 0.545, 0.062, 1.35);
  return g;
}

const BUILDERS = { pistol: makePistol, revolver: makeRevolver, smg: makeSmg, shotgun: makeShotgun, rifle: makeRifle };

/** Точка для левой руки (цевьё) у двуручных стволов, в локальных осях модели. */
export const FOREGRIP = {
  smg:     { x: 0.145, y: 0.015 },
  shotgun: { x: 0.175, y: 0.034 },
  rifle:   { x: 0.235, y: 0.045 }
};

/**
 * @param {string} kind pistol|revolver|smg|shotgun|rifle
 * @returns {THREE.Group|null}
 */
export function makeWeaponMesh(kind) {
  const b = BUILDERS[kind];
  if (!b) return null;
  const g = b();
  g.name = 'weapon_' + kind;
  g.traverse(o => { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; });
  return g;
}

export const WEAPON_MESH_KINDS = Object.keys(BUILDERS);

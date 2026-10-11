/* vehicle.js — модели транспорта и аркадная физика вождения. */

import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { clamp, resolveCircleBoxes, angleDiff } from '../core/utils.js';

const matCache = new Map();
function M(key, params) {
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial(params));
  return matCache.get(key);
}
const paint = c => M('paint' + c, { color: c, roughness: 0.28, metalness: 0.55 });
const glassM = () => M('vglass', { color: 0x1c2a36, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.68 });
const tyreM = () => M('tyre', { color: 0x16181b, roughness: 0.95 });
const rimM = () => M('rim', { color: 0xc5cad0, roughness: 0.3, metalness: 0.9 });
const chromeM = () => M('chrome', { color: 0xd8dde2, roughness: 0.18, metalness: 0.95 });
const darkM = () => M('vdark', { color: 0x1f2328, roughness: 0.7, metalness: 0.3 });
const lightM = () => M('vlight', { color: 0xfff4d8, emissive: 0xfff0c8, emissiveIntensity: 0.0, roughness: 0.2 });
const brakeM = () => M('vbrake', { color: 0x8a1518, emissive: 0xff2020, emissiveIntensity: 0.0, roughness: 0.3 });
const plateM = () => M('plate', { color: 0xe8e8e0, roughness: 0.6 });

/* ======================= КАТАЛОГ ======================= */
export const VEHICLES = {
  sedan:   { name: 'Седан',       L: 4.55, W: 1.82, H: 1.42, maxSpeed: 44, accel: 9.5,  mass: 1, price: 18000, seats: 4, trunk: 25 },
  hatch:   { name: 'Хэтчбек',     L: 4.05, W: 1.74, H: 1.48, maxSpeed: 38, accel: 9.0,  mass: 0.9, price: 11000, seats: 4, trunk: 20 },
  suv:     { name: 'Внедорожник', L: 4.85, W: 1.95, H: 1.82, maxSpeed: 42, accel: 8.6,  mass: 1.3, price: 32000, seats: 5, trunk: 45 },
  sports:  { name: 'Спорткар',    L: 4.42, W: 1.92, H: 1.22, maxSpeed: 68, accel: 17.0, mass: 0.85, price: 125000, seats: 2, trunk: 10 },
  pickup:  { name: 'Пикап',       L: 5.3,  W: 1.98, H: 1.82, maxSpeed: 38, accel: 7.8,  mass: 1.4, price: 27000, seats: 2, trunk: 70 },
  van:     { name: 'Фургон',      L: 5.4,  W: 2.0,  H: 2.35, maxSpeed: 34, accel: 6.5,  mass: 1.6, price: 24000, seats: 2, trunk: 120 },
  taxi:    { name: 'Такси',       L: 4.6,  W: 1.84, H: 1.46, maxSpeed: 42, accel: 9.2,  mass: 1, price: 0, seats: 4, trunk: 25 },
  police:  { name: 'Полиция',     L: 4.8,  W: 1.9,  H: 1.5,  maxSpeed: 52, accel: 12.5, mass: 1.1, price: 0, seats: 4, trunk: 25 },
  truck:   { name: 'Грузовик',    L: 7.6,  W: 2.35, H: 3.0,  maxSpeed: 28, accel: 4.6,  mass: 2.6, price: 58000, seats: 2, trunk: 300 },
  bus:     { name: 'Автобус',     L: 10.5, W: 2.5,  H: 3.1,  maxSpeed: 26, accel: 3.8,  mass: 3.2, price: 0, seats: 20, trunk: 80 }
};

export const CAR_COLORS = [
  0xb02a2a, 0x1f4f8f, 0x2b2b30, 0xe4e4e0, 0x6b7076, 0x1f6b4a,
  0xd8a520, 0x7a3f8f, 0x2a8f9f, 0xc45a1a, 0x8a8f96, 0xf0f0ea
];

/* ======================= ПОСТРОЕНИЕ МОДЕЛИ ======================= */

function wheel(radius, width) {
  const t = new THREE.CylinderGeometry(radius, radius, width, 14);
  t.rotateZ(Math.PI / 2);
  const rim = new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, width + 0.012, 10);
  rim.rotateZ(Math.PI / 2);
  const spokes = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.BoxGeometry(width * 0.9, radius * 0.95, 0.045);
    s.rotateX(0);
    s.rotateZ(0);
    const q = new THREE.Matrix4().makeRotationX((i / 5) * Math.PI);
    s.applyMatrix4(q);
    spokes.push(s);
  }
  return { tyre: t, rim: mergeGeometries([rim, ...spokes]) };
}

/**
 * Строит визуальную модель транспорта.
 * @param {boolean} simple — упрощённый вариант для припаркованных машин:
 *   колёса слиты в две меши вместо восьми (экономит ~6 draw calls на машину).
 * @returns {THREE.Group} с userData.wheels = [меши колёс]
 */
export function buildVehicleMesh(type, color, simple = false) {
  const spec = VEHICLES[type] || VEHICLES.sedan;
  const g = new THREE.Group();
  const L = spec.L, W = spec.W, H = spec.H;
  const bodyCol = type === 'taxi' ? 0xf0c020 : (type === 'police' ? 0xf0f0f0 : color);

  const parts = { body: [], glass: [], dark: [], chrome: [], light: [], brake: [], plate: [] };
  const P = (k, geo) => parts[k].push(geo);

  const isTall = type === 'van' || type === 'truck' || type === 'bus';
  const wheelR = isTall ? 0.46 : (type === 'suv' || type === 'pickup' ? 0.40 : 0.33);
  const groundY = wheelR;

  if (type === 'bus' || type === 'truck') {
    /* --- кабина/кузов крупного транспорта --- */
    const cabL = type === 'bus' ? L : 2.4;
    const bodyH = H - groundY - 0.1;

    if (type === 'bus') {
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
    const bodyH = (type === 'sports' ? 0.52 : 0.62);
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
    const hoodL = type === 'van' ? 0.9 : L * 0.27;
    const hood = new THREE.BoxGeometry(W * 0.97, 0.2, hoodL);
    hood.translate(0, sillY + bodyH + 0.08, L / 2 - hoodL / 2 - 0.05);
    P('body', hood);

    // багажник
    const trunkL = type === 'hatch' ? L * 0.1 : L * 0.2;
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
    const wsAngle = type === 'sports' ? 0.75 : 0.55;
    const ws = new THREE.BoxGeometry(W * 0.84, cabH * 1.12, 0.07);
    ws.rotateX(-wsAngle);
    ws.translate(0, sillY + bodyH + cabH * 0.52, cabZ + cabL * 0.44);
    P('glass', ws);

    const rw = new THREE.BoxGeometry(W * 0.8, cabH * 1.05, 0.07);
    rw.rotateX(type === 'hatch' ? 0.75 : 0.5);
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

    // фары
    [-1, 1].forEach(s => {
      const hl = new THREE.BoxGeometry(W * 0.2, 0.13, 0.08);
      hl.translate(s * W * 0.33, sillY + bodyH * 0.68, L / 2 + 0.045);
      P('light', hl);
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
    if (type === 'sports') {
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
    if (type === 'pickup') {
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
    body: paint(bodyCol), glass: glassM(), dark: darkM(),
    chrome: chromeM(), light: lightM(), brake: brakeM(), plate: plateM()
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
  const ww = wheel(wheelR, isTall ? 0.3 : 0.24);
  const wheelGroup = [];
  const wheelbase = L * 0.58;
  const track = W / 2 - (isTall ? 0.1 : 0.06);
  const positions = [
    [-track, wheelR, wheelbase / 2], [track, wheelR, wheelbase / 2],
    [-track, wheelR, -wheelbase / 2], [track, wheelR, -wheelbase / 2]
  ];
  if (type === 'truck' || type === 'bus') {
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
  constructor(type, color, x = 0, z = 0, rot = 0, simple = false) {
    this.type = type;
    this.spec = VEHICLES[type] || VEHICLES.sedan;
    this.color = color;
    this.simple = simple;
    this.mesh = buildVehicleMesh(type, color, simple);
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

    // ---------- сцепление ----------
    const grip = clamp(gripMul * (0.55 + health * 0.45), 0.25, 1.15);

    // ---------- продольная динамика ----------
    const maxSp = sp.maxSpeed * (0.6 + health * 0.4);
    let acc = 0;
    if (this.engineOn && hasFuel) {
      if (i.throttle > 0) {
        const falloff = 1 - clamp(this.speed / maxSp, 0, 1);
        acc = sp.accel * i.throttle * (0.3 + falloff * 0.7) * powerMul;
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

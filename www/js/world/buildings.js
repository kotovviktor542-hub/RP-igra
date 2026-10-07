/* buildings.js — генератор зданий. Никаких голых кубов:
   цоколь, фасад с окнами, межэтажные пояса, карниз, парапет, крыша с оборудованием,
   витрины на первом этаже, балконы, отступы у башен, входные группы. */

import * as THREE from '../../vendor/three.module.js';
import { boxAt, scaleBoxUV } from '../core/utils.js';

export const FLOOR_H = 3.4;

/**
 * Генерирует геометрию здания, разложенную по ключам материалов.
 * @returns {Object} { facadeN: [geo...], roof: [...], concrete: [...], shopN: [...], glass: [...], trim: [...] }
 */
export function makeBuilding(opts) {
  const {
    rng, w, d, floors, x, z, rotY = 0,
    style = 'office',          // office | residential | brick | panel | lowrise
    facadeKey = 'f0',
    shopKey = null,            // витрина на 1 этаже
    balconies = false,
    setbacks = false
  } = opts;

  const out = {};
  const push = (k, g) => { (out[k] || (out[k] = [])).push(g); };

  const h = floors * FLOOR_H;
  const hasShop = !!shopKey && floors >= 2;
  const shopH = hasShop ? FLOOR_H * 1.35 : 0;
  const bodyY0 = shopH;
  const bodyH = h - shopH;

  /* ---------- цоколь ---------- */
  const plinthH = hasShop ? 0.35 : 0.8;
  push('concrete', boxAt(w + 0.55, plinthH, d + 0.55, 0, plinthH / 2, 0, 3));

  /* ---------- первый этаж: витрина или стена ---------- */
  if (hasShop) {
    push(shopKey, boxAt(w + 0.1, shopH, d + 0.1, 0, plinthH + shopH / 2, 0, 0));
    // козырёк над витриной
    push('trim', boxAt(w + 1.2, 0.3, d + 1.2, 0, plinthH + shopH + 0.1, 0, 3));
  }

  /* ---------- основной объём (с отступами у высоток) ---------- */
  let curW = w, curD = d, curY = bodyY0 + plinthH;
  const segments = setbacks && floors > 14 ? 3 : (setbacks && floors > 8 ? 2 : 1);
  const perSeg = bodyH / segments;

  for (let s = 0; s < segments; s++) {
    const g = boxAt(curW, perSeg, curD, 0, curY + perSeg / 2, 0, 0);
    // UV фасада: по 1 тайлу на этаж по высоте, ~1 тайл на 6 м по ширине
    scaleBoxUV(g, curW / 6, perSeg / FLOOR_H / 4, curD / 6, 1);
    push(facadeKey, g);

    // межэтажный пояс / карниз сегмента
    push('trim', boxAt(curW + 0.45, 0.32, curD + 0.45, 0, curY + perSeg - 0.1, 0, 3));

    // балконы (жилые дома)
    if (balconies && style === 'residential') {
      const nb = Math.max(2, Math.floor(curW / 4.2));
      const fl = Math.floor(perSeg / FLOOR_H);
      for (let f = 1; f < fl; f++) {
        if (!rng.chance(0.62)) continue;
        for (let b = 0; b < nb; b++) {
          if (!rng.chance(0.55)) continue;
          const bx = -curW / 2 + (b + 0.5) * (curW / nb);
          const by = curY + f * FLOOR_H + 0.55;
          const side = rng.chance(0.5) ? 1 : -1;
          // плита
          push('concrete', boxAt(curW / nb - 0.5, 0.18, 1.25, bx, by, side * (curD / 2 + 0.62), 3));
          // ограждение
          push('trim', boxAt(curW / nb - 0.5, 0.95, 0.09, bx, by + 0.55, side * (curD / 2 + 1.2), 2));
          push('trim', boxAt(0.09, 0.95, 1.25, bx - (curW / nb - 0.5) / 2, by + 0.55, side * (curD / 2 + 0.62), 2));
          push('trim', boxAt(0.09, 0.95, 1.25, bx + (curW / nb - 0.5) / 2, by + 0.55, side * (curD / 2 + 0.62), 2));
        }
      }
    }

    curY += perSeg;
    curW *= 0.78;
    curD *= 0.78;
  }

  const topY = curY;
  const topW = curW, topD = curD;

  /* ---------- парапет и крыша ---------- */
  push('roof', boxAt(topW - 0.2, 0.25, topD - 0.2, 0, topY + 0.12, 0, 3));
  const par = 0.95;
  push('concrete', boxAt(topW + 0.3, par, 0.4, 0, topY + par / 2, topD / 2, 3));
  push('concrete', boxAt(topW + 0.3, par, 0.4, 0, topY + par / 2, -topD / 2, 3));
  push('concrete', boxAt(0.4, par, topD + 0.3, topW / 2, topY + par / 2, 0, 3));
  push('concrete', boxAt(0.4, par, topD + 0.3, -topW / 2, topY + par / 2, 0, 3));

  /* ---------- оборудование на крыше ---------- */
  const units = rng.int(1, 4);
  for (let i = 0; i < units; i++) {
    const uw = rng.range(1.2, 3.0), ud = rng.range(1.2, 2.6), uh = rng.range(0.8, 1.9);
    const ux = rng.range(-topW / 2 + uw, topW / 2 - uw);
    const uz = rng.range(-topD / 2 + ud, topD / 2 - ud);
    push('metal', boxAt(uw, uh, ud, ux, topY + uh / 2 + 0.2, uz, 2));
    // решётка вентиляции
    push('trim', boxAt(uw * 0.75, 0.12, ud * 0.75, ux, topY + uh + 0.26, uz, 1));
  }
  // лестничная будка
  if (floors > 4) {
    const sw = Math.min(3.4, topW * 0.35), sd = Math.min(3.0, topD * 0.35);
    push('concrete', boxAt(sw, 2.6, sd, topW * 0.2, topY + 1.5, -topD * 0.2, 3));
    push('roof', boxAt(sw + 0.2, 0.18, sd + 0.2, topW * 0.2, topY + 2.85, -topD * 0.2, 3));
  }
  // антенна на высотках
  if (floors > 16) {
    const mast = new THREE.CylinderGeometry(0.09, 0.13, 7, 5);
    mast.translate(0, topY + 3.5, 0);
    push('metal', mast);
    push('metal', boxAt(1.0, 0.1, 1.0, 0, topY + 5.2, 0, 1));
  }

  /* ---------- входная группа (если нет витрины) ---------- */
  if (!hasShop) {
    const doorW = Math.min(2.6, w * 0.3);
    push('glass', boxAt(doorW, 2.5, 0.16, 0, plinthH + 1.25, d / 2 + 0.1, 0));
    push('trim', boxAt(doorW + 0.5, 0.25, 1.5, 0, plinthH + 2.75, d / 2 + 0.6, 2));
    push('concrete', boxAt(doorW + 1.6, 0.18, 1.6, 0, 0.09, d / 2 + 0.75, 3));
    // ступени
    push('concrete', boxAt(doorW + 2.0, 0.16, 0.5, 0, 0.08, d / 2 + 1.6, 3));
  }

  /* ---------- кондиционеры на фасаде (жилые) ---------- */
  if (style === 'residential' || style === 'panel') {
    const n = rng.int(2, 7);
    for (let i = 0; i < n; i++) {
      const side = rng.chance(0.5) ? 1 : -1;
      const ax = rng.range(-w / 2 + 1, w / 2 - 1);
      const ay = plinthH + shopH + rng.range(1.5, Math.max(2, bodyH - 2));
      push('metal', boxAt(0.85, 0.6, 0.35, ax, ay, side * (d / 2 + 0.2), 1));
    }
  }

  /* ---------- трансформ всего здания ---------- */
  for (const k in out) {
    for (const g of out[k]) {
      if (rotY) g.rotateY(rotY);
      g.translate(x, 0, z);
    }
  }

  return { parts: out, height: topY + 1.5, w, d, x, z, rotY };
}

/* ======================= ЧАСТНЫЙ ДОМ ======================= */
export function makeHouse(opts) {
  const { rng, x, z, rotY = 0, w = 9, d = 8, facadeKey = 'f0' } = opts;
  const out = {};
  const push = (k, g) => { (out[k] || (out[k] = [])).push(g); };

  const floors = rng.chance(0.4) ? 2 : 1;
  const h = floors * 3.0;

  push('concrete', boxAt(w + 0.4, 0.5, d + 0.4, 0, 0.25, 0, 3));
  const body = boxAt(w, h, d, 0, 0.5 + h / 2, 0, 0);
  scaleBoxUV(body, w / 5, floors / 3, d / 5, 1);
  push(facadeKey, body);

  // двускатная крыша
  const roofH = rng.range(1.8, 3.0);
  const roofGeo = new THREE.CylinderGeometry(0, 1, 1, 4, 1);
  // вместо конуса — призма: делаем вручную
  const prism = makePrismRoof(w + 1.0, roofH, d + 1.0);
  prism.translate(0, 0.5 + h, 0);
  push('roofTile', prism);
  roofGeo.dispose();

  // труба
  push('brickTrim', boxAt(0.7, 1.4, 0.7, w * 0.25, 0.5 + h + roofH * 0.5, d * 0.2, 1));

  // крыльцо
  push('concrete', boxAt(2.4, 0.22, 1.5, 0, 0.6, d / 2 + 0.75, 3));
  push('glass', boxAt(1.1, 2.1, 0.14, 0, 1.55, d / 2 + 0.08, 0));
  push('trim', boxAt(2.8, 0.18, 1.8, 0, 2.9, d / 2 + 0.8, 2));
  push('trim', boxAt(0.14, 2.3, 0.14, -1.2, 1.75, d / 2 + 1.5, 1));
  push('trim', boxAt(0.14, 2.3, 0.14, 1.2, 1.75, d / 2 + 1.5, 1));

  for (const k in out) for (const g of out[k]) { if (rotY) g.rotateY(rotY); g.translate(x, 0, z); }
  return { parts: out, height: 0.5 + h + roofH, w, d, x, z, rotY };
}

/** Призматическая (двускатная) крыша. */
function makePrismRoof(w, h, d) {
  const hw = w / 2, hd = d / 2;
  const verts = new Float32Array([
    // скат +z
    -hw, 0, hd,   hw, 0, hd,   hw, h, 0,
    -hw, 0, hd,   hw, h, 0,   -hw, h, 0,
    // скат -z
    hw, 0, -hd,  -hw, 0, -hd,  -hw, h, 0,
    hw, 0, -hd,  -hw, h, 0,    hw, h, 0,
    // торец +x
    hw, 0, hd,    hw, 0, -hd,   hw, h, 0,
    // торец -x
    -hw, 0, -hd, -hw, 0, hd,   -hw, h, 0
  ]);
  const uvs = [];
  for (let i = 0; i < verts.length / 3; i++) {
    uvs.push(verts[i * 3] / 2, verts[i * 3 + 2] / 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

/* ======================= ГАРАЖ ======================= */
export function makeGarage(opts) {
  const { x, z, rotY = 0, w = 6.2, d = 6.4 } = opts;
  const out = {};
  const push = (k, g) => { (out[k] || (out[k] = [])).push(g); };
  const h = 3.0;

  push('concrete', boxAt(w, h, d, 0, h / 2, 0, 3));
  push('roof', boxAt(w + 0.35, 0.3, d + 0.35, 0, h + 0.15, 0, 3));
  // ворота
  push('garageDoor', boxAt(w * 0.78, h * 0.78, 0.18, 0, h * 0.39, d / 2 + 0.06, 0));
  push('trim', boxAt(w * 0.86, 0.2, 0.3, 0, h * 0.78 + 0.12, d / 2 + 0.1, 2));
  // отмостка
  push('concrete', boxAt(w + 1.0, 0.1, 3.0, 0, 0.05, d / 2 + 1.5, 3));

  for (const k in out) for (const g of out[k]) { if (rotY) g.rotateY(rotY); g.translate(x, 0, z); }
  return { parts: out, height: h + 0.3, w, d, x, z, rotY };
}

/* ======================= СКЛАД / ПРОМКА ======================= */
export function makeWarehouse(opts) {
  const { rng, x, z, rotY = 0, w = 30, d = 20 } = opts;
  const out = {};
  const push = (k, g) => { (out[k] || (out[k] = [])).push(g); };
  const h = rng.range(7, 11);

  push('corrugated', boxAt(w, h, d, 0, h / 2, 0, 0));
  push('roof', boxAt(w + 0.8, 0.4, d + 0.8, 0, h + 0.2, 0, 4));
  push('concrete', boxAt(w + 0.6, 1.2, d + 0.6, 0, 0.6, 0, 3));

  // ворота дока
  const gates = rng.int(2, 4);
  for (let i = 0; i < gates; i++) {
    const gx = -w / 2 + (i + 0.5) * (w / gates);
    push('garageDoor', boxAt(4.2, 4.4, 0.2, gx, 2.4, d / 2 + 0.08, 0));
    push('concrete', boxAt(5.0, 1.1, 2.4, gx, 0.55, d / 2 + 1.3, 3)); // рампа
  }
  // световые фонари на крыше
  for (let i = 0; i < 4; i++) {
    push('glass', boxAt(w * 0.6, 0.35, 1.4, 0, h + 0.5, -d / 2 + (i + 1) * (d / 5), 0));
  }

  for (const k in out) for (const g of out[k]) { if (rotY) g.rotateY(rotY); g.translate(x, 0, z); }
  return { parts: out, height: h + 0.7, w, d, x, z, rotY };
}

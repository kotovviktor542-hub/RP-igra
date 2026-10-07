/* utils.js — мелочи: детерминированный ГПСЧ, математика, пространственная сетка. */

import * as THREE from '../../vendor/three.module.js';

/** Детерминированный ГПСЧ (mulberry32) — один и тот же город у всех игроков. */
export function makeRNG(seed) {
  let a = seed >>> 0;
  const r = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + r() * (hi - lo);
  r.int = (lo, hi) => Math.floor(lo + r() * (hi - lo + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length) % arr.length];
  r.chance = p => r() < p;
  return r;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Переписывает UV у BoxGeometry так, чтобы текстура тайлилась по реальным метрам. */
export function scaleBoxUV(geo, w, h, d, tile = 4) {
  const uv = geo.attributes.uv;
  const sets = [
    [d / tile, h / tile], [d / tile, h / tile],  // +x, -x
    [w / tile, d / tile], [w / tile, d / tile],  // +y, -y
    [w / tile, h / tile], [w / tile, h / tile]   // +z, -z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = sets[f];
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/** Коробка с заданными UV и трансформом, готовая к мерджу. */
export function boxAt(w, h, d, x, y, z, tile = 4, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile > 0) scaleBoxUV(g, w, h, d, tile);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** Пространственная хеш-сетка для быстрых запросов коллизий/соседей. */
export class SpatialGrid {
  constructor(cell = 24) {
    this.cell = cell;
    this.map = new Map();
  }
  _key(x, z) {
    return ((x / this.cell) | 0) * 73856093 ^ ((z / this.cell) | 0) * 19349663;
  }
  insert(obj, x, z) {
    const k = this._key(x, z);
    let arr = this.map.get(k);
    if (!arr) { arr = []; this.map.set(k, arr); }
    arr.push(obj);
  }
  insertBox(obj, minX, minZ, maxX, maxZ) {
    const c = this.cell;
    for (let x = Math.floor(minX / c); x <= Math.floor(maxX / c); x++) {
      for (let z = Math.floor(minZ / c); z <= Math.floor(maxZ / c); z++) {
        const k = (x * 73856093) ^ (z * 19349663);
        let arr = this.map.get(k);
        if (!arr) { arr = []; this.map.set(k, arr); }
        if (!arr.includes(obj)) arr.push(obj);
      }
    }
  }
  query(x, z, radius = 0) {
    const c = this.cell;
    const out = [];
    const seen = new Set();
    for (let ix = Math.floor((x - radius) / c); ix <= Math.floor((x + radius) / c); ix++) {
      for (let iz = Math.floor((z - radius) / c); iz <= Math.floor((z + radius) / c); iz++) {
        const arr = this.map.get((ix * 73856093) ^ (iz * 19349663));
        if (!arr) continue;
        for (const o of arr) if (!seen.has(o)) { seen.add(o); out.push(o); }
      }
    }
    return out;
  }
  clear() { this.map.clear(); }
}

/** Разрешение столкновения круга (игрок/машина) с осевыми прямоугольниками. */
export function resolveCircleBoxes(px, pz, radius, boxes) {
  let x = px, z = pz, hit = false, nx = 0, nz = 0;
  for (const b of boxes) {
    const cx = clamp(x, b.minX, b.maxX);
    const cz = clamp(z, b.minZ, b.maxZ);
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = radius - d;
        x += (dx / d) * push;
        z += (dz / d) * push;
        nx += dx / d; nz += dz / d;
      } else {
        // центр внутри — выталкиваем по ближайшей грани
        const dl = x - b.minX, dr = b.maxX - x, dt = z - b.minZ, db = b.maxZ - z;
        const m = Math.min(dl, dr, dt, db);
        if (m === dl) { x = b.minX - radius; nx -= 1; }
        else if (m === dr) { x = b.maxX + radius; nx += 1; }
        else if (m === dt) { z = b.minZ - radius; nz -= 1; }
        else { z = b.maxZ + radius; nz += 1; }
      }
    }
  }
  return { x, z, hit, nx, nz };
}

export function fmtMoney(v) {
  const neg = v < 0;
  const s = Math.abs(Math.round(v)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (neg ? '-' : '') + s + ' $';
}

export function dist2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

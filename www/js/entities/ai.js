/* ai.js — живой город: трафик (машины с ИИ) и пешеходы.
   Всё пулится и стримится вокруг игрока, чтобы не убивать телефон. */

import * as THREE from '../../vendor/three.module.js';
import { Vehicle, VEHICLES, CAR_COLORS } from './vehicle.js';
import { Humanoid } from './humanoid.js';
import { makeRNG, clamp, angleDiff, dist2D } from '../core/utils.js';
import { GRID, CELL, ROAD, roadX } from '../world/city.js';

const LANE = 4.4;

/* ======================= ТРАФИК ======================= */
export class Traffic {
  constructor(scene, city, maxCars = 18) {
    this.scene = scene;
    this.city = city;
    this.max = maxCars;
    this.cars = [];
    this.rng = makeRNG(777);
    this.types = ['sedan', 'hatch', 'suv', 'pickup', 'van', 'taxi', 'sports', 'truck', 'bus'];
    this.weights = [26, 20, 14, 8, 8, 10, 4, 6, 4];
  }

  _pickType() {
    const total = this.weights.reduce((a, b) => a + b, 0);
    let r = this.rng() * total;
    for (let i = 0; i < this.types.length; i++) {
      r -= this.weights[i];
      if (r <= 0) return this.types[i];
    }
    return 'sedan';
  }

  setMax(n) { this.max = n; }

  _spawn(px, pz) {
    // выбираем узел на кольце 90-180 м от игрока
    const nodes = this.city.roadNodes;
    let node = null;
    for (let t = 0; t < 30; t++) {
      const n = nodes[this.rng.int(0, nodes.length - 1)];
      const d = dist2D(n.x, n.z, px, pz);
      if (d > 85 && d < 190) { node = n; break; }
    }
    if (!node) return;

    const nextId = node.links[this.rng.int(0, node.links.length - 1)];
    const next = this.city.roadNodes[nextId];
    if (!next) return;

    const type = this._pickType();
    const col = CAR_COLORS[this.rng.int(0, CAR_COLORS.length - 1)];
    const v = new Vehicle(type, col, node.x, node.z, 0);
    v.engineOn = true;
    v.lightsOn = false;

    const car = {
      v, node, next,
      targetSpeed: VEHICLES[type].maxSpeed * this.rng.range(0.32, 0.55),
      wait: 0,
      honk: 0
    };
    this._placeOnLane(car);
    this.scene.add(v.mesh);
    this.cars.push(car);
  }

  _placeOnLane(car) {
    const { node, next, v } = car;
    const fx = next.x - node.x, fz = next.z - node.z;
    const len = Math.hypot(fx, fz) || 1;
    const dx = fx / len, dz = fz / len;
    const rx = -dz, rz = dx;                       // правая сторона
    v.pos.x = node.x + rx * LANE;
    v.pos.z = node.z + rz * LANE;
    v.heading = Math.atan2(-dx, -dz);
    v.mesh.position.set(v.pos.x, 0, v.pos.z);
    v.mesh.rotation.y = v.heading;
  }

  _despawn(i) {
    const c = this.cars[i];
    this.scene.remove(c.v.mesh);
    c.v.dispose();
    this.cars.splice(i, 1);
  }

  update(dt, px, pz, playerVehicle, nightAmount) {
    // стриминг
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const c = this.cars[i];
      if (dist2D(c.v.pos.x, c.v.pos.z, px, pz) > 260) this._despawn(i);
    }
    let guard = 0;
    while (this.cars.length < this.max && guard++ < 3) this._spawn(px, pz);

    const lightsOn = nightAmount > 0.35;

    for (const c of this.cars) {
      const v = c.v;
      v.lightsOn = lightsOn;

      // целевая точка — следующий узел со смещением в полосу
      const fx = c.next.x - c.node.x, fz = c.next.z - c.node.z;
      const len = Math.hypot(fx, fz) || 1;
      const dx = fx / len, dz = fz / len;
      const rx = -dz, rz = dx;
      const tx = c.next.x + rx * LANE;
      const tz = c.next.z + rz * LANE;

      const toX = tx - v.pos.x, toZ = tz - v.pos.z;
      const distToTarget = Math.hypot(toX, toZ);

      // достигли — выбираем следующий сегмент (без разворота назад)
      if (distToTarget < 7.5) {
        const prev = c.node;
        c.node = c.next;
        const opts = c.node.links.filter(id => id !== prev.id);
        const pick = opts.length ? opts[this.rng.int(0, opts.length - 1)] : c.node.links[0];
        c.next = this.city.roadNodes[pick];
        continue;
      }

      // рулёжка
      const desired = Math.atan2(-toX, -toZ);
      const diff = angleDiff(v.heading, desired);
      const steer = clamp(diff * 1.5, -1, 1);

      // препятствия впереди
      let blocked = 0;
      const ahead = 7 + Math.abs(v.speed) * 0.85;
      const hx = v.pos.x - Math.sin(v.heading) * ahead;
      const hz = v.pos.z - Math.cos(v.heading) * ahead;

      for (const o of this.cars) {
        if (o === c) continue;
        if (dist2D(o.v.pos.x, o.v.pos.z, hx, hz) < 3.6) { blocked = 1; break; }
      }
      if (!blocked && playerVehicle && dist2D(playerVehicle.pos.x, playerVehicle.pos.z, hx, hz) < 4.0) blocked = 1;

      // на перекрёстке притормаживаем
      const nearCross = Math.abs(((v.pos.x - roadX(0)) % CELL + CELL) % CELL) < ROAD ||
                        Math.abs(((v.pos.z - roadX(0)) % CELL + CELL) % CELL) < ROAD;

      let target = c.targetSpeed;
      if (nearCross) target *= 0.62;
      if (Math.abs(diff) > 0.5) target *= 0.45;
      if (blocked) target = 0;

      const throttle = v.speed < target - 0.4 ? 1 : 0;
      const brake = v.speed > target + 0.6 ? clamp((v.speed - target) * 0.25, 0, 1) : 0;

      v.update(dt, { throttle, steer, brake }, this.city);

      // застрял — телепорт на полосу
      if (Math.abs(v.speed) < 0.2 && !blocked) {
        c.wait += dt;
        if (c.wait > 5) { this._placeOnLane(c); c.wait = 0; }
      } else c.wait = 0;
    }
  }

  dispose() {
    while (this.cars.length) this._despawn(0);
  }
}

/* ======================= ПЕШЕХОДЫ ======================= */
const NPC_NAMES = [
  'Андрей', 'Марина', 'Олег', 'Света', 'Дима', 'Катя', 'Игорь', 'Лена',
  'Павел', 'Юля', 'Саня', 'Вика', 'Костя', 'Настя', 'Рома', 'Таня',
  'Миша', 'Оля', 'Боря', 'Ира', 'Гена', 'Зоя', '슬ава', 'Ната'
].map(s => s.replace('슬', 'С'));

const NPC_LINES = [
  'Не подскажешь, где тут банкомат?',
  'Опять пробки на центральной...',
  'Слышал, в порту работу дают.',
  'Классная тачка у тебя.',
  'Говорят, цены на жильё опять выросли.',
  'Погода сегодня нормальная.',
  'Осторожнее на дорогах, тут гоняют.',
  'Я тут на районе живу уже лет десять.',
  'В торговом центре скидки, кстати.',
  'Не мешай, я спешу.',
  'Таксисты нынче прилично поднимают.',
  'Видел аварию на перекрёстке?'
];

export class Pedestrians {
  constructor(scene, city, max = 22) {
    this.scene = scene;
    this.city = city;
    this.max = max;
    this.list = [];
    this.rng = makeRNG(31337);
  }

  setMax(n) { this.max = n; }

  _spawn(px, pz) {
    const paths = this.city.pedPaths;
    if (!paths.length) return;
    let path = null;
    for (let t = 0; t < 25; t++) {
      const p = paths[this.rng.int(0, paths.length - 1)];
      const d = dist2D(p[0][0], p[0][1], px, pz);
      if (d > 25 && d < 130) { path = p; break; }
    }
    if (!path) return;

    const look = Humanoid.randomLook(this.rng);
    const h = new Humanoid(look);
    const idx = this.rng.int(0, path.length - 1);
    h.root.position.set(path[idx][0], 0, path[idx][1]);
    this.scene.add(h.root);

    this.list.push({
      h, path, idx,
      next: (idx + 1) % path.length,
      speed: this.rng.range(1.0, 1.7),
      name: NPC_NAMES[this.rng.int(0, NPC_NAMES.length - 1)],
      line: NPC_LINES[this.rng.int(0, NPC_LINES.length - 1)],
      pauseT: 0,
      dir: this.rng.chance(0.5) ? 1 : -1
    });
  }

  _despawn(i) {
    const n = this.list[i];
    this.scene.remove(n.h.root);
    n.h.dispose();
    this.list.splice(i, 1);
  }

  update(dt, px, pz) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (dist2D(this.list[i].h.root.position.x, this.list[i].h.root.position.z, px, pz) > 170) this._despawn(i);
    }
    let guard = 0;
    while (this.list.length < this.max && guard++ < 3) this._spawn(px, pz);

    for (const n of this.list) {
      const p = n.h.root.position;

      if (n.pauseT > 0) {
        n.pauseT -= dt;
        n.h.update(dt, 'idle', 0);
        continue;
      }

      const tgt = n.path[n.next];
      const dx = tgt[0] - p.x, dz = tgt[1] - p.z;
      const d = Math.hypot(dx, dz);

      if (d < 1.2) {
        n.idx = n.next;
        n.next = (n.next + n.dir + n.path.length) % n.path.length;
        if (this.rng.chance(0.18)) n.pauseT = this.rng.range(1, 4);
        continue;
      }

      const vx = (dx / d) * n.speed;
      const vz = (dz / d) * n.speed;
      p.x += vx * dt;
      p.z += vz * dt;
      const targetRot = Math.atan2(vx, vz);
      let diff = targetRot - n.h.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      n.h.root.rotation.y += diff * Math.min(1, dt * 8);

      n.h.update(dt, n.speed > 1.5 ? 'run' : 'walk', n.speed);
    }
  }

  /** Ближайший NPC для разговора. */
  nearest(x, z, maxDist = 3.2) {
    let best = null, bd = maxDist;
    for (const n of this.list) {
      const d = dist2D(n.h.root.position.x, n.h.root.position.z, x, z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  dispose() { while (this.list.length) this._despawn(0); }
}

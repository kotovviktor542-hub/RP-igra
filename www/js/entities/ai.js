/* ai.js — живой город: трафик (машины с ИИ) и пешеходы.
   Всё пулится и стримится вокруг игрока, чтобы не убивать телефон. */

import * as THREE from '../../vendor/three.module.js';
import { Vehicle, VEHICLES, CAR_COLORS } from './vehicle.js';
import { Humanoid, mergeJointMeshes } from './humanoid.js';
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

  setMax(n) {
    this.max = n;
    while (this.cars.length > n) this._despawn(this.cars.length - 1);
  }

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

  setMax(n) {
    this.max = n;
    while (this.list.length > n) this._despawn(this.list.length - 1);
  }

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
    mergeJointMeshes(h.root);   // NPC рисуется в несколько раз дешевле
    const idx = this.rng.int(0, path.length - 1);
    h.root.position.set(path[idx][0], 0, path[idx][1]);
    this.scene.add(h.root);

    this.list.push({
      h, path, idx,
      next: (idx + 1) % path.length,
      speed: this.rng.range(1.0, 1.7),
      baseSpeed: 1.4,
      name: NPC_NAMES[this.rng.int(0, NPC_NAMES.length - 1)],
      line: NPC_LINES[this.rng.int(0, NPC_LINES.length - 1)],
      pauseT: 0,
      dir: this.rng.chance(0.5) ? 1 : -1,
      hp: 100,
      mood: this.rng.chance(0.4) ? 'brave' : 'coward',  // даст сдачи или убежит
      state: 'walk',                                     // walk | flee | fight | down
      stateT: 0,
      atkCd: 0
    });
  }

  _despawn(i) {
    const n = this.list[i];
    this.scene.remove(n.h.root);
    n.h.dispose();
    this.list.splice(i, 1);
  }

  /**
   * Урон пешеходу. Возвращает 'down' | 'fight' | 'flee'.
   * @param {object} n пешеход
   * @param {number} dmg урон
   * @param {number} fx,fz откуда прилетело
   */
  hit(n, dmg, fx, fz) {
    if (!n || n.state === 'down') return 'down';
    n.hp -= dmg;
    const dx = n.h.root.position.x - fx, dz = n.h.root.position.z - fz;
    const d = Math.hypot(dx, dz) || 1;
    n.h.root.position.x += (dx / d) * 0.5;
    n.h.root.position.z += (dz / d) * 0.5;
    if (n.hp <= 0) {
      n.state = 'down';
      n.stateT = 22;
      n.h.root.rotation.x = -Math.PI / 2;      // падает
      n.h.root.position.y = 0.25;
      return 'down';
    }
    n.state = n.mood === 'brave' ? 'fight' : 'flee';
    n.stateT = n.state === 'fight' ? 14 : 9;
    n.pauseT = 0;
    return n.state;
  }

  /** Все, кто дерётся с игроком. */
  get fighters() { return this.list.filter(n => n.state === 'fight'); }

  /** Пугает всех в радиусе (выстрел, сигнал, драка). */
  scare(x, z, radius = 18) {
    for (const n of this.list) {
      if (n.state === 'down' || n.state === 'fight') continue;
      if (dist2D(n.h.root.position.x, n.h.root.position.z, x, z) > radius) continue;
      n.state = 'flee';
      n.stateT = Math.max(n.stateT, 6);
      n.pauseT = 0;
    }
  }

  update(dt, px, pz, ctx = {}) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      if (n.state === 'down') continue;        // лежачих не стримим
      if (dist2D(n.h.root.position.x, n.h.root.position.z, px, pz) > 170) this._despawn(i);
    }
    let guard = 0;
    while (this.list.length < this.max && guard++ < 3) this._spawn(px, pz);

    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      const p = n.h.root.position;

      // лежит без сознания
      if (n.state === 'down') {
        n.stateT -= dt;
        if (n.stateT <= 0) this._despawn(i);
        continue;
      }

      if (n.atkCd > 0) n.atkCd -= dt;

      // убегает или дерётся
      if (n.state === 'flee' || n.state === 'fight') {
        n.stateT -= dt;
        const dx = px - p.x, dz = pz - p.z;
        const d = Math.hypot(dx, dz) || 1;
        if (n.stateT <= 0 || (n.state === 'flee' && d > 45)) {
          n.state = 'walk';
          n.hp = Math.max(n.hp, 35);
          continue;
        }
        const sgn = n.state === 'flee' ? -1 : 1;
        const sp = n.state === 'flee' ? 4.4 : 3.6;
        if (n.state === 'fight' && d < 1.7) {
          // бьёт игрока
          n.h.root.rotation.y = Math.atan2(dx, dz);
          n.h.update(dt, 'idle', 0);
          if (n.atkCd <= 0) {
            n.atkCd = 1.3;
            ctx.onHitPlayer && ctx.onHitPlayer(n, 7);
          }
          continue;
        }
        p.x += (dx / d) * sp * sgn * dt;
        p.z += (dz / d) * sp * sgn * dt;
        n.h.root.rotation.y = Math.atan2(dx * sgn, dz * sgn);
        n.h.update(dt, 'run', sp);
        continue;
      }

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

  /** Ближайший NPC для разговора (лежачие не считаются). */
  nearest(x, z, maxDist = 3.2) {
    let best = null, bd = maxDist;
    for (const n of this.list) {
      if (n.state === 'down') continue;
      const d = dist2D(n.h.root.position.x, n.h.root.position.z, x, z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  dispose() { while (this.list.length) this._despawn(0); }
}


/* ======================= ПОЛИЦИЯ ======================= */
/**
 * Копы появляются при розыске, бегут к игроку, бьют дубинкой,
 * а при высоком розыске — задерживают.
 */
export class Police {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.list = [];
    this.max = 0;
    this.rng = makeRNG(9091);
  }

  setMax(n) {
    this.max = Math.max(0, n | 0);
    while (this.list.length > this.max) this._despawn(this.list.length - 1);
  }

  _spawn(px, pz) {
    const a = this.rng.range(0, Math.PI * 2);
    const d = this.rng.range(38, 58);
    const look = Humanoid.randomLook(this.rng);
    look.shirt = 0x1b2a4a;          // форма
    look.pants = 0x1b2030;
    look.shoes = 0x101014;
    const h = new Humanoid(look);
    mergeJointMeshes(h.root);
    h.root.position.set(px + Math.sin(a) * d, 0, pz + Math.cos(a) * d);
    this.scene.add(h.root);
    this.list.push({ h, hp: 140, atkCd: 0, name: 'Патрульный' });
  }

  _despawn(i) {
    const c = this.list[i];
    if (!c) return;
    this.scene.remove(c.h.root);
    c.h.dispose();
    this.list.splice(i, 1);
  }

  hit(c, dmg) {
    c.hp -= dmg;
    if (c.hp <= 0) {
      c.h.root.rotation.x = -Math.PI / 2;
      c.h.root.position.y = 0.25;
      c.down = true;
      c.downT = 20;
      return 'down';
    }
    return 'hit';
  }

  /** @param {object} ctx {onHitPlayer(cop,dmg), onArrest(cop), wanted} */
  update(dt, px, pz, ctx = {}) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      if (c.down) {
        c.downT -= dt;
        if (c.downT <= 0) this._despawn(i);
        continue;
      }
      if (dist2D(c.h.root.position.x, c.h.root.position.z, px, pz) > 200) { this._despawn(i); continue; }
      if (c.atkCd > 0) c.atkCd -= dt;

      const p = c.h.root.position;
      const dx = px - p.x, dz = pz - p.z;
      const d = Math.hypot(dx, dz) || 1;

      if (d < 1.8) {
        c.h.root.rotation.y = Math.atan2(dx, dz);
        c.h.update(dt, 'idle', 0);
        if (c.atkCd <= 0) {
          c.atkCd = 1.1;
          if ((ctx.wanted || 0) >= 3) ctx.onArrest && ctx.onArrest(c);
          else ctx.onHitPlayer && ctx.onHitPlayer(c, 9);
        }
        continue;
      }

      const sp = 5.2;
      p.x += (dx / d) * sp * dt;
      p.z += (dz / d) * sp * dt;
      c.h.root.rotation.y = Math.atan2(dx, dz);
      c.h.update(dt, 'run', sp);
    }

    let guard = 0;
    while (this.list.filter(c => !c.down).length < this.max && guard++ < 2) this._spawn(px, pz);
  }

  /** Ближайший коп (для удара/выстрела игрока). */
  nearest(x, z, maxDist = 3) {
    let best = null, bd = maxDist;
    for (const c of this.list) {
      if (c.down) continue;
      const d = dist2D(c.h.root.position.x, c.h.root.position.z, x, z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  dispose() { while (this.list.length) this._despawn(0); }
}

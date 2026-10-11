/* trafficlights.js — рабочие светофоры: фазы, лампы, «зелёная волна».
   Корпуса уезжают в стриминг кварталов города (дальние не рисуются),
   линзы — один InstancedMesh с живым цветом на весь город. */

import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { GRID, CELL, ROAD, roadX } from './city.js';

const GREEN = new THREE.Color(0x2ce06a);
const YELLOW = new THREE.Color(0xffb020);
const RED = new THREE.Color(0xff2a1e);
const OFF = new THREE.Color(0x14181b);

const T_GREEN = 11;      // сек, зелёный
const T_YELLOW = 2.4;    // сек, жёлтый
const CYCLE = (T_GREEN + T_YELLOW) * 2;

export class TrafficLights {
  constructor(scene) {
    this.scene = scene;
    this.list = [];       // { i, j, x, z, phase }
    this.heads = [];      // { inter, axis, x, z, rot }
    this.time = 0;
    this.lamps = null;
    this.emittedTris = 0;
  }

  /**
   * Ставит светофоры на «крупных» перекрёстках (через один).
   * @param {object} city город — геометрия корпусов уходит в его чанки
   */
  build(city) {
    for (let i = 1; i < GRID; i++) {
      for (let j = 1; j < GRID; j++) {
        if ((i + j) % 2 !== 0) continue;
        const x = roadX(i), z = roadX(j);
        // зелёная волна: сдвиг фазы вдоль магистрали
        const inter = { i, j, x, z, phase: ((i - j) * 1.7) % CYCLE };
        const idx = this.list.length;
        this.list.push(inter);

        const half = ROAD / 2 + 1.1;
        // 4 стойки по углам, каждая смотрит на встречный поток
        const corners = [
          { cx: x + half, cz: z + half, rot: Math.PI * 0.75, axis: 0 },
          { cx: x - half, cz: z + half, rot: -Math.PI * 0.25, axis: 1 },
          { cx: x - half, cz: z - half, rot: -Math.PI * 0.75, axis: 0 },
          { cx: x + half, cz: z - half, rot: Math.PI * 0.25, axis: 1 }
        ];
        for (const c of corners) {
          const geo = this._headGeometry(c.cx, c.cz, c.rot);
          this.emittedTris += geo.attributes.position.count / 3;
          if (city) city._emit(i - 1, j - 1, { metalDark: [geo] });
          this.heads.push({ inter: idx, axis: c.axis, x: c.cx, z: c.cz, rot: c.rot });
        }
      }
    }
    this._buildLamps();
  }

  /** Одна головка светофора: стойка, кронштейн, корпус, три козырька. */
  _headGeometry(x, z, rot) {
    const parts = [];

    // стойка — шестигранник без заглушек
    const pole = new THREE.CylinderGeometry(0.11, 0.15, 6.0, 6, 1, true);
    pole.translate(0, 3.0, 0);
    parts.push(pole);

    const foot = new THREE.CylinderGeometry(0.26, 0.3, 0.2, 6);
    foot.translate(0, 0.1, 0);
    parts.push(foot);

    // кронштейн над проезжей частью
    const arm = new THREE.BoxGeometry(0.12, 0.12, 0.85);
    arm.translate(0, 5.95, 0.42);
    parts.push(arm);

    // корпус с тремя секциями
    const housing = new THREE.BoxGeometry(0.42, 1.34, 0.36);
    housing.translate(0, 5.42, 0.78);
    parts.push(housing);

    // козырьки — по одному боксу на лампу
    for (let k = 0; k < 3; k++) {
      const visor = new THREE.BoxGeometry(0.3, 0.07, 0.2);
      visor.translate(0, 5.42 + (1 - k) * 0.46 - 0.02, 1.02);
      parts.push(visor);
    }

    const g = mergeGeometries(parts, false);
    parts.forEach(p => p.dispose());
    g.rotateY(rot);
    g.translate(x, 0, z);
    return g;
  }

  _buildLamps() {
    if (!this.heads.length) return;
    const n = this.heads.length * 3;
    // плоский кружок вместо цилиндра: в 10 раз дешевле
    const lensGeo = new THREE.CircleGeometry(0.125, 8);
    const lensMat = new THREE.MeshBasicMaterial({ toneMapped: false, side: THREE.DoubleSide });
    this.lamps = new THREE.InstancedMesh(lensGeo, lensMat, n);
    this.lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.lamps.frustumCulled = false;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const one = new THREE.Vector3(1, 1, 1);
    const v = new THREE.Vector3();
    for (let h = 0; h < this.heads.length; h++) {
      const hd = this.heads[h];
      e.set(0, hd.rot, 0);
      q.setFromEuler(e);
      for (let k = 0; k < 3; k++) {
        v.set(0, 5.42 + (1 - k) * 0.46, 0.97).applyEuler(e);
        m.compose(new THREE.Vector3(hd.x + v.x, v.y, hd.z + v.z), q, one);
        this.lamps.setMatrixAt(h * 3 + k, m);
        this.lamps.setColorAt(h * 3 + k, OFF);
      }
    }
    this.lamps.instanceMatrix.needsUpdate = true;
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
    this.scene.add(this.lamps);
  }

  /** Состояние оси: 0 = движение вдоль X, 1 = вдоль Z. */
  axisState(inter, axis) {
    const t = ((this.time + inter.phase) % CYCLE + CYCLE) % CYCLE;
    const own = axis === 0 ? t : (t + T_GREEN + T_YELLOW) % CYCLE;
    if (own < T_GREEN) return 'green';
    if (own < T_GREEN + T_YELLOW) return 'yellow';
    return 'red';
  }

  /** Есть ли светофор на этом узле. */
  hasAt(i, j) {
    for (const inter of this.list) if (inter.i === i && inter.j === j) return inter;
    return null;
  }

  update(dt) {
    this.time += dt;
  }

  /** Перекрашивает линзы. Вызывается из city.updateLights. */
  refresh() {
    if (!this.lamps) return;
    for (let h = 0; h < this.heads.length; h++) {
      const st = this.axisState(this.list[this.heads[h].inter], this.heads[h].axis);
      const base = h * 3;
      this.lamps.setColorAt(base + 0, st === 'red' ? RED : OFF);
      this.lamps.setColorAt(base + 1, st === 'yellow' ? YELLOW : OFF);
      this.lamps.setColorAt(base + 2, st === 'green' ? GREEN : OFF);
    }
    if (this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  setVisible(on) {
    if (this.lamps) this.lamps.visible = on;
  }

  dispose() {
    if (this.lamps) { this.scene.remove(this.lamps); this.lamps.geometry.dispose(); }
  }
}

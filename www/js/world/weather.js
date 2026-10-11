/* weather.js — погода: ясно, облачно, пасмурно, дождь, гроза, туман.
   Меняет небо, туман, свет, температуру и сцепление колёс с дорогой. */

import * as THREE from '../../vendor/three.module.js';
import { clamp } from '../core/utils.js';

export const WEATHER = {
  clear:    { id: 'clear',    name: 'Ясно',        icon: '☀', cloud: 0.05, rain: 0,    fog: 1.0,  grip: 1.00, tempMod:  2 },
  clouds:   { id: 'clouds',   name: 'Облачно',     icon: '⛅', cloud: 0.45, rain: 0,    fog: 0.95, grip: 1.00, tempMod:  0 },
  overcast: { id: 'overcast', name: 'Пасмурно',    icon: '☁', cloud: 0.9,  rain: 0,    fog: 0.85, grip: 0.99, tempMod: -2 },
  rain:     { id: 'rain',     name: 'Дождь',       icon: '🌧', cloud: 1.0,  rain: 0.75, fog: 0.7,  grip: 0.72, tempMod: -5 },
  storm:    { id: 'storm',    name: 'Гроза',       icon: '⛈', cloud: 1.0,  rain: 1.0,  fog: 0.6,  grip: 0.62, tempMod: -6 },
  fog:      { id: 'fog',      name: 'Туман',       icon: '🌫', cloud: 0.6,  rain: 0.1,  fog: 0.28, grip: 0.9,  tempMod: -3 }
};

export const WEATHER_LIST = Object.keys(WEATHER);

/** Текстура капли — вертикальный штрих с мягкими краями. */
function dropTexture() {
  const cv = document.createElement('canvas');
  cv.width = 8; cv.height = 32;
  const g = cv.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 32);
  grad.addColorStop(0, 'rgba(200,225,255,0)');
  grad.addColorStop(0.35, 'rgba(210,232,255,0.85)');
  grad.addColorStop(1, 'rgba(230,242,255,0.15)');
  g.fillStyle = grad;
  g.fillRect(2, 0, 4, 32);
  const t = new THREE.CanvasTexture(cv);
  t.needsUpdate = true;
  return t;
}

export class Weather {
  constructor(scene, qualityLevel = 4) {
    this.scene = scene;
    this.def = WEATHER.clear;
    this.id = 'clear';
    this.cloud = 0.05;        // сглаженное значение
    this.rainAmt = 0;
    this.fogMul = 1;
    this.grip = 1;
    this.flash = 0;           // 0..1 вспышка молнии
    this.temp = 16;
    this.wind = 0.15;
    this.windDir = Math.random() * Math.PI * 2;
    this._timer = 240 + Math.random() * 300;   // секунд до смены погоды
    this._nextBolt = 6 + Math.random() * 10;
    this._quality = qualityLevel;
    this.onThunder = null;

    this._buildRain();
  }

  _buildRain() {
    const count = this._quality >= 5 ? 4200 : this._quality >= 3 ? 2200 : 1100;
    this.count = count;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const SPREAD = 60, HEIGHT = 34;
    this.SPREAD = SPREAD; this.HEIGHT = HEIGHT;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * SPREAD;
      pos[i * 3 + 1] = Math.random() * HEIGHT;
      pos[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
      seed[i] = 0.7 + Math.random() * 0.6;
    }
    this.seed = seed;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.34,
      map: dropTexture(),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
      fog: false
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.scene.add(this.points);
  }

  /** Мгновенно ставит погоду (для меню/отладки). */
  setType(id) {
    const d = WEATHER[id];
    if (!d) return;
    this.id = id;
    this.def = d;
    this._timer = 200 + Math.random() * 340;
  }

  /** Случайная погода с весами: чаще ясно/облачно, реже гроза. */
  randomType() {
    const table = [
      ['clear', 30], ['clouds', 24], ['overcast', 18],
      ['rain', 14], ['storm', 6], ['fog', 8]
    ];
    const total = table.reduce((a, b) => a + b[1], 0);
    let r = Math.random() * total;
    for (const [id, w] of table) { r -= w; if (r <= 0) return id; }
    return 'clear';
  }

  update(dt, focus, nightAmount) {
    const d = this.def;

    // плавные переходы
    const k = clamp(dt * 0.35, 0, 1);
    this.cloud += (d.cloud - this.cloud) * k;
    this.rainAmt += (d.rain - this.rainAmt) * k;
    this.fogMul += (d.fog - this.fogMul) * k;
    this.grip += (d.grip - this.grip) * k;
    this.wind += ((0.12 + d.rain * 0.5) - this.wind) * k * 0.5;

    // температура: суточный ход + поправка погоды
    const hour = 12;
    const diurnal = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 4;
    const target = 15 + diurnal + d.tempMod - nightAmount * 4;
    this.temp += (target - this.temp) * clamp(dt * 0.02, 0, 1);

    // смена погоды
    this._timer -= dt;
    if (this._timer <= 0) this.setType(this.randomType());

    // молнии
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.id === 'storm') {
      this._nextBolt -= dt;
      if (this._nextBolt <= 0) {
        this._nextBolt = 4 + Math.random() * 14;
        this.flash = 1;
        if (this.onThunder) {
          const delay = 300 + Math.random() * 2200;
          setTimeout(() => this.onThunder && this.onThunder(), delay);
        }
      }
    }

    // дождь
    const raining = this.rainAmt > 0.02;
    this.points.visible = raining && !!focus;
    if (raining && focus) {
      const mat = this.points.material;
      mat.opacity = this.rainAmt * 0.55;
      this.points.position.set(focus.x, 0, focus.z);
      const arr = this.points.geometry.attributes.position.array;
      const wx = Math.cos(this.windDir) * this.wind * 6;
      const wz = Math.sin(this.windDir) * this.wind * 6;
      const step = this._quality >= 4 ? 1 : 2;         // на слабых считаем через каплю
      for (let i = 0; i < this.count; i += step) {
        const i3 = i * 3;
        arr[i3 + 1] -= (16 + this.seed[i] * 16) * this.rainAmt * dt * 3.4;
        arr[i3] += wx * dt;
        arr[i3 + 2] += wz * dt;
        if (arr[i3 + 1] < 0) {
          arr[i3 + 1] = this.HEIGHT - Math.random() * 2;
          arr[i3] = (Math.random() - 0.5) * this.SPREAD;
          arr[i3 + 2] = (Math.random() - 0.5) * this.SPREAD;
        }
      }
      this.points.geometry.attributes.position.needsUpdate = true;
    }

    this.windDir += (Math.random() - 0.5) * dt * 0.05;
  }

  get label() { return this.def.name; }
  get icon() { return this.def.icon; }
  get isWet() { return this.rainAmt > 0.25; }
  get visibility() { return this.fogMul; }
}

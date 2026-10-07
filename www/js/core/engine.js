/* engine.js — рендерер, камера, свет, небо, цикл день/ночь, игровой цикл. */

import * as THREE from '../../vendor/three.module.js';

/**
 * Лестница качества: 0 — максимально дёшево, 7 — максимум красоты.
 * Режим AUTO сам поднимается по лестнице, пока fps держится выше порога,
 * и опускается, если просел. Цель — «максимум графики при fps >= 45».
 */
export const LEVELS = [
  { lv: 0, shadow: 0,    pr: 1.25, scale: 1.00, far: 190, fog: 125, npc: 5,  traffic: 5,  chunkR: 105, props: 0 },
  { lv: 1, shadow: 0,    pr: 1.4, scale: 1.00, far: 230, fog: 150, npc: 7,  traffic: 7,  chunkR: 130, props: 0 },
  { lv: 2, shadow: 0,    pr: 1.55, scale: 1.00, far: 280, fog: 190, npc: 10, traffic: 9,  chunkR: 155, props: 1 },
  { lv: 3, shadow: 1024, pr: 1.7, scale: 1.00, far: 330, fog: 220, npc: 13, traffic: 11, chunkR: 180, props: 1 },
  { lv: 4, shadow: 1024, pr: 1.85, scale: 1.00, far: 400, fog: 270, npc: 18, traffic: 14, chunkR: 215, props: 1 },
  { lv: 5, shadow: 1536, pr: 2.1, scale: 1.00, far: 470, fog: 320, npc: 24, traffic: 18, chunkR: 250, props: 2 },
  { lv: 6, shadow: 2048, pr: 2.5, scale: 1.00, far: 560, fog: 380, npc: 28, traffic: 22, chunkR: 290, props: 2 },
  { lv: 7, shadow: 2048, pr: 3.0, scale: 1.00, far: 650, fog: 430, npc: 34, traffic: 26, chunkR: 330, props: 2 }
];

export const QUALITY = {
  LOW: LEVELS[1],
  MEDIUM: LEVELS[4],
  HIGH: LEVELS[7],
  AUTO: LEVELS[4]
};

/** Телефон/планшет? */
export function isMobileDevice() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const ua = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  return coarse || ua;
}

/** Режим по умолчанию — AUTO: графика на максимум, но не ниже целевого fps. */
export function defaultQuality() {
  try {
    const saved = localStorage.getItem('rp:quality');
    if (saved && (QUALITY[saved] || saved === 'AUTO')) return saved;
  } catch { /* ignore */ }
  return 'AUTO';
}

export class Engine {
  constructor(canvas, qualityName = 'AUTO') {
    this.canvas = canvas;
    this.qualityName = qualityName;
    this.auto = qualityName === 'AUTO';
    // в авто-режиме стартуем со среднего на телефоне и с высокого на ПК
    this.level = this.auto ? (isMobileDevice() ? 3 : 6)
      : LEVELS.indexOf(QUALITY[qualityName] || QUALITY.MEDIUM);
    if (this.level < 0) this.level = 4;
    this.quality = LEVELS[this.level];
    this.targetFps = 45;        // пол, ниже которого опускаться нельзя
    try {
      const saved = parseInt(localStorage.getItem('rp:targetFps') || '0', 10);
      if (saved >= 20 && saved <= 120) this.targetFps = saved;
    } catch { /* ignore */ }
    this.onQualityChange = null;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,              // MSAA: на телефонных GPU дешёвый, убирает «лесенку»
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderScale = this.quality.scale;      // адаптивное разрешение
    this.sharpness = 1.1;
    try {
      const s = parseFloat(localStorage.getItem('rp:sharp') || '1');
      if (s >= 0.8 && s <= 2) this.sharpness = s;
    } catch { /* ignore */ }
    this.adaptive = true;
    this._applyPixelRatio();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.quality.shadow > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.25, this.quality.far);
    this.camera.position.set(0, 6, 12);

    this.clock = new THREE.Clock();
    this.updaters = [];
    this.running = false;
    this.time = 9.5;          // игровое время в часах
    this.timeScale = 1 / 45;  // 1 игровой час ≈ 45 секунд реального

    this._buildSky();
    this._buildLights();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Пиксель-рейт = devicePixelRatio, ограниченный качеством и масштабом рендера. */
  _applyPixelRatio() {
    const dpr = window.devicePixelRatio || 1;
    const pr = Math.min(dpr, this.quality.pr) * this.renderScale * this.sharpness;
    // ниже 1.0 CSS-пикселя не опускаемся вообще — иначе картинка «мылится»
    this.renderer.setPixelRatio(Math.max(Math.min(dpr, 1.0), Math.min(dpr * 1.5, pr)));
  }

  /** Ручной множитель чёткости (0.8…2.0), сохраняется между запусками. */
  setSharpness(v) {
    this.sharpness = Math.max(0.8, Math.min(2, v));
    try { localStorage.setItem('rp:sharp', String(this.sharpness)); } catch { /* ignore */ }
    this._applyPixelRatio();
    this.resize();
  }

  /** Принудительно задать масштаб рендера (1 = полное разрешение экрана). */
  setRenderScale(s) {
    this.renderScale = Math.max(0.5, Math.min(1, s));
    this._applyPixelRatio();
    this.resize();
  }

  /* -------------------- небо -------------------- */
  _buildSky() {
    const uniforms = {
      topColor:    { value: new THREE.Color(0x3b7bc4) },
      bottomColor: { value: new THREE.Color(0xbcd4e6) },
      sunDir:      { value: new THREE.Vector3(0, 1, 0) },
      sunColor:    { value: new THREE.Color(0xfff0d0) },
      offset:      { value: 12 },
      exponent:    { value: 0.7 }
    };
    this.skyUniforms = uniforms;

    const geo = new THREE.SphereGeometry(1, 24, 14);
    const mat = new THREE.ShaderMaterial({
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor, bottomColor, sunDir, sunColor;
        uniform float offset, exponent;
        varying vec3 vWorld;
        void main() {
          float hgt = max(pow(max(vWorld.y + 0.08, 0.0), exponent), 0.0);
          vec3 col = mix(bottomColor, topColor, hgt);
          float sd = max(dot(normalize(vWorld), normalize(sunDir)), 0.0);
          col += sunColor * pow(sd, 90.0) * 1.6;         // диск солнца
          col += sunColor * pow(sd, 6.0) * 0.22;          // ореол
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.scale.setScalar(this.quality.far * 0.92);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    this.scene.fog = new THREE.Fog(0xbcd4e6, this.quality.fog * 0.35, this.quality.fog);
  }

  /* -------------------- свет -------------------- */
  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbcd4e6, 0x4a4a42, 0.75);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    this.sun.position.set(60, 90, 40);
    if (this.quality.shadow > 0) {
      this.sun.castShadow = true;
      const s = this.sun.shadow;
      s.mapSize.set(this.quality.shadow, this.quality.shadow);
      s.camera.near = 1;
      s.camera.far = 240;
      const d = 62;
      s.camera.left = -d; s.camera.right = d;
      s.camera.top = d; s.camera.bottom = -d;
      s.bias = -0.0006;
      s.normalBias = 0.035;
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);
  }

  /** Обновляет положение солнца/цвета в зависимости от времени суток. */
  updateDayNight(dt, focus) {
    this.time = (this.time + dt * this.timeScale) % 24;
    const t = this.time;

    // высота солнца: максимум в 13:00
    const ang = ((t - 6) / 12) * Math.PI;        // 6:00 восход, 18:00 закат
    const elev = Math.sin(ang);
    const azim = Math.cos(ang);

    const dayAmt = Math.max(0, Math.min(1, (elev + 0.12) / 0.4));   // 0 ночь, 1 день
    const duskAmt = Math.max(0, 1 - Math.abs(elev) * 4) * (elev > -0.25 ? 1 : 0);

    const dir = new THREE.Vector3(azim * 0.85, Math.max(elev, -0.3), 0.42).normalize();
    this.sunDirection = dir;

    const px = focus ? focus.x : 0;
    const pz = focus ? focus.z : 0;
    this.sun.position.set(px + dir.x * 130, Math.max(dir.y, 0.05) * 160 + 12, pz + dir.z * 130);
    this.sun.target.position.set(px, 0, pz);
    this.sun.target.updateMatrixWorld();

    // цвета
    const dayTop = new THREE.Color(0x2f6fc0);
    const dayBot = new THREE.Color(0xc3d9ea);
    const duskTop = new THREE.Color(0x2b3f6b);
    const duskBot = new THREE.Color(0xe2884a);
    const nightTop = new THREE.Color(0x060a16);
    const nightBot = new THREE.Color(0x141c30);

    const top = nightTop.clone().lerp(dayTop, dayAmt).lerp(duskTop, duskAmt * 0.65);
    const bot = nightBot.clone().lerp(dayBot, dayAmt).lerp(duskBot, duskAmt * 0.8);

    this.skyUniforms.topColor.value.copy(top);
    this.skyUniforms.bottomColor.value.copy(bot);
    this.skyUniforms.sunDir.value.copy(dir);
    this.skyUniforms.sunColor.value.setHSL(0.09, 0.55, 0.5 + dayAmt * 0.35);

    this.sun.intensity = 0.05 + dayAmt * 2.5;
    this.sun.color.setHSL(0.1, 0.35 - dayAmt * 0.2, 0.55 + dayAmt * 0.35);
    this.hemi.intensity = 0.12 + dayAmt * 0.65;
    this.hemi.color.copy(bot);
    this.ambient.intensity = 0.06 + dayAmt * 0.14;

    this.scene.fog.color.copy(bot);
    this.renderer.setClearColor(bot);
    this.scene.fog.near = this.quality.fog * (0.3 + dayAmt * 0.12);
    this.scene.fog.far = this.quality.fog * (0.72 + dayAmt * 0.3);

    this.nightAmount = 1 - dayAmt;
    this.dayAmount = dayAmt;

    if (focus) this.sky.position.set(focus.x, 0, focus.z);
  }

  get clockString() {
    const h = Math.floor(this.time);
    const m = Math.floor((this.time - h) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }

  setQuality(name) {
    const q = QUALITY[name];
    if (!q) return;
    this.auto = name === 'AUTO';
    this.level = name === 'AUTO' ? (isMobileDevice() ? 3 : 6) : LEVELS.indexOf(q);
    this._ceiling = LEVELS.length - 1;
    this.quality = LEVELS[this.level];
    this.qualityName = name;
    this.renderScale = this.quality.scale;
    this._applyPixelRatio();
    const cur = this.quality;
    this.renderer.shadowMap.enabled = cur.shadow > 0;
    try { localStorage.setItem('rp:quality', name); } catch { /* ignore */ }
    if (cur.shadow > 0) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(cur.shadow, cur.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    } else {
      this.sun.castShadow = false;
    }
    this.camera.far = cur.far;
    this.camera.updateProjectionMatrix();
    this.sky.scale.setScalar(cur.far * 0.92);
    this.resize();
    if (this.onQualityChange) this.onQualityChange(q, this.level);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  add(fn) { this.updaters.push(fn); }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.start();

    let frames = 0, acc = 0;
    this.fps = 60;

    const loop = () => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      let dt = this.clock.getDelta();
      if (dt > 0.1) dt = 0.1;      // защита от фриз-скачков

      acc += dt; frames++;
      if (acc >= 0.5) {
        this.fps = Math.round(frames / acc);
        frames = 0; acc = 0;
        this._autoScale();
      }

      for (let i = 0; i < this.updaters.length; i++) this.updaters[i](dt, this);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  /** Применяет уровень из лестницы качества (0..7). */
  applyLevel(i) {
    const lv = Math.max(0, Math.min(LEVELS.length - 1, i));
    if (lv === this.level) return;
    this.level = lv;
    const q = LEVELS[lv];
    this.quality = q;
    this.renderScale = q.scale;
    this._applyPixelRatio();

    this.renderer.shadowMap.enabled = q.shadow > 0;
    if (q.shadow > 0) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    } else {
      this.sun.castShadow = false;
    }
    this.camera.far = q.far;
    this.camera.updateProjectionMatrix();
    this.sky.scale.setScalar(q.far * 0.92);
    this.resize();
    if (this.onQualityChange) this.onQualityChange(q, lv);
  }

  /**
   * Губернатор качества: держим максимум картинки при fps >= targetFps.
   * Шаг вниз — быстрый (просадка заметна сразу), шаг вверх — осторожный.
   */
  _autoScale() {
    if (!this.adaptive) return;
    const now = performance.now();
    this._lastScaleAt = this._lastScaleAt || 0;
    this._lowStreak = this._lowStreak || 0;
    this._highStreak = this._highStreak || 0;
    this._ceiling = this._ceiling == null ? LEVELS.length - 1 : this._ceiling;

    const fps = this.fps;
    if (fps < this.targetFps) { this._lowStreak++; this._highStreak = 0; }
    else if (fps > this.targetFps + 13) { this._highStreak++; this._lowStreak = 0; }
    else { this._lowStreak = 0; this._highStreak = 0; }

    if (!this.auto) {
      // в ручных пресетах подкручиваем только разрешение
      if (now - this._lastScaleAt < 2500) return;
      const min = 1.0, max = this.quality.scale;
      if (this._lowStreak >= 2 && this.renderScale > min) this.renderScale = Math.max(min, this.renderScale - 0.1);
      else if (this._highStreak >= 5 && this.renderScale < max) this.renderScale = Math.min(max, this.renderScale + 0.05);
      else return;
      this._lowStreak = 0; this._highStreak = 0; this._lastScaleAt = now;
      this._applyPixelRatio();
      this.resize();
      return;
    }

    if (now - this._lastScaleAt < 2500) return;

    if (this._lowStreak >= 2 && this.level > 0) {
      // чем сильнее просадка, тем больше ступеней вниз за раз
      const ratio = this.fps / this.targetFps;
      const step = ratio < 0.5 ? 3 : ratio < 0.75 ? 2 : 1;
      this._ceiling = Math.max(0, this.level - 1);   // выше этого без запаса не лезем
      this._lastScaleAt = now;
      this._lowStreak = 0;
      this.applyLevel(this.level - step);
    } else if (this._highStreak >= 4 && this.level < LEVELS.length - 1) {
      // поднимаемся, только если запас по fps большой
      const allowed = this.fps > this.targetFps + 20 ? LEVELS.length - 1 : this._ceiling;
      if (this.level < allowed) {
        this._lastScaleAt = now;
        this._highStreak = 0;
        this.applyLevel(this.level + 1);
      }
    }
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}

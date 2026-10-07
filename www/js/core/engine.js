/* engine.js — рендерер, камера, свет, небо, цикл день/ночь, игровой цикл. */

import * as THREE from '../../vendor/three.module.js';

export const QUALITY = {
  LOW:    { shadow: 0,    pr: 1.0,  far: 260, fog: 170, aa: false, npc: 10, traffic: 8,  chunkR: 150 },
  MEDIUM: { shadow: 1024, pr: 1.25, far: 420, fog: 280, aa: false, npc: 20, traffic: 16, chunkR: 230 },
  HIGH:   { shadow: 2048, pr: 1.6,  far: 650, fog: 430, aa: true,  npc: 34, traffic: 26, chunkR: 330 }
};

export class Engine {
  constructor(canvas, qualityName = 'MEDIUM') {
    this.canvas = canvas;
    this.quality = QUALITY[qualityName] || QUALITY.MEDIUM;
    this.qualityName = qualityName;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.quality.aa,
      powerPreference: 'high-performance',
      stencil: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pr));
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
      s.camera.far = 320;
      const d = 95;
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
    this.quality = q;
    this.qualityName = name;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pr));
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
      if (acc >= 0.5) { this.fps = Math.round(frames / acc); frames = 0; acc = 0; }

      for (let i = 0; i < this.updaters.length; i++) this.updaters[i](dt, this);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
  }
}

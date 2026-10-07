/* creator.js — экран создания персонажа с живым 3D-превью. */

import * as THREE from '../../vendor/three.module.js';
import { Humanoid } from '../entities/humanoid.js';

const $ = id => document.getElementById(id);
const P = Humanoid.PALETTES;

export class Creator {
  constructor(onStart, onBack) {
    this.onStart = onStart;
    this.onBack = onBack;
    this.root = $('creator');

    this.look = {
      skin: P.SKIN[0], hair: P.HAIR[0], shirt: P.SHIRT[0],
      pants: P.PANTS[0], shoes: P.SHOES[0],
      height: 1.78, build: 1.0, hairStyle: 0, gender: 'm'
    };

    this._initRenderer();
    this._initSwatches();
    this._initInputs();
    this.rebuild();
  }

  _initRenderer() {
    const canvas = $('cc-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = false;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    this.camera.position.set(0, 1.0, 3.6);

    const key = new THREE.DirectionalLight(0xfff0dd, 2.6);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fb4ff, 1.1);
    fill.position.set(-3, 1.5, -2);
    this.scene.add(fill);
    this.scene.add(new THREE.HemisphereLight(0x8fa8d0, 0x2a2a30, 0.8));

    // подиум
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.8, 0.06, 32),
      new THREE.MeshStandardMaterial({ color: 0x1b2330, roughness: 0.5, metalness: 0.4 })
    );
    disc.position.y = -0.03;
    this.scene.add(disc);

    this.holder = new THREE.Group();
    this.scene.add(this.holder);

    this.rot = 0;
    this._drag = null;
    canvas.addEventListener('pointerdown', e => { this._drag = e.clientX; });
    window.addEventListener('pointermove', e => {
      if (this._drag === null) return;
      this.rot += (e.clientX - this._drag) * 0.012;
      this._drag = e.clientX;
    });
    window.addEventListener('pointerup', () => { this._drag = null; });
  }

  _initSwatches() {
    const mk = (boxId, palette, key) => {
      const box = $(boxId);
      box.innerHTML = '';
      palette.forEach((col, i) => {
        const b = document.createElement('button');
        b.className = 'sw' + (i === 0 ? ' active' : '');
        b.style.background = '#' + col.toString(16).padStart(6, '0');
        b.onclick = () => {
          box.querySelectorAll('.sw').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          this.look[key] = col;
          this.rebuild();
        };
        box.appendChild(b);
      });
    };
    mk('cc-skin', P.SKIN, 'skin');
    mk('cc-hair', P.HAIR, 'hair');
    mk('cc-shirt', P.SHIRT, 'shirt');
    mk('cc-pants', P.PANTS, 'pants');
  }

  _initInputs() {
    document.querySelectorAll('[data-seg]').forEach(seg => {
      seg.addEventListener('click', e => {
        const btn = e.target.closest('.seg-btn');
        if (!btn) return;
        seg.querySelectorAll('.seg-btn').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        const key = seg.dataset.seg;
        this.look[key] = key === 'hairStyle' ? parseInt(btn.dataset.v, 10) : btn.dataset.v;
        this.rebuild();
      });
    });

    $('cc-height').addEventListener('input', e => {
      this.look.height = parseInt(e.target.value, 10) / 100;
      $('cc-h-val').textContent = e.target.value;
      this.rebuild();
    });
    $('cc-build').addEventListener('input', e => {
      this.look.build = parseInt(e.target.value, 10) / 100;
      this.rebuild();
    });

    $('cc-random').addEventListener('click', () => {
      const r = Humanoid.randomLook(Math.random);
      Object.assign(this.look, r);
      this._syncUI();
      this.rebuild();
    });

    $('cc-back').addEventListener('click', () => { this.hide(); this.onBack && this.onBack(); });
    $('cc-start').addEventListener('click', () => {
      const name = ($('cc-name').value || '').trim() ||
        (this.look.gender === 'f' ? 'Анна Иванова' : 'Иван Петров');
      this.hide();
      this.onStart({ name, look: { ...this.look } });
    });
  }

  _syncUI() {
    $('cc-height').value = Math.round(this.look.height * 100);
    $('cc-h-val').textContent = Math.round(this.look.height * 100);
    $('cc-build').value = Math.round(this.look.build * 100);
    document.querySelectorAll('[data-seg]').forEach(seg => {
      const key = seg.dataset.seg;
      seg.querySelectorAll('.seg-btn').forEach(b => {
        b.classList.toggle('active', String(this.look[key]) === b.dataset.v);
      });
    });
    const syncSw = (id, key) => {
      const box = $(id);
      box.querySelectorAll('.sw').forEach(b => {
        const col = b.style.background;
        b.classList.toggle('active',
          col === 'rgb(' + [(this.look[key] >> 16) & 255, (this.look[key] >> 8) & 255, this.look[key] & 255].join(', ') + ')');
      });
    };
    syncSw('cc-skin', 'skin'); syncSw('cc-hair', 'hair');
    syncSw('cc-shirt', 'shirt'); syncSw('cc-pants', 'pants');
  }

  rebuild() {
    if (this.model) {
      this.holder.remove(this.model.root);
      this.model.dispose();
    }
    this.model = new Humanoid(this.look);
    this.holder.add(this.model.root);
  }

  show() {
    this.root.classList.remove('hidden');
    this.running = true;
    this._loop();
  }

  hide() {
    this.root.classList.add('hidden');
    this.running = false;
  }

  _loop() {
    if (!this.running) return;
    requestAnimationFrame(() => this._loop());
    const canvas = $('cc-canvas');
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    if (this._drag === null) this.rot += 0.004;
    this.holder.rotation.y = this.rot;
    if (this.model) this.model.update(1 / 60, 'idle', 0);
    this.camera.position.y = this.look.height * 0.56;
    this.camera.lookAt(0, this.look.height * 0.52, 0);
    this.renderer.render(this.scene, this.camera);
  }
}

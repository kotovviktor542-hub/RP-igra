/* humanoid.js — персонаж с иерархией суставов и процедурной анимацией
   (idle / walk / run / sit / карабканье). Используется и игроком, и NPC. */

import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';

/** Общий материал для «слитых» NPC: цвет берётся из вершин. */
let NPC_MAT = null;
function npcMat() {
  if (!NPC_MAT) NPC_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 });
  return NPC_MAT;
}

/**
 * Склеивает меши внутри каждого сустава в один — NPC начинает занимать
 * ~6 draw calls вместо ~18. Анимация не страдает: суставы остаются отдельными.
 */
export function mergeJointMeshes(root) {
  const groups = [];
  root.traverse(o => { if (o.isObject3D && !o.isMesh) groups.push(o); });
  for (const g of groups) {
    const leaves = g.children.filter(c => c.isMesh && c.children.length === 0);
    if (leaves.length < 2) continue;
    const geos = [];
    let ok = true;
    for (const mesh of leaves) {
      let geo = mesh.geometry.clone();
      if (geo.index) geo = geo.toNonIndexed();
      geo.applyMatrix4(mesh.matrix);
      const n = geo.attributes.position.count;
      if (!geo.attributes.normal) geo.computeVertexNormals();
      if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
      const col = new Float32Array(n * 3);
      const c = mesh.material && mesh.material.color ? mesh.material.color : new THREE.Color(0xffffff);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      for (const name of Object.keys(geo.attributes)) {
        if (!['position', 'normal', 'uv', 'color'].includes(name)) geo.deleteAttribute(name);
      }
      geos.push(geo);
    }
    const merged = ok && geos.length ? mergeGeometries(geos, false) : null;
    if (!merged) continue;
    for (const mesh of leaves) { g.remove(mesh); mesh.geometry.dispose(); }
    const m = new THREE.Mesh(merged, npcMat());
    m.castShadow = true;
    g.add(m);
  }
  return root;
}

const SKIN = [0xf0c9a4, 0xe0b088, 0xc89468, 0x9c6b45, 0x7a4f32, 0xf7d7bb];
const HAIR = [0x22181a, 0x4a2f1e, 0x8a6a3a, 0xc9a86a, 0x6b6b6b, 0x2a2a2e];
const SHIRT = [0x2e4a7a, 0x7a2e35, 0x2f6b4a, 0x4a3f7a, 0x8a6a2e, 0x2b2b32, 0xaab2bb, 0x7a4a2e];
const PANTS = [0x2a3346, 0x3a3a42, 0x4a3a2e, 0x22262e, 0x5a5a62];
const SHOES = [0x1b1b20, 0x3a2a22, 0x6a6a70];

function m(color, rough = 0.85, metal = 0.0) {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

function box(w, h, d, mat) {
  const g = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  return mesh;
}

/** Слегка скруглённый «мышечный» сегмент. */
function limb(topR, botR, len, mat, segs = 7) {
  const g = new THREE.CylinderGeometry(topR, botR, len, segs, 1);
  const mesh = new THREE.Mesh(g, mat);
  mesh.castShadow = true;
  return mesh;
}

export class Humanoid {
  /**
   * @param {object} look {skin, hair, shirt, pants, shoes, height, build, hairStyle}
   */
  constructor(look = {}) {
    this.look = Object.assign({
      skin: SKIN[0], hair: HAIR[0], shirt: SHIRT[0], pants: PANTS[0], shoes: SHOES[0],
      height: 1.78, build: 1.0, hairStyle: 0, gender: 'm'
    }, look);

    const L = this.look;
    const scale = L.height / 1.78;
    const bw = 0.92 + (L.build - 1) * 0.35;       // ширина корпуса
    const fem = L.gender === 'f';

    const skinM = m(L.skin, 0.72);
    const hairM = m(L.hair, 0.88);
    const shirtM = m(L.shirt, 0.9);
    const pantsM = m(L.pants, 0.92);
    const shoeM = m(L.shoes, 0.6, 0.1);

    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);

    /* --- таз --- */
    this.hips = new THREE.Group();
    this.hips.position.y = 0.92;
    this.root.add(this.hips);

    const pelvis = limb(0.19 * bw, 0.17 * bw, 0.22, pantsM, 8);
    pelvis.scale.z = 0.7;
    pelvis.position.y = -0.02;
    this.hips.add(pelvis);

    /* --- торс --- */
    this.torso = new THREE.Group();
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);

    const chest = limb(0.215 * bw * (fem ? 0.97 : 1.03), 0.185 * bw, 0.46, shirtM, 9);
    chest.scale.z = 0.66;
    chest.position.y = 0.23;
    this.torso.add(chest);

    // плечи
    const shoulders = limb(0.1, 0.1, 0.42 * bw, shirtM, 7);
    shoulders.rotation.z = Math.PI / 2;
    shoulders.position.y = 0.44;
    shoulders.scale.set(1, 1, 0.75);
    this.torso.add(shoulders);

    // воротник
    const collar = limb(0.095, 0.105, 0.09, shirtM, 8);
    collar.position.y = 0.5;
    this.torso.add(collar);

    /* --- шея и голова --- */
    this.neck = new THREE.Group();
    this.neck.position.y = 0.52;
    this.torso.add(this.neck);

    const neckM = limb(0.062, 0.07, 0.1, skinM, 7);
    neckM.position.y = 0.05;
    this.neck.add(neckM);

    this.head = new THREE.Group();
    this.head.position.y = 0.12;
    this.neck.add(this.head);

    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.108, 12, 10), skinM);
    skull.scale.set(0.92, 1.12, 1.0);
    skull.position.y = 0.09;
    skull.castShadow = true;
    this.head.add(skull);

    const jaw = box(0.14, 0.075, 0.13, skinM);
    jaw.position.set(0, 0.015, 0.012);
    this.head.add(jaw);

    const nose = box(0.028, 0.034, 0.042, skinM);
    nose.position.set(0, 0.075, 0.1);
    this.head.add(nose);

    // глаза
    const eyeW = m(0xf6f6f2, 0.3);
    const eyeD = m(0x2a2320, 0.25);
    [-0.038, 0.038].forEach(ex => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), eyeW);
      e.position.set(ex, 0.098, 0.088);
      this.head.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.0095, 6, 5), eyeD);
      p.position.set(ex, 0.098, 0.102);
      this.head.add(p);
    });

    // брови
    [-0.04, 0.04].forEach(ex => {
      const b = box(0.042, 0.009, 0.014, hairM);
      b.position.set(ex, 0.122, 0.094);
      this.head.add(b);
    });

    // волосы
    const hs = L.hairStyle % 4;
    if (hs === 0) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.115, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hairM);
      h.scale.set(0.95, 1.1, 1.03);
      h.position.y = 0.095;
      this.head.add(h);
    } else if (hs === 1) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.118, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.75), hairM);
      h.scale.set(0.98, 1.15, 1.05);
      h.position.y = 0.088;
      this.head.add(h);
      const back = box(0.16, 0.2, 0.08, hairM);
      back.position.set(0, 0.02, -0.085);
      this.head.add(back);
    } else if (hs === 2) {
      const h = box(0.2, 0.045, 0.2, hairM);
      h.position.y = 0.175;
      this.head.add(h);
    } else {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.113, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), hairM);
      h.position.y = 0.1;
      this.head.add(h);
    }

    /* --- руки --- */
    const mkArm = sign => {
      const shoulder = new THREE.Group();
      shoulder.position.set(sign * 0.215 * bw, 0.42, 0);
      this.torso.add(shoulder);

      const upper = limb(0.058, 0.05, 0.3, shirtM, 7);
      upper.position.y = -0.15;
      shoulder.add(upper);

      const elbow = new THREE.Group();
      elbow.position.y = -0.3;
      shoulder.add(elbow);

      const fore = limb(0.05, 0.042, 0.28, skinM, 7);
      fore.position.y = -0.14;
      elbow.add(fore);

      const hand = box(0.07, 0.11, 0.045, skinM);
      hand.position.y = -0.33;
      elbow.add(hand);

      return { shoulder, elbow, hand };
    };
    this.armL = mkArm(-1);
    this.armR = mkArm(1);

    /* --- ноги --- */
    const mkLeg = sign => {
      const hip = new THREE.Group();
      hip.position.set(sign * 0.095 * bw, -0.08, 0);
      this.hips.add(hip);

      const thigh = limb(0.085, 0.07, 0.42, pantsM, 8);
      thigh.position.y = -0.21;
      hip.add(thigh);

      const knee = new THREE.Group();
      knee.position.y = -0.42;
      hip.add(knee);

      const shin = limb(0.068, 0.05, 0.42, pantsM, 8);
      shin.position.y = -0.21;
      knee.add(shin);

      const ankle = new THREE.Group();
      ankle.position.y = -0.42;
      knee.add(ankle);

      const foot = box(0.095, 0.065, 0.24, shoeM);
      foot.position.set(0, -0.032, 0.05);
      ankle.add(foot);

      return { hip, knee, ankle, foot };
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);

    this.t = 0;
    this.state = 'idle';
    this.speed = 0;
  }

  /**
   * @param {number} dt
   * @param {string} state idle|walk|run|sit|drive
   * @param {number} speed м/с
   */
  update(dt, state, speed = 0) {
    this.t += dt;
    const t = this.t;

    const set = (o, x, y, z) => { o.rotation.set(x, y || 0, z || 0); };

    if (state === 'sit' || state === 'drive') {
      set(this.hips, 0, 0, 0);
      this.hips.position.y = 0.6;
      set(this.legL.hip, -1.45, 0.1, 0.05);
      set(this.legR.hip, -1.45, -0.1, -0.05);
      set(this.legL.knee, 1.35, 0, 0);
      set(this.legR.knee, 1.35, 0, 0);
      const steer = state === 'drive' ? Math.sin(t * 0.8) * 0.12 : 0;
      set(this.armL.shoulder, -1.1 + steer, 0.25, 0.45);
      set(this.armR.shoulder, -1.1 - steer, -0.25, -0.45);
      set(this.armL.elbow, -0.55, 0, 0);
      set(this.armR.elbow, -0.55, 0, 0);
      set(this.torso, 0.08, 0, 0);
      set(this.head, Math.sin(t * 0.6) * 0.04, Math.sin(t * 0.37) * 0.14, 0);
      return;
    }

    this.hips.position.y = 0.92;

    if (state === 'walk' || state === 'run') {
      const run = state === 'run';
      const freq = run ? 8.2 : 5.1;
      const amp = run ? 0.95 : 0.62;
      const p = t * freq;
      const s = Math.sin(p), c = Math.cos(p);

      set(this.legL.hip, s * amp, 0, 0);
      set(this.legR.hip, -s * amp, 0, 0);
      set(this.legL.knee, Math.max(0, -s * amp * 1.5 + (run ? 0.45 : 0.2)), 0, 0);
      set(this.legR.knee, Math.max(0, s * amp * 1.5 + (run ? 0.45 : 0.2)), 0, 0);
      set(this.legL.ankle, -s * 0.3 + 0.1, 0, 0);
      set(this.legR.ankle, s * 0.3 + 0.1, 0, 0);

      const armAmp = run ? 1.15 : 0.62;
      set(this.armL.shoulder, -s * armAmp, 0, run ? 0.18 : 0.1);
      set(this.armR.shoulder, s * armAmp, 0, run ? -0.18 : -0.1);
      set(this.armL.elbow, -(run ? 0.9 : 0.35) - Math.max(0, -s) * 0.5, 0, 0);
      set(this.armR.elbow, -(run ? 0.9 : 0.35) - Math.max(0, s) * 0.5, 0, 0);

      // корпус: наклон вперёд + покачивание
      set(this.torso, (run ? 0.22 : 0.07) + Math.abs(s) * 0.03, -s * 0.09, c * 0.04);
      this.hips.position.y = 0.92 + Math.abs(Math.sin(p * 2)) * (run ? 0.055 : 0.028);
      this.hips.rotation.z = c * 0.035;
      set(this.head, -(run ? 0.12 : 0.02), s * 0.05, -c * 0.03);
    } else {
      // idle: дыхание, лёгкое переминание, взгляд
      const b = Math.sin(t * 1.5);
      set(this.legL.hip, 0.02 + b * 0.012, 0.03, 0.02);
      set(this.legR.hip, -0.02 - b * 0.012, -0.03, -0.02);
      set(this.legL.knee, 0.06, 0, 0);
      set(this.legR.knee, 0.06, 0, 0);
      set(this.legL.ankle, 0.0, 0, 0);
      set(this.legR.ankle, 0.0, 0, 0);
      set(this.armL.shoulder, b * 0.05, 0, 0.14 + b * 0.02);
      set(this.armR.shoulder, -b * 0.05, 0, -0.14 - b * 0.02);
      set(this.armL.elbow, -0.22, 0, 0);
      set(this.armR.elbow, -0.22, 0, 0);
      set(this.torso, 0.02 + b * 0.015, Math.sin(t * 0.4) * 0.05, 0);
      this.hips.position.y = 0.92 + b * 0.008;
      this.hips.rotation.z = 0;
      set(this.head, b * 0.02, Math.sin(t * 0.33) * 0.22, 0);
    }
  }

  dispose() {
    this.root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  static randomLook(rng) {
    const r = rng || Math.random;
    const pick = a => a[Math.floor(r() * a.length)];
    const fem = r() < 0.48;
    return {
      skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT),
      pants: pick(PANTS), shoes: pick(SHOES),
      height: fem ? 1.6 + r() * 0.14 : 1.7 + r() * 0.18,
      build: 0.85 + r() * 0.35,
      hairStyle: Math.floor(r() * 4),
      gender: fem ? 'f' : 'm'
    };
  }

  static get PALETTES() { return { SKIN, HAIR, SHIRT, PANTS, SHOES }; }
}

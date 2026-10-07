/* props.js — уличный реквизит через InstancedMesh: деревья, фонари, лавки, урны,
   светофоры, знаки, заборы, столбики, контейнеры, остановки, гидранты. */

import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { getTex, flatColor } from '../core/textures.js';

const M = {};
function mat(name, params) {
  if (!M[name]) M[name] = new THREE.MeshStandardMaterial(params);
  return M[name];
}

function bark()     { return mat('bark',     { color: 0x5b4634, roughness: 0.95 }); }
function leaf(c)    { return mat('leaf' + c, { color: c, roughness: 0.85, flatShading: true }); }
function metalDark(){ return mat('metalD',   { color: 0x33383f, roughness: 0.55, metalness: 0.55 }); }
function metalGrey(){ return mat('metalG',   { color: 0x8d949c, roughness: 0.45, metalness: 0.7 }); }
function woodMat()  { return mat('wood',     { color: 0x7a5533, roughness: 0.9 }); }
function painted(c) { return mat('p' + c,    { color: c, roughness: 0.5, metalness: 0.15 }); }
function glowMat(c) { return mat('g' + c,    { color: 0x222222, emissive: c, emissiveIntensity: 0, roughness: 0.3 }); }
function concreteMat() {
  if (!M.conc) {
    const t = getTex('concrete');
    M.conc = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.92 });
  }
  return M.conc;
}

/* ---------- определения реквизита ---------- */
/* каждый возвращает [{geo, mat, glow?:true}] */

const DEFS = {
  tree(rng) {
    const h = 4.2 + Math.random() * 3.4;
    const trunk = new THREE.CylinderGeometry(0.17, 0.3, h * 0.55, 6);
    trunk.translate(0, h * 0.275, 0);
    const parts = [{ geo: trunk, mat: bark() }];

    const blobs = [];
    const n = 3 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const r = 1.3 + Math.random() * 1.1;
      const b = new THREE.IcosahedronGeometry(r, 0);
      b.scale(1, 0.85, 1);
      b.translate(
        (Math.random() - 0.5) * 1.8,
        h * 0.62 + Math.random() * h * 0.3,
        (Math.random() - 0.5) * 1.8
      );
      blobs.push(b);
    }
    const col = [0x3e6b2c, 0x4a7a33, 0x355c27, 0x567f38][(Math.random() * 4) | 0];
    parts.push({ geo: mergeGeometries(blobs), mat: leaf(col) });
    return parts;
  },

  pine() {
    const h = 6 + Math.random() * 4;
    const trunk = new THREE.CylinderGeometry(0.14, 0.26, h * 0.3, 6);
    trunk.translate(0, h * 0.15, 0);
    const cones = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.ConeGeometry(2.0 - i * 0.5, h * 0.4, 7);
      c.translate(0, h * (0.3 + i * 0.22) + h * 0.2, 0);
      cones.push(c);
    }
    return [
      { geo: trunk, mat: bark() },
      { geo: mergeGeometries(cones), mat: leaf(0x2d5226) }
    ];
  },

  streetlight() {
    const g = [];
    const pole = new THREE.CylinderGeometry(0.1, 0.15, 8.0, 7);
    pole.translate(0, 4.0, 0);
    g.push(pole);
    const base = new THREE.CylinderGeometry(0.26, 0.32, 0.5, 8);
    base.translate(0, 0.25, 0);
    g.push(base);
    const arm = new THREE.CylinderGeometry(0.07, 0.07, 1.9, 6);
    arm.rotateZ(Math.PI / 2);
    arm.translate(0.9, 7.9, 0);
    g.push(arm);
    const head = new THREE.BoxGeometry(1.0, 0.22, 0.42);
    head.translate(1.75, 7.78, 0);
    g.push(head);

    const lamp = new THREE.BoxGeometry(0.8, 0.1, 0.32);
    lamp.translate(1.75, 7.64, 0);

    return [
      { geo: mergeGeometries(g), mat: metalDark() },
      { geo: lamp, mat: glowMat(0xffdca8), glow: true }
    ];
  },

  trafficLight() {
    const g = [];
    const pole = new THREE.CylinderGeometry(0.11, 0.16, 6.2, 7);
    pole.translate(0, 3.1, 0);
    g.push(pole);
    const arm = new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6);
    arm.rotateZ(Math.PI / 2);
    arm.translate(1.6, 6.1, 0);
    g.push(arm);
    const box = new THREE.BoxGeometry(0.42, 1.25, 0.34);
    box.translate(3.0, 5.5, 0);
    g.push(box);
    const visor = new THREE.BoxGeometry(0.5, 0.08, 0.5);
    visor.translate(3.0, 6.18, 0.08);
    g.push(visor);

    const lights = [];
    [[0.42, 0xff3322], [0, 0xffbb22], [-0.42, 0x22dd55]].forEach(([dy]) => {
      const l = new THREE.CylinderGeometry(0.11, 0.11, 0.07, 8);
      l.rotateX(Math.PI / 2);
      l.translate(3.0, 5.5 + dy, 0.19);
      lights.push(l);
    });

    return [
      { geo: mergeGeometries(g), mat: metalDark() },
      { geo: mergeGeometries(lights), mat: glowMat(0xff5533), glow: true }
    ];
  },

  bench() {
    const g = [];
    for (let i = 0; i < 4; i++) {
      const s = new THREE.BoxGeometry(1.7, 0.07, 0.14);
      s.translate(0, 0.45, -0.25 + i * 0.16);
      g.push(s);
    }
    for (let i = 0; i < 3; i++) {
      const b = new THREE.BoxGeometry(1.7, 0.13, 0.06);
      b.translate(0, 0.62 + i * 0.17, -0.33);
      g.push(b);
    }
    const legs = [];
    [-0.72, 0.72].forEach(x => {
      const l = new THREE.BoxGeometry(0.08, 0.45, 0.62);
      l.translate(x, 0.22, -0.05);
      legs.push(l);
      const bk = new THREE.BoxGeometry(0.08, 0.55, 0.08);
      bk.translate(x, 0.7, -0.33);
      legs.push(bk);
    });
    return [
      { geo: mergeGeometries(g), mat: woodMat() },
      { geo: mergeGeometries(legs), mat: metalDark() }
    ];
  },

  bin() {
    const body = new THREE.CylinderGeometry(0.33, 0.27, 0.95, 10, 1, true);
    body.translate(0, 0.48, 0);
    const lid = new THREE.CylinderGeometry(0.37, 0.37, 0.09, 10);
    lid.translate(0, 1.0, 0);
    return [
      { geo: body, mat: mat('binM', { color: 0x2f4d3a, roughness: 0.7, metalness: 0.3, side: THREE.DoubleSide }) },
      { geo: lid, mat: metalDark() }
    ];
  },

  hydrant() {
    const g = [];
    const b = new THREE.CylinderGeometry(0.17, 0.2, 0.7, 8);
    b.translate(0, 0.35, 0);
    g.push(b);
    const cap = new THREE.SphereGeometry(0.17, 8, 6);
    cap.translate(0, 0.72, 0);
    g.push(cap);
    [[0.22, 0], [-0.22, 0]].forEach(([x, z]) => {
      const n = new THREE.CylinderGeometry(0.07, 0.07, 0.18, 6);
      n.rotateZ(Math.PI / 2);
      n.translate(x, 0.45, z);
      g.push(n);
    });
    return [{ geo: mergeGeometries(g), mat: painted(0xc0392b) }];
  },

  bollard() {
    const g = new THREE.CylinderGeometry(0.1, 0.12, 0.9, 8);
    g.translate(0, 0.45, 0);
    const top = new THREE.SphereGeometry(0.11, 8, 5);
    top.translate(0, 0.9, 0);
    return [{ geo: mergeGeometries([g, top]), mat: metalGrey() }];
  },

  busStop() {
    const g = [];
    const roof = new THREE.BoxGeometry(4.6, 0.14, 1.7);
    roof.translate(0, 2.6, 0);
    g.push(roof);
    [-2.1, 2.1].forEach(x => {
      const p = new THREE.BoxGeometry(0.11, 2.6, 0.11);
      p.translate(x, 1.3, -0.7);
      g.push(p);
      const p2 = new THREE.BoxGeometry(0.11, 2.6, 0.11);
      p2.translate(x, 1.3, 0.7);
      g.push(p2);
    });
    const back = new THREE.BoxGeometry(4.5, 2.0, 0.06);
    back.translate(0, 1.4, -0.78);
    const seat = new THREE.BoxGeometry(3.6, 0.1, 0.45);
    seat.translate(0, 0.55, -0.5);
    return [
      { geo: mergeGeometries(g), mat: metalDark() },
      { geo: back, mat: mat('glassBlue', { color: 0x9ec4d8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.5 }) },
      { geo: seat, mat: metalGrey() }
    ];
  },

  sign() {
    const pole = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6);
    pole.translate(0, 1.3, 0);
    const plate = new THREE.BoxGeometry(0.75, 0.75, 0.04);
    plate.rotateZ(Math.PI / 4);
    plate.translate(0, 2.3, 0.03);
    return [
      { geo: pole, mat: metalGrey() },
      { geo: plate, mat: painted(0xe8e8e2) }
    ];
  },

  container() {
    const body = new THREE.BoxGeometry(6.0, 2.6, 2.4);
    body.translate(0, 1.3, 0);
    const ribs = [];
    for (let i = -2; i <= 2; i++) {
      const r = new THREE.BoxGeometry(0.1, 2.5, 2.46);
      r.translate(i * 1.1, 1.3, 0);
      ribs.push(r);
    }
    const col = [0xb8491f, 0x1f5fb8, 0x2d7a3a, 0xa8a212, 0x6b6b6b][(Math.random() * 5) | 0];
    return [
      { geo: body, mat: painted(col) },
      { geo: mergeGeometries(ribs), mat: painted(col) }
    ];
  },

  fence() {
    // секция 4 м
    const g = [];
    [-2, 2].forEach(x => {
      const p = new THREE.BoxGeometry(0.12, 1.8, 0.12);
      p.translate(x, 0.9, 0);
      g.push(p);
    });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.BoxGeometry(0.06, 1.55, 0.06);
      b.translate(-1.85 + i * 0.46, 0.8, 0);
      g.push(b);
    }
    const r1 = new THREE.BoxGeometry(4.0, 0.08, 0.08);
    r1.translate(0, 1.5, 0);
    g.push(r1);
    const r2 = new THREE.BoxGeometry(4.0, 0.08, 0.08);
    r2.translate(0, 0.35, 0);
    g.push(r2);
    return [{ geo: mergeGeometries(g), mat: metalDark() }];
  },

  lightPoleTall() {
    const g = [];
    const pole = new THREE.CylinderGeometry(0.14, 0.22, 11, 8);
    pole.translate(0, 5.5, 0);
    g.push(pole);
    const head = new THREE.BoxGeometry(1.6, 0.3, 0.7);
    head.translate(0, 11.1, 0);
    g.push(head);
    const lamp = new THREE.BoxGeometry(1.4, 0.12, 0.55);
    lamp.translate(0, 10.9, 0);
    return [
      { geo: mergeGeometries(g), mat: metalDark() },
      { geo: lamp, mat: glowMat(0xd8e4ff), glow: true }
    ];
  },

  atm() {
    const g = [];
    const body = new THREE.BoxGeometry(0.9, 1.9, 0.55);
    body.translate(0, 0.95, 0);
    g.push(body);
    const scr = new THREE.BoxGeometry(0.6, 0.45, 0.05);
    scr.translate(0, 1.42, 0.29);
    return [
      { geo: mergeGeometries(g), mat: mat('atmBody', { color: 0x2a3a52, roughness: 0.4, metalness: 0.5 }) },
      { geo: scr, mat: glowMat(0x66ff99), glow: true }
    ];
  },

  fuelPump() {
    const g = [];
    const base = new THREE.BoxGeometry(2.4, 0.25, 1.2);
    base.translate(0, 0.12, 0);
    g.push(base);
    [-0.7, 0.7].forEach(x => {
      const b = new THREE.BoxGeometry(0.7, 1.8, 0.6);
      b.translate(x, 1.0, 0);
      g.push(b);
    });
    const scr = new THREE.BoxGeometry(1.0, 0.4, 0.06);
    scr.translate(0, 1.5, 0.33);
    return [
      { geo: mergeGeometries(g), mat: painted(0xd9dde2) },
      { geo: scr, mat: glowMat(0x44ddff), glow: true }
    ];
  },

  planter() {
    const box = new THREE.BoxGeometry(1.6, 0.6, 1.6);
    box.translate(0, 0.3, 0);
    const soil = new THREE.BoxGeometry(1.4, 0.1, 1.4);
    soil.translate(0, 0.62, 0);
    const bush = new THREE.IcosahedronGeometry(0.72, 0);
    bush.scale(1, 0.7, 1);
    bush.translate(0, 0.95, 0);
    return [
      { geo: mergeGeometries([box, soil]), mat: concreteMat() },
      { geo: bush, mat: leaf(0x47733a) }
    ];
  }
};

/* ---------- система инстансов ---------- */

/** Общий материал для слитого реквизита: цвет берётся из вершин. */
function vcMat() {
  return mat('propsVC', { vertexColors: true, roughness: 0.82, metalness: 0.08 });
}

/**
 * Склеивает части реквизита в одну геометрию (цвет материала запекается в вершины),
 * чтобы на каждый куст/фонарь уходил один draw call вместо трёх.
 * Текстурированные и светящиеся части остаются отдельными.
 */
function mergeParts(parts) {
  const solid = [], keep = [];
  for (const p of parts) {
    if (p.glow || (p.mat && p.mat.map)) keep.push(p);
    else solid.push(p);
  }
  if (solid.length < 2) return keep.concat(solid);

  const geos = [];
  for (const p of solid) {
    let g = p.geo.clone();
    if (g.index) g = g.toNonIndexed();          // смешивать индексированные и нет нельзя
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    const c = p.mat && p.mat.color ? p.mat.color : new THREE.Color(0xffffff);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const name of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
    }
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false);
  if (!merged) return keep.concat(solid);
  return keep.concat([{ geo: merged, mat: vcMat() }]);
}

export class PropSystem {
  /**
   * Реквизит инстансируется ПО ЯЧЕЙКАМ (CELL_SIZE метров), а не на весь город.
   * Благодаря этому работает и фрустум-куллинг, и отсечение по дистанции:
   * раньше одна InstancedMesh на весь город рисовала ~700k треугольников каждый кадр.
   */
  constructor(scene, cellSize = 92) {
    this.scene = scene;
    this.cellSize = cellSize;
    this.pending = new Map();   // "type|cx,cz" -> [Matrix4]
    this.meshes = [];
    this.cells = new Map();     // "cx,cz" -> {x, z, meshes:[]}
    this.glowMats = new Set();
    this.skip = new Set();      // типы, скрытые ради производительности
  }

  add(type, x, z, rotY = 0, scale = 1, y = 0) {
    if (!DEFS[type]) return;
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY),
      new THREE.Vector3(scale, scale, scale)
    );
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const key = `${type}|${cx},${cz}`;
    if (!this.pending.has(key)) this.pending.set(key, []);
    this.pending.get(key).push(m);
  }

  build() {
    this.pending.forEach((matrices, key) => {
      const [type, cell] = key.split('|');
      const [cx, cz] = cell.split(',').map(Number);
      const cellKey = `${cx},${cz}`;
      if (!this.cells.has(cellKey)) {
        this.cells.set(cellKey, {
          x: (cx + 0.5) * this.cellSize,
          z: (cz + 0.5) * this.cellSize,
          meshes: []
        });
      }
      const cellRec = this.cells.get(cellKey);

      // для деревьев важна вариативность — несколько вариантов геометрии
      const variants = (type === 'tree' || type === 'pine') ? 2 : 1;
      const buckets = Array.from({ length: variants }, () => []);
      matrices.forEach((m, i) => buckets[i % variants].push(m));

      buckets.forEach(bucket => {
        if (!bucket.length) return;
        const parts = mergeParts(DEFS[type]());
        parts.forEach(part => {
          const inst = new THREE.InstancedMesh(part.geo, part.mat, bucket.length);
          bucket.forEach((m, i) => inst.setMatrixAt(i, m));
          inst.instanceMatrix.needsUpdate = true;
          inst.castShadow = !part.glow && type !== 'fence';
          inst.receiveShadow = !part.glow;
          inst.frustumCulled = true;
          inst.userData.propType = type;
          inst.computeBoundingSphere();
          this.scene.add(inst);
          this.meshes.push(inst);
          cellRec.meshes.push(inst);
          if (part.glow) this.glowMats.add(part.mat);
        });
      });
    });
    this.pending.clear();
  }

  /**
   * Уровень детализации: 0 — только крупное (деревья, фонари, светофоры),
   * 1 — плюс лавки/урны/заборы, 2 — всё.
   */
  setDetail(level) {
    const off0 = ['bin', 'hydrant', 'bench', 'fence', 'bollard', 'planter', 'sign'];
    const off1 = ['bin', 'hydrant'];
    this.skip = new Set(level <= 0 ? off0 : level === 1 ? off1 : []);
  }

  /** Показывает только реквизит вокруг игрока. Вызывать каждый кадр. */
  updateCulling(x, z, radius) {
    const r2 = radius * radius;
    this.cells.forEach(cell => {
      const dx = cell.x - x, dz = cell.z - z;
      const on = (dx * dx + dz * dz) < r2;
      const list = cell.meshes;
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        m.visible = on && !this.skip.has(m.userData.propType);
      }
    });
  }

  /** Включает/гасит фонари и подсветку по времени суток. */
  setNight(amount) {
    this.glowMats.forEach(m => {
      m.emissiveIntensity = amount * 2.6;
    });
  }

  dispose() {
    this.meshes.forEach(m => { this.scene.remove(m); m.geometry.dispose(); });
    this.meshes.length = 0;
    this.cells.clear();
  }
}

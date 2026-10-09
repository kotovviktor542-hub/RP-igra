/* city.js — процедурный город: сетка улиц, районы, кварталы, тротуары, разметка,
   POI (магазины, работы, дома, гаражи, заправки), граф дорог для трафика и навигации. */

import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { getTex, getFacade, getStorefront } from '../core/textures.js';
import { makeRNG, boxAt, SpatialGrid } from '../core/utils.js';
import { makeBuilding, makeHouse, makeGarage, makeWarehouse, FLOOR_H } from './buildings.js';
import { PropSystem } from './props.js';

export const GRID = 11;          // кварталов по стороне
export const CELL = 92;          // шаг сетки, м
export const ROAD = 18;          // ширина проезжей части + обочины
export const BLOCK = CELL - ROAD;
export const WORLD = GRID * CELL;
export const OFFSET = -WORLD / 2;
const CHUNK = 2;                 // кварталов в чанке

export const roadX = i => OFFSET + i * CELL;

/* ======================= МАТЕРИАЛЫ ======================= */
function buildMaterials() {
  const mats = {};
  const facadeDefs = [
    ['f0', { cols: 5, rows: 5, wall: '#9a9387', wall2: '#857e72', glass: '#2b3a46', style: 'office' }],
    ['f1', { cols: 4, rows: 5, wall: '#b4a893', wall2: '#9c917e', glass: '#334652', style: 'panel' }],
    ['f2', { cols: 4, rows: 4, wall: '#8d5a46', wall2: '#794c3b', glass: '#2a3844', style: 'brick' }],
    ['f3', { cols: 6, rows: 5, wall: '#79818c', wall2: '#636a74', glass: '#1f2d3a', style: 'office' }],
    ['f4', { cols: 4, rows: 4, wall: '#c3bca9', wall2: '#aaa392', glass: '#36505e', style: 'panel' }],
    ['f5', { cols: 5, rows: 4, wall: '#6f7a86', wall2: '#5a646e', glass: '#24323e', style: 'office' }]
  ];
  facadeDefs.forEach(([k, o]) => {
    const t = getFacade(k, o);
    mats[k] = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap, emissiveMap: t.emissiveMap,
      emissive: 0xffffff, emissiveIntensity: 0,
      roughness: 0.78, metalness: 0.06
    });
    mats[k].userData.night = true;
  });

  [0, 35, 95, 150, 205, 265, 320].forEach((hue, i) => {
    const t = getStorefront(hue);
    mats['shop' + i] = new THREE.MeshStandardMaterial({
      map: t.map, normalMap: t.normalMap, emissiveMap: t.emissiveMap,
      emissive: 0xffffff, emissiveIntensity: 0,
      roughness: 0.35, metalness: 0.2
    });
    mats['shop' + i].userData.night = true;
  });

  const rt = getTex('roof');
  mats.roof = new THREE.MeshStandardMaterial({ map: rt.map, normalMap: rt.normalMap, roughness: 0.95 });

  const ct = getTex('concrete');
  mats.concrete = new THREE.MeshStandardMaterial({ map: ct.map, normalMap: ct.normalMap, roughness: 0.9 });

  mats.trim = new THREE.MeshStandardMaterial({ color: 0xd3cec2, roughness: 0.6 });
  mats.metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.42, metalness: 0.75 });
  mats.glass = new THREE.MeshStandardMaterial({
    color: 0x6f90a8, roughness: 0.08, metalness: 0.25,
    transparent: true, opacity: 0.62, envMapIntensity: 1.2
  });
  mats.roofTile = new THREE.MeshStandardMaterial({ color: 0x7a3b32, roughness: 0.8, flatShading: true });
  mats.brickTrim = new THREE.MeshStandardMaterial({ color: 0x8a5a46, roughness: 0.9 });
  mats.corrugated = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.55, metalness: 0.5 });
  mats.garageDoor = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.5, metalness: 0.4 });

  return mats;
}

/* ======================= ГОРОД ======================= */
export class City {
  constructor(scene, seed = 20261007) {
    this.scene = scene;
    this.rng = makeRNG(seed);
    this.mats = buildMaterials();
    this.props = new PropSystem(scene, CELL);

    this.colliders = [];     // {minX,minZ,maxX,maxZ,h}
    this.pois = [];          // {type,name,x,z,...}
    this.chunks = new Map(); // "cx,cz" -> THREE.Group
    this.nightMats = [];
    this.districts = [];     // [i][j]
    this.roadNodes = [];
    this.roadEdges = [];
    this.parkingSpots = [];
    this.pedPaths = [];      // точки для пешеходов

    Object.values(this.mats).forEach(m => { if (m.userData.night) this.nightMats.push(m); });
  }

  generate() {
    this._planDistricts();
    this._buildGround();
    this._buildRoads();
    this._buildRoadGraph();
    this._buildBlocks();
    this.props.build();
    this._assignSpecialShops();
    this._finishChunks();
    return this;
  }

  /* ---------- 1. районы ---------- */
  _planDistricts() {
    const c = (GRID - 1) / 2;
    for (let i = 0; i < GRID; i++) {
      this.districts[i] = [];
      for (let j = 0; j < GRID; j++) {
        const d = Math.max(Math.abs(i - c), Math.abs(j - c));
        let type;
        if (d <= 1) type = 'downtown';
        else if (d <= 2.5) type = 'commercial';
        else if (i >= GRID - 2 && j <= 1) type = 'industrial';
        else type = 'residential';
        this.districts[i][j] = type;
      }
    }
    // точечные вкрапления
    const special = [
      ['park', 3], ['parking', 3], ['plaza', 1], ['gas', 2], ['civic', 3]
    ];
    special.forEach(([t, n]) => {
      for (let k = 0; k < n; k++) {
        for (let tries = 0; tries < 40; tries++) {
          const i = this.rng.int(0, GRID - 1), j = this.rng.int(0, GRID - 1);
          const cur = this.districts[i][j];
          if (cur === 'downtown' || cur === 'industrial') continue;
          if (['park', 'parking', 'plaza', 'gas', 'civic'].includes(cur)) continue;
          this.districts[i][j] = t;
          break;
        }
      }
    });
    // стартовый квартал игрока — всегда жилой с домами
    this.districts[2][2] = 'residential';
  }

  /* ---------- 2. земля ---------- */
  _buildGround() {
    const g = getTex('grass');
    const size = WORLD + 800;
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * size / 8, uv.getY(i) * size / 8);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: g.map, normalMap: g.normalMap, roughness: 1.0
    }));
    mesh.position.y = -0.06;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.ground = mesh;
  }

  /* ---------- 3. дороги, тротуары, разметка ---------- */
  _buildRoads() {
    const asph = getTex('asphalt');
    const side = getTex('sidewalk');

    const roadGeos = [];
    const walkGeos = [];
    const markGeos = [];
    const half = ROAD / 2;
    const ext = WORLD / 2 + 40;

    const roadQuad = (cx, cz, w, d) => {
      const q = new THREE.PlaneGeometry(w, d);
      q.rotateX(-Math.PI / 2);
      const uv = q.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 8, uv.getY(i) * d / 8);
      q.translate(cx, 0.01, cz);
      return q;
    };

    // продольные и поперечные полосы асфальта
    for (let i = 0; i <= GRID; i++) {
      const p = roadX(i);
      roadGeos.push(roadQuad(p, 0, ROAD, WORLD + 80));
      roadGeos.push(roadQuad(0, p, WORLD + 80, ROAD));
    }

    // тротуары по периметру каждого квартала
    const SW = 3.2;
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x0 = roadX(i) + half, x1 = roadX(i + 1) - half;
        const z0 = roadX(j) + half, z1 = roadX(j + 1) - half;
        const w = x1 - x0, d = z1 - z0;
        const mk = (cx, cz, ww, dd) => {
          const q = new THREE.PlaneGeometry(ww, dd);
          q.rotateX(-Math.PI / 2);
          const uv = q.attributes.uv;
          for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * ww / 4, uv.getY(k) * dd / 4);
          q.translate(cx, 0.14, cz);
          return q;
        };
        walkGeos.push(mk(x0 + w / 2, z0 + SW / 2, w, SW));
        walkGeos.push(mk(x0 + w / 2, z1 - SW / 2, w, SW));
        walkGeos.push(mk(x0 + SW / 2, z0 + d / 2, SW, d));
        walkGeos.push(mk(x1 - SW / 2, z0 + d / 2, SW, d));
        // бордюр
        const curb = (cx, cz, ww, dd) => boxAt(ww, 0.16, dd, cx, 0.08, cz, 3);
        walkGeos.push(curb(x0 + w / 2, z0 - 0.08, w + 0.2, 0.3));
        walkGeos.push(curb(x0 + w / 2, z1 + 0.08, w + 0.2, 0.3));
        walkGeos.push(curb(x0 - 0.08, z0 + d / 2, 0.3, d + 0.2));
        walkGeos.push(curb(x1 + 0.08, z0 + d / 2, 0.3, d + 0.2));

        // пешеходные маршруты по периметру тротуара
        this.pedPaths.push([
          [x0 + SW / 2, z0 + SW / 2], [x1 - SW / 2, z0 + SW / 2],
          [x1 - SW / 2, z1 - SW / 2], [x0 + SW / 2, z1 - SW / 2]
        ]);
      }
    }

    // разметка: осевая прерывистая
    const dash = (cx, cz, w, d) => {
      const q = new THREE.PlaneGeometry(w, d);
      q.rotateX(-Math.PI / 2);
      q.translate(cx, 0.025, cz);
      return q;
    };
    for (let i = 0; i <= GRID; i++) {
      const p = roadX(i);
      for (let t = -ext; t < ext; t += 8) {
        // пропуски на перекрёстках
        const nearCross = k => {
          for (let m = 0; m <= GRID; m++) if (Math.abs(k - roadX(m)) < half + 2) return true;
          return false;
        };
        if (!nearCross(t)) dash(p, t, 0.22, 4) && markGeos.push(dash(p, t, 0.22, 4));
        if (!nearCross(t)) markGeos.push(dash(t, p, 4, 0.22));
      }
      // сплошные по краю проезжей части
      markGeos.push(dash(p - half + 0.9, 0, 0.14, WORLD + 60));
      markGeos.push(dash(p + half - 0.9, 0, 0.14, WORLD + 60));
      markGeos.push(dash(0, p - half + 0.9, WORLD + 60, 0.14));
      markGeos.push(dash(0, p + half - 0.9, WORLD + 60, 0.14));
    }

    // зебры на перекрёстках
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const cx = roadX(i), cz = roadX(j);
        for (let s = 0; s < 4; s++) {
          const ang = s * Math.PI / 2;
          const ox = Math.cos(ang) * (half + 1.6);
          const oz = Math.sin(ang) * (half + 1.6);
          for (let b = -3; b <= 3; b++) {
            const perpX = -Math.sin(ang) * b * 1.35;
            const perpZ = Math.cos(ang) * b * 1.35;
            const g = new THREE.PlaneGeometry(s % 2 === 0 ? 2.6 : 0.55, s % 2 === 0 ? 0.55 : 2.6);
            g.rotateX(-Math.PI / 2);
            g.translate(cx + ox + perpX, 0.028, cz + oz + perpZ);
            markGeos.push(g);
          }
        }
      }
    }

    const roadMesh = new THREE.Mesh(mergeGeometries(roadGeos), new THREE.MeshStandardMaterial({
      map: asph.map, normalMap: asph.normalMap, roughnessMap: asph.roughnessMap,
      roughness: 0.95, metalness: 0.0
    }));
    roadMesh.receiveShadow = true;
    this.scene.add(roadMesh);

    const walkMesh = new THREE.Mesh(mergeGeometries(walkGeos), new THREE.MeshStandardMaterial({
      map: side.map, normalMap: side.normalMap, roughness: 0.88
    }));
    walkMesh.receiveShadow = true;
    this.scene.add(walkMesh);

    const markMesh = new THREE.Mesh(mergeGeometries(markGeos), new THREE.MeshStandardMaterial({
      color: 0xe8e4d8, roughness: 0.75
    }));
    markMesh.receiveShadow = false;
    this.scene.add(markMesh);

    this.roadMesh = roadMesh;
  }

  /* ---------- 4. граф дорог ---------- */
  _buildRoadGraph() {
    const idx = (i, j) => i * (GRID + 1) + j;
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        this.roadNodes.push({ id: idx(i, j), i, j, x: roadX(i), z: roadX(j), links: [] });
      }
    }
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const n = this.roadNodes[idx(i, j)];
        if (i < GRID) { n.links.push(idx(i + 1, j)); this.roadEdges.push([idx(i, j), idx(i + 1, j)]); }
        if (j < GRID) { n.links.push(idx(i, j + 1)); this.roadEdges.push([idx(i, j), idx(i, j + 1)]); }
        if (i > 0) n.links.push(idx(i - 1, j));
        if (j > 0) n.links.push(idx(i, j - 1));
      }
    }
  }

  /** Ближайший узел дорожной сети. */
  nearestNode(x, z) {
    const i = Math.round((x - OFFSET) / CELL);
    const j = Math.round((z - OFFSET) / CELL);
    const ci = Math.max(0, Math.min(GRID, i));
    const cj = Math.max(0, Math.min(GRID, j));
    return this.roadNodes[ci * (GRID + 1) + cj];
  }

  /** Поиск пути по графу дорог (A*). Возвращает массив узлов. */
  findPath(fromNode, toNode) {
    if (!fromNode || !toNode) return [];
    const open = [fromNode.id];
    const came = new Map();
    const gS = new Map([[fromNode.id, 0]]);
    const h = id => {
      const n = this.roadNodes[id];
      return Math.abs(n.x - toNode.x) + Math.abs(n.z - toNode.z);
    };
    const fS = new Map([[fromNode.id, h(fromNode.id)]]);
    const closed = new Set();
    let guard = 0;

    while (open.length && guard++ < 6000) {
      open.sort((a, b) => (fS.get(a) || 1e9) - (fS.get(b) || 1e9));
      const cur = open.shift();
      if (cur === toNode.id) {
        const path = [this.roadNodes[cur]];
        let c = cur;
        while (came.has(c)) { c = came.get(c); path.unshift(this.roadNodes[c]); }
        return path;
      }
      closed.add(cur);
      for (const nb of this.roadNodes[cur].links) {
        if (closed.has(nb)) continue;
        const tg = (gS.get(cur) || 0) + CELL;
        if (tg < (gS.get(nb) ?? 1e9)) {
          came.set(nb, cur);
          gS.set(nb, tg);
          fS.set(nb, tg + h(nb));
          if (!open.includes(nb)) open.push(nb);
        }
      }
    }
    return [];
  }

  /* ---------- 5. кварталы ---------- */
  _chunkGroup(i, j) {
    const key = `${Math.floor(i / CHUNK)},${Math.floor(j / CHUNK)}`;
    if (!this.chunks.has(key)) {
      const g = new THREE.Group();
      g.userData = { geos: {}, key, cx: 0, cz: 0, n: 0 };
      this.chunks.set(key, g);
    }
    return this.chunks.get(key);
  }

  _emit(i, j, parts) {
    const grp = this._chunkGroup(i, j);
    for (const k in parts) {
      (grp.userData.geos[k] || (grp.userData.geos[k] = [])).push(...parts[k]);
    }
  }

  _collide(x, z, w, d, h) {
    this.colliders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minZ: z - d / 2, maxZ: z + d / 2,
      h: h || 10
    });
  }

  _buildBlocks() {
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x0 = roadX(i) + ROAD / 2 + 3.2;
        const x1 = roadX(i + 1) - ROAD / 2 - 3.2;
        const z0 = roadX(j) + ROAD / 2 + 3.2;
        const z1 = roadX(j + 1) - ROAD / 2 - 3.2;
        const bx = (x0 + x1) / 2, bz = (z0 + z1) / 2;
        const bw = x1 - x0, bd = z1 - z0;
        const type = this.districts[i][j];

        switch (type) {
          case 'downtown':    this._blockTowers(i, j, bx, bz, bw, bd); break;
          case 'commercial':  this._blockPerimeter(i, j, bx, bz, bw, bd); break;
          case 'residential': this._blockHouses(i, j, bx, bz, bw, bd); break;
          case 'industrial':  this._blockIndustrial(i, j, bx, bz, bw, bd); break;
          case 'park':        this._blockPark(i, j, bx, bz, bw, bd); break;
          case 'parking':     this._blockParking(i, j, bx, bz, bw, bd); break;
          case 'plaza':       this._blockPlaza(i, j, bx, bz, bw, bd); break;
          case 'gas':         this._blockGas(i, j, bx, bz, bw, bd); break;
          case 'civic':       this._blockCivic(i, j, bx, bz, bw, bd); break;
        }
        this._streetFurniture(i, j, x0, z0, x1, z1, type);
      }
    }
  }

  /* --- уличная мебель по периметру квартала --- */
  _streetFurniture(i, j, x0, z0, x1, z1, type) {
    const r = this.rng;
    const edges = [
      { ax: x0, az: z0 - 1.4, bx: x1, bz: z0 - 1.4, rot: 0 },
      { ax: x0, az: z1 + 1.4, bx: x1, bz: z1 + 1.4, rot: Math.PI },
      { ax: x0 - 1.4, az: z0, bx: x0 - 1.4, bz: z1, rot: Math.PI / 2 },
      { ax: x1 + 1.4, az: z0, bx: x1 + 1.4, bz: z1, rot: -Math.PI / 2 }
    ];
    edges.forEach(e => {
      const len = Math.hypot(e.bx - e.ax, e.bz - e.az);
      const steps = Math.floor(len / 13);
      for (let s = 0; s <= steps; s++) {
        const t = steps === 0 ? 0.5 : s / steps;
        const x = e.ax + (e.bx - e.ax) * t;
        const z = e.az + (e.bz - e.az) * t;
        if (s % 2 === 0) this.props.add('streetlight', x, z, e.rot + Math.PI);
        else if (r.chance(0.5) && type !== 'industrial') this.props.add('tree', x, z, r.range(0, 6.28), r.range(0.85, 1.25));
        if (r.chance(0.16)) this.props.add('bin', x + 2, z, 0);
        if (r.chance(0.12) && type !== 'industrial') this.props.add('bench', x - 2.5, z, e.rot);
        if (r.chance(0.08)) this.props.add('hydrant', x + 3.5, z, 0);
      }
    });

    // светофоры на перекрёстке
    if (this.rng.chance(0.75)) {
      this.props.add('trafficLight', roadX(i) + ROAD / 2 + 1.2, roadX(j) + ROAD / 2 + 1.2, Math.PI * 0.75);
    }
    // остановка
    if (this.rng.chance(0.22)) {
      this.props.add('busStop', (x0 + x1) / 2, z0 - 2.0, 0);
      this.pois.push({ type: 'busstop', name: 'Остановка', x: (x0 + x1) / 2, z: z0 - 5 });
    }
  }

  /* --- даунтаун: башни --- */
  _blockTowers(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    const n = r.int(1, 3);
    const slots = n === 1 ? [[0, 0, bw * 0.62, bd * 0.62]]
      : n === 2 ? [[-bw * 0.22, 0, bw * 0.42, bd * 0.6], [bw * 0.24, 0, bw * 0.4, bd * 0.55]]
        : [[-bw * 0.25, -bd * 0.2, bw * 0.4, bd * 0.4],
           [bw * 0.22, -bd * 0.22, bw * 0.38, bd * 0.36],
           [0, bd * 0.26, bw * 0.55, bd * 0.36]];

    slots.forEach(([ox, oz, w, d]) => {
      const floors = r.int(10, 26);
      const shop = r.chance(0.55) ? 'shop' + r.int(0, 6) : null;
      const b = makeBuilding({
        rng: r, w, d, floors, x: bx + ox, z: bz + oz,
        style: 'office', facadeKey: 'f' + r.pick([0, 3, 5]),
        shopKey: shop, setbacks: true
      });
      this._emit(i, j, b.parts);
      this._collide(bx + ox, bz + oz, w, d, b.height);
      if (shop) this._registerShop(bx + ox, bz + oz + d / 2 + 2.5);
    });

    // плаза перед башнями
    this.props.add('planter', bx - bw * 0.35, bz + bd * 0.38, 0);
    this.props.add('planter', bx + bw * 0.35, bz + bd * 0.38, 0);
    if (r.chance(0.5)) this.props.add('atm', bx, bz + bd * 0.42, 0);
    if (r.chance(0.5)) this.pois.push({ type: 'atm', name: 'Банкомат', x: bx, z: bz + bd * 0.42 });
  }

  /* --- коммерческий: застройка по периметру --- */
  _blockPerimeter(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    const depth = r.range(15, 19);
    const sides = [
      { len: bw, cx: bx, cz: bz - bd / 2 + depth / 2, rot: 0, horiz: true },
      { len: bw, cx: bx, cz: bz + bd / 2 - depth / 2, rot: Math.PI, horiz: true },
      { len: bd, cx: bx - bw / 2 + depth / 2, cz: bz, rot: Math.PI / 2, horiz: false },
      { len: bd, cx: bx + bw / 2 - depth / 2, cz: bz, rot: -Math.PI / 2, horiz: false }
    ];

    sides.forEach(side => {
      const n = r.int(3, 5);
      const seg = side.len / n;
      for (let k = 0; k < n; k++) {
        const t = -side.len / 2 + seg * (k + 0.5);
        const x = side.horiz ? side.cx + t : side.cx;
        const z = side.horiz ? side.cz : side.cz + t;
        const w = side.horiz ? seg - 1.2 : depth;
        const d = side.horiz ? depth : seg - 1.2;
        const floors = r.int(3, 8);
        const shop = r.chance(0.72) ? 'shop' + r.int(0, 6) : null;
        const b = makeBuilding({
          rng: r, w, d, floors, x, z,
          style: r.pick(['office', 'residential', 'panel']),
          facadeKey: 'f' + r.int(0, 5),
          shopKey: shop, balconies: r.chance(0.5)
        });
        this._emit(i, j, b.parts);
        this._collide(x, z, w, d, b.height);
        if (shop) {
          const ox = side.horiz ? 0 : (side.cx < bx ? -1 : 1) * (depth / 2 + 2.5);
          const oz = side.horiz ? (side.cz < bz ? -1 : 1) * (depth / 2 + 2.5) : 0;
          this._registerShop(x + ox, z + oz);
        }
      }
    });

    // внутренний двор — парковка
    for (let k = 0; k < 6; k++) {
      this.parkingSpots.push({
        x: bx + r.range(-bw * 0.2, bw * 0.2),
        z: bz + r.range(-bd * 0.2, bd * 0.2),
        rot: r.chance(0.5) ? 0 : Math.PI / 2
      });
    }
  }

  /* --- жилой: частные дома + гаражи --- */
  _blockHouses(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    const cols = 3, rows = 3;
    const lw = bw / cols, ld = bd / rows;

    for (let a = 0; a < cols; a++) {
      for (let b = 0; b < rows; b++) {
        const lx = bx - bw / 2 + lw * (a + 0.5);
        const lz = bz - bd / 2 + ld * (b + 0.5);
        if (r.chance(0.12)) {
          // пустырь с деревьями
          for (let t = 0; t < 4; t++) {
            this.props.add('tree', lx + r.range(-lw / 3, lw / 3), lz + r.range(-ld / 3, ld / 3), r.range(0, 6.3), r.range(0.8, 1.2));
          }
          continue;
        }

        const rot = b === 0 ? 0 : b === rows - 1 ? Math.PI : (a === 0 ? Math.PI / 2 : -Math.PI / 2);
        const hw = Math.min(lw * 0.55, 11), hd = Math.min(ld * 0.5, 10);
        const h = makeHouse({ rng: r, x: lx, z: lz - ld * 0.08, rotY: rot, w: hw, d: hd, facadeKey: 'f' + r.pick([1, 2, 4]) });
        this._emit(i, j, h.parts);
        const sw = (rot % Math.PI === 0) ? hw : hd;
        const sd = (rot % Math.PI === 0) ? hd : hw;
        this._collide(lx, lz - ld * 0.08, sw, sd, h.height);

        // гараж
        const gx = lx + (rot % Math.PI === 0 ? lw * 0.3 : 0);
        const gz = lz + (rot % Math.PI === 0 ? 0 : ld * 0.3);
        const g = makeGarage({ x: gx, z: gz, rotY: rot });
        this._emit(i, j, g.parts);
        this._collide(gx, gz, 6.2, 6.4, 3.3);

        // забор по фасаду
        for (let f = -1; f <= 1; f++) {
          this.props.add('fence', lx + f * 4.0, lz + ld * 0.42, rot % Math.PI === 0 ? 0 : Math.PI / 2);
        }
        if (r.chance(0.6)) this.props.add('tree', lx + r.range(-lw * 0.3, lw * 0.3), lz + ld * 0.28, r.range(0, 6.3), r.range(0.7, 1.1));

        this.pois.push({
          type: 'house', name: 'Дом №' + (i * GRID + j) * 10 + a * 3 + b,
          x: lx, z: lz + ld * 0.3,
          price: 45000 + Math.round(r.range(0, 120000) / 1000) * 1000,
          garage: { x: gx, z: gz + 4, rot },
          id: `h${i}_${j}_${a}_${b}`
        });
      }
    }
  }

  /* --- промзона --- */
  _blockIndustrial(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    const n = r.int(1, 2);
    for (let k = 0; k < n; k++) {
      const w = bw * (n === 1 ? 0.75 : 0.42);
      const d = bd * 0.5;
      const x = bx + (n === 1 ? 0 : (k === 0 ? -bw * 0.24 : bw * 0.24));
      const z = bz - bd * 0.15;
      const wh = makeWarehouse({ rng: r, x, z, w, d });
      this._emit(i, j, wh.parts);
      this._collide(x, z, w, d, wh.height);
    }
    // контейнеры и забор
    for (let k = 0; k < 10; k++) {
      this.props.add('container',
        bx + r.range(-bw * 0.4, bw * 0.4),
        bz + bd * 0.3 + r.range(-6, 6),
        r.chance(0.5) ? 0 : Math.PI / 2, 1, r.chance(0.3) ? 2.6 : 0);
    }
    for (let f = 0; f < Math.floor(bw / 4); f++) {
      this.props.add('fence', bx - bw / 2 + f * 4 + 2, bz + bd / 2 - 1, 0);
    }
    this.props.add('lightPoleTall', bx - bw * 0.35, bz + bd * 0.35, 0);
    this.props.add('lightPoleTall', bx + bw * 0.35, bz + bd * 0.35, 0);

    this.pois.push({ type: 'job', job: 'cargo', name: 'Грузовой терминал', x: bx, z: bz + bd * 0.42 });
  }

  /* --- парк --- */
  _blockPark(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    // дорожки
    const paths = [];
    const mk = (cx, cz, w, d) => {
      const q = new THREE.PlaneGeometry(w, d);
      q.rotateX(-Math.PI / 2);
      q.translate(cx, 0.16, cz);
      return q;
    };
    paths.push(mk(bx, bz, bw * 0.9, 3.0));
    paths.push(mk(bx, bz, 3.0, bd * 0.9));
    const pm = new THREE.Mesh(mergeGeometries(paths), this.mats.concrete);
    pm.receiveShadow = true;
    this._chunkGroup(i, j).add(pm);

    // пруд
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(Math.min(bw, bd) * 0.17, 20).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x27506b, roughness: 0.06, metalness: 0.5 })
    );
    pond.position.set(bx + bw * 0.22, 0.12, bz - bd * 0.22);
    this._chunkGroup(i, j).add(pond);

    for (let k = 0; k < 28; k++) {
      const px = bx + r.range(-bw / 2 + 3, bw / 2 - 3);
      const pz = bz + r.range(-bd / 2 + 3, bd / 2 - 3);
      if (Math.abs(px - bx) < 2.5 || Math.abs(pz - bz) < 2.5) continue;
      this.props.add(r.chance(0.3) ? 'pine' : 'tree', px, pz, r.range(0, 6.3), r.range(0.9, 1.5));
    }
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      this.props.add('bench', bx + Math.cos(ang) * bw * 0.3, bz + Math.sin(ang) * bd * 0.3, -ang);
      this.props.add('streetlight', bx + Math.cos(ang + 0.4) * bw * 0.36, bz + Math.sin(ang + 0.4) * bd * 0.36, 0);
    }
    this.pois.push({ type: 'park', name: 'Городской парк', x: bx, z: bz });
    this.pois.push({ type: 'job', job: 'garbage', name: 'Уборка парка', x: bx - bw * 0.3, z: bz + bd * 0.3 });
  }

  /* --- парковка --- */
  _blockParking(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    const asph = getTex('asphalt');
    const q = new THREE.PlaneGeometry(bw, bd);
    q.rotateX(-Math.PI / 2);
    const uv = q.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * bw / 8, uv.getY(k) * bd / 8);
    q.translate(bx, 0.15, bz);
    const m = new THREE.Mesh(q, new THREE.MeshStandardMaterial({
      map: asph.map, normalMap: asph.normalMap, roughness: 0.95
    }));
    m.receiveShadow = true;
    this._chunkGroup(i, j).add(m);

    // разметка мест
    const lines = [];
    const rows = 4;
    for (let rr = 0; rr < rows; rr++) {
      const z = bz - bd / 2 + (rr + 0.5) * (bd / rows);
      const cnt = Math.floor(bw / 3.0);
      for (let c = 0; c <= cnt; c++) {
        const x = bx - bw / 2 + c * 3.0;
        const g = new THREE.PlaneGeometry(0.12, 5.0);
        g.rotateX(-Math.PI / 2);
        g.translate(x, 0.17, z);
        lines.push(g);
        if (c < cnt) this.parkingSpots.push({ x: x + 1.5, z, rot: 0 });
      }
    }
    const lm = new THREE.Mesh(mergeGeometries(lines), new THREE.MeshStandardMaterial({ color: 0xe0dccf }));
    this._chunkGroup(i, j).add(lm);

    this.props.add('lightPoleTall', bx - bw * 0.3, bz, 0);
    this.props.add('lightPoleTall', bx + bw * 0.3, bz, 0);
    for (let k = 0; k < 6; k++) this.props.add('bollard', bx - bw / 2 + k * (bw / 6), bz - bd / 2 - 1, 0);
    this.pois.push({ type: 'parking', name: 'Парковка', x: bx, z: bz });
  }

  /* --- площадь --- */
  _blockPlaza(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    const q = new THREE.PlaneGeometry(bw, bd);
    q.rotateX(-Math.PI / 2);
    const uv = q.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * bw / 4, uv.getY(k) * bd / 4);
    q.translate(bx, 0.16, bz);
    const side = getTex('sidewalk');
    const m = new THREE.Mesh(q, new THREE.MeshStandardMaterial({ map: side.map, normalMap: side.normalMap, roughness: 0.85 }));
    m.receiveShadow = true;
    this._chunkGroup(i, j).add(m);

    // фонтан
    const parts = {};
    const push = (k, g) => (parts[k] || (parts[k] = [])).push(g);
    const ring = new THREE.CylinderGeometry(6, 6.4, 0.8, 24, 1, true);
    ring.translate(bx, 0.4, bz);
    push('concrete', ring);
    const water = new THREE.CylinderGeometry(5.8, 5.8, 0.1, 24);
    water.translate(bx, 0.72, bz);
    push('glass', water);
    const col = new THREE.CylinderGeometry(0.6, 1.0, 3.0, 12);
    col.translate(bx, 1.6, bz);
    push('concrete', col);
    const bowl = new THREE.CylinderGeometry(2.0, 0.5, 0.5, 16);
    bowl.translate(bx, 3.3, bz);
    push('concrete', bowl);
    this._emit(i, j, parts);
    this._collide(bx, bz, 12.8, 12.8, 3.5);

    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      this.props.add('bench', bx + Math.cos(ang) * 11, bz + Math.sin(ang) * 11, -ang + Math.PI / 2);
      this.props.add('planter', bx + Math.cos(ang + 0.3) * 15, bz + Math.sin(ang + 0.3) * 15, 0);
    }
    this.props.add('atm', bx + bw * 0.35, bz, -Math.PI / 2);
    this.pois.push({ type: 'atm', name: 'Банкомат на площади', x: bx + bw * 0.35, z: bz });
    this.pois.push({ type: 'plaza', name: 'Центральная площадь', x: bx, z: bz });
  }

  /* --- заправка --- */
  _blockGas(i, j, bx, bz, bw, bd) {
    const parts = {};
    const push = (k, g) => (parts[k] || (parts[k] = [])).push(g);

    // навес
    push('trim', boxAt(22, 0.8, 14, bx, 5.6, bz, 4));
    [[-9, -5], [9, -5], [-9, 5], [9, 5]].forEach(([ox, oz]) => {
      push('metal', boxAt(0.6, 5.2, 0.6, bx + ox, 2.6, bz + oz, 2));
    });
    // магазин при заправке
    const shop = makeBuilding({
      rng: this.rng, w: 16, d: 10, floors: 1,
      x: bx, z: bz + bd * 0.3, style: 'office',
      facadeKey: 'f4', shopKey: 'shop2'
    });
    this._emit(i, j, shop.parts);
    this._collide(bx, bz + bd * 0.3, 16, 10, 5);

    // площадка
    const q = new THREE.PlaneGeometry(bw * 0.9, bd * 0.8);
    q.rotateX(-Math.PI / 2);
    q.translate(bx, 0.16, bz);
    this._chunkGroup(i, j).add(new THREE.Mesh(q, this.mats.concrete));

    this._emit(i, j, parts);
    this.props.add('fuelPump', bx - 5, bz, 0);
    this.props.add('fuelPump', bx + 5, bz, 0);
    this.props.add('bollard', bx - 11, bz - 6, 0);
    this.props.add('bollard', bx + 11, bz - 6, 0);

    this.pois.push({ type: 'gas', name: 'АЗС', x: bx, z: bz, price: 2.4 });
    this._registerShop(bx, bz + bd * 0.3 - 6, 'Минимаркет АЗС');
  }

  /* --- общественные здания --- */
  _blockCivic(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    const kind = r.pick(['police', 'hospital', 'cityhall', 'mall']);
    const w = bw * 0.72, d = bd * 0.5;
    const floors = kind === 'mall' ? 2 : r.int(3, 5);

    const b = makeBuilding({
      rng: r, w, d, floors, x: bx, z: bz - bd * 0.1,
      style: 'office', facadeKey: kind === 'mall' ? 'f3' : 'f0',
      shopKey: kind === 'mall' ? 'shop' + r.int(0, 6) : null
    });
    this._emit(i, j, b.parts);
    this._collide(bx, bz - bd * 0.1, w, d, b.height);

    // колонны у входа для ратуши
    if (kind === 'cityhall') {
      const parts = {};
      for (let c = -3; c <= 3; c++) {
        const col = new THREE.CylinderGeometry(0.6, 0.7, 7, 10);
        col.translate(bx + c * 3.4, 3.5, bz - bd * 0.1 + d / 2 + 2.5);
        (parts.concrete || (parts.concrete = [])).push(col);
      }
      (parts.trim || (parts.trim = [])).push(boxAt(24, 1.0, 6, bx, 7.4, bz - bd * 0.1 + d / 2 + 2.5, 4));
      this._emit(i, j, parts);
    }

    const names = {
      police: 'Полицейский участок', hospital: 'Больница',
      cityhall: 'Мэрия', mall: 'Торговый центр'
    };
    this.pois.push({ type: kind, name: names[kind], x: bx, z: bz - bd * 0.1 + d / 2 + 5 });

    if (kind === 'hospital') this.pois.push({ type: 'hospital_heal', name: 'Приёмный покой', x: bx, z: bz - bd * 0.1 + d / 2 + 5 });
    if (kind === 'police') this.pois.push({ type: 'job', job: 'police', name: 'Служба в полиции', x: bx + 6, z: bz - bd * 0.1 + d / 2 + 5 });
    if (kind === 'cityhall') this.pois.push({ type: 'job', job: 'courier', name: 'Курьерская служба', x: bx - 6, z: bz - bd * 0.1 + d / 2 + 5 });
    if (kind === 'mall') this._registerShop(bx, bz - bd * 0.1 + d / 2 + 4, 'Торговый центр');

    // парковка перед зданием
    for (let k = 0; k < 8; k++) {
      this.parkingSpots.push({ x: bx - w / 2 + k * (w / 8) + 2, z: bz + bd * 0.3, rot: 0 });
    }
    this.props.add('lightPoleTall', bx - w * 0.4, bz + bd * 0.32, 0);
    this.props.add('lightPoleTall', bx + w * 0.4, bz + bd * 0.32, 0);
  }

  /**
   * Гарантирует, что в городе есть редкие, но важные магазины:
   * оружейные и большие супермаркеты. Иначе рандом может их не выдать.
   */
  _assignSpecialShops() {
    const shops = this.pois.filter(p => p.type === 'shop');
    if (!shops.length) return;
    const force = [
      { kind: 'guns', name: 'Оружейный «Калибр»', count: 2 },
      { kind: 'clothes', name: 'Бутик «Витрина»', count: 1 },
      { kind: 'market', name: 'Супермаркет «Горизонт»', count: 1 }
    ];
    const used = new Set();
    for (const f of force) {
      for (let k = 0; k < f.count; k++) {
        // берём магазин подальше от уже выбранных, чтобы они не слиплись
        let best = null, bestScore = -1;
        for (let i = 0; i < shops.length; i++) {
          if (used.has(i)) continue;
          const s = shops[i];
          let d = 1e9;
          used.forEach(u => { d = Math.min(d, Math.hypot(shops[u].x - s.x, shops[u].z - s.z)); });
          const score = used.size ? d : Math.abs(s.x) + Math.abs(s.z);
          if (score > bestScore) { bestScore = score; best = i; }
        }
        if (best === null) return;
        used.add(best);
        shops[best].shopKind = f.kind;
        shops[best].name = f.count > 1 ? `${f.name} #${k + 1}` : f.name;
      }
    }
  }

  /* --- регистрация магазина --- */
  _registerShop(x, z, forced) {
    const kinds = [
      { id: 'market', name: 'Продуктовый' },
      { id: 'clothes', name: 'Одежда' },
      { id: 'electronics', name: 'Электроника' },
      { id: 'hardware', name: 'Хозтовары' },
      { id: 'cafe', name: 'Кафе' },
      { id: 'pharmacy', name: 'Аптека' },
      { id: 'autoparts', name: 'Автозапчасти' }
    ];
    const k = this.rng.pick(kinds);
    this.pois.push({
      type: 'shop', shopKind: k.id,
      name: forced || k.name, x, z
    });
  }

  /* ---------- 6. финализация чанков ---------- */
  _finishChunks() {
    this.chunks.forEach(grp => {
      const geos = grp.userData.geos;
      let sx = 0, sz = 0, n = 0;
      for (const key in geos) {
        const list = geos[key];
        if (!list.length) continue;
        const merged = mergeGeometries(list, false);
        list.forEach(g => g.dispose());
        if (!merged) continue;
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, this.mats[key] || this.mats.concrete);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        grp.add(mesh);
        const c = merged.boundingSphere.center;
        sx += c.x; sz += c.z; n++;
      }
      grp.userData.geos = null;
      grp.userData.cx = n ? sx / n : 0;
      grp.userData.cz = n ? sz / n : 0;
      this.scene.add(grp);
    });
  }

  /* ---------- рантайм ---------- */

  /** Выключает далёкие чанки — главный источник FPS на телефоне. */
  updateCulling(px, pz, radius) {
    this.chunks.forEach(grp => {
      const dx = grp.userData.cx - px;
      const dz = grp.userData.cz - pz;
      grp.visible = (dx * dx + dz * dz) < radius * radius;
    });
    this.props.updateCulling(px, pz, radius);
  }

  /** Подсветка окон и вывесок ночью. */
  setNight(amount) {
    const e = Math.pow(amount, 1.4);
    this.nightMats.forEach(m => { m.emissiveIntensity = e * 1.15; });
    this.props.setNight(amount);
  }

  /** Коллайдеры рядом с точкой. */
  /** Строит пространственную сетку коллайдеров — перебор всех 1500+ каждый кадр слишком дорог. */
  _buildColliderGrid() {
    this._grid = new SpatialGrid(24);
    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      this._grid.insertBox(b, b.minX, b.minZ, b.maxX, b.maxZ);
    }
    this._gridSize = this.colliders.length;
  }

  collidersNear(x, z, r) {
    if (!this._grid || this._gridSize !== this.colliders.length) this._buildColliderGrid();
    const cand = this._grid.query(x, z, r);
    const out = [];
    for (let i = 0; i < cand.length; i++) {
      const b = cand[i];
      if (b.maxX < x - r || b.minX > x + r || b.maxZ < z - r || b.minZ > z + r) continue;
      out.push(b);
    }
    return out;
  }

  /** Ближайший POI заданного типа. */
  nearestPoi(x, z, filter) {
    let best = null, bd = Infinity;
    for (const p of this.pois) {
      if (filter && !filter(p)) continue;
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best ? { poi: best, dist: Math.sqrt(bd) } : null;
  }

  poisOfType(type) { return this.pois.filter(p => p.type === type); }

  /** Случайная точка на проезжей части (для спавна трафика). */
  randomRoadPoint(rng) {
    const r = rng || this.rng;
    const horiz = r.chance(0.5);
    const i = r.int(0, GRID);
    const p = roadX(i);
    const t = r.range(OFFSET, -OFFSET);
    const lane = r.chance(0.5) ? 4.2 : -4.2;
    return horiz ? { x: t, z: p + lane, dir: lane > 0 ? -1 : 1, axis: 'x' }
                 : { x: p + lane, z: t, dir: lane > 0 ? 1 : -1, axis: 'z' };
  }
}

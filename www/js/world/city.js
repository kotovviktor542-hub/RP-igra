/* city.js — процедурный город: сетка улиц, районы, кварталы, тротуары, разметка,
   POI (магазины, работы, дома, гаражи, заправки), граф дорог для трафика и навигации. */

import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/BufferGeometryUtils.js';
import { getTex, getFacade, getStorefront } from '../core/textures.js';
import { makeRNG, boxAt, SpatialGrid } from '../core/utils.js';
import { makeBuilding, makeHouse, makeGarage, makeWarehouse, FLOOR_H } from './buildings.js';
import { PropSystem } from './props.js';
import { TrafficLights } from './trafficlights.js';
import { FACTIONS } from '../game/factions.js';

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
  mats.metalDark = new THREE.MeshStandardMaterial({ color: 0x2c3136, roughness: 0.68, metalness: 0.5 });
  mats.glass = new THREE.MeshStandardMaterial({
    color: 0x6f90a8, roughness: 0.08, metalness: 0.25,
    transparent: true, opacity: 0.62, envMapIntensity: 1.2
  });
  mats.roofTile = new THREE.MeshStandardMaterial({ color: 0x7a3b32, roughness: 0.8, flatShading: true });
  mats.brickTrim = new THREE.MeshStandardMaterial({ color: 0x8a5a46, roughness: 0.9 });
  mats.corrugated = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, roughness: 0.55, metalness: 0.5 });
  mats.garageDoor = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.5, metalness: 0.4 });

  // поля и просеки между городами
  const gt = getTex('grass');
  mats.grass = new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normalMap, roughness: 1.0 });
  const st = getTex('sidewalk');
  mats.dirt = new THREE.MeshStandardMaterial({
    map: st.map, normalMap: st.normalMap, color: 0x8a7450, roughness: 1.0
  });

  return mats;
}

/* ======================= ГОРОД ======================= */
/** Куда ставить базы организаций: ячейка сетки (i,j) для каждой фракции. */
/* ================== ГЕОГРАФИЯ ОБЛАСТИ ==================
   Карта воспроизводит географию Black Russia: не один город, а область
   (Нижегородская) из нескольких населённых пунктов, связанных трассами.
   Каждый город занимает свой прямоугольник кварталов сетки. */
export const SETTLEMENTS = [
  { id: 'nizhegorodsk', name: 'Нижегородск', i0: 0, i1: 2, j0: 0, j1: 2, char: 'port',
    note: 'порт, ж/д, заводы, контейнеры' },
  { id: 'garel',        name: 'Гарель',      i0: 0, i1: 1, j0: 4, j1: 6, char: 'lowtown',
    note: 'автосалон низкого класса' },
  { id: 'lytkarino',    name: 'Лыткарино',   i0: 0, i1: 2, j0: 8, j1: 10, char: 'fsb',
    note: 'ФСБ, рынок, авторынок, МЧС' },
  { id: 'rublevka',     name: 'Новая Рублёвка', i0: 4, i1: 5, j0: 0, j1: 1, char: 'elite',
    note: 'элитные дома' },
  { id: 'egorovka',     name: 'Егоровка',    i0: 6, i1: 7, j0: 0, j1: 1, char: 'village',
    note: 'деревня, АЗС' },
  { id: 'arzamas',      name: 'Арзамас',     i0: 4, i1: 7, j0: 4, j1: 7, char: 'center',
    note: 'центр области: автосалоны, ЖК «Видный»' },
  { id: 'koryakino',    name: 'Корякино',    i0: 4, i1: 5, j0: 9, j1: 10, char: 'village',
    note: 'деревня у трассы' },
  { id: 'yuzhny',       name: 'Южный',       i0: 8, i1: 10, j0: 0, j1: 2, char: 'gov',
    note: 'Правительство, Аукцион, Телебашня' },
  { id: 'busaevo',      name: 'Бусаево',     i0: 8, i1: 10, j0: 4, j1: 5, char: 'industrial',
    note: 'завод, ТК' },
  { id: 'batyrevo',     name: 'Батырево',    i0: 8, i1: 10, j0: 8, j1: 10, char: 'army',
    note: 'Военкомат, ВЧ, шахта, казино' }
];

/* Магистрали между городами: эти линии дорог — трассы (шире, быстрее).
   Границы кварталов городов лежат как раз на индексах 3 и 8. */
export const HIGHWAYS = [3, 8];

/* Базы организаций — как в Black Russia, по своим городам. */
const BASE_CELLS = [
  ['police', 10, 1],  // УМВД — Южный, центр отдаём Правительству
  ['smi',    8, 0],   // СМИ — Южный
  ['china', 10, 2],   // ОПГ — Южный
  ['fsin',   9, 4],   // тюрьма — юг карты, Бусаево
  ['army',   9, 9],   // Военкомат/ВЧ — Батырево
  ['skins', 10, 8],   // ОПГ — Батырево
  ['fsb',    1, 9],   // ФСБ — Лыткарино
  ['mchs',   0, 10],  // МЧС — Лыткарино
  ['gb',     5, 5],   // больница — Арзамас
  ['arzamas',6, 6],   // ОПГ «Арзамас» — Арзамас
  ['sgb',    1, 1],   // 2-я больница — Нижегородск
  ['moscow', 2, 0]    // ОПГ — Нижегородск
];

/** Какой город содержит квартал (i, j). */
export function settlementAtCell(i, j) {
  return SETTLEMENTS.find(s => i >= s.i0 && i <= s.i1 && j >= s.j0 && j <= s.j1) || null;
}

export class City {
  constructor(scene, seed = 20261007) {
    this.scene = scene;
    this.rng = makeRNG(seed);
    this.mats = buildMaterials();
    this.props = new PropSystem(scene, CELL);
    this.lights = new TrafficLights(scene);

    this.colliders = [];     // {minX,minZ,maxX,maxZ,h}
    this.pois = [];          // {type,name,x,z,...}
    this.chunks = new Map(); // "cx,cz" -> THREE.Group
    this.nightMats = [];
    this.districts = [];     // [i][j]
    this.cellTown = [];      // [i][j] -> населённый пункт
    this.settlementsList = SETTLEMENTS;   // для подписей на миникарте
    this.roadNodes = [];
    this.roadEdges = [];
    this.parkingSpots = [];
    this.pedPaths = [];      // точки для пешеходов
    this.bigMeshes = [];     // земля, дороги, разметка — для быстрого скрытия города
    this.benches = [];       // {x,z,rot} — на них можно присесть

    Object.values(this.mats).forEach(m => { if (m.userData.night) this.nightMats.push(m); });
  }

  generate() {
    this._planDistricts();
    this._buildGround();
    this._buildRoads();
    this._buildRoadGraph();
    this._buildBlocks();
    this.props.build();
    this.lights.build(this);
    this._assignSpecialShops();
    this._buildLandmarks();
    this._finishChunks();
    return this;
  }

  /** В каком населённом пункте находится точка мира. */
  settlementAt(x, z) {
    const i = Math.floor((x - OFFSET) / CELL);
    const j = Math.floor((z - OFFSET) / CELL);
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return null;
    return this.cellTown && this.cellTown[i] ? this.cellTown[i][j] : null;
  }

  /** Является ли дорога магистралью между городами. */
  isHighway(roadIndex) { return HIGHWAYS.includes(roadIndex); }

  /**
   * Стоит ли точка на магистрали (в пределах проезжей части).
   * На трассе лимит 90, в городе 60 — как в ПДД.
   */
  onHighway(x, z) {
    for (const k of HIGHWAYS) {
      const p = roadX(k);
      if (Math.abs(x - p) < ROAD / 2) return true;   // вдоль оси Z
      if (Math.abs(z - p) < ROAD / 2) return true;   // вдоль оси X
    }
    return false;
  }

  /* ---------- 1. районы ---------- */
  _planDistricts() {
    // Каждый квартал принадлежит своему населённому пункту и застраивается
    // по характеру города: центр — башни, окраина — частный сектор и т.д.
    this.cellTown = [];
    for (let i = 0; i < GRID; i++) {
      this.districts[i] = [];
      this.cellTown[i] = [];
      for (let j = 0; j < GRID; j++) {
        const s = settlementAtCell(i, j);
        this.cellTown[i][j] = s;
        this.districts[i][j] = s ? this._districtForTown(s, i, j) : 'field';
      }
    }

    // ЖК «Видный» в Арзамасе — те самые высотные «башни»
    [[4, 4], [4, 5]].forEach(([i, j]) => { this.districts[i][j] = 'downtown'; });
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
    // базы организаций занимают свои кварталы целиком
    for (const [id, i, j] of BASE_CELLS) {
      if (i === 2 && j === 2) continue;             // стартовый квартал не трогаем
      this.districts[i][j] = 'base:' + id;
    }

    // стартовый квартал игрока — всегда жилой с домами
    this.districts[2][2] = 'residential';
  }

  /**
   * Характер застройки квартала внутри города.
   * rel — нормированное расстояние от центра города (0 — центр, 1 — окраина).
   */
  _districtForTown(s, i, j) {
    const ci = (s.i0 + s.i1) / 2, cj = (s.j0 + s.j1) / 2;
    // не меньше 1, иначе в узких городах (2 квартала) rel всегда = 1
    const ri = Math.max(1, (s.i1 - s.i0) / 2), rj = Math.max(1, (s.j1 - s.j0) / 2);
    // среднее, а не максимум: иначе в квадратных городах rel принимает
    // только 0 или 1 и промежуточных зон не получается
    const rel = (Math.abs(i - ci) / ri + Math.abs(j - cj) / rj) / 2;

    switch (s.char) {
      case 'center':      // Арзамас: деловое ядро, торговое кольцо, жильё
        return rel <= 0.35 ? 'downtown' : rel <= 0.7 ? 'commercial' : 'residential';
      case 'gov':         // Южный: административный центр + деловой квартал
        return rel <= 0.4 ? 'civic' : rel <= 0.75 ? 'downtown' : 'commercial';
      case 'port':        // Нижегородск: промзона у воды, склады, жильё
        return (i <= s.i0 + 1 && j <= s.j0 + 1) ? 'industrial'
          : rel <= 0.55 ? 'commercial' : 'residential';
      case 'fsb':         // Лыткарино: торговый город с рынком
        return rel <= 0.5 ? 'commercial' : 'residential';
      case 'army':        // Батырево: частный сектор и промзона у шахты
        return (i >= s.i1 - 1 && j >= s.j1 - 1) ? 'industrial' : 'residential';
      case 'industrial':  // Бусаево: заводская зона
        return rel <= 0.6 ? 'industrial' : 'residential';
      case 'elite':       // Новая Рублёвка: только частные дома
        return 'residential';
      case 'village':     // Егоровка, Корякино: деревня
        return 'residential';
      case 'lowtown':     // Гарель: автосалон и жилые дворы
        return rel <= 0.5 ? 'commercial' : 'residential';
      default: return 'residential';
    }
  }


  /* ---------- ориентиры городов, как в Black Russia ---------- */
  _buildLandmarks() {
    const byId = id => SETTLEMENTS.find(s => s.id === id);

    // центр города в мировых координатах
    const center = s => ({
      x: (roadX(s.i0) + roadX(s.i1 + 1)) / 2,
      z: (roadX(s.j0) + roadX(s.j1 + 1)) / 2
    });

    /* --- Южный: телебашня, Правительство, Аукцион, причал --- */
    const yuz = byId('yuzhny');
    const yc = center(yuz);
    this._makeTvTower(roadX(yuz.i0) + CELL * 0.5, roadX(yuz.j0) + CELL * 0.5, yuz);
    this.pois.push({ type: 'landmark', name: 'Телебашня Южного',
      x: roadX(yuz.i0) + CELL * 0.5, z: roadX(yuz.j0) + CELL * 0.5 });
    this.pois.push({ type: 'landmark', name: 'Правительство', x: yc.x, z: yc.z - CELL * 0.6 });
    this.pois.push({ type: 'landmark', name: 'Аукцион', x: yc.x + CELL * 0.7, z: yc.z });

    /* --- Нижегородск: морской порт и вокзал --- */
    const niz = byId('nizhegorodsk');
    this._makePort(roadX(niz.i0) + CELL * 0.4, roadX(niz.j0) + CELL * 0.4);
    this.pois.push({ type: 'landmark', name: 'Порт Нижегородска',
      x: roadX(niz.i0) + CELL * 0.4, z: roadX(niz.j0) + CELL * 0.4 });
    this.pois.push({ type: 'landmark', name: 'Ж/д вокзал',
      x: roadX(niz.i1 + 1) - CELL * 0.5, z: roadX(niz.j0) + CELL * 0.5 });

    /* --- Батырево: шахта, военкомат, казино --- */
    const bat = byId('batyrevo');
    this._makeMine(roadX(bat.i1 + 1) - CELL * 0.5, roadX(bat.j1 + 1) - CELL * 0.5);
    this.pois.push({ type: 'landmark', name: 'Шахта',
      x: roadX(bat.i1 + 1) - CELL * 0.5, z: roadX(bat.j1 + 1) - CELL * 0.5 });
    this.pois.push({ type: 'landmark', name: 'Военкомат',
      x: roadX(bat.i0) + CELL * 0.5, z: roadX(bat.j0) + CELL * 0.5 });
    this.pois.push({ type: 'landmark', name: 'Казино «Батырево»',
      x: roadX(bat.i0) + CELL * 1.5, z: roadX(bat.j0) + CELL * 0.5 });

    /* --- Лыткарино: рынок и авторынок --- */
    const lyt = byId('lytkarino');
    this.pois.push({ type: 'landmark', name: 'Рынок Лыткарино',
      x: roadX(lyt.i0) + CELL * 0.6, z: roadX(lyt.j0) + CELL * 0.6 });
    this.pois.push({ type: 'landmark', name: 'Авторынок',
      x: roadX(lyt.i0) + CELL * 1.8, z: roadX(lyt.j1 + 1) - CELL * 0.6 });

    /* --- Бусаево: завод --- */
    const bus = byId('busaevo');
    this.pois.push({ type: 'landmark', name: 'Завод Бусаево',
      x: roadX(bus.i0) + CELL * 0.6, z: roadX(bus.j0) + CELL * 0.6 });
  }

  /* Телебашня: решётчатая опора, корзина и антенна. */
  _makeTvTower(x, z, town) {
    const grp = this._chunkGroup(
      Math.max(0, Math.min(GRID - 1, town.i0)),
      Math.max(0, Math.min(GRID - 1, town.j0))
    );
    const H = 74, steel = this.mats.metal, dark = this.mats.metalDark;
    const parts = [];

    // три ноги, сходящиеся кверху
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const segs = 9;
      for (let s = 0; s < segs; s++) {
        const t0 = s / segs, t1 = (s + 1) / segs;
        const r0 = 7.5 * (1 - t0 * 0.86), r1 = 7.5 * (1 - t1 * 0.86);
        const y0 = t0 * H * 0.62, y1 = t1 * H * 0.62;
        const p0 = new THREE.Vector3(Math.cos(a) * r0, y0, Math.sin(a) * r0);
        const p1 = new THREE.Vector3(Math.cos(a) * r1, y1, Math.sin(a) * r1);
        const dir = new THREE.Vector3().subVectors(p1, p0);
        const len = dir.length();
        const g = new THREE.CylinderGeometry(0.34, 0.42, len, 6);
        g.translate(0, len / 2, 0);
        g.rotateX(Math.PI / 2);
        g.lookAt(dir);
        g.rotateX(Math.PI / 2);
        g.translate(p0.x, p0.y, p0.z);
        parts.push({ geo: g, mat: steel });
      }
      // раскосы
      for (let s = 0; s < 6; s++) {
        const t0 = s / 6, t1 = (s + 1) / 6;
        const y = t0 * H * 0.62;
        const rr = 7.5 * (1 - t0 * 0.86);
        const g = new THREE.CylinderGeometry(0.16, 0.16, rr * 1.7, 5);
        g.rotateZ(Math.PI / 2.4);
        g.translate(Math.cos(a + 0.5) * rr * 0.6, y + 3, Math.sin(a + 0.5) * rr * 0.6);
        parts.push({ geo: g, mat: dark });
      }
    }

    // ствол выше ног
    const mast = new THREE.CylinderGeometry(0.5, 1.5, H * 0.4, 8);
    mast.translate(0, H * 0.62 + H * 0.2, 0);
    parts.push({ geo: mast, mat: steel });

    // антенна
    const ant = new THREE.CylinderGeometry(0.12, 0.3, 12, 6);
    ant.translate(0, H + 6, 0);
    parts.push({ geo: ant, mat: dark });

    const m = new THREE.Group();
    parts.forEach(p => { const mesh = new THREE.Mesh(p.geo, p.mat); mesh.castShadow = true; m.add(mesh); });

    // корзина обслуживания
    const basket = new THREE.Mesh(
      new THREE.CylinderGeometry(4.2, 3.4, 2.6, 12),
      this.mats.concrete
    );
    basket.position.y = H * 0.60;
    basket.castShadow = true;
    m.add(basket);

    // сигнальный огонь
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 2.4 })
    );
    beacon.position.y = H + 12.4;
    m.add(beacon);

    m.position.set(x, 0, z);
    grp.add(m);
  }

  /* Порт: причал, вода, козловые краны и контейнеры. */
  _makePort(x, z) {
    const i = Math.max(0, Math.min(GRID - 1, Math.round((x - OFFSET) / CELL)));
    const j = Math.max(0, Math.min(GRID - 1, Math.round((z - OFFSET) / CELL)));
    const grp = this._chunkGroup(i, j);

    // вода
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x22414f, roughness: 0.12, metalness: 0.6 })
    );
    water.position.set(x - 46, 0.06, z - 46);
    grp.add(water);

    // причальная стенка
    const quay = new THREE.Mesh(
      new THREE.BoxGeometry(70, 1.2, 46),
      this.mats.concrete
    );
    quay.position.set(x, 0.6, z);
    quay.receiveShadow = true;
    quay.castShadow = true;
    grp.add(quay);
    this._collide(x, z, 70, 46, 1.2);

    // два козловых крана
    [-18, 18].forEach(dx => {
      const cr = new THREE.Group();
      const legs = [];
      [[-9, -6], [9, -6], [-9, 6], [9, 6]].forEach(([lx, lz]) => {
        const g = new THREE.BoxGeometry(1.1, 26, 1.1);
        g.translate(lx, 13, lz);
        legs.push(g);
      });
      const lm = new THREE.Mesh(mergeGeometries(legs), this.mats.metal);
      lm.castShadow = true;
      cr.add(lm);

      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(30, 1.4, 1.6),
        new THREE.MeshStandardMaterial({ color: 0xd8452f, roughness: 0.5, metalness: 0.4 })
      );
      beam.position.y = 26.6;
      beam.castShadow = true;
      cr.add(beam);

      const trolley = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 2.2, 2.6), this.mats.metalDark
      );
      trolley.position.set(4, 25.2, 0);
      cr.add(trolley);

      const cable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 12, 5), this.mats.metalDark
      );
      cable.position.set(4, 18.6, 0);
      cr.add(cable);

      cr.position.set(x + dx, 1.2, z);
      grp.add(cr);
    });

    // штабеля контейнеров
    const colors = [0xb4472f, 0x2f6bb4, 0x3f8f4a, 0xb08a2f, 0x6a6f75];
    for (let k = 0; k < 14; k++) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(6.1, 2.6, 2.4),
        new THREE.MeshStandardMaterial({ color: colors[k % colors.length], roughness: 0.7, metalness: 0.25 })
      );
      const row = (k / 5) | 0;
      c.position.set(x - 26 + (k % 5) * 6.6, 1.2 + 2.6 + row * 2.7, z + 14);
      c.castShadow = true;
      grp.add(c);
    }

    this.props.add('fence', x + 34, z, Math.PI / 2);
    this.pois.push({ type: 'job', job: 'diver', name: 'Порт — подводные работы', x: x - 30, z: z - 30 });
  }

  /* Шахта: копр, конвейер и отвалы породы. */
  _makeMine(x, z) {
    const i = Math.max(0, Math.min(GRID - 1, Math.round((x - OFFSET) / CELL)));
    const j = Math.max(0, Math.min(GRID - 1, Math.round((z - OFFSET) / CELL)));
    const grp = this._chunkGroup(i, j);

    // копр — А-образная вышка над стволом
    const frame = new THREE.Group();
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const g = new THREE.BoxGeometry(0.9, 30, 0.9);
      g.translate(sx * 5, 15, sz * 5);
      const m = new THREE.Mesh(g, this.mats.metalDark);
      m.castShadow = true;
      frame.add(m);
    });
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(12, 1.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xc0563a, roughness: 0.6, metalness: 0.3 })
    );
    top.position.y = 30.4;
    top.castShadow = true;
    frame.add(top);

    // шкив
    const wheel = new THREE.Mesh(
      new THREE.TorusGeometry(2.6, 0.4, 8, 18), this.mats.metal
    );
    wheel.position.set(0, 32.6, 0);
    wheel.rotation.y = Math.PI / 2;
    frame.add(wheel);

    frame.position.set(x, 0, z);
    grp.add(frame);

    // здание ствола
    const shed = new THREE.Mesh(
      new THREE.BoxGeometry(16, 9, 14), this.mats.corrugated
    );
    shed.position.set(x, 4.5, z);
    shed.castShadow = true;
    shed.receiveShadow = true;
    grp.add(shed);
    this._collide(x, z, 16, 14, 9);

    // конвейер
    const belt = new THREE.Mesh(
      new THREE.BoxGeometry(26, 0.6, 2.2), this.mats.metalDark
    );
    belt.position.set(x + 18, 5.4, z);
    belt.rotation.z = -0.22;
    belt.castShadow = true;
    grp.add(belt);

    // отвалы породы
    for (let k = 0; k < 5; k++) {
      const pile = new THREE.Mesh(
        new THREE.ConeGeometry(6 + k * 0.6, 4.2 + k * 0.5, 9),
        this.mats.dirt
      );
      pile.position.set(x - 22 + k * 7, 2.1 + k * 0.25, z + 22);
      pile.castShadow = true;
      grp.add(pile);
    }

    this.pois.push({ type: 'job', job: 'mine', name: 'Шахта — спуск в забой', x: x + 12, z: z + 8 });
    this.pois.push({ type: 'job', job: 'miner', name: 'Рудник — редкая руда', x: x + 16, z: z + 12 });
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
    this.bigMeshes.push(mesh);
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
    this.bigMeshes.push(roadMesh);

    const walkMesh = new THREE.Mesh(mergeGeometries(walkGeos), new THREE.MeshStandardMaterial({
      map: side.map, normalMap: side.normalMap, roughness: 0.88
    }));
    walkMesh.receiveShadow = true;
    this.scene.add(walkMesh);
    this.bigMeshes.push(walkMesh);

    const markMesh = new THREE.Mesh(mergeGeometries(markGeos), new THREE.MeshStandardMaterial({
      color: 0xe8e4d8, roughness: 0.75
    }));
    markMesh.receiveShadow = false;
    this.scene.add(markMesh);
    this.bigMeshes.push(markMesh);

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
          case 'field':       this._blockField(i, j, bx, bz, bw, bd); break;
          default:
            if (typeof type === 'string' && type.startsWith('base:')) {
              this._blockFactionBase(i, j, bx, bz, bw, bd, type.slice(5));
            }
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
        if (r.chance(0.12) && type !== 'industrial') this.addBench(x - 2.5, z, e.rot);
        if (r.chance(0.08)) this.props.add('hydrant', x + 3.5, z, 0);
      }
    });

    // светофоры ставит отдельная система TrafficLights (рабочие фазы)
    // остановка
    if (this.rng.chance(0.22)) {
      this.props.add('busStop', (x0 + x1) / 2, z0 - 2.0, 0);
      this.pois.push({ type: 'busstop', name: 'Остановка', x: (x0 + x1) / 2, z: z0 - 5 });
    }
  }

  /* --- поля и лес между населёнными пунктами --- */
  _blockField(i, j, bx, bz, bw, bd) {
    const r = this.rng;
    const grp = this._chunkGroup(i, j);

    // вспаханное поле
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(bw * 0.88, bd * 0.88).rotateX(-Math.PI / 2),
      this.mats.dirt
    );
    strip.position.set(bx, 0.03, bz);
    strip.receiveShadow = true;
    grp.add(strip);

    // борозды одним батчем
    const furrows = [];
    for (let k = -5; k <= 5; k++) {
      const f = new THREE.BoxGeometry(bw * 0.84, 0.14, bd * 0.026);
      f.translate(bx, 0.10, bz + k * bd * 0.078);
      furrows.push(f);
    }
    const fm = new THREE.Mesh(mergeGeometries(furrows), this.mats.grass);
    fm.receiveShadow = true;
    grp.add(fm);

    // лесополоса
    const n = r.int(4, 8);
    for (let k = 0; k < n; k++) {
      const a = r.range(0, Math.PI * 2);
      const rad = r.range(bw * 0.2, bw * 0.44);
      this.props.add(r.chance(0.35) ? 'pine' : 'tree',
        bx + Math.cos(a) * rad, bz + Math.sin(a) * rad,
        r.range(0, 6.28), r.range(0.9, 1.6));
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
        const style = r.pick(['office', 'residential', 'panel']);
        const b = makeBuilding({
          rng: r, w, d, floors, x, z,
          style,
          facadeKey: 'f' + r.int(0, 5),
          shopKey: shop, balconies: r.chance(0.5)
        });
        this._emit(i, j, b.parts);
        this._collide(x, z, w, d, b.height);
        // в жилом доме есть подъезд: можно купить квартиру
        if (style !== 'office' && r.chance(0.55)) {
          const dx = side.horiz ? 0 : (side.cx < bx ? -1 : 1) * (depth / 2 + 2.2);
          const dz = side.horiz ? (side.cz < bz ? -1 : 1) * (depth / 2 + 2.2) : 0;
          const flat = r.int(1, floors * 4);
          this.pois.push({
            type: 'apartment',
            name: `Квартира №${flat}`,
            x: x + dx, z: z + dz,
            floor: Math.max(1, Math.ceil(flat / 4)),
            price: 18000 + Math.round(r.range(0, 52000) / 500) * 500,
            id: `a${i}_${j}_${Math.round(x)}_${Math.round(z)}`
          });
        }
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
      this.addBench(bx + Math.cos(ang) * bw * 0.3, bz + Math.sin(ang) * bd * 0.3, -ang);
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
      this.addBench(bx + Math.cos(ang) * 11, bz + Math.sin(ang) * 11, -ang + Math.PI / 2);
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
   * База организации: главный корпус, пристройки, забор с воротами,
   * служебная парковка, мачты освещения и опознавательные детали.
   * Для армии — вышки и ангар, для ФСИН — глухая стена и вышки,
   * для ОПГ — склад с контейнерами во дворе.
   */
  _blockFactionBase(i, j, bx, bz, bw, bd, id) {
    const r = this.rng;
    const f = FACTIONS[id];
    if (!f) return;
    const gang = f.type === 'gang';

    // главный корпус
    const w = bw * (gang ? 0.46 : 0.62);
    const d = bd * (gang ? 0.34 : 0.4);
    const hx = bx, hz = bz - bd * 0.14;
    const floors = gang ? 2 : (id === 'army' || id === 'fsin' ? 2 : 4);
    const b = makeBuilding({
      rng: r, w, d, floors, x: hx, z: hz,
      style: gang ? 'panel' : 'office',
      facadeKey: 'f' + (gang ? 2 : 0),
      shopKey: null, setbacks: !gang
    });
    this._emit(i, j, b.parts);
    this._collide(hx, hz, w, d, b.height);

    // пристройка-ангар / гараж техники
    const gw = Math.min(bw * 0.3, 20), gd = Math.min(bd * 0.22, 14);
    const gx = bx - bw * 0.3, gz = bz + bd * 0.22;
    const wh = makeWarehouse({ rng: r, x: gx, z: gz, w: gw, d: gd, h: gang ? 5 : 7 });
    this._emit(i, j, wh.parts);
    this._collide(gx, gz, gw, gd, 7);

    // забор по периметру участка с воротами со стороны дороги
    const fx0 = bx - bw * 0.46, fx1 = bx + bw * 0.46;
    const fz0 = bz - bd * 0.46, fz1 = bz + bd * 0.46;
    const step = 4.0;
    for (let x = fx0; x <= fx1; x += step) {
      if (Math.abs(x - bx) < 6) continue;           // проём ворот
      this.props.add('fence', x, fz1, 0);
      this.props.add('fence', x, fz0, 0);
    }
    for (let z = fz0; z <= fz1; z += step) {
      this.props.add('fence', fx0, z, Math.PI / 2);
      this.props.add('fence', fx1, z, Math.PI / 2);
    }

    // вышки охраны у армии и ФСИН
    if (id === 'army' || id === 'fsin') {
      const parts = {};
      for (const [tx, tz] of [[fx0 + 2, fz0 + 2], [fx1 - 2, fz0 + 2], [fx0 + 2, fz1 - 2], [fx1 - 2, fz1 - 2]]) {
        (parts.concrete || (parts.concrete = [])).push(boxAt(2.0, 9, 2.0, tx, 4.5, tz, 3));
        (parts.roof || (parts.roof = [])).push(boxAt(3.4, 0.5, 3.4, tx, 9.3, tz, 3));
        (parts.glass || (parts.glass = [])).push(boxAt(2.6, 1.8, 2.6, tx, 8.3, tz, 0));
      }
      this._emit(i, j, parts);
    }

    // контейнеры и мусор во дворе у ОПГ
    if (gang) {
      for (let k = 0; k < 5; k++) {
        this.props.add('container', bx + r.range(-bw * 0.3, bw * 0.3), bz + r.range(0, bd * 0.3), r.chance(0.5) ? 0 : Math.PI / 2);
      }
      for (let k = 0; k < 3; k++) this.props.add('bin', bx + r.range(-bw * 0.3, bw * 0.3), bz + r.range(-bd * 0.1, bd * 0.3), 0);
    } else {
      this.props.add('lightPoleTall', fx0 + 4, fz1 - 4, 0);
      this.props.add('lightPoleTall', fx1 - 4, fz1 - 4, 0);
      this.props.add('sign', bx - 5, fz1 - 1.5, 0);
    }

    // служебная парковка организации
    const spots = [];
    for (let k = 0; k < 6; k++) {
      const sx = bx + bw * 0.18 + (k % 3) * 3.4;
      const sz = bz + bd * 0.1 + Math.floor(k / 3) * 6;
      spots.push({ x: sx, z: sz, rot: 0 });
      this.parkingSpots.push({ x: sx, z: sz, rot: 0 });
    }

    const entryZ = hz + d / 2 + 4;
    this.pois.push({
      type: 'base', faction: id, name: 'База: ' + f.name,
      x: hx, z: entryZ,
      zone: { x: bx, z: bz, r: Math.max(bw, bd) * 0.5 },
      garage: { x: gx, z: gz + gd / 2 + 3, rot: 0 },
      spots
    });
    // тюрьма ФСИН — отдельная точка внутри базы
    if (id === 'fsin') {
      this.pois.push({ type: 'prison', faction: 'fsin', name: 'Городская тюрьма', x: hx + 8, z: entryZ });
    }
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
      { kind: 'market', name: 'Супермаркет «Горизонт»', count: 1 },
      { kind: 'driving', name: 'Автошкола «Старт»', count: 1 },
      { kind: 'tuning', name: 'Автосервис «Гараж 63»', count: 2 },
      { kind: 'notary', name: 'Нотариус', count: 1 },
      { kind: 'business', name: 'Биржа бизнесов', count: 1 }
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
  /** Ставит скамейку и запоминает её — на скамейку можно присесть. */
  addBench(x, z, rot) {
    this.props.add('bench', x, z, rot);
    this.benches.push({ x, z, rot });
  }

  /** Ближайшая скамейка в радиусе. */
  nearestBench(x, z, maxDist = 3) {
    let best = null, bd = maxDist;
    for (const b of this.benches) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) { bd = d; best = b; }
    }
    return best ? { bench: best, dist: bd } : null;
  }

  /** Прячет/показывает весь город целиком (используется при входе в помещение). */
  /** Обновление светофоров — вызывать каждый кадр. */
  updateLights(dt) {
    this.lights.update(dt);
    this.lights.refresh();
  }

  setVisible(on) {
    this.lights.setVisible(on);
    this.hidden = !on;
    this.bigMeshes.forEach(m => { m.visible = on; });
    this.chunks.forEach(g => { g.visible = on; });   // дистанционное отсечение вернёт своё на первом же кадре
    this.props.setVisible(on);
  }

  updateCulling(px, pz, radius) {
    if (this.hidden) return;
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

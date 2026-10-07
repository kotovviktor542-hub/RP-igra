/* main.js — сборка игры: загрузка мира, меню, игровой цикл, взаимодействия. */

import * as THREE from '../vendor/three.module.js';
import { Engine, defaultQuality } from './core/engine.js';
import { makeRNG, dist2D, fmtMoney, clamp } from './core/utils.js';

const FIST_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11.2V8.6a1.5 1.5 0 0 1 3 0v2.2"/><path d="M10 10.6V7.8a1.5 1.5 0 0 1 3 0v2.8"/><path d="M13 10.8V8.4a1.5 1.5 0 0 1 3 0v2.6"/><path d="M6.5 10.5h10a2.5 2.5 0 0 1 2.5 2.5v1.6A5.4 5.4 0 0 1 13.6 20h-3A5.1 5.1 0 0 1 5.5 15v-3a1.5 1.5 0 0 1 1-1.5z"/><path d="M5.6 12.6H4.3a1.4 1.4 0 0 1 0-2.8h1.4"/></svg>';
const WEAPON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5h14.5a1 1 0 0 1 1 1V12H8.8l-1.2 3.2A2 2 0 0 1 5.7 16.5H4.2a1.2 1.2 0 0 1-1.1-1.6L4.6 11H3a1 1 0 0 1-1-1v-.5a1 1 0 0 1 1-1z"/><path d="M18.5 10.5H21"/><path d="M12.5 12v1.6"/></svg>';
import { City, GRID, CELL, roadX, OFFSET } from './world/city.js';
import { Player } from './entities/player.js';
import { Vehicle, VEHICLES, CAR_COLORS } from './entities/vehicle.js';
import { Traffic, Pedestrians, Police } from './entities/ai.js';
import { HUD } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { Chat } from './ui/chat.js';
import { BigMap } from './ui/map.js';
import { Creator } from './ui/creator.js';
import { OnlineScreen } from './ui/online.js';
import { Auth } from './net/auth.js';
import { RoomClient } from './net/room.js';
import { Controls } from './ui/controls.js';
import { RadialMenu } from './ui/radial.js';
import { preloadCharacters } from './entities/character.js';
import { NetClient } from './net/client.js';
import * as S from './game/state.js';
import { ITEMS, JOBS, ECONOMY } from './game/content.js';
import { BUILD, checkForUpdate, applyUpdate, lockLandscape, watchOrientation } from './core/updater.js';

const VERSION = '0.3.0';
const WORLD_SEED = 20261007;
const $ = id => document.getElementById(id);
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

const LOAD_HINTS = [
  'Совет: держи кнопку БЕГ, чтобы ускориться.',
  'Совет: подойди к машине и нажми E — сядешь за руль.',
  'Совет: тапни по карте, чтобы поставить метку маршрута.',
  'Совет: следи за топливом — на АЗС можно заправиться.',
  'Совет: голод и жажда отнимают здоровье. Заходи в магазин.',
  'Совет: /me и /do работают как в настоящем RP-чате.',
  'Совет: работа курьером доступна сразу, без прав.'
];

class Game {
  constructor() {
    this.engine = null;
    this.city = null;
    this.player = null;        // данные (сейв)
    this.player3d = null;      // контроллер
    this.worldVehicles = [];
    this.parkedSlots = [];
    this.waypoint = null;
    this.paused = true;
    this._jumpLatch = false;
    this._saveAcc = 0;
    this._visitAcc = 0;
  }

  /* ======================= ЗАГРУЗКА ======================= */
  async boot() {
    $('menu-version').textContent = 'v' + VERSION;
    $('load-hint').textContent = LOAD_HINTS[(Math.random() * LOAD_HINTS.length) | 0];

    const step = async (pct, text) => {
      $('load-bar').style.width = pct + '%';
      $('load-text').textContent = text;
      await frame();
    };

    await step(6, 'Запуск рендерера…');
    const qual = defaultQuality();
    this.engine = new Engine($('gl'), qual);
    this.scene = this.engine.scene;
    this.camera = this.engine.camera;

    await step(12, 'Загрузка моделей персонажа…');
    await preloadCharacters().catch(() => 0);

    await step(16, 'Генерация текстур…');
    await frame();

    await step(32, 'Планировка города…');
    this.city = new City(this.scene, WORLD_SEED);
    this.city._planDistricts();
    await frame();

    await step(46, 'Дороги и тротуары…');
    this.city._buildGround();
    this.city._buildRoads();
    this.city._buildRoadGraph();
    await frame();

    await step(62, 'Застройка кварталов…');
    this.city._buildBlocks();
    await frame();

    await step(78, 'Деревья, фонари, мелочь…');
    this.city.props.build();
    this.city.props.setDetail(this.engine.quality.props);
    // губернатор качества сам меняет населённость города
    this.engine.onQualityChange = (q) => this._applyQuality(q);
    await frame();

    await step(88, 'Оптимизация геометрии…');
    this.city._finishChunks();
    await frame();

    await step(94, 'Подготовка транспорта…');
    this._prepareParking();
    await frame();

    await step(98, 'Почти готово…');
    this.hud = new HUD();
    this.panels = new Panels(this);
    this.chat = new Chat(this);
    this.bigmap = new BigMap(this);
    this.net = new NetClient(this);
    this.controls = new Controls(this);
    this.radial = new RadialMenu(this);

    this.traffic = new Traffic(this.scene, this.city, this.engine.quality.traffic);
    this.peds = new Pedestrians(this.scene, this.city, this.engine.quality.npc);
    this.police = new Police(this.scene, this.city);
    this.wanted = 0;            // уровень розыска 0…5
    this._crimeCool = 0;

    this.auth = new Auth();
    this.pendingServer = null;      // {url, name} — куда заходим после создания персонажа

    this.creator = new Creator(
      data => this.startNewGame(data),
      () => $('menu').classList.remove('hidden')
    );

    this.online = new OnlineScreen(this, this.auth);

    lockLandscape();
    watchOrientation($('rotate'));
    this._bindMenu();
    this.engine.add((dt) => this.update(dt));
    this.engine.start();

    await step(100, 'Готово');
    await new Promise(r => setTimeout(r, 180));
    $('loader').classList.add('hidden');
    this._showMenu();
  }

  _bindMenu() {
    const saved = S.load();
    if (saved) $('btn-continue').classList.remove('hidden');

    $('btn-continue').addEventListener('click', () => {
      const d = S.load();
      if (!d) { this.hud.toast('Сохранение не найдено', 'bad'); return; }
      // продолжаем на сервере: сначала выбор комнаты, мир грузится сразу
      $('menu').classList.add('hidden');
      this.loadGame(d);
      this.online.show();
    });
    $('btn-online').addEventListener('click', () => {
      $('menu').classList.add('hidden');
      this.online.show();
    });
    $('btn-new').addEventListener('click', () => {
      $('menu').classList.add('hidden');
      this.pendingServer = null;
      this.creator.show();
    });
    $('btn-servers').addEventListener('click', () => {
      $('menu').classList.add('hidden');
      if (!this.player) {
        // нужен персонаж, чтобы подключиться
        this.creator.show();
        this.hud.toast('Сначала создай персонажа', 'bad');
        return;
      }
      this.hud.show();
      this.panels.open('servers');
    });
    $('btn-update').addEventListener('click', () => this.checkUpdate(true));
    $('menu-version').textContent = 'v' + VERSION + (BUILD ? ' · сборка ' + BUILD : ' · dev');
    // тихая автопроверка при запуске
    setTimeout(() => this.checkUpdate(false), 2500);

    $('btn-settings').addEventListener('click', () => {
      if (!this.player) { this.hud.toast('Сначала начни игру'); return; }
      $('menu').classList.add('hidden');
      this.hud.show();
      this.panels.open('settings');
    });
  }

  /**
   * Заход на сервер: если персонажа ещё нет — сперва создание,
   * затем подключение и синхронизация профиля с сервером.
   */
  joinServer(server) {
    if (typeof server === 'string') server = { url: server, name: server, kind: 'ws' };
    this.pendingServer = server;
    if (!this.player) {
      const saved = S.load();
      if (saved) this.loadGame(saved);
      else {
        this.hud.toast('Создай персонажа для сервера');
        this.creator.show();
        return;
      }
    } else {
      this._enterWorld();
    }
    this.hud.show();
    this.connectServer(server);
  }

  /** Сервер подтвердил аккаунт: подтягиваем облачное сохранение. */
  onServerAuth(m) {
    this.serverAccount = { kind: m.kind, nick: m.nick, guest: !!m.guest };
    const ok = m.save && typeof m.save === 'object' && m.save.stats && m.save.inventory;
    if (ok) {
      try {
        this.loadGame(m.save);
        this.hud.toast('Профиль загружен с сервера', 'good');
      } catch (e) {
        this.hud.toast('Профиль с сервера повреждён, играю с локальным', 'bad');
      }
    } else if (this.player) {
      this.net.pushSave(this.player);      // первый вход — заливаем свой профиль
    }
  }

  /** Проверка обновления. loud=true — показывать результат всегда. */
  async checkUpdate(loud = true) {
    const btn = $('btn-update');
    if (loud && btn) btn.textContent = 'Проверяю…';
    const r = await checkForUpdate();
    if (r.status === 'update') {
      if (btn) {
        btn.textContent = 'Обновить до сборки ' + r.build;
        btn.classList.add('primary');
        btn.onclick = () => applyUpdate(r.build);
      }
      this.hud?.toast?.('Доступно обновление: сборка ' + r.build, 'good');
    } else if (r.status === 'fresh') {
      if (btn) btn.textContent = 'У тебя последняя версия';
      if (loud) this.hud?.toast?.('Установлена последняя версия', 'good');
      if (btn) setTimeout(() => { btn.textContent = 'Проверить обновление'; }, 2500);
    } else {
      if (btn) btn.textContent = 'Нет сети';
      if (loud) this.hud?.toast?.('Нет связи с сервером обновлений', 'bad');
      if (btn) setTimeout(() => { btn.textContent = 'Проверить обновление'; }, 2500);
    }
    return r;
  }

  _showMenu() {
    $('menu').classList.remove('hidden');
    this.paused = true;
  }

  /* ======================= СТАРТ ИГРЫ ======================= */
  startNewGame(data) {
    const spawn = this._spawnPoint();
    this.player = S.createPlayer({ name: data.name, look: data.look, x: spawn.x, z: spawn.z });
    this._enterWorld();
    this.chat.add(`Добро пожаловать в город, ${this.player.name}!`, 'sys');
    this.hud.toast('Новая жизнь начинается', 'good');
    this._giveStarterKit();
    if (this.pendingServer) this.connectServer(this.pendingServer);
  }

  loadGame(saveData) {
    this.player = saveData;
    this._enterWorld();
    this.chat.add(`С возвращением, ${this.player.name}.`, 'sys');
  }

  _giveStarterKit() {
    S.addItem(this.player, 'sandwich', 2);
    S.addItem(this.player, 'water', 2);
    S.addItem(this.player, 'phone', 1);
  }

  _spawnPoint() {
    // на тротуаре жилого квартала (2,2)
    return { x: roadX(2) + CELL * 0.5, z: roadX(2) + 11 };
  }

  _enterWorld() {
    $('menu').classList.add('hidden');
    $('loader').classList.add('hidden');
    this.hud.show();

    if (!this.player3d) {
      this.player3d = new Player(this.scene, this.camera, this.player.look);
    } else {
      this.player3d.setLook(this.player.look);
    }
    // качественная скелетная модель подгружается фоном и подменяет заглушку
    if (!this.player3d.usingModel) {
      this.player3d.upgradeModel(this.player.look).then(() => this.syncWeapon()).catch(() => {});
    }
    const p = this.player.pos || this._spawnPoint();
    this.player3d.teleport(p.x, p.z, p.rot || 0);
    this.player3d.distWalked = this.player.stats2.distWalked || 0;
    this.player3d.distDriven = this.player.stats2.distDriven || 0;

    this._restoreOwnedVehicles();
    this.wanted = 0;
    this.police.setMax(0);
    this.police.dispose();
    this.syncWeapon();
    this.paused = false;
  }

  quitToMenu() {
    this.saveGame(true);
    this.panels.close();
    this.bigmap.hide();
    this.hud.hide();
    this.paused = true;
    $('btn-continue').classList.remove('hidden');
    $('menu').classList.remove('hidden');
  }

  confirmWipe() {
    this.dialog('Удалить сохранение?', 'Весь прогресс будет стёрт безвозвратно.', [
      { label: 'Да, удалить', cls: 'danger', fn: () => {
        S.wipe();
        location.reload();
      } },
      { label: 'Отмена', cls: '' }
    ]);
  }

  /* ======================= ПАРКОВКА И ТРАНСПОРТ ======================= */
  _prepareParking() {
    const rng = makeRNG(4242);
    const spots = this.city.parkingSpots;
    const types = ['sedan', 'hatch', 'suv', 'pickup', 'van', 'taxi', 'sports'];
    // часть мест занята «ничьими» машинами
    spots.forEach(s => {
      if (!rng.chance(0.34)) return;
      this.parkedSlots.push({
        x: s.x, z: s.z, rot: s.rot + (rng.chance(0.5) ? 0 : Math.PI),
        type: rng.pick(types),
        color: CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)],
        live: null
      });
    });
    // плюс машины у обочин
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        if (!rng.chance(0.34)) continue;
        const x = roadX(i) + (rng.chance(0.5) ? 7.2 : -7.2);
        const z = roadX(j) + CELL * rng.range(0.25, 0.75);
        this.parkedSlots.push({
          x, z, rot: rng.chance(0.5) ? 0 : Math.PI,
          type: rng.pick(types),
          color: CAR_COLORS[rng.int(0, CAR_COLORS.length - 1)],
          live: null
        });
      }
    }
  }

  _streamParked(px, pz) {
    const IN = 95, OUT = 140;
    const MAX_LIVE = this.engine.quality.traffic;   // не больше, чем трафика
    let live = 0;
    for (const slot of this.parkedSlots) if (slot.live) live++;

    for (const slot of this.parkedSlots) {
      const d = dist2D(slot.x, slot.z, px, pz);
      if (!slot.live && d < IN && live < MAX_LIVE) {
        live++;
        const v = new Vehicle(slot.type, slot.color, slot.x, slot.z, slot.rot, true);
        v.fuel = 25 + Math.random() * 50;
        this.scene.add(v.mesh);
        slot.live = v;
        this.worldVehicles.push(v);
      } else if (slot.live && d > OUT) {
        if (this.player3d && this.player3d.vehicle === slot.live) continue;
        this.scene.remove(slot.live.mesh);
        slot.live.dispose();
        this.worldVehicles = this.worldVehicles.filter(v => v !== slot.live);
        slot.live = null;
      }
    }
  }

  _restoreOwnedVehicles() {
    this.player.vehicles.forEach(rec => {
      if (rec.stored) return;
      if (this.worldVehicles.some(v => v.plate === rec.plate)) return;
      const v = new Vehicle(rec.type, rec.color, rec.x, rec.z, rec.rot);
      v.plate = rec.plate;
      v.fuel = rec.fuel;
      v.damage = rec.damage;
      v.ownerPlate = rec.plate;
      this.scene.add(v.mesh);
      this.worldVehicles.push(v);
    });
  }

  isVehicleSpawned(plate) {
    return this.worldVehicles.some(v => v.plate === plate);
  }

  summonVehicle(plate) {
    const rec = this.player.vehicles.find(v => v.plate === plate);
    if (!rec) return;
    const existing = this.worldVehicles.find(v => v.plate === plate);
    if (existing) {
      this.setWaypoint(existing.pos.x, existing.pos.z, VEHICLES[rec.type].name + ' ' + plate);
      this.panels.close();
      this.hud.toast('Метка поставлена на твою машину');
      return;
    }
    const p = this.player3d.pos;
    const ang = this.player3d.heading;
    const sx = p.x + Math.sin(ang + 1.2) * 6;
    const sz = p.z + Math.cos(ang + 1.2) * 6;
    const v = new Vehicle(rec.type, rec.color, sx, sz, ang + Math.PI / 2);
    v.plate = plate;
    v.fuel = rec.fuel;
    v.damage = rec.damage;
    v.ownerPlate = plate;
    this.scene.add(v.mesh);
    this.worldVehicles.push(v);
    rec.stored = false;
    this.panels.close();
    this.hud.toast('Транспорт подан', 'good');
  }

  buyVehicle(type) {
    const spec = VEHICLES[type];
    const color = CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0];
    const r = S.buyVehicle(this.player, type, spec.price, color);
    if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }
    this.hud.toast(`Куплен ${spec.name} · ${r.plate}`, 'good');
    this.chat.add(`Вы купили ${spec.name} (${r.plate}) за ${fmtMoney(spec.price)}`, 'money');
    S.questEvent(this.player, 'buy_vehicle');
    this.panels.refresh();
    this.saveGame();
  }

  sellVehicle(plate) {
    const live = this.worldVehicles.find(v => v.plate === plate);
    if (live) {
      if (this.player3d.vehicle === live) this.player3d.exitVehicle();
      this.scene.remove(live.mesh);
      live.dispose();
      this.worldVehicles = this.worldVehicles.filter(v => v !== live);
    }
    const r = S.sellVehicle(this.player, plate);
    if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }
    this.hud.toast(`Продано за ${fmtMoney(r.gain)}`, 'good');
    this.panels.refresh();
  }

  /* ======================= ВЗАИМОДЕЙСТВИЕ ======================= */
  _findInteraction() {
    const p3 = this.player3d;
    const px = p3.pos.x, pz = p3.pos.z;

    if (p3.mode === 'drive') {
      // в машине — проверяем точку смены и заправку
      const job = this._jobStopNear(px, pz, 9);
      if (job) return { kind: 'jobstop', label: 'Сдать точку', data: job };
      const gas = this.city.nearestPoi(px, pz, x => x.type === 'gas');
      if (gas && gas.dist < 14) return { kind: 'gas', label: 'Заправиться', data: gas.poi };
      return { kind: 'exit', label: 'Выйти из машины' };
    }

    // транспорт рядом
    let bestV = null, bd = 3.2;
    for (const v of this.worldVehicles) {
      if (v.driver) continue;
      const d = dist2D(v.pos.x, v.pos.z, px, pz) - v.spec.W * 0.4;
      if (d < bd) { bd = d; bestV = v; }
    }

    const job = this._jobStopNear(px, pz, 6);
    if (job) return { kind: 'jobstop', label: 'Сдать точку', data: job };

    const checks = [
      ['shop', 5.5, x => x.type === 'shop', p => 'Войти: ' + p.name],
      ['gas', 8, x => x.type === 'gas', () => 'Заправка / магазин'],
      ['atm', 3.5, x => x.type === 'atm', () => 'Банкомат'],
      ['hospital_heal', 7, x => x.type === 'hospital_heal', () => 'Лечение — 350 $'],
      ['house', 6, x => x.type === 'house', p => S.ownsProperty(this.player, p.id)
        ? 'Твой дом: ' + p.name : `Купить ${p.name} — ${fmtMoney(p.price)}`],
      ['job', 6, x => x.type === 'job', p => 'Работа: ' + p.name],
      ['mall', 7, x => x.type === 'mall', () => 'Автосалон и магазины'],
      ['cityhall', 8, x => x.type === 'cityhall', () => 'Мэрия — получить права']
    ];

    for (const [kind, range, filter, label] of checks) {
      const r = this.city.nearestPoi(px, pz, filter);
      if (r && r.dist < range) {
        if (bestV && bd < 1.6) break;
        return { kind, label: label(r.poi), data: r.poi };
      }
    }

    if (bestV) return { kind: 'enter', label: `Сесть: ${bestV.spec.name} (${bestV.plate})`, data: bestV };

    const npc = this.peds.nearest(px, pz, 2.8);
    if (npc) return { kind: 'npc', label: 'Поговорить: ' + npc.name, data: npc };

    return null;
  }

  _jobStopNear(x, z, range) {
    const job = this.player?.job;
    if (!job) return null;
    const stop = job.stops[job.current];
    if (!stop) return null;
    return dist2D(stop.x, stop.z, x, z) < range ? stop : null;
  }

  interact() {
    if (this.paused || !this.player) return;
    // всегда пересчитываем: кэш нужен только для подсказки на экране
    const it = this._findInteraction();
    if (!it) { this.hud.toast('Рядом ничего нет'); return; }
    this._doInteraction(it);
  }

  _doInteraction(it) {
    const p = this.player;
    switch (it.kind) {
      case 'enter': {
        it.data.upgradeMesh(this.scene);
        this.player3d.enterVehicle(it.data);
        this.controls.setDrivingMode(true);
        this.hud.showSpeedo(true);
        S.questEvent(p, 'enter_vehicle');
        this.hud.toast(`${it.data.spec.name} · ${Math.round(it.data.fuel)} л топлива`);
        break;
      }
      case 'exit': {
        const v = this.player3d.vehicle;
        if (v && v.speedKmh > 12) { this.hud.toast('Сначала притормози', 'bad'); return; }
        this.player3d.exitVehicle();
        this.controls.setDrivingMode(false);
        this.hud.showSpeedo(false);
        if (v && v.ownerPlate) {
          const rec = p.vehicles.find(r => r.plate === v.ownerPlate);
          if (rec) { rec.x = v.pos.x; rec.z = v.pos.z; rec.rot = v.heading; rec.fuel = v.fuel; rec.damage = v.damage; rec.stored = false; }
        }
        break;
      }
      case 'shop':
        this.panels.open('shop', it.data);
        break;
      case 'mall':
        this.panels.open('dealership');
        break;
      case 'atm':
        this.panels.open('bank');
        break;
      case 'gas':
        this._refuelDialog();
        break;
      case 'hospital_heal': {
        if (p.stats.health >= 99) { this.hud.toast('Ты здоров'); return; }
        if (p.money < ECONOMY.hospitalFee) { this.hud.toast('Не хватает денег', 'bad'); return; }
        p.money -= ECONOMY.hospitalFee;
        p.stats.health = 100;
        this.hud.toast('Подлечили. −' + ECONOMY.hospitalFee + ' $', 'good');
        break;
      }
      case 'house': {
        if (S.ownsProperty(p, it.data.id)) {
          this.dialog(it.data.name, 'Твоя собственность.\nЗдесь можно отдохнуть и восстановить силы.', [
            { label: 'Отдохнуть (+энергия)', cls: 'good', fn: () => {
              p.stats.energy = 100;
              p.stats.health = Math.min(100, p.stats.health + 25);
              this.engine.time = (this.engine.time + 8) % 24;
              this.hud.toast('Выспался. Энергия восстановлена', 'good');
            } },
            { label: 'Закрыть', cls: '' }
          ]);
        } else {
          this.dialog(it.data.name, `Дом с гаражом.\nЦена: ${fmtMoney(it.data.price)}\nУ тебя: ${fmtMoney(p.money)}`, [
            { label: 'Купить', cls: 'primary', fn: () => {
              const r = S.buyProperty(p, it.data);
              if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }
              this.hud.toast('Поздравляю с покупкой!', 'gold');
              this.chat.add(`Вы купили ${it.data.name} за ${fmtMoney(it.data.price)}`, 'money');
              S.questEvent(p, 'buy_house');
              this.saveGame();
            } },
            { label: 'Отмена', cls: '' }
          ]);
        }
        break;
      }
      case 'cityhall': {
        if (p.licenses.drive) { this.hud.toast('Права уже есть'); return; }
        const cost = 800;
        this.dialog('Мэрия', `Водительское удостоверение открывает работы таксистом,\nдальнобойщиком, водителем автобуса и в полиции.\n\nСтоимость: ${fmtMoney(cost)}`, [
          { label: 'Получить права', cls: 'primary', fn: () => {
            if (p.money < cost) { this.hud.toast('Не хватает денег', 'bad'); return; }
            p.money -= cost;
            p.licenses.drive = true;
            this.hud.toast('Права получены!', 'gold');
          } },
          { label: 'Позже', cls: '' }
        ]);
        break;
      }
      case 'job': {
        const jobId = it.data.job;
        if (p.job) { this.panels.open('jobs'); return; }
        const def = JOBS[jobId];
        if (!def) { this.panels.open('jobs'); return; }
        this.dialog(def.name, `${def.desc}\n\nТочек: ${def.stops}\nОплата: ${def.payPerStop} $ за точку + ${def.bonus} $ бонус`, [
          { label: 'Выйти на смену', cls: 'primary', fn: () => this.startJob(jobId) },
          { label: 'Все вакансии', cls: '', fn: () => this.panels.open('jobs') },
          { label: 'Отмена', cls: '' }
        ]);
        break;
      }
      case 'jobstop':
        this._completeStop();
        break;
      case 'npc': {
        const n = it.data;
        this.chat.add(n.line, '', n.name);
        this.dialog(n.name, n.line, [
          { label: 'Поболтать', cls: '', fn: () => {
            p.stats.energy = Math.max(0, p.stats.energy - 1);
            this.chat.add('Приятно поговорить. Удачи!', '', n.name);
            p.rep += 0;
          } },
          { label: 'Дать 50 $', cls: 'good', fn: () => {
            if (p.money < 50) { this.hud.toast('Нет денег', 'bad'); return; }
            p.money -= 50; p.rep += 1;
            this.chat.add(`${n.name} благодарит за помощь (+1 репутация)`, 'money');
          } },
          { label: 'Уйти', cls: '' }
        ]);
        break;
      }
    }
    this.panels.refresh();
  }

  _refuelDialog() {
    const v = this.player3d.vehicle;
    if (!v) { this.hud.toast('Нужно быть в машине'); return; }
    const need = Math.ceil(v.maxFuel - v.fuel);
    if (need <= 0) { this.hud.toast('Бак полон'); return; }
    const cost = Math.ceil(need * ECONOMY.fuelPricePerL);
    const repairCost = Math.ceil(v.damage * 100 * ECONOMY.repairCostPerPercent);

    const actions = [
      { label: `Полный бак (${need} л) — ${fmtMoney(cost)}`, cls: 'primary', fn: () => {
        if (this.player.money < cost) { this.hud.toast('Не хватает денег', 'bad'); return; }
        this.player.money -= cost;
        v.refuel(need);
        this.hud.toast('Заправлено', 'good');
      } }
    ];
    if (v.damage > 0.01) {
      actions.push({ label: `Ремонт (${Math.round(v.damage * 100)}%) — ${fmtMoney(repairCost)}`, cls: 'good', fn: () => {
        if (this.player.money < repairCost) { this.hud.toast('Не хватает денег', 'bad'); return; }
        this.player.money -= repairCost;
        v.repair();
        this.hud.toast('Машина как новая', 'good');
      } });
    }
    actions.push({ label: 'Отмена', cls: '' });
    this.dialog('АЗС', `Топливо: ${Math.round(v.fuel)}/${v.maxFuel} л\nЦена: ${ECONOMY.fuelPricePerL} $/л`, actions);
  }

  /* ======================= РАБОТЫ ======================= */
  startJob(jobId) {
    const def = JOBS[jobId];
    const stops = this._generateStops(def.stops);
    const r = S.startJob(this.player, jobId, stops);
    if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }

    if (def.cargo) S.addItem(this.player, def.cargo, 1);
    this.hud.toast(`Смена начата: ${def.name}`, 'good');
    this.chat.add(`Смена начата: ${def.name}. Точек: ${def.stops}`, 'sys');
    S.questEvent(this.player, 'job_start');
    this.panels.close();
    this._updateJobWaypoint();
  }

  _generateStops(n) {
    const rng = makeRNG(Date.now() & 0xffff);
    const out = [];
    const px = this.player3d.pos.x, pz = this.player3d.pos.z;
    for (let i = 0; i < n; i++) {
      for (let t = 0; t < 40; t++) {
        const bi = rng.int(0, GRID - 1), bj = rng.int(0, GRID - 1);
        const x = roadX(bi) + CELL * 0.5 + rng.range(-12, 12);
        const z = roadX(bj) + 11;
        const d = dist2D(x, z, px, pz);
        if (d > 90 && d < 700) { out.push({ x, z }); break; }
      }
    }
    while (out.length < n) out.push({ x: px + 100, z: pz + 100 });
    return out;
  }

  _completeStop() {
    const def = JOBS[this.player.job.id];
    const r = S.completeStop(this.player);
    if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }

    if (r.finished) {
      if (def.cargo) S.removeItem(this.player, def.cargo, 99);
      this.hud.toast(`Смена закрыта: +${fmtMoney(r.total)}`, 'gold');
      this.chat.add(`Смена «${def.name}» завершена. Заработано ${fmtMoney(r.total)}`, 'money');
      S.questEvent(this.player, 'job_finish');
      this.waypoint = null;
      this.hud.setTracker(null);
      this.saveGame();
    } else {
      this.hud.toast(`Точка сдана: +${def.payPerStop} $`, 'good');
      this._updateJobWaypoint();
    }
    this.panels.refresh();
  }

  cancelJob() {
    const r = S.cancelJob(this.player);
    if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }
    this.hud.toast(`Смена брошена. +${fmtMoney(r.earned)}`);
    this.waypoint = null;
    this.hud.setTracker(null);
    this.panels.refresh();
  }

  _updateJobWaypoint() {
    const job = this.player.job;
    if (!job) return;
    const stop = job.stops[job.current];
    if (stop) this.waypoint = { x: stop.x, z: stop.z, name: 'Точка смены' };
  }

  /* ======================= МАГАЗИН / ПРЕДМЕТЫ ======================= */
  buyItem(id, qty) {
    const r = S.buyItem(this.player, id, qty);
    if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }
    this.hud.toast(r.messages[0], 'good');
    S.questEvent(this.player, 'buy_cat', { cat: ITEMS[id].cat });
    this.panels.refresh();
  }

  sellItem(id) {
    const r = S.sellItem(this.player, id, 1);
    if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }
    this.hud.toast(r.messages[0], 'good');
    this.panels.refresh();
  }

  useItem(id) {
    const r = S.useItem(this.player, id, { vehicle: this.player3d.vehicle });
    if (!r.ok) { this.hud.toast(r.reason, 'bad'); return; }
    this.hud.toast(r.messages[0], 'good');
    if (r.equip !== undefined || id === 'pistol') this.syncWeapon();
    if (r.worn) {
      const map = { shirt: 'shirt', pants: 'pants', shoes: 'shoes' };
      // смена внешнего вида по одежде
      const colorByItem = { tshirt: 0xd8d8d2, jacket: 0x2b3340, suit: 0x1e2230, jeans: 0x33415c, sneakers: 0xe0e0da };
      if (colorByItem[id] !== undefined && map[r.worn]) {
        this.player.look[map[r.worn]] = colorByItem[id];
        this.player3d.setLook(this.player.look);
      }
    }
    S.questEvent(this.player, 'use_cat', { cat: ITEMS[id].cat });
    this.panels.refresh();
  }

  /* ======================= ПРОЧЕЕ UI ======================= */
  dialog(title, text, actions) {
    $('dialog-title').textContent = title;
    $('dialog-text').textContent = text;
    const box = $('dialog-actions');
    box.innerHTML = '';
    actions.forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.cls || '');
      b.textContent = a.label;
      b.onclick = () => {
        $('dialog').classList.add('hidden');
        if (a.fn) a.fn();
        this.panels.refresh();
      };
      box.appendChild(b);
    });
    $('dialog').classList.remove('hidden');
  }

  setWaypoint(x, z, name) {
    this.waypoint = { x, z, name: name || 'Метка' };
    this.hud.toast('Маршрут: ' + this.waypoint.name);
  }

  openMap() { this.bigmap.show(); }
  closeMap() { this.bigmap.hide(); }
  toggleMap() { this.bigmap.visible ? this.bigmap.hide() : this.bigmap.show(); }

  /** Игрока ударили. */
  hurtPlayer(dmg, who) {
    const p = this.player;
    p.stats.health = Math.max(0, p.stats.health - dmg);
    this.hud.flashDamage && this.hud.flashDamage();
    if (who && !this._hitMsgCd) {
      this._hitMsgCd = 1.2;
      this.chat.add(`* ${who} бьёт тебя`, 'sys');
    }
    if (p.stats.health <= 0) this._onDeath();
  }

  /** Добавляет розыск. */
  addWanted(amount, reason) {
    const before = Math.floor(this.wanted);
    this.wanted = Math.min(5, this.wanted + amount);
    this._crimeCool = 20;
    const now = Math.floor(this.wanted);
    if (now > before) {
      this.hud.toast(`Розыск: ${now} ${now === 1 ? 'звезда' : 'звёзды'}${reason ? ' · ' + reason : ''}`, 'bad');
      this.chat.add(`* Полиция объявила розыск (${now})`, 'sys');
    }
  }

  /** Задержание: штраф и доставка в участок. */
  _arrest() {
    const p = this.player;
    const fine = Math.min(p.money, 150 + Math.floor(this.wanted) * 200);
    p.money -= fine;
    this.wanted = 0;
    this.police.setMax(0);
    this.police.dispose();
    if (this.player3d.vehicle) {
      this.player3d.exitVehicle();
      this.controls.setDrivingMode(false);
    }
    const st = this.city.nearestPoi(this.player3d.pos.x, this.player3d.pos.z,
      x => x.type === 'police' || x.type === 'cityhall');
    if (st) this.player3d.teleport(st.poi.x, st.poi.z + 6, 0);
    this.player.equipped = null;
    this.player.ammo = 0;
    this.syncWeapon();
    this.hud.toast(`Задержан. Штраф ${fine} $, оружие изъято`, 'bad');
    this.chat.add('* Тебя задержали', 'sys');
  }

  /** Кнопка атаки: с оружием в руках — выстрел, иначе удар кулаком. */
  attack() {
    if (this.player.equipped === 'pistol') this.shoot();
    else this.punch();
  }

  /** Выстрел: отдача, вспышка, попадание по лучу от камеры. */
  shoot() {
    const p3 = this.player3d;
    if (!p3) return;
    if (p3.vehicle) { this.hud.toast('Из машины не постреляешь'); return; }
    if (!this.player.ammo) { this.hud.toast('Нет патронов'); return; }
    if (!p3.aiming) this.toggleAim(true);
    if (!p3.fire()) return;                       // ещё не перезарядился

    this.player.ammo--;
    this.chat.add('*выстрел*', 'sys');

    // луч из камеры вперёд
    const cam = this.camera;
    const ox = cam.position.x, oz = cam.position.z;
    const dx = Math.sin(p3.camYaw), dz = Math.cos(p3.camYaw);
    const probe = (tx, tz) => {
      const rx = tx - ox, rz = tz - oz;
      const along = rx * dx + rz * dz;
      if (along < 1 || along > 70) return 0;
      const miss = Math.hypot(rx - dx * along, rz - dz * along);
      return miss > 0.8 ? 0 : along;
    };

    let best = null, bestT = 1e9, isCop = false;
    for (const n of this.peds.list) {
      if (n.state === 'down') continue;
      const t2 = probe(n.h.root.position.x, n.h.root.position.z);
      if (t2 && t2 < bestT) { bestT = t2; best = n; }
    }
    for (const c of this.police.list) {
      if (c.down) continue;
      const t2 = probe(c.h.root.position.x, c.h.root.position.z);
      if (t2 && t2 < bestT) { bestT = t2; best = c; isCop = true; }
    }

    this.addWanted(isCop ? 2 : 1, 'стрельба');
    this.peds.scare(p3.pos.x, p3.pos.z, 30);

    if (!best) { this.hud.toast(`Мимо · патронов ${this.player.ammo}`); return; }
    if (isCop) {
      const r = this.police.hit(best, 60);
      this.hud.toast(r === 'down' ? `Патрульный ранен · патронов ${this.player.ammo}`
        : `Попал в патрульного · патронов ${this.player.ammo}`, 'bad');
      if (r === 'down') this.addWanted(1.5, 'ранен полицейский');
      return;
    }
    const r = this.peds.hit(best, 65, p3.pos.x, p3.pos.z);
    this.chat.add(`* Попадание: ${best.name}`, 'sys');
    this.hud.toast(`${r === 'down' ? best.name + ' упал' : 'Попал по ' + best.name} · патронов ${this.player.ammo}`, 'bad');
    if (r === 'down') this.addWanted(1.5, 'тяжкое');
  }

  /** Синхронизирует оружие в руке с инвентарём. */
  syncWeapon() {
    const p3 = this.player3d;
    if (!p3) return;
    const kind = this.player.equipped === 'pistol' ? 'pistol' : null;
    if (p3.weaponKind !== kind) p3.equipWeapon(kind);
    const btn = document.getElementById('b-punch');
    if (btn) {
      btn.innerHTML = kind ? WEAPON_ICON : FIST_ICON;
      const label = kind ? 'Выстрел' : 'Удар';
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }

  /** Удар кулаком: анимация + урон ближайшему NPC перед игроком. */
  punch() {
    const p3 = this.player3d;
    if (!p3) return;
    if (p3.vehicle) { this.hud.toast('Сначала выйди из машины'); return; }
    if (!p3.punch()) return;                       // перезарядка

    const px = p3.pos.x, pz = p3.pos.z;
    const fx = Math.sin(p3.heading), fz = Math.cos(p3.heading);
    const inFront = (ox, oz) => {
      const dx = ox - px, dz = oz - pz;
      const d = Math.hypot(dx, dz);
      return d > 0.01 && d <= 2.3 && (dx / d) * fx + (dz / d) * fz > 0.35 ? d : 0;
    };

    let best = null, bd = 99, isCop = false;
    for (const n of this.peds.list) {
      if (n.state === 'down') continue;
      const d = inFront(n.h.root.position.x, n.h.root.position.z);
      if (d && d < bd) { bd = d; best = n; }
    }
    for (const c of this.police.list) {
      if (c.down) continue;
      const d = inFront(c.h.root.position.x, c.h.root.position.z);
      if (d && d < bd) { bd = d; best = c; isCop = true; }
    }

    const stats = this.player.stats;
    stats.energy = Math.max(0, stats.energy - 2);

    setTimeout(() => {
      if (!best) { this.hud.toast('Удар в воздух'); return; }
      if (isCop) {
        const r = this.police.hit(best, 34);
        this.hud.toast(r === 'down' ? 'Патрульный в нокауте' : 'Ударил полицейского');
        this.addWanted(r === 'down' ? 2 : 1.2, 'нападение на полицию');
        return;
      }
      const r = this.peds.hit(best, 26, px, pz);
      this.chat.add(`* Ты ударил: ${best.name}`, 'sys');
      if (r === 'down') {
        this.hud.toast(`${best.name} в нокауте`, 'bad');
        this.addWanted(1.6, 'избиение');
      } else {
        this.hud.toast(`Попал по ${best.name}` + (r === 'fight' ? ' — он дерётся!' : ''));
        this.addWanted(0.5, 'драка');
      }
      this.peds.scare(px, pz, 14);
    }, p3.punchHitMoment * 1000);
  }

  /** Режим прицеливания: камера через плечо + перекрестие. */
  toggleAim(force) {
    const p3 = this.player3d;
    if (!p3) return;
    if (p3.vehicle) { this.hud.toast('В машине не прицелиться'); return; }
    const on = p3.setAim(force === undefined ? !p3.aiming : !!force);
    const cross = document.getElementById('crosshair');
    if (cross) cross.classList.toggle('hidden', !on);
    const btn = document.getElementById('b-aim');
    if (btn) btn.classList.toggle('on', on);
  }

  horn() {
    const v = this.player3d?.vehicle;
    if (!v) { this.hud.toast('Ты не в машине'); return; }
    this.chat.add('*БИП-БИП*', 'sys');
    // распугиваем пешеходов рядом
    this.peds.list.forEach(n => {
      if (dist2D(n.h.root.position.x, n.h.root.position.z, v.pos.x, v.pos.z) < 12) {
        n.speed = Math.min(2.4, n.speed * 1.6);
        n.pauseT = 0;
      }
    });
  }

  toggleLights() {
    const v = this.player3d?.vehicle;
    if (!v) { this.hud.toast('Ты не в машине'); return; }
    v.lightsOn = !v.lightsOn;
    this.hud.toast(v.lightsOn ? 'Фары включены' : 'Фары выключены');
  }

  setQuality(name) {
    this.engine.setQuality(name);
    localStorage.setItem('rp:quality', name);
    this._applyQuality(this.engine.quality);
    const label = { AUTO: 'Авто (максимум при 45+ fps)', LOW: 'Низкое', MEDIUM: 'Среднее', HIGH: 'Высокое' }[name] || name;
    this.hud.toast('Качество: ' + label);
  }

  /** Подстраивает населённость города под текущий уровень графики. */
  _applyQuality(q) {
    this.traffic.setMax(q.traffic);
    this.peds.setMax(q.npc);
    this.city.props.setDetail(q.props);
  }

  /**
   * Подключение к серверу. Публичные комнаты идут через MQTT-брокер (RoomClient),
   * выделенные серверы — через свой протокол (NetClient).
   */
  connectServer(server) {
    if (typeof server === 'string') server = { url: server, kind: 'ws', name: server };
    const wantRoom = server.kind === 'room';

    // отключаем прежний транспорт
    if (this.net) this.net.disconnect();

    if (wantRoom) {
      if (!(this.net instanceof RoomClient)) this.net = new RoomClient(this);
      this.net.connect(server);
    } else {
      if (this.net instanceof RoomClient) this.net = new NetClient(this);
      this.net.connect(server.url || server);
    }
    this.currentServer = server;
  }

  /* ======================= СОХРАНЕНИЕ ======================= */
  saveGame(notify) {
    if (!this.player) return;
    this.player.pos = { x: this.player3d.pos.x, z: this.player3d.pos.z, rot: this.player3d.heading };
    this.player.stats2.distWalked = this.player3d.distWalked;
    this.player.stats2.distDriven = this.player3d.distDriven;
    // фиксируем состояние своих машин
    this.player.vehicles.forEach(rec => {
      const live = this.worldVehicles.find(v => v.plate === rec.plate);
      if (live) { rec.x = live.pos.x; rec.z = live.pos.z; rec.rot = live.heading; rec.fuel = live.fuel; rec.damage = live.damage; rec.stored = false; }
    });
    const ok = S.save(this.player);
    if (notify) this.hud.toast(ok ? 'Игра сохранена' : 'Не удалось сохранить', ok ? 'good' : 'bad');
  }

  /* ======================= ЦИКЛ ======================= */
  update(dt) {
    const eng = this.engine;

    if (this.paused || !this.player) {
      eng.updateDayNight(dt, null);
      return;
    }

    const p = this.player;
    const p3 = this.player3d;
    const driving = p3.mode === 'drive';

    // ввод
    const input = this.controls.poll(driving);

    // выход из машины по кнопке прыжка
    if (driving && input.jump) {
      if (!this._jumpLatch) { this._jumpLatch = true; this._doInteraction({ kind: 'exit' }); }
    } else if (!input.jump) {
      this._jumpLatch = false;
    }

    p3.update(dt, input, this.city);

    // мир
    eng.updateDayNight(dt, p3.pos);
    this.city.updateCulling(p3.pos.x, p3.pos.z, eng.quality.chunkR);
    this.city.setNight(eng.nightAmount);

    this._streamParked(p3.pos.x, p3.pos.z);
    this.traffic.update(dt, p3.pos.x, p3.pos.z, p3.vehicle, eng.nightAmount);
    this.peds.update(dt, p3.pos.x, p3.pos.z, {
      onHitPlayer: (n, dmg) => this.hurtPlayer(dmg, n.name)
    });

    // розыск: затухает, если какое-то время не нарушать
    if (this._hitMsgCd > 0) this._hitMsgCd -= dt;
    if (this.wanted > 0) {
      if (this._crimeCool > 0) this._crimeCool -= dt;
      else this.wanted = Math.max(0, this.wanted - dt * 0.035);
      this.police.setMax(Math.min(4, Math.floor(this.wanted)));
      this.police.update(dt, p3.pos.x, p3.pos.z, {
        wanted: this.wanted,
        onHitPlayer: (c, dmg) => this.hurtPlayer(dmg, c.name),
        onArrest: () => this._arrest()
      });
      if (this.wanted === 0) { this.police.setMax(0); this.police.dispose(); }
    }
    this.net.update(dt);
    this.chat.ambient(dt);

    // припаркованные машины: только свет
    for (const v of this.worldVehicles) {
      if (v.driver) continue;
      v.lightsOn = false;
      if (v.mesh.userData.brakeMat) v.mesh.userData.brakeMat.emissiveIntensity = 0;
    }

    // потребности (игровое время идёт быстрее)
    const gameSeconds = dt * (1 / eng.timeScale) / 60;
    const died = S.tickNeeds(p, gameSeconds * 2.2);
    if (died) this._onDeath();

    // авто-прогресс квестов
    this._visitAcc += dt;
    if (this._visitAcc > 1.2) {
      this._visitAcc = 0;
      this._checkVisits();
      S.questEvent(p, 'money');
      S.questEvent(p, 'drive_dist');
      p.stats2.distDriven = p3.distDriven;
      p.stats2.distWalked = p3.distWalked;
    }

    // UI
    this.hud.update(p, eng, p3, { wanted: this.wanted, ammo: p.ammo, armed: p.equipped === 'pistol' });
    this.hud.showSpeedo(driving);
    if (driving) {
      this.hud.drawSpeedo(p3.vehicle);
      if (p3.vehicle.fuel <= 0 && !this._fuelWarned) {
        this._fuelWarned = true;
        this.hud.toast('Бак пуст! Нужна канистра или эвакуатор', 'bad');
      }
      if (p3.vehicle.fuel > 0) this._fuelWarned = false;
    }

    this.hud.drawMinimap(p3, this.city, this.traffic, this._mapMarkers(), eng.nightAmount);
    if (this.bigmap.visible) this.bigmap.draw();

    // подсказка взаимодействия
    this.currentInteraction = this._findInteraction();
    this.hud.setPrompt(this.currentInteraction
      ? `<b>E</b> · ${this.currentInteraction.label}` : null);

    // трекер
    this._updateTracker();

    // автосохранение
    this._saveAcc += dt;
    if (this._saveAcc > 30) {
      this._saveAcc = 0;
      this.saveGame(false);
      if (this.net.authorized) this.net.pushSave(this.player);
    }
  }

  _mapMarkers() {
    const out = [];
    const px = this.player3d.pos.x, pz = this.player3d.pos.z;
    this.city.pois.forEach(poi => {
      if (Math.abs(poi.x - px) > 180 || Math.abs(poi.z - pz) > 180) return;
      const c = { shop: '#49a0ff', gas: '#ffb020', atm: '#3ddc84', job: '#ffcf4a', house: '#9b7bff' }[poi.type];
      if (c) out.push({ x: poi.x, z: poi.z, color: c });
    });
    if (this.waypoint) out.push({ x: this.waypoint.x, z: this.waypoint.z, color: '#ff5db8' });
    const job = this.player.job;
    if (job && job.stops[job.current]) {
      out.push({ x: job.stops[job.current].x, z: job.stops[job.current].z, color: '#ffffff' });
    }
    return out;
  }

  _updateTracker() {
    const p = this.player;
    const p3 = this.player3d;
    if (p.job) {
      const def = JOBS[p.job.id];
      const stop = p.job.stops[p.job.current];
      const d = stop ? dist2D(stop.x, stop.z, p3.pos.x, p3.pos.z) : 0;
      this.hud.setTracker(def.name,
        `Точка ${p.job.current + 1}/${p.job.stops.length} · ${fmtMoney(p.job.earned)}`, d);
      return;
    }
    if (this.waypoint) {
      const d = dist2D(this.waypoint.x, this.waypoint.z, p3.pos.x, p3.pos.z);
      if (d < 12) { this.waypoint = null; this.hud.setTracker(null); return; }
      this.hud.setTracker('Маршрут', this.waypoint.name, d);
      return;
    }
    const q = S.activeQuests(p)[0];
    if (q) {
      const st = S.questState(p, q.id);
      this.hud.setTracker(q.name, q.steps[st.step]?.text || '', null);
    } else {
      this.hud.setTracker(null);
    }
  }

  _checkVisits() {
    const p = this.player;
    const p3 = this.player3d;
    ['park', 'plaza', 'cityhall', 'hospital'].forEach(type => {
      const r = this.city.nearestPoi(p3.pos.x, p3.pos.z, x => x.type === type);
      if (r && r.dist < 22 && !p.stats2.visited[type]) {
        p.stats2.visited[type] = true;
        const done = S.questEvent(p, 'visit', { poi: type });
        this._announceQuests(done);
      }
    });
  }

  _announceQuests(list) {
    (list || []).forEach(q => {
      this.hud.toast(`Задание выполнено: ${q.name} (+${q.reward.money} $)`, 'gold');
      this.chat.add(`✅ ${q.name} — награда ${fmtMoney(q.reward.money)}, ${q.reward.xp} XP`, 'money');
    });
  }

  _onDeath() {
    const r = S.respawn(this.player);
    const hosp = this.city.nearestPoi(this.player3d.pos.x, this.player3d.pos.z, x => x.type === 'hospital');
    if (this.player3d.vehicle) {
      this.player3d.exitVehicle();
      this.controls.setDrivingMode(false);
    }
    if (hosp) this.player3d.teleport(hosp.poi.x, hosp.poi.z + 6, 0);
    this.hud.toast(`Ты очнулся в больнице. Счёт за лечение ${fmtMoney(r.fee)}`, 'bad');
    this.chat.add('Медики подобрали тебя на улице. Следи за здоровьем.', 'sys');
  }
}

/* ======================= СТАРТ ======================= */
const game = new Game();
window.__game = game;

game.boot().catch(err => {
  console.error(err);
  $('load-text').textContent = 'Ошибка загрузки: ' + err.message;
  $('load-hint').textContent = 'Открой консоль браузера для подробностей.';
});

// сохраняем при сворачивании
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.player) game.saveGame(false);
});
window.addEventListener('pagehide', () => { if (game.player) game.saveGame(false); });

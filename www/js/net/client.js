/* client.js — сетевой клиент: подключение к серверу, синхронизация игроков и чата.
   Протокол — JSON поверх WebSocket (см. server/server.js). */

import * as THREE from '../../vendor/three.module.js';
import { Humanoid } from '../entities/humanoid.js';
import { buildVehicleMesh } from '../entities/vehicle.js';
import { damp } from '../core/utils.js';

const TICK = 1 / 12;   // частота отправки состояния

export class NetClient {
  constructor(game) {
    this.game = game;
    this.ws = null;
    this.connected = false;
    this.serverName = '';
    this.id = null;
    this.players = new Map();     // id -> {name, look, x, z, rot, anim, avatar, ...}
    this.lastUrl = '';
    this.authorized = false;
    this._acc = 0;
  }

  connect(url) {
    this.disconnect();
    if (!/^wss?:\/\//.test(url)) url = 'ws://' + url;
    this.lastUrl = url;
    this.game.hud.toast('Подключение к ' + url + '…');

    try {
      this.ws = new WebSocket(url);
    } catch (e) {
      this.game.hud.toast('Неверный адрес сервера', 'bad');
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.authorized = false;
      this.game.hud.toast('Подключено, вхожу в аккаунт…');
      // сначала авторизация, join отправим после ответа сервера
      this.send(this.game.auth.authMessage());
    };

    this.ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      this._handle(msg);
    };

    this.ws.onclose = () => {
      const was = this.connected;
      this.connected = false;
      this._clearPlayers();
      if (was) {
        this.game.hud.toast('Соединение разорвано', 'bad');
        this.game.chat.add('Отключено от сервера. Игра продолжается оффлайн.', 'sys');
      }
    };

    this.ws.onerror = () => {
      if (!this.connected) this.game.hud.toast('Не удалось подключиться', 'bad');
    };
  }

  disconnect() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) { /* no-op */ }
      this.ws = null;
    }
    this.connected = false;
    this.authorized = false;
    this._clearPlayers();
  }

  send(obj) {
    if (!this.ws || this.ws.readyState !== 1) return;
    try { this.ws.send(JSON.stringify(obj)); } catch (e) { /* no-op */ }
  }

  /** Отправляет серверу профиль игрока (облачное сохранение). */
  pushSave(data) {
    if (!this.authorized) return;
    this.send({ t: 'save', data });
  }

  _handle(m) {
    switch (m.t) {
      case 'auth':
        if (!m.ok) {
          this.game.hud.toast('Вход отклонён: ' + (m.reason || 'ошибка'), 'bad');
          this.disconnect();
          break;
        }
        this.authorized = true;
        this.serverName = m.server || 'Сервер';
        this.game.hud.toast(m.registered ? 'Аккаунт создан на сервере' : 'Вход выполнен', 'good');
        this.game.onServerAuth(m);
        this.send({
          t: 'join',
          name: this.game.player.name,
          look: this.game.player.look
        });
        break;

      case 'saved':
        this.game._cloudSavedAt = m.at;
        break;

      case 'welcome':
        this.id = m.id;
        this.serverName = m.server || 'Сервер';
        this.game.chat.add(`Вы на сервере «${this.serverName}». Игроков: ${(m.players || []).length + 1}`, 'sys');
        (m.players || []).forEach(p => this._addPlayer(p));
        break;

      case 'join':
        if (m.id === this.id) break;
        this._addPlayer(m);
        this.game.chat.add(`${m.name} подключился`, 'sys');
        break;

      case 'leave': {
        const p = this.players.get(m.id);
        if (p) {
          this.game.chat.add(`${p.name} вышел`, 'sys');
          this._removePlayer(m.id);
        }
        break;
      }

      case 'state': {
        if (m.id === this.id) break;
        let p = this.players.get(m.id);
        if (!p) { this._addPlayer({ id: m.id, name: m.name || 'Игрок', look: m.look }); p = this.players.get(m.id); }
        if (!p) break;
        p.tx = m.x; p.tz = m.z; p.trot = m.rot;
        p.anim = m.anim || 'idle';
        p.speed = m.sp || 0;
        this._setVehicle(p, m.veh);
        break;
      }

      case 'chat':
        if (m.id === this.id) break;
        this.game.chat.add(m.text, m.kind || '', m.nick || null);
        break;

      case 'sys':
        this.game.chat.add(m.text, 'sys');
        break;
    }
  }

  _addPlayer(info) {
    if (this.players.has(info.id)) return;
    const look = info.look && Object.keys(info.look).length ? info.look : Humanoid.randomLook(Math.random);
    const avatar = new Humanoid(look);
    avatar.root.position.set(info.x || 0, 0, info.z || 0);
    this.game.scene.add(avatar.root);

    // ник над головой
    const label = makeLabel(info.name || 'Игрок');
    label.position.y = (look.height || 1.78) + 0.35;
    avatar.root.add(label);

    this.players.set(info.id, {
      id: info.id, name: info.name || 'Игрок', look, avatar, label,
      x: info.x || 0, z: info.z || 0, rot: 0,
      tx: info.x || 0, tz: info.z || 0, trot: 0,
      anim: 'idle', speed: 0, vehMesh: null, vehType: null, inVehicle: false
    });
  }

  _setVehicle(p, veh) {
    if (veh && veh.type) {
      if (p.vehType !== veh.type) {
        if (p.vehMesh) this.game.scene.remove(p.vehMesh);
        p.vehMesh = buildVehicleMesh(veh.type, veh.color || 0x888888);
        this.game.scene.add(p.vehMesh);
        p.vehType = veh.type;
      }
      p.inVehicle = true;
      p.avatar.root.visible = false;
    } else {
      if (p.vehMesh) { this.game.scene.remove(p.vehMesh); p.vehMesh = null; p.vehType = null; }
      p.inVehicle = false;
      p.avatar.root.visible = true;
    }
  }

  _removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.game.scene.remove(p.avatar.root);
    p.avatar.dispose();
    if (p.vehMesh) this.game.scene.remove(p.vehMesh);
    this.players.delete(id);
  }

  _clearPlayers() {
    Array.from(this.players.keys()).forEach(id => this._removePlayer(id));
  }

  /** Интерполяция чужих игроков + отправка своего состояния. */
  update(dt) {
    // сглаживание
    this.players.forEach(p => {
      p.x = damp(p.x, p.tx, 9, dt);
      p.z = damp(p.z, p.tz, 9, dt);
      let d = ((p.trot - p.rot + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      p.rot += d * Math.min(1, dt * 9);

      if (p.inVehicle && p.vehMesh) {
        p.vehMesh.position.set(p.x, 0, p.z);
        p.vehMesh.rotation.y = p.rot;
      } else {
        p.avatar.root.position.set(p.x, 0, p.z);
        p.avatar.root.rotation.y = p.rot;
        p.avatar.update(dt, p.anim, p.speed);
        if (p.label) p.label.quaternion.copy(this.game.camera.quaternion);
      }
    });

    if (!this.connected) return;
    this._acc += dt;
    if (this._acc < TICK) return;
    this._acc = 0;

    const pl = this.game.player3d;
    const veh = pl.vehicle ? { type: pl.vehicle.type, color: pl.vehicle.color } : null;
    this.send({
      t: 'state',
      x: +pl.pos.x.toFixed(2),
      z: +pl.pos.z.toFixed(2),
      rot: +pl.heading.toFixed(3),
      anim: pl.moveState,
      sp: +pl.speed.toFixed(2),
      veh
    });
  }
}

/* ---------- ник над головой ---------- */
function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(8,12,20,.72)';
  ctx.roundRect ? (ctx.beginPath(), ctx.roundRect(4, 10, 248, 44, 12), ctx.fill())
                : ctx.fillRect(4, 10, 248, 44);
  ctx.fillStyle = '#e9eef6';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text.slice(0, 16), 128, 33);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const spr = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.275),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  return spr;
}

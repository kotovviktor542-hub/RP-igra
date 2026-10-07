/* room.js — публичные игровые комнаты поверх открытых MQTT-брокеров.

   Зачем: чтобы мультиплеер работал без собственного хостинга. Все игроки комнаты
   шлют своё состояние в топики брокера и получают чужие. Город детерминированный
   (общий сид), поэтому мир у всех одинаковый.

   Топики:
     horizonsrp/v1/<room>/s/<cid>  — состояние игрока (позиция, анимация, транспорт)
     horizonsrp/v1/<room>/j/<cid>  — вход (имя, внешность)
     horizonsrp/v1/<room>/l/<cid>  — выход (в том числе last will при обрыве)
     horizonsrp/v1/<room>/c        — чат
*/

import { NetClient } from './client.js';
import { MqttClient } from './mqtt.js';

const BASE = 'horizonsrp/v1';
const DROP_AFTER = 7000;     // мс тишины — считаем, что игрок ушёл

export class RoomClient extends NetClient {
  constructor(game) {
    super(game);
    this.kind = 'room';
    this.mqtt = null;
    this.room = null;
    this.cid = 'p' + Math.random().toString(36).slice(2, 10);
    this._seen = new Map();   // cid -> время последнего пакета
    this._announce = 0;
  }

  get base() { return `${BASE}/${this.room}`; }

  /** @param {object} server {name, broker, room} */
  async connect(server) {
    this.disconnect();
    this.room = server.room || 'eu1';
    this.serverName = server.name || ('Комната ' + this.room);
    this.lastUrl = server.broker;
    this.game.hud.toast('Подключение к ' + this.serverName + '…');

    const mqtt = new MqttClient({
      url: server.broker,
      clientId: 'rp_' + this.cid,
      keepalive: 30,
      will: { topic: `${this.base}/l/${this.cid}`, payload: '1' }
    });
    mqtt.onMessage = (topic, payload) => this._onTopic(topic, payload);
    mqtt.onClose = () => {
      if (this.connected) {
        this.connected = false;
        this.authorized = false;
        this._clearPlayers();
        this.game.hud.toast('Соединение с комнатой разорвано', 'bad');
      }
    };

    try {
      await mqtt.connect();
    } catch (e) {
      this.game.hud.toast('Комната недоступна: ' + e.message, 'bad');
      return false;
    }

    this.mqtt = mqtt;
    this.connected = true;
    this.authorized = true;          // в публичных комнатах аккаунт не проверяется
    mqtt.subscribe(`${this.base}/#`);

    const p = this.game.player;
    this._publish(`j/${this.cid}`, { name: p?.name || 'Игрок', look: p?.look || {} });
    this.game.hud.toast('Ты на сервере: ' + this.serverName, 'good');
    this.game.chat.add(`Подключено к «${this.serverName}». Игроки появятся через пару секунд.`, 'sys');
    return true;
  }

  disconnect() {
    if (this.mqtt) {
      try { this._publish(`l/${this.cid}`, { bye: 1 }); } catch (e) { /* no-op */ }
      this.mqtt.end();
      this.mqtt = null;
    }
    this.connected = false;
    this.authorized = false;
    this._seen.clear();
    this._clearPlayers();
  }

  _publish(suffix, obj) {
    if (!this.mqtt || !this.mqtt.connected) return;
    this.mqtt.publish(`${this.base}/${suffix}`, JSON.stringify(obj));
  }

  /** Игровые сообщения (state/chat) переводим в топики брокера. */
  send(obj) {
    if (!obj || !this.connected) return;
    if (obj.t === 'state') {
      const p = this.game.player;
      this._publish(`s/${this.cid}`, {
        x: obj.x, z: obj.z, rot: obj.rot, anim: obj.anim, sp: obj.sp, veh: obj.veh,
        name: p?.name || 'Игрок', look: p?.look || {}
      });
      return;
    }
    if (obj.t === 'chat') {
      const p = this.game.player;
      this._publish('c', { id: this.cid, name: p?.name || 'Игрок', text: obj.text, kind: obj.kind, nick: obj.nick });
    }
  }

  /** Облачных сейвов у публичных комнат нет — прогресс хранится на телефоне. */
  pushSave() { /* no-op */ }

  _onTopic(topic, payload) {
    if (!topic.startsWith(this.base + '/')) return;
    const rest = topic.slice(this.base.length + 1);
    let data = {};
    try { data = JSON.parse(payload); } catch (e) { return; }

    if (rest === 'c') {
      if (data.id === this.cid) return;
      this.game.chat.add(data.text, data.kind || '', data.name || data.nick || null);
      return;
    }

    const [kind, cid] = rest.split('/');
    if (!cid || cid === this.cid) return;

    if (kind === 'l') { this._seen.delete(cid); this._handle({ t: 'leave', id: cid }); return; }

    if (kind === 'j') {
      this._seen.set(cid, Date.now());
      this._handle({ t: 'join', id: cid, name: data.name || 'Игрок', look: data.look || {}, x: 0, z: 0 });
      return;
    }

    if (kind === 's') {
      this._seen.set(cid, Date.now());
      this._handle({
        t: 'state', id: cid, name: data.name || 'Игрок', look: data.look || {},
        x: data.x || 0, z: data.z || 0, rot: data.rot || 0,
        anim: data.anim || 'idle', sp: data.sp || 0, veh: data.veh || null
      });
    }
  }

  update(dt) {
    super.update(dt);
    if (!this.connected) return;

    // выбрасываем тех, от кого давно нет пакетов
    const now = Date.now();
    this._seen.forEach((at, cid) => {
      if (now - at > DROP_AFTER) {
        this._seen.delete(cid);
        this._handle({ t: 'leave', id: cid });
      }
    });

    // периодически напоминаем о себе для тех, кто зашёл позже
    this._announce += dt;
    if (this._announce > 8) {
      this._announce = 0;
      const p = this.game.player;
      this._publish(`j/${this.cid}`, { name: p?.name || 'Игрок', look: p?.look || {} });
    }
  }
}

/**
 * Быстрый опрос комнаты: сколько игроков сейчас шлют состояние.
 * @returns {Promise<{ok:boolean, online:number}>}
 */
export async function pingRoom(server, ms = 2200) {
  const mqtt = new MqttClient({
    url: server.broker,
    clientId: 'rpping_' + Math.random().toString(36).slice(2, 10),
    keepalive: 30
  });
  const seen = new Set();
  mqtt.onMessage = (topic) => {
    const m = topic.match(/\/(?:s|j)\/([^/]+)$/);
    if (m) seen.add(m[1]);
  };
  try {
    await mqtt.connect();
    mqtt.subscribe(`${BASE}/${server.room}/#`);
    await new Promise(r => setTimeout(r, ms));
    mqtt.end();
    return { ok: true, online: seen.size };
  } catch (e) {
    try { mqtt.end(); } catch (e2) { /* no-op */ }
    return { ok: false, online: 0 };
  }
}

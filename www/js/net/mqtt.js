/* mqtt.js — минимальный MQTT 3.1.1 поверх WebSocket (QoS 0).

   Нужен для «публичных серверов» игры: комнаты крутятся на открытых MQTT-брокерах,
   поэтому мультиплеер работает без собственного хостинга. Для выделенного сервера
   используется client.js (свой протокол поверх WebSocket).

   Поддержано ровно то, что нужно игре:
   CONNECT (+ last will), SUBSCRIBE, PUBLISH, PINGREQ, DISCONNECT. */

const enc = new TextEncoder();
const dec = new TextDecoder();

function str(s) {
  const b = enc.encode(String(s));
  const out = new Uint8Array(b.length + 2);
  out[0] = (b.length >> 8) & 0xff;
  out[1] = b.length & 0xff;
  out.set(b, 2);
  return out;
}

function varint(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return Uint8Array.from(out);
}

function packet(type, flags, ...parts) {
  let len = 0;
  parts.forEach(p => { len += p.length; });
  const head = varint(len);
  const out = new Uint8Array(1 + head.length + len);
  out[0] = (type << 4) | flags;
  out.set(head, 1);
  let o = 1 + head.length;
  parts.forEach(p => { out.set(p, o); o += p.length; });
  return out;
}

export class MqttClient {
  /**
   * @param {object} opts {url, clientId, keepalive, will:{topic,payload}, WebSocketImpl}
   */
  constructor(opts = {}) {
    this.url = opts.url;
    this.clientId = opts.clientId || ('rp' + Math.random().toString(36).slice(2, 10));
    this.keepalive = opts.keepalive || 30;
    this.will = opts.will || null;
    this.WS = opts.WebSocketImpl || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    this.ws = null;
    this.connected = false;
    this.onMessage = null;      // (topic, payloadString)
    this.onClose = null;
    this.onError = null;
    this._buf = new Uint8Array(0);
    this._pid = 1;
    this._ping = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.WS) { reject(new Error('WebSocket недоступен')); return; }
      let ws;
      try { ws = new this.WS(this.url, 'mqtt'); } catch (e) { reject(e); return; }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let settled = false;

      const fail = (e) => {
        if (!settled) { settled = true; reject(e instanceof Error ? e : new Error('Соединение не удалось')); }
      };

      const onOpen = () => {
        let flags = 0x02;                       // clean session
        const parts = [str('MQTT'), Uint8Array.from([4, 0, (this.keepalive >> 8) & 0xff, this.keepalive & 0xff])];
        const payload = [str(this.clientId)];
        if (this.will) {
          flags |= 0x04;                        // will flag, QoS 0, не retain
          payload.push(str(this.will.topic), str(this.will.payload || ''));
        }
        parts[1][1] = flags;
        this._send(packet(1, 0, ...parts, ...payload));
      };

      const onData = (data) => {
        const bytes = new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer || data);
        const merged = new Uint8Array(this._buf.length + bytes.length);
        merged.set(this._buf); merged.set(bytes, this._buf.length);
        this._buf = merged;
        let p;
        while ((p = this._shift())) {
          const type = p.type;
          if (type === 2) {                     // CONNACK
            const code = p.body[1];
            if (code !== 0) { fail(new Error('Брокер отказал, код ' + code)); try { ws.close(); } catch (e) { /* no-op */ } return; }
            this.connected = true;
            this._ping = setInterval(() => this._send(packet(12, 0)), this.keepalive * 500);
            if (!settled) { settled = true; resolve(this); }
          } else if (type === 3) {              // PUBLISH
            const tl = (p.body[0] << 8) | p.body[1];
            const topic = dec.decode(p.body.subarray(2, 2 + tl));
            const payload = dec.decode(p.body.subarray(2 + tl));
            this.onMessage && this.onMessage(topic, payload);
          }
        }
      };

      const onClose = () => {
        this.connected = false;
        if (this._ping) { clearInterval(this._ping); this._ping = null; }
        this.onClose && this.onClose();
        fail(new Error('Соединение закрыто'));
      };

      if (typeof ws.on === 'function') {        // node (ws)
        ws.on('open', onOpen);
        ws.on('message', d => onData(d));
        ws.on('close', onClose);
        ws.on('error', e => { this.onError && this.onError(e); fail(e); });
      } else {                                  // браузер
        ws.onopen = onOpen;
        ws.onmessage = ev => onData(ev.data);
        ws.onclose = onClose;
        ws.onerror = e => { this.onError && this.onError(e); fail(new Error('Ошибка сети')); };
      }

      setTimeout(() => fail(new Error('Брокер не ответил')), 12000);
    });
  }

  /** Достаёт один пакет из буфера, если он пришёл целиком. */
  _shift() {
    const b = this._buf;
    if (b.length < 2) return null;
    let mult = 1, len = 0, i = 1, byte;
    do {
      if (i >= b.length) return null;
      byte = b[i++];
      len += (byte & 127) * mult;
      mult *= 128;
      if (mult > 128 * 128 * 128) return null;
    } while (byte & 0x80);
    if (b.length < i + len) return null;
    const pkt = { type: b[0] >> 4, flags: b[0] & 0x0f, body: b.subarray(i, i + len) };
    this._buf = b.subarray(i + len);
    return pkt;
  }

  _send(bytes) {
    if (!this.ws) return;
    try { this.ws.send(bytes); } catch (e) { /* no-op */ }
  }

  subscribe(topic) {
    const id = this._pid++ & 0xffff;
    this._send(packet(8, 2, Uint8Array.from([(id >> 8) & 0xff, id & 0xff]), str(topic), Uint8Array.from([0])));
  }

  publish(topic, payload) {
    this._send(packet(3, 0, str(topic), enc.encode(String(payload))));
  }

  end() {
    if (this._ping) { clearInterval(this._ping); this._ping = null; }
    try { this._send(packet(14, 0)); } catch (e) { /* no-op */ }
    try { this.ws && this.ws.close(); } catch (e) { /* no-op */ }
    this.connected = false;
    this.ws = null;
  }
}

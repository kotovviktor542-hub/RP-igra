/* server.js — простой выделенный сервер для City RP.
   Запуск:  npm install && npm start
   По умолчанию слушает 0.0.0.0:8787, подключение из игры: ws://<ip-компьютера>:8787 */

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const SERVER_NAME = process.env.SERVER_NAME || 'City RP — локальный сервер';
const WORLD_SEED = Number(process.env.SEED || 20261007);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 32);

let nextId = 1;
const players = new Map();     // id -> {id, ws, name, look, x, z, rot, anim, sp, veh, lastSeen}

/* -------- http: статус сервера в браузере -------- */
const httpServer = http.createServer((req, res) => {
  if (req.url === '/status' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      server: SERVER_NAME,
      seed: WORLD_SEED,
      online: players.size,
      max: MAX_PLAYERS,
      players: [...players.values()].map(p => ({ name: p.name, inVehicle: !!p.veh })),
      uptime: Math.round(process.uptime())
    }, null, 2));
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server: httpServer });

function send(ws, obj) {
  if (ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (e) { /* no-op */ }
  }
}

function broadcast(obj, exceptId) {
  const data = JSON.stringify(obj);
  players.forEach(p => {
    if (p.id === exceptId) return;
    if (p.ws.readyState === 1) {
      try { p.ws.send(data); } catch (e) { /* no-op */ }
    }
  });
}

function sanitize(s, max = 64) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').slice(0, max);
}

wss.on('connection', ws => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { t: 'sys', text: 'Сервер переполнен' });
    ws.close();
    return;
  }

  const id = nextId++;
  let joined = false;

  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw.toString().slice(0, 4000)); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'join') {
      if (joined) return;
      joined = true;
      const p = {
        id, ws,
        name: sanitize(m.name, 24) || ('Игрок' + id),
        look: typeof m.look === 'object' && m.look ? m.look : {},
        x: 0, z: 0, rot: 0, anim: 'idle', sp: 0, veh: null,
        lastSeen: Date.now()
      };
      players.set(id, p);

      send(ws, {
        t: 'welcome', id, server: SERVER_NAME, seed: WORLD_SEED,
        players: [...players.values()]
          .filter(o => o.id !== id)
          .map(o => ({ id: o.id, name: o.name, look: o.look, x: o.x, z: o.z }))
      });
      broadcast({ t: 'join', id, name: p.name, look: p.look, x: p.x, z: p.z }, id);
      console.log(`[+] ${p.name} (#${id}) подключился. Онлайн: ${players.size}`);
      return;
    }

    const p = players.get(id);
    if (!p) return;
    p.lastSeen = Date.now();

    if (m.t === 'state') {
      p.x = +m.x || 0;
      p.z = +m.z || 0;
      p.rot = +m.rot || 0;
      p.anim = sanitize(m.anim, 10);
      p.sp = +m.sp || 0;
      p.veh = m.veh && m.veh.type ? { type: sanitize(m.veh.type, 16), color: +m.veh.color || 0x888888 } : null;
      broadcast({
        t: 'state', id, name: p.name, look: p.look,
        x: p.x, z: p.z, rot: p.rot, anim: p.anim, sp: p.sp, veh: p.veh
      }, id);
      return;
    }

    if (m.t === 'chat') {
      const text = sanitize(m.text, 160);
      if (!text) return;
      broadcast({
        t: 'chat', id,
        text, kind: sanitize(m.kind, 10),
        nick: m.nick ? sanitize(m.nick, 24) : null
      }, id);
      console.log(`[чат] ${p.name}: ${text}`);
      return;
    }
  });

  ws.on('close', () => {
    const p = players.get(id);
    if (p) {
      console.log(`[-] ${p.name} (#${id}) отключился. Онлайн: ${players.size - 1}`);
      players.delete(id);
      broadcast({ t: 'leave', id });
    }
  });

  ws.on('error', () => { /* no-op */ });
});

/* -------- чистка зависших -------- */
setInterval(() => {
  const now = Date.now();
  players.forEach(p => {
    if (now - p.lastSeen > 45000) {
      try { p.ws.close(); } catch (e) { /* no-op */ }
      players.delete(p.id);
      broadcast({ t: 'leave', id: p.id });
    }
  });
}, 15000);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('════════════════════════════════════════');
  console.log('  ' + SERVER_NAME);
  console.log('  Порт: ' + PORT + '   Сид мира: ' + WORLD_SEED);
  console.log('  В игре введи:  ws://<ip-этого-компьютера>:' + PORT);
  console.log('  Статус: http://localhost:' + PORT + '/status');
  console.log('════════════════════════════════════════');
});

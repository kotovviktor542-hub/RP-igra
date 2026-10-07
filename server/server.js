/* server.js — выделенный сервер City RP / Horizons RP.
   Запуск локально:  npm install && npm start
   Хостинг (Render/Railway/Fly): порт берётся из переменной окружения PORT.

   Что умеет:
     • WebSocket-синхронизация игроков (позиция, анимация, транспорт, чат);
     • аккаунты: гость, ник+пароль, вход через Google (id_token);
     • облачные сохранения профиля на сервере;
     • HTTP /status и /health — для списка серверов в игре.
*/

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const SERVER_NAME = process.env.SERVER_NAME || 'Horizons RP — сервер';
const WORLD_SEED = Number(process.env.SEED || 20261007);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS || 64);
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');

let nextId = 1;
const players = new Map();     // id -> {id, ws, account, name, look, x, z, rot, anim, sp, veh, lastSeen}

/* ======================= АККАУНТЫ ======================= */
let accounts = {};             // key -> {key, kind, nick, pass, created, lastSeen, save}

function loadAccounts() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
  } catch (e) { accounts = {}; }
}

let saveTimer = null;
function saveAccounts() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts));
    } catch (e) { console.error('не смог сохранить аккаунты:', e.message); }
  }, 1500);
}

const hash = (s) => crypto.createHash('sha256').update(String(s) + '|rp-salt').digest('hex');

function sanitize(s, max = 64) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').slice(0, max);
}

/** Проверка Google id_token через публичный endpoint Google. */
async function verifyGoogle(idToken) {
  if (!idToken) return null;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!r.ok) return null;
    const info = await r.json();
    if (!info.sub) return null;
    if (GOOGLE_CLIENT_ID && info.aud !== GOOGLE_CLIENT_ID) return null;
    if (info.exp && Number(info.exp) * 1000 < Date.now()) return null;
    return { sub: info.sub, email: info.email || '', name: info.name || '' };
  } catch (e) { return null; }
}

/**
 * Авторизация. Возвращает {ok, account} либо {ok:false, reason}.
 * kind: 'google' | 'nick' | 'guest'
 */
async function authenticate(m) {
  const kind = sanitize(m.kind, 10);

  if (kind === 'google') {
    const g = await verifyGoogle(m.token);
    if (!g) return { ok: false, reason: 'Google не подтвердил аккаунт' };
    const key = 'g:' + g.sub;
    const acc = accounts[key] || (accounts[key] = {
      key, kind: 'google', nick: sanitize(m.nick || g.name || 'Игрок', 24),
      email: g.email, created: Date.now(), save: null
    });
    if (m.nick) acc.nick = sanitize(m.nick, 24);
    acc.lastSeen = Date.now();
    saveAccounts();
    return { ok: true, account: acc };
  }

  if (kind === 'nick') {
    const nick = sanitize(m.nick, 24);
    const pass = String(m.pass || '');
    if (nick.length < 3) return { ok: false, reason: 'Ник короче 3 символов' };
    if (pass.length < 4) return { ok: false, reason: 'Пароль короче 4 символов' };
    const key = 'n:' + nick.toLowerCase();
    const acc = accounts[key];
    if (!acc) {
      const fresh = { key, kind: 'nick', nick, pass: hash(pass), created: Date.now(), save: null };
      accounts[key] = fresh;
      saveAccounts();
      return { ok: true, account: fresh, registered: true };
    }
    if (acc.pass !== hash(pass)) return { ok: false, reason: 'Неверный пароль' };
    acc.lastSeen = Date.now();
    saveAccounts();
    return { ok: true, account: acc };
  }

  // гость — без сохранения на сервере
  return {
    ok: true,
    account: { key: 'guest:' + crypto.randomUUID(), kind: 'guest', nick: sanitize(m.nick, 24) || 'Гость', save: null },
    guest: true
  };
}

/* ======================= HTTP ======================= */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
};

const httpServer = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  const url = (req.url || '/').split('?')[0];

  if (url === '/status' || url === '/' || url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
    res.end(JSON.stringify({
      server: SERVER_NAME,
      seed: WORLD_SEED,
      online: players.size,
      max: MAX_PLAYERS,
      accounts: Object.keys(accounts).length,
      google: !!GOOGLE_CLIENT_ID,
      players: [...players.values()].map(p => ({ name: p.name, inVehicle: !!p.veh })),
      uptime: Math.round(process.uptime()),
      version: 2
    }));
    return;
  }
  res.writeHead(404, CORS);
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

wss.on('connection', ws => {
  if (players.size >= MAX_PLAYERS) {
    send(ws, { t: 'sys', text: 'Сервер переполнен' });
    ws.close();
    return;
  }

  const id = nextId++;
  let joined = false;
  let account = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async raw => {
    let m;
    try { m = JSON.parse(raw.toString().slice(0, 20000)); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    /* --- вход в аккаунт --- */
    if (m.t === 'auth') {
      const r = await authenticate(m);
      if (!r.ok) { send(ws, { t: 'auth', ok: false, reason: r.reason }); return; }
      account = r.account;
      send(ws, {
        t: 'auth', ok: true, kind: account.kind, nick: account.nick,
        registered: !!r.registered, guest: !!r.guest,
        save: account.save || null, server: SERVER_NAME, seed: WORLD_SEED
      });
      return;
    }

    if (m.t === 'join') {
      if (joined) return;
      if (!account) { send(ws, { t: 'sys', text: 'Сначала войди в аккаунт' }); return; }
      joined = true;
      const p = {
        id, ws, account,
        name: sanitize(m.name, 24) || account.nick || ('Игрок' + id),
        look: typeof m.look === 'object' && m.look ? m.look : {},
        x: 0, z: 0, rot: 0, anim: 'idle', sp: 0, veh: null,
        lastSeen: Date.now()
      };
      players.set(id, p);

      send(ws, {
        t: 'welcome', id, server: SERVER_NAME, seed: WORLD_SEED,
        online: players.size, max: MAX_PLAYERS,
        players: [...players.values()]
          .filter(o => o.id !== id)
          .map(o => ({ id: o.id, name: o.name, look: o.look, x: o.x, z: o.z }))
      });
      broadcast({ t: 'join', id, name: p.name, look: p.look, x: p.x, z: p.z }, id);
      broadcast({ t: 'chat', id: 0, text: `${p.name} зашёл на сервер`, kind: 'sys' }, id);
      console.log(`[+] ${p.name} (#${id}, ${account.kind}) подключился. Онлайн: ${players.size}`);
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

    /* --- облачное сохранение профиля --- */
    if (m.t === 'save') {
      if (!account || account.kind === 'guest') return;
      if (typeof m.data !== 'object' || !m.data) return;
      account.save = m.data;
      account.lastSeen = Date.now();
      saveAccounts();
      send(ws, { t: 'saved', at: Date.now() });
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
      broadcast({ t: 'chat', id: 0, text: `${p.name} вышел`, kind: 'sys' });
    }
  });

  ws.on('error', () => { /* no-op */ });
});

/* -------- пинг-понг и чистка зависших -------- */
setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) { try { ws.terminate(); } catch (e) { /* no-op */ } return; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* no-op */ }
  });
  const now = Date.now();
  players.forEach(p => {
    if (now - p.lastSeen > 60000) {
      try { p.ws.close(); } catch (e) { /* no-op */ }
      players.delete(p.id);
      broadcast({ t: 'leave', id: p.id });
    }
  });
}, 20000);

loadAccounts();
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('════════════════════════════════════════');
  console.log('  ' + SERVER_NAME);
  console.log('  Порт: ' + PORT + '   Сид мира: ' + WORLD_SEED);
  console.log('  Google-вход: ' + (GOOGLE_CLIENT_ID ? 'включён' : 'выключен (нет GOOGLE_CLIENT_ID)'));
  console.log('  Аккаунтов в базе: ' + Object.keys(accounts).length);
  console.log('  Статус: http://localhost:' + PORT + '/status');
  console.log('════════════════════════════════════════');
});

module.exports = { httpServer, authenticate, hash };

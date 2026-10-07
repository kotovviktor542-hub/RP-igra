/* nettest.cjs — проверка выделенного сервера: аккаунты, облачные сохранения, синхронизация.
   Запуск: cd server && npm install && cd .. && node tools/nettest.cjs */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let WebSocket;
try { WebSocket = require(path.join(__dirname, '..', 'server', 'node_modules', 'ws')); }
catch (e) { console.error('Нет модуля ws. Сначала: cd server && npm install'); process.exit(2); }

const PORT = 8791;
const DATA_DIR = path.join(__dirname, '..', 'server', '.testdata');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  \u001b[32m✓\u001b[0m ' + name); }
  else { fail++; console.log('  \u001b[31m✗\u001b[0m ' + name + (extra ? ' — ' + extra : '')); }
};

const wait = ms => new Promise(r => setTimeout(r, ms));

function client() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const inbox = [];
  ws.on('message', d => { try { inbox.push(JSON.parse(d.toString())); } catch (e) { /* no-op */ } });
  const api = {
    ws, inbox,
    open: () => new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); }),
    send: o => ws.send(JSON.stringify(o)),
    async expect(type, ms = 3000, pred = null) {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        const i = inbox.findIndex(m => m.t === type && (!pred || pred(m)));
        if (i >= 0) return inbox.splice(i, 1)[0];
        await wait(50);
      }
      return null;
    },
    close: () => ws.close()
  };
  return api;
}

(async () => {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  const srv = spawn('node', [path.join(__dirname, '..', 'server', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR, SERVER_NAME: 'Тестовый сервер' },
    stdio: 'ignore'
  });
  await wait(900);

  console.log('\n\u001b[1mHTTP-статус\u001b[0m');
  const st = await (await fetch(`http://127.0.0.1:${PORT}/status`)).json();
  ok('сервер отвечает на /status', st.server === 'Тестовый сервер', JSON.stringify(st).slice(0, 80));
  ok('в статусе есть онлайн и лимит', st.online === 0 && st.max > 0);
  const health = await fetch(`http://127.0.0.1:${PORT}/health`);
  ok('есть /health для хостинга', health.ok);
  ok('CORS разрешён', health.headers.get('access-control-allow-origin') === '*');

  console.log('\n\u001b[1mАккаунты\u001b[0m');
  const a = client(); await a.open();
  a.send({ t: 'auth', kind: 'nick', nick: 'Витя', pass: '12345' });
  const reg = await a.expect('auth');
  ok('регистрация по нику и паролю', reg && reg.ok === true && reg.registered === true);

  a.send({ t: 'join', name: 'Витя', look: { gender: 'm' } });
  const w = await a.expect('welcome');
  ok('вход в мир после авторизации', !!w && w.seed > 0);

  // облачное сохранение
  a.send({ t: 'save', data: { version: 4, money: 7777, stats: { health: 90 }, inventory: [{ id: 'pizza', qty: 2 }] } });
  ok('сервер подтвердил сохранение', !!(await a.expect('saved')));

  const b = client(); await b.open();
  b.send({ t: 'auth', kind: 'nick', nick: 'Витя', pass: 'неверный' });
  const bad = await b.expect('auth');
  ok('неверный пароль не пускает', bad && bad.ok === false, bad && bad.reason);

  b.send({ t: 'auth', kind: 'nick', nick: 'Витя', pass: '12345' });
  const again = await b.expect('auth');
  ok('повторный вход отдаёт облачный профиль', again && again.ok && again.save && again.save.money === 7777);

  const g = client(); await g.open();
  g.send({ t: 'auth', kind: 'guest', nick: 'Прохожий' });
  const gr = await g.expect('auth');
  ok('гость входит без пароля', gr && gr.ok === true && gr.guest === true);

  const gf = client(); await gf.open();
  gf.send({ t: 'auth', kind: 'google', token: 'подделка' });
  const gfr = await gf.expect('auth');
  ok('фальшивый Google-токен отклоняется', gfr && gfr.ok === false);

  console.log('\n\u001b[1mСинхронизация игроков\u001b[0m');
  b.send({ t: 'join', name: 'Витя2', look: {} });
  await b.expect('welcome');
  const joinMsg = await a.expect('join');
  ok('первый видит подключение второго', !!joinMsg && joinMsg.name === 'Витя2');

  b.send({ t: 'state', x: 12.5, z: -3.5, rot: 1.2, anim: 'run', sp: 6 });
  const stMsg = await a.expect('state');
  ok('позиция второго приходит первому', !!stMsg && Math.abs(stMsg.x - 12.5) < 0.01 && stMsg.anim === 'run');

  b.send({ t: 'chat', text: 'привет всем' });
  const chat = await a.expect('chat', 3000, m => m.text === 'привет всем');
  ok('чат доходит', !!chat && chat.text === 'привет всем');

  const st2 = await (await fetch(`http://127.0.0.1:${PORT}/status`)).json();
  ok('онлайн считается', st2.online === 2, String(st2.online));

  b.close();
  await wait(400);
  const leave = await a.expect('leave');
  ok('выход игрока рассылается', !!leave);

  a.close(); g.close(); gf.close();
  await wait(300);
  srv.kill();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });

  console.log('\n────────────────────────────────');
  console.log(`Пройдено: \u001b[32m${pass}\u001b[0m   Провалено: ${fail ? '\u001b[31m' + fail + '\u001b[0m' : '0'}`);
  process.exit(fail === 0 ? 0 : 1);
})();

/* online.js — экран «Онлайн»: вход в аккаунт и выбор сервера. */

import { allServers, addCustomServer, removeCustomServer, statusUrl } from '../net/config.js';

const $ = id => document.getElementById(id);

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

/** Запрос статуса сервера с таймаутом. */
async function ping(url, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(statusUrl(url), { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!r.ok) return { ok: false };
    const j = await r.json();
    return { ok: true, online: j.online | 0, max: j.max | 0, name: j.server, google: !!j.google };
  } catch (e) {
    clearTimeout(t);
    return { ok: false };
  }
}

export class OnlineScreen {
  /**
   * @param {object} game ссылка на игру
   * @param {object} auth экземпляр Auth
   */
  constructor(game, auth) {
    this.game = game;
    this.auth = auth;
    this.root = $('online');
    this.body = $('online-body');
    $('online-close').addEventListener('click', () => this.hide());
    this.visible = false;
  }

  show() {
    this.root.classList.remove('hidden');
    this.visible = true;
    this.render();
  }

  hide() {
    this.root.classList.add('hidden');
    this.visible = false;
    // в меню возвращаемся только если игра ещё не началась
    if (!this.game.player) $('menu').classList.remove('hidden');
  }

  render() {
    const b = this.body;
    b.innerHTML = '';
    this._renderAccount(b);
    this._renderServers(b);
  }

  /* ---------- аккаунт ---------- */
  _renderAccount(b) {
    const a = this.auth;
    b.appendChild(el('div', 'sec', 'Аккаунт'));

    if (a.signedIn) {
      const kind = { google: 'Google', nick: 'Ник и пароль', guest: 'Гость' }[a.account.kind] || a.account.kind;
      const row = el('div', 'row', `<div class="ic">👤</div><div class="grow">
        <div class="t">${a.account.nick}</div><div class="d">Вход: ${kind}${a.account.kind === 'guest' ? ' · прогресс только на телефоне' : ' · прогресс хранится на сервере'}</div></div>`);
      const out = el('button', 'btn sm danger', 'Выйти');
      out.onclick = () => { a.signOut(); this.render(); };
      row.appendChild(out);
      b.appendChild(row);
      return;
    }

    const g = el('button', 'btn primary wide', 'Войти через Google');
    g.disabled = !a.googleEnabled;
    g.onclick = async () => {
      g.textContent = 'Открываю Google…';
      const r = await a.signInGoogle();
      if (!r.ok) { this.game.hud.toast(r.reason, 'bad'); g.textContent = 'Войти через Google'; return; }
      this.game.hud.toast('Вошёл как ' + r.account.nick, 'good');
      this.render();
    };
    b.appendChild(g);
    if (!a.googleEnabled) {
      b.appendChild(el('div', 'd', 'Google-вход включится, когда будет добавлен Client ID из Google Cloud (инструкция: server/GOOGLE.md).'));
    }

    b.appendChild(el('div', 'sec', 'Ник и пароль'));
    const nick = el('input');
    nick.type = 'text'; nick.placeholder = 'Ник (от 3 символов)'; nick.maxLength = 24;
    nick.className = 'field';
    const pass = el('input');
    pass.type = 'password'; pass.placeholder = 'Пароль (от 4 символов)'; pass.maxLength = 32;
    pass.className = 'field';
    b.appendChild(nick); b.appendChild(pass);

    const row = el('div', 'btn-row');
    const login = el('button', 'btn sm primary', 'Войти / Создать');
    login.onclick = () => {
      const r = a.signInNick(nick.value, pass.value);
      if (!r.ok) { this.game.hud.toast(r.reason, 'bad'); return; }
      this.game.hud.toast('Аккаунт готов: ' + r.account.nick, 'good');
      this.render();
    };
    const guest = el('button', 'btn sm', 'Играть гостем');
    guest.onclick = () => {
      a.signInGuest(nick.value || 'Гость');
      this.render();
    };
    row.appendChild(login); row.appendChild(guest);
    b.appendChild(row);
  }

  /* ---------- серверы ---------- */
  _renderServers(b) {
    b.appendChild(el('div', 'sec', 'Серверы'));
    const list = allServers();
    const net = this.game.net;

    if (net.connected) {
      const r = el('div', 'row', `<div class="ic">🟢</div><div class="grow">
        <div class="t">Подключён: ${net.serverName}</div>
        <div class="d">${net.players.size + 1} игроков в мире</div></div>`);
      const d = el('button', 'btn sm danger', 'Отключиться');
      d.onclick = () => { net.disconnect(); this.render(); };
      r.appendChild(d);
      b.appendChild(r);
    }

    if (!list.length) {
      b.appendChild(el('div', 'd', `Официальных серверов пока нет — сервер ещё не развёрнут.
        Инструкция на 5 шагов: <b>server/DEPLOY.md</b> в репозитории. Либо добавь адрес вручную ниже.`));
    }

    list.forEach(s => {
      const row = el('div', 'row', `<div class="ic">🌐</div><div class="grow">
        <div class="t">${s.name}</div><div class="d" data-st>проверяю…</div></div>`);
      const join = el('button', 'btn sm primary', 'Войти');
      join.onclick = () => this._join(s);
      row.appendChild(join);
      if (s.custom) {
        const del = el('button', 'btn sm danger', '✕');
        del.onclick = () => { removeCustomServer(s.id); this.render(); };
        row.appendChild(del);
      }
      b.appendChild(row);
      ping(s.url).then(p => {
        const d = row.querySelector('[data-st]');
        if (!d) return;
        d.textContent = p.ok ? `онлайн ${p.online}/${p.max} · ${s.url}` : `не отвечает · ${s.url}`;
      });
    });

    b.appendChild(el('div', 'sec', 'Свой сервер'));
    const inp = el('input');
    inp.type = 'text';
    inp.className = 'field';
    inp.placeholder = 'wss://мой-сервер.onrender.com или ws://192.168.0.5:8787';
    inp.value = localStorage.getItem('rp:lastServer') || '';
    b.appendChild(inp);
    const row = el('div', 'btn-row');
    const add = el('button', 'btn sm', 'Добавить в список');
    add.onclick = () => {
      const url = inp.value.trim();
      if (!url) { this.game.hud.toast('Введи адрес', 'bad'); return; }
      addCustomServer(url.replace(/^wss?:\/\//, ''), url);
      localStorage.setItem('rp:lastServer', url);
      this.render();
    };
    const go = el('button', 'btn sm primary', 'Подключиться');
    go.onclick = () => {
      const url = inp.value.trim();
      if (!url) { this.game.hud.toast('Введи адрес', 'bad'); return; }
      localStorage.setItem('rp:lastServer', url);
      this._join({ name: url, url });
    };
    row.appendChild(go); row.appendChild(add);
    b.appendChild(row);
  }

  _join(server) {
    if (!this.auth.signedIn) {
      this.game.hud.toast('Сначала войди в аккаунт', 'bad');
      return;
    }
    this.hide();
    $('menu').classList.add('hidden');
    this.game.joinServer(server.url, server.name);
  }
}

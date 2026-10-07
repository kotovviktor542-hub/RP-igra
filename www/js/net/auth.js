/* auth.js — вход в аккаунт: Google, ник+пароль, гость.

   Google: используется Google Identity Services (GIS). Скрипт подключается
   по требованию; если GOOGLE_CLIENT_ID пуст или нет сети — кнопка Google
   недоступна, остаются ник+пароль и гость.
   Сам токен проверяет сервер (server/server.js → verifyGoogle). */

import { GOOGLE_CLIENT_ID } from './config.js';

const KEY = 'rp:account';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export class Auth {
  constructor() {
    this.account = null;       // {kind:'google'|'nick'|'guest', nick, token?}
    this._gisReady = false;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.account = JSON.parse(raw);
    } catch (e) { this.account = null; }
  }

  get signedIn() { return !!this.account; }
  get googleEnabled() { return !!GOOGLE_CLIENT_ID; }

  _store() {
    try { localStorage.setItem(KEY, JSON.stringify(this.account)); } catch (e) { /* no-op */ }
  }

  signOut() {
    this.account = null;
    try { localStorage.removeItem(KEY); } catch (e) { /* no-op */ }
  }

  signInGuest(nick) {
    this.account = { kind: 'guest', nick: (nick || 'Гость').slice(0, 24) };
    this._store();
    return this.account;
  }

  signInNick(nick, pass) {
    nick = String(nick || '').trim().slice(0, 24);
    pass = String(pass || '');
    if (nick.length < 3) return { ok: false, reason: 'Ник короче 3 символов' };
    if (pass.length < 4) return { ok: false, reason: 'Пароль короче 4 символов' };
    this.account = { kind: 'nick', nick, pass };
    this._store();
    return { ok: true, account: this.account };
  }

  /** Подгружает скрипт Google Identity Services. */
  loadGis() {
    if (!this.googleEnabled) return Promise.reject(new Error('Google не настроен'));
    if (this._gisReady && window.google?.accounts?.id) return Promise.resolve();
    if (this._gisPromise) return this._gisPromise;
    this._gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC;
      s.async = true;
      s.onload = () => { this._gisReady = true; resolve(); };
      s.onerror = () => reject(new Error('Не удалось загрузить Google'));
      document.head.appendChild(s);
      setTimeout(() => reject(new Error('Google не отвечает')), 12000);
    });
    return this._gisPromise;
  }

  /**
   * Вход через Google. Возвращает {ok, account} или {ok:false, reason}.
   * Токен (id_token) отправляется серверу, который его проверяет.
   */
  async signInGoogle() {
    if (!this.googleEnabled) return { ok: false, reason: 'Google-вход пока не настроен' };
    try { await this.loadGis(); } catch (e) { return { ok: false, reason: e.message }; }

    return new Promise(resolve => {
      let done = false;
      const finish = (res) => { if (!done) { done = true; resolve(res); } };
      try {
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (resp) => {
            if (!resp || !resp.credential) { finish({ ok: false, reason: 'Google не дал токен' }); return; }
            const payload = parseJwt(resp.credential);
            this.account = {
              kind: 'google',
              nick: (payload.name || payload.email || 'Игрок').slice(0, 24),
              email: payload.email || '',
              token: resp.credential
            };
            this._store();
            finish({ ok: true, account: this.account });
          }
        });
        window.google.accounts.id.prompt((n) => {
          if (n && (n.isNotDisplayed?.() || n.isSkippedMoment?.())) {
            finish({ ok: false, reason: 'Окно Google закрыто' });
          }
        });
      } catch (e) {
        finish({ ok: false, reason: 'Ошибка Google: ' + e.message });
      }
      setTimeout(() => finish({ ok: false, reason: 'Вход через Google не завершён' }), 60000);
    });
  }

  /** Сообщение авторизации для сервера. */
  authMessage() {
    const a = this.account || { kind: 'guest', nick: 'Гость' };
    return { t: 'auth', kind: a.kind, nick: a.nick, pass: a.pass, token: a.token };
  }
}

function parseJwt(token) {
  try {
    const b = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(b))));
  } catch (e) { return {}; }
}

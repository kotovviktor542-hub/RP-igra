/* config.js — настройки онлайна: официальные серверы и вход через Google.

   ⚠ Эти две константы заполняются один раз:
   OFFICIAL_SERVERS — адреса развёрнутых серверов (см. server/DEPLOY.md);
   GOOGLE_CLIENT_ID — OAuth Client ID из Google Cloud Console (см. server/GOOGLE.md).
   Пока они пустые, игра показывает серверы как «не настроен» и предлагает вход гостем. */

export const GOOGLE_CLIENT_ID = '';

export const OFFICIAL_SERVERS = [
  // {
  //   id: 'main',
  //   name: 'Horizons RP — Официальный',
  //   url: 'wss://horizons-rp-server.onrender.com',
  //   region: 'EU'
  // }
];

/** http(s)-адрес для запроса статуса по ws(s)-адресу сервера. */
export function statusUrl(wsUrl) {
  return String(wsUrl || '')
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://')
    .replace(/\/+$/, '') + '/status';
}

/** Список серверов: официальные + добавленные игроком. */
export function allServers() {
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem('rp:servers') || '[]'); } catch (e) { custom = []; }
  return [...OFFICIAL_SERVERS, ...custom.filter(s => s && s.url)];
}

export function addCustomServer(name, url) {
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem('rp:servers') || '[]'); } catch (e) { custom = []; }
  const id = 'c' + Date.now();
  custom.push({ id, name: name || url, url, custom: true });
  localStorage.setItem('rp:servers', JSON.stringify(custom));
  return id;
}

export function removeCustomServer(id) {
  let custom = [];
  try { custom = JSON.parse(localStorage.getItem('rp:servers') || '[]'); } catch (e) { custom = []; }
  localStorage.setItem('rp:servers', JSON.stringify(custom.filter(s => s.id !== id)));
}

/* config.js — настройки онлайна: официальные серверы и вход через Google.

   ⚠ Эти две константы заполняются один раз:
   OFFICIAL_SERVERS — адреса развёрнутых серверов (см. server/DEPLOY.md);
   GOOGLE_CLIENT_ID — OAuth Client ID из Google Cloud Console (см. server/GOOGLE.md).
   Пока они пустые, игра показывает серверы как «не настроен» и предлагает вход гостем. */

export const GOOGLE_CLIENT_ID = '';

export const OFFICIAL_SERVERS = [
  // Публичные комнаты: работают без своего хостинга, через открытые MQTT-брокеры.
  // Мир детерминированный, поэтому город у всех одинаковый; прогресс хранится на телефоне.
  { id: 'eu1', kind: 'room', name: 'Horizons RP · Европа #1', broker: 'wss://broker.emqx.io:8084/mqtt', room: 'eu1' },
  { id: 'eu2', kind: 'room', name: 'Horizons RP · Европа #2', broker: 'wss://broker.emqx.io:8084/mqtt', room: 'eu2' },
  { id: 'ru1', kind: 'room', name: 'Horizons RP · Свободный', broker: 'wss://broker.hivemq.com:8884/mqtt', room: 'ru1' },
  { id: 'test', kind: 'room', name: 'Horizons RP · Песочница', broker: 'wss://test.mosquitto.org:8081/mqtt', room: 'sandbox' }
  // Выделенный сервер (аккаунты + облачные сейвы) добавляется так:
  // { id: 'main', kind: 'ws', name: 'Horizons RP — Официальный', url: 'wss://адрес-сервера' }
];

/** Client ID для входа через Google можно задать прямо в игре (экран «Онлайн»). */
export function googleClientId() {
  try { return localStorage.getItem('rp:googleClientId') || GOOGLE_CLIENT_ID; }
  catch (e) { return GOOGLE_CLIENT_ID; }
}

export function setGoogleClientId(id) {
  try { localStorage.setItem('rp:googleClientId', String(id || '').trim()); } catch (e) { /* no-op */ }
}

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
  // свои серверы — всегда выделенные (kind: 'ws')
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

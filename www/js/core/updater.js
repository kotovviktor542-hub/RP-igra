// Обновление игры «на лету»: без скачивания APK.
// Клиент сравнивает свою сборку с version.json на GitHub Pages и, если
// появилась новая, перезагружается на свежую веб-версию.

export const REMOTE = 'https://kotovviktor542-hub.github.io/RP-igra/';

/** Номер установленной сборки (подставляется в CI, см. tools/stamp.js). */
export const BUILD = (window.__HZ_BUILD__ | 0) || 0;

/** Запущены ли мы уже с онлайн-версии. */
export function isRemote() {
  return location.href.indexOf(REMOTE) === 0 || /github\.io$/.test(location.hostname);
}

/** Запрашивает version.json. Возвращает {build, name, date} или null. */
export async function checkVersion(timeoutMs = 7000) {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(REMOTE + 'version.json?t=' + Date.now(),
      { cache: 'no-store', signal: ctl.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return { build: j.build | 0, name: j.name || 'Horizons RP', date: j.date || '' };
  } catch {
    return null;
  }
}

/** Перезагрузка на свежую версию. */
export function applyUpdate(build) {
  try { localStorage.setItem('hz:useRemote', '1'); } catch { /* ignore */ }
  const url = isRemote()
    ? location.pathname + '?v=' + build
    : REMOTE + 'game.html?v=' + build;
  location.replace(url);
}

/**
 * Проверяет обновление и сообщает результат через колбэки.
 * @returns {Promise<{status:'update'|'fresh'|'offline', build:number}>}
 */
export async function checkForUpdate() {
  const info = await checkVersion();
  if (!info) return { status: 'offline', build: BUILD };
  if (info.build > BUILD) return { status: 'update', build: info.build };
  return { status: 'fresh', build: info.build };
}

/** Блокирует ориентацию в ландшафт, если браузер это умеет. */
export function lockLandscape() {
  const o = screen.orientation;
  if (o && typeof o.lock === 'function') {
    o.lock('landscape').catch(() => { /* не поддерживается — покажем подсказку */ });
  }
}

/** Показывает/прячет подсказку «поверни телефон». */
export function watchOrientation(el) {
  if (!el) return;
  const upd = () => {
    const portrait = window.innerHeight > window.innerWidth;
    el.classList.toggle('hidden', !portrait);
  };
  window.addEventListener('resize', upd);
  window.addEventListener('orientationchange', () => setTimeout(upd, 120));
  upd();
}

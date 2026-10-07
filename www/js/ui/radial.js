/* radial.js — радиальное меню слева по центру экрана.
   Тап по кругу раскрывает полукольцо кнопок: инвентарь, карта, работа, телефон,
   транспорт, задания, банк, настройки. Повторный тап (или выбор) — сворачивает. */

const $ = id => document.getElementById(id);

export const RADIAL_ITEMS = [
  { id: 'inventory',  icon: '🎒', label: 'Вещи' },
  { id: 'map',        icon: '🗺', label: 'Карта' },
  { id: 'jobs',       icon: '💼', label: 'Работа' },
  { id: 'vehicles',   icon: '🚗', label: 'Транспорт' },
  { id: 'quests',     icon: '⭐', label: 'Задания' },
  { id: 'phone',      icon: '📱', label: 'Телефон' },
  { id: 'bank',       icon: '🏦', label: 'Банк' },
  { id: 'chat',       icon: '💬', label: 'Чат' },
  { id: 'settings',   icon: '⚙', label: 'Настройки' }
];

export class RadialMenu {
  constructor(game) {
    this.game = game;
    this.root = $('radial');
    this.core = $('radial-btn');
    this.list = $('radial-items');
    this.open = false;
    this.radius = 126;

    this._build();

    this.core.addEventListener('click', e => { e.preventDefault(); this.toggle(); });
    // клик мимо меню — закрыть
    window.addEventListener('pointerdown', e => {
      if (this.open && !this.root.contains(e.target)) this.close();
    });
  }

  _build() {
    this.list.innerHTML = '';
    this.buttons = [];
    const n = RADIAL_ITEMS.length;
    // полукольцо вправо: от -80° до +80°
    const from = -Math.PI * 0.46, to = Math.PI * 0.46;
    RADIAL_ITEMS.forEach((it, i) => {
      const a = from + (to - from) * (i / (n - 1));
      const b = document.createElement('button');
      b.className = 'radial-item';
      b.dataset.id = it.id;
      b.innerHTML = `<span class="ri-ic">${it.icon}</span><span class="ri-lb">${it.label}</span>`;
      b.style.setProperty('--dx', (Math.cos(a) * this.radius).toFixed(1) + 'px');
      b.style.setProperty('--dy', (Math.sin(a) * this.radius).toFixed(1) + 'px');
      b.style.transitionDelay = (i * 18) + 'ms';
      b.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.pick(it.id);
      });
      this.list.appendChild(b);
      this.buttons.push(b);
    });
  }

  toggle() { this.open ? this.close() : this.show(); }

  show() {
    this.open = true;
    this.root.classList.add('open');
    this.core.textContent = '✕';
  }

  close() {
    this.open = false;
    this.root.classList.remove('open');
    this.core.textContent = '☰';
  }

  /** Выполняет действие пункта меню. */
  pick(id) {
    this.close();
    const g = this.game;
    if (!g.player) { g.hud && g.hud.toast('Сначала начни игру'); return; }
    if (id === 'map') { g.openMap ? g.openMap() : g.bigmap.show(); return; }
    if (id === 'chat') { g.chat.toggleInput(); return; }
    g.panels.open(id);
  }

  /** Подсвечивает пункт, панель которого открыта. */
  setActive(id) {
    if (!this.buttons) return;
    for (const b of this.buttons) b.classList.toggle('active', b.dataset.id === id);
  }

  setVisible(on) {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.close();
  }
}

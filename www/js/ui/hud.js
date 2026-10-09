/* hud.js — HUD: деньги, потребности, часы, миникарта, спидометр, подсказки, тосты, трекер. */

import { fmtMoney, clamp } from '../core/utils.js';
import { GRID, CELL, roadX, OFFSET, WORLD } from '../world/city.js';
import { ECONOMY } from '../game/content.js';

const $ = id => document.getElementById(id);

const STATS = [
  { id: 'health', icon: '♥', color: '#ff5d5d' },
  { id: 'hunger', icon: '🍗', color: '#ffb020' },
  { id: 'thirst', icon: '💧', color: '#49a0ff' },
  { id: 'energy', icon: '⚡', color: '#3ddc84' }
];

const STREETS_NS = ['Северный пр.', 'Заводская', 'Парковая', 'Лесная', 'Речная', 'Садовая',
  'Привокзальная', 'Портовая', 'Южный бул.', 'Торговая', 'Старая', 'Новая'];
const STREETS_EW = ['1-я линия', '2-я линия', '3-я линия', 'Центральная', 'Банковская',
  'Мэрская', 'Университетская', 'Фабричная', 'Зелёная', 'Набережная', 'Кольцевая', 'Окраинная'];

export class HUD {
  constructor() {
    this.root = $('hud');
    this.statEls = {};
    this._buildStats();

    this.mm = $('minimap');
    this.mmCtx = this.mm.getContext('2d');
    this.speedo = $('speedo');
    this.spCtx = $('speedo-canvas').getContext('2d');
    this.toastBox = $('toasts');
    this.promptEl = $('prompt');
    this.tracker = $('tracker');
    this._mmScale = 0.55;
    this._toasts = [];
  }

  /** Красная вспышка по краям при получении урона. */
  flashDamage() {
    const el = $('dmg-flash');
    if (!el) return;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  _buildStats() {
    const box = $('hud-stats');
    box.innerHTML = '';
    STATS.forEach(s => {
      const w = document.createElement('div');
      w.className = 'sbar';
      w.innerHTML = `<i>${s.icon}</i><div class="track"><div class="fill" style="background:${s.color}"></div></div>`;
      box.appendChild(w);
      this.statEls[s.id] = w.querySelector('.fill');
    });
  }

  update(p, engine, player, extra = {}) {
    $('hud-money').textContent = fmtMoney(p.money);
    $('hud-bank').textContent = 'Банк ' + fmtMoney(p.bank);
    $('hud-level').textContent = `Ур. ${p.level} · ${p.xp}/${ECONOMY.levelXp(p.level)} XP`;
    $('hud-clock').textContent = engine.clockString;
    $('hud-fps').textContent = engine.fps + ' fps';

    const w = Math.floor(extra.wanted || 0);
    const we = $('hud-wanted');
    if (we) {
      we.textContent = w ? '★'.repeat(w) : '';
      we.classList.toggle('hidden', w === 0);
    }
    this.setAmmo(extra.ammoText, extra.armed);
    this.setArmor(p.armor || 0);

    STATS.forEach(s => {
      const v = clamp(p.stats[s.id], 0, 100);
      const el = this.statEls[s.id];
      el.style.width = v + '%';
      el.style.background = v < 18 ? '#ff5d5d' : (v < 40 ? '#ffb020' : s.color);
    });

    $('mm-street').textContent = this.streetName(player.pos.x, player.pos.z);
  }

  /** Показывает патроны текущего ствола: «12 / 48». */
  setAmmo(text, armed) {
    const ae = $('hud-ammo');
    if (!ae) return;
    ae.textContent = '🔫 ' + (text || '0 / 0');
    ae.classList.toggle('hidden', !armed);
  }

  /** Показывает броню, если она есть. */
  setArmor(value) {
    const el = $('hud-armor');
    if (!el) return;
    el.textContent = '🛡 ' + Math.round(value);
    el.classList.toggle('hidden', !value);
  }

  streetName(x, z) {
    const i = clamp(Math.round((x - OFFSET) / CELL), 0, GRID);
    const j = clamp(Math.round((z - OFFSET) / CELL), 0, GRID);
    const a = STREETS_NS[i % STREETS_NS.length];
    const b = STREETS_EW[j % STREETS_EW.length];
    return `${a} / ${b}`;
  }

  /* ---------- миникарта ---------- */
  drawMinimap(player, city, traffic, markers, nightAmount) {
    const c = this.mmCtx;
    const S = this.mm.width;
    const R = S / 2;
    const scale = this._mmScale;        // пикселей на метр
    const px = player.pos.x, pz = player.pos.z;
    const rot = -player.camYaw;

    c.save();
    c.clearRect(0, 0, S, S);
    c.fillStyle = nightAmount > 0.5 ? '#0b1119' : '#121a24';
    c.fillRect(0, 0, S, S);

    c.beginPath(); c.arc(R, R, R, 0, 6.3); c.clip();
    c.translate(R, R);
    c.rotate(rot);
    c.translate(-px * scale, -pz * scale);

    // кварталы
    c.fillStyle = nightAmount > 0.5 ? '#1a2534' : '#223042';
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const x0 = roadX(i) + 9, z0 = roadX(j) + 9;
        const w = CELL - 18;
        if (Math.abs(x0 + w / 2 - px) > 170 || Math.abs(z0 + w / 2 - pz) > 170) continue;
        const t = city.districts[i][j];
        c.fillStyle = t === 'park' ? '#1d3a26'
          : t === 'downtown' ? '#2b3850'
          : t === 'industrial' ? '#38322a'
          : t === 'parking' ? '#262b33'
          : (nightAmount > 0.5 ? '#1a2534' : '#223042');
        c.fillRect(x0 * scale, z0 * scale, w * scale, w * scale);
      }
    }

    // дороги
    c.strokeStyle = nightAmount > 0.5 ? '#39465a' : '#4d5a6e';
    c.lineWidth = 16 * scale;
    c.beginPath();
    for (let i = 0; i <= GRID; i++) {
      const p = roadX(i);
      if (Math.abs(p - px) < 190) { c.moveTo(p * scale, (pz - 190) * scale); c.lineTo(p * scale, (pz + 190) * scale); }
      if (Math.abs(p - pz) < 190) { c.moveTo((px - 190) * scale, p * scale); c.lineTo((px + 190) * scale, p * scale); }
    }
    c.stroke();

    // маркеры
    (markers || []).forEach(m => {
      if (Math.abs(m.x - px) > 180 || Math.abs(m.z - pz) > 180) return;
      c.fillStyle = m.color || '#ffcf4a';
      c.beginPath();
      c.arc(m.x * scale, m.z * scale, 3.4, 0, 6.3);
      c.fill();
    });

    // трафик
    if (traffic) {
      c.fillStyle = '#9fb0c8';
      traffic.cars.forEach(car => {
        const dx = car.v.pos.x - px, dz = car.v.pos.z - pz;
        if (Math.abs(dx) > 150 || Math.abs(dz) > 150) return;
        c.fillRect(car.v.pos.x * scale - 1.2, car.v.pos.z * scale - 1.2, 2.4, 2.4);
      });
    }

    c.restore();

    // игрок (всегда в центре, смотрит вверх)
    c.save();
    c.translate(R, R);
    c.rotate(player.heading - player.camYaw + Math.PI);
    c.fillStyle = '#49a0ff';
    c.beginPath();
    c.moveTo(0, -7); c.lineTo(5, 6); c.lineTo(0, 3); c.lineTo(-5, 6);
    c.closePath(); c.fill();
    c.restore();

    // север
    c.save();
    c.translate(R, R);
    c.rotate(rot);
    c.fillStyle = '#ff6b6b';
    c.font = 'bold 10px sans-serif';
    c.textAlign = 'center';
    c.fillText('N', 0, -R + 12);
    c.restore();
  }

  /* ---------- спидометр ---------- */
  showSpeedo(on) { this.speedo.classList.toggle('hidden', !on); }

  drawSpeedo(vehicle) {
    const c = this.spCtx;
    const S = 190, R = S / 2;
    c.clearRect(0, 0, S, S);

    const maxKmh = vehicle.spec.maxSpeed * 3.6;
    const kmh = vehicle.speedKmh;
    const start = Math.PI * 0.75, end = Math.PI * 2.25;
    const t = clamp(kmh / maxKmh, 0, 1);

    c.lineCap = 'round';
    // фон
    c.strokeStyle = 'rgba(0,0,0,.55)';
    c.lineWidth = 13;
    c.beginPath(); c.arc(R, R, R - 16, start, end); c.stroke();
    // шкала
    c.strokeStyle = 'rgba(255,255,255,.14)';
    c.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      const a = start + (end - start) * (i / 8);
      c.beginPath();
      c.moveTo(R + Math.cos(a) * (R - 24), R + Math.sin(a) * (R - 24));
      c.lineTo(R + Math.cos(a) * (R - 11), R + Math.sin(a) * (R - 11));
      c.stroke();
    }
    // заполнение
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#49a0ff');
    g.addColorStop(0.65, '#ffcf4a');
    g.addColorStop(1, '#ff5d5d');
    c.strokeStyle = g;
    c.lineWidth = 11;
    c.beginPath();
    c.arc(R, R, R - 16, start, start + (end - start) * t);
    c.stroke();

    // стрелка
    const a = start + (end - start) * t;
    c.strokeStyle = '#fff';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(R, R);
    c.lineTo(R + Math.cos(a) * (R - 30), R + Math.sin(a) * (R - 30));
    c.stroke();

    $('speed-num').textContent = Math.round(kmh);
    const fp = (vehicle.fuel / vehicle.maxFuel) * 100;
    const ff = $('fuel-fill');
    ff.style.width = fp + '%';
    ff.style.background = fp < 12 ? '#ff5d5d' : fp < 30 ? '#ffb020' : '#3ddc84';
    $('fuel-txt').textContent = Math.round(vehicle.fuel) + ' л';
  }

  /* ---------- подсказка ---------- */
  setPrompt(html) {
    if (!html) { this.promptEl.classList.add('hidden'); return; }
    if (this.promptEl.innerHTML !== html) this.promptEl.innerHTML = html;
    this.promptEl.classList.remove('hidden');
  }

  /* ---------- тосты ---------- */
  toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    this.toastBox.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s,transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(() => el.remove(), 320);
    }, 2600);
    while (this.toastBox.children.length > 5) this.toastBox.firstChild.remove();
  }

  /* ---------- трекер задания ---------- */
  setTracker(title, step, dist) {
    if (!title) { this.tracker.classList.add('hidden'); return; }
    this.tracker.classList.remove('hidden');
    $('tracker-title').textContent = title;
    $('tracker-step').textContent = step || '';
    $('tracker-dist').textContent = dist != null ? `${Math.round(dist)} м` : '';
  }
}

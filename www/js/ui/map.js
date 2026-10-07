/* map.js — полноэкранная карта города: районы, дороги, POI, маршрут, зум и панорама. */

import { GRID, CELL, ROAD, roadX, OFFSET, WORLD } from '../world/city.js';
import { clamp, dist2D } from '../core/utils.js';

const $ = id => document.getElementById(id);

const POI_STYLE = {
  shop:     { c: '#49a0ff', label: 'Магазины' },
  gas:      { c: '#ffb020', label: 'АЗС' },
  house:    { c: '#9b7bff', label: 'Жильё' },
  atm:      { c: '#3ddc84', label: 'Банкоматы' },
  police:   { c: '#5f8fff', label: 'Полиция' },
  hospital: { c: '#ff5d5d', label: 'Больница' },
  cityhall: { c: '#d8c080', label: 'Мэрия' },
  mall:     { c: '#ff8ad0', label: 'ТЦ' },
  job:      { c: '#ffcf4a', label: 'Работа' },
  park:     { c: '#58c06a', label: 'Парки' },
  parking:  { c: '#8d99ac', label: 'Парковки' },
  plaza:    { c: '#c0c8d4', label: 'Площадь' },
  busstop:  { c: '#6fd0d8', label: 'Остановки' }
};

export class BigMap {
  constructor(game) {
    this.game = game;
    this.root = $('bigmap');
    this.canvas = $('bigmap-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.scale = 0.4;
    this.ox = 0;
    this.oz = 0;
    this.visible = false;
    this.filter = null;

    $('bigmap-close').addEventListener('click', () => this.hide());
    this._initGestures();
    this._buildLegend();
  }

  _buildLegend() {
    const box = $('bigmap-legend');
    box.innerHTML = '';
    Object.entries(POI_STYLE).forEach(([k, v]) => {
      const b = document.createElement('div');
      b.className = 'lg';
      b.innerHTML = `<i style="background:${v.c}"></i>${v.label}`;
      b.style.cursor = 'pointer';
      b.onclick = () => { this.filter = this.filter === k ? null : k; this.draw(); };
      box.appendChild(b);
    });
    const clr = document.createElement('div');
    clr.className = 'lg';
    clr.innerHTML = '✕ сброс';
    clr.onclick = () => { this.filter = null; this.draw(); };
    box.appendChild(clr);
  }

  _initGestures() {
    const c = this.canvas;
    let dragging = false, lx = 0, ly = 0, pinch = 0;

    const toWorld = (sx, sy) => {
      const r = c.getBoundingClientRect();
      return {
        x: (sx - r.left - r.width / 2) / this.scale + this.ox,
        z: (sy - r.top - r.height / 2) / this.scale + this.oz
      };
    };
    this._toWorld = toWorld;

    const down = e => {
      const t = e.touches ? e.touches[0] : e;
      dragging = true; lx = t.clientX; ly = t.clientY;
      this._downPos = { x: t.clientX, y: t.clientY, time: Date.now() };
    };
    const move = e => {
      if (e.touches && e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) this.scale = clamp(this.scale * (d / pinch), 0.12, 2.2);
        pinch = d;
        this.draw();
        return;
      }
      if (!dragging) return;
      const t = e.touches ? e.touches[0] : e;
      this.ox -= (t.clientX - lx) / this.scale;
      this.oz -= (t.clientY - ly) / this.scale;
      lx = t.clientX; ly = t.clientY;
      this.draw();
    };
    const up = e => {
      // короткий тап — ставим метку
      if (this._downPos && Date.now() - this._downPos.time < 260) {
        const t = (e.changedTouches ? e.changedTouches[0] : e);
        const moved = Math.hypot(t.clientX - this._downPos.x, t.clientY - this._downPos.y);
        if (moved < 8) {
          const w = toWorld(t.clientX, t.clientY);
          this.game.setWaypoint(w.x, w.z, 'Метка на карте');
          this.draw();
        }
      }
      dragging = false; pinch = 0;
    };

    c.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: true });
    c.addEventListener('touchmove', move, { passive: true });
    c.addEventListener('touchend', up);
    c.addEventListener('wheel', e => {
      this.scale = clamp(this.scale * (e.deltaY > 0 ? 0.9 : 1.1), 0.12, 2.2);
      this.draw();
      e.preventDefault();
    }, { passive: false });
  }

  show() {
    this.visible = true;
    this.root.classList.remove('hidden');
    const p = this.game.player3d.pos;
    this.ox = p.x; this.oz = p.z;
    this._resize();
    this.draw();
  }

  hide() {
    this.visible = false;
    this.root.classList.add('hidden');
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = r.width * dpr;
    this.canvas.height = r.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._w = r.width;
    this._h = r.height;
  }

  draw() {
    if (!this.visible) return;
    if (!this._w) this._resize();
    const c = this.ctx;
    const W = this._w, H = this._h;
    const city = this.game.city;
    const s = this.scale;

    c.save();
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#0a1018';
    c.fillRect(0, 0, W, H);

    c.translate(W / 2, H / 2);
    c.scale(s, s);
    c.translate(-this.ox, -this.oz);

    // кварталы
    for (let i = 0; i < GRID; i++) {
      for (let j = 0; j < GRID; j++) {
        const t = city.districts[i][j];
        c.fillStyle = {
          downtown: '#2c3a54', commercial: '#263244', residential: '#1f2a36',
          industrial: '#352e26', park: '#1c3a27', parking: '#232831',
          plaza: '#333b46', gas: '#3a3326', civic: '#2e3a44'
        }[t] || '#1f2a36';
        c.fillRect(roadX(i) + ROAD / 2, roadX(j) + ROAD / 2, CELL - ROAD, CELL - ROAD);
      }
    }

    // дороги
    c.strokeStyle = '#4b5768';
    c.lineWidth = ROAD;
    c.beginPath();
    for (let i = 0; i <= GRID; i++) {
      const p = roadX(i);
      c.moveTo(p, OFFSET - 30); c.lineTo(p, -OFFSET + 30);
      c.moveTo(OFFSET - 30, p); c.lineTo(-OFFSET + 30, p);
    }
    c.stroke();

    c.strokeStyle = 'rgba(255,255,255,.14)';
    c.lineWidth = 0.6 / s;
    c.beginPath();
    for (let i = 0; i <= GRID; i++) {
      const p = roadX(i);
      c.moveTo(p, OFFSET - 30); c.lineTo(p, -OFFSET + 30);
      c.moveTo(OFFSET - 30, p); c.lineTo(-OFFSET + 30, p);
    }
    c.stroke();

    // POI
    const r = clamp(5 / s, 2.5, 14);
    city.pois.forEach(poi => {
      const st = POI_STYLE[poi.type];
      if (!st) return;
      if (this.filter && poi.type !== this.filter) return;
      if (poi.type === 'house' && this.scale < 0.25) return;
      if (poi.type === 'busstop' && this.scale < 0.4) return;
      c.fillStyle = st.c;
      c.beginPath();
      c.arc(poi.x, poi.z, r, 0, 6.3);
      c.fill();
    });

    // транспорт игрока на улице
    this.game.worldVehicles.forEach(v => {
      if (!v.ownerPlate) return;
      c.fillStyle = '#ffffff';
      c.fillRect(v.pos.x - r, v.pos.z - r, r * 2, r * 2);
    });

    // точки активной смены
    const job = this.game.player.job;
    if (job) {
      job.stops.forEach((s2, idx) => {
        c.fillStyle = s2.done ? 'rgba(90,110,130,.5)' : (idx === job.current ? '#ffcf4a' : '#8d99ac');
        c.beginPath();
        c.arc(s2.x, s2.z, r * 1.5, 0, 6.3);
        c.fill();
        if (idx === job.current) {
          c.strokeStyle = '#ffcf4a';
          c.lineWidth = 2 / s;
          c.beginPath();
          c.arc(s2.x, s2.z, r * 3, 0, 6.3);
          c.stroke();
        }
      });
    }

    // метка маршрута
    const wp = this.game.waypoint;
    if (wp) {
      c.strokeStyle = '#ff5db8';
      c.lineWidth = 2.5 / s;
      c.beginPath();
      c.arc(wp.x, wp.z, r * 2.4, 0, 6.3);
      c.stroke();
      c.beginPath();
      c.moveTo(wp.x - r * 3, wp.z); c.lineTo(wp.x + r * 3, wp.z);
      c.moveTo(wp.x, wp.z - r * 3); c.lineTo(wp.x, wp.z + r * 3);
      c.stroke();
    }

    // другие игроки
    if (this.game.net && this.game.net.connected) {
      this.game.net.players.forEach(pl => {
        c.fillStyle = '#ff9f4a';
        c.beginPath();
        c.arc(pl.x, pl.z, r * 1.3, 0, 6.3);
        c.fill();
      });
    }

    // игрок
    const p = this.game.player3d;
    c.save();
    c.translate(p.pos.x, p.pos.z);
    c.rotate(-p.heading + Math.PI);
    c.fillStyle = '#49a0ff';
    const ps = clamp(9 / s, 4, 22);
    c.beginPath();
    c.moveTo(0, -ps); c.lineTo(ps * 0.7, ps * 0.8); c.lineTo(0, ps * 0.35); c.lineTo(-ps * 0.7, ps * 0.8);
    c.closePath(); c.fill();
    c.restore();

    c.restore();

    // подпись
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.font = '11px sans-serif';
    c.fillText(`масштаб ${(this.scale * 100).toFixed(0)}% · тап — поставить метку${this.filter ? ' · фильтр: ' + POI_STYLE[this.filter].label : ''}`, 12, H - 10);
  }
}

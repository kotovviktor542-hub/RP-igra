/* controls.js — единый ввод: сенсорный джойстик + кнопки + клавиатура + мышь. */

import { clamp } from '../core/utils.js';

const $ = id => document.getElementById(id);

/* иконки, которые меняются при посадке в машину */
const ICON = {
  hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="3.6" r="1.8"/><path d="M12 7.2v6"/><path d="M12 13.2V10a1.4 1.4 0 0 1 2.8 0v3.2"/><path d="M14.8 13.4v-1.6a1.4 1.4 0 0 1 2.8 0V16a5 5 0 0 1-5 5h-1.4a4.4 4.4 0 0 1-3.2-1.4l-3-3.2a1.5 1.5 0 0 1 2.1-2.1L10 16.2V9.6a1.4 1.4 0 0 1 2.8 0"/></svg>',
  exit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8"/><path d="M10 12h10"/><path d="m17 8 4 4-4 4"/></svg>',
  run: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="15.5" cy="4" r="2.2"/><path d="M12.6 21l1.8-5.4-3.1-2.6-1 4"/><path d="M14.4 15.6 17 21"/><path d="M8.2 9.6 12.6 7.4a2 2 0 0 1 2.2.2l2.1 1.7 2.6.6"/><path d="M11.3 13 9.6 11.4"/><path d="M3.6 12.2h3.2M2.8 16h3.6"/></svg>',
  turbo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16a8 8 0 1 1 16 0"/><path d="m12 14 4-4"/><circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none"/></svg>'
};

export class Controls {
  constructor(game) {
    this.game = game;
    this.input = {
      mx: 0, my: 0, run: false, jump: false,
      throttle: 0, steer: 0, brake: 0, handbrake: false
    };
    this.touch = { run: false, jump: false, brake: false };
    this.keys = new Set();
    this.lookDelta = { x: 0, y: 0 };
    this.actionPressed = false;

    this._initStick();
    this._initButtons();
    this._initKeyboard();
    this._initLook();
  }

  /* ---------- джойстик ---------- */
  _initStick() {
    const stick = $('stick');
    const knob = $('stick-knob');
    let id = null, cx = 0, cy = 0, R = 46;

    const start = e => {
      const t = e.changedTouches ? e.changedTouches[0] : e;
      id = e.changedTouches ? t.identifier : 'mouse';
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      R = r.width / 2 - 12;
      move(e);
    };
    const move = e => {
      if (id === null) return;
      let t = e;
      if (e.changedTouches) {
        t = Array.from(e.changedTouches).find(x => x.identifier === id);
        if (!t) return;
      }
      let dx = t.clientX - cx;
      let dy = t.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.input.mx = dx / R;
      this.input.my = -dy / R;
      e.preventDefault();
    };
    const end = e => {
      if (e.changedTouches && !Array.from(e.changedTouches).some(x => x.identifier === id)) return;
      id = null;
      knob.style.transform = '';
      this.input.mx = 0;
      this.input.my = 0;
    };

    stick.addEventListener('touchstart', start, { passive: false });
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
    stick.addEventListener('mousedown', start);
    window.addEventListener('mousemove', e => { if (id === 'mouse') move(e); });
    window.addEventListener('mouseup', e => { if (id === 'mouse') end(e); });
  }

  /* ---------- кнопки ---------- */
  _hold(el, onDown, onUp) {
    if (!el) return;
    const down = e => { e.preventDefault(); el.classList.add('on'); onDown && onDown(); };
    const up = e => { e && e.preventDefault(); el.classList.remove('on'); onUp && onUp(); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
    el.addEventListener('mouseleave', up);
  }

  _initButtons() {
    this._hold($('b-run'), () => { this.touch.run = true; }, () => { this.touch.run = false; });
    this._hold($('b-brake'), () => { this.touch.brake = true; }, () => { this.touch.brake = false; });
    this._hold($('b-jump'), () => { this.touch.jump = true; }, () => { this.touch.jump = false; });

    $('b-action').addEventListener('click', () => this.game.interact());
    $('b-punch').addEventListener('click', () => this.game.punch());
    $('b-aim').addEventListener('click', () => this.game.toggleAim());
    $('b-horn').addEventListener('click', () => this.game.horn());
    $('b-light').addEventListener('click', () => this.game.toggleLights());

  }

  /* ---------- клавиатура ---------- */
  _initKeyboard() {
    const isTyping = () => document.activeElement &&
      ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);

    window.addEventListener('keydown', e => {
      if (isTyping()) {
        if (e.code === 'Escape') document.activeElement.blur();
        return;
      }
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyE': case 'KeyF': this.game.interact(); break;
        case 'KeyM': this.game.toggleMap(); break;
        case 'KeyI': this.game.panels.toggle('inventory'); break;
        case 'KeyJ': this.game.panels.toggle('jobs'); break;
        case 'KeyP': case 'Tab': e.preventDefault(); this.game.panels.toggle('phone'); break;
        case 'KeyH': this.game.horn(); break;
        case 'KeyR': this.game.punch(); break;
        case 'KeyQ': this.game.toggleAim(); break;
        case 'KeyL': this.game.toggleLights(); break;
        case 'KeyV': this.game.player3d.firstPerson = !this.game.player3d.firstPerson; break;
        case 'Enter': this.game.chat.toggleInput(); break;
        case 'Escape': this.game.panels.close(); this.game.closeMap(); break;
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /* ---------- обзор мышью/пальцем ---------- */
  _initLook() {
    const canvas = $('gl');
    let touchId = null, lastX = 0, lastY = 0, dragging = false;
    let pinchDist = 0;

    const isUI = t => {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      return el && el.closest && el.closest('.touch, .radial, .panel, .overlay, .minimap-wrap, .speedo, .chat-input-row');
    };

    canvas.addEventListener('touchstart', e => {
      for (const t of e.changedTouches) {
        if (touchId === null && !isUI(t)) {
          touchId = t.identifier; lastX = t.clientX; lastY = t.clientY;
        }
      }
      if (e.touches.length === 2) {
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });

    window.addEventListener('touchmove', e => {
      if (e.touches.length === 2 && pinchDist) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        this.game.player3d.zoom((pinchDist - d) * 0.02);
        pinchDist = d;
        return;
      }
      for (const t of e.changedTouches) {
        if (t.identifier !== touchId) continue;
        this.lookDelta.x += t.clientX - lastX;
        this.lookDelta.y += t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
      }
    }, { passive: true });

    const endTouch = e => {
      for (const t of e.changedTouches) if (t.identifier === touchId) touchId = null;
      if (e.touches.length < 2) pinchDist = 0;
    };
    window.addEventListener('touchend', endTouch);
    window.addEventListener('touchcancel', endTouch);

    canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      this.lookDelta.x += e.clientX - lastX;
      this.lookDelta.y += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('wheel', e => {
      this.game.player3d.zoom(e.deltaY * 0.004);
      e.preventDefault();
    }, { passive: false });
  }

  /** Сводит клавиатуру и сенсор в один input. Вызывать каждый кадр. */
  poll(driving) {
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);

    const i = this.input;
    const useKeys = kx !== 0 || ky !== 0;

    const space = k.has('Space');
    const shift = k.has('ShiftLeft') || k.has('ShiftRight');

    if (driving) {
      i.throttle = clamp(useKeys ? ky : i.my, -1, 1);
      i.steer = clamp(useKeys ? kx : i.mx, -1, 1);
      i.handbrake = space || this.touch.brake;
      i.brake = i.handbrake ? 1 : 0;
      i.run = shift || this.touch.run;
      i.jump = false;
    } else {
      if (useKeys) { i.mx = kx; i.my = ky; }
      i.run = shift || this.touch.run;
      i.jump = space || this.touch.jump;
      i.brake = 0;
      i.handbrake = false;
      i.throttle = 0;
      i.steer = 0;
    }

    // применяем накопленный поворот камеры
    if (this.lookDelta.x || this.lookDelta.y) {
      this.game.player3d.orbit(this.lookDelta.x, this.lookDelta.y);
      this.lookDelta.x = 0;
      this.lookDelta.y = 0;
    }
    return i;
  }

  setDrivingMode(on) {
    $('touch').classList.toggle('driving', !!on);
    const act = $('b-action'), run = $('b-run');
    const label = (el, text) => { if (el) { el.setAttribute('aria-label', text); el.title = text; } };
    label(act, on ? 'Выйти из машины' : 'Действие');
    label(run, on ? 'Турбо' : 'Бег');
    if (act) act.innerHTML = on ? ICON.exit : ICON.hand;
    if (run) run.innerHTML = on ? ICON.turbo : ICON.run;
    if (on) this.game.toggleAim(false);
  }
}

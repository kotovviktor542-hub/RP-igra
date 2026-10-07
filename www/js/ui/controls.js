/* controls.js — единый ввод: сенсорный джойстик + кнопки + клавиатура + мышь. */

import { clamp } from '../core/utils.js';

const $ = id => document.getElementById(id);

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
    $('b-horn').addEventListener('click', () => this.game.horn());
    $('b-light').addEventListener('click', () => this.game.toggleLights());

    $('dock-chat').addEventListener('click', () => this.game.chat.toggleInput());
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
      return el && el.closest && el.closest('.touch, .dock, .panel, .overlay, .minimap-wrap, .speedo, .chat-input-row');
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
    $('b-jump').textContent = on ? 'ВЫЙТИ' : '▲';
    $('b-run').textContent = on ? 'ТУРБО' : 'БЕГ';
  }
}

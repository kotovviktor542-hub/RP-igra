/* audio.js — полностью процедурный звук на WebAudio, без внешних файлов.
   Двигатель синтезируется из осцилляторов по оборотам, остальное — из шума.
   Всё лениво и защищено try/catch: если аудио недоступно — просто тишина. */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Генератор шума заданной длины. */
function noiseBuffer(ctx, seconds, pink = false) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (!pink) { d[i] = w; continue; }
    b0 = 0.99765 * b0 + w * 0.0990460;
    b1 = 0.96300 * b1 + w * 0.2965164;
    b2 = 0.57000 * b2 + w * 1.0526913;
    d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.24;
  }
  return buf;
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.volume = 0.8;
    this._engineOn = false;
    this._sirenOn = false;
    this._lastStep = 0;
    this._shots = 0;
    try {
      const s = localStorage.getItem('rp:vol');
      if (s !== null) this.volume = clamp(parseFloat(s) || 0.8, 0, 1);
      if (localStorage.getItem('rp:mute') === '1') this.muted = true;
    } catch { /* нет хранилища */ }
  }

  /* ------------------------- инициализация ------------------------- */
  init() {
    if (this.ctx) { this.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      // лёгкий компрессор, чтобы выстрелы не рвали уши
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.ratio.value = 6;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.22;
      this.master.connect(this.comp);
      this.comp.connect(c.destination);

      // заготовки шума
      this.bufNoise = noiseBuffer(c, 2);
      this.bufPink = noiseBuffer(c, 3, true);

      this._buildEngine();
      this._buildSiren();
      this._buildWeather();
      this.ready = true;
      return true;
    } catch (e) {
      this.ctx = null;
      return false;
    }
  }

  resume() {
    try { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); } catch { /* ignore */ }
  }

  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  _noiseSource(buf, loop) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf || this.bufNoise;
    s.loop = !!loop;
    return s;
  }

  /** Короткий «одноразовый» звук: отдаёт gain, который можно настроить. */
  _voice(dest) {
    const g = this.ctx.createGain();
    g.connect(dest || this.master);
    return g;
  }

  /* ------------------------- движок ------------------------- */
  _buildEngine() {
    const c = this.ctx;
    this.engGain = c.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = c.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 700;
    this.engFilter.Q.value = 3;

    // корпусной гул + выхлоп
    this.engOsc1 = c.createOscillator(); this.engOsc1.type = 'sawtooth';
    this.engOsc2 = c.createOscillator(); this.engOsc2.type = 'square';
    this.engOsc3 = c.createOscillator(); this.engOsc3.type = 'triangle';
    const g1 = c.createGain(); g1.gain.value = 0.5;
    const g2 = c.createGain(); g2.gain.value = 0.22;
    const g3 = c.createGain(); g3.gain.value = 0.3;
    this.engOsc1.connect(g1); this.engOsc2.connect(g2); this.engOsc3.connect(g3);
    g1.connect(this.engFilter); g2.connect(this.engFilter); g3.connect(this.engFilter);

    // шум выхлопа
    this.engNoise = this._noiseSource(this.bufPink, true);
    this.engNoiseF = c.createBiquadFilter();
    this.engNoiseF.type = 'bandpass';
    this.engNoiseF.frequency.value = 220;
    this.engNoiseF.Q.value = 0.9;
    this.engNoiseG = c.createGain(); this.engNoiseG.gain.value = 0.18;
    this.engNoise.connect(this.engNoiseF);
    this.engNoiseF.connect(this.engNoiseG);
    this.engNoiseG.connect(this.master);

    this.engFilter.connect(this.engGain);
    this.engGain.connect(this.master);

    this.engOsc1.frequency.value = 40;
    this.engOsc2.frequency.value = 20;
    this.engOsc3.frequency.value = 80;
    try {
      this.engOsc1.start(); this.engOsc2.start(); this.engOsc3.start();
      this.engNoise.start();
    } catch { /* уже запущен */ }
  }

  /**
   * Обновляет звук двигателя.
   * @param {object} o {on, rpm 0..1, load 0..1, vol 0..1}
   */
  engine(o) {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    const on = !!o.on;
    if (on && !this._engineOn) { this._engineOn = true; }
    if (!on) {
      if (this._engineOn) {
        this.engGain.gain.cancelScheduledValues(t);
        this.engGain.gain.setTargetAtTime(0, t, 0.08);
        this.engNoiseG.gain.setTargetAtTime(0, t, 0.1);
        this._engineOn = false;
      }
      return;
    }
    const rpm = clamp(o.rpm || 0, 0, 1);
    const load = clamp(o.load || 0, 0, 1);
    const vol = clamp(o.vol === undefined ? 1 : o.vol, 0, 1);

    const f = 34 + rpm * 168;                        // основная частота
    this.engOsc1.frequency.setTargetAtTime(f, t, 0.045);
    this.engOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engOsc3.frequency.setTargetAtTime(f * 2.02, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(320 + rpm * 2100 + load * 700, t, 0.06);
    this.engGain.gain.setTargetAtTime(0.055 + rpm * 0.13 + load * 0.09, t, 0.06);
    this.engNoiseF.frequency.setTargetAtTime(150 + rpm * 900, t, 0.08);
    this.engNoiseG.gain.setTargetAtTime((0.03 + load * 0.11 + rpm * 0.05) * vol, t, 0.08);
    this.engGain.gain.value = this.engGain.gain.value; // noop, держим связь
    this._engVol = vol;
  }

  /** Пробуксовка / визг шин. */
  skid(amount = 1, vol = 1) {
    if (!this.ready || amount <= 0.02) return;
    const c = this.ctx, t = this._now();
    if (!this._skid) {
      this._skidSrc = this._noiseSource(this.bufNoise, true);
      this._skidF = c.createBiquadFilter();
      this._skidF.type = 'bandpass'; this._skidF.frequency.value = 1500; this._skidF.Q.value = 4;
      this._skid = c.createGain(); this._skid.gain.value = 0;
      this._skidSrc.connect(this._skidF); this._skidF.connect(this._skid); this._skid.connect(this.master);
      this._skidSrc.start();
    }
    this._skid.gain.setTargetAtTime(clamp(amount, 0, 1) * 0.13 * vol, t, 0.05);
    this._skidF.frequency.setTargetAtTime(1100 + amount * 1400, t, 0.06);
    clearTimeout(this._skidTimer);
    this._skidTimer = setTimeout(() => {
      if (this._skid) this._skid.gain.setTargetAtTime(0, this._now(), 0.08);
    }, 90);
  }

  /* ------------------------- сирена ------------------------- */
  _buildSiren() {
    const c = this.ctx;
    this.sirGain = c.createGain(); this.sirGain.gain.value = 0;
    this.sirOsc = c.createOscillator(); this.sirOsc.type = 'sawtooth';
    this.sirF = c.createBiquadFilter(); this.sirF.type = 'bandpass';
    this.sirF.frequency.value = 900; this.sirF.Q.value = 2.2;
    this.sirOsc.connect(this.sirF); this.sirF.connect(this.sirGain); this.sirGain.connect(this.master);
    this.sirOsc.frequency.value = 700;
    try { this.sirOsc.start(); } catch { /* ignore */ }
    this._sirenPhase = 0;
  }

  siren(on, vol = 1, dist = 1) {
    if (!this.ready) return;
    const t = this._now();
    this.sirGain.gain.setTargetAtTime(on ? 0.1 * vol / (1 + dist * 0.6) : 0, t, 0.08);
  }

  /** Прогоняет частоту сирены — вызывать каждый кадр, когда сирена включена. */
  sirenTick(dt) {
    if (!this.ready || this.sirGain.gain.value < 0.001) return;
    this._sirenPhase = (this._sirenPhase + dt * 1.6) % 1;
    const w = this._sirenPhase < 0.5 ? this._sirenPhase * 2 : 2 - this._sirenPhase * 2;
    this.sirOsc.frequency.setTargetAtTime(560 + w * 460, this._now(), 0.03);
  }

  /* ------------------------- погода ------------------------- */
  _buildWeather() {
    const c = this.ctx;
    this.rainSrc = this._noiseSource(this.bufPink, true);
    this.rainF = c.createBiquadFilter();
    this.rainF.type = 'highpass'; this.rainF.frequency.value = 700;
    this.rainG = c.createGain(); this.rainG.gain.value = 0;
    this.rainSrc.connect(this.rainF); this.rainF.connect(this.rainG); this.rainG.connect(this.master);
    try { this.rainSrc.start(); } catch { /* ignore */ }

    this.windSrc = this._noiseSource(this.bufPink, true);
    this.windF = c.createBiquadFilter();
    this.windF.type = 'lowpass'; this.windF.frequency.value = 400;
    this.windG = c.createGain(); this.windG.gain.value = 0;
    this.windSrc.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
    try { this.windSrc.start(); } catch { /* ignore */ }
    this._windPhase = Math.random() * 10;
  }

  setWeather(rain = 0, wind = 0, inside = false) {
    if (!this.ready) return;
    const t = this._now();
    const m = inside ? 0.25 : 1;
    this.rainG.gain.setTargetAtTime(clamp(rain, 0, 1) * 0.16 * m, t, 0.4);
    this.windG.gain.setTargetAtTime(clamp(wind, 0, 1) * 0.06 * m, t, 0.6);
  }

  windTick(dt, strength) {
    if (!this.ready) return;
    this._windPhase += dt * 0.35;
    const w = (Math.sin(this._windPhase) * 0.5 + 0.5) * 0.6 + 0.4;
    this.windF.frequency.setTargetAtTime(220 + w * 380, this._now(), 0.3);
    this.windG.gain.setTargetAtTime(this.windG.gain.value * (0.7 + w * 0.5 * clamp(strength, 0, 1)), this._now(), 0.5);
  }

  thunder(vol = 1) {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    const src = this._noiseSource(this.bufPink, false);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = this._voice();
    src.connect(f); f.connect(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(70, t + 2.4);
    src.start(t);
    src.stop(t + 2.8);
  }

  /* ------------------------- выстрелы ------------------------- */
  gunshot(kind = 'pistol', dist = 0) {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    if (++this._shots > 14) return;
    setTimeout(() => this._shots--, 120);

    const far = clamp(dist / 60, 0, 1);
    const amp = (kind === 'rifle' ? 0.6 : kind === 'smg' ? 0.42 : 0.5) * (1 - far * 0.75);
    const dur = kind === 'rifle' ? 0.22 : 0.16;

    // хлопóк
    const src = this._noiseSource(this.bufNoise, false);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = kind === 'rifle' ? 1400 : 1900;
    bp.Q.value = 0.7;
    const g = this._voice();
    src.connect(bp); bp.connect(g);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.playbackRate.value = 1 + Math.random() * 0.25;
    src.start(t); src.stop(t + dur + 0.05);

    // низкий удар
    const o = c.createOscillator(); o.type = 'sine';
    const og = this._voice();
    o.connect(og);
    o.frequency.setValueAtTime(kind === 'rifle' ? 150 : 110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    og.gain.setValueAtTime(amp * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t); o.stop(t + 0.2);

    // эхо от зданий
    if (far < 0.85) {
      const e = this._noiseSource(this.bufNoise, false);
      const ef = c.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 620;
      const eg = this._voice();
      e.connect(ef); ef.connect(eg);
      const d0 = t + 0.09 + Math.random() * 0.06;
      eg.gain.setValueAtTime(0.0001, d0);
      eg.gain.exponentialRampToValueAtTime(amp * 0.22 * (1 - far), d0 + 0.02);
      eg.gain.exponentialRampToValueAtTime(0.0001, d0 + 0.5);
      e.start(d0); e.stop(d0 + 0.6);
    }
  }

  reloadClick(part = 0) {
    if (!this.ready) return;
    this._click(part === 0 ? 1500 : 900, 0.05, 0.16);
  }

  _click(freq, dur, amp) {
    const c = this.ctx, t = this._now();
    const o = c.createOscillator(); o.type = 'square';
    const g = this._voice();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 6;
    o.connect(f); f.connect(g);
    o.frequency.value = freq;
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /* ------------------------- шаги ------------------------- */
  step(surface = 'asphalt', running = false) {
    if (!this.ready) return;
    const t = performance.now();
    const gap = running ? 260 : 400;
    if (t - this._lastStep < gap) return;
    this._lastStep = t;
    const c = this.ctx, now = this._now();
    const src = this._noiseSource(this.bufNoise, false);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = surface === 'grass' ? 900 : surface === 'wood' ? 620 : surface === 'tile' ? 2200 : 1300;
    f.Q.value = surface === 'tile' ? 2.4 : 1.1;
    const g = this._voice();
    src.connect(f); f.connect(g);
    const amp = running ? 0.16 : 0.1;
    g.gain.setValueAtTime(amp, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    src.start(now); src.stop(now + 0.12);
  }

  /* ------------------------- удары и урон ------------------------- */
  impact(power = 1, dist = 0) {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    const amp = clamp(power, 0, 2) * 0.34 / (1 + dist * 0.5);
    const src = this._noiseSource(this.bufNoise, false);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900 + power * 900;
    const g = this._voice();
    src.connect(f); f.connect(g);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.start(t); src.stop(t + 0.3);

    const o = c.createOscillator(); o.type = 'sine';
    const og = this._voice();
    o.connect(og);
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    og.gain.setValueAtTime(amp * 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    o.start(t); o.stop(t + 0.3);
  }

  glass() {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    for (let i = 0; i < 7; i++) {
      const d = t + i * 0.014 + Math.random() * 0.02;
      const o = c.createOscillator(); o.type = 'triangle';
      const g = this._voice();
      o.connect(g);
      o.frequency.value = 2400 + Math.random() * 3600;
      g.gain.setValueAtTime(0.06, d);
      g.gain.exponentialRampToValueAtTime(0.0001, d + 0.07);
      o.start(d); o.stop(d + 0.09);
    }
  }

  hurt() {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const g = this._voice();
    o.connect(f); f.connect(g);
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.start(t); o.stop(t + 0.36);
  }

  explosion() {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    const src = this._noiseSource(this.bufPink, false);
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(1200, t);
    f.frequency.exponentialRampToValueAtTime(60, t + 1.4);
    const g = this._voice();
    src.connect(f); f.connect(g);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    src.start(t); src.stop(t + 1.7);

    const o = c.createOscillator(); o.type = 'sine';
    const og = this._voice();
    o.connect(og);
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 0.9);
    og.gain.setValueAtTime(0.8, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.start(t); o.stop(t + 1.2);
  }

  /* ------------------------- интерфейс и прочее ------------------------- */
  ui(kind = 'click') {
    if (!this.ready) return;
    const map = { click: [1150, 0.045, 0.1], back: [520, 0.07, 0.1], ok: [880, 0.09, 0.12], err: [180, 0.16, 0.14] };
    const m = map[kind] || map.click;
    this._click(m[0], m[1], m[2]);
  }

  cash() {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    [0, 0.06, 0.13].forEach((d, i) => {
      const o = c.createOscillator(); o.type = 'sine';
      const g = this._voice();
      o.connect(g);
      o.frequency.value = 900 + i * 340;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.13, t + d + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16);
      o.start(t + d); o.stop(t + d + 0.2);
    });
  }

  notify(good = true) {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    const freqs = good ? [660, 990] : [420, 300];
    freqs.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine';
      const g = this._voice();
      o.connect(g);
      o.frequency.value = f;
      const d = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, d);
      g.gain.exponentialRampToValueAtTime(0.14, d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, d + 0.2);
      o.start(d); o.stop(d + 0.24);
    });
  }

  radio() {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    const o = c.createOscillator(); o.type = 'square';
    const g = this._voice();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 8;
    o.connect(f); f.connect(g);
    o.frequency.value = 1200;
    g.gain.setValueAtTime(0.07, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.start(t); o.stop(t + 0.11);
  }

  horn(dist = 0) {
    if (!this.ready) return;
    const c = this.ctx, t = this._now();
    const amp = 0.2 / (1 + dist * 0.4);
    [400, 505].forEach(f0 => {
      const o = c.createOscillator(); o.type = 'sawtooth';
      const g = this._voice();
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400;
      o.connect(f); f.connect(g);
      o.frequency.value = f0;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.03);
      g.gain.setValueAtTime(amp, t + 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
      o.start(t); o.stop(t + 0.55);
    });
  }

  door(open = true) {
    if (!this.ready) return;
    this._click(open ? 320 : 240, 0.12, 0.16);
  }

  /* ------------------------- громкость ------------------------- */
  setVolume(v) {
    this.volume = clamp(v, 0, 1);
    try { localStorage.setItem('rp:vol', String(this.volume)); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem('rp:mute', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  toggleMute() { this.setMuted(!this.muted); return this.muted; }
}

export const SFX = new AudioEngine();

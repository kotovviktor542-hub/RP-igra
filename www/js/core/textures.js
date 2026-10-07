/* textures.js — процедурные PBR-текстуры (albedo + roughness + normal + emissive).
   Всё рисуется в canvas на лету: ноль внешних файлов, маленький APK. */

import * as THREE from '../../vendor/three.module.js';

const cache = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function toTexture(canvas, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Нормаль-мапа из карты высот (Sobel). */
function normalFromHeight(canvas, strength = 2.0) {
  const size = canvas.width;
  const src = canvas.getContext('2d').getImageData(0, 0, size, size).data;
  const out = makeCanvas(size);
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(size, size);

  const h = (x, y) => {
    const xi = ((x % size) + size) % size;
    const yi = ((y % size) + size) % size;
    const i = (yi * size + xi) * 4;
    return (src[i] + src[i + 1] + src[i + 2]) / 765;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * strength;
      const dy = (h(x, y - 1) - h(x, y + 1)) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function noise(ctx, size, amount, alpha) {
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    if (alpha !== undefined) d[i + 3] = alpha;
  }
  ctx.putImageData(img, 0, 0);
}

function splotches(ctx, size, count, colors, rMin, rMax, alpha = 0.18) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = rMin + Math.random() * (rMax - rMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = colors[(Math.random() * colors.length) | 0];
    g.addColorStop(0, `rgba(${col},${alpha})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ======================= АСФАЛЬТ ======================= */
function asphalt() {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3c40';
  ctx.fillRect(0, 0, S, S);

  // крупный гравий
  for (let i = 0; i < 4200; i++) {
    const g = 40 + Math.random() * 55;
    ctx.fillStyle = `rgba(${g},${g + 2},${g + 5},${0.25 + Math.random() * 0.5})`;
    const x = Math.random() * S, y = Math.random() * S;
    const r = 0.6 + Math.random() * 2.2;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + Math.random() * 0.6), Math.random() * 3.14, 0, 6.3);
    ctx.fill();
  }
  // пятна масла и заплатки
  splotches(ctx, S, 14, ['20,20,24', '55,55,58', '30,32,34'], 20, 70, 0.22);
  // трещины
  ctx.strokeStyle = 'rgba(25,25,28,0.5)';
  for (let i = 0; i < 18; i++) {
    ctx.lineWidth = 0.4 + Math.random() * 1.1;
    ctx.beginPath();
    let x = Math.random() * S, y = Math.random() * S;
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += (Math.random() - 0.5) * 60;
      y += (Math.random() - 0.5) * 60;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  noise(ctx, S, 26);

  const rough = makeCanvas(S);
  const rctx = rough.getContext('2d');
  rctx.drawImage(c, 0, 0);
  rctx.fillStyle = 'rgba(255,255,255,0.45)';
  rctx.fillRect(0, 0, S, S);
  splotches(rctx, S, 20, ['90,90,90'], 25, 80, 0.5); // мокрые/залоснённые участки

  return {
    map: toTexture(c, 1),
    normalMap: toTexture(normalFromHeight(c, 1.4), 1, false),
    roughnessMap: toTexture(rough, 1, false)
  };
}

/* ======================= ТРОТУАР ======================= */
function sidewalk() {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9a9a96';
  ctx.fillRect(0, 0, S, S);

  const tile = S / 4;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const v = 142 + Math.random() * 32;
      ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      ctx.fillRect(x * tile + 1.5, y * tile + 1.5, tile - 3, tile - 3);
      // фаска
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x * tile + 2.5, y * tile + 2.5, tile - 5, tile - 5);
    }
  }
  ctx.strokeStyle = 'rgba(60,60,58,0.55)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * tile, 0); ctx.lineTo(i * tile, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i * tile); ctx.lineTo(S, i * tile); ctx.stroke();
  }
  splotches(ctx, S, 25, ['110,108,104', '70,70,68'], 10, 45, 0.16);
  noise(ctx, S, 16);

  return {
    map: toTexture(c, 1),
    normalMap: toTexture(normalFromHeight(c, 2.2), 1, false),
    roughnessMap: null
  };
}

/* ======================= ТРАВА / ЗЕМЛЯ ======================= */
function grass() {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3f6133';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const g = 50 + Math.random() * 60;
    ctx.strokeStyle = `rgba(${g * 0.55},${g + 20},${g * 0.4},${0.3 + Math.random() * 0.5})`;
    ctx.lineWidth = 0.7;
    const x = Math.random() * S, y = Math.random() * S;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (Math.random() - 0.5) * 3, y - 1 - Math.random() * 3);
    ctx.stroke();
  }
  splotches(ctx, S, 18, ['90,110,60', '45,65,35', '110,100,60'], 15, 55, 0.22);
  noise(ctx, S, 18);
  return { map: toTexture(c, 1), normalMap: toTexture(normalFromHeight(c, 1.1), 1, false) };
}

/* ======================= ФАСАДЫ ======================= */
/**
 * Фасад с окнами. Возвращает {map, emissiveMap, normalMap, roughnessMap}.
 * emissiveMap — светящиеся окна ночью.
 */
function facade(opts) {
  const {
    cols = 4, rows = 4, S = 512,
    wall = '#8d8678', wall2 = '#7b7568',
    glass = '#2b3a46',
    style = 'office'        // office | brick | panel | shop
  } = opts;

  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const em = makeCanvas(S);
  const ectx = em.getContext('2d');
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);

  // стена
  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, wall);
  grad.addColorStop(1, wall2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  if (style === 'brick') {
    const bh = S / 36, bw = S / 14;
    for (let y = 0; y < 36; y++) {
      for (let x = -1; x < 15; x++) {
        const ox = (y % 2) * bw * 0.5;
        const v = 120 + Math.random() * 45;
        ctx.fillStyle = `rgb(${v},${v * 0.52},${v * 0.42})`;
        ctx.fillRect(x * bw + ox + 1, y * bh + 1, bw - 2, bh - 2);
      }
    }
  } else if (style === 'panel') {
    const ph = S / 8;
    for (let y = 0; y < 8; y++) {
      const v = 150 + Math.random() * 30;
      ctx.fillStyle = `rgb(${v},${v},${v - 8})`;
      ctx.fillRect(0, y * ph, S, ph - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(0, y * ph + ph - 3, S, 3);
    }
  } else if (style === 'office') {
    // вертикальные пилястры
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i < cols; i++) ctx.fillRect((i / cols) * S, 0, 3, S);
  }

  // окна
  const cw = S / cols, ch = S / rows;
  const padX = cw * (style === 'office' ? 0.1 : 0.22);
  const padY = ch * (style === 'office' ? 0.14 : 0.2);

  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cw + padX;
      const y = r * ch + padY;
      const w = cw - padX * 2;
      const h = ch - padY * 2;

      // рама (утопленная)
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
      ctx.fillStyle = '#d8d8d4';
      ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

      // стекло с отражением неба
      const gg = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
      gg.addColorStop(0, '#6f90a8');
      gg.addColorStop(0.35, glass);
      gg.addColorStop(1, '#1b2630');
      ctx.fillStyle = gg;
      ctx.fillRect(x, y, w, h);

      // блик
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x + w * 0.55, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w * 0.45, y + h);
      ctx.closePath();
      ctx.fill();

      // переплёт
      ctx.strokeStyle = 'rgba(220,220,215,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
      ctx.stroke();

      // подоконник
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(x - 4, y + h + 3, w + 8, 3);

      // ночное свечение — часть окон горит
      if (Math.random() < 0.42) {
        const warm = ['#ffd28a', '#ffc46b', '#f2e7c8', '#9fd2ff'][(Math.random() * 4) | 0];
        ectx.fillStyle = warm;
        ectx.globalAlpha = 0.55 + Math.random() * 0.45;
        ectx.fillRect(x, y, w, h);
        ectx.globalAlpha = 1;
      }
    }
  }

  // подтёки и грязь
  splotches(ctx, S, 16, ['60,58,52', '110,108,100'], 15, 60, 0.12);
  ctx.globalAlpha = 0.1;
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = '#2a2a26';
    const x = Math.random() * S;
    ctx.fillRect(x, Math.random() * S * 0.5, 1 + Math.random() * 3, 40 + Math.random() * 120);
  }
  ctx.globalAlpha = 1;
  noise(ctx, S, 10);

  return {
    map: toTexture(c, 1),
    emissiveMap: toTexture(em, 1),
    normalMap: toTexture(normalFromHeight(c, 1.6), 1, false)
  };
}

/* ======================= КРЫША ======================= */
function roof() {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a4a48';
  ctx.fillRect(0, 0, S, S);
  // рубероид полосами
  for (let y = 0; y < S; y += 16) {
    ctx.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.1})`;
    ctx.fillRect(0, y, S, 14);
  }
  splotches(ctx, S, 30, ['90,90,85', '35,35,33', '120,110,90'], 10, 50, 0.25);
  noise(ctx, S, 22);
  return { map: toTexture(c, 1), normalMap: toTexture(normalFromHeight(c, 1.2), 1, false) };
}

/* ======================= ВИТРИНА МАГАЗИНА ======================= */
function storefront(hue) {
  const S = 512;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  // нижняя треть — стекло витрины, верх — вывеска
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, S, S);

  // вывеска
  ctx.fillStyle = `hsl(${hue},55%,42%)`;
  ctx.fillRect(0, 0, S, S * 0.22);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(0, S * 0.19, S, 4);

  // стекло
  const gg = ctx.createLinearGradient(0, S * 0.22, S * 0.3, S);
  gg.addColorStop(0, '#5d7f96');
  gg.addColorStop(0.4, '#2a3b48');
  gg.addColorStop(1, '#141c24');
  ctx.fillStyle = gg;
  ctx.fillRect(0, S * 0.22, S, S * 0.78);

  // стойки витрины
  ctx.fillStyle = '#c9ccd0';
  for (let i = 0; i <= 4; i++) ctx.fillRect((i / 4) * S - 4, S * 0.22, 8, S * 0.78);
  ctx.fillRect(0, S * 0.22, S, 8);
  ctx.fillRect(0, S - 20, S, 20);

  // силуэты товара внутри
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = `rgba(${150 + Math.random() * 90},${140 + Math.random() * 90},${130 + Math.random() * 90},0.45)`;
    const w = 18 + Math.random() * 34;
    ctx.fillRect(Math.random() * (S - w), S * 0.45 + Math.random() * S * 0.4, w, 22 + Math.random() * 60);
  }
  // блик
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.beginPath();
  ctx.moveTo(0, S); ctx.lineTo(S * 0.5, S * 0.22); ctx.lineTo(S * 0.75, S * 0.22); ctx.lineTo(S * 0.25, S);
  ctx.closePath(); ctx.fill();

  const em = makeCanvas(S);
  const ectx = em.getContext('2d');
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);
  ectx.fillStyle = `hsl(${hue},80%,60%)`;
  ectx.fillRect(0, 0, S, S * 0.22);
  ectx.fillStyle = 'rgba(255,240,200,0.55)';
  ectx.fillRect(0, S * 0.24, S, S * 0.74);

  return {
    map: toTexture(c, 1),
    emissiveMap: toTexture(em, 1),
    normalMap: toTexture(normalFromHeight(c, 1.2), 1, false)
  };
}

/* ======================= МЕТАЛЛ / БЕТОН ======================= */
function concrete() {
  const S = 256;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#a3a39e';
  ctx.fillRect(0, 0, S, S);
  splotches(ctx, S, 40, ['130,130,125', '160,160,155', '90,90,88'], 12, 60, 0.2);
  noise(ctx, S, 20);
  return { map: toTexture(c, 1), normalMap: toTexture(normalFromHeight(c, 1.0), 1, false) };
}

/* ======================= API ======================= */
const builders = { asphalt, sidewalk, grass, roof, concrete };

export function getTex(name) {
  if (!cache.has(name)) cache.set(name, builders[name]());
  return cache.get(name);
}

export function getFacade(key, opts) {
  const k = 'facade:' + key;
  if (!cache.has(k)) cache.set(k, facade(opts));
  return cache.get(k);
}

export function getStorefront(hue) {
  const k = 'shop:' + hue;
  if (!cache.has(k)) cache.set(k, storefront(hue));
  return cache.get(k);
}

/** Плоская текстура-заливка, чтобы не плодить материалы. */
export function flatColor(hex) {
  const k = 'flat:' + hex;
  if (!cache.has(k)) {
    const c = makeCanvas(4);
    const ctx = c.getContext('2d');
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 4, 4);
    cache.set(k, toTexture(c, 1));
  }
  return cache.get(k);
}

export function disposeAll() {
  cache.forEach(v => {
    if (v instanceof THREE.Texture) v.dispose();
    else Object.values(v).forEach(t => t && t.dispose && t.dispose());
  });
  cache.clear();
}

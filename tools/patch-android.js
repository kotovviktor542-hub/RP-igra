// Патчит сгенерированный Capacitor-проект android/:
//  - иконки Horizons RP (обычные + adaptive + round) и splash
//  - горизонтальная ориентация, фуллскрин, запрет пересоздания активити при повороте
// Запускать ПОСЛЕ `npx cap add android` и ДО сборки gradle.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const res = path.join(root, 'android/app/src/main/res');
const manifest = path.join(root, 'android/app/src/main/AndroidManifest.xml');
const src = path.join(root, 'resources/android');

if (!fs.existsSync(manifest)) {
  console.error('Нет android/ — сначала `npx cap add android`');
  process.exit(1);
}

// ── 1. Иконки и splash ────────────────────────────────────────────────
let copied = 0;
for (const dir of fs.readdirSync(src)) {
  const from = path.join(src, dir);
  const to = path.join(res, dir);
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from)) {
    fs.copyFileSync(path.join(from, f), path.join(to, f));
    copied++;
  }
}
// убираем дефолтные векторные иконки Capacitor, иначе они перекроют png
for (const f of ['mipmap-anydpi-v26/ic_launcher.xml', 'mipmap-anydpi-v26/ic_launcher_round.xml']) {
  const p = path.join(res, f);
  if (fs.existsSync(p)) fs.rmSync(p);
}
fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
const adaptive = (name) => `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26/ic_launcher.xml'), adaptive());
fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26/ic_launcher_round.xml'), adaptive());

// цвет подложки адаптивной иконки — Capacitor уже создаёт values/ic_launcher_background.xml,
// просто перекрашиваем его (дубликат ресурса ломает сборку).
const bgPath = path.join(res, 'values/ic_launcher_background.xml');
const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0A0A0A</color>
</resources>
`;
fs.mkdirSync(path.join(res, 'values'), { recursive: true });
fs.writeFileSync(bgPath, bgXml);
const colorsPath = path.join(res, 'values/colors.xml');
if (fs.existsSync(colorsPath)) {
  const colors = fs.readFileSync(colorsPath, 'utf8');
  if (colors.includes('ic_launcher_background')) {
    fs.writeFileSync(colorsPath,
      colors.replace(/\s*<color name="ic_launcher_background">[^<]*<\/color>/g, ''));
  }
}

// ── 2. Манифест: ландшафт + фуллскрин ─────────────────────────────────
let mf = fs.readFileSync(manifest, 'utf8');
mf = mf.replace(/android:screenOrientation="[^"]*"\s*/g, '');
mf = mf.replace(
  /(<activity\b)/,
  '$1\n            android:screenOrientation="sensorLandscape"'
);
if (/android:configChanges="[^"]*"/.test(mf)) {
  mf = mf.replace(/android:configChanges="[^"]*"/,
    'android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation"');
}
fs.writeFileSync(manifest, mf);

// ── 3. Тема: без тайтлбара, фуллскрин ─────────────────────────────────
const stylesPath = path.join(res, 'values/styles.xml');
if (fs.existsSync(stylesPath)) {
  let st = fs.readFileSync(stylesPath, 'utf8');
  if (!st.includes('windowFullscreen')) {
    st = st.replace(/(<style name="AppTheme.NoActionBar"[^>]*>)/,
      '$1\n        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>');
    fs.writeFileSync(stylesPath, st);
  }
}

console.log(`patch-android: скопировано ${copied} ресурсов, ориентация sensorLandscape, фуллскрин включён`);

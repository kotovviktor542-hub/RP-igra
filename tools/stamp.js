// Проставляет номер сборки в www/ перед упаковкой APK и публикацией на Pages.
// Запуск: BUILD_NUMBER=12 node tools/stamp.js
import fs from 'node:fs';

const build = parseInt(process.env.BUILD_NUMBER || '0', 10) || 0;
const date = new Date().toISOString().slice(0, 16).replace('T', ' ');

fs.writeFileSync('www/version.json',
  JSON.stringify({ build, name: 'Horizons RP', date }, null, 2) + '\n');

// лаунчер (index.html) — знает номер своей сборки
let idx = fs.readFileSync('www/index.html', 'utf8');
idx = idx.replace(/var LOCAL_BUILD = \d+;/, `var LOCAL_BUILD = ${build};`);
fs.writeFileSync('www/index.html', idx);

// сама игра — чтобы кнопка «Проверить обновление» знала свою сборку
let game = fs.readFileSync('www/game.html', 'utf8');
game = game.replace(/<script>window\.__HZ_BUILD__[^<]*<\/script>\n?/, '');
game = game.replace('</head>', `  <script>window.__HZ_BUILD__ = ${build};</script>\n</head>`);
fs.writeFileSync('www/game.html', game);

console.log(`stamp: сборка ${build} (${date})`);

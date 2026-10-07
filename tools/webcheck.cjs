const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://kotovviktor542-hub.github.io/RP-igra/', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await new Promise(r => setTimeout(r, 25000));
  const st = await p.evaluate(() => ({
    url: location.pathname,
    game: !!window.__game,
    pois: window.__game ? window.__game.city.pois.length : 0,
    menu: document.getElementById('menu') && !document.getElementById('menu').classList.contains('hidden'),
    build: window.__HZ_BUILD__
  }));
  console.log(JSON.stringify(st), 'errors:', errs.slice(0,3));
  await b.close();
})();

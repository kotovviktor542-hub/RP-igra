/* tools/check.js — прогон игровой логики без браузера (node tools/check.js) */
'use strict';

const path = require('path');
const fs = require('fs');

const WWW = path.join(__dirname, '..', 'www');

const State = require(path.join(WWW, 'js/state.js'));
const Data = require(path.join(WWW, 'js/data.js'));
const Engine = require(path.join(WWW, 'js/engine.js'));

let passed = 0;
let failed = 0;

function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

function group(name, fn) { console.log('\n' + name); fn(); }

/* детерминированный ГПСЧ */
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

group('Файлы на месте', () => {
  ['index.html', 'css/style.css', 'js/state.js', 'js/data.js', 'js/engine.js', 'js/ui.js', 'js/main.js']
    .forEach(f => ok(f, fs.existsSync(path.join(WWW, f))));
  ok('capacitor.config.json', fs.existsSync(path.join(__dirname, '..', 'capacitor.config.json')));

  const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
  ['js/state.js', 'js/data.js', 'js/engine.js', 'js/ui.js', 'js/main.js']
    .forEach(src => ok('index.html подключает ' + src, html.includes(src)));
});

group('Создание персонажа', () => {
  const s = State.createState({ name: 'Тест', gender: 'm', origin: 'poor' });
  ok('имя', s.name === 'Тест');
  ok('день = 1', s.day === 1);
  ok('возраст = 18', s.age === 18);
  ok('деньги бедняка = 500', s.money === 500, 'got ' + s.money);
  ok('жив', s.alive === true);
  ok('нет работы', s.job === null);
  const r = State.createState({ origin: 'rich' });
  ok('богатый старт', r.money === 50000);
  const bad = State.createState({ origin: 'xxx' });
  ok('неизвестный origin -> mid', bad.origin === 'mid');
  ok('длинное имя обрезается', State.createState({ name: 'x'.repeat(50) }).name.length === 20);
});

group('Целостность контента', () => {
  const ids = new Set();
  let dup = false;
  Data.ACTIONS.forEach(a => { if (ids.has(a.id)) dup = true; ids.add(a.id); });
  ok('id действий уникальны', !dup);
  ok('у всех действий есть title', Data.ACTIONS.every(a => !!a.title));
  ok('у всех действий есть group', Data.ACTIONS.every(a => !!a.group));

  const statIds = Data.STATS.map(s => s.id);
  const s = State.createState({});
  ok('все STATS есть в state.stats', statIds.every(id => s.stats[id] !== undefined));
  const skillIds = Data.SKILLS.map(s2 => s2.id);
  ok('все SKILLS есть в state.skills', skillIds.every(id => s.skills[id] !== undefined));

  ok('эффекты действий ссылаются на реальные стат-ы',
    Data.ACTIONS.every(a => Object.keys(a.effect || {}).every(k => statIds.includes(k))));
  ok('навыки действий существуют',
    Data.ACTIONS.every(a => !a.skill || skillIds.includes(a.skill.id)));
  ok('навыки работ существуют',
    Data.JOBS.every(j => skillIds.includes(j.skill)));
  ok('требования работ ссылаются на реальные навыки',
    Data.JOBS.every(j => Object.keys(j.req || {}).every(k => skillIds.includes(k))));
  ok('у всех событий есть apply', Data.EVENTS.every(e => typeof e.apply === 'function'));
});

group('Действия', () => {
  const s = State.createState({ origin: 'mid' });

  const moneyBefore = s.money;
  const r1 = Engine.doAction(s, 'gym', makeRng(1));
  ok('тренировка проходит', r1.ok, r1.reason);
  ok('списались деньги', s.money === moneyBefore - 200, 'got ' + s.money);
  ok('физуха выросла', s.skills.fitness === 2.5, 'got ' + s.skills.fitness);
  ok('энергия упала', s.stats.energy < 75);

  const r2 = Engine.doAction(s, 'work', makeRng(1));
  ok('без работы смену не отработать', !r2.ok && r2.reason === 'Нет работы', r2.reason);

  const r3 = Engine.takeJob(s, 'courier');
  ok('курьером берут всех', r3.ok, r3.reason);
  ok('работа записалась', s.job === 'courier');

  const r4 = Engine.takeJob(s, 'junior_dev');
  ok('в разрабы без интеллекта не берут', !r4.ok);

  const before = s.money;
  const r5 = Engine.doAction(s, 'work', makeRng(2));
  ok('смена отработана', r5.ok, r5.reason);
  ok('деньги пришли', s.money > before);
  ok('jobDays++', s.jobDays === 1);

  const r6 = Engine.doAction(s, 'quit_job', makeRng(2));
  ok('увольнение работает', r6.ok && s.job === null);

  const poor = State.createState({ origin: 'poor' });
  poor.money = 0;
  const r7 = Engine.doAction(poor, 'doctor', makeRng(3));
  ok('без денег к врачу не пускает', !r7.ok, r7.reason);
});

group('Границы значений', () => {
  const s = State.createState({ origin: 'mid' });
  s.stats.energy = 100; s.stats.mood = 100; s.stats.health = 100; s.stats.hunger = 100;
  Engine.doAction(s, 'eat_good', makeRng(5));
  ok('сытость не выше 100', s.stats.hunger <= 100, 'got ' + s.stats.hunger);
  ok('здоровье не выше 100', s.stats.health <= 100);

  s.money = 100;
  s.money -= 100000;
  Engine.normalize(s);
  ok('деньги не уходят в минус', s.money >= 0);

  const t = State.createState({});
  t.stats.health = -50;
  Engine.normalize(t);
  ok('здоровье не ниже 0', t.stats.health === 0);
});

group('Смена дня и события', () => {
  const s = State.createState({ origin: 'mid' });
  const r = Engine.doAction(s, 'sleep', makeRng(7));
  ok('сон завершает день', r.ok && r.dayEnded);
  ok('день = 2', s.day === 2, 'got ' + s.day);
  ok('энергия восстановилась', s.stats.energy > 70, 'got ' + s.stats.energy);

  // 30 дней -> +1 год
  const a = State.createState({});
  for (let i = 0; i < 30; i++) Engine.endDay(a, makeRng(i + 1));
  ok('через 30 дней возраст 19', a.age === 19, 'got ' + a.age + ' day=' + a.day);
});

group('Смерть и конец игры', () => {
  const s = State.createState({});
  s.stats.health = 5;
  s.stats.hunger = 0;
  Engine.endDay(s, makeRng(11));
  ok('нулевое здоровье = конец', s.alive === false, 'health=' + s.stats.health);
  const r = Engine.doAction(s, 'rest', makeRng(11));
  ok('после смерти действия заблокированы', !r.ok);
});

group('Долгая симуляция (500 дней, 3 сида)', () => {
  [1, 42, 1337].forEach(seed => {
    const rng = makeRng(seed);
    const s = State.createState({ origin: 'poor', name: 'Бот' });
    let crashed = null;
    try {
      for (let day = 0; day < 500 && s.alive; day++) {
        // простая стратегия бота
        if (!s.job) Engine.takeJob(s, 'courier');
        if (s.stats.hunger < 45) Engine.doAction(s, s.money > 600 ? 'eat_good' : 'eat_cheap', rng);
        if (s.stats.health < 35 && s.money > 2500) Engine.doAction(s, 'doctor', rng);
        if (s.stats.energy > 40) Engine.doAction(s, 'work', rng);
        if (s.stats.energy > 25) Engine.doAction(s, 'study', rng);
        if (Engine.skillLevel(s, 'intellect') >= 20 && s.job !== 'junior_dev') Engine.takeJob(s, 'junior_dev');
        Engine.doAction(s, 'sleep', rng);

        // инварианты
        for (const k of Object.keys(s.stats)) {
          const v = s.stats[k];
          if (!Number.isFinite(v) || v < 0 || v > 100) throw new Error(`stat ${k}=${v} вне [0,100] на дне ${s.day}`);
        }
        if (!Number.isFinite(s.money) || s.money < 0) throw new Error('money=' + s.money);
        if (s.log.length > 120) throw new Error('log раздулся: ' + s.log.length);
      }
    } catch (e) { crashed = e.message; }
    ok('сид ' + seed + ' отработал без ошибок (дней: ' + s.day + ', ₽' + s.money + ', жив: ' + s.alive + ')',
      crashed === null, crashed);
  });
});

group('Счёт', () => {
  const s = State.createState({ origin: 'rich' });
  ok('счёт считается', Number.isFinite(Engine.score(s)) && Engine.score(s) > 0);
});

console.log('\n────────────────────────────');
console.log(`Пройдено: ${passed}   Провалено: ${failed}`);
process.exit(failed === 0 ? 0 : 1);

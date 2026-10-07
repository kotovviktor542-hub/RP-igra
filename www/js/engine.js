/* engine.js — вся игровая логика, без DOM. Тестируется из node. */
(function (root) {
  'use strict';

  var State = root.RPState || (typeof require !== 'undefined' ? require('./state.js') : null);
  var Data  = root.RPData  || (typeof require !== 'undefined' ? require('./data.js')  : null);

  var clamp = State.clamp;

  /* ---------- вспомогательное ---------- */

  function getAction(id) {
    for (var i = 0; i < Data.ACTIONS.length; i++) {
      if (Data.ACTIONS[i].id === id) return Data.ACTIONS[i];
    }
    return null;
  }

  function getJob(id) {
    for (var i = 0; i < Data.JOBS.length; i++) {
      if (Data.JOBS[i].id === id) return Data.JOBS[i];
    }
    return null;
  }

  function skillLevel(state, id) {
    return Math.floor(state.skills[id] || 0);
  }

  function jobAvailable(state, job) {
    var req = job.req || {};
    for (var k in req) {
      if (Object.prototype.hasOwnProperty.call(req, k)) {
        if (skillLevel(state, k) < req[k]) return false;
      }
    }
    return true;
  }

  /** Можно ли выполнить действие. Возвращает {ok, reason}. */
  function canDo(state, actionId) {
    var a = getAction(actionId);
    if (!a) return { ok: false, reason: 'Неизвестное действие' };
    if (!state.alive) return { ok: false, reason: 'Игра окончена' };
    if (a.needsJob && !state.job) return { ok: false, reason: 'Нет работы' };

    var cost = a.cost || {};
    if (cost.money && state.money < cost.money) {
      return { ok: false, reason: 'Не хватает денег (' + cost.money + ' ₽)' };
    }
    if (cost.energy && state.stats.energy < cost.energy) {
      return { ok: false, reason: 'Мало энергии (нужно ' + cost.energy + ')' };
    }
    return { ok: true };
  }

  function pushLog(state, text, tone) {
    state.log.unshift({ day: state.day, text: text, tone: tone || 'info' });
    if (state.log.length > 120) state.log.length = 120;
  }

  /* ---------- применение эффектов ---------- */

  function applyCost(state, cost) {
    if (!cost) return;
    if (cost.money)  state.money -= cost.money;
    if (cost.energy) state.stats.energy -= cost.energy;
    if (cost.hunger) state.stats.hunger -= cost.hunger;
    if (cost.health) state.stats.health -= cost.health;
    if (cost.mood)   state.stats.mood   -= cost.mood;
  }

  function applyEffect(state, eff) {
    if (!eff) return;
    for (var k in eff) {
      if (Object.prototype.hasOwnProperty.call(eff, k) && state.stats[k] !== undefined) {
        state.stats[k] += eff[k];
      }
    }
  }

  function normalize(state) {
    for (var k in state.stats) {
      if (Object.prototype.hasOwnProperty.call(state.stats, k)) {
        state.stats[k] = clamp(Math.round(state.stats[k]), 0, 100);
      }
    }
    if (state.money < 0) state.money = 0;
    for (var s in state.skills) {
      if (Object.prototype.hasOwnProperty.call(state.skills, s)) {
        state.skills[s] = clamp(Math.round(state.skills[s] * 10) / 10, 0, 100);
      }
    }
  }

  /* ---------- действия ---------- */

  /**
   * Выполнить действие.
   * @returns {{ok:boolean, reason?:string, messages:string[], dayEnded:boolean, event?:object}}
   */
  function doAction(state, actionId, rng) {
    rng = rng || Math.random;
    var check = canDo(state, actionId);
    if (!check.ok) return { ok: false, reason: check.reason, messages: [], dayEnded: false };

    var a = getAction(actionId);
    var messages = [];
    var dayEnded = false;

    if (actionId === 'work') {
      var job = getJob(state.job);
      if (!job) return { ok: false, reason: 'Работа не найдена', messages: [], dayEnded: false };
      if (state.stats.energy < job.energy) {
        return { ok: false, reason: 'Слишком устал для смены (нужно ' + job.energy + ' энергии)', messages: [], dayEnded: false };
      }
      var pay = Math.round(job.pay * (1 + skillLevel(state, job.skill) * 0.015));
      state.money += pay;
      state.stats.energy -= job.energy;
      state.stats.hunger -= 18;
      state.stats.mood += job.moodDelta;
      state.stats.health += job.healthDelta;
      state.skills[job.skill] += job.skillGain;
      state.jobDays += 1;
      messages.push('Смена отработана: +' + pay + ' ₽');
      pushLog(state, job.name + ': смена, +' + pay + ' ₽', 'good');

    } else if (actionId === 'quit_job') {
      var old = getJob(state.job);
      state.job = null;
      state.jobDays = 0;
      state.stats.mood += 8;
      messages.push('Уволился' + (old ? ' с позиции «' + old.name + '»' : '') + '.');
      pushLog(state, 'Уволился' + (old ? ' (' + old.name + ')' : ''), 'info');

    } else if (actionId === 'find_job') {
      applyCost(state, a.cost);
      messages.push('Список вакансий открыт.');

    } else {
      applyCost(state, a.cost);
      applyEffect(state, a.effect);
      if (a.skill) {
        state.skills[a.skill.id] += a.skill.gain;
        messages.push(a.title + ': ' + skillName(a.skill.id) + ' +' + a.skill.gain);
      } else {
        messages.push(a.title + ' — готово.');
      }
      if (a.id !== 'rest' && a.id !== 'eat_cheap' && a.id !== 'eat_good') {
        pushLog(state, a.title, 'info');
      }
      if (a.endsDay) dayEnded = true;
    }

    normalize(state);

    var result = { ok: true, messages: messages, dayEnded: false };

    if (dayEnded) {
      var nd = endDay(state, rng);
      result.dayEnded = true;
      result.event = nd.event;
      result.messages = result.messages.concat(nd.messages);
    }

    checkDeath(state);
    return result;
  }

  function skillName(id) {
    for (var i = 0; i < Data.SKILLS.length; i++) {
      if (Data.SKILLS[i].id === id) return Data.SKILLS[i].name;
    }
    return id;
  }

  /** Устроиться на работу. */
  function takeJob(state, jobId) {
    var job = getJob(jobId);
    if (!job) return { ok: false, reason: 'Нет такой вакансии' };
    if (!jobAvailable(state, job)) return { ok: false, reason: 'Не хватает навыков' };
    state.job = job.id;
    state.jobDays = 0;
    state.stats.mood += 5;
    normalize(state);
    pushLog(state, 'Устроился: ' + job.name, 'good');
    return { ok: true, reason: '', job: job };
  }

  /* ---------- конец дня ---------- */

  function pickEvent(state, rng) {
    var pool = [];
    for (var i = 0; i < Data.EVENTS.length; i++) {
      var e = Data.EVENTS[i];
      if (e.cond && !e.cond(state)) continue;
      for (var w = 0; w < (e.weight || 1); w++) pool.push(e);
    }
    if (!pool.length) return null;
    return pool[Math.floor(rng() * pool.length)];
  }

  function endDay(state, rng) {
    rng = rng || Math.random;
    var messages = [];

    state.day += 1;
    if ((state.day - 1) % 30 === 0) {
      state.age += 1;
      messages.push('Тебе исполнилось ' + state.age + '.');
      pushLog(state, 'День рождения: ' + state.age + ' лет', 'info');
    }

    // ночь восстанавливает
    state.stats.energy += 55;
    state.stats.hunger -= 25;

    // голод бьёт по здоровью и настроению
    if (state.stats.hunger <= 0) {
      state.stats.health -= 10;
      state.stats.mood -= 8;
      messages.push('Лёг спать голодным: здоровье −10.');
      pushLog(state, 'Голодал весь день', 'bad');
    } else if (state.stats.hunger < 20) {
      state.stats.mood -= 4;
    }

    if (state.stats.health < 30) {
      state.stats.energy -= 15;
      messages.push('Здоровье на дне — сил почти нет.');
    }

    // случайное событие ~45% шанс
    var event = null;
    if (rng() < 0.45) {
      var e = pickEvent(state, rng);
      if (e) {
        var msg = e.apply(state);
        event = { id: e.id, title: e.title, text: e.text, result: msg, tone: e.tone };
        pushLog(state, e.title + ': ' + msg, e.tone);
      }
    }

    normalize(state);
    checkDeath(state);
    return { messages: messages, event: event };
  }

  function checkDeath(state) {
    if (state.stats.health <= 0 && state.alive) {
      state.alive = false;
      pushLog(state, 'Здоровье кончилось. Игра окончена.', 'bad');
    }
    return !state.alive;
  }

  /* ---------- оценка ---------- */

  function score(state) {
    var sk = 0;
    for (var k in state.skills) {
      if (Object.prototype.hasOwnProperty.call(state.skills, k)) sk += state.skills[k];
    }
    return Math.round(state.money / 100 + sk * 10 + state.day * 2);
  }

  var api = {
    getAction: getAction,
    getJob: getJob,
    skillLevel: skillLevel,
    skillName: skillName,
    jobAvailable: jobAvailable,
    canDo: canDo,
    doAction: doAction,
    takeJob: takeJob,
    endDay: endDay,
    checkDeath: checkDeath,
    normalize: normalize,
    pushLog: pushLog,
    score: score
  };

  root.RPEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

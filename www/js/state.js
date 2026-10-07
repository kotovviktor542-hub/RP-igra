/* state.js — структура сохранения и базовое состояние персонажа */
(function (root) {
  'use strict';

  var SAVE_KEY = 'rp-igra:save:v1';
  var SAVE_VERSION = 1;

  var ORIGINS = {
    poor: { label: 'Из бедной семьи', money: 500,   mood: 45, health: 70, energy: 80 },
    mid:  { label: 'Средний класс',   money: 5000,  mood: 60, health: 75, energy: 75 },
    rich: { label: 'Обеспеченная семья', money: 50000, mood: 70, health: 70, energy: 60 }
  };

  function createState(opts) {
    opts = opts || {};
    var origin = ORIGINS[opts.origin] ? opts.origin : 'mid';
    var base = ORIGINS[origin];
    return {
      version: SAVE_VERSION,
      name: (opts.name || 'Безымянный').slice(0, 20),
      gender: opts.gender === 'f' ? 'f' : 'm',
      origin: origin,
      day: 1,
      age: 18,
      money: base.money,
      stats: {
        health: base.health,
        energy: base.energy,
        mood: base.mood,
        hunger: 70
      },
      skills: {
        fitness: 0,
        intellect: 0,
        charisma: 0,
        craft: 0
      },
      job: null,
      jobDays: 0,
      log: [],
      flags: {},
      alive: true
    };
  }

  function clamp(v, lo, hi) {
    if (v < lo) return lo;
    if (v > hi) return hi;
    return v;
  }

  function save(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      return false;
    }
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.version !== SAVE_VERSION) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function wipe() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no-op */ }
  }

  var api = {
    SAVE_KEY: SAVE_KEY,
    SAVE_VERSION: SAVE_VERSION,
    ORIGINS: ORIGINS,
    createState: createState,
    clamp: clamp,
    save: save,
    load: load,
    wipe: wipe
  };

  root.RPState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

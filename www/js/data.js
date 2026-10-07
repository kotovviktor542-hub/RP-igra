/* data.js — контент: характеристики, навыки, действия, работы, случайные события */
(function (root) {
  'use strict';

  var STATS = [
    { id: 'health', name: 'Здоровье', color: '#ff5d5d' },
    { id: 'energy', name: 'Энергия',  color: '#4f8cff' },
    { id: 'mood',   name: 'Настроение', color: '#ffb020' },
    { id: 'hunger', name: 'Сытость',  color: '#3ddc84' }
  ];

  var SKILLS = [
    { id: 'fitness',   name: 'Физуха',    desc: 'Выносливость и сила' },
    { id: 'intellect', name: 'Интеллект', desc: 'Знания и логика' },
    { id: 'charisma',  name: 'Харизма',   desc: 'Умение говорить с людьми' },
    { id: 'craft',     name: 'Ремесло',   desc: 'Руки растут откуда надо' }
  ];

  var JOBS = [
    {
      id: 'courier', name: 'Курьер', pay: 1800,
      req: {}, energy: 30, moodDelta: -4, healthDelta: -1,
      skill: 'fitness', skillGain: 1.2,
      desc: 'Беготня по городу. Платят мало, зато берут всех.'
    },
    {
      id: 'barista', name: 'Бариста', pay: 2400,
      req: { charisma: 5 }, energy: 26, moodDelta: -2, healthDelta: 0,
      skill: 'charisma', skillGain: 1.3,
      desc: 'Кофе, болтовня, запах корицы. Нужна харизма 5.'
    },
    {
      id: 'master', name: 'Мастер по ремонту', pay: 4200,
      req: { craft: 12 }, energy: 32, moodDelta: -3, healthDelta: -1,
      skill: 'craft', skillGain: 1.1,
      desc: 'Чинишь чужое за деньги. Нужно ремесло 12.'
    },
    {
      id: 'junior_dev', name: 'Junior-разработчик', pay: 7000,
      req: { intellect: 20 }, energy: 28, moodDelta: -2, healthDelta: -1,
      skill: 'intellect', skillGain: 1.0,
      desc: 'Сидишь, пишешь код, делаешь вид что понимаешь. Нужен интеллект 20.'
    }
  ];

  /*
    Действие:
      cost   — что тратится (money, energy, hunger...)
      effect — что меняется у stats
      skill  — какой навык качает и на сколько
      time   — сколько «часов» занимает (1 день = 24 условных часа, но пока просто флаг endDay)
  */
  var ACTIONS = [
    {
      id: 'work', group: 'Работа', title: 'Выйти на смену',
      desc: 'Отработать день на текущей работе.',
      needsJob: true
    },
    {
      id: 'find_job', group: 'Работа', title: 'Искать работу',
      desc: 'Посмотреть, куда вообще берут.',
      cost: { energy: 10 }
    },
    {
      id: 'quit_job', group: 'Работа', title: 'Уволиться',
      desc: 'Хлопнуть дверью. Настроение +, деньги −.',
      needsJob: true,
      effect: { mood: 8 }
    },

    {
      id: 'gym', group: 'Развитие', title: 'Тренировка',
      desc: 'Спортзал или турники во дворе.',
      cost: { energy: 25, hunger: 15, money: 200 },
      effect: { health: 4, mood: 3 },
      skill: { id: 'fitness', gain: 2.5 }
    },
    {
      id: 'study', group: 'Развитие', title: 'Учиться',
      desc: 'Книги, курсы, документация.',
      cost: { energy: 22, hunger: 8 },
      effect: { mood: -3 },
      skill: { id: 'intellect', gain: 2.2 }
    },
    {
      id: 'socialize', group: 'Развитие', title: 'Общаться с людьми',
      desc: 'Выйти в люди и потрепаться.',
      cost: { energy: 15, money: 400 },
      effect: { mood: 6 },
      skill: { id: 'charisma', gain: 2.0 }
    },
    {
      id: 'tinker', group: 'Развитие', title: 'Мастерить',
      desc: 'Паять, пилить, собирать.',
      cost: { energy: 20, money: 150 },
      effect: { mood: 2 },
      skill: { id: 'craft', gain: 2.3 }
    },

    {
      id: 'eat_cheap', group: 'Быт', title: 'Поесть дёшево',
      desc: 'Доширак и сосиска. Быстро и грустно.',
      cost: { money: 150 },
      effect: { hunger: 30, mood: -1, health: -1 }
    },
    {
      id: 'eat_good', group: 'Быт', title: 'Поесть нормально',
      desc: 'Полноценный обед.',
      cost: { money: 600 },
      effect: { hunger: 50, mood: 4, health: 2 }
    },
    {
      id: 'rest', group: 'Быт', title: 'Отдохнуть',
      desc: 'Полежать, посмотреть в потолок.',
      cost: { hunger: 5 },
      effect: { energy: 20, mood: 5 }
    },
    {
      id: 'doctor', group: 'Быт', title: 'Сходить к врачу',
      desc: 'Подлатать здоровье за деньги.',
      cost: { money: 2500, energy: 10 },
      effect: { health: 25, mood: -2 }
    },
    {
      id: 'sleep', group: 'Быт', title: 'Лечь спать (конец дня)',
      desc: 'Закончить день и проснуться завтра.',
      endsDay: true
    }
  ];

  var EVENTS = [
    {
      id: 'wallet', weight: 3, title: 'Находка',
      text: 'На тротуаре валяется купюра. Никого вокруг.',
      apply: function (s) { s.money += 1000; return 'Нашёл 1000 ₽ на улице.'; },
      tone: 'good'
    },
    {
      id: 'cold', weight: 4, title: 'Простуда',
      text: 'Продуло на остановке.',
      apply: function (s) { s.stats.health -= 12; s.stats.energy -= 10; return 'Заболел: здоровье −12, энергия −10.'; },
      tone: 'bad',
      cond: function (s) { return s.stats.health < 85; }
    },
    {
      id: 'bonus', weight: 3, title: 'Премия',
      text: 'Начальник внезапно подобрел.',
      apply: function (s) { var b = 1500; s.money += b; return 'Премия +' + b + ' ₽.'; },
      tone: 'good',
      cond: function (s) { return !!s.job; }
    },
    {
      id: 'phone', weight: 2, title: 'Сломался телефон',
      text: 'Экран встретился с асфальтом.',
      apply: function (s) { var c = Math.min(s.money, 3000); s.money -= c; s.stats.mood -= 8; return 'Ремонт: −' + c + ' ₽, настроение −8.'; },
      tone: 'bad'
    },
    {
      id: 'friend', weight: 3, title: 'Старый друг',
      text: 'Написал человек, которого не видел сто лет.',
      apply: function (s) { s.stats.mood += 10; s.skills.charisma += 1; return 'Настроение +10, харизма +1.'; },
      tone: 'good'
    },
    {
      id: 'insight', weight: 2, title: 'Озарение',
      text: 'Ночью в голову пришла нормальная мысль.',
      apply: function (s) { s.skills.intellect += 2; s.stats.energy -= 5; return 'Интеллект +2, энергия −5.'; },
      tone: 'good'
    }
  ];

  var api = { STATS: STATS, SKILLS: SKILLS, JOBS: JOBS, ACTIONS: ACTIONS, EVENTS: EVENTS };

  root.RPData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

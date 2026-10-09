/* factions.js — организации: государственные структуры и ОПГ.

   Чистая логика без three.js: ранги, приём и увольнение, повышения,
   зарплаты, казна, склад, журнал действий и доступ на закрытые территории.
   Покрыта тестами в tools/check.js. */

/** Права, которые даёт ранг. */
const R = (name, pay, perms = {}) => ({
  name, pay,
  invite: !!perms.invite,      // приём новых
  fire: !!perms.fire,          // увольнение
  promote: !!perms.promote,    // повышение/понижение
  treasury: !!perms.treasury,  // казна и склад
  leader: !!perms.leader
});

/** Стандартная лестница из 7 званий: от новичка до руководителя. */
function ladder(names, basePay) {
  return names.map((n, i) => {
    const top = i === names.length - 1;
    const high = i >= names.length - 2;
    const mid = i >= names.length - 3;
    return R(n, Math.round(basePay * (1 + i * 0.45)), {
      invite: mid, fire: high, promote: high, treasury: high, leader: top
    });
  });
}

export const FACTIONS = {
  /* ======================= ГОСУДАРСТВЕННЫЕ ======================= */
  sgb: {
    id: 'sgb', name: 'СГБ', full: 'Служба государственной безопасности',
    type: 'state', color: 0x1d2b45, accent: 0x9fb4d8,
    desc: 'Контрразведка и работа под прикрытием. Следит за ОПГ, проводит проверки и спецоперации.',
    req: { level: 5, rep: 25, clean: true },
    ranks: ladder(['Стажёр', 'Оперативник', 'Старший оперативник', 'Инспектор',
      'Старший инспектор', 'Заместитель директора', 'Директор СГБ'], 160),
    vehicles: ['sedan', 'suv'],
    uniform: { shirt: 0x1d2b45, pants: 0x14161c, name: 'Чёрный костюм СГБ' },
    duties: [
      { id: 'sgb_watch', name: 'Наблюдение', desc: 'Проверить точки, где замечены ОПГ.', stops: 4, pay: 190, xp: 16 },
      { id: 'sgb_raid', name: 'Спецоперация', desc: 'Выехать на базу группировки.', stops: 2, pay: 420, xp: 30, rank: 2 }
    ],
    perks: ['Доступ к базе розыска', 'Табельное оружие', 'Проверка документов']
  },
  gb: {
    id: 'gb', name: 'ГБ', full: 'Городская безопасность',
    type: 'state', color: 0x24404f, accent: 0x7fd2e6,
    desc: 'Охрана порядка на объектах города, пропускной режим, реагирование на тревоги.',
    req: { level: 2, rep: 8, clean: true },
    ranks: ladder(['Кадет', 'Охранник', 'Старший охранник', 'Сержант охраны',
      'Начальник смены', 'Заместитель начальника', 'Начальник ГБ'], 95),
    vehicles: ['sedan', 'van'],
    uniform: { shirt: 0x24404f, pants: 0x1b2127, name: 'Синяя форма ГБ' },
    duties: [
      { id: 'gb_patrol', name: 'Обход объектов', desc: 'Проверить охраняемые точки.', stops: 5, pay: 95, xp: 10 },
      { id: 'gb_alarm', name: 'Сигнал тревоги', desc: 'Прибыть на сработавшую сигнализацию.', stops: 2, pay: 180, xp: 14 }
    ],
    perks: ['Дубинка и наручники', 'Вызов полиции', 'Доступ на служебные территории']
  },
  police: {
    id: 'police', name: 'Полиция', full: 'Департамент полиции',
    type: 'state', color: 0x1b3a6b, accent: 0x4f86d8,
    desc: 'Патрулирование, задержания, розыск и расследования. Главная сила закона в городе.',
    req: { level: 3, rep: 15, clean: true, license: 'drive' },
    ranks: ladder(['Кадет', 'Патрульный', 'Старший патрульный', 'Сержант',
      'Лейтенант', 'Капитан', 'Шеф полиции'], 120),
    vehicles: ['police', 'suv', 'sedan'],
    uniform: { shirt: 0x1b3a6b, pants: 0x1a1d24, name: 'Форма патрульного' },
    duties: [
      { id: 'pd_patrol', name: 'Патруль', desc: 'Объехать район по маршруту.', stops: 5, pay: 110, xp: 14 },
      { id: 'pd_arrest', name: 'Задержание', desc: 'Взять нарушителя и доставить в участок.', stops: 1, pay: 260, xp: 22 },
      { id: 'pd_case', name: 'Расследование', desc: 'Собрать улики по делу.', stops: 3, pay: 230, xp: 20, rank: 2 }
    ],
    perks: ['Задержание розыскных', 'Табельное оружие', 'Доступ к базе розыска', 'Маячок и сирена']
  },
  army: {
    id: 'army', name: 'Армия', full: 'Вооружённые силы',
    type: 'state', color: 0x3c4a2a, accent: 0x8fa35c,
    desc: 'Военная база за городом: охрана периметра, конвои и учения. Тяжёлое вооружение.',
    req: { level: 6, rep: 30, clean: true },
    ranks: ladder(['Рядовой', 'Ефрейтор', 'Сержант', 'Старшина',
      'Лейтенант', 'Майор', 'Генерал'], 140),
    vehicles: ['suv', 'truck', 'pickup'],
    uniform: { shirt: 0x3c4a2a, pants: 0x2f3a22, name: 'Полевая форма' },
    duties: [
      { id: 'army_guard', name: 'Охрана периметра', desc: 'Обойти посты базы.', stops: 5, pay: 150, xp: 15 },
      { id: 'army_convoy', name: 'Конвой', desc: 'Сопроводить груз между объектами.', stops: 3, pay: 380, xp: 28, rank: 2 }
    ],
    perks: ['Автомат и броня', 'Военный транспорт', 'Закрытая база']
  },
  mchs: {
    id: 'mchs', name: 'МЧС', full: 'Служба спасения',
    type: 'state', color: 0xb3530f, accent: 0xffb14a,
    desc: 'Тушение пожаров, ДТП и спасение людей. Самая мирная, но самая нужная служба.',
    req: { level: 2, rep: 5 },
    ranks: ladder(['Стажёр', 'Спасатель', 'Старший спасатель', 'Командир расчёта',
      'Начальник караула', 'Заместитель начальника', 'Начальник МЧС'], 105),
    vehicles: ['truck', 'van', 'suv'],
    uniform: { shirt: 0xb3530f, pants: 0x2a2d33, name: 'Боёвка спасателя' },
    duties: [
      { id: 'mchs_fire', name: 'Пожар', desc: 'Выехать на возгорание и потушить.', stops: 2, pay: 240, xp: 20 },
      { id: 'mchs_help', name: 'Помощь пострадавшим', desc: 'Объехать вызовы по городу.', stops: 4, pay: 130, xp: 14 }
    ],
    perks: ['Лечение игроков', 'Аптечки со склада', 'Проезд на красный']
  },
  smi: {
    id: 'smi', name: 'СМИ', full: 'Городской телеканал',
    type: 'state', color: 0x6a2f7a, accent: 0xc98fe0,
    desc: 'Новости, репортажи и объявления. Сообщения СМИ видит весь сервер.',
    req: { level: 1, rep: 0 },
    ranks: ladder(['Стажёр', 'Корреспондент', 'Репортёр', 'Ведущий',
      'Редактор', 'Заместитель директора', 'Директор канала'], 85),
    vehicles: ['van', 'hatch'],
    uniform: { shirt: 0x6a2f7a, pants: 0x23262b, name: 'Пиджак телеканала' },
    duties: [
      { id: 'smi_report', name: 'Репортаж', desc: 'Снять сюжет на городских точках.', stops: 4, pay: 110, xp: 12 },
      { id: 'smi_live', name: 'Прямой эфир', desc: 'Выйти в эфир с места события.', stops: 1, pay: 200, xp: 16 }
    ],
    perks: ['Объявления на весь город', 'Пресс-карта', 'Съёмочный фургон']
  },
  fsin: {
    id: 'fsin', name: 'ФСИН', full: 'Служба исполнения наказаний',
    type: 'state', color: 0x4a4a52, accent: 0xa8adb8,
    desc: 'Тюрьма города: охрана заключённых, конвой и досрочное освобождение.',
    req: { level: 3, rep: 12, clean: true },
    ranks: ladder(['Стажёр', 'Младший инспектор', 'Инспектор', 'Старший инспектор',
      'Начальник отряда', 'Заместитель начальника', 'Начальник колонии'], 110),
    vehicles: ['van', 'suv'],
    uniform: { shirt: 0x4a4a52, pants: 0x2b2e34, name: 'Форма ФСИН' },
    duties: [
      { id: 'fsin_guard', name: 'Охрана блока', desc: 'Обойти посты в колонии.', stops: 4, pay: 115, xp: 12 },
      { id: 'fsin_convoy', name: 'Конвой заключённого', desc: 'Доставить осуждённого в суд и обратно.', stops: 2, pay: 260, xp: 20 }
    ],
    perks: ['Посадка и освобождение', 'Доступ в тюрьму', 'Досрочное освобождение']
  },

  /* ======================= НЕЛЕГАЛЬНЫЕ ======================= */
  china: {
    id: 'china', name: 'ОПГ «Китай»', full: 'Группировка «Китай»',
    type: 'gang', color: 0xa81f28, accent: 0xffd34d,
    desc: 'Контрабанда и подпольные казино в китайском квартале. Деньги любят тишину.',
    req: { level: 1, rep: -999 },
    ranks: ladder(['Шестёрка', 'Боец', 'Бригадир', 'Смотрящий',
      'Правая рука', 'Заместитель', 'Глава «Китая»'], 90),
    vehicles: ['sedan', 'sports'],
    uniform: { shirt: 0xa81f28, pants: 0x14161a, name: 'Красная куртка' },
    duties: [
      { id: 'china_smuggle', name: 'Контрабанда', desc: 'Забрать груз и развезти по точкам.', stops: 3, pay: 320, xp: 18 },
      { id: 'china_collect', name: 'Сбор дани', desc: 'Пройтись по точкам и собрать деньги.', stops: 4, pay: 180, xp: 14 }
    ],
    perks: ['Чёрный рынок оружия', 'Взлом машин', 'Своя территория']
  },
  moscow: {
    id: 'moscow', name: 'ОПГ «Москва»', full: 'Группировка «Москва»',
    type: 'gang', color: 0x2b3c6b, accent: 0xd8d8e0,
    desc: 'Старая школа: крышевание бизнеса, выбивание долгов и контроль центра.',
    req: { level: 1, rep: -999 },
    ranks: ladder(['Пацан', 'Боец', 'Бригадир', 'Авторитет',
      'Правая рука', 'Заместитель', 'Вор в законе'], 95),
    vehicles: ['sedan', 'suv'],
    uniform: { shirt: 0x2b3c6b, pants: 0x1b1d22, name: 'Спортивный костюм' },
    duties: [
      { id: 'msk_racket', name: 'Крышевание', desc: 'Обойти магазины и собрать процент.', stops: 4, pay: 200, xp: 15 },
      { id: 'msk_debt', name: 'Выбить долг', desc: 'Найти должника и поговорить.', stops: 2, pay: 300, xp: 18 }
    ],
    perks: ['Чёрный рынок', 'Подкуп', 'Своя территория']
  },
  skins: {
    id: 'skins', name: 'ОПГ «Скинхеды»', full: 'Группировка «Скинхеды»',
    type: 'gang', color: 0x5a3a1f, accent: 0xe08a3c,
    desc: 'Уличная банда промзоны. Берут не умом, а числом и кулаками.',
    req: { level: 1, rep: -999 },
    ranks: ladder(['Новичок', 'Боец', 'Старший', 'Бригадир',
      'Правая рука', 'Заместитель', 'Лидер'], 80),
    vehicles: ['pickup', 'hatch'],
    uniform: { shirt: 0x5a3a1f, pants: 0x20242a, name: 'Бомбер и берцы' },
    duties: [
      { id: 'skin_turf', name: 'Передел района', desc: 'Пометить территорию и отбить точки.', stops: 4, pay: 170, xp: 14 },
      { id: 'skin_fight', name: 'Стрелка', desc: 'Выехать на разборку с другой ОПГ.', stops: 1, pay: 330, xp: 20 }
    ],
    perks: ['Биты и дробовики', 'Запугивание', 'Своя территория']
  },
  arzamas: {
    id: 'arzamas', name: 'ОПГ «Арзамас»', full: 'Группировка «Арзамас»',
    type: 'gang', color: 0x1f5a3c, accent: 0x7fe0a8,
    desc: 'Приезжие с окраин: угоны, разбор машин и продажа запчастей.',
    req: { level: 1, rep: -999 },
    ranks: ladder(['Гонец', 'Боец', 'Старшой', 'Бригадир',
      'Правая рука', 'Заместитель', 'Старший «Арзамаса»'], 85),
    vehicles: ['hatch', 'van'],
    uniform: { shirt: 0x1f5a3c, pants: 0x1a1e22, name: 'Зелёная ветровка' },
    duties: [
      { id: 'arz_steal', name: 'Угон', desc: 'Угнать машину и пригнать на разбор.', stops: 2, pay: 280, xp: 18 },
      { id: 'arz_parts', name: 'Развоз запчастей', desc: 'Развезти товар по скупщикам.', stops: 4, pay: 160, xp: 13 }
    ],
    perks: ['Угон машин', 'Скупка запчастей', 'Своя территория']
  }
};

export const FACTION_IDS = Object.keys(FACTIONS);
export const STATE_FACTIONS = FACTION_IDS.filter(id => FACTIONS[id].type === 'state');
export const GANG_FACTIONS = FACTION_IDS.filter(id => FACTIONS[id].type === 'gang');

export const MAX_RANK = id => FACTIONS[id].ranks.length - 1;
export const rankName = (id, rank) => FACTIONS[id]?.ranks[clampRank(id, rank)]?.name || '—';
export const rankPerms = (id, rank) => FACTIONS[id]?.ranks[clampRank(id, rank)] || {};
const clampRank = (id, r) => Math.max(0, Math.min(MAX_RANK(id), r | 0));

/* ======================= СОСТОЯНИЕ ОРГАНИЗАЦИЙ ======================= */

/** Создаёт структуру организации в сейве игрока (казна, склад, состав, журнал). */
export function orgState(p, id) {
  if (!p.orgs || typeof p.orgs !== 'object') p.orgs = {};
  if (!p.orgs[id]) {
    const f = FACTIONS[id];
    p.orgs[id] = {
      budget: f.type === 'state' ? 25000 : 12000,
      warehouse: [],
      members: defaultRoster(id),
      log: [],
      war: 0                     // счёт в войне ОПГ
    };
  }
  const o = p.orgs[id];
  if (!Array.isArray(o.warehouse)) o.warehouse = [];
  if (!Array.isArray(o.members)) o.members = defaultRoster(id);
  if (!Array.isArray(o.log)) o.log = [];
  return o;
}

const NPC_NAMES = ['Артём Волков', 'Игорь Седов', 'Марина Лис', 'Пётр Громов', 'Лена Нечаева',
  'Денис Крот', 'Саша Белый', 'Олег Туман', 'Кира Шторм', 'Рома Тихий', 'Вова Кузнец', 'Настя Рысь'];

/** Начальный состав: несколько NPC с разными званиями. */
function defaultRoster(id) {
  const max = MAX_RANK(id);
  const out = [];
  const n = 5 + (id.length % 3);
  for (let i = 0; i < n; i++) {
    out.push({
      name: NPC_NAMES[(id.charCodeAt(0) + i * 3) % NPC_NAMES.length],
      rank: i === 0 ? max : Math.max(0, max - 1 - (i % max)),
      npc: true,
      online: i % 2 === 0
    });
  }
  return out;
}

export function logAction(p, id, text) {
  const o = orgState(p, id);
  o.log.unshift({ at: Date.now(), text });
  if (o.log.length > 60) o.log.length = 60;
  return o.log;
}

/* ======================= ЧЛЕНСТВО ======================= */

export function myFaction(p) { return p.faction && FACTIONS[p.faction.id] ? p.faction : null; }
export function isMember(p, id) { return !!(p.faction && p.faction.id === id); }
export function myRank(p) { return p.faction ? clampRank(p.faction.id, p.faction.rank) : -1; }
export function myPerms(p) { return p.faction ? rankPerms(p.faction.id, p.faction.rank) : {}; }

/** Проверка требований к вступлению. */
export function canJoin(p, id, ctx = {}) {
  const f = FACTIONS[id];
  if (!f) return { ok: false, reason: 'Нет такой организации' };
  if (p.faction) return { ok: false, reason: 'Сначала уволься из текущей организации' };
  const req = f.req || {};
  if ((p.level || 1) < (req.level || 1)) return { ok: false, reason: `Нужен ${req.level} уровень` };
  if (req.rep !== undefined && (p.rep || 0) < req.rep) return { ok: false, reason: `Нужна репутация ${req.rep}` };
  if (req.license && !(p.licenses || {})[req.license]) return { ok: false, reason: 'Нужны водительские права' };
  if (req.clean) {
    if ((ctx.wanted || 0) > 0) return { ok: false, reason: 'С розыском в госструктуру не берут' };
    if (p.criminal) return { ok: false, reason: 'Судимость закрывает дорогу в госструктуры' };
  }
  return { ok: true };
}

export function joinFaction(p, id, ctx = {}) {
  const check = canJoin(p, id, ctx);
  if (!check.ok) return check;
  p.faction = { id, rank: 0, joined: Date.now(), duty: false, salaryAcc: 0, duties: 0 };
  const o = orgState(p, id);
  o.members.push({ name: p.name, rank: 0, player: true, online: true });
  logAction(p, id, `${p.name} принят на должность «${rankName(id, 0)}»`);
  return { ok: true, faction: FACTIONS[id] };
}

export function leaveFaction(p) {
  if (!p.faction) return { ok: false, reason: 'Ты не состоишь в организации' };
  const id = p.faction.id;
  const o = orgState(p, id);
  o.members = o.members.filter(m => !m.player);
  logAction(p, id, `${p.name} покинул организацию`);
  p.faction = null;
  p.onDuty = false;
  return { ok: true, id };
}

/** Повышение/понижение участника (в том числе себя — если позволяет ранг). */
export function setMemberRank(p, id, memberName, delta) {
  const perms = isMember(p, id) ? myPerms(p) : {};
  if (!perms.promote) return { ok: false, reason: 'Нет прав на кадровые решения' };
  const o = orgState(p, id);
  const m = o.members.find(x => x.name === memberName);
  if (!m) return { ok: false, reason: 'Нет такого сотрудника' };
  const max = MAX_RANK(id);
  const mine = myRank(p);
  const next = Math.max(0, Math.min(max, m.rank + delta));
  if (!perms.leader && next >= mine) return { ok: false, reason: 'Нельзя поднять выше своего звания' };
  if (next === m.rank) return { ok: false, reason: delta > 0 ? 'Это уже потолок' : 'Ниже некуда' };
  m.rank = next;
  if (m.player) p.faction.rank = next;
  logAction(p, id, `${memberName}: ${delta > 0 ? 'повышение' : 'понижение'} до «${rankName(id, next)}»`);
  return { ok: true, rank: next, name: rankName(id, next) };
}

/** Увольнение участника. */
export function fireMember(p, id, memberName) {
  const perms = isMember(p, id) ? myPerms(p) : {};
  if (!perms.fire) return { ok: false, reason: 'Нет прав на увольнение' };
  const o = orgState(p, id);
  const m = o.members.find(x => x.name === memberName);
  if (!m) return { ok: false, reason: 'Нет такого сотрудника' };
  if (m.rank >= myRank(p) && !myPerms(p).leader) return { ok: false, reason: 'Он старше по званию' };
  o.members = o.members.filter(x => x !== m);
  logAction(p, id, `${memberName} уволен`);
  if (m.player) { p.faction = null; p.onDuty = false; }
  return { ok: true };
}

/** Приём NPC-кандидата (чтобы руководитель мог «набирать штат»). */
export function inviteMember(p, id, name) {
  const perms = isMember(p, id) ? myPerms(p) : {};
  if (!perms.invite) return { ok: false, reason: 'Нет прав на приём' };
  const o = orgState(p, id);
  if (o.members.length >= 24) return { ok: false, reason: 'Штат укомплектован' };
  if (o.members.some(m => m.name === name)) return { ok: false, reason: 'Уже в составе' };
  o.members.push({ name, rank: 0, npc: true, online: true });
  logAction(p, id, `${name} принят в организацию`);
  return { ok: true };
}

/* ======================= ДЕЖУРСТВО И ЗАРПЛАТА ======================= */

export function setDuty(p, on) {
  if (!p.faction) return { ok: false, reason: 'Ты не в организации' };
  p.faction.duty = !!on;
  return { ok: true, duty: p.faction.duty };
}

export const onDuty = p => !!(p.faction && p.faction.duty);

/** Начисление зарплаты на дежурстве: платит организация из казны. */
export function tickSalary(p, minutes) {
  if (!onDuty(p)) return { paid: 0 };
  const id = p.faction.id;
  const perRank = rankPerms(id, p.faction.rank).pay || 50;
  const o = orgState(p, id);
  const amount = perRank * minutes;
  const pay = Math.min(amount, o.budget);
  if (pay <= 0) return { paid: 0, empty: true };
  o.budget -= pay;
  p.faction.salaryAcc = (p.faction.salaryAcc || 0) + pay;
  p.money += pay;
  return { paid: Math.round(pay), budget: Math.round(o.budget) };
}

/** Доступные дежурному задания с учётом звания. */
export function availableDuties(p) {
  if (!p.faction) return [];
  const f = FACTIONS[p.faction.id];
  return f.duties.filter(d => (d.rank || 0) <= myRank(p));
}

/** Фиксируем выполненное задание: премия и запись в журнал. */
export function completeDuty(p, dutyId) {
  if (!p.faction) return { ok: false, reason: 'Ты не в организации' };
  const f = FACTIONS[p.faction.id];
  const d = f.duties.find(x => x.id === dutyId);
  if (!d) return { ok: false, reason: 'Нет такого задания' };
  const o = orgState(p, f.id);
  const bonus = Math.round(d.pay * 0.5);
  o.budget += bonus;                       // часть выручки идёт организации
  p.faction.duties = (p.faction.duties || 0) + 1;
  p.xp += d.xp || 10;
  logAction(p, f.id, `${p.name} выполнил задание «${d.name}» (+${bonus} $ в казну)`);
  return { ok: true, bonus };
}

/* ======================= КАЗНА И СКЛАД ======================= */

export function depositOrg(p, id, amount) {
  amount = Math.floor(amount);
  if (!(amount > 0)) return { ok: false, reason: 'Неверная сумма' };
  if (p.money < amount) return { ok: false, reason: 'Недостаточно денег' };
  const o = orgState(p, id);
  p.money -= amount;
  o.budget += amount;
  logAction(p, id, `${p.name} внёс ${amount} $ в казну`);
  return { ok: true, budget: o.budget };
}

export function withdrawOrg(p, id, amount) {
  amount = Math.floor(amount);
  if (!myPerms(p).treasury || !isMember(p, id)) return { ok: false, reason: 'Нет доступа к казне' };
  const o = orgState(p, id);
  if (!(amount > 0)) return { ok: false, reason: 'Неверная сумма' };
  if (o.budget < amount) return { ok: false, reason: 'В казне столько нет' };
  o.budget -= amount;
  p.money += amount;
  logAction(p, id, `${p.name} снял ${amount} $ из казны`);
  return { ok: true, budget: o.budget };
}

export const ORG_STORAGE_MAX = 120;

export function orgStorePut(p, id, itemId, qty, invCount, removeItem) {
  if (!isMember(p, id)) return { ok: false, reason: 'Ты не в этой организации' };
  if (invCount(p, itemId) < qty) return { ok: false, reason: 'Нет в инвентаре' };
  const o = orgState(p, id);
  const total = o.warehouse.reduce((s, i) => s + i.qty, 0);
  if (total + qty > ORG_STORAGE_MAX) return { ok: false, reason: 'Склад заполнен' };
  removeItem(p, itemId, qty);
  const e = o.warehouse.find(i => i.id === itemId);
  if (e) e.qty += qty; else o.warehouse.push({ id: itemId, qty });
  logAction(p, id, `${p.name} сдал на склад: ${itemId} ×${qty}`);
  return { ok: true };
}

export function orgStoreTake(p, id, itemId, qty, addItem) {
  if (!isMember(p, id)) return { ok: false, reason: 'Ты не в этой организации' };
  const o = orgState(p, id);
  const e = o.warehouse.find(i => i.id === itemId);
  if (!e || e.qty < qty) return { ok: false, reason: 'На складе нет' };
  const r = addItem(p, itemId, qty);
  if (!r.ok) return r;
  e.qty -= qty;
  if (e.qty <= 0) o.warehouse.splice(o.warehouse.indexOf(e), 1);
  logAction(p, id, `${p.name} получил со склада: ${itemId} ×${qty}`);
  return { ok: true };
}

/* ======================= ТЕРРИТОРИИ И ВЗАИМОДЕЙСТВИЕ ======================= */

/** Может ли игрок находиться на закрытой территории организации. */
export function canEnterZone(p, zoneId) {
  if (!FACTIONS[zoneId]) return true;
  if (isMember(p, zoneId)) return true;
  // полиция и СГБ вправе заходить к силовикам, но не к бандитам
  if (p.faction && FACTIONS[zoneId].type === 'state'
    && ['police', 'sgb'].includes(p.faction.id)) return true;
  return false;
}

/** Есть ли у организации спецвозможность. */
export function hasPerk(p, perk) {
  if (!p.faction) return false;
  const f = FACTIONS[p.faction.id];
  return (f.perks || []).some(x => x.toLowerCase().includes(perk.toLowerCase()));
}

/** Война ОПГ: за выполненные дела начисляются очки влияния. */
export function addWarScore(p, id, amount) {
  const o = orgState(p, id);
  o.war = Math.max(0, (o.war || 0) + amount);
  return o.war;
}

/** Таблица влияния группировок. */
export function gangStandings(p) {
  return GANG_FACTIONS
    .map(id => ({ id, name: FACTIONS[id].name, war: orgState(p, id).war || 0 }))
    .sort((a, b) => b.war - a.war);
}

/* ======================= ТЮРЬМА (ФСИН) ======================= */

/** Сажает игрока: срок в игровых минутах и штраф. */
export function jailPlayer(p, minutes, reason = 'нарушение закона') {
  p.jail = { until: Date.now() + minutes * 60000, minutes, reason, bail: Math.round(minutes * 320) };
  p.criminal = true;
  return p.jail;
}

export function jailLeft(p) {
  if (!p.jail) return 0;
  return Math.max(0, Math.ceil((p.jail.until - Date.now()) / 1000));
}

export function releasePlayer(p, by = 'срок отбыт') {
  if (!p.jail) return { ok: false, reason: 'Не в тюрьме' };
  const was = p.jail;
  p.jail = null;
  return { ok: true, reason: by, was };
}

/** Освобождение под залог. */
export function payBail(p) {
  if (!p.jail) return { ok: false, reason: 'Не в тюрьме' };
  const sum = p.jail.bail;
  if (p.money < sum) return { ok: false, reason: `Залог ${sum} $ — не хватает денег` };
  p.money -= sum;
  p.jail = null;
  return { ok: true, paid: sum };
}

/** Досрочное освобождение сотрудником ФСИН. */
export function paroleBy(p, officerFactionId) {
  if (officerFactionId !== 'fsin') return { ok: false, reason: 'Только ФСИН' };
  return releasePlayer(p, 'досрочное освобождение ФСИН');
}

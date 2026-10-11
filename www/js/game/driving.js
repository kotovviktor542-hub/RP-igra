/* driving.js — автошкола как в Amazing: теория на 10 вопросов, практический
   экзамен, права по четырём категориям, срок действия и лишение за штрафы. */

import { LICENCE_CATS } from '../entities/vehicle.js';

/** Сколько игровых суток действуют права. */
export const LICENCE_DAYS = 30;
/** Порог долга по штрафам, при котором права аннулируют. */
export const FINE_LIMIT = 3000;
/** Стоимость сдачи одной категории. */
export const EXAM_FEE = 800;

/** Банк теории. 10 вопросов тянутся в случайном порядке. */
export const THEORY = [
  { q: 'Разрешено ли движение на мигающий жёлтый сигнал светофора?',
    a: ['Разрешено, соблюдая правила проезда перекрёстков', 'Запрещено', 'Только при отсутствии других машин'], c: 0 },
  { q: 'С какой скоростью разрешено движение в населённом пункте?',
    a: ['60 км/ч', '90 км/ч', '40 км/ч', '110 км/ч'], c: 0 },
  { q: 'Обязан ли водитель уступить дорогу пешеходу на нерегулируемом переходе?',
    a: ['Обязан', 'Не обязан', 'Только ночью'], c: 0 },
  { q: 'Что означает включённая аварийная сигнализация на стоящем автомобиле?',
    a: ['Вынужденную остановку в запрещённом месте', 'Поломку светофора', 'Начало движения'], c: 0 },
  { q: 'Разрешён ли обгон на регулируемом перекрёстке?',
    a: ['Запрещён', 'Разрешён', 'Разрешён при зелёном сигнале'], c: 0 },
  { q: 'Минимальная дистанция до впереди идущего транспорта при 60 км/ч?',
    a: ['Не менее 30 метров', 'Не менее 5 метров', 'Не регламентируется'], c: 0 },
  { q: 'Как должен поступить водитель при отказе тормозов?',
    a: ['Снизить скорость двигателем и включить аварийку', 'Продолжать движение', 'Резко затормозить ручником'], c: 0 },
  { q: 'Разрешена ли буксировка на гибкой сцепке в гололёд?',
    a: ['Запрещена', 'Разрешена', 'Разрешена со скоростью до 20 км/ч'], c: 0 },
  { q: 'Что означает знак «Уступите дорогу»?',
    a: ['Уступить дорогу транспорту на пересекаемой дороге', 'Остановиться у стоп-линии', 'Движение запрещено'], c: 0 },
  { q: 'Обязательно ли пристёгиваться ремнём безопасности водителю?',
    a: ['Обязательно', 'Только на трассе', 'На усмотрение водителя'], c: 0 },
  { q: 'С какого возраста выдаются права категории B?',
    a: ['С 18 лет', 'С 16 лет', 'С 21 года'], c: 0 },
  { q: 'Разрешена ли остановка на автомагистрали?',
    a: ['Только на специальных площадках', 'В любом месте справа', 'Запрещена полностью'], c: 0 },
  { q: 'Что нужно сделать при приближении спецтранспорта с включёнными сигналами?',
    a: ['Уступить дорогу', 'Ускориться', 'Продолжать движение'], c: 0 },
  { q: 'Как влияет дождь на тормозной путь?',
    a: ['Увеличивает', 'Уменьшает', 'Не влияет'], c: 0 },
  { q: 'Разрешено ли управлять транспортом без водительского удостоверения?',
    a: ['Запрещено', 'Разрешено днём', 'Разрешено во дворе'], c: 0 }
];

/** Сколько вопросов в билете. */
export const QUESTIONS_PER_EXAM = 10;

/** Составляет билет из банка. */
export function makeTicket(rng = Math.random) {
  const pool = THEORY.map((t, i) => i);
  const out = [];
  while (out.length < QUESTIONS_PER_EXAM && pool.length) {
    const k = Math.floor(rng() * pool.length);
    out.push(THEORY[pool.splice(k, 1)[0]]);
  }
  return out;
}

/** Сдаёт теорию. Возвращает {ok, correct, total}. */
export function passTheory(answers, ticket) {
  let correct = 0;
  ticket.forEach((t, i) => { if (answers[i] === t.c) correct++; });
  // как в Amazing: допускается одна ошибка
  return { ok: correct >= ticket.length - 1, correct, total: ticket.length };
}

/** Игровые сутки из реальных миллисекунд. */
function gameDaysSince(ms, timeScale) {
  const hours = (ms / 1000) * timeScale / 3600;
  return hours / 24;
}

/**
 * Выдаёт права категории.
 * @param {object} p игрок
 * @param {string} cat 'A' | 'B' | 'C' | 'D'
 */
export function issueLicence(p, cat, timeScale = 1 / 45) {
  if (!LICENCE_CATS[cat]) return { ok: false, reason: 'Нет такой категории' };
  p.licences = p.licences || {};
  p.licences[cat] = { issued: Date.now(), theory: true };
  // старая система «licenses» тоже заполняется — её читают работы и проверки
  p.licenses = p.licenses || {};
  p.licenses[mapLegacy(cat)] = true;
  void timeScale;
  return { ok: true, cat };
}

/** Проверяет, действуют ли права категории на данный момент. */
export function hasLicence(p, cat, timeScale = 1 / 45) {
  if (!cat) return true;
  const rec = p.licences && p.licences[cat];
  if (!rec) return false;
  const days = gameDaysSince(Date.now() - rec.issued, timeScale);
  return days < LICENCE_DAYS;
}

/** Сколько игровых суток осталось у прав. */
export function licenceDaysLeft(p, cat, timeScale = 1 / 45) {
  const rec = p.licences && p.licences[cat];
  if (!rec) return 0;
  return Math.max(0, LICENCE_DAYS - gameDaysSince(Date.now() - rec.issued, timeScale));
}

/** Категория транспорта нужна для посадки за руль. */
export function canDrive(p, vehicleSpec, timeScale) {
  const cat = vehicleSpec && vehicleSpec.cat ? vehicleSpec.cat : 'B';
  return hasLicence(p, cat, timeScale);
}

/* ------------------------- штрафы ПДД ------------------------- */
export const FINES = {
  redlight:  { name: 'Проезд на красный',        amount: 1000 },
  speeding:  { name: 'Превышение скорости',      amount: 1500 },
  crash:     { name: 'ДТП с пострадавшими',      amount: 2500 },
  hitrun:    { name: 'Наезд на пешехода',        amount: 3000 },
  nolicense: { name: 'Езда без прав',            amount: 2000 },
  wrongway:  { name: 'Выезд на встречную полосу', amount: 1800 },
  parking:   { name: 'Парковка в неположенном месте', amount: 400 }
};

/** Выписывает штраф. При превышении лимита права отбирают. */
export function addFine(p, kind) {
  const def = FINES[kind];
  if (!def) return { ok: false };
  p.fines = p.fines || { list: [], debt: 0, paid: 0 };
  const rec = { kind, amount: def.amount, at: Date.now(), paid: false };
  p.fines.list.push(rec);
  p.fines.debt += def.amount;

  let revoked = null;
  if (p.fines.debt >= FINE_LIMIT) {
    revoked = Object.keys(p.licences || {});
    p.licences = {};
    p.licenses = {};
  }
  return { ok: true, def, rec, revoked };
}

/** Оплата всех штрафов. */
export function payFines(p) {
  p.fines = p.fines || { list: [], debt: 0, paid: 0 };
  const total = p.fines.debt;
  if (p.money < total) return { ok: false, reason: 'Не хватает денег', need: total };
  p.money -= total;
  p.fines.list.forEach(f => { f.paid = true; });
  p.fines.paid += total;
  p.fines.debt = 0;
  return { ok: true, total };
}

/** Сводка для интерфейса. */
export function licenceSummary(p, timeScale = 1 / 45) {
  return Object.keys(LICENCE_CATS).map(cat => ({
    cat,
    name: LICENCE_CATS[cat].name,
    desc: LICENCE_CATS[cat].desc,
    has: hasLicence(p, cat, timeScale),
    daysLeft: Math.floor(licenceDaysLeft(p, cat, timeScale))
  })).sort((a, b) => LICENCE_CATS[a.cat].order - LICENCE_CATS[b.cat].order);
}

/** Мост к старому ключу прав, который читают работы. */
function mapLegacy(cat) {
  return cat === 'A' ? 'moto' : cat === 'C' ? 'truck' : cat === 'D' ? 'bus' : 'drive';
}

export { LICENCE_CATS };

/* content.js — контент игры: предметы, ассортимент магазинов, работы, задания.
   Чистый модуль без three.js — гоняется в тестах через node. */

/* ======================= ПРЕДМЕТЫ ======================= */
export const ITEMS = {
  // еда и напитки
  burger:     { name: 'Бургер',        cat: 'food',   weight: 0.4, price: 9,   hunger: 32, mood: 4 },
  sandwich:   { name: 'Сэндвич',       cat: 'food',   weight: 0.3, price: 6,   hunger: 20, mood: 2 },
  pizza:      { name: 'Пицца',         cat: 'food',   weight: 1.2, price: 18,  hunger: 55, mood: 8 },
  water:      { name: 'Вода',          cat: 'food',   weight: 0.5, price: 2,   thirst: 35 },
  cola:       { name: 'Газировка',     cat: 'food',   weight: 0.5, price: 4,   thirst: 28, mood: 3, health: -1 },
  coffee:     { name: 'Кофе',          cat: 'food',   weight: 0.3, price: 5,   thirst: 15, energy: 25, mood: 5 },
  energydrink:{ name: 'Энергетик',     cat: 'food',   weight: 0.4, price: 7,   thirst: 18, energy: 40, health: -2 },

  // медицина
  bandage:    { name: 'Бинт',          cat: 'med',    weight: 0.1, price: 12,  health: 18, stopsBleed: 60 },
  medkit:     { name: 'Аптечка',       cat: 'med',    weight: 1.0, price: 55,  health: 55, stopsBleed: 100 },
  painkiller: { name: 'Обезболивающее',cat: 'med',    weight: 0.1, price: 20,  health: 10, mood: 6 },

  // электроника
  phone:      { name: 'Смартфон',      cat: 'tech',   weight: 0.2, price: 450, useful: true },
  laptop:     { name: 'Ноутбук',       cat: 'tech',   weight: 2.0, price: 1200, useful: true },
  radio:      { name: 'Рация',         cat: 'tech',   weight: 0.4, price: 180, useful: true },
  gps:        { name: 'GPS-навигатор', cat: 'tech',   weight: 0.3, price: 220, useful: true },

  // инструменты
  repairkit:  { name: 'Ремкомплект',   cat: 'tool',   weight: 3.0, price: 140, repair: 1 },
  jerrycan:   { name: 'Канистра',      cat: 'tool',   weight: 8.0, price: 60,  fuel: 30 },
  toolbox:    { name: 'Ящик с инструментом', cat: 'tool', weight: 6.0, price: 320 },
  pickaxe:    { name: 'Кирка',        cat: 'tool', weight: 3.4, price: 180 },
  chainsaw:   { name: 'Бензопила',    cat: 'tool', weight: 5.2, price: 640 },
  diving:     { name: 'Акваланг',     cat: 'tool', weight: 9.0, price: 2400 },
  sprayer:    { name: 'Опрыскиватель',cat: 'tool', weight: 2.6, price: 210 },
  lockpick:   { name: 'Отмычка',       cat: 'tool',   weight: 0.1, price: 90 },

  // одежда
  tshirt:     { name: 'Футболка',      cat: 'cloth',  weight: 0.2, price: 25,  wear: 'shirt' },
  jacket:     { name: 'Куртка',        cat: 'cloth',  weight: 1.0, price: 120, wear: 'shirt' },
  suit:       { name: 'Костюм',        cat: 'cloth',  weight: 1.2, price: 450, wear: 'shirt' },
  jeans:      { name: 'Джинсы',        cat: 'cloth',  weight: 0.7, price: 60,  wear: 'pants' },
  sneakers:   { name: 'Кроссовки',     cat: 'cloth',  weight: 0.8, price: 85,  wear: 'shoes' },
  cap:        { name: 'Кепка',         cat: 'cloth',  weight: 0.1, price: 20 },

  // грузы для работ
  parcel:     { name: 'Посылка',       cat: 'cargo',  weight: 2.5, price: 0, questOnly: true },
  pizzabox:   { name: 'Коробка пиццы', cat: 'cargo',  weight: 1.0, price: 0, questOnly: true },
  trashbag:   { name: 'Мешок мусора',  cat: 'cargo',  weight: 4.0, price: 0, questOnly: true },
  crate:      { name: 'Ящик груза',    cat: 'cargo',  weight: 12.0, price: 0, questOnly: true },
  ore:        { name: 'Руда',          cat: 'cargo',  weight: 14.0, price: 0, questOnly: true },
  log:        { name: 'Бревно',        cat: 'cargo',  weight: 11.0, price: 0, questOnly: true },
  harvest:    { name: 'Урожай',        cat: 'cargo',  weight: 6.0,  price: 0, questOnly: true },
  salvage:    { name: 'Подводный груз',cat: 'cargo',  weight: 9.0,  price: 0, questOnly: true },

  // оружие
  pistol:     { name: 'Пистолет',      cat: 'weapon', weight: 1.1, price: 900,  equip: 'pistol' },
  revolver:   { name: 'Револьвер',     cat: 'weapon', weight: 1.4, price: 2200, equip: 'revolver' },
  smg:        { name: 'Пистолет-пулемёт', cat: 'weapon', weight: 3.1, price: 4800, equip: 'smg' },
  shotgun:    { name: 'Дробовик',      cat: 'weapon', weight: 3.8, price: 3600, equip: 'shotgun' },
  rifle:      { name: 'Автомат',       cat: 'weapon', weight: 4.2, price: 9500, equip: 'rifle' },

  // патроны (пачками)
  ammo9:      { name: 'Патроны 9 мм (24)',   cat: 'weapon', weight: 0.5, price: 45,  ammoType: '9mm', ammo: 24 },
  ammo357:    { name: 'Патроны .357 (18)',   cat: 'weapon', weight: 0.6, price: 70,  ammoType: '357', ammo: 18 },
  ammo12:     { name: 'Патроны 12к (16)',    cat: 'weapon', weight: 0.9, price: 80,  ammoType: '12g', ammo: 16 },
  ammo762:    { name: 'Патроны 7.62 (30)',   cat: 'weapon', weight: 1.1, price: 120, ammoType: '762', ammo: 30 },
  holster:    { name: 'Кобура',        cat: 'weapon', weight: 0.4, price: 180 },
  armor:      { name: 'Бронежилет',    cat: 'weapon', weight: 5.0, price: 1400, armor: 50 },
  // старый предмет из прежних сейвов — остаётся рабочим
  ammo:       { name: 'Патроны 9 мм',  cat: 'weapon', weight: 0.3, price: 45, ammoType: '9mm', ammo: 12 },

  // прочее
  cigarettes: { name: 'Сигареты',      cat: 'misc',   weight: 0.1, price: 11, mood: 7, health: -3 },
  newspaper:  { name: 'Газета',        cat: 'misc',   weight: 0.2, price: 3,  mood: 2 },
  sparepart:  { name: 'Запчасть',      cat: 'misc',   weight: 4.0, price: 95 }
};

/* ======================= АССОРТИМЕНТ ======================= */
export const SHOP_STOCK = {
  market:      ['burger', 'sandwich', 'water', 'cola', 'coffee', 'pizza', 'newspaper', 'cigarettes', 'energydrink'],
  cafe:        ['coffee', 'sandwich', 'burger', 'cola', 'pizza'],
  pharmacy:    ['bandage', 'medkit', 'painkiller', 'water'],
  electronics: ['phone', 'laptop', 'radio', 'gps'],
  hardware:    ['repairkit', 'jerrycan', 'toolbox', 'lockpick', 'pickaxe', 'chainsaw', 'sprayer', 'diving'],
  guns:        ['pistol', 'revolver', 'shotgun', 'smg', 'rifle',
                'ammo9', 'ammo357', 'ammo12', 'ammo762', 'holster', 'armor'],
  clothes:     ['tshirt', 'jacket', 'suit', 'jeans', 'sneakers', 'cap'],
  autoparts:   ['repairkit', 'jerrycan', 'sparepart', 'toolbox']
};

/* ======================= РАБОТЫ ======================= */
/**
 * stops — сколько точек надо объехать/обойти,
 * payPerStop — оплата за точку, bonus — за выполнение целиком.
 */
export const JOBS = {
  taxi: {
    name: 'Таксист', icon: '🚕',
    desc: 'Забирай пассажиров и вези по адресу. Нужна машина.',
    needVehicle: true, stops: 4, payPerStop: 55, bonus: 120,
    reqLicense: 'drive', xp: 12
  },
  delivery: {
    name: 'Курьер еды', icon: '🍕',
    desc: 'Развози заказы по городу. Можно пешком, но на машине быстрее.',
    needVehicle: false, stops: 5, payPerStop: 32, bonus: 70,
    cargo: 'pizzabox', xp: 9
  },
  courier: {
    name: 'Курьер посылок', icon: '📦',
    desc: 'Развози посылки из распределительного центра.',
    needVehicle: false, stops: 5, payPerStop: 38, bonus: 85,
    cargo: 'parcel', xp: 10
  },
  garbage: {
    name: 'Мусорщик', icon: '🗑',
    desc: 'Собирай мешки с мусора по точкам. Грязно, но платят стабильно.',
    needVehicle: false, stops: 6, payPerStop: 28, bonus: 60,
    cargo: 'trashbag', xp: 8
  },
  cargo: {
    name: 'Дальнобой', icon: '🚚',
    desc: 'Перевози ящики между складами. Нужен фургон или грузовик.',
    needVehicle: true, stops: 3, payPerStop: 145, bonus: 280,
    cargo: 'crate', reqLicense: 'drive', xp: 22
  },
  police: {
    name: 'Патрульный', icon: '🚓',
    desc: 'Патрулируй точки в городе. Требует репутацию 20+.',
    needVehicle: true, stops: 5, payPerStop: 90, bonus: 200,
    reqRep: 20, reqLicense: 'drive', xp: 25
  },
  bus: {
    name: 'Водитель автобуса', icon: '🚌',
    desc: 'Объезжай остановки по маршруту. Нужны права категории D.',
    needVehicle: true, stops: 6, payPerStop: 70, bonus: 150,
    reqCat: 'D', xp: 18
  },

  /* ---- как в Amazing: добыча и производство ---- */
  mine: {
    name: 'Шахтёр', icon: '⛏',
    desc: 'Спускайся в забой и вывози руду на поверхность. Тяжело, но стабильно.',
    needVehicle: false, stops: 7, payPerStop: 46, bonus: 190,
    cargo: 'ore', xp: 14, tool: 'pickaxe', fatigue: 2.2
  },
  miner: {
    name: 'Рудокоп', icon: '💎',
    desc: 'Эксклюзивная добыча: редкая руда уходит дороже обычной породы.',
    needVehicle: false, stops: 6, payPerStop: 78, bonus: 340,
    cargo: 'ore', xp: 20, tool: 'pickaxe', fatigue: 2.6, reqLevel: 6
  },
  sawmill: {
    name: 'Лесопилка', icon: '🪵',
    desc: 'Вали лес и отвози брёвна на пилораму.',
    needVehicle: false, stops: 7, payPerStop: 42, bonus: 165,
    cargo: 'log', xp: 13, tool: 'chainsaw', fatigue: 2.0
  },
  farm: {
    name: 'Фермер', icon: '🌾',
    desc: 'Собирай урожай с грядок и сдавай на базу. Спокойная работа.',
    needVehicle: false, stops: 8, payPerStop: 34, bonus: 140,
    cargo: 'harvest', xp: 11, fatigue: 1.4
  },

  /* ---- как в Amazing: дороги и сервис ---- */
  mechanic: {
    name: 'Механик', icon: '🔧',
    desc: 'Выезжай на вызовы и чини машины клиентов. Нужен инструмент.',
    needVehicle: true, stops: 5, payPerStop: 120, bonus: 260,
    tool: 'toolbox', reqCat: 'B', xp: 21
  },
  towtruck: {
    name: 'Эвакуаторщик', icon: '🛻',
    desc: 'Забирай брошенные машины и отвози на штрафстоянку.',
    needVehicle: true, stops: 4, payPerStop: 155, bonus: 300,
    reqCat: 'C', xp: 23
  },
  collector: {
    name: 'Инкассатор', icon: '💰',
    desc: 'Развози деньги между банками. Опасно — могут напасть.',
    needVehicle: true, stops: 4, payPerStop: 195, bonus: 420,
    reqCat: 'C', reqLevel: 5, risk: 0.35, xp: 26
  },
  diver: {
    name: 'Дайвер', icon: '🤿',
    desc: 'Поднимай грузы со дна в порту. Без акваланга не суйся.',
    needVehicle: false, stops: 5, payPerStop: 96, bonus: 240,
    cargo: 'salvage', tool: 'diving', reqLevel: 8, xp: 22
  },
  exterminator: {
    name: 'Дезинсектор', icon: '🪳',
    desc: 'Трави тараканов и мой окна по заказам. До пяти заявок за смену.',
    needVehicle: false, stops: 5, payPerStop: 58, bonus: 150,
    tool: 'sprayer', xp: 12
  },
  dealer: {
    name: 'Перекуп авто', icon: '🚗',
    desc: 'Скупай машины дешевле рынка и перепродавай с наценкой.',
    needVehicle: true, stops: 3, payPerStop: 240, bonus: 520,
    reqCat: 'B', reqLevel: 12, xp: 30
  }
};

/* --- служебные задания организаций попадают в общий список работ --- */
import { FACTIONS } from './factions.js';
for (const f of Object.values(FACTIONS)) {
  for (const d of f.duties) {
    JOBS[d.id] = {
      name: d.name, icon: f.type === 'gang' ? '💀' : '🛡',
      desc: d.desc,
      needVehicle: false, stops: d.stops,
      payPerStop: d.pay, bonus: Math.round(d.pay * 1.4),
      xp: d.xp || 12,
      faction: f.id, minRank: d.rank || 0
    };
  }
}

/* ======================= ЗАДАНИЯ ======================= */
export const QUESTS = [
  {
    id: 'q_start', name: 'Первые шаги',
    desc: 'Освойся в городе: найди магазин и купи что-нибудь поесть.',
    steps: [
      { id: 'buy_food', text: 'Купить любую еду', type: 'buy_cat', cat: 'food' },
      { id: 'eat', text: 'Съесть купленное', type: 'use_cat', cat: 'food' }
    ],
    reward: { money: 150, rep: 3, xp: 10 }
  },
  {
    id: 'q_licence', name: 'Права прежде всего',
    desc: 'Без водительского за руль не пустят. Съезди в автошколу и сдай теорию на категорию B.',
    steps: [
      { id: 'get_licence', text: 'Сдать на права категории B', type: 'licence', cat: 'B' }
    ],
    reward: { money: 500, rep: 4, xp: 25 }
  },
  {
    id: 'q_wheels', name: 'Нужны колёса',
    desc: 'Права есть — теперь за руль. Сядь в любое авто и прокатись.',
    steps: [
      { id: 'enter_car', text: 'Сесть в машину', type: 'enter_vehicle' },
      { id: 'drive', text: 'Проехать 500 метров', type: 'drive_dist', amount: 500 }
    ],
    reward: { money: 300, rep: 5, xp: 20 }
  },
  {
    id: 'q_tuning', name: 'Под капотом',
    desc: 'Загляни в автосервис: поставь любую деталь тюнинга на свою машину.',
    steps: [
      { id: 'buy_tuning', text: 'Установить деталь тюнинга', type: 'tuning' }
    ],
    reward: { money: 900, rep: 6, xp: 35 }
  },
  {
    id: 'q_business', name: 'Своё дело',
    desc: 'Купи бизнес на бирже — он будет приносить выручку каждый игровой час.',
    steps: [
      { id: 'buy_biz', text: 'Купить бизнес', type: 'buy_business' }
    ],
    reward: { money: 2000, rep: 10, xp: 60 }
  },
  {
    id: 'q_job', name: 'Нужна работа',
    desc: 'Деньги с неба не падают. Устройся и выполни любую смену.',
    steps: [
      { id: 'take_job', text: 'Взять любую работу', type: 'job_start' },
      { id: 'finish_job', text: 'Завершить смену', type: 'job_finish' }
    ],
    reward: { money: 500, rep: 8, xp: 35 }
  },
  {
    id: 'q_home', name: 'Свой угол',
    desc: 'Накопи и купи первую недвижимость.',
    steps: [
      { id: 'earn', text: 'Накопить 45 000 $', type: 'money', amount: 45000 },
      { id: 'buy_house', text: 'Купить дом', type: 'buy_house' }
    ],
    reward: { money: 2000, rep: 20, xp: 100 }
  },
  {
    id: 'q_garage', name: 'Гараж не пустует',
    desc: 'Купи собственный транспорт в автосалоне.',
    steps: [
      { id: 'buy_car', text: 'Купить машину', type: 'buy_vehicle' }
    ],
    reward: { money: 800, rep: 10, xp: 50 }
  },
  {
    id: 'q_tour', name: 'Знакомство с городом',
    desc: 'Посети ключевые точки: парк, площадь, мэрию и больницу.',
    steps: [
      { id: 'v_park', text: 'Побывать в парке', type: 'visit', poi: 'park' },
      { id: 'v_plaza', text: 'Побывать на площади', type: 'visit', poi: 'plaza' },
      { id: 'v_hall', text: 'Побывать у мэрии', type: 'visit', poi: 'cityhall' },
      { id: 'v_hosp', text: 'Побывать у больницы', type: 'visit', poi: 'hospital' }
    ],
    reward: { money: 650, rep: 12, xp: 45 }
  }
];

/* --- задания по новым системам --- */
QUESTS.push(
  {
    id: 'q_defend', name: 'Самооборона',
    desc: 'В городе неспокойно. Загляни в оружейный магазин и подготовься.',
    steps: [
      { id: 'buy_gun', text: 'Купить любое оружие', type: 'buy_cat', cat: 'weapon' },
      { id: 'reload', text: 'Зарядить магазин', type: 'reload' },
      { id: 'shoot', text: 'Сделать выстрел', type: 'shoot' }
    ],
    reward: { money: 400, rep: 4, xp: 30 }
  },
  {
    id: 'q_nest', name: 'Обжиться',
    desc: 'Квартира — это не только стены. Обустройся и выспись как человек.',
    steps: [
      { id: 'buy_flat', text: 'Купить жильё', type: 'buy_house' },
      { id: 'go_home', text: 'Зайти домой', type: 'enter_interior', kind: 'home' },
      { id: 'sleep', text: 'Поспать в своей кровати', type: 'sleep' }
    ],
    reward: { money: 1200, rep: 10, xp: 60 }
  }
);

/* ======================= АВТОСАЛОН ======================= */
/* Что реально стоит в автосалоне. Отечественный автопарк — как в Amazing:
   Жигули, Волга, Нива, УАЗ, «Буханка», ГАЗель, КАМАЗ, ОКА, скутер, «Урал». */
export const DEALERSHIP = [
  'oka', 'vaz2107', 'vaz2109', 'vaz2114', 'niva', 'volga', 'uaz', 'buhanka',
  'gazelle', 'kamaz', 'scooter', 'ural',
  'hatch', 'sedan', 'suv', 'pickup', 'van', 'sports', 'truck'
];

/* ======================= ЭКОНОМИКА ======================= */
export const ECONOMY = {
  startMoney: 1200,
  bankStart: 0,
  fuelPricePerL: 2.4,
  repairCostPerPercent: 14,
  hospitalFee: 350,
  taxiFarePerKm: 18,
  inventoryMaxWeight: 45,
  hungerRate: 0.38,     // в минуту
  thirstRate: 0.52,
  energyRate: 0.22,
  levelXp: lvl => 100 + lvl * 85
};

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
  bandage:    { name: 'Бинт',          cat: 'med',    weight: 0.1, price: 12,  health: 18 },
  medkit:     { name: 'Аптечка',       cat: 'med',    weight: 1.0, price: 55,  health: 55 },
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
  hardware:    ['repairkit', 'jerrycan', 'toolbox', 'lockpick'],
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
    desc: 'Объезжай остановки по маршруту.',
    needVehicle: true, stops: 6, payPerStop: 70, bonus: 150,
    reqLicense: 'drive', xp: 18
  }
};

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
    id: 'q_wheels', name: 'Нужны колёса',
    desc: 'Без машины в этом городе тяжело. Сядь за руль любого авто.',
    steps: [
      { id: 'enter_car', text: 'Сесть в машину', type: 'enter_vehicle' },
      { id: 'drive', text: 'Проехать 500 метров', type: 'drive_dist', amount: 500 }
    ],
    reward: { money: 300, rep: 5, xp: 20, license: 'drive' }
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

/* ======================= АВТОСАЛОН ======================= */
export const DEALERSHIP = ['hatch', 'sedan', 'suv', 'pickup', 'van', 'sports', 'truck'];

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

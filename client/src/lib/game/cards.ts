// ============================================================
// NEON ROYALE — определения карт, редкости, экономика
// Общий модуль: клиент и сервер (сервер использует для валидации)
// ============================================================

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CardKind = 'troop' | 'building';
export type Targets = 'any' | 'buildings' | 'ground';

export interface CardDef {
  id: string;
  name: string;
  art: string;            // /art/xxx.jpg
  cost: number;           // эликсир
  rarity: Rarity;
  kind: CardKind;
  admin?: boolean;        // только через промокод (лисы)
  count?: number;         // сколько юнитов спавнится (свара)
  hp: number;
  dmg: number;
  hitSpeed: number;       // сек между ударами
  range: number;          // в тайлах (1 тайл ≈ 1.0)
  speed: number;          // тайлов/сек (0 = здание)
  flying?: boolean;
  targets: Targets;       // кого атакует
  splash?: number;        // радиус сплеша (тайлы)
  heal?: number;          // лечение союзников в радиусе
  slow?: number;          // замедление цели, сек
  ramp?: number;          // рост урона при удержании цели (инферно)
  desc: string;
  shopPrice: number;      // цена покупки в магазине (золото)
}

// Лестница цен улучшений: уровень L -> L+1 (12 уровней роста, дорого)
export const UPGRADE_COSTS = [400, 900, 1800, 3200, 5200, 8000, 11500, 16000, 22000, 30000, 40000, 55000];
export const MAX_LEVEL = 13;

export const CARDS: CardDef[] = [
  // ---------------- ВОЙСКА (15 обычных героев) ----------------
  {
    id: 'skeletons', name: 'Скелеты', art: '/art/card-skeletons.jpg', cost: 1, rarity: 'common',
    kind: 'troop', count: 3, hp: 90, dmg: 42, hitSpeed: 1.0, range: 0.5, speed: 2.2, targets: 'any',
    desc: 'Трое быстрых скелетов с костяными мечами. Дешёвая помеха.', shopPrice: 2000,
  },
  {
    id: 'spear', name: 'Копейщики', art: '/art/card-spear.jpg', cost: 2, rarity: 'common',
    kind: 'troop', count: 3, hp: 130, dmg: 48, hitSpeed: 1.2, range: 5.5, speed: 1.6, targets: 'any',
    desc: 'Трио метателей копий. Бьют издалека по земле и воздуху.', shopPrice: 2500,
  },
  {
    id: 'goblins', name: 'Гоблины', art: '/art/card-goblins.jpg', cost: 2, rarity: 'common',
    kind: 'troop', count: 3, hp: 160, dmg: 65, hitSpeed: 0.9, range: 0.5, speed: 2.4, targets: 'ground',
    desc: 'Трое зелёных забияк с кинжалами. Очень быстрые и злые.', shopPrice: 2500,
  },
  {
    id: 'knight', name: 'Рыцарь', art: '/art/card-knight.jpg', cost: 3, rarity: 'rare',
    kind: 'troop', count: 1, hp: 880, dmg: 105, hitSpeed: 1.2, range: 0.6, speed: 1.4, targets: 'ground',
    desc: 'Крепкий воин в сверкающих доспехах. Надёжный танк.', shopPrice: 4500,
  },
  {
    id: 'archer', name: 'Лучница', art: '/art/card-archer.jpg', cost: 3, rarity: 'rare',
    kind: 'troop', count: 1, hp: 380, dmg: 95, hitSpeed: 1.1, range: 6.0, speed: 1.5, targets: 'any',
    desc: 'Меткая лучница с неоновыми стрелами. Бьёт далеко.', shopPrice: 4500,
  },
  {
    id: 'icewizard', name: 'Ледяной маг', art: '/art/card-icewizard.jpg', cost: 3, rarity: 'rare',
    kind: 'troop', count: 1, hp: 380, dmg: 82, hitSpeed: 1.5, range: 5.5, speed: 1.3, targets: 'any',
    splash: 1.6, slow: 2.0,
    desc: 'Замораживает врагов: урон по площади и замедление на 2 сек.', shopPrice: 6000,
  },
  {
    id: 'miner', name: 'Шахтёр', art: '/art/card-miner.jpg', cost: 3, rarity: 'rare',
    kind: 'troop', count: 1, hp: 620, dmg: 105, hitSpeed: 1.1, range: 0.5, speed: 2.2, targets: 'ground',
    desc: 'Копает туннель и появляется в любой точке арены.', shopPrice: 6000, // особый спавн
  },
  {
    id: 'berserk', name: 'Берсерк', art: '/art/card-berserk.jpg', cost: 4, rarity: 'rare',
    kind: 'troop', count: 1, hp: 620, dmg: 185, hitSpeed: 0.8, range: 0.6, speed: 2.0, targets: 'ground',
    desc: 'Ярость в чистом виде: молниеносные удары двойными клинками.', shopPrice: 6000,
  },
  {
    id: 'valkyrie', name: 'Валькирия', art: '/art/card-valkyrie.jpg', cost: 4, rarity: 'epic',
    kind: 'troop', count: 1, hp: 1080, dmg: 145, hitSpeed: 1.5, range: 0.8, speed: 1.5, targets: 'ground',
    splash: 1.4,
    desc: 'Круговой удар гигантским топором. Сметает свары.', shopPrice: 9500,
  },
  {
    id: 'dragon', name: 'Дракон', art: '/art/card-dragon.jpg', cost: 4, rarity: 'epic',
    kind: 'troop', count: 1, hp: 900, dmg: 120, hitSpeed: 1.5, range: 3.2, speed: 1.6, flying: true, targets: 'any',
    splash: 1.3,
    desc: 'Летающий дракончик с огненным плевком по площади.', shopPrice: 9500,
  },
  {
    id: 'healer', name: 'Жрица', art: '/art/card-healer.jpg', cost: 4, rarity: 'epic',
    kind: 'troop', count: 1, hp: 750, dmg: 70, hitSpeed: 1.4, range: 5.0, speed: 1.4, targets: 'ground',
    heal: 65, splash: 2.6,
    desc: 'Исцеляет союзных воинов рядом с собой. Держит атаку живой.', shopPrice: 9500,
  },
  {
    id: 'mage', name: 'Магистр', art: '/art/card-mage.jpg', cost: 5, rarity: 'epic',
    kind: 'troop', count: 1, hp: 660, dmg: 170, hitSpeed: 1.6, range: 5.5, speed: 1.3, targets: 'any',
    splash: 1.7,
    desc: 'Фиолетовые шары взрываются по площади. Гроза свары.', shopPrice: 12000,
  },
  {
    id: 'giant', name: 'Гигант', art: '/art/card-giant.jpg', cost: 5, rarity: 'epic',
    kind: 'troop', count: 1, hp: 3200, dmg: 220, hitSpeed: 1.7, range: 0.8, speed: 1.0, targets: 'buildings',
    desc: 'Медленный колосс. Идёт только к постройкам и башням.', shopPrice: 12000,
  },
  {
    id: 'titan', name: 'Титан', art: '/art/card-titan.jpg', cost: 6, rarity: 'legendary',
    kind: 'troop', count: 1, hp: 4200, dmg: 260, hitSpeed: 1.8, range: 0.9, speed: 0.9, targets: 'ground',
    desc: 'Ходячая гора мускулов. Разносит всё на своём пути.', shopPrice: 18000,
  },
  {
    id: 'hound', name: 'Лавовая гончая', art: '/art/card-hound.jpg', cost: 7, rarity: 'legendary',
    kind: 'troop', count: 1, hp: 3400, dmg: 110, hitSpeed: 1.6, range: 2.5, speed: 1.0, flying: true, targets: 'buildings',
    desc: 'Летающая гончая из лавы. Летит прямо к башням.', shopPrice: 20000,
  },
  // ---------------- ЛИСЫ (только промокод администратора) ----------------
  {
    id: 'foxalpha', name: 'Лис-Альфа', art: '/art/card-fox_alpha.jpg', cost: 5, rarity: 'legendary',
    kind: 'troop', count: 1, hp: 1500, dmg: 165, hitSpeed: 0.9, range: 0.7, speed: 2.1, targets: 'ground',
    admin: true,
    desc: 'Вожак лисьей стаи: быстрый, злой и неуязвимый для паники.', shopPrice: 0,
  },
  {
    id: 'foxpack', name: 'Лисья стая', art: '/art/card-fox_pack.jpg', cost: 3, rarity: 'legendary',
    kind: 'troop', count: 4, hp: 280, dmg: 78, hitSpeed: 0.9, range: 0.5, speed: 2.5, targets: 'ground',
    admin: true,
    desc: 'Четыре лисёнка растерзают любую цель за секунды.', shopPrice: 0,
  },
  {
    id: 'foxflame', name: 'Огненная лиса', art: '/art/card-fox_flame.jpg', cost: 4, rarity: 'legendary',
    kind: 'troop', count: 1, hp: 720, dmg: 130, hitSpeed: 1.4, range: 5.0, speed: 1.6, targets: 'any',
    splash: 1.5, admin: true,
    desc: 'Плюёт огненными шарами по площади. Хвост горит — значит довольна.', shopPrice: 0,
  },
  {
    id: 'foxveteran', name: 'Лис-ветеран', art: '/art/card-fox_veteran.jpg', cost: 6, rarity: 'legendary',
    kind: 'troop', count: 1, hp: 2100, dmg: 200, hitSpeed: 1.2, range: 0.9, speed: 1.5, targets: 'ground',
    admin: true,
    desc: 'Шрамированный ветеран стаи. Живучий и смертельно точный.', shopPrice: 0,
  },
  // ---------------- БАШНИ (здания, продаются в магазине) ----------------
  {
    id: 'cannon', name: 'Катапульта', art: '/art/card-cannon.jpg', cost: 3, rarity: 'common',
    kind: 'building', count: 1, hp: 950, dmg: 90, hitSpeed: 1.5, range: 7.0, speed: 0, targets: 'ground',
    desc: 'Стартовая башня: швыряет камни по наземным целям.', shopPrice: 0,
  },
  {
    id: 'mortar', name: 'Мортира', art: '/art/card-mortar.jpg', cost: 4, rarity: 'rare',
    kind: 'building', count: 1, hp: 900, dmg: 130, hitSpeed: 4.5, range: 10.0, speed: 0, targets: 'ground',
    splash: 1.8,
    desc: 'Бьёт через полполя навесным огнём. Не видит близкие цели.', shopPrice: 6000,
  },
  {
    id: 'tesla', name: 'Тесла', art: '/art/card-tesla.jpg', cost: 4, rarity: 'rare',
    kind: 'building', count: 1, hp: 900, dmg: 115, hitSpeed: 1.1, range: 5.5, speed: 0, targets: 'any',
    slow: 0.5,
    desc: 'Разряды молний по земле и воздуху. Жалит быстро.', shopPrice: 6500,
  },
  {
    id: 'xbow', name: 'Арбалет', art: '/art/card-xbow.jpg', cost: 5, rarity: 'epic',
    kind: 'building', count: 1, hp: 1050, dmg: 55, hitSpeed: 0.45, range: 11.5, speed: 0, targets: 'ground',
    desc: 'Скорострельная осадная машина. Строчит через всю арену.', shopPrice: 12000,
  },
  {
    id: 'inferno', name: 'Инферно', art: '/art/card-inferno.jpg', cost: 6, rarity: 'legendary',
    kind: 'building', count: 1, hp: 900, dmg: 25, hitSpeed: 0.35, range: 6.0, speed: 0, targets: 'any',
    ramp: 55,
    desc: 'Луч раскаляется: чем дольше держит цель, тем больнее.', shopPrice: 18000,
  },
  {
    id: 'foxden', name: 'Лисья берлога', art: '/art/card-foxden.jpg', cost: 5, rarity: 'legendary',
    kind: 'building', count: 1, hp: 1300, dmg: 135, hitSpeed: 1.2, range: 6.5, speed: 0, targets: 'any',
    splash: 1.2, admin: true,
    desc: 'Тайная берлога лисьего клана. Плюётся янтарной магией.', shopPrice: 0,
  },
];

export const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map(c => [c.id, c]));

export function cardsOfRarity(r: Rarity): CardDef[] {
  return CARDS.filter(c => c.rarity === r && !c.admin);
}

export function shopCards(): CardDef[] {
  return CARDS.filter(c => !c.admin && c.shopPrice > 0);
}

export function heroCards(): CardDef[] {
  return CARDS.filter(c => c.kind === 'troop');
}

export function towerCards(): CardDef[] {
  return CARDS.filter(c => c.kind === 'building');
}

// Стартовая колода (бесплатно каждому игроку)
export const STARTER_DECK = ['skeletons', 'spear', 'goblins', 'knight', 'archer', 'icewizard', 'cannon', 'mage'];

// ---------------- Арены по трофеям ----------------
export interface Arena { min: number; name: string }
export const ARENAS: Arena[] = [
  { min: 0, name: 'Гнездо гоблинов' },
  { min: 300, name: 'Костяная яма' },
  { min: 600, name: 'Неоновый дол' },
  { min: 1000, name: 'Кристальный пик' },
  { min: 1500, name: 'Лавовый кратер' },
  { min: 2200, name: 'Небесная арена' },
  { min: 3000, name: 'Лисья легенда' },
];

export function arenaByTrophies(t: number): Arena {
  let a = ARENAS[0];
  for (const x of ARENAS) if (t >= x.min) a = x;
  return a;
}

// ---------------- Экономика боя ----------------
export const REWARD_WIN_GOLD = 160;
export const REWARD_LOSE_GOLD = 55;
export const REWARD_DRAW_GOLD = 90;
export const TROPHY_WIN = 30;
export const TROPHY_LOSE = 22;
export const START_GOLD = 1200;

// Уровень карты усиливает статы: каждый уровень +8% hp и урона
export function levelMult(level: number): number {
  return 1 + (level - 1) * 0.08;
}

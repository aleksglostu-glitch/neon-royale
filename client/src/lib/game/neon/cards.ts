/**
 * NEON ROYALE — карточки (восстановлено из сборки + расширено).
 * Общий модуль клиента и сервера.
 */

export type Targets = 'any' | 'towers'
export type Unlock = 'start' | 'shop' | 'fox'
export type Weapon = 'sword' | 'bow' | 'staff' | 'axe' | 'claw' | 'spear' | 'hammer' | 'flame'

export interface CardDef {
  id: string
  name: string
  emoji: string
  /** Стоимость в эликсире */
  cost: number
  /** Сколько юнитов появляется */
  count: number
  hp: number
  dmg: number
  hitSpeed: number
  /** Дальность атаки в тайлах */
  range: number
  /** Скорость, тайлов/сек */
  speed: number
  targets: Targets
  unlock: Unlock
  /** Цена в магазине (золото) */
  shopPrice?: number
  desc: string
  color: string
  /** Радиус юнита */
  size: number
  /** Радиус урона по площади */
  splash?: number
  /** Замедление цели, сек */
  slow?: number
  /** Карта-башня (строение): не двигается, живёт ограниченное время */
  build?: boolean
  /** Время жизни строения, сек */
  life?: number
  /** Тип оружия для отрисовки модели */
  weapon?: Weapon
  /** Редкость для оформления карточки */
  rarity?: 'common' | 'rare' | 'epic' | 'legend' | 'fox'
}

/** Герои и строения. Цены и апгрейды заметно подняты (дорогая экономика). */
export const CARDS: CardDef[] = [
  // ---------- Стартовые герои ----------
  { id: 'knight', name: 'Мечник', emoji: '⚔️', cost: 3, count: 1, hp: 700, dmg: 100, hitSpeed: 1.1, range: 0.8, speed: 1.5, targets: 'any', unlock: 'start', desc: 'Надёжный воин в неоновой броне', color: '#67e8f9', size: 0.45, weapon: 'sword', rarity: 'common' },
  { id: 'archer', name: 'Лучница', emoji: '🏹', cost: 3, count: 1, hp: 320, dmg: 70, hitSpeed: 0.9, range: 4.5, speed: 1.5, targets: 'any', unlock: 'start', desc: 'Бьёт далеко, но хрупкая', color: '#a7f3d0', size: 0.4, weapon: 'bow', rarity: 'common' },
  { id: 'goblins', name: 'Нео-гоблины', emoji: '🔪', cost: 2, count: 3, hp: 150, dmg: 55, hitSpeed: 0.7, range: 0.6, speed: 2.7, targets: 'any', unlock: 'start', desc: 'Трое быстрых и злых', color: '#bef264', size: 0.32, weapon: 'claw', rarity: 'common' },
  { id: 'spear', name: 'Копейщики', emoji: '🗡️', cost: 2, count: 2, hp: 180, dmg: 42, hitSpeed: 1, range: 4, speed: 1.7, targets: 'any', unlock: 'start', desc: 'Двое метких копейщиков', color: '#fde68a', size: 0.34, weapon: 'spear', rarity: 'common' },
  { id: 'giant', name: 'Нео-голем', emoji: '🗿', cost: 5, count: 1, hp: 2500, dmg: 135, hitSpeed: 1.5, range: 0.9, speed: 0.9, targets: 'towers', unlock: 'start', desc: 'Танк: идёт только на башни', color: '#f0abfc', size: 0.62, weapon: 'hammer', rarity: 'rare' },
  { id: 'mage', name: 'Магистр', emoji: '🔮', cost: 4, count: 1, hp: 400, dmg: 125, hitSpeed: 1.4, range: 4.5, speed: 1.3, splash: 1.4, targets: 'any', unlock: 'start', desc: 'Урон по площади', color: '#c4b5fd', size: 0.42, weapon: 'staff', rarity: 'rare' },
  { id: 'berserk', name: 'Берсерк', emoji: '🪓', cost: 4, count: 1, hp: 950, dmg: 155, hitSpeed: 0.9, range: 0.8, speed: 1.9, targets: 'any', unlock: 'start', desc: 'Быстрый и злой рубака', color: '#fca5a5', size: 0.46, weapon: 'axe', rarity: 'common' },
  { id: 'cannon', name: 'Катапульта', emoji: '🎯', cost: 6, count: 1, hp: 750, dmg: 210, hitSpeed: 2.2, range: 7.5, speed: 0.8, splash: 1.2, targets: 'towers', unlock: 'start', desc: 'Дальнобойный осадный снаряд', color: '#fdba74', size: 0.55, weapon: 'hammer', rarity: 'rare' },
  // ---------- Герои из магазина (цены подняты) ----------
  { id: 'valkyrie', name: 'Валькирия', emoji: '🌀', cost: 4, count: 1, hp: 1600, dmg: 180, hitSpeed: 1.5, range: 0.9, speed: 1.7, splash: 1.3, targets: 'any', unlock: 'shop', shopPrice: 2800, desc: 'Круговой удар по всей свите', color: '#f9a8d4', size: 0.5, weapon: 'axe', rarity: 'rare' },
  { id: 'musketeer', name: 'Мушкетёр', emoji: '🔫', cost: 4, count: 1, hp: 640, dmg: 230, hitSpeed: 1.1, range: 6, speed: 1.4, targets: 'any', unlock: 'shop', shopPrice: 2400, desc: 'Дальняя точная стрельба', color: '#93c5fd', size: 0.42, weapon: 'bow', rarity: 'rare' },
  { id: 'dragon', name: 'Нео-дракон', emoji: '🐉', cost: 5, count: 1, hp: 900, dmg: 135, hitSpeed: 1.3, range: 4, speed: 1.6, splash: 1.3, targets: 'any', unlock: 'shop', shopPrice: 3600, desc: 'Пламя по площади', color: '#7dd3fc', size: 0.55, weapon: 'flame', rarity: 'epic' },
  { id: 'minipekka', name: 'Мини-ПЕКА', emoji: '🤖', cost: 4, count: 1, hp: 1250, dmg: 560, hitSpeed: 1.8, range: 0.8, speed: 2, targets: 'any', unlock: 'shop', shopPrice: 4200, desc: 'Сносит танки за секунды', color: '#e2e8f0', size: 0.46, weapon: 'sword', rarity: 'epic' },
  { id: 'assassin', name: 'Тень', emoji: '🌑', cost: 3, count: 1, hp: 700, dmg: 240, hitSpeed: 0.8, range: 0.7, speed: 3.1, targets: 'any', unlock: 'shop', shopPrice: 5200, desc: 'Молниеносный убийца', color: '#818cf8', size: 0.4, weapon: 'claw', rarity: 'epic' },
  { id: 'pyro', name: 'Пиромант', emoji: '🔥', cost: 5, count: 1, hp: 520, dmg: 200, hitSpeed: 1.5, range: 4.8, speed: 1.3, splash: 1.6, targets: 'any', unlock: 'shop', shopPrice: 6400, desc: 'Огненные шары по толпе', color: '#fb923c', size: 0.44, weapon: 'staff', rarity: 'epic' },
  { id: 'ice_mage', name: 'Ледяной маг', emoji: '❄️', cost: 3, count: 1, hp: 560, dmg: 95, hitSpeed: 1.6, range: 4.5, speed: 1.3, splash: 1.2, slow: 1.4, targets: 'any', unlock: 'shop', shopPrice: 7600, desc: 'Замораживает атакующих', color: '#a5f3fc', size: 0.42, weapon: 'staff', rarity: 'legend' },
  { id: 'stone_guard', name: 'Каменный страж', emoji: '🪨', cost: 6, count: 1, hp: 3000, dmg: 150, hitSpeed: 1.7, range: 0.9, speed: 0.7, targets: 'towers', unlock: 'shop', shopPrice: 8800, desc: 'Ходячая скала против башен', color: '#94a3b8', size: 0.66, weapon: 'hammer', rarity: 'legend' },
  { id: 'titan', name: 'Титан', emoji: '👑', cost: 7, count: 1, hp: 3600, dmg: 190, hitSpeed: 1.6, range: 0.9, speed: 0.8, targets: 'towers', unlock: 'shop', shopPrice: 12000, desc: 'Ходячая крепость', color: '#fbbf24', size: 0.7, weapon: 'hammer', rarity: 'legend' },
  // ---------- Карточки-башни (строения) ----------
  { id: 'turret', name: 'Нео-турель', emoji: '🗼', cost: 4, count: 1, hp: 900, dmg: 90, hitSpeed: 0.9, range: 5.5, speed: 0, targets: 'any', unlock: 'shop', shopPrice: 2400, desc: 'Строение: защищает свою зону 30 сек', color: '#38bdf8', size: 0.5, build: true, life: 30, rarity: 'rare' },
  { id: 'flame_tower', name: 'Огненная башня', emoji: '🔥', cost: 4, count: 1, hp: 1000, dmg: 100, hitSpeed: 1.2, range: 5, speed: 0, splash: 1.5, targets: 'any', unlock: 'shop', shopPrice: 3600, desc: 'Строение: пламя по площади', color: '#f97316', size: 0.5, build: true, life: 30, rarity: 'epic' },
  { id: 'frost_tower', name: 'Ледяная башня', emoji: '🧊', cost: 3, count: 1, hp: 950, dmg: 70, hitSpeed: 1.3, range: 5, speed: 0, slow: 1.2, targets: 'any', unlock: 'shop', shopPrice: 4400, desc: 'Строение: ледяные залпы с замедлением', color: '#7dd3fc', size: 0.5, build: true, life: 30, rarity: 'epic' },
  { id: 'tesla', name: 'Тесла', emoji: '⚡', cost: 4, count: 1, hp: 900, dmg: 160, hitSpeed: 1, range: 5.5, speed: 0, targets: 'any', unlock: 'shop', shopPrice: 5600, desc: 'Строение: разряды молний', color: '#facc15', size: 0.48, build: true, life: 30, rarity: 'legend' },
  // ---------- Лисьи карты (только через админ-промокод) ----------
  { id: 'fox_veteran', name: 'Лис-матёрый', emoji: '🦊', cost: 3, count: 1, hp: 750, dmg: 115, hitSpeed: 1, range: 0.7, speed: 2.2, targets: 'any', unlock: 'fox', desc: 'Хитрый и быстрый воин лисьего клана', color: '#fb923c', size: 0.44, weapon: 'claw', rarity: 'fox' },
  { id: 'fox_flame', name: 'Огненная лиса', emoji: '🔥', cost: 4, count: 1, hp: 450, dmg: 115, hitSpeed: 1.2, range: 4.2, speed: 1.5, splash: 1.2, targets: 'any', unlock: 'fox', desc: 'Лисье пламя выжигает толпы', color: '#f97316', size: 0.44, weapon: 'flame', rarity: 'fox' },
  { id: 'fox_alpha', name: 'Лисий вожак', emoji: '👑', cost: 6, count: 2, hp: 1600, dmg: 165, hitSpeed: 1.2, range: 0.8, speed: 1.8, targets: 'any', unlock: 'fox', desc: 'Двое элитных вожаков стаи', color: '#fdba74', size: 0.56, weapon: 'sword', rarity: 'fox' },
  { id: 'fox_pack', name: 'Лисий выводок', emoji: '🐾', cost: 2, count: 4, hp: 140, dmg: 52, hitSpeed: 0.7, range: 0.6, speed: 2.8, targets: 'any', unlock: 'fox', desc: 'Четверо шустрых лисят', color: '#fed7aa', size: 0.3, weapon: 'claw', rarity: 'fox' },
  { id: 'fox_tower', name: 'Лисья нора', emoji: '🦊', cost: 4, count: 1, hp: 1400, dmg: 210, hitSpeed: 0.9, range: 6, speed: 0, splash: 1.4, slow: 1, targets: 'any', unlock: 'fox', desc: 'Секретное строение лисьего клана', color: '#fb923c', size: 0.52, build: true, life: 35, rarity: 'fox' },
]

export const CARD_MAP: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]))

export function card(id: string): CardDef | null {
  return CARD_MAP[id] ?? null
}

/** Дефолтная колода (стартовые 8) */
export const DEFAULT_DECK: string[] = ['knight', 'archer', 'goblins', 'spear', 'giant', 'mage', 'berserk', 'cannon']

/** Пул ботов: стартовые + часть магазинных (боты тоже играют героями и строениями) */
export const BOT_POOL: string[] = [
  'knight', 'archer', 'goblins', 'spear', 'giant', 'mage', 'berserk', 'cannon',
  'valkyrie', 'musketeer', 'dragon', 'minipekka', 'turret', 'flame_tower',
]

/** Дорогие апгрейды карт: уровень 2,3,4,5 (индекс = текущий уровень - 1) */
export const UPGRADE_COSTS: number[] = [800, 2000, 6000, 16000]
/** Дорогие уровни башен: 2,3,4,5 */
export const TOWER_LEVEL_COSTS: number[] = [1200, 3000, 8000, 20000]

export const MAX_CARD_LEVEL = 5
export const MAX_TOWER_LEVEL = 5

/** Множитель характеристик от уровня карты */
export function levelMult(level: number): number {
  return 1 + 0.1 * (Math.max(1, Math.min(MAX_CARD_LEVEL, level)) - 1)
}

/** Стоимость следующего уровня карты (0 — нельзя) */
export function nextUpgradeCost(level: number): number {
  if (level >= MAX_CARD_LEVEL) return 0
  return UPGRADE_COSTS[level - 1]
}

/** Арт карточек */
export const CARD_ART: Record<string, string> = {
  knight: '/art/card-knight.jpg',
  archer: '/art/card-archer.jpg',
  goblins: '/art/card-goblins.jpg',
  spear: '/art/card-spear.jpg',
  giant: '/art/card-giant.jpg',
  mage: '/art/card-mage.jpg',
  berserk: '/art/card-berserk.jpg',
  cannon: '/art/card-cannon.jpg',
  dragon: '/art/card-dragon.jpg',
  titan: '/art/card-titan.jpg',
  fox_veteran: '/art/card-fox_veteran.jpg',
  fox_flame: '/art/card-fox_flame.jpg',
  fox_alpha: '/art/card-fox_alpha.jpg',
  fox_pack: '/art/card-fox_pack.jpg',
  valkyrie: '/art/card-valkyrie.jpg',
  musketeer: '/art/card-musketeer.jpg',
  minipekka: '/art/card-minipekka.jpg',
  assassin: '/art/card-assassin.jpg',
  pyro: '/art/card-pyro.jpg',
  ice_mage: '/art/card-ice_mage.jpg',
  stone_guard: '/art/card-stone_guard.jpg',
  turret: '/art/card-turret.jpg',
  flame_tower: '/art/card-flame_tower.jpg',
  frost_tower: '/art/card-frost_tower.jpg',
  tesla: '/art/card-tesla.jpg',
  fox_tower: '/art/card-fox_tower.jpg',
}

export function artOf(id: string): string {
  return CARD_ART[id] ?? ''
}

/** Проверка, что колода валидна: 8 уникальных карт, все есть у игрока */
export function validDeck(deck: string[], owned: Record<string, number>): boolean {
  return (
    deck.length === 8 &&
    new Set(deck).size === 8 &&
    deck.every((id) => CARD_MAP[id] && owned[id])
  )
}

// ---------- Скины башен (магазин + трофеи; лисий — только промокод) ----------
export interface TowerSkin {
  id: string
  name: string
  /** Трофеи для автооткрытия (-1 = только промокод) */
  unlockTrophies: number
  /** Цена в золоте в магазине (0 = стартовая) */
  price: number
  desc: string
  body: string
  bodyDark: string
  accent: string
  roof: 'stone' | 'ice' | 'arcane' | 'gold' | 'ember' | 'shadow' | 'fox'
  fox?: boolean
}

export const TOWER_SKINS: TowerSkin[] = [
  { id: 'stone', name: 'Каменная стража', unlockTrophies: 0, price: 0, desc: 'Проверенная классика неоновой арены', body: '#5b6478', bodyDark: '#2e3444', accent: '#22d3ee', roof: 'stone' },
  { id: 'ice', name: 'Ледяная цитадель', unlockTrophies: 150, price: 3000, desc: 'Кристаллы вечной мерзлоты', body: '#4d7ea3', bodyDark: '#24405a', accent: '#7dd3fc', roof: 'ice' },
  { id: 'arcane', name: 'Неоновый маяк', unlockTrophies: 350, price: 6000, desc: 'Свет, что режет тьму', body: '#514a85', bodyDark: '#2a2450', accent: '#c084fc', roof: 'arcane' },
  { id: 'gold', name: 'Золотой трон', unlockTrophies: 600, price: 10000, desc: 'Блеск настоящих королей', body: '#96742a', bodyDark: '#4d3a10', accent: '#fbbf24', roof: 'gold' },
  { id: 'ember', name: 'Пламенный редут', unlockTrophies: 900, price: 15000, desc: 'Жар, плавящий камень', body: '#8a4220', bodyDark: '#451a08', accent: '#fb923c', roof: 'ember' },
  { id: 'shadow', name: 'Теневая твердыня', unlockTrophies: 1300, price: 22000, desc: 'Крепость из глубин пустоты', body: '#3a3a52', bodyDark: '#16161f', accent: '#818cf8', roof: 'shadow' },
  { id: 'foxtower', name: 'Лисье логово', unlockTrophies: -1, price: 0, desc: 'Секретная башня лисьего клана', body: '#8a3d12', bodyDark: '#4a2008', accent: '#fb923c', roof: 'fox', fox: true },
]

export const TOWER_SKIN_MAP: Record<string, TowerSkin> = Object.fromEntries(TOWER_SKINS.map((s) => [s.id, s]))

export function towerSkin(id: string): TowerSkin {
  return TOWER_SKIN_MAP[id] ?? TOWER_SKINS[0]
}

/** Башня открыта: трофеями, золотом или лисьим доступом (для витрины/покупки) */
export function towerUnlocked(s: TowerSkin, trophies: number, isFox: boolean, gold = 0): boolean {
  if (s.fox) return isFox
  if (s.unlockTrophies >= 0 && trophies >= s.unlockTrophies) return true
  if (s.price > 0 && gold >= s.price) return true
  return false
}

/** Башня ПОКУПАЕТСЯ/ВЫБИРАЕТСЯ игроком (владение, без «хватает золота») */
export function towerOwned(s: TowerSkin, trophies: number, isFox: boolean, skins: string[] | undefined): boolean {
  if (s.fox) return isFox
  if (s.price === 0) return true
  if (skins && skins.includes(s.id)) return true
  if (s.unlockTrophies >= 0 && trophies >= s.unlockTrophies) return true
  return false
}

// ---------- Арена и константы боя ----------
export const ARENA = {
  /** Границы поля */
  xMin: -8.6, xMax: 8.6, yMin: -15.6, yMax: 15.6,
  /** Зона выкладки карт (свой бок — положительный y для стороны 0) */
  dMin: 1.7, dMax: 15.2, dxMax: 8.2,
  /** Мосты */
  bridges: [-4.5, 4.5] as number[],
  riverHalf: 0.48,
}

export const MATCH_DURATION = 180
export const OVERTIME_HINT = 60
export const ELIXIR_MAX = 10
export const ELIXIR_START = 5
export const ELIXIR_RATE = 1 / 2.8
export const HAND_SIZE = 4

export function inDeployZone(side: 0 | 1, x: number, y: number): boolean {
  if (Math.abs(x) > ARENA.dxMax) return false
  return side === 0 ? y >= ARENA.dMin && y <= ARENA.dMax : y <= -ARENA.dMin && y >= -ARENA.dMax
}

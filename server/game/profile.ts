/**
 * NEON ROYALE — профиль игрока (localStorage) + локальные промокоды.
 * Онлайн-версия профиля живёт на сервере; локальная — запасной режим без сети.
 */
import { CARDS, DEFAULT_DECK, TOWER_SKINS, validDeck } from './cards'

export interface Profile {
  uid: string
  nick: string
  gold: number
  trophies: number
  wins: number
  losses: number
  draws: number
  /** Уровни карт: id → 1..5 */
  cards: Record<string, number>
  /** Колода из 8 карт */
  deck: string[]
  towerLevel: number
  towerSkin: string
  isFox: boolean
  promoUsed: string[]
  vkBonus: boolean
  createdAt: number
  /** Купленные скины башен (магазин) */
  skins?: string[]
}

const P_KEY = 'nr-profile'
const UID_KEY = 'nr-uid'
const NICK_KEY = 'nr-nick'
const COSM_KEY = 'nr-cosmetics'

export interface Cosmetics {
  selectedTower: string
  history: { t: number; outcome: string; myCrowns: number; foeCrowns: number; foe: string; isBot: boolean; gold: number; trophies: number }[]
}

export function uid(): string {
  if (typeof window === 'undefined') return 'local'
  let u = localStorage.getItem(UID_KEY)
  if (!u) {
    u = crypto.randomUUID?.() ?? `u-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
    localStorage.setItem(UID_KEY, u)
  }
  return u
}

export function loadNick(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(NICK_KEY) || ''
}

export function saveNick(nick: string) {
  try {
    localStorage.setItem(NICK_KEY, nick)
  } catch {}
}

export function defaultCosmetics(): Cosmetics {
  return { selectedTower: TOWER_SKINS[0].id, history: [] }
}

export function loadCosmetics(): Cosmetics {
  try {
    const raw = localStorage.getItem(COSM_KEY)
    if (!raw) return defaultCosmetics()
    return { ...defaultCosmetics(), ...JSON.parse(raw) }
  } catch {
    return defaultCosmetics()
  }
}

export function saveCosmetics(c: Cosmetics) {
  try {
    localStorage.setItem(COSM_KEY, JSON.stringify(c))
  } catch {}
}

export function defaultProfile(): Profile {
  const cards: Record<string, number> = {}
  for (const id of DEFAULT_DECK) cards[id] = 1
  return {
    uid: 'local',
    nick: loadNick() || 'Командир',
    gold: 300,
    trophies: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    cards,
    deck: [...DEFAULT_DECK],
    towerLevel: 1,
    towerSkin: TOWER_SKINS[0].id,
    isFox: false,
    promoUsed: [],
    vkBonus: false,
    createdAt: Date.now(),
  }
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(P_KEY)
    if (!raw) return defaultProfile()
    const p = { ...defaultProfile(), ...JSON.parse(raw), uid: 'local' } as Profile
    if (!Array.isArray(p.deck) || !validDeck(p.deck, p.cards)) p.deck = [...DEFAULT_DECK]
    return p
  } catch {
    return defaultProfile()
  }
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(P_KEY, JSON.stringify(p))
  } catch {}
}

// ---------- Локальные промокоды (fallback без сети; онлайн проверяет сервер) ----------
/** Простой код из XOR-90 (как в сборке) — проверяется на сервере */
function x90(arr: number[]): string {
  return arr.map((n) => String.fromCharCode(90 ^ n)).join('')
}

export interface LocalPromo {
  code: string
  gold: number
  label: string
}

export const LOCAL_PROMOS: LocalPromo[] = [
  { code: x90([20, 31, 21, 20, 9, 14, 27, 8, 14]), gold: 500, label: 'Стартовый неон' },
  { code: x90([8, 21, 3, 27, 22, 31]), gold: 777, label: 'Рояль-бонус' },
]

export function localPromoCheck(code: string): LocalPromo | null {
  const c = code.trim().toUpperCase()
  return LOCAL_PROMOS.find((p) => p.code === c) ?? null
}

/** Все карты, которые продаются в магазине */
export function shopCards() {
  return CARDS.filter((c) => c.unlock === 'shop')
}

/** Нормализация ника: 2-16 символов */
export function normalizeNick(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 16)
}

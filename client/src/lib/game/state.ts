// ============================================================
// NEON ROYALE — профиль игрока: экономика, колода, промокод.
// Хранение: localStorage (id игрока стабилен между запусками).
// ============================================================
import { CARDS, STARTER_DECK, START_GOLD, MAX_LEVEL, UPGRADE_COSTS, CARD_BY_ID } from './cards';

const KEY = 'neon-royale-profile-v1';

export interface Profile {
  playerId: string;              // стабильный uuid
  nick: string;
  gold: number;
  trophies: number;
  wins: number;
  losses: number;
  deck: string[];                // 8 карт
  owned: Record<string, number>; // cardId -> уровень (1..13)
  foxUnlocked: boolean;          // промокод администратора
  sound: boolean;
  createdAt: number;
}

export function loadProfile(): Profile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Profile;
    if (!p.playerId || !p.nick) return null;
    return p;
  } catch { return null; }
}

export function saveProfile(p: Profile) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

export function createProfile(nick: string): Profile {
  const owned: Record<string, number> = {};
  for (const id of STARTER_DECK) owned[id] = 1;
  return {
    playerId: genId(),
    nick,
    gold: START_GOLD,
    trophies: 0,
    wins: 0,
    losses: 0,
    deck: [...STARTER_DECK],
    owned,
    foxUnlocked: false,
    sound: true,
    createdAt: Date.now(),
  };
}

export function genId(): string {
  const a = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 12; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- экономика ---
export function canBuy(p: Profile, cardId: string): boolean {
  const c = CARD_BY_ID[cardId];
  if (!c || c.admin) return false;
  if (p.owned[cardId]) return false;
  return p.gold >= c.shopPrice;
}

export function buyCard(p: Profile, cardId: string): { ok: boolean; msg: string } {
  const c = CARD_BY_ID[cardId];
  if (!c || c.admin) return { ok: false, msg: 'Недоступно' };
  if (p.owned[cardId]) return { ok: false, msg: 'Уже открыто' };
  if (p.gold < c.shopPrice) return { ok: false, msg: 'Не хватает золота' };
  p.gold -= c.shopPrice;
  p.owned[cardId] = 1;
  if (p.deck.length < 8) p.deck.push(cardId);
  saveProfile(p);
  return { ok: true, msg: `${c.name} открыта!` };
}

export function upgradeCost(level: number): number | null {
  if (level >= MAX_LEVEL) return null;
  return UPGRADE_COSTS[level - 1];
}

export function upgradeCard(p: Profile, cardId: string): { ok: boolean; msg: string } {
  const lvl = p.owned[cardId];
  if (!lvl) return { ok: false, msg: 'Карта не открыта' };
  const cost = upgradeCost(lvl);
  if (cost === null) return { ok: false, msg: 'Максимальный уровень' };
  if (p.gold < cost) return { ok: false, msg: 'Не хватает золота' };
  p.gold -= cost;
  p.owned[cardId] = lvl + 1;
  saveProfile(p);
  return { ok: true, msg: `Уровень ${lvl + 1}!` };
}

export function setDeck(p: Profile, deck: string[]): boolean {
  if (deck.length !== 8) return false;
  const uniq = new Set(deck);
  if (uniq.size !== 8) return false;
  for (const id of deck) {
    if (!p.owned[id]) return false;
    if (CARD_BY_ID[id]?.admin && !p.foxUnlocked) return false;
  }
  p.deck = [...deck];
  saveProfile(p);
  return true;
}

// уровни карт для движка
export function levelsOf(p: Profile): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of p.deck) out[id] = p.owned[id] ?? 1;
  return out;
}

// --- промокод (проверка кода — на сервере; локально только флаг) ---
export function applyFoxUnlock(p: Profile) {
  p.foxUnlocked = true;
  for (const c of CARDS.filter(x => x.admin)) {
    if (!p.owned[c.id]) p.owned[c.id] = 1;
  }
  saveProfile(p);
}

export function totalCards(p: Profile): number {
  return Object.keys(p.owned).length;
}

export function collectionPower(p: Profile): number {
  return Object.entries(p.owned).reduce((s, [id, lvl]) => s + (CARD_BY_ID[id]?.cost ?? 0) * lvl, 0);
}

// валидация ника (2..16 символов, без мата — простой фильтр)
const BAD_WORDS = ['сука', 'блять', 'бля', 'хуй', 'пидор', 'пидар', 'ебать', 'еблан', 'гей ', 'чурка', 'нигер', 'nigger', 'fuck', 'shit', 'bitch', 'cunt', 'хрю'];
export function validateNick(nick: string): { ok: boolean; msg?: string } {
  const n = nick.trim();
  if (n.length < 2 || n.length > 16) return { ok: false, msg: 'От 2 до 16 символов' };
  if (!/^[\p{L}\p{N}_\- ]+$/u.test(n)) return { ok: false, msg: 'Только буквы, цифры, пробел, _ и -' };
  const low = n.toLowerCase();
  for (const w of BAD_WORDS) if (low.includes(w)) return { ok: false, msg: 'Ник содержит запрещённые слова' };
  return { ok: true };
}

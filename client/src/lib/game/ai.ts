// ============================================================
// NEON ROYALE — ИИ бота: использует карты героев, защищается
// и контратакует. Сложность растёт с трофеями игрока.
// ============================================================
import { Battle, ARENA_W, RIVER_Y } from './engine';
import { CARD_BY_ID, CARDS } from './cards';

export function botDeck(trophies: number): string[] {
  // Пул бота: обычные карты + герои (без админ-лис)
  const pool = CARDS.filter(c => !c.admin).map(c => c.id);
  const power = Math.min(1, trophies / 1500);
  // Сильные карты добавляются с ростом трофеев
  const strong = new Set(['giant', 'mage', 'valkyrie', 'dragon', 'titan', 'hound', 'inferno', 'xbow', 'healer', 'berserk']);
  const available = pool.filter(id => power > 0.15 || !strong.has(id));
  const deck: string[] = [];
  // гарантируем: 1 танк, 1 дальник, 1 дешёвка, 1 здание
  const pick = (pred: (id: string) => boolean, fallback: string) => {
    const opts = available.filter(pred);
    const chosen = opts.length ? opts[Math.floor(Math.random() * opts.length)] : fallback;
    const i = available.indexOf(chosen);
    if (i >= 0) available.splice(i, 1);
    deck.push(chosen);
  };
  pick(id => { const c = CARD_BY_ID[id]; return c.kind === 'troop' && c.hp >= 800; }, 'knight');
  pick(id => { const c = CARD_BY_ID[id]; return c.range >= 5 && c.kind === 'troop'; }, 'archer');
  pick(id => { const c = CARD_BY_ID[id]; return (c.cost ?? 9) <= 2; }, 'skeletons');
  pick(id => { const c = CARD_BY_ID[id]; return c.kind === 'building'; }, 'cannon');
  while (deck.length < 8 && available.length) {
    deck.push(available.splice(Math.floor(Math.random() * available.length), 1)[0]);
  }
  return deck;
}

interface BotBrain {
  timer: number;
  aggression: number;   // 0..1
  lastLane: 0 | 1;
}

export function createBrain(trophies: number): BotBrain {
  return {
    timer: 2.0,
    aggression: 0.35 + Math.min(0.5, trophies / 4000),
    lastLane: Math.random() < 0.5 ? 0 : 1,
  };
}

function laneOf(x: number): 0 | 1 { return x < ARENA_W / 2 ? 0 : 1; }

// Вызывается каждый тик хоста. Возвращает play-событие или null.
export function botThink(
  battle: Battle,
  brain: BotBrain,
  side: 0 | 1,
  dt: number,
  seqRef: { n: number },
): void {
  if (battle.phase === 'ended') return;
  brain.timer -= dt;
  if (brain.timer > 0) return;
  brain.timer = 0.75 + Math.random() * 0.9 * (1.4 - brain.aggression);

  const { hand } = battle.hand(side);
  const elixir = battle.elixir[side];
  if (!hand.length) return;

  // Анализ угрозы: враги на своей половине
  const threats = battle.units.filter(u => u.side !== side && u.hp > 0 && !u.isTower && !u.isBuilding);
  const ownHalf = threats.filter(t => side === 0 ? t.y < RIVER_Y : t.y > RIVER_Y);
  const threatPower = ownHalf.reduce((s, t) => s + t.hp + t.dmg * 3, 0);

  const affordable = hand.filter(id => (CARD_BY_ID[id]?.cost ?? 9) <= elixir);
  if (!affordable.length) return;

  // 1) Защита: враг прорвался на нашу половину
  if (ownHalf.length > 0 && threatPower > 250) {
    const t = ownHalf[0];
    // предпочитаем дешёвого юнита/здание рядом с угрозой
    const def = affordable.sort((a, b) => (CARD_BY_ID[a].cost - CARD_BY_ID[b].cost))[0];
    const c = CARD_BY_ID[def];
    const x = clampX(t.x + (Math.random() - 0.5) * 1.5);
    const y = side === 0 ? clampY(t.y - 2.0) : clampY(t.y + 2.0);
    if (canPlace(battle, side, def, x, y)) {
      seqRef.n++;
      battle.applyPlay(side, { seq: seqRef.n, side, card: def, x, y });
      return;
    }
  }

  // 2) Атака: копим эликсир и пушим
  const pushThreshold = 6 + (1 - brain.aggression) * 3; // 6..9
  if (elixir >= pushThreshold || (battle.overtime && elixir >= 4)) {
    // приоритет: танк -> герой -> дальник
    const order = affordable.sort((a, b) => cardPower(b) - cardPower(a));
    const pick = order.find(id => CARD_BY_ID[id].kind === 'troop') ?? order[0];
    const lane = laneOf(pickLaneTarget(battle, side));
    brain.lastLane = lane;
    const x = clampX(lane === 0 ? 4.5 + Math.random() * 2 : 11.5 + Math.random() * 2);
    const y = side === 0 ? 6 + Math.random() * 4 : ARENA_PLACE_Y_HIGH - Math.random() * 4;
    if (canPlace(battle, side, pick, x, y)) {
      seqRef.n++;
      battle.applyPlay(side, { seq: seqRef.n, side, card: pick, x, y });
    }
    return;
  }

  // 3) Дешёвая поддержка при переполнении
  if (elixir >= 9) {
    const cheap = affordable.sort((a, b) => (CARD_BY_ID[a].cost - CARD_BY_ID[b].cost))[0];
    const x = clampX(Math.random() < 0.5 ? 4.5 : 13.5);
    const y = side === 0 ? 10 : ARENA_PLACE_Y_HIGH - 3;
    if (canPlace(battle, side, cheap, x, y)) {
      seqRef.n++;
      battle.applyPlay(side, { seq: seqRef.n, side, card: cheap, x, y });
    }
  }
}

const ARENA_PLACE_Y_HIGH = 26; // сторона 1 снизу; для бота (0) ставим 6..10

function cardPower(id: string): number {
  const c = CARD_BY_ID[id];
  if (!c) return 0;
  return c.hp / 100 + c.dmg / 10 + c.cost * 2;
}

function pickLaneTarget(battle: Battle, side: 0 | 1): number {
  // атакуем слабейшую башню противника
  const towers = battle.units.filter(u => u.side !== side && u.isTower === 'princess' && u.hp > 0);
  if (!towers.length) return ARENA_W / 2;
  towers.sort((a, b) => a.hp - b.hp);
  return towers[0].x;
}

function canPlace(battle: Battle, side: 0 | 1, cardId: string, x: number, y: number): boolean {
  const c = CARD_BY_ID[cardId];
  if (!c) return false;
  if (battle.elixir[side] < c.cost) return false;
  if (cardId === 'miner') return true;
  if (side === 0 && y > 15) return false;
  if (side === 1 && y < 17) return false;
  return true;
}

function clampX(x: number): number { return Math.max(0.8, Math.min(17.2, x)); }
function clampY(y: number): number { return Math.max(1.5, Math.min(30.5, y)); }

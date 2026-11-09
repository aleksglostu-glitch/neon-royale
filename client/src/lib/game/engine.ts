// ============================================================
// NEON ROYALE — боевая симуляция (фиксированный шаг 30 Гц)
// Авторитетный хост: хост симулирует, гость рендит снапшоты.
// Также используется локально против бота.
// ============================================================
import { CARD_BY_ID, CardDef, levelMult } from './cards';

export const ARENA_W = 18;
export const ARENA_H = 32;
export const RIVER_Y = 16;
export const BRIDGE_X = [4.5, 13.5];
export const DEPLOY_Y_MIN = 17;   // своя половина для стороны 1
export const DEPLOY_Y_MAX = 15;   // своя половина для стороны 0
export const BATTLE_TIME = 180;
export const OVERTIME = 60;
export const ELIXIR_RATE = 1 / 2.5;
export const ELIXIR_MAX = 10;
export const TICK = 1 / 30;

export interface Unit {
  uid: number;
  side: 0 | 1;
  card: string;            // cardId
  x: number; y: number;
  hp: number; maxHp: number;
  dmg: number;
  hitSpeed: number;
  range: number;
  speed: number;
  flying: boolean;
  targets: 'any' | 'buildings' | 'ground';
  splash: number;
  heal: number;
  slow: number;
  ramp: number;
  radius: number;
  cd: number;              // до следующего удара
  slowT: number;           // остаток замедления
  targetUid: number;       // текущая цель
  rampHits: number;        // подряд по одной цели (инферно)
  isTower?: 'king' | 'princess';
  isBuilding?: boolean;
  active?: boolean;        // король активирован?
  spawnT: number;          // время появления (анимация)
  hitFlash: number;
  attackAnim: number;
  facing: 1 | -1;
}

export interface FxEvent {
  t: number;
  kind: 'play' | 'hit' | 'death' | 'towerhit' | 'towerfall' | 'heal' | 'end';
  x?: number; y?: number;
  card?: string; side?: 0 | 1;
}

export interface Snapshot {
  time: number;               // осталось секунд
  overtime: boolean;
  phase: 'battle' | 'overtime' | 'ended';
  winner: -1 | 0 | 1;         // -1 = ещё не определён
  elixir: [number, number];
  crowns: [number, number];
  units: Unit[];
  fx: FxEvent[];              // события с прошлого снапшота
  hostApplied: number;        // seq применённых play-событий
}

export interface PlayEvent {
  seq: number;
  side: 0 | 1;
  card: string;
  x: number; y: number;
}

export interface BattleOpts {
  seed: number;
  decks: [string[], string[]];
  levels: [Record<string, number>, Record<string, number>];
  botLevels?: [number, number];   // средний уровень карт (множитель башен)
}

export function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Детерминированная стартовая очередь колоды (одинакова у хоста и гостя)
export function initialQueue(deck: string[], seed: number, side: 0 | 1): string[] {
  return shuffle(deck, mulberry32(seed ^ (side === 0 ? 0xA1 : 0xB2)));
}

function unitRadius(c: CardDef): number {
  if ((c.count ?? 1) > 1) return 0.42;
  if (c.hp >= 2600) return 0.88;
  if (c.flying && c.hp >= 900) return 0.8;
  if (c.hp >= 1000) return 0.65;
  return 0.55;
}

export class Battle {
  seed: number;
  time = BATTLE_TIME;
  overtime = false;
  phase: 'battle' | 'overtime' | 'ended' = 'battle';
  winner: -1 | 0 | 1 = -1;
  elixir: [number, number] = [5, 5];
  crowns: [number, number] = [0, 0];
  units: Unit[] = [];
  queues: [string[], string[]];      // очередь колоды (cycle)
  levels: [Record<string, number>, Record<string, number>];
  avgLevel: [number, number];
  private rnd: () => number;
  private nextUid = 1;
  private pending: PlayEvent[] = [];
  private appliedSeq = 0;
  fx: FxEvent[] = [];
  private lastSnapshotSeq = 0;

  constructor(opts: BattleOpts) {
    this.seed = opts.seed;
    this.rnd = mulberry32(opts.seed);
    this.levels = opts.levels;
    this.queues = [
      initialQueue(opts.decks[0], opts.seed, 0),
      initialQueue(opts.decks[1], opts.seed, 1),
    ];
    this.avgLevel = [
      opts.botLevels?.[0] ?? avgLvl(opts.levels[0]),
      opts.botLevels?.[1] ?? avgLvl(opts.levels[1]),
    ];
    this.spawnTowers();
  }

  private towerLevel(side: 0 | 1): number {
    return Math.max(1, Math.round(this.avgLevel[side]));
  }

  private spawnTowers() {
    for (const side of [0, 1] as const) {
      const lvl = levelMult(this.towerLevel(side));
      const py = side === 0 ? 5.5 : ARENA_H - 5.5;
      const ky = side === 0 ? 2.6 : ARENA_H - 2.6;
      for (const px of [4.5, 13.5]) {
        this.units.push({
          uid: this.nextUid++, side, card: '_princess',
          x: px, y: py, hp: 1500 * lvl, maxHp: 1500 * lvl,
          dmg: 95 * lvl, hitSpeed: 0.9, range: 7.5, speed: 0,
          flying: false, targets: 'any', splash: 0, heal: 0, slow: 0, ramp: 0,
          radius: 0.85, cd: 1, slowT: 0, targetUid: 0, rampHits: 0,
          isTower: 'princess', isBuilding: true, active: true, spawnT: 0,
          hitFlash: 0, attackAnim: 0, facing: side === 0 ? 1 : -1,
        });
      }
      this.units.push({
        uid: this.nextUid++, side, card: '_king',
        x: ARENA_W / 2, y: ky, hp: 2600 * lvl, maxHp: 2600 * lvl,
        dmg: 120 * lvl, hitSpeed: 1.0, range: 7.0, speed: 0,
        flying: false, targets: 'any', splash: 0, heal: 0, slow: 0, ramp: 0,
        radius: 1.05, cd: 1, slowT: 0, targetUid: 0, rampHits: 0,
        isTower: 'king', isBuilding: true, active: false, spawnT: 0,
        hitFlash: 0, attackAnim: 0, facing: side === 0 ? 1 : -1,
      });
    }
  }

  // ----- рука игрока: 4 карты + следующая -----
  hand(side: 0 | 1): { hand: string[]; next: string } {
    const q = this.queues[side];
    return { hand: [q[0], q[1], q[2], q[3]], next: q[4] };
  }

  private cycle(side: 0 | 1, cardId: string) {
    const q = this.queues[side];
    const i = q.indexOf(cardId);
    if (i >= 0) { q.splice(i, 1); q.push(cardId); }
  }

  // ----- валидация и применение play-события -----
  validate(side: 0 | 1, ev: PlayEvent): { ok: boolean; reason?: string } {
    if (this.phase === 'ended') return { ok: false, reason: 'ended' };
    const c = CARD_BY_ID[ev.card];
    if (!c) return { ok: false, reason: 'unknown' };
    if (!this.queues[side].includes(ev.card)) return { ok: false, reason: 'not_in_deck' };
    if (this.elixir[side] < c.cost) return { ok: false, reason: 'elixir' };
    const isMiner = ev.card === 'miner';
    if (!isMiner) {
      if (side === 1 && ev.y < DEPLOY_Y_MIN) return { ok: false, reason: 'zone' };
      if (side === 0 && ev.y > DEPLOY_Y_MAX) return { ok: false, reason: 'zone' };
    } else {
      // шахтёр: не в зоне вражеских башен
      for (const u of this.units) {
        if (u.isTower && u.side !== side && Math.hypot(u.x - ev.x, u.y - ev.y) < 2.2)
          return { ok: false, reason: 'zone' };
      }
    }
    if (ev.x < 0.5 || ev.x > ARENA_W - 0.5 || ev.y < 1.2 || ev.y > ARENA_H - 1.2) return { ok: false, reason: 'bounds' };
    return { ok: true };
  }

  applyPlay(side: 0 | 1, ev: PlayEvent): boolean {
    const v = this.validate(side, ev);
    if (!v.ok) return false;
    const c = CARD_BY_ID[ev.card];
    this.elixir[side] -= c.cost;
    this.cycle(side, ev.card);
    this.appliedSeq = Math.max(this.appliedSeq, ev.seq);
    const lvl = levelMult(this.levels[side][ev.card] ?? 1);
    const n = c.count ?? 1;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const r = n > 1 ? 0.55 : 0;
      const u: Unit = {
        uid: this.nextUid++, side, card: ev.card,
        x: clamp(ev.x + Math.cos(ang) * r, 0.5, ARENA_W - 0.5),
        y: clamp(ev.y + Math.sin(ang) * r, 1.0, ARENA_H - 1.0),
        hp: c.hp * lvl, maxHp: c.hp * lvl,
        dmg: c.dmg * lvl, hitSpeed: c.hitSpeed, range: c.range, speed: c.speed,
        flying: !!c.flying, targets: c.targets,
        splash: c.splash ?? 0, heal: c.heal ?? 0, slow: c.slow ?? 0, ramp: c.ramp ?? 0,
        radius: unitRadius(c), cd: 0.6, slowT: 0, targetUid: 0, rampHits: 0,
        isBuilding: c.kind === 'building', spawnT: 0.35, hitFlash: 0, attackAnim: 0,
        facing: side === 0 ? 1 : -1,
      };
      this.units.push(u);
    }
    this.fx.push({ t: this.simTime(), kind: 'play', x: ev.x, y: ev.y, card: ev.card, side });
    return true;
  }

  queuePlay(ev: PlayEvent) { this.pending.push(ev); }

  simTime() { return (BATTLE_TIME + OVERTIME) - this.time; }

  // ----- главный шаг -----
  tick(dt: number) {
    if (this.phase === 'ended') return;
    // применяем отложенные события (от гостя)
    while (this.pending.length) {
      const ev = this.pending.shift()!;
      this.applyPlay(ev.side, ev);
    }
    dt = Math.min(dt, 0.25);
    this.elixir[0] = Math.min(ELIXIR_MAX, this.elixir[0] + dt * ELIXIR_RATE);
    this.elixir[1] = Math.min(ELIXIR_MAX, this.elixir[1] + dt * ELIXIR_RATE);
    this.time -= dt;
    if (this.time <= 0) {
      if (!this.overtime && this.crowns[0] === this.crowns[1]) {
        this.overtime = true; this.phase = 'overtime'; this.time = OVERTIME;
      } else {
        this.finish();
        return;
      }
    }

    const units = this.units;
    for (const u of units) {
      if (u.hp <= 0) continue;
      if (u.spawnT > 0) { u.spawnT -= dt; continue; }
      if (u.slowT > 0) u.slowT -= dt;
      if (u.hitFlash > 0) u.hitFlash -= dt;
      if (u.attackAnim > 0) u.attackAnim -= dt;
      if (u.cd > 0) u.cd -= dt;

      // цель
      let target = this.findTarget(u);
      u.targetUid = target ? target.uid : 0;
      if (!target) continue;

      const dx = target.x - u.x, dy = target.y - u.y;
      const dist = Math.hypot(dx, dy) - target.radius;
      const reach = u.range + u.radius;
      if (dist > reach) {
        // движение
        const sp = u.speed * (u.slowT > 0 ? 0.5 : 1);
        if (sp > 0) {
          let tx = target.x, ty = target.y;
          // наземные пересекают реку по мостам
          if (!u.flying && ((u.y - RIVER_Y) * (target.y - RIVER_Y) < 0)) {
            const bx = Math.abs(u.x - BRIDGE_X[0]) < Math.abs(u.x - BRIDGE_X[1]) ? BRIDGE_X[0] : BRIDGE_X[1];
            if (Math.abs(u.x - bx) > 0.15) { tx = bx; ty = RIVER_Y; }
            else { tx = bx; ty = target.y; }
          }
          const ang = Math.atan2(ty - u.y, tx - u.x);
          u.x += Math.cos(ang) * sp * dt;
          u.y += Math.sin(ang) * sp * dt;
          u.facing = tx >= u.x ? 1 : -1;
        }
      } else if (u.cd <= 0) {
        // атака
        u.cd = u.hitSpeed;
        u.attackAnim = 0.25;
        const dmg = u.ramp > 0 ? Math.min(u.dmg + u.ramp * u.rampHits, u.dmg + u.ramp * 11) : u.dmg;
        if (u.heal > 0) {
          for (const a of units) {
            if (a.side === u.side && a.hp > 0 && !a.isTower && Math.hypot(a.x - target.x, a.y - target.y) <= (u.splash || 2.5)) {
              a.hp = Math.min(a.maxHp, a.hp + u.heal);
            }
          }
          this.fx.push({ t: this.simTime(), kind: 'heal', x: u.x, y: u.y });
        }
        if (u.splash > 0) {
          for (const e of units) {
            if (e.side !== u.side && e.hp > 0 && Math.hypot(e.x - target.x, e.y - target.y) <= u.splash + e.radius) {
              this.damage(e, dmg, u);
            }
          }
        } else {
          this.damage(target, dmg, u);
        }
        if (u.slow > 0) target.slowT = Math.max(target.slowT, u.slow);
        if (u.ramp > 0 && u.targetUid === target.uid) u.rampHits++;
      }
    }

    // расталкивание наземных (лёгкое)
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (a.hp <= 0 || a.flying || a.isBuilding) continue;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (b.hp <= 0 || b.flying || b.isBuilding) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = a.radius + b.radius;
        if (d2 > 0.0001 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          const nx = dx / d, ny = dy / d;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }

    // уборка мёртвых (башни остаются как руины)
    const alive = units.filter(u => u.hp > 0 || u.isTower);
    if (alive.length !== units.length) this.units = alive;

    // конец боя по башням
    for (const u of this.units) {
      if (u.isTower === 'king' && u.hp <= 0) {
        this.crowns[u.side === 0 ? 1 : 0] = 3;
        this.finish(u.side === 0 ? 1 : 0);
        return;
      }
    }
  }

  private findTarget(u: Unit): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    const aggro = u.isTower ? u.range : (u.isBuilding ? u.range : u.range + 6.0);
    for (const e of this.units) {
      if (e.hp <= 0 || e.side === u.side) continue;
      if (u.targets === 'ground' && e.flying) continue;
      if (u.targets === 'buildings' && !e.isBuilding) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y) - e.radius;
      if (u.isTower || u.isBuilding) {
        if (d > aggro) continue;
        // мортира: минимальная дистанция
        if (u.card === 'mortar' && d < 3.0) continue;
      }
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  private damage(target: Unit, dmg: number, from: Unit) {
    target.hp -= dmg;
    target.hitFlash = 0.15;
    const isTower = !!target.isTower;
    this.fx.push({ t: this.simTime(), kind: isTower ? 'towerhit' : 'hit', x: target.x, y: target.y });
    // активация короля
    if (target.isTower === 'king' && !target.active) target.active = true;
    if (target.hp <= 0) {
      this.fx.push({ t: this.simTime(), kind: 'death', x: target.x, y: target.y, card: target.card });
      if (target.isTower === 'princess') {
        this.crowns[from.side] += 1;
        this.fx.push({ t: this.simTime(), kind: 'towerfall', x: target.x, y: target.y, side: from.side });
        // активация короля пострадавшей стороны
        for (const k of this.units) if (k.isTower === 'king' && k.side === target.side) k.active = true;
        if (this.overtime) this.finish(from.side);
      }
    }
  }

  private finish(winner?: 0 | 1) {
    this.phase = 'ended';
    if (winner !== undefined) this.winner = winner;
    else if (this.crowns[0] > this.crowns[1]) this.winner = 0;
    else if (this.crowns[1] > this.crowns[0]) this.winner = 1;
    else this.winner = -1;
    this.fx.push({ t: this.simTime(), kind: 'end' });
  }

  // снапшот для гостя (12 Гц)
  snapshot(): Snapshot {
    this.lastSnapshotSeq++;
    const f = this.fx; this.fx = [];
    return {
      time: Math.max(0, this.time), overtime: this.overtime, phase: this.phase,
      winner: this.winner,
      elixir: [this.elixir[0], this.elixir[1]],
      crowns: [this.crowns[0], this.crowns[1]],
      units: this.units.map(u => ({ ...u })),
      fx: f, hostApplied: this.appliedSeq,
    };
  }
}

function avgLvl(levels: Record<string, number>): number {
  const vals = Object.values(levels);
  if (!vals.length) return 1;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

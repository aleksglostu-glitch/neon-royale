/**
 * NEON ROYALE — боевой движок (восстановлен из сборки, общий для клиента и сервера).
 * Локальный бой: сторона 0 — игрок, 1 — бот.
 * Сетевой бой: сервер держит мир, сериализует для каждой стороны отдельно
 * (координаты отражаются так, что наблюдатель всегда внизу, сторона 0).
 */
import {
  ARENA, CARD_MAP, CARDS, DEFAULT_DECK, BOT_POOL, ELIXIR_MAX, ELIXIR_START, ELIXIR_RATE,
  MATCH_DURATION, inDeployZone, levelMult, type CardDef,
} from './cards'

export type Side = 0 | 1

export interface PlayerCfg {
  name: string
  isBot: boolean
  isFox: boolean
  deck: string[]
  cardLevels: Record<string, number>
  towerLevel: number
  towerSkin?: string
  /** Сложность бота: пауза между решениями, сек (меньше — умнее) */
  botSkill?: number
}

interface PlayerState {
  side: Side
  name: string
  elixir: number
  hand: string[]
  queue: string[]
  crowns: number
  isBot: boolean
  isFox: boolean
  cardLevels: Record<string, number>
  towerLevel: number
  towerSkin?: string
  botNext: number
  botSkill: number
}

export interface UnitEnt {
  id: string
  card: string
  side: Side
  x: number
  y: number
  hp: number
  maxHp: number
  dmg: number
  hitSpeed: number
  range: number
  speed: number
  splash: number
  targets: 'any' | 'towers'
  /** Замедление при попадании, сек */
  slow: number
  /** Остаток замедления на юните, сек */
  slowT: number
  size: number
  build: boolean
  life: number
  cd: number
  phase: number
}

export interface TowerEnt {
  id: number
  kind: 'left' | 'right' | 'king'
  side: Side
  x: number
  y: number
  hp: number
  maxHp: number
  dmg: number
  range: number
  hitSpeed: number
  cd: number
  active: boolean
  counted?: boolean
}

export interface Effect {
  id: string
  kind: 'spawn' | 'hit' | 'splash' | 'crown'
  x: number
  y: number
  t: number
  color?: string
}

export interface BattleResult {
  outcome: 'win' | 'draw' | 'lose'
  gold: number
  trophies: number
  myCrowns: number
  foeCrowns: number
}

export interface SideView {
  side: Side
  name: string
  elixir: number
  hand: string[]
  next: string
  crowns: number
  isBot: boolean
  isFox: boolean
  cardLevels: Record<string, number>
  towerLevel: number
  towerSkin?: string
}

export interface BattleView {
  id: string
  now: number
  endsAt: number
  duration: number
  over: boolean
  me: SideView
  foe: SideView
  units: { id: string; card: string; side: Side; x: number; y: number; hp: number; maxHp: number; slow: boolean; build: boolean; phase: number }[]
  towers: { id: number; kind: string; side: Side; x: number; y: number; hp: number; maxHp: number; active: boolean }[]
  effects: Effect[]
  result?: BattleResult
}

const rndId = () => Math.random().toString(36).slice(2, 10)

function towerStats(kind: 'left' | 'right' | 'king', towerLevel: number) {
  const s = levelMult(towerLevel)
  const king = kind === 'king'
  return {
    hp: Math.round((king ? 2600 : 1400) * s),
    dmg: Math.round((king ? 120 : 90) * s),
    range: king ? 6.8 : 6,
    hitSpeed: king ? 1 : 0.9,
  }
}

export function makeTower(kind: 'left' | 'right' | 'king', side: Side, towerLevel: number): TowerEnt {
  const st = towerStats(kind, towerLevel)
  const king = kind === 'king'
  return {
    id: 0, kind, side,
    x: king ? 0 : kind === 'left' ? -4.6 : 4.6,
    y: (side === 0 ? 1 : -1) * (king ? 13.8 : 8.6),
    hp: st.hp, maxHp: st.hp, dmg: st.dmg, range: st.range, hitSpeed: st.hitSpeed,
    cd: 0, active: !king,
  }
}

/** Собрать случайную бота-колоду из пула (с строениями и героями) */
export function botDeck(myLevels?: Record<string, number>): string[] {
  const pool = [...BOT_POOL].sort(() => Math.random() - 0.5)
  const tank = pool.find((c) => CARD_MAP[c].targets === 'towers') ?? 'giant'
  const build = pool.find((c) => CARD_MAP[c].build)
  const rest = pool.filter((c) => c !== tank && c !== build)
  const picked = [tank, ...(build && Math.random() < 0.7 ? [build] : []), ...rest]
  return picked.slice(0, 8)
}

export class Battle {
  id: string
  createdAt = Date.now()
  endsAt: number
  duration: number
  players: Record<Side, PlayerState>
  units: UnitEnt[] = []
  towers: TowerEnt[] = []
  effects: Effect[] = []
  over = false
  results: Record<Side, BattleResult> | null = null
  ucount = 0

  constructor(cfg: { players: [PlayerCfg, PlayerCfg]; id?: string; duration?: number }) {
    this.id = cfg.id ?? `local-${rndId()}`
    this.duration = cfg.duration ?? MATCH_DURATION
    this.endsAt = Date.now() + 1000 * this.duration
    this.players = {
      0: this.mkPlayer(0, cfg.players[0]),
      1: this.mkPlayer(1, cfg.players[1]),
    }
    let tid = 1
    for (const t of [
      makeTower('left', 0, cfg.players[0].towerLevel),
      makeTower('right', 0, cfg.players[0].towerLevel),
      makeTower('king', 0, cfg.players[0].towerLevel),
      makeTower('left', 1, cfg.players[1].towerLevel),
      makeTower('right', 1, cfg.players[1].towerLevel),
      makeTower('king', 1, cfg.players[1].towerLevel),
    ]) {
      t.id = tid++
      this.towers.push(t)
    }
  }

  private mkPlayer(side: Side, cfg: PlayerCfg): PlayerState {
    const deck = cfg.deck.length === 8 && cfg.deck.every((id) => CARD_MAP[id]) ? [...cfg.deck] : [...DEFAULT_DECK]
    const p: PlayerState = {
      side,
      name: cfg.name || 'Командир',
      elixir: ELIXIR_START,
      hand: [],
      queue: [],
      crowns: 0,
      isBot: cfg.isBot,
      isFox: cfg.isFox,
      cardLevels: cfg.cardLevels ?? {},
      towerLevel: cfg.towerLevel ?? 1,
      towerSkin: cfg.towerSkin,
      botNext: Date.now() + 1500,
      botSkill: cfg.botSkill ?? 1,
    }
    const shuffled = [...deck].sort(() => Math.random() - 0.5)
    p.hand = shuffled.slice(0, 4)
    p.queue = shuffled.slice(4)
    return p
  }

  pushFx(kind: Effect['kind'], x: number, y: number, color?: string) {
    this.effects.push({ id: rndId(), kind, x, y, t: Date.now(), color })
    if (this.effects.length > 40) this.effects.splice(0, this.effects.length - 40)
  }

  spawnUnits(p: PlayerState, cardId: string, x: number, y: number) {
    const def = CARD_MAP[cardId]
    if (!def) return
    const mult = levelMult(p.cardLevels[cardId] ?? 1)
    for (let i = 0; i < def.count; i++) {
      const a = (2 * Math.PI * i) / def.count + 0.6 * Math.random()
      const spread = def.count > 1 ? 0.55 : 0.15
      this.units.push({
        id: `u${++this.ucount}-${rndId().slice(0, 4)}`,
        card: cardId,
        side: p.side,
        x: Math.max(ARENA.xMin, Math.min(ARENA.xMax, x + Math.cos(a) * spread)),
        y: Math.max(ARENA.yMin, Math.min(ARENA.yMax, y + Math.sin(a) * spread)),
        hp: def.hp * mult,
        maxHp: def.hp * mult,
        dmg: def.dmg * mult,
        hitSpeed: def.hitSpeed,
        range: def.range,
        speed: def.speed,
        splash: def.splash ?? 0,
        targets: def.targets,
        slow: def.slow ?? 0,
        slowT: 0,
        size: def.size,
        build: !!def.build,
        life: def.build ? (def.life ?? 30) : 0,
        cd: 0.4,
        phase: Math.random() * Math.PI * 2,
      })
    }
    this.pushFx('spawn', x, y, def.color)
  }

  rotateHand(p: PlayerState, handIdx: number) {
    const played = p.hand[handIdx]
    if (!played) return
    const next = p.queue.shift()
    p.hand[handIdx] = next ?? played
    if (next) p.queue.push(played)
  }

  /** Выложить карту: координаты в системе стороны (y>0 — свой бок) */
  deploy(side: Side, handIdx: number, x: number, y: number): { ok: boolean; error?: string } {
    if (this.over) return { ok: false, error: 'Бой окончен' }
    const p = this.players[side]
    const cardId = p.hand[handIdx]
    const def = cardId ? CARD_MAP[cardId] : null
    if (!def) return { ok: false, error: 'Нет такой карты' }
    if (p.elixir < def.cost) return { ok: false, error: 'Не хватает эликсира' }
    if (!inDeployZone(side, x, y)) return { ok: false, error: 'Здесь нельзя выложить карту' }
    p.elixir -= def.cost
    this.spawnUnits(p, cardId, x, y)
    this.rotateHand(p, handIdx)
    return { ok: true }
  }

  dist(ax: number, ay: number, bx: number, by: number) {
    return Math.hypot(ax - bx, ay - by)
  }

  nearestBridge(x: number) {
    let best = ARENA.bridges[0]
    let bd = Math.abs(x - best)
    for (const b of ARENA.bridges) {
      const d = Math.abs(x - b)
      if (d < bd) { bd = d; best = b }
    }
    return best
  }

  targetUnit(u: UnitEnt): UnitEnt | null {
    let best: UnitEnt | null = null
    let bd = Infinity
    for (const o of this.units) {
      if (o.hp <= 0 || o.side === u.side) continue
      const d = this.dist(u.x, u.y, o.x, o.y)
      // строения-защитники не летят через всё поле, но цель в радиусе видят как все
      if (d <= 5.5 && d < bd) { bd = d; best = o }
    }
    return best
  }

  targetTower(u: UnitEnt): TowerEnt | null {
    let best: TowerEnt | null = null
    let bd = Infinity
    for (const t of this.towers) {
      if (t.hp <= 0 || t.side === u.side) continue
      const d = this.dist(u.x, u.y, t.x, t.y)
      if (d < bd) { bd = d; best = t }
    }
    return best
  }

  moveToward(u: UnitEnt, tx: number, ty: number, dt: number) {
    let gx = tx
    let gy = ty
    // Переход через реку только по мосту
    if (Math.sign(u.y) !== Math.sign(ty) && Math.abs(u.y) > 0.35 && Math.abs(ty) > 0.35 && Math.abs(u.y) > ARENA.riverHalf) {
      gx = this.nearestBridge(u.x)
      gy = 0
    }
    const d = this.dist(u.x, u.y, gx, gy)
    const step = u.speed * (u.slowT > 0 ? 0.45 : 1) * dt
    if (d <= step) {
      u.x = gx
      u.y = gy
      return
    }
    u.x += ((gx - u.x) / d) * step
    u.y += ((gy - u.y) / d) * step
    u.phase += 10 * dt
  }

  end(winner: Side | null) {
    if (this.over) return
    this.over = true
    const mk = (outcome: 'win' | 'draw' | 'lose', me: PlayerState, foe: PlayerState): BattleResult => ({
      outcome,
      gold: outcome === 'win' ? 150 : outcome === 'draw' ? 80 : 45,
      trophies: outcome === 'win' ? 30 : outcome === 'draw' ? 10 : -15,
      myCrowns: me.crowns,
      foeCrowns: foe.crowns,
    })
    const rA = winner === null ? 'draw' : winner === 0 ? 'win' : 'lose'
    this.results = {
      0: mk(rA, this.players[0], this.players[1]),
      1: mk(rA === 'win' ? 'lose' : rA === 'lose' ? 'win' : 'draw', this.players[1], this.players[0]),
    }
  }

  botThink() {
    const p = this.players[1]
    if (!p.isBot || this.over) return
    if (Date.now() < p.botNext) return
    p.botNext = Date.now() + (1000 + Math.floor(1600 * Math.random())) * p.botSkill
    if (p.elixir < 2) return
    const playable = p.hand
      .map((c, i) => ({ c, i, def: CARD_MAP[c] }))
      .filter((x) => x.def && x.def.cost <= p.elixir)
    if (playable.length === 0) return

    // Оборона: юниты игрока перешли на половину бота
    const threats = this.units
      .filter((u) => u.side === 0 && u.hp > 0 && u.y < -1.2 && !u.build)
      .sort((a, b) => a.y - b.y)
    if (threats.length > 0) {
      const threat = threats[0]
      const anyC = playable.filter((x) => x.def.targets === 'any')
      const pool = anyC.length ? anyC : playable
      const nearAllies = this.units.filter((u) => u.side === 1 && u.hp > 0 && this.dist(u.x, u.y, threat.x, threat.y) < 2).length
      const splashy = pool.filter((x) => x.def.splash && x.def.splash > 0)
      const pick = (nearAllies >= 2 && splashy.length ? splashy : pool)[Math.floor(Math.random() * (nearAllies >= 2 && splashy.length ? splashy.length : pool.length))]
      const dx = Math.max(-8, Math.min(8, threat.x + (2 * Math.random() - 1)))
      const dy = Math.max(-15, Math.min(-2.2, threat.y - 2.6))
      this.deploy(1, pick.i, dx, dy)
      return
    }

    // Атака: ждём эликсир
    const timeLeft = (this.endsAt - Date.now()) / 1000
    if (p.elixir < (timeLeft <= 60 ? 5 : 7.5)) return
    const heavy = playable.filter((x) => x.def.cost >= 4)
    const pick = (heavy.length && Math.random() < 0.7 ? heavy : playable)[0]
    const left = this.towers.find((t) => t.side === 0 && t.kind === 'left')
    const right = this.towers.find((t) => t.side === 0 && t.kind === 'right')
    const laneX = !right || (left && left.hp <= right.hp) ? ARENA.bridges[0] : ARENA.bridges[1]
    const dx = Math.max(-8.2, Math.min(8.2, laneX + (2 * Math.random() - 1) * 1.5))
    const dy = -(2.5 + 3 * Math.random())
    this.deploy(1, pick.i, dx, dy)
  }

  tick(dt: number) {
    if (this.over) return
    const now = Date.now()
    const elRate = (this.endsAt - now) / 1000 <= 60 ? (2 / 2.8) : ELIXIR_RATE
    for (const p of [this.players[0], this.players[1]]) {
      p.elixir = Math.min(ELIXIR_MAX, p.elixir + elRate * dt)
    }
    if (this.players[1].isBot) this.botThink()

    // Юниты
    for (const u of this.units) {
      if (u.hp <= 0) continue
      if (u.slowT > 0) u.slowT -= dt
      u.cd -= dt
      if (u.build) {
        // строение: живёт ограниченное время, только обороняется
        u.life -= dt
        if (u.life <= 0) { u.hp = 0; this.pushFx('splash', u.x, u.y, CARD_MAP[u.card]?.color); continue }
        const t = this.targetUnit(u)
        if (t && this.dist(u.x, u.y, t.x, t.y) <= u.range + t.size + 0.2 && u.cd <= 0) {
          u.cd = u.hitSpeed
          this.hitUnit(u, t)
        }
        continue
      }
      const tu = u.targets === 'towers' ? null : this.targetUnit(u)
      if (tu) {
        if (this.dist(u.x, u.y, tu.x, tu.y) <= u.range + u.size + tu.size) {
          if (u.cd <= 0) {
            u.cd = u.hitSpeed
            this.hitUnit(u, tu)
          }
          continue
        }
        this.moveToward(u, tu.x, tu.y, dt)
        continue
      }
      const tt = this.targetTower(u)
      if (tt) {
        if (this.dist(u.x, u.y, tt.x, tt.y) <= u.range + u.size + 0.7) {
          if (u.cd <= 0) {
            u.cd = u.hitSpeed
            this.hitTower(u, tt)
          }
          continue
        }
        this.moveToward(u, tt.x, tt.y, dt)
      }
    }
    this.units = this.units.filter((u) => u.hp > 0)

    // Башни
    for (const t of this.towers) {
      if (t.hp <= 0 || (t.kind === 'king' && !t.active)) continue
      t.cd -= dt
      let best: UnitEnt | null = null
      let bd = Infinity
      for (const u of this.units) {
        if (u.hp <= 0 || u.side === t.side) continue
        const d = this.dist(t.x, t.y, u.x, u.y)
        if (d <= t.range && d < bd) { bd = d; best = u }
      }
      if (best && t.cd <= 0) {
        t.cd = t.hitSpeed
        best.hp -= t.dmg
        this.pushFx('hit', best.x, best.y, t.side === 0 ? '#22d3ee' : '#f472b6')
      }
    }

    // Король разрушен → конец
    for (const t of this.towers) {
      if (t.hp > 0 || t.kind !== 'king') continue
      const winner = (t.side === 0 ? 1 : 0) as Side
      this.players[winner].crowns = 3
      this.pushFx('crown', t.x, t.y)
      this.end(winner)
      return
    }
    // Разрушенные боковые башни: корона + активация короля
    for (const t of this.towers) {
      if (t.hp <= 0 || t.kind === 'king' || t.counted) continue
      t.counted = true
      const scorer = (t.side === 0 ? 1 : 0) as Side
      this.players[scorer].crowns++
      this.pushFx('crown', t.x, t.y)
      const king = this.towers.find((k) => k.side === t.side && k.kind === 'king')
      if (king) king.active = true
    }
    // Время вышло
    if (now >= this.endsAt) {
      const a = this.players[0].crowns
      const b = this.players[1].crowns
      this.end(a > b ? 0 : b > a ? 1 : null)
    }
  }

  private hitUnit(u: UnitEnt, target: UnitEnt) {
    target.hp -= u.dmg
    this.pushFx('hit', target.x, target.y, CARD_MAP[u.card]?.color)
    if (target.hp <= 0) this.pushFx('splash', target.x, target.y, CARD_MAP[u.card]?.color)
    if (u.splash > 0) {
      for (const o of this.units) {
        if (o.hp > 0 && o.side !== u.side && o !== target && this.dist(target.x, target.y, o.x, o.y) <= u.splash) {
          o.hp -= 0.6 * u.dmg
          if (u.slow) o.slowT = Math.max(o.slowT, u.slow * 0.6)
        }
      }
      this.pushFx('splash', target.x, target.y, CARD_MAP[u.card]?.color)
    }
    if (u.slow) target.slowT = Math.max(target.slowT, u.slow)
  }

  private hitTower(u: UnitEnt, t: TowerEnt) {
    t.hp -= u.dmg
    this.pushFx('hit', t.x, t.y, CARD_MAP[u.card]?.color)
    if (u.splash > 0) {
      for (const o of this.units) {
        if (o.hp > 0 && o.side !== u.side && this.dist(t.x, t.y, o.x, o.y) <= u.splash) o.hp -= 0.6 * u.dmg
      }
    }
  }

  /** Сериализация для наблюдателя: его сторона всегда 0 (внизу экрана) */
  serialize(viewer: Side = 0): BattleView {
    const flip = viewer === 1
    const mz = (y: number) => (flip ? -y : y)
    const ms = (s: Side) => (flip ? ((s === 0 ? 1 : 0) as Side) : s)
    const me = this.players[viewer]
    const foe = this.players[flip ? 0 : 1]
    const mkView = (p: PlayerState, side: Side): SideView => ({
      side,
      name: p.name,
      elixir: Math.round(10 * p.elixir) / 10,
      hand: [...p.hand],
      next: p.queue[0] ?? p.hand[0] ?? '',
      crowns: p.crowns,
      isBot: p.isBot,
      isFox: p.isFox,
      cardLevels: p.cardLevels,
      towerLevel: p.towerLevel,
      towerSkin: p.towerSkin,
    })
    return {
      id: this.id,
      now: Date.now(),
      endsAt: this.endsAt,
      duration: this.duration,
      over: this.over,
      me: mkView(me, 0),
      foe: mkView(foe, 1),
      units: this.units.map((u) => ({
        id: u.id, card: u.card, side: ms(u.side),
        x: flip ? -u.x : u.x,
        y: mz(u.y),
        hp: Math.round(u.hp), maxHp: Math.round(u.maxHp),
        slow: u.slowT > 0,
        build: u.build,
        phase: Math.round(10 * u.phase) / 10,
      })),
      towers: this.towers.map((t) => ({
        id: t.id, kind: t.kind, side: ms(t.side),
        x: flip ? -t.x : t.x,
        y: mz(t.y),
        hp: Math.round(t.hp), maxHp: t.maxHp, active: t.active,
      })),
      effects: this.effects.slice(-25).map((e) => ({ ...e, x: flip ? -e.x : e.x, y: mz(e.y) })),
      result: this.over && this.results ? this.results[viewer] : undefined,
    }
  }

}

/** Имена ботов (как в сборке) */
export const BOT_NAMES = ['Лисёнок', 'НеоКороль', 'Тень', 'Барс', 'Вихрь', 'Кобра', 'Атом', 'Сокол', 'Мираж', 'Рысь']

export function pickBotName(): string {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)]
}

/** Создать локальный бой против бота */
export function createLocalBattle(opts: {
  myName?: string
  deck?: string[]
  cardLevels?: Record<string, number>
  towerLevel?: number
  towerSkin?: string
  isFox?: boolean
  difficulty?: number
}): Battle {
  const levels = opts.cardLevels ?? {}
  const avg = Object.values(levels).length
    ? Math.round(Object.values(levels).reduce((a, b) => a + b, 0) / Object.values(levels).length)
    : 1
  const botLvl: Record<string, number> = {}
  const bDeck = botDeck()
  for (const id of bDeck) botLvl[id] = Math.max(1, Math.min(5, levels[id] ?? avg))
  const battle = new Battle({
    players: [
      {
        name: opts.myName || 'Командир',
        isBot: false,
        isFox: !!opts.isFox,
        deck: opts.deck ?? [...DEFAULT_DECK],
        cardLevels: levels,
        towerLevel: opts.towerLevel ?? 1,
        towerSkin: opts.towerSkin,
      },
      {
        name: pickBotName(),
        isBot: true,
        isFox: false,
        deck: bDeck,
        cardLevels: botLvl,
        towerLevel: opts.towerLevel ?? 1,
        towerSkin: undefined,
        botSkill: opts.difficulty ?? 1,
      },
    ],
  })
  return battle
}

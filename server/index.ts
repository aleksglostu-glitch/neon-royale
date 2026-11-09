/**
 * NEON ROYALE — игровой сервер (Bun + socket.io).
 * Протокол r:* (совпадает с клиентом):
 *   r:login {uid,nick} → {profile, nickTaken?, nick?}     — уникальные ники
 *   r:leaderboard {} → {ok, rows}                          — топ-100 по трофеям
 *   r:queue:start / r:queue:cancel                         — поиск пары (13.5с → бот)
 *   r:match:start {foe} / r:state (10 Гц) / r:battle:end   — сетевой бой 1v1
 *   r:deploy {cardIdx,x,y} → {ok}                          — выкладка карт (сервер валидирует)
 *   r:shop {action,card} → {ok,profile?,label?}            — магазин на сервере
 *   r:deck:save {deck} / r:cosmetics {towerSkin}           — колода и башни
 *   r:promo {code} → {ok, fox?, gold?, profile?}           — промокоды ТОЛЬКО здесь
 *   r:rejoin {} → {ok, battle?}                            — возврат в бой после обрыва
 *   r:battle:leave                                          — сдаться и выйти
 * Ник+очки не являются персональными данными (152-ФЗ): уведомление РКН не требуется.
 */
import { createServer } from 'http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Server, Socket } from 'socket.io'
import {
  Battle as RBattle,
  BOT_NAMES,
  botDeck,
  type BattleView,
  type PlayerCfg,
  type Side,
} from './game/engine'
import {
  CARD_MAP, CARDS, DEFAULT_DECK, MAX_CARD_LEVEL, MAX_TOWER_LEVEL, nextUpgradeCost, TOWER_LEVEL_COSTS,
  towerSkin, towerUnlocked, TOWER_SKINS, validDeck,
} from './game/cards'
import type { Profile } from './game/profile'

process.on('uncaughtException', (e) => console.error('[royale] uncaughtException:', e))
process.on('unhandledRejection', (e) => console.error('[royale] unhandledRejection:', e))

// ============================ ХРАНИЛИЩЕ ============================
const DATA_DIR = (process.env.DATA_DIR || (existsSync('/data') ? '/data' : join(import.meta.dir, 'data')))
const PLAYERS_PATH = join(DATA_DIR, 'players.json')
const NICKS_PATH = join(DATA_DIR, 'nicks.json')

interface PlayerRec { profile: Profile; updatedAt: number }
const players = new Map<string, PlayerRec>() // uid → rec
const nickIndex = new Map<string, string>() // lowerNick → uid
let storeDirty = false
const markDirty = () => {
  storeDirty = true
}

function loadStore() {
  try {
    if (existsSync(PLAYERS_PATH)) {
      const data = JSON.parse(readFileSync(PLAYERS_PATH, 'utf8')) as Record<string, PlayerRec>
      for (const [uid, rec] of Object.entries(data)) players.set(uid, rec)
      console.log(`[royale] загружено игроков: ${players.size}`)
    }
    if (existsSync(NICKS_PATH)) {
      const data = JSON.parse(readFileSync(NICKS_PATH, 'utf8')) as Record<string, string>
      for (const [n, uid] of Object.entries(data)) nickIndex.set(n, uid)
    }
  } catch (e) {
    console.error('[royale] ошибка загрузки хранилища:', e)
  }
}

function saveStore() {
  try {
    if (!storeDirty) return
    mkdirSync(DATA_DIR, { recursive: true })
    const obj: Record<string, PlayerRec> = {}
    for (const [uid, rec] of players) obj[uid] = rec
    writeFileSync(PLAYERS_PATH, JSON.stringify(obj))
    const nicks: Record<string, string> = {}
    for (const [n, uid] of nickIndex) nicks[n] = uid
    writeFileSync(NICKS_PATH, JSON.stringify(nicks))
    storeDirty = false
  } catch (e) {
    console.error('[royale] ошибка сохранения:', e)
  }
}

function newProfile(uid: string, nick: string): Profile {
  const cards: Record<string, number> = {}
  for (const id of DEFAULT_DECK) cards[id] = 1
  return {
    uid,
    nick: nick || 'Командир',
    gold: 300,
    trophies: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    cards,
    deck: [...DEFAULT_DECK],
    towerLevel: 1,
    towerSkin: 'stone',
    isFox: false,
    promoUsed: [],
    vkBonus: false,
    createdAt: Date.now(),
  }
}

function normalizeNick(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/\s+/g, ' ').slice(0, 16)
}

/** Попытка занять ник; true — успех */
function claimNick(profile: Profile, nick: string): boolean {
  const key = nick.toLowerCase()
  const owner = nickIndex.get(key)
  if (owner && owner !== profile.uid) return false
  const old = profile.nick.toLowerCase()
  if (old && old !== key && nickIndex.get(old) === profile.uid) nickIndex.delete(old)
  nickIndex.set(key, profile.uid)
  profile.nick = nick
  return true
}

// ============================ ПРОМОКОДЫ (только здесь) ============================
/** XOR-90 обфускация — в исходнике нет читаемых кодов */
const x90 = (arr: number[]) => arr.map((n) => String.fromCharCode(90 ^ n)).join('')

const PROMOS: Record<string, { gold: number; label: string }> = {
  [x90([20, 31, 21, 20, 9, 14, 27, 8, 14])]: { gold: 500, label: 'Стартовый неон' },
  [x90([8, 21, 3, 27, 22, 31])]: { gold: 777, label: 'Рояль-бонус' },
  [x90([9, 20, 31, 29, 19, 8, 31, 12])]: { gold: 1500, label: 'От студии' },
  [x90([12, 17, 25, 22, 15, 24])]: { gold: 1000, label: 'ВК-бонус' },
}
/** Секретный админ-код: открывает лисьи карты и башню */
const ADMIN_PROMO = x90([107, 105, 104, 59, 62, 55, 51, 52, 44, 105, 106, 105, 106])
const FOX_CARDS = ['fox_veteran', 'fox_flame', 'fox_alpha', 'fox_pack', 'fox_tower']

// ============================ ОГРАНИЧЕНИЯ ============================
const rate = new Map<string, { promo: number[]; login: number[] }>()
function rateOk(socket: Socket, kind: 'promo' | 'login', limit: number, windowMs: number): boolean {
  let r = rate.get(socket.id)
  if (!r) {
    r = { promo: [], login: [] }
    rate.set(socket.id, r)
  }
  const arr = r[kind]
  const now = Date.now()
  while (arr.length && now - arr[0] > windowMs) arr.shift()
  if (arr.length >= limit) return false
  arr.push(now)
  return true
}

// ============================ МАТЧМЕЙКИНГ И БОИ ============================

interface QueueItem {
  socket: Socket
  uid: string
  profile: Profile
  joinedAt: number
}
const queue: QueueItem[] = []
let battleSeq = 0

interface NetBattle {
  id: string
  battle: RBattle
  sides: { 0: string | null; 1: string | null } // uid
  sockets: { 0: Socket | null; 1: Socket | null }
  profiles: { 0: Profile | null; 1: Profile | null }
  tickIv: ReturnType<typeof setInterval>
  sendIv: ReturnType<typeof setInterval>
  lastState: { 0: number; 1: number }
}
const battles = new Map<string, NetBattle>() // id → battle
const battleByUid = new Map<string, NetBattle>() // uid → battle

function profileCfg(profile: Profile, isBot: boolean, name?: string): PlayerCfg {
  return {
    name: name ?? profile.nick,
    isBot,
    isFox: profile.isFox,
    deck: validDeck(profile.deck, profile.cards) ? [...profile.deck] : [...DEFAULT_DECK],
    cardLevels: profile.cards,
    towerLevel: profile.towerLevel,
    towerSkin: profile.towerSkin,
  }
}

function botProfileCfg(myProfile: Profile): PlayerCfg {
  const avg = Object.values(myProfile.cards).length
    ? Math.round(Object.values(myProfile.cards).reduce((a, b) => a + b, 0) / Object.values(myProfile.cards).length)
    : 1
  const deck = botDeck()
  const levels: Record<string, number> = {}
  for (const id of deck) levels[id] = Math.max(1, Math.min(5, myProfile.cards[id] ?? avg))
  return {
    name: BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)],
    isBot: true,
    isFox: false,
    deck,
    cardLevels: levels,
    towerLevel: Math.max(1, Math.min(5, myProfile.towerLevel)),
  }
}


function startBattle(a: { socket: Socket; uid: string; profile: Profile }, b: { socket: Socket | null; uid: string; profile: Profile | null }, botCfg?: PlayerCfg) {
  const id = `b${++battleSeq}-${Date.now().toString(36)}`
  const players: [PlayerCfg, PlayerCfg] = [
    profileCfg(a.profile, false),
    botCfg ?? (b.profile ? profileCfg(b.profile, false) : botProfileCfg(a.profile)),
  ]
  const battle = new RBattle({ players: [players[0], players[1]], id, duration: 180 })
  const nb: NetBattle = {
    id,
    battle,
    sides: { 0: a.uid, 1: b.uid },
    sockets: { 0: a.socket, 1: b.socket },
    profiles: { 0: a.profile, 1: b.profile },
    tickIv: null as unknown as ReturnType<typeof setInterval>,
    sendIv: null as unknown as ReturnType<typeof setInterval>,
    lastState: { 0: 0, 1: 0 },
  }
  battles.set(id, nb)
  battleByUid.set(a.uid, nb)
  if (b.uid) battleByUid.set(b.uid, nb)

  // Сообщаем старт
  a.socket.emit('r:match:start', { id, foe: { name: players[1].name, isBot: players[1].isBot, isFox: players[1].isFox } })
  if (b.socket) {
    b.socket.emit('r:match:start', { id, foe: { name: players[0].name, isBot: false, isFox: players[0].isFox } })
  }

  nb.tickIv = setInterval(() => {
    try {
      battle.tick(1 / 15)
    } catch (e) {
      console.error('[royale] tick error:', e)
    }
  }, 66)
  nb.sendIv = setInterval(() => {
    try {
      sendState(nb)
      if (battle.over) finishBattle(nb)
    } catch (e) {
      console.error('[royale] state error:', e)
    }
  }, 100)
}

function sendState(nb: NetBattle) {
  for (const side of [0, 1] as Side[]) {
    const sock = nb.sockets[side]
    if (!sock?.connected) continue
    sock.emit('r:state', nb.battle.serialize(side))
    nb.lastState[side] = Date.now()
  }
}

function applyResult(nb: NetBattle) {
  const res = nb.battle.results
  if (!res) return
  for (const side of [0, 1] as Side[]) {
    const profile = nb.profiles[side]
    if (!profile) continue
    const r = res[side]
    profile.gold += r.gold
    profile.trophies = Math.max(0, profile.trophies + r.trophies)
    if (r.outcome === 'win') profile.wins++
    else if (r.outcome === 'lose') profile.losses++
    else profile.draws++
    markDirty()
  }
}

function finishBattle(nb: NetBattle) {
  applyResult(nb)
  for (const side of [0, 1] as Side[]) {
    const sock = nb.sockets[side]
    if (!sock?.connected) continue
    sock.emit('r:battle:end')
    sock.emit('r:state', nb.battle.serialize(side))
  }
  clearInterval(nb.tickIv)
  clearInterval(nb.sendIv)
  for (const uid of [nb.sides[0], nb.sides[1]]) {
    if (uid && battleByUid.get(uid) === nb) battleByUid.delete(uid)
  }
  battles.delete(nb.id)
}

// ============================ ПРОФИЛЬ ДЛЯ КЛИЕНТА ============================
function publicProfile(p: Profile): Profile {
  return { ...p }
}

// ============================ СЕРВЕР ============================
const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket: Socket) => {
  let myUid: string | null = null

  socket.on('r:login', (d: { uid?: string; nick?: string } | undefined, ack?: (r: unknown) => void) => {
    if (!rateOk(socket, 'login', 12, 60_000)) return ack?.({ ok: false, error: 'Слишком часто' })
    const uid = typeof d?.uid === 'string' && d.uid.length <= 64 ? d.uid : ''
    if (!uid) return ack?.({ ok: false, error: 'Нет uid' })
    myUid = uid
    let rec = players.get(uid)
    let created = false
    if (!rec) {
      rec = { profile: newProfile(uid, ''), updatedAt: Date.now() }
      players.set(uid, rec)
      created = true
      markDirty()
    }
    const profile = rec.profile
    let nickTaken = false
    const nick = normalizeNick(d?.nick)
    if (nick.length >= 2 && nick !== profile.nick) {
      if (!claimNick(profile, nick)) nickTaken = true
      else markDirty()
    }
    rec.updatedAt = Date.now()
    markDirty()
    ack?.({ ok: true, profile: publicProfile(profile), nickTaken, nick: profile.nick, created })
  })

  socket.on('r:leaderboard', (_d: unknown, ack?: (r: unknown) => void) => {
    const rows = [...players.values()]
      .map((rec) => ({ nick: rec.profile.nick, trophies: rec.profile.trophies, wins: rec.profile.wins }))
      .sort((a, b) => b.trophies - a.trophies)
      .slice(0, 100)
    ack?.({ ok: true, rows })
  })

  socket.on('r:profile:get', (_d: unknown, ack?: (r: unknown) => void) => {
    if (!myUid) return ack?.({ ok: false })
    const rec = players.get(myUid)
    ack?.(rec ? { ok: true, profile: publicProfile(rec.profile) } : { ok: false })
  })

  // ---------- Очередь ----------
  socket.on('r:queue:start', (_d: unknown, ack?: (r: unknown) => void) => {
    if (!myUid) return ack?.({ ok: false, error: 'Сначала войдите' })
    const rec = players.get(myUid)
    if (!rec) return ack?.({ ok: false, error: 'Нет профиля' })
    if (battleByUid.has(myUid)) return ack?.({ ok: true, already: true })
    if (queue.some((q) => q.uid === myUid)) return ack?.({ ok: true })
    ack?.({ ok: true })
    socket.emit('r:search:started')
    queue.push({ socket, uid: myUid, profile: rec.profile, joinedAt: Date.now() })
  })

  socket.on('r:queue:cancel', () => {
    const i = queue.findIndex((q) => q.socket.id === socket.id)
    if (i >= 0) {
      queue.splice(i, 1)
      socket.emit('r:search:cancelled')
    }
  })

  // ---------- Бой ----------
  socket.on('r:deploy', async (d: { cardIdx?: number; x?: number; y?: number } | undefined, ack?: (r: unknown) => void) => {
    if (!myUid) return ack?.({ ok: false, error: 'Нет входа' })
    const nb = battleByUid.get(myUid)
    if (!nb) return ack?.({ ok: false, error: 'Бой не активен' })
    const side = nb.sides[0] === myUid ? 0 : nb.sides[1] === myUid ? 1 : null
    if (side === null) return ack?.({ ok: false, error: 'Нет стороны' })
    const idx = typeof d?.cardIdx === 'number' ? Math.max(0, Math.min(3, Math.floor(d.cardIdx))) : -1
    const x = typeof d?.x === 'number' ? Math.max(-9, Math.min(9, d.x)) : 0
    const yRaw = typeof d?.y === 'number' ? Math.max(-16.5, Math.min(16.5, d.y)) : 0
    // Клиент всегда в своей системе (сторона 0 внизу): переводим в мировые координаты
    const wx = side === 1 ? -x : x
    const wy = side === 1 ? -yRaw : yRaw
    const r = nb.battle.deploy(side, idx, wx, wy)
    ack?.(r)
  })

  socket.on('r:battle:leave', () => {
    if (!myUid) return
    const nb = battleByUid.get(myUid)
    if (!nb || nb.battle.over) return
    const side = nb.sides[0] === myUid ? 0 : 1
    // Сдача: победа сопернику
    const winner = (side === 0 ? 1 : 0) as Side
    nb.battle.players[winner].crowns = 3
    nb.battle.pushFx('crown', nb.battle.towers.find((t) => t.side === side && t.kind === 'king')?.x ?? 0, side === 0 ? 13.8 : -13.8)
    nb.battle.end(winner)
    sendState(nb)
    finishBattle(nb)
  })

  socket.on('r:rejoin', (_d: unknown, ack?: (r: unknown) => void) => {
    if (!myUid) return ack?.({ ok: false })
    const nb = battleByUid.get(myUid)
    if (!nb || nb.battle.over) return ack?.({ ok: false })
    const side = nb.sides[0] === myUid ? 0 : 1
    // Перепривязываем сокет
    nb.sockets[side] = socket
    ack?.({ ok: true, battle: nb.battle.serialize(side) })
  })

  // ---------- Магазин (сервер валидирует золото) ----------
  socket.on('r:shop', (d: { action?: string; card?: string } | undefined, ack?: (r: unknown) => void) => {
    if (!myUid) return ack?.({ ok: false, error: 'Нет входа' })
    const rec = players.get(myUid)
    if (!rec) return ack?.({ ok: false, error: 'Нет профиля' })
    const p = rec.profile
    const action = d?.action ?? ''
    const respond = (r: Record<string, unknown>) => ack?.(r)

    if (action === 'buyCard') {
      const def = d?.card ? CARD_MAP[d.card] : null
      if (!def || def.unlock !== 'shop' || !def.shopPrice) return respond({ ok: false, error: 'Карта не продаётся' })
      if (p.cards[def.id]) return respond({ ok: false, error: 'Уже куплена' })
      if (p.gold < def.shopPrice) return respond({ ok: false, error: `Не хватает ${def.shopPrice - p.gold} золота` })
      p.gold -= def.shopPrice
      p.cards[def.id] = 1
      markDirty()
      return respond({ ok: true, profile: publicProfile(p), label: `${def.name} куплена!` })
    }
    if (action === 'upCard') {
      const def = d?.card ? CARD_MAP[d.card] : null
      if (!def || !p.cards[def.id]) return respond({ ok: false, error: 'Карты нет' })
      const lvl = p.cards[def.id]
      if (lvl >= MAX_CARD_LEVEL) return respond({ ok: false, error: 'Максимальный уровень' })
      const cost = nextUpgradeCost(lvl)
      if (p.gold < cost) return respond({ ok: false, error: `Не хватает ${cost - p.gold} золота` })
      p.gold -= cost
      p.cards[def.id] = lvl + 1
      markDirty()
      return respond({ ok: true, profile: publicProfile(p), label: `${def.name} — уровень ${lvl + 1}!` })
    }
    if (action === 'upTowers') {
      if (p.towerLevel >= MAX_TOWER_LEVEL) return respond({ ok: false, error: 'Максимальный уровень' })
      const cost = TOWER_LEVEL_COSTS[p.towerLevel - 1]
      if (p.gold < cost) return respond({ ok: false, error: `Не хватает ${cost - p.gold} золота` })
      p.gold -= cost
      p.towerLevel++
      markDirty()
      return respond({ ok: true, profile: publicProfile(p), label: `Башни усилены до ур. ${p.towerLevel}!` })
    }
    if (action === 'buyTower') {
      const sk = towerSkin(d?.card ?? '')
      if (!sk.price || sk.price <= 0 || sk.fox) return respond({ ok: false, error: 'Эта башня не продаётся' })
      p.skins = p.skins ?? []
      if (p.skins.includes(sk.id) || p.towerSkin === sk.id) return respond({ ok: false, error: 'Уже открыта' })
      if (p.gold < sk.price) return respond({ ok: false, error: `Не хватает ${sk.price - p.gold} золота` })
      p.gold -= sk.price
      p.skins.push(sk.id)
      p.towerSkin = sk.id
      markDirty()
      return respond({ ok: true, profile: publicProfile(p), label: `Башня «${sk.name}» куплена!` })
    }
    if (action === 'vkBonus') {
      if (p.vkBonus) return respond({ ok: false, error: 'Бонус уже получен' })
      p.vkBonus = true
      p.gold += 300
      markDirty()
      return respond({ ok: true, profile: publicProfile(p), label: 'Бонус ВКонтакте: +300 золота!' })
    }
    respond({ ok: false, error: 'Неизвестное действие' })
  })

  socket.on('r:deck:save', (d: { deck?: string[] } | undefined, ack?: (r: unknown) => void) => {
    if (!myUid) return ack?.({ ok: false, error: 'Нет входа' })
    const rec = players.get(myUid)
    if (!rec) return ack?.({ ok: false, error: 'Нет профиля' })
    const deck = Array.isArray(d?.deck) ? d!.deck!.map(String) : []
    if (!validDeck(deck, rec.profile.cards)) return ack?.({ ok: false, error: 'Некорректная колода' })
    rec.profile.deck = deck
    markDirty()
    ack?.({ ok: true, profile: publicProfile(rec.profile) })
  })

  socket.on('r:cosmetics', (d: { towerSkin?: string } | undefined) => {
    if (!myUid) return
    const rec = players.get(myUid)
    if (!rec) return
    const sk = towerSkin(d?.towerSkin ?? '')
    const p = rec.profile
    const owned = (p.skins ?? []).includes(sk.id)
    if (
      sk.id !== p.towerSkin &&
      !owned &&
      sk.price !== 0 &&
      !(sk.unlockTrophies >= 0 && p.trophies >= sk.unlockTrophies) &&
      !(sk.fox && p.isFox)
    ) {
      return
    }
    p.towerSkin = sk.id
    markDirty()
  })

  // ---------- Промокоды ----------
  socket.on('r:promo', (d: { code?: string } | undefined, ack?: (r: unknown) => void) => {
    if (!rateOk(socket, 'promo', 5, 60_000)) return ack?.({ ok: false, error: 'Слишком много попыток, подожди минуту' })
    if (!myUid) return ack?.({ ok: false, error: 'Нет входа' })
    const rec = players.get(myUid)
    if (!rec) return ack?.({ ok: false, error: 'Нет профиля' })
    const code = typeof d?.code === 'string' ? d.code.trim().toUpperCase() : ''
    if (!code) return ack?.({ ok: false, error: 'Введите код' })
    const p = rec.profile

    if (code === ADMIN_PROMO) {
      if (p.isFox) return ack?.({ ok: true, fox: true, profile: publicProfile(p), label: 'Лисий доступ уже открыт' })
      p.isFox = true
      for (const c of FOX_CARDS) if (!p.cards[c]) p.cards[c] = 1
      if (!p.skins) p.skins = []
      if (!p.skins.includes('foxtower')) p.skins.push('foxtower')
      p.towerSkin = 'foxtower'
      markDirty()
      console.log('[royale] админ-доступ выдан')
      return ack?.({ ok: true, fox: true, profile: publicProfile(p), label: 'Лисий доступ открыт!' })
    }

    const promo = PROMOS[code]
    if (!promo) return ack?.({ ok: false, error: 'Код не найден' })
    if (p.promoUsed.includes(code)) return ack?.({ ok: false, error: 'Код уже использован' })
    p.promoUsed.push(code)
    p.gold += promo.gold
    markDirty()
    ack?.({ ok: true, gold: promo.gold, profile: publicProfile(p), label: `${promo.label}: +${promo.gold} золота!` })
  })

  socket.on('disconnect', () => {
    const i = queue.findIndex((q) => q.socket.id === socket.id)
    if (i >= 0) queue.splice(i, 1)
    const nb = myUid ? battleByUid.get(myUid) : null
    if (nb && !nb.battle.over) {
      const side = nb.sides[0] === myUid ? 0 : 1
      if (nb.sockets[side] === socket) nb.sockets[side] = null
      // Бой продолжается: игрок может вернуться (r:rejoin). Соперник доигрывает.
    }
  })
})

// ============================ ТИКЕР ОЧЕРЕДИ ============================
setInterval(() => {
  const now = Date.now()
  // Пара живых игроков: сортируем по трофеям и склеиваем соседей
  const humans = queue.filter((q) => q.socket.connected)
  for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].socket.connected) queue.splice(i, 1)
  if (humans.length >= 2) {
    humans.sort((a, b) => a.profile.trophies - b.profile.trophies)
    const a = humans[0]
    const b = humans[1]
    const ia = queue.findIndex((q) => q.uid === a.uid)
    const ib = queue.findIndex((q) => q.uid === b.uid)
    if (ia >= 0 && ib >= 0) {
      queue.splice(Math.max(ia, ib), 1)
      queue.splice(Math.min(ia, ib), 1)
      startBattle(a, { socket: b.socket, uid: b.uid, profile: b.profile })
    }
    return
  }
  // Таймаут 13.5с → бой с ботом на сервере (трофеи засчитываются)
  for (const q of [...queue]) {
    if (now - q.joinedAt >= 13_500) {
      const idx = queue.findIndex((x) => x.uid === q.uid)
      if (idx >= 0) {
        queue.splice(idx, 1)
        startBattle(q, { socket: null, uid: '', profile: null })
      }
    }
  }
}, 1000)

// ============================ СТАРТ ============================
const PORT = Number(process.env.GAME_PORT || process.env.PORT || 3003)
loadStore()
setInterval(saveStore, 5000)
httpServer.listen(PORT, () => {
  console.log(`[royale] сервер запущен на порту ${PORT}`)
})

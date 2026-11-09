/**
 * NEON ROYALE — игровой сервер (socket.io).
 *
 * Обязанности:
 *  - регистрация уникальных ников (реестр + проверка занятости);
 *  - таблица лидеров (топ-100 по трофеям, персистентность в JSON);
 *  - матчмейкинг 1v1: очередь → пара игроков, либо через 15 с — матч с ботом;
 *  - релей PvP (host-authoritative): play guest→host, snapshot host→guest;
 *  - промокоды: код хранится XOR-обфусцированным, проверка ТОЛЬКО здесь,
 *    rate-limit на попытки. В клиентском коде промокода нет.
 *
 * Персональные данные не собираются: только самодельный ник, playerId
 * (случайный uuid из клиента) и игровые счётчики. 152-ФЗ не нарушается.
 */
import { createServer } from 'http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Server, Socket } from 'socket.io'

const PORT = Number(process.env.PORT || 3003)

const httpServer = createServer((req, res) => {
  // CORS для REST
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

  const url = new URL(req.url || '/', `http://localhost`)
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, game: 'neon-royale', time: Date.now() }))
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/leaderboard') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(leaderboardTop()))
    return
  }
  if (req.method === 'GET' && url.pathname === '/api/nick-check') {
    const nick = (url.searchParams.get('nick') || '').trim()
    const playerId = url.searchParams.get('playerId') || ''
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(checkNickFree(nick, playerId)))
    return
  }
  if (req.method === 'POST' && url.pathname === '/api/submit-result') {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 10_000) req.destroy() })
    req.on('end', () => {
      try {
        const d = JSON.parse(body)
        const r = submitResult(String(d.playerId || ''), String(d.nick || ''), Number(d.trophies), Number(d.wins), Number(d.losses) || 0)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(r))
      } catch {
        res.writeHead(400); res.end('{"ok":false}')
      }
    })
    return
  }
  if (req.method === 'POST' && url.pathname === '/api/promo') {
    let body = ''
    req.on('data', (c) => { body += c; if (body.length > 2_000) req.destroy() })
    req.on('end', () => {
      try {
        const d = JSON.parse(body)
        const r = redeemPromo(String(d.playerId || ''), String(d.code || ''))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(r))
      } catch {
        res.writeHead(400); res.end('{"ok":false,"msg":"Ошибка"}')
      }
    })
    return
  }
  res.writeHead(404); res.end()
})

const io = new Server(httpServer, {
  // socket.io на дефолтном пути /socket.io/ — REST (/api/*, /health) остаётся свободным
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

process.on('uncaughtException', (e) => console.error('[nr] uncaughtException:', e))
process.on('unhandledRejection', (e) => console.error('[nr] unhandledRejection:', e))

// ============================ ХРАНИЛИЩЕ ============================
const DB_DIR = process.env.SNAPSHOT_DIR || join(import.meta.dir, 'db')
const DB_PATH = join(DB_DIR, 'players.json')

interface Rec { nick: string; trophies: number; wins: number; losses: number; fox: boolean; updatedAt: number }
interface Db {
  players: Record<string, Rec>          // playerId -> rec
  nickIndex: Record<string, string>     // nickLower -> playerId
  promoGrants: Record<string, number>   // playerId -> ts
}
const db: Db = { players: {}, nickIndex: {}, promoGrants: {} }
let dbDirty = false

function loadDb() {
  try {
    if (existsSync(DB_PATH)) {
      const raw = JSON.parse(readFileSync(DB_PATH, 'utf8'))
      db.players = raw.players || {}
      db.nickIndex = raw.nickIndex || {}
      db.promoGrants = raw.promoGrants || {}
      console.log(`[nr] db loaded: ${Object.keys(db.players).length} players`)
    }
  } catch (e) { console.error('[nr] db load failed', e) }
}
function saveDb() {
  try {
    if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true })
    writeFileSync(DB_PATH, JSON.stringify(db))
    dbDirty = false
  } catch (e) { console.error('[nr] db save failed', e) }
}
loadDb()
setInterval(() => { if (dbDirty) saveDb() }, 10_000)
process.on('SIGTERM', () => { saveDb(); process.exit(0) })
process.on('SIGINT', () => { saveDb(); process.exit(0) })

const ARENAS: Array<[number, string]> = [
  [0, 'Гнездо гоблинов'], [300, 'Костяная яма'], [600, 'Неоновый дол'],
  [1000, 'Кристальный пик'], [1500, 'Лавовый кратер'], [2200, 'Небесная арена'],
  [3000, 'Лисья легенда'],
]
function arenaOf(t: number): string {
  let a = ARENAS[0][1]
  for (const [min, name] of ARENAS) if (t >= min) a = name
  return a
}

const normNick = (n: string) => n.trim().replace(/\s+/g, ' ')
const lowNick = (n: string) => normNick(n).toLowerCase()

function checkNickFree(nick: string, playerId: string): { ok: boolean; msg?: string } {
  const n = normNick(nick)
  if (n.length < 2 || n.length > 16) return { ok: false, msg: 'От 2 до 16 символов' }
  if (!/^[\p{L}\p{N}_\- ]+$/u.test(n)) return { ok: false, msg: 'Только буквы, цифры, пробел, _ и -' }
  const low = lowNick(n)
  const owner = db.nickIndex[low]
  if (owner && owner !== playerId) return { ok: false, msg: 'Ник уже занят' }
  return { ok: true }
}

function upsertPlayer(playerId: string, nick: string): Rec {
  const low = lowNick(nick)
  let rec = db.players[playerId]
  if (!rec) {
    rec = { nick: normNick(nick), trophies: 0, wins: 0, losses: 0, fox: false, updatedAt: Date.now() }
    db.players[playerId] = rec
  }
  if (rec.nick.toLowerCase() !== low) {
    delete db.nickIndex[rec.nick.toLowerCase()]
    rec.nick = normNick(nick)
  }
  db.nickIndex[low] = playerId
  rec.updatedAt = Date.now()
  dbDirty = true
  return rec
}

function submitResult(playerId: string, nick: string, trophies: number, wins: number, losses: number) {
  if (!playerId || !nick) return { ok: false, msg: 'Нет данных' }
  const rec = upsertPlayer(playerId, nick)
  const old = rec.trophies
  const nt = Math.max(0, Math.round(trophies))
  // защита от накрутки: за один submit не больше ±40 трофеев
  if (Math.abs(nt - old) > 40) {
    rec.trophies = nt > old ? old + 40 : Math.max(0, old - 40)
  } else {
    rec.trophies = nt
  }
  if (Number.isFinite(wins)) rec.wins = Math.max(rec.wins, Math.round(wins))
  if (Number.isFinite(losses)) rec.losses = Math.max(rec.losses, Math.round(losses))
  dbDirty = true
  return { ok: true, trophies: rec.trophies }
}

function leaderboardTop() {
  const rows = Object.values(db.players)
    .filter(r => r.nick)
    .sort((a, b) => b.trophies - a.trophies)
    .slice(0, 100)
    .map(r => ({ nick: r.nick, trophies: r.trophies, wins: r.wins, arena: arenaOf(r.trophies) }))
  return rows
}

// ============================ ПРОМОКОД ============================
// Код НЕ лежит открытым текстом: XOR-обфускация. Проверка только здесь.
const PROMO_XOR: number[] = [107, 105, 104, 59, 62, 55, 51, 52, 44, 105, 106, 105, 106]
const PROMO_KEY = 0x5a
function decodePromo(): string {
  let s = ''
  for (const c of PROMO_XOR) s += String.fromCharCode(c ^ PROMO_KEY)
  return s
}
const promoAttempts = new Map<string, number[]>() // playerId -> ts[]
function redeemPromo(playerId: string, code: string) {
  if (!playerId) return { ok: false, msg: 'Нет идентификатора игрока' }
  const now = Date.now()
  const arr = (promoAttempts.get(playerId) || []).filter(t => now - t < 60_000)
  if (arr.length >= 5) return { ok: false, msg: 'Слишком много попыток, подожди минуту' }
  arr.push(now)
  promoAttempts.set(playerId, arr)
  const rec = db.players[playerId]
  if (!rec) return { ok: false, msg: 'Сначала создай ник в игре' }
  if (rec.fox || db.promoGrants[playerId]) return { ok: false, msg: 'Лисы уже разблокированы' }
  const clean = (code || '').trim()
  if (clean.length !== decodePromo().length || clean !== decodePromo()) {
    return { ok: false, msg: 'Неверный промокод' }
  }
  rec.fox = true
  db.promoGrants[playerId] = now
  dbDirty = true
  return { ok: true, msg: 'Лисий клан разблокирован!' }
}

// ============================ МАТЧМЕЙКИНГ ============================
interface QP { sid: string; playerId: string; nick: string; deck: string[]; levels: Record<string, number>; trophies: number; joined: number }
interface Room { id: string; p0: QP; p1: QP; hostSide: 0 | 1; createdAt: number }

const queue: QP[] = []
const rooms = new Map<string, Room>()
const QUEUE_TIMEOUT_MS = 15_000

const bySid = new Map<string, QP>()   // socketId -> queued player info (для register)
const sidToRoom = new Map<string, string>()
const uid = () => Math.random().toString(36).slice(2, 10)

function matchFound(a: QP, b: QP) {
  const roomId = uid()
  const room: Room = { id: roomId, p0: a, p1: b, hostSide: 0, createdAt: Date.now() }
  rooms.set(roomId, room)
  sidToRoom.set(a.sid, roomId)
  sidToRoom.set(b.sid, roomId)
  const mk = (me: QP, opp: QP, side: 0 | 1) => ({
    roomId, seed: Math.floor(Math.random() * 2 ** 31), side, host: side === 0,
    oppNick: opp.nick, oppDeck: opp.deck, oppLevels: opp.levels, bot: false,
    yourDeck: me.deck, yourLevels: me.levels,
  })
  io.to(a.sid).emit('match', mk(a, b, 0))
  io.to(b.sid).emit('match', mk(b, a, 1))
  console.log(`[nr] match ${roomId}: ${a.nick} vs ${b.nick}`)
}

function matchBot(p: QP) {
  const roomId = uid()
  // комната-одиночка: клиент сам симулирует бота локально
  io.to(p.sid).emit('match', {
    roomId, seed: Math.floor(Math.random() * 2 ** 31), side: 1, host: true,
    oppNick: 'Бот', oppDeck: [], oppLevels: {}, bot: true,
    yourDeck: p.deck, yourLevels: p.levels,
  })
  console.log(`[nr] bot match for ${p.nick} (waited ${((Date.now() - p.joined) / 1000).toFixed(1)}s)`)
}

setInterval(() => {
  const now = Date.now()
  // пары из очереди
  while (queue.length >= 2) {
    const a = queue.shift()!
    const b = queue.shift()!
    const sa = io.sockets.sockets.get(a.sid)
    const sb = io.sockets.sockets.get(b.sid)
    if (!sa) { if (sb) queue.unshift(b); continue }
    if (!sb) { queue.unshift(a); continue }
    matchFound(a, b)
  }
  // таймаут -> бот
  while (queue.length) {
    const p = queue[0]
    if (now - p.joined >= QUEUE_TIMEOUT_MS) {
      queue.shift()
      const s = io.sockets.sockets.get(p.sid)
      if (s) matchBot(p)
    } else break
  }
  // статус поиска
  for (const p of queue) {
    io.to(p.sid).emit('queue', { searching: true, elapsed: Math.floor((now - p.joined) / 1000) })
  }
}, 1000)

io.on('connection', (socket: Socket) => {
  let registered: { playerId: string; nick: string } | null = null

  socket.on('register', (d: { playerId: string; nick: string }) => {
    try {
      if (!d || !d.playerId) return
      const nick = normNick(String(d.nick || 'Игрок'))
      upsertPlayer(String(d.playerId), nick)
      registered = { playerId: String(d.playerId), nick }
    } catch (e) { console.error('[nr] register', e) }
  })

  socket.on('queue', (d: { playerId: string; nick: string; deck: string[]; levels: Record<string, number>; trophies: number }) => {
    try {
      if (!d || !d.playerId) return
      const deck = Array.isArray(d.deck) && d.deck.length === 8 ? d.deck.map(String) : []
      if (!deck.length) return
      const qp: QP = {
        sid: socket.id,
        playerId: String(d.playerId),
        nick: normNick(String(d.nick || 'Игрок')),
        deck,
        levels: typeof d.levels === 'object' && d.levels ? d.levels : {},
        trophies: Number(d.trophies) || 0,
        joined: Date.now(),
      }
      upsertPlayer(qp.playerId, qp.nick)
      bySid.set(socket.id, qp)
      if (!queue.find(x => x.playerId === qp.playerId)) queue.push(qp)
    } catch (e) { console.error('[nr] queue', e) }
  })

  socket.on('leave_queue', () => {
    const i = queue.findIndex(q => q.sid === socket.id)
    if (i >= 0) queue.splice(i, 1)
  })

  // релей: гость -> хост
  socket.on('play', (ev: { seq: number; card: string; x: number; y: number }) => {
    const roomId = sidToRoom.get(socket.id)
    if (!roomId) return
    const room = rooms.get(roomId)
    if (!room) return
    const guest = room.hostSide === 0 ? room.p1 : room.p0
    if (socket.id !== guest.sid) return // только гость шлёт play
    const host = room.hostSide === 0 ? room.p0 : room.p1
    socket.to(host.sid).emit('play', { seq: ev.seq, side: guest === room.p0 ? 0 : 1, card: ev.card, x: ev.x, y: ev.y })
  })

  // релей: хост -> гость
  socket.on('snapshot', (roomId: string, snap: unknown) => {
    const room = rooms.get(String(roomId))
    if (!room) return
    const host = room.hostSide === 0 ? room.p0 : room.p1
    if (socket.id !== host.sid) return
    const guest = room.hostSide === 0 ? room.p1 : room.p0
    socket.to(guest.sid).emit('snapshot', snap)
  })

  socket.on('disconnect', () => {
    const i = queue.findIndex(q => q.sid === socket.id)
    if (i >= 0) queue.splice(i, 1)
    bySid.delete(socket.id)
    const roomId = sidToRoom.get(socket.id)
    if (roomId) {
      const room = rooms.get(roomId)
      if (room) {
        const other = room.p0.sid === socket.id ? room.p1 : room.p0
        socket.to(other.sid).emit('opp_left')
      }
      rooms.delete(roomId)
      sidToRoom.delete(socket.id)
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`[nr] Neon Royale server on :${PORT}`)
})

'use client'

import { useEffect, useRef } from 'react'
import * as G from '@/lib/game/shared'
import { getTerrainCanvas } from '@/lib/game/terrain'

export type Selection =
  | { kind: 'tower'; id: number }
  | { kind: 'building'; id: number }
  | null

interface GameMapProps {
  game: G.GameState
  myId: string | null
  sel: Selection
  onSelect: (s: Selection) => void
}

const NEUTRAL_COL = '#5c6f80'
const R_NODE = 40 // радиус попадания тапа (мировые пикс)

interface Snapshot {
  game: G.GameState
  localAt: number
}

/* ---------- Эффекты ---------- */
interface Fx {
  kind: 'boom' | 'ring' | 'text'
  x: number
  y: number
  born: number
  dur: number
  color: string
  text?: string
  size: number
  seeds?: number[]
}

interface AmbPart {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  r: number
}

interface Cloud {
  x: number
  y: number
  r: number
  spd: number
  a: number
}

interface PrevMarch {
  tx: number
  ty: number
  color: string
  units: number
  toKind: 'tower' | 'building'
  toId: number
  progress: number
}

const AMB_EMISSION: Record<G.BuildingType, { color: string; vy: number; rate: number } | null> = {
  mine: { color: '#fbbf24', vy: -30, rate: 1.6 },
  sawmill: { color: '#a3e635', vy: -16, rate: 1.2 },
  lab: { color: '#22d3ee', vy: -22, rate: 1.1 },
  barracks: { color: '#fda4af', vy: -12, rate: 0.7 },
  radio: null,
  depot: null,
}

export default function GameMap({ game, myId, sel, onSelect }: GameMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const gameRef = useRef<Snapshot>({ game, localAt: performance.now() })
  const selRef = useRef<Selection>(sel)
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 })

  // Живые эффекты
  const fxRef = useRef<Fx[]>([])
  const ambRef = useRef<AmbPart[]>([])
  const shakeRef = useRef({ mag: 0, until: 0 })
  const prevMarchRef = useRef<Map<string, PrevMarch>>(new Map())
  const prevOwnerRef = useRef<Map<string, string | null>>(new Map())
  const prevGarrRef = useRef<Map<string, number>>(new Map())
  const badgePopRef = useRef<Map<string, number>>(new Map())
  const cloudsRef = useRef<Cloud[]>(
    Array.from({ length: 5 }).map((_, i) => ({
      x: (i * 397 + 120) % G.MAP_W,
      y: 100 + ((i * 233) % (G.MAP_H - 200)),
      r: 170 + ((i * 83) % 150),
      spd: 7 + (i % 3) * 5,
      a: 0.045 + (i % 2) * 0.02,
    }))
  )

  useEffect(() => {
    gameRef.current = { game, localAt: performance.now() }
  }, [game])
  useEffect(() => {
    selRef.current = sel
  }, [sel])

  // ---------- Дифф состояния: марши пришли, владение сменилось ----------
  useEffect(() => {
    const nowMs = performance.now()
    const playerColor = (id: string | null) => game.players.find((p) => p.id === id)?.color ?? NEUTRAL_COL
    const addFx = (f: Omit<Fx, 'born'>) => {
      fxRef.current.push({ ...f, born: nowMs })
      if (fxRef.current.length > 48) fxRef.current.splice(0, fxRef.current.length - 48)
    }
    const shake = (mag: number) => {
      shakeRef.current = { mag: Math.max(shakeRef.current.until > nowMs ? shakeRef.current.mag : 0, mag), until: nowMs + 340 }
    }

    // Марши: сравниваем с прошлым состоянием
    const prev = prevMarchRef.current
    const seen = new Set<string>()
    for (const m of game.marches) seen.add(m.id)
    for (const [id, pm] of prev) {
      if (seen.has(id)) {
        // обновляем прогресс
        const cur = game.marches.find((m) => m.id === id)
        if (cur) prev.set(id, { tx: pm.tx, ty: pm.ty, color: pm.color, units: pm.units, toKind: pm.toKind, toId: pm.toId, progress: cur.progress })
        continue
      }
      prev.delete(id)
      // Марш завершился — эффект в точке цели
      const node = pm.toKind === 'tower' ? game.towers.find((t) => t.id === pm.toId) : game.buildings.find((b) => b.id === pm.toId)
      const nx = node?.x ?? pm.tx
      const ny = node?.y ?? pm.ty
      const big = pm.units >= 18
      if (node && node.owner) {
        const defPlayer = game.players.find((p) => p.id === node.owner)
        if (defPlayer && defPlayer.color === pm.color) {
          // Усиление своей точки
          addFx({ kind: 'text', x: nx, y: ny - 34, dur: 900, color: '#86efac', text: `+${pm.units}`, size: 20 })
          addFx({ kind: 'ring', x: nx, y: ny, dur: 450, color: pm.color, size: 34 })
          continue
        }
      }
      // Бой
      addFx({ kind: 'boom', x: nx, y: ny, dur: 520, color: pm.color, size: big ? 54 : 38, seeds: Array.from({ length: big ? 12 : 8 }).map(() => Math.random() * Math.PI * 2) })
      addFx({ kind: 'text', x: nx, y: ny - 26, dur: 950, color: '#fca5a5', text: `−${pm.units}`, size: 19 })
      if (big) shake(5)
    }
    for (const m of game.marches) {
      if (!prev.has(m.id)) {
        prev.set(m.id, { tx: m.tx, ty: m.ty, color: m.color, units: m.units, toKind: m.toKind, toId: m.toId, progress: m.progress })
      }
    }

    // Смена владельца — захват
    const nodes: { key: string; owner: string | null; x: number; y: number; isTower: boolean }[] = [
      ...game.towers.map((t) => ({ key: `t${t.id}`, owner: t.owner, x: t.x, y: t.y, isTower: true })),
      ...game.buildings.map((b) => ({ key: `b${b.id}`, owner: b.owner, x: b.x, y: b.y, isTower: false })),
    ]
    const firstFill = prevOwnerRef.current.size === 0
    for (const n of nodes) {
      const before = prevOwnerRef.current.get(n.key)
      prevOwnerRef.current.set(n.key, n.owner)
      if (firstFill || before === n.owner) continue
      if (n.owner) {
        const col = playerColor(n.owner)
        const tx = G.clamp(n.x, 70, G.MAP_W - 70)
        const ty = G.clamp(n.y, 80, G.MAP_H - 60)
        addFx({ kind: 'ring', x: n.x, y: n.y, dur: 700, color: col, size: n.isTower ? 78 : 62 })
        addFx({ kind: 'text', x: tx, y: ty - (n.isTower ? 62 : 54), dur: 1300, color: col, text: 'ЗАХВАЧЕНО!', size: n.isTower ? 24 : 21 })
        addFx({ kind: 'boom', x: n.x, y: n.y, dur: 460, color: col, size: 46, seeds: Array.from({ length: 10 }).map(() => Math.random() * Math.PI * 2) })
        shake(6)
      }
      // Гарнизонный бейдж подпрыгнет от смены владельца
      badgePopRef.current.set(n.key, nowMs)
    }

    // Пульс бейджа при заметном изменении гарнизона
    for (const n of nodes) {
      const g = n.isTower ? game.towers.find((t) => t.id === Number(n.key.slice(1)))?.garrison : game.buildings.find((b) => b.id === Number(n.key.slice(1)))?.garrison
      if (g === undefined) continue
      const before = prevGarrRef.current.get(n.key)
      prevGarrRef.current.set(n.key, g)
      if (before !== undefined && Math.abs(g - before) >= 2) badgePopRef.current.set(n.key, nowMs)
    }
  }, [game])

  // ---------- Цикл отрисовки ----------
  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    let lastDraw = 0
    const FRAME_MIN_MS = 1000 / 40 // ~40 fps — плавно и заметно легче для GPU

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const scale = Math.min(w / G.MAP_W, h / G.MAP_H)
      viewRef.current = { scale, ox: (w - G.MAP_W * scale) / 2, oy: (h - G.MAP_H * scale) / 2 }
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)

    // ---------- Отрисовка ----------
    const draw = (ts: number) => {
      if (!running) return
      raf = requestAnimationFrame(draw)
      if (ts - lastDraw < FRAME_MIN_MS) return
      lastDraw = ts
      if (document.hidden) return
      const { game: g, localAt } = gameRef.current
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      let { scale, ox, oy } = viewRef.current
      const nowLocal = performance.now()
      const elapsedSec = Math.min(0.5, (nowLocal - localAt) / 1000)
      const evSpeed = g.event?.kind === 'speed' ? 1.8 : 1
      const spd = G.MARCH_SPEED * evSpeed

      // Тряска экрана
      const shake = shakeRef.current
      if (shake.until > nowLocal && shake.mag > 0) {
        const k = (shake.until - nowLocal) / 340
        ox += (Math.random() - 0.5) * shake.mag * 2 * k
        oy += (Math.random() - 0.5) * shake.mag * 2 * k
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#123a20'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy)

      // Вне поля: та же трава, но увеличена и затемнена — «лес вокруг арены»
      const terrainBg = getTerrainCanvas()
      if (terrainBg) {
        ctx.save()
        ctx.globalAlpha = 0.55
        ctx.drawImage(terrainBg, -G.MAP_W * 0.7, -G.MAP_H * 0.7, G.MAP_W * 2.4, G.MAP_H * 2.4)
        ctx.restore()
        ctx.fillStyle = 'rgba(8,24,12,0.62)'
        ctx.fillRect(-G.MAP_W, -G.MAP_H, G.MAP_W * 3, G.MAP_H * 3)
      } else {
        ctx.fillStyle = '#0e2b16'
        ctx.fillRect(-G.MAP_W, -G.MAP_H, G.MAP_W * 3, G.MAP_H * 3)
      }

      // Яркая травяная арена (генерируется один раз в offscreen-canvas)
      const terrain = getTerrainCanvas()
      if (terrain) ctx.drawImage(terrain, 0, 0)
      else {
        ctx.fillStyle = '#79c247'
        ctx.fillRect(0, 0, G.MAP_W, G.MAP_H)
      }
      // Тонкая светлая рамка поля
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'
      ctx.lineWidth = 2
      ctx.strokeRect(1, 1, G.MAP_W - 2, G.MAP_H - 2)

      const t = nowLocal / 1000
      const dt = Math.min(0.2, (ts - lastPrevTs) / 1000)
      lastPrevTs = ts

      // ---------- Облака ----------
      for (const c of cloudsRef.current) {
        c.x += c.spd * dt
        if (c.x - c.r > G.MAP_W) c.x = -c.r
        const cg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r)
        cg.addColorStop(0, `rgba(148,180,220,${c.a})`)
        cg.addColorStop(1, 'rgba(148,180,220,0)')
        ctx.fillStyle = cg
        ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2)
      }

      // ---------- Марши (пунктирные маршруты + колонны юнитов) ----------
      for (const m of g.marches) {
        const mDist = Math.max(1, G.dist(m.fx, m.fy, m.tx, m.ty))
        const p = Math.min(0.999, m.progress + (elapsedSec * spd) / mDist)
        const hx = m.fx + (m.tx - m.fx) * p
        const hy = m.fy + (m.ty - m.fy) * p
        // Пунктирная линия маршрута
        ctx.strokeStyle = m.color
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 4
        ctx.setLineDash([12, 14])
        ctx.lineDashOffset = -((t * 60) % 26)
        ctx.beginPath()
        ctx.moveTo(m.fx, m.fy)
        ctx.lineTo(hx, hy)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1

        // Колонна юнитов — цепочка точек или бегущие лисы
        const n = G.clamp(Math.round(m.units / 4), 2, 12)
        const dx = m.tx - m.fx
        const dy = m.ty - m.fy
        const len = mDist
        const ux = dx / len
        const uy = dy / len
        const px = -uy
        const py = ux
        const mpSeat = g.players[m.seat]
        const foxMarch = mpSeat ? G.skinById(mpSeat.skin).fox === true : false
        const mAng = Math.atan2(dy, dx)
        if (foxMarch) {
          for (let i = 0; i < n; i++) {
            const back = i * (900 / len) + 0.015 * (n - i)
            const q = Math.max(0, p - back * 0.14)
            const wob = Math.sin(t * 7 + i * 1.7) * 6
            const x = m.fx + dx * q + px * wob
            const y = m.fy + dy * q + py * wob
            drawFoxUnit(ctx, x, y, mAng, i === 0 ? 11 : 9, t, i * 1.3, m.color)
          }
        } else {
          ctx.shadowColor = m.color
          ctx.shadowBlur = 7
          for (let i = 0; i < n; i++) {
            const back = i * (900 / len) + 0.015 * (n - i)
            const q = Math.max(0, p - back * 0.14)
            const wob = Math.sin(t * 7 + i * 1.7) * 6
            const x = m.fx + dx * q + px * wob
            const y = m.fy + dy * q + py * wob
            ctx.fillStyle = m.color
            ctx.beginPath()
            ctx.arc(x, y, 6.5, 0, Math.PI * 2)
            ctx.fill()
            ctx.shadowBlur = 0
            ctx.fillStyle = 'rgba(255,255,255,0.85)'
            ctx.beginPath()
            ctx.arc(x, y - 1.5, 2.2, 0, Math.PI * 2)
            ctx.fill()
            if (i < n - 1) ctx.shadowBlur = 7
          }
        }

        // Вожак с флажком
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(hx, hy, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = m.color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(hx, hy, 9, 0, Math.PI * 2)
        ctx.stroke()

        // Предупреждение у цели перед ударом
        if (p > 0.86) {
          const warn = (p - 0.86) / 0.14
          ctx.strokeStyle = m.color
          ctx.globalAlpha = 0.35 + 0.4 * warn * Math.abs(Math.sin(t * 10))
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.arc(m.tx, m.ty, 26 + 8 * (1 - warn), 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
        }
      }

      // ---------- Здания ----------
      for (const b of g.buildings) {
        const owner = b.owner ? g.players.find((pl) => pl.id === b.owner) ?? null : null
        const col = owner ? owner.color : NEUTRAL_COL
        const isSel = selRef.current?.kind === 'building' && selRef.current.id === b.id
        const isMine = owner && owner.id === myId

        // Тень-подложка
        ctx.fillStyle = 'rgba(14,30,16,0.55)'
        roundRect(ctx, b.x - 34, b.y - 30, 68, 60, 12)
        ctx.fill()
        ctx.strokeStyle = col
        ctx.globalAlpha = owner ? 0.95 : 0.55
        ctx.lineWidth = isSel ? 4 : 2.5
        if (isSel) {
          ctx.shadowColor = '#fff'
          ctx.shadowBlur = 14
        } else if (owner) {
          ctx.shadowColor = col
          ctx.shadowBlur = 10
        }
        roundRect(ctx, b.x - 34, b.y - 30, 68, 60, 12)
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1

        drawBuildingIcon(ctx, b.type, b.x, b.y - 4, col)

        // Живые спецэффекты зданий
        if (b.type === 'radio') {
          // Сигнальные дуги
          const phase = (t * 0.9 + b.id * 0.33) % 1
          ctx.strokeStyle = col
          ctx.globalAlpha = 0.5 * (1 - phase)
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.arc(b.x, b.y - 20, 12 + phase * 34, -2.35, -0.79)
          ctx.stroke()
          ctx.beginPath()
          ctx.arc(b.x, b.y - 20, 12 + ((phase + 0.5) % 1) * 34, -2.35, -0.79)
          ctx.stroke()
          ctx.globalAlpha = 1
        } else if (b.type === 'depot') {
          // Пульсирующий щит-шестигранник
          const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + b.id)
          ctx.strokeStyle = col
          ctx.globalAlpha = 0.25 + 0.3 * pulse
          ctx.lineWidth = 2
          ctx.beginPath()
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI / 3) * i - Math.PI / 6
            const vx = b.x + Math.cos(a) * (30 + pulse * 4)
            const vy = b.y - 2 + Math.sin(a) * (30 + pulse * 4)
            if (i === 0) ctx.moveTo(vx, vy)
            else ctx.lineTo(vx, vy)
          }
          ctx.closePath()
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        // Эмиссия частиц
        const em = AMB_EMISSION[b.type]
        if (em && ambRef.current.length < 70 && Math.random() < em.rate * dt) {
          ambRef.current.push({
            x: b.x + (Math.random() - 0.5) * 30,
            y: b.y + 8,
            vx: (Math.random() - 0.5) * 10,
            vy: em.vy * (0.7 + Math.random() * 0.6),
            life: 0,
            max: 1.4 + Math.random() * 0.9,
            color: em.color,
            r: 1.7 + Math.random() * 2,
          })
        }

        // Уровень — точки
        for (let i = 0; i < G.BUILDING_MAX_LEVEL; i++) {
          ctx.beginPath()
          ctx.arc(b.x - 12 + i * 12, b.y + 22, 3.4, 0, Math.PI * 2)
          ctx.fillStyle = i < b.level ? col : '#233140'
          ctx.fill()
        }

        // Подпись с доходом
        const rate = G.BUILDING_RATE[b.type]
        let label = G.BUILDING_NAMES[b.type]
        if (owner && rate.res !== 'none') {
          const val = rate.rate * b.level
          const icon = rate.res === 'gold' ? '◎' : rate.res === 'wood' ? '▲' : '✦'
          label = `${label} +${val.toFixed(1)}/${icon}`
        } else if (owner) {
          label = `${label} (${G.BUILDING_EFFECT[b.type]})`
        }
        ctx.font = '600 17px system-ui, sans-serif'
        ctx.textAlign = 'center'
        const tw = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(10,22,13,0.82)'
        roundRect(ctx, b.x - tw / 2 - 8, b.y + 34, tw + 16, 24, 7)
        ctx.fill()
        ctx.fillStyle = isMine ? '#e2e8f0' : owner ? col : '#8ea1b3'
        ctx.fillText(label, b.x, b.y + 51)

        // Гарнизон здания
        if (b.garrison > 0) {
          const pop = badgePopFor(badgePopRef.current, `b${b.id}`, nowLocal)
          ctx.font = `800 ${14 * (1 + 0.35 * pop)}px system-ui, sans-serif`
          ctx.fillStyle = '#0b0f14'
          pill(ctx, b.x + 30, b.y - 32, 30 * (1 + 0.25 * pop), 20 * (1 + 0.3 * pop), 9)
          ctx.fill()
          ctx.fillStyle = col
          ctx.fillText(String(Math.floor(b.garrison)), b.x + 30, b.y - 18)
        }
      }

      // ---------- Башни ----------
      for (const tw of g.towers) {
        const owner = tw.owner ? g.players.find((pl) => pl.id === tw.owner) ?? null : null
        const col = owner ? owner.color : NEUTRAL_COL
        const sk = owner ? G.skinById(owner.skin) : G.skinById('standard')
        const isSel = selRef.current?.kind === 'tower' && selRef.current.id === tw.id
        const isMine = owner && owner.id === myId
        const s = tw.home ? 1.18 : 1
        const breath = 0.7 + 0.3 * Math.sin(t * 2 + tw.id * 1.7)

        // Платформа
        ctx.fillStyle = 'rgba(16,34,18,0.75)'
        ctx.beginPath()
        ctx.ellipse(tw.x, tw.y + 26 * s, 34 * s, 12 * s, 0, 0, Math.PI * 2)
        ctx.fill()

        // Корпус башни
        const bodyW = 44 * s
        const bodyH = 52 * s
        const bx = tw.x - bodyW / 2
        const by = tw.y - bodyH / 2 - 8
        ctx.lineWidth = isSel ? 4 : 2.6
        if (isSel) {
          ctx.shadowColor = '#fff'
          ctx.shadowBlur = 16
        } else if (owner) {
          ctx.shadowColor = sk.glow
          ctx.shadowBlur = 8 + 8 * breath
        }
        if (sk.fox) {
          drawFoxTowerBody(ctx, tw.x, by, bodyW, bodyH, s, breath, sk)
        } else {
          ctx.fillStyle = owner ? sk.body : '#101923'
          ctx.strokeStyle = col
          roundRect(ctx, bx, by, bodyW, bodyH, 6)
          ctx.fill()
          ctx.stroke()
          ctx.shadowBlur = 0

          // Зубцы
          for (let i = 0; i < 3; i++) {
            const mx = bx - 3 + i * (bodyW / 3)
            ctx.fillStyle = owner ? sk.body : '#101923'
            ctx.strokeStyle = col
            ctx.lineWidth = 2
            roundRect(ctx, mx, by - 9, bodyW / 3 - 4, 11, 2)
            ctx.fill()
            ctx.stroke()
          }
          // Окно
          ctx.fillStyle = sk.glow
          ctx.globalAlpha = (owner ? 0.95 : 0.45) * (0.6 + 0.4 * breath)
          roundRect(ctx, tw.x - 6, tw.y - 20 * s, 12, 14, 5)
          ctx.fill()
          ctx.globalAlpha = 1

          // Маячок на крыше
          ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t * 2.4 + tw.id * 2.3))
          ctx.fillStyle = isSel ? '#fff' : col
          ctx.beginPath()
          ctx.arc(tw.x, by - 14, 3.2, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }

        // Уровень — звёзды
        const stars = '★'.repeat(tw.level) + '☆'.repeat(G.TOWER_MAX_LEVEL - tw.level)
        ctx.font = `600 ${tw.home ? 13 : 11}px system-ui, sans-serif`
        ctx.textAlign = 'center'
        ctx.fillStyle = col
        ctx.fillText(stars, tw.x, tw.y + bodyH / 2 + 12)

        // № башни
        ctx.font = '600 12px system-ui, sans-serif'
        ctx.fillStyle = 'rgba(148,163,184,0.75)'
        ctx.fillText(`№${tw.id}`, tw.x, tw.y + bodyH / 2 + 28)

        // Числовой бейдж гарнизона (с пульсом при изменении)
        const garrison = Math.floor(tw.garrison)
        const pop = badgePopFor(badgePopRef.current, `t${tw.id}`, nowLocal)
        const badgeW = (garrison >= 100 ? 46 : 34) * (1 + 0.22 * pop)
        const badgeH = 26 * (1 + 0.3 * pop)
        ctx.fillStyle = col
        ctx.strokeStyle = 'rgba(7,11,16,0.9)'
        ctx.lineWidth = 3
        pill(ctx, tw.x, by - 16, badgeW, badgeH, 8)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#071018'
        ctx.font = `900 ${17 * (1 + 0.35 * pop)}px system-ui, sans-serif`
        ctx.fillText(String(garrison), tw.x, by - 8)

        // Метка «Я» над своей базой
        if (isMine && tw.home) {
          ctx.fillStyle = '#facc15'
          roundRect(ctx, tw.x - 11, by - 58, 22, 22, 5)
          ctx.fill()
          ctx.fillStyle = '#1c1917'
          ctx.font = '900 15px system-ui, sans-serif'
          ctx.fillText('Я', tw.x, by - 42)
        }

        // Имя владельца
        if (owner && tw.home) {
          ctx.font = '800 18px system-ui, sans-serif'
          ctx.fillStyle = col
          ctx.fillText(isMine ? `${owner.name} (вы)` : owner.name, tw.x, by - 68)
        }

        // Выбор — пульсирующее кольцо
        if (isSel) {
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2.5
          ctx.setLineDash([9, 7])
          ctx.lineDashOffset = -((t * 40) % 16)
          ctx.beginPath()
          ctx.arc(tw.x, tw.y, 52 * s, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // ---------- Частицы-эмиссия ----------
      for (let i = ambRef.current.length - 1; i >= 0; i--) {
        const p = ambRef.current[i]
        p.life += dt
        if (p.life > p.max) {
          ambRef.current.splice(i, 1)
          continue
        }
        p.x += p.vx * dt
        p.y += p.vy * dt
        const a = 1 - p.life / p.max
        ctx.globalAlpha = a * 0.85
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // ---------- Боевые эффекты ----------
      const fxs = fxRef.current
      for (let i = fxs.length - 1; i >= 0; i--) {
        const f = fxs[i]
        const age = (nowLocal - f.born) / f.dur
        if (age >= 1) {
          fxs.splice(i, 1)
          continue
        }
        if (f.kind === 'boom') {
          // Вспышка
          const rr = f.size * (0.35 + 0.65 * age)
          const ga = (1 - age) * 0.85
          const bg = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, rr)
          bg.addColorStop(0, `rgba(255,241,190,${ga})`)
          bg.addColorStop(0.45, hexA(f.color, ga * 0.8))
          bg.addColorStop(1, hexA(f.color, 0))
          ctx.fillStyle = bg
          ctx.beginPath()
          ctx.arc(f.x, f.y, rr, 0, Math.PI * 2)
          ctx.fill()
          // Осколки
          if (f.seeds) {
            for (let k = 0; k < f.seeds.length; k++) {
              const a = f.seeds[k]
              const dd = f.size * 0.9 * easeOut(age)
              const sx = f.x + Math.cos(a) * dd
              const sy = f.y + Math.sin(a) * dd - 10 * age
              ctx.globalAlpha = 1 - age
              ctx.fillStyle = k % 3 === 0 ? '#fde68a' : f.color
              ctx.beginPath()
              ctx.arc(sx, sy, 3.2 * (1 - age * 0.6), 0, Math.PI * 2)
              ctx.fill()
              ctx.globalAlpha = 1
            }
          }
        } else if (f.kind === 'ring') {
          const rr = f.size * (0.3 + 0.7 * easeOut(age))
          ctx.strokeStyle = f.color
          ctx.globalAlpha = (1 - age) * 0.9
          ctx.lineWidth = 4 * (1 - age) + 1
          ctx.beginPath()
          ctx.arc(f.x, f.y, rr, 0, Math.PI * 2)
          ctx.stroke()
          ctx.globalAlpha = 1
        } else {
          // text
          const rise = 36 * easeOut(age)
          ctx.font = `900 ${f.size}px system-ui, sans-serif`
          ctx.textAlign = 'center'
          ctx.globalAlpha = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.25
          ctx.lineWidth = 4
          ctx.strokeStyle = 'rgba(7,11,16,0.9)'
          ctx.strokeText(f.text ?? '', f.x, f.y - rise)
          ctx.fillStyle = f.color
          ctx.fillText(f.text ?? '', f.x, f.y - rise)
          ctx.globalAlpha = 1
        }
      }
    }
    let lastPrevTs = performance.now()
    raf = requestAnimationFrame(draw)

    // ---------- Ввод ----------
    const toWorld = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect()
      const { scale, ox, oy } = viewRef.current
      return { x: (clientX - rect.left - ox) / scale, y: (clientY - rect.top - oy) / scale }
    }
    const handleTap = (clientX: number, clientY: number) => {
      const { game: g } = gameRef.current
      const w = toWorld(clientX, clientY)
      let best: Selection = null
      let bestD = Infinity
      for (const tw of g.towers) {
        const d = G.dist(w.x, w.y, tw.x, tw.y)
        if (d < R_NODE + (tw.home ? 12 : 0) && d < bestD) {
          bestD = d
          best = { kind: 'tower', id: tw.id }
        }
      }
      for (const b of g.buildings) {
        const d = G.dist(w.x, w.y, b.x, b.y)
        if (d < R_NODE && d < bestD) {
          bestD = d
          best = { kind: 'building', id: b.id }
        }
      }
      onSelect(best)
    }
    const onPointerDown = (e: PointerEvent) => {
      handleTap(e.clientX, e.clientY)
    }
    canvas.addEventListener('pointerdown', onPointerDown)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
    }
  }, [myId])

  return (
    <div ref={wrapRef} role="img" aria-label="Карта боя: башни, здания и армии" className="relative h-full w-full touch-none select-none">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}

// ---------- Хелперы ----------

/** Лисья башня (секретный скин «Лисья база»): рыжий корпус, уши, мордочка, хвост */
function drawFoxTowerBody(
  ctx: CanvasRenderingContext2D,
  cx: number,
  by: number,
  bodyW: number,
  bodyH: number,
  s: number,
  breath: number,
  sk: G.SkinDef
) {
  const glow = sk.glow
  // Хвост у основания (слева)
  const tailWag = Math.sin(breath * 3) * 6
  ctx.strokeStyle = '#c2410c'
  ctx.lineWidth = 12 * s
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx - bodyW * 0.42, by + bodyH * 0.7)
  ctx.quadraticCurveTo(cx - bodyW * 0.95, by + bodyH * 0.45, cx - bodyW * 0.8, by + bodyH * 0.1 + tailWag)
  ctx.stroke()
  ctx.strokeStyle = '#fff7ed'
  ctx.lineWidth = 6 * s
  ctx.beginPath()
  ctx.moveTo(cx - bodyW * 0.86, by + bodyH * 0.26 + tailWag * 0.6)
  ctx.lineTo(cx - bodyW * 0.8, by + bodyH * 0.1 + tailWag)
  ctx.stroke()
  ctx.lineCap = 'butt'

  // Корпус
  ctx.fillStyle = sk.body
  ctx.strokeStyle = glow
  ctx.lineWidth = 2.6
  roundRect(ctx, cx - bodyW / 2, by, bodyW, bodyH, 10)
  ctx.fill()
  ctx.stroke()

  // Уши
  const earH = 16 * s
  ctx.fillStyle = '#9a3412'
  ctx.strokeStyle = glow
  ctx.lineWidth = 2
  for (const side of [-1, 1]) {
    const ex = cx + side * bodyW * 0.26
    ctx.beginPath()
    ctx.moveTo(ex - 7 * s, by + 4)
    ctx.lineTo(ex + side * 3, by - earH)
    ctx.lineTo(ex + 7 * s, by + 4)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
  // Кончики ушей
  ctx.fillStyle = '#1c0a05'
  for (const side of [-1, 1]) {
    const ex = cx + side * bodyW * 0.26
    ctx.beginPath()
    ctx.moveTo(ex - 2.4 * s, by - earH * 0.45)
    ctx.lineTo(ex + side * 1.4, by - earH)
    ctx.lineTo(ex + 2.6 * s, by - earH * 0.4)
    ctx.closePath()
    ctx.fill()
  }

  // Белая мордочка-окно
  ctx.fillStyle = '#fff7ed'
  ctx.beginPath()
  ctx.ellipse(cx, by + bodyH * 0.62, bodyW * 0.3, bodyH * 0.22, 0, 0, Math.PI * 2)
  ctx.fill()
  // Нос
  ctx.fillStyle = '#1c0a05'
  ctx.beginPath()
  ctx.moveTo(cx - 3.4 * s, by + bodyH * 0.56)
  ctx.lineTo(cx + 3.4 * s, by + bodyH * 0.56)
  ctx.lineTo(cx, by + bodyH * 0.64)
  ctx.closePath()
  ctx.fill()
  // Глаза (моргают)
  const blink = Math.sin(breath * 5) > 0.94 ? 0.25 : 1
  ctx.fillStyle = '#1c0a05'
  ctx.beginPath()
  ctx.ellipse(cx - 7 * s, by + bodyH * 0.34, 2.6 * s, 3.2 * s * blink, 0, 0, Math.PI * 2)
  ctx.ellipse(cx + 7 * s, by + bodyH * 0.34, 2.6 * s, 3.2 * s * blink, 0, 0, Math.PI * 2)
  ctx.fill()

  // Маячок-фонарик над головой
  ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(breath * 2.2))
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(cx, by - earH - 6 * s, 3.2 * s, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1
}

/** Бегущая лиса (юнит лисьей армии) */
function drawFoxUnit(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ang: number,
  size: number,
  t: number,
  phase: number,
  glow: string
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.shadowColor = glow
  ctx.shadowBlur = 6

  // Ноги
  const swing = Math.sin(t * 12 + phase) * 3.4
  ctx.strokeStyle = '#7c2d12'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-2, size * 0.25)
  ctx.lineTo(-2 + swing, size * 0.7)
  ctx.moveTo(3, size * 0.25)
  ctx.lineTo(3 - swing, size * 0.7)
  ctx.stroke()
  ctx.lineCap = 'butt'

  // Хвост с белым кончиком
  const wag = Math.sin(t * 9 + phase) * 1.6
  ctx.strokeStyle = '#ea580c'
  ctx.lineWidth = size * 0.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-size * 0.7, 0)
  ctx.quadraticCurveTo(-size * 1.7, -size * 0.5, -size * 2.0, -size * 0.15 + wag)
  ctx.stroke()
  ctx.shadowBlur = 0
  ctx.strokeStyle = '#fff7ed'
  ctx.lineWidth = size * 0.3
  ctx.beginPath()
  ctx.moveTo(-size * 1.86, -size * 0.32 + wag * 0.7)
  ctx.lineTo(-size * 2.0, -size * 0.15 + wag)
  ctx.stroke()

  // Тело и голова
  ctx.fillStyle = '#ea580c'
  ctx.beginPath()
  ctx.ellipse(0, 0, size * 0.95, size * 0.55, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(size * 0.85, -size * 0.28, size * 0.48, 0, Math.PI * 2)
  ctx.fill()

  // Уши
  ctx.fillStyle = '#7c2d12'
  ctx.beginPath()
  ctx.moveTo(size * 0.6, -size * 0.55)
  ctx.lineTo(size * 0.72, -size * 1.05)
  ctx.lineTo(size * 0.95, -size * 0.6)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(size * 0.95, -size * 0.55)
  ctx.lineTo(size * 1.15, -size * 1.0)
  ctx.lineTo(size * 1.25, -size * 0.5)
  ctx.closePath()
  ctx.fill()

  // Белая мордочка
  ctx.fillStyle = '#fff7ed'
  ctx.beginPath()
  ctx.ellipse(size * 1.05, -size * 0.12, size * 0.3, size * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}

function easeOut(x: number): number {
  return 1 - (1 - x) * (1 - x)
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`
}

/** Пульс бейджа: 1 → 0 за 350 мс после изменения */
function badgePopFor(map: Map<string, number>, key: string, nowMs: number): number {
  const born = map.get(key)
  if (!born) return 0
  const k = 1 - (nowMs - born) / 350
  if (k <= 0) {
    map.delete(key)
    return 0
  }
  return k
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** Пилюля с центром (cx, cy) */
function pill(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, r: number) {
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, r)
}

/** Векторные иконки зданий в неоновом стиле */
function drawBuildingIcon(ctx: CanvasRenderingContext2D, type: G.BuildingType, x: number, y: number, col: string) {
  ctx.fillStyle = col
  ctx.strokeStyle = col
  switch (type) {
    case 'mine': // ромб-кристалл
      ctx.beginPath()
      ctx.moveTo(x, y - 13)
      ctx.lineTo(x + 11, y)
      ctx.lineTo(x, y + 13)
      ctx.lineTo(x - 11, y)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(7,11,16,0.55)'
      ctx.beginPath()
      ctx.moveTo(x, y - 6)
      ctx.lineTo(x + 5, y)
      ctx.lineTo(x, y + 6)
      ctx.lineTo(x - 5, y)
      ctx.closePath()
      ctx.fill()
      break
    case 'sawmill': // ели
      ctx.beginPath()
      ctx.moveTo(x - 6, y - 12)
      ctx.lineTo(x + 2, y)
      ctx.lineTo(x - 14, y)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(x + 8, y - 6)
      ctx.lineTo(x + 16, y + 6)
      ctx.lineTo(x, y + 6)
      ctx.closePath()
      ctx.fill()
      ctx.fillRect(x - 8, y + 6, 5, 7)
      ctx.fillRect(x + 9, y + 6, 5, 7)
      break
    case 'lab': // колба
      ctx.fillRect(x - 3, y - 14, 6, 8)
      ctx.beginPath()
      ctx.moveTo(x - 4, y - 7)
      ctx.lineTo(x - 11, y + 9)
      ctx.quadraticCurveTo(x, y + 16, x + 11, y + 9)
      ctx.lineTo(x + 4, y - 7)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(7,11,16,0.6)'
      ctx.beginPath()
      ctx.arc(x - 2, y + 6, 2.2, 0, Math.PI * 2)
      ctx.arc(x + 4, y + 8, 1.6, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'barracks': // щит с мечами
      ctx.beginPath()
      ctx.moveTo(x, y - 14)
      ctx.lineTo(x + 11, y - 9)
      ctx.lineTo(x + 11, y + 3)
      ctx.quadraticCurveTo(x + 11, y + 11, x, y + 15)
      ctx.quadraticCurveTo(x - 11, y + 11, x - 11, y + 3)
      ctx.lineTo(x - 11, y - 9)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(7,11,16,0.85)'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x - 5, y - 4)
      ctx.lineTo(x + 5, y + 6)
      ctx.moveTo(x + 5, y - 4)
      ctx.lineTo(x - 5, y + 6)
      ctx.stroke()
      break
    case 'radio': // радиовышка
      ctx.lineWidth = 2.6
      ctx.beginPath()
      ctx.moveTo(x, y - 15)
      ctx.lineTo(x - 8, y + 14)
      ctx.moveTo(x, y - 15)
      ctx.lineTo(x + 8, y + 14)
      ctx.moveTo(x - 5, y + 4)
      ctx.lineTo(x + 5, y + 4)
      ctx.moveTo(x - 3, y - 6)
      ctx.lineTo(x + 3, y - 6)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y - 17, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      ctx.arc(x, y - 17, 8, -2.4, -0.7)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y - 17, 12, -2.4, -0.7)
      ctx.stroke()
      ctx.globalAlpha = 1
      break
    case 'depot': // шестигранник-склад
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6
        const vx = x + Math.cos(a) * 13
        const vy = y + Math.sin(a) * 13
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = 'rgba(7,11,16,0.6)'
      ctx.fillRect(x - 5, y - 2, 10, 8)
      break
  }
}

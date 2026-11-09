'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Search,
  Swords,
  HelpCircle,
  LogOut,
  Radio,
  Crown,
  Gem,
  Check,
  ShoppingCart,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Ticket,
  Settings,
  RotateCcw,
  UserRound,
  Rocket,
} from 'lucide-react'
import * as G from '@/lib/game/shared'
import { getTerrainCanvas } from '@/lib/game/terrain'
import type { GameActions, SearchStatus, Wallet } from '@/hooks/use-game'
import { loadName, saveName, saveServerUrl, resolveServerUrl, VK_URL, openVk } from '@/hooks/use-game'

interface MenuScreenProps {
  connected: boolean
  phase: string
  search: SearchStatus | null
  error: string | null
  wallet: Wallet
  actions: GameActions
}

/* ============================ ЖИВОЙ ФОН — КАРТА БОЯ ============================ */

interface Cloud {
  x: number
  y: number
  r: number
  spd: number
  a: number
}

function BattleBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let running = true
    let lastDraw = 0
    const view = { s: 1, ox: 0, oy: 0, dpr: 1 }

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      const s = Math.max(w / G.MAP_W, h / G.MAP_H) // cover
      view.s = s
      view.ox = (w - G.MAP_W * s) / 2
      view.oy = (h - G.MAP_H * s) / 2
      view.dpr = dpr
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // ---- Узлы мини-карты (та же геометрия, что и в матче) ----
    const seatCols = G.PLAYER_COLORS
    const towers = [
      ...G.SEAT_POS.map((p, i) => ({ x: p.x, y: p.y, col: seatCols[i], home: true, lvl: 2 })),
      ...G.NEUTRAL_TOWER_DEFS.map((d) => ({ x: d.x, y: d.y, col: '#5c6f80', home: false, lvl: d.lvl })),
    ]
    const buildings = G.NEUTRAL_BUILDING_DEFS.map((d) => ({ ...d, col: '#5c6f80' }))

    // ---- Марши-фантомы ----
    interface Amb {
      fx: number
      fy: number
      tx: number
      ty: number
      dist: number
      p: number
      spd: number
      color: string
      n: number
    }
    const marches: Amb[] = []
    const spawnMarch = () => {
      for (let tries = 0; tries < 24; tries++) {
        const a = towers[Math.floor(Math.random() * towers.length)]
        const b = towers[Math.floor(Math.random() * towers.length)]
        const d = G.dist(a.x, a.y, b.x, b.y)
        if (a !== b && d > 320 && d < 1100) {
          marches.push({
            fx: a.x,
            fy: a.y,
            tx: b.x,
            ty: b.y,
            dist: d,
            p: 0,
            spd: 70 + Math.random() * 70,
            color: seatCols[Math.floor(Math.random() * seatCols.length)],
            n: 3 + Math.floor(Math.random() * 5),
          })
          return
        }
      }
    }
    for (let i = 0; i < 5; i++) {
      spawnMarch()
      if (marches[i]) marches[i].p = Math.random() * 0.8
    }

    // ---- Частицы над зданиями ----
    interface Part {
      x: number
      y: number
      vx: number
      vy: number
      life: number
      max: number
      color: string
      r: number
    }
    const parts: Part[] = []

    // ---- Облака ----
    const clouds: Cloud[] = Array.from({ length: 6 }).map((_, i) => ({
      x: (i * 337) % G.MAP_W,
      y: 80 + ((i * 211) % (G.MAP_H - 160)),
      r: 150 + ((i * 97) % 160),
      spd: 6 + (i % 3) * 4,
      a: 0.05 + (i % 3) * 0.02,
    }))

    const draw = (ts: number) => {
      if (!running) return
      raf = requestAnimationFrame(draw)
      if (ts - lastDraw < 40) return // ~25 fps для фона достаточно
      lastDraw = ts
      if (document.hidden) return
      const dt = Math.min(0.2, (ts - lastPrev) / 1000)
      lastPrev = ts
      const t = ts / 1000
      const { s, ox, oy, dpr } = view

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#123a20'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy)

      // Та же травяная арена, что и в бою
      const terrain = getTerrainCanvas()
      if (terrain) ctx.drawImage(terrain, 0, 0)

      // Свечение баз
      for (let i = 0; i < 4; i++) {
        const p = G.SEAT_POS[i]
        const gr = ctx.createRadialGradient(p.x, p.y, 20, p.x, p.y, 340)
        gr.addColorStop(0, `${seatCols[i]}22`)
        gr.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = gr
        ctx.fillRect(p.x - 340, p.y - 340, 680, 680)
      }

      // Облака
      for (const c of clouds) {
        c.x += c.spd * dt
        if (c.x - c.r > G.MAP_W) c.x = -c.r
        const gr = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r)
        gr.addColorStop(0, `rgba(148,180,220,${c.a})`)
        gr.addColorStop(1, 'rgba(148,180,220,0)')
        ctx.fillStyle = gr
        ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2)
      }

      // Марши
      for (const m of marches) {
        m.p += (m.spd * dt) / m.dist
        if (m.p >= 1.05) {
          const idx = marches.indexOf(m)
          marches.splice(idx, 1)
          spawnMarch()
          continue
        }
        const hx = m.fx + (m.tx - m.fx) * Math.min(1, m.p)
        const hy = m.fy + (m.ty - m.fy) * Math.min(1, m.p)
        ctx.strokeStyle = m.color
        ctx.globalAlpha = 0.4
        ctx.lineWidth = 3
        ctx.setLineDash([10, 14])
        ctx.lineDashOffset = -(t * 50) % 24
        ctx.beginPath()
        ctx.moveTo(m.fx, m.fy)
        ctx.lineTo(hx, hy)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
        for (let i = 0; i < m.n; i++) {
          const q = Math.max(0, m.p - i * 0.035)
          const dx = m.tx - m.fx
          const dy = m.ty - m.fy
          const wob = Math.sin(t * 6 + i * 1.8) * 7
          const px = -(dy / m.dist)
          const py = dx / m.dist
          ctx.fillStyle = m.color
          ctx.globalAlpha = 0.9
          ctx.beginPath()
          ctx.arc(m.fx + dx * q + px * wob, m.fy + dy * q + py * wob, 5.5, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      // Здания
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i]
        const pulse = 0.5 + 0.2 * Math.sin(t * 1.6 + i)
        ctx.fillStyle = 'rgba(8,13,19,0.9)'
        roundRect(ctx, b.x - 30, b.y - 26, 60, 52, 10)
        ctx.fill()
        ctx.strokeStyle = b.col
        ctx.globalAlpha = 0.55 + 0.15 * pulse
        ctx.lineWidth = 2
        roundRect(ctx, b.x - 30, b.y - 26, 60, 52, 10)
        ctx.stroke()
        ctx.globalAlpha = 1
        drawMiniIcon(ctx, b.type, b.x, b.y)
        // Частицы-эмиссия
        if (Math.random() < 0.05) {
          const em = BUILDING_EMISSION[b.type]
          if (em) {
            parts.push({
              x: b.x + (Math.random() - 0.5) * 26,
              y: b.y + 6,
              vx: (Math.random() - 0.5) * 8,
              vy: em.vy,
              life: 0,
              max: 1.6 + Math.random(),
              color: em.color,
              r: 1.6 + Math.random() * 2,
            })
          }
        }
      }

      // Башни
      towers.forEach((tw, i) => {
        const breath = 0.75 + 0.25 * Math.sin(t * 2 + i * 1.3)
        ctx.fillStyle = 'rgba(10,17,25,0.9)'
        ctx.beginPath()
        ctx.ellipse(tw.x, tw.y + 24, 30, 10, 0, 0, Math.PI * 2)
        ctx.fill()
        const bodyW = 38
        const bodyH = 46
        ctx.fillStyle = '#0d1620'
        ctx.strokeStyle = tw.col
        ctx.globalAlpha = tw.home ? 0.9 : 0.6
        ctx.lineWidth = tw.home ? 2.6 : 2
        ctx.shadowColor = tw.col
        ctx.shadowBlur = 10 * breath
        roundRect(ctx, tw.x - bodyW / 2, tw.y - bodyH / 2, bodyW, bodyH, 5)
        ctx.fill()
        ctx.stroke()
        ctx.shadowBlur = 0
        for (let k = 0; k < 3; k++) {
          const mx = tw.x - bodyW / 2 - 2 + k * (bodyW / 3)
          roundRect(ctx, mx, tw.y - bodyH / 2 - 8, bodyW / 3 - 3, 10, 2)
          ctx.fill()
          ctx.stroke()
        }
        ctx.globalAlpha = (tw.home ? 0.95 : 0.5) * breath
        ctx.fillStyle = tw.col
        roundRect(ctx, tw.x - 5, tw.y - 12, 10, 12, 4)
        ctx.fill()
        // Маяк
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.2 + i * 2.1))
        ctx.beginPath()
        ctx.arc(tw.x, tw.y - bodyH / 2 - 14, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      })

      // Частицы
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]
        p.life += dt
        if (p.life > p.max) {
          parts.splice(i, 1)
          continue
        }
        p.x += p.vx * dt
        p.y += p.vy * dt
        const a = 1 - p.life / p.max
        ctx.globalAlpha = a * 0.8
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // Виньетка (в экранных координатах) — мягко темнеет к краям, чтобы читался интерфейс
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const w = canvas.width / dpr
      const h = canvas.height / dpr
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.75)
      vg.addColorStop(0, 'rgba(8,20,10,0.04)')
      vg.addColorStop(1, 'rgba(6,16,8,0.72)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, w, h)
    }
    let lastPrev = performance.now()
    raf = requestAnimationFrame(draw)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Мягкие неоновые пятна */}
      <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-emerald-400/10 blur-[120px]" />
      <div className="absolute -right-32 top-1/3 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
      <canvas ref={canvasRef} className="h-full w-full opacity-100" />
      {/* Затемнение сверху/снизу для читаемости интерфейса */}
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#04120a]/90 via-[#04120a]/55 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#04120a] via-[#04120a]/80 to-transparent" />
    </div>
  )
}

const BUILDING_EMISSION: Record<G.BuildingType, { color: string; vy: number } | null> = {
  mine: { color: '#fbbf24', vy: -26 },
  sawmill: { color: '#a3e635', vy: -14 },
  lab: { color: '#22d3ee', vy: -20 },
  barracks: { color: '#f87171', vy: -12 },
  radio: null,
  depot: null,
}

function drawMiniIcon(ctx: CanvasRenderingContext2D, type: G.BuildingType, x: number, y: number) {
  ctx.fillStyle = '#8ea1b3'
  ctx.strokeStyle = '#8ea1b3'
  switch (type) {
    case 'mine':
      ctx.beginPath()
      ctx.moveTo(x, y - 11)
      ctx.lineTo(x + 9, y)
      ctx.lineTo(x, y + 11)
      ctx.lineTo(x - 9, y)
      ctx.closePath()
      ctx.fill()
      break
    case 'sawmill':
      ctx.beginPath()
      ctx.moveTo(x - 6, y - 10)
      ctx.lineTo(x + 2, y + 2)
      ctx.lineTo(x - 13, y + 2)
      ctx.closePath()
      ctx.fill()
      ctx.fillRect(x - 5, y + 2, 4, 6)
      break
    case 'lab':
      ctx.fillRect(x - 2.5, y - 11, 5, 7)
      ctx.beginPath()
      ctx.moveTo(x - 3, y - 5)
      ctx.lineTo(x - 9, y + 8)
      ctx.quadraticCurveTo(x, y + 14, x + 9, y + 8)
      ctx.lineTo(x + 3, y - 5)
      ctx.closePath()
      ctx.fill()
      break
    case 'barracks':
      ctx.beginPath()
      ctx.moveTo(x, y - 12)
      ctx.lineTo(x + 9, y - 7)
      ctx.lineTo(x + 9, y + 3)
      ctx.quadraticCurveTo(x + 9, y + 10, x, y + 13)
      ctx.quadraticCurveTo(x - 9, y + 10, x - 9, y + 3)
      ctx.lineTo(x - 9, y - 7)
      ctx.closePath()
      ctx.fill()
      break
    case 'radio':
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(x, y - 13)
      ctx.lineTo(x - 7, y + 12)
      ctx.moveTo(x, y - 13)
      ctx.lineTo(x + 7, y + 12)
      ctx.moveTo(x - 4, y + 4)
      ctx.lineTo(x + 4, y + 4)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y - 15, 2.5, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'depot':
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6
        const vx = x + Math.cos(a) * 11
        const vy = y + Math.sin(a) * 11
        if (i === 0) ctx.moveTo(vx, vy)
        else ctx.lineTo(vx, vy)
      }
      ctx.closePath()
      ctx.fill()
      break
  }
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

/* ============================ ВЫБОР НИКА (ОДИН РАЗ) ============================ */

function NicknameGate({ onDone }: { onDone: (name: string) => void }) {
  const [value, setValue] = useState('')
  const valid = value.trim().length >= 2
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#05070a]/97 px-4 backdrop-blur"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-sm rounded-3xl border border-sky-500/30 bg-[#0b1117] p-7 text-center shadow-[0_0_80px_rgba(56,189,248,0.15)]"
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/15">
          <UserRound className="h-8 w-8 text-sky-300" />
        </div>
        <h2 className="mt-4 text-2xl font-black text-white">Добро пожаловать!</h2>
        <p className="mt-1 text-sm text-slate-400">Как вас зовут, командир? Это имя увидят соперники в битвах.</p>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 16))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onDone(value.trim())
          }}
          placeholder="Например: Максим"
          className="mt-5 border-slate-700 bg-slate-800/70 text-center text-lg font-bold text-white placeholder:text-slate-500 focus-visible:ring-sky-500"
        />
        <Button
          disabled={!valid}
          onClick={() => onDone(value.trim())}
          className="mt-4 h-12 w-full bg-sky-500 text-base font-extrabold text-slate-950 hover:bg-sky-400"
        >
          <Swords className="mr-2 h-5 w-5" /> В бой!
        </Button>
        <p className="mt-3 text-[11px] text-slate-500">Имя сохраняется только на вашем устройстве.</p>
      </motion.div>
    </motion.div>
  )
}

/* ============================ МАГАЗИН (ОТДЕЛЬНАЯ КНОПКА) ============================ */

function SkinPreview({ skin, size = 64 }: { skin: G.SkinDef; size?: number }) {
  const w = size
  return (
    <svg width={w} height={w} viewBox="0 0 64 64">
      <rect x={18} y={22} width={28} height={30} rx={4} fill={skin.body} stroke={skin.glow} strokeWidth={2.5} />
      {[18, 28, 38].map((x) => (
        <rect key={x} x={x} y={15} width={8} height={8} rx={1.5} fill={skin.body} stroke={skin.glow} strokeWidth={2} />
      ))}
      <rect x={28} y={30} width={8} height={9} rx={4} fill={skin.glow} />
      <rect x={8} y={54} width={48} height={3} rx={1.5} fill={skin.glow} opacity={0.5} />
    </svg>
  )
}

function ShopDialog({
  open,
  onOpenChange,
  wallet,
  actions,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  wallet: Wallet
  actions: GameActions
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const flash = (ok: boolean, text: string) => {
    setNotice({ ok, text })
    setTimeout(() => setNotice(null), 3200)
  }
  const buy = (skin: G.SkinDef) => {
    setBusy(skin.id)
    const res = actions.shopBuy(skin.id)
    flash(res.ok, res.ok ? (res.message ?? 'Куплено!') : (res.error ?? 'Ошибка'))
    setBusy(null)
  }
  const select = (skin: G.SkinDef) => {
    setBusy(skin.id)
    const res = actions.shopSelect(skin.id)
    flash(res.ok, res.ok ? `Скин «${skin.name}» надет` : (res.error ?? 'Ошибка'))
    setBusy(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-h-[88vh] overflow-y-auto border-slate-700 bg-[#0b1117] text-slate-200 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-amber-400">
            <ShoppingCart className="h-5 w-5" /> Магазин
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-xl border border-slate-700/70 bg-slate-900/60 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Gem className="h-5 w-5 text-cyan-300 [filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" />
            <span className="text-2xl font-black text-cyan-200">{G.fmt(wallet.crystals)}</span>
            <span className="text-xs text-slate-500">кристаллов</span>
          </div>
          <div className="text-right text-[11px] leading-tight text-slate-500">
            Побед: <b className="text-slate-300">{wallet.matchesWon}</b>
            <br />
            Заработано: <b className="text-slate-300">{G.fmt(wallet.totalEarned)}</b>
          </div>
        </div>

        <div className="space-y-4">
          {[0, 1, 2, 3].map((tier) => {
            const tierSkins = G.SKINS.filter((s) => G.skinTier(s.price) === tier)
            if (tierSkins.length === 0) return null
            return (
              <div key={tier}>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{G.SKIN_TIER_NAMES[tier]}</span>
                  <span className="h-px flex-1 bg-slate-700/60" />
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {tierSkins.map((skin) => {
                    const owned = wallet.ownedSkins.includes(skin.id)
                    const selected = wallet.selectedSkin === skin.id
                    const affordable = wallet.crystals >= skin.price
                    return (
                      <div
                        key={skin.id}
                        className={`rounded-xl border p-3 transition-colors ${selected ? 'border-emerald-400/70 bg-emerald-950/30' : 'border-slate-700/60 bg-slate-800/40'}`}
                      >
                        <div className="flex items-center gap-3">
                          <SkinPreview skin={skin} size={52} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold text-slate-100">{skin.name}</div>
                            <div className="min-h-4 text-[11px] leading-tight text-amber-300/90">{skin.perk ?? 'Без бонусов — чистый стиль'}</div>
                          </div>
                        </div>
                        <div className="mt-2.5">
                          {selected ? (
                            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/15 py-1.5 text-xs font-bold text-emerald-300">
                              <Check className="h-3.5 w-3.5" /> Надет
                            </div>
                          ) : owned ? (
                            <Button size="sm" disabled={busy === skin.id} onClick={() => select(skin)} className="h-8 w-full bg-slate-700 text-xs font-bold text-white hover:bg-slate-600">
                              Надеть
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              disabled={busy === skin.id || !affordable}
                              onClick={() => buy(skin)}
                              className={`h-8 w-full text-xs font-bold ${affordable ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400' : 'bg-slate-800 text-slate-500'}`}
                            >
                              <Gem className="mr-1 h-3.5 w-3.5" /> {G.fmt(skin.price)}
                              {!affordable && <span className="ml-1 normal-case">— мало</span>}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold ${notice.ok ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200' : 'border-rose-500/40 bg-rose-950/60 text-rose-200'}`}
            >
              {notice.text}
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-[11px] text-slate-500">Скины видны всем игрокам в матче. Кристаллы дают матчи: победа +250, победы над командами, захваты.</p>
      </DialogContent>
    </Dialog>
  )
}

/* ============================ ПРОМОКОД (ОТДЕЛЬНАЯ КНОПКА) ============================ */

function PromoDialog({
  open,
  onOpenChange,
  wallet,
  actions,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  wallet: Wallet
  actions: GameActions
}) {
  const [promo, setPromo] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const redeem = async () => {
    if (!promo.trim()) return
    const res = await actions.promoRedeem(promo.trim())
    setNotice({ ok: res.ok, text: res.ok ? (res.message ?? 'Активировано!') : (res.error ?? 'Ошибка') })
    if (res.ok) setPromo('')
    setTimeout(() => setNotice(null), 4200)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="border-slate-700 bg-[#0b1117] text-slate-200 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-cyan-300">
            <Ticket className="h-5 w-5" /> Промокод
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Gem className="h-4 w-4 text-cyan-300" />
            Баланс: <b className="text-cyan-200">{G.fmt(wallet.crystals)}</b>
          </div>
          <Input
            value={promo}
            onChange={(e) => setPromo(e.target.value.slice(0, 24))}
            onKeyDown={async (e) => {
              if (e.key === 'Enter') await redeem()
            }}
            placeholder="Введите код…"
            className="border-slate-700 bg-slate-800/70 text-center font-mono text-lg tracking-[0.2em] text-white placeholder:text-slate-500"
          />
          <Button disabled={!promo.trim()} onClick={redeem} className="h-11 w-full bg-cyan-500 text-base font-bold text-slate-950 hover:bg-cyan-400">
            Активировать
          </Button>
          <p className="text-[11px] leading-relaxed text-slate-500">
            Каждый код работает один раз на устройстве. Кристаллы тратятся в «Магазине» на скины башен.
          </p>
          <AnimatePresence>
            {notice && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`rounded-xl border px-3 py-2 text-center text-sm font-semibold ${notice.ok ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200' : 'border-rose-500/40 bg-rose-950/60 text-rose-200'}`}
              >
                {notice.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ============================ НАСТРОЙКИ ============================ */

function SettingsDialog({ onReset }: { onReset: () => void }) {
  const [url, setUrl] = useState('')
  const [saved, setSaved] = useState(false)
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-12 w-full flex-col gap-0.5 rounded-xl border border-slate-700 bg-slate-900/70 text-slate-200 hover:bg-slate-800 hover:text-white">
          <Settings className="h-4.5 w-4.5" />
          <span className="text-[11px] font-bold">Настройки</span>
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto border-slate-700 bg-[#0b1117] text-slate-200 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold text-sky-400">Настройки</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-[13px] leading-relaxed text-slate-300">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Адрес игрового сервера</label>
            <div className="mt-2 flex gap-2">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value.trim())}
                placeholder="https://адрес-сервера"
                className="border-slate-700 bg-slate-800/70 font-mono text-xs text-white placeholder:text-slate-500"
              />
              <Button
                className="shrink-0 bg-sky-500 font-bold text-slate-950 hover:bg-sky-400"
                onClick={() => {
                  saveServerUrl(url)
                  setSaved(true)
                  setTimeout(() => setSaved(false), 1500)
                }}
              >
                {saved ? <Check className="h-4 w-4" /> : 'Сохранить'}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500">
              Текущий: <span className="font-mono">{resolveServerUrl() || '(авто)'}</span>. Оставьте пустым для авто-подключения. В приложении укажите адрес сервера, если подключиться не удаётся.
            </p>
          </div>
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-3">
            <div className="text-sm font-bold text-rose-300">Сброс прогресса</div>
            <p className="mt-1 text-[11px] text-slate-400">Удалит с устройства: кристаллы, купленные скины и активированные промокоды. Ник и имя останутся.</p>
            <Button onClick={onReset} variant="outline" className="mt-2 h-9 border-rose-500/40 text-rose-300 hover:bg-rose-950 hover:text-rose-200">
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Сбросить
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            Игра не собирает данные: всё хранится локально на устройстве. Уведомления не используются.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ============================ ЮРИДИЧЕСКИЕ ДОКУМЕНТЫ ============================ */

function LegalDialog({
  trigger,
  icon,
  title,
  children,
}: {
  trigger: string
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-xs text-slate-500 underline-offset-2 transition-colors hover:text-slate-300 hover:underline">
          {icon}
          {trigger}
        </button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto border-slate-700 bg-[#0b1117] text-slate-200 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-extrabold text-sky-400">{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-[13px] leading-relaxed text-slate-300">{children}</div>
      </DialogContent>
    </Dialog>
  )
}

function LegalLinks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      <LegalDialog trigger="Пользовательское соглашение" icon={<ScrollText className="h-3.5 w-3.5" />} title="Пользовательское соглашение">
        <p className="text-slate-400">Действует с 7 ноября 2026 года</p>
        <p>
          <b>1. Предмет соглашения.</b> «Неоновые Башни» (далее — Игра) — бесплатная онлайн-игра, предоставляемая «как есть» (as is). Нажимая «ИГРАТЬ» или иным образом используя Игру, вы принимаете это соглашение. Если вы не согласны с ним — не используйте Игру.
        </p>
        <p>
          <b>2. Виртуальная валюта и предметы.</b> Кристаллы, скины башен и промокоды — виртуальные предметы исключительно для развлечения внутри Игры. Они не имеют реальной стоимости, не обмениваются на реальные деньги, не являются имуществом и не подлежат возврату или компенсации. Кристаллы начисляются за матчи и хранятся только на вашем устройстве.
        </p>
        <p>
          <b>3. Правила честной игры.</b> Запрещены: читы, автоматизация, эксплойты, оскорбительные ники и поведение, мешающее другим игрокам. Игровое имя не должно нарушать закон и содержать персональные данные третьих лиц.
        </p>
        <p>
          <b>4. Онлайн-режим.</b> Для сетевых матчей требуется интернет. Мы не гарантируем непрерывную доступность сервера. Матч, прерванный по вашей вине, продолжает управляться ИИ. Награда начисляется на устройстве в конце матча.
        </p>
        <p>
          <b>5. Возраст.</b> Игра рекомендована от 13 лет. Младшим игрокам разрешается играть с согласия родителей.
        </p>
        <p>
          <b>6. Ограничение ответственности.</b> Игра предоставляется без гарантий. Мы не отвечаем за возможные убытки, потерю виртуальных предметов или неполадки на устройстве, возникшие в связи с использованием Игры.
        </p>
        <p>
          <b>7. Изменения.</b> Мы можем обновлять Игру и это соглашение; актуальная версия всегда доступна в меню. Продолжение игры означает согласие с изменениями.
        </p>
      </LegalDialog>
      <span className="text-slate-700">·</span>
      <LegalDialog trigger="Политика конфиденциальности" icon={<ShieldCheck className="h-3.5 w-3.5" />} title="Политика конфиденциальности">
        <p className="text-slate-400">Действует с 7 ноября 2026 года</p>
        <p>
          <b>Игра не собирает персональные данные.</b> Никакой регистрации, email, телефона, геолокации, рекламы, аналитики и трекеров. Мы ничего не узнаём о вас как о человеке.
        </p>
        <p>
          <b>Что хранится только на вашем устройстве:</b> игровое имя (ник), баланс кристаллов, купленные скины башен, список активированных промокодов и настройки. Эти данные никуда не отправляются и не могут быть прочитаны нами. Удаление данных приложения или очистка сайта в браузере стирает их навсегда.
        </p>
        <p>
          <b>Что происходит в онлайн-матче.</b> Чтобы сыграть с другими людьми, устройство временно передаёт на игровой сервер: ваше игровое имя и игровые действия (марши, захваты, улучшения). Матч существует только в оперативной памяти сервера и удаляется вскоре после его окончания. История матчей не ведётся.
        </p>
        <p>
          <b>Уведомления.</b> Игра не отправляет push-уведомления и не запрашивает разрешение на них. На Android приложению требуется только разрешение «Интернет». Камера, микрофон, контакты, файлы и геолокация не используются.
        </p>
        <p>
          <b>Передача данных.</b> Игровые данные матча не продаются и не передаются третьим лицам. Провайдер связи видит лишь факт подключения к серверу — как при любом интернет-трафике.
        </p>
        <p>
          <b>Дети.</b> Игра не собирает данные, позволяющие идентифицировать ребёнка, поэтому специальные родительские согласия на обработку данных не требуются.
        </p>
        <p>
          <b>Связь.</b> Вопросы о приватности задавайте в чате поддержки, откуда вы получили эту игру.
        </p>
      </LegalDialog>
    </div>
  )
}

/* ============================ ПОИСК МАТЧА ============================ */

function SearchOverlay({ search, actions }: { search: SearchStatus; actions: GameActions }) {
  const blips = Math.max(0, Math.min(3, search.found - 1))
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#04120a]/95 backdrop-blur-sm"
    >
      <div className="relative flex w-full max-w-md flex-col items-center gap-6 px-6">
        {/* Радар */}
        <div className="relative flex h-60 w-60 items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-emerald-400/25" />
          <div className="absolute inset-6 rounded-full border border-emerald-400/15" />
          <div className="absolute inset-12 rounded-full border border-emerald-400/10" />
          {/* Вращающийся луч */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{ background: 'conic-gradient(from 0deg, rgba(74,222,128,0.4), rgba(74,222,128,0.08) 55deg, transparent 70deg)' }}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2.6, ease: 'linear' }}
          />
          {/* Центр */}
          <div className="relative z-10 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15">
            <Search className="h-7 w-7 text-emerald-300" />
          </div>
          {/* Найденные игроки */}
          {Array.from({ length: blips }).map((_, i) => {
            const ang = (i / Math.max(3, blips)) * Math.PI * 2 - Math.PI / 2
            const bx = 100 + Math.cos(ang) * 132
            const by = 100 + Math.sin(ang) * 132
            return (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 15 }}
                className="absolute z-10 flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-500/20"
                style={{ left: bx, top: by, transform: 'translate(-50%, -50%)' }}
              >
                <UserRound className="h-4.5 w-4.5 text-emerald-300" />
              </motion.div>
            )
          })}
        </div>

        <div className="text-center">
          <motion.div
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
            className="text-2xl font-black text-white"
          >
            Идёт поиск…
          </motion.div>
          <div className="mt-1 text-sm text-slate-300">
            Игроков найдено: <b className="text-emerald-300">{search.found}</b>
          </div>
        </div>

        <Button variant="outline" onClick={actions.cancelSearch} className="border-slate-700 text-slate-300 hover:bg-slate-800">
          <LogOut className="mr-2 h-4 w-4" /> Отменить поиск
        </Button>
      </div>
    </motion.div>
  )
}

/* ============================ ГЛАВНОЕ МЕНЮ ============================ */

export default function MenuScreen({ connected, phase, search, error, wallet, actions }: MenuScreenProps) {
  const [name, setName] = useState(() => (typeof window !== 'undefined' ? loadName() : ''))
  const [nicknameLocked, setNicknameLocked] = useState(() => (typeof window !== 'undefined' ? loadName().trim().length > 0 : false))
  const [shopOpen, setShopOpen] = useState(false)
  const [promoOpen, setPromoOpen] = useState(false)

  const validName = name.trim().length >= 2

  // Ник выбирается один раз при первом входе в игру
  if (!nicknameLocked) {
    return (
      <div className="relative min-h-[100dvh] overflow-hidden bg-[#07090d]">
        <BattleBackdrop />
        <NicknameGate
          onDone={(n) => {
            saveName(n)
            setName(n)
            setNicknameLocked(true)
          }}
        />
      </div>
    )
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-[#05080c] px-4 py-8 text-slate-100">
      <BattleBackdrop />

      <AnimatePresence>{phase === 'searching' && search && <SearchOverlay key="search" search={search} actions={actions} />}</AnimatePresence>

      {/* Заголовок */}
      <motion.div initial={{ opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10 mb-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <Swords className="h-8 w-8 text-sky-400 [filter:drop-shadow(0_0_12px_rgba(56,189,248,0.8))] sm:h-10 sm:w-10" />
          <h1 className="text-4xl font-black tracking-tight text-white [text-shadow:0_0_40px_rgba(56,189,248,0.45)] sm:text-6xl">
            НЕОНОВЫЕ <span className="text-sky-400">БАШНИ</span>
          </h1>
        </div>
        <p className="mt-2 text-sm text-slate-400 sm:text-base">Онлайн-битва 2–4 командиров: захватывай башни и здания, копи ресурсы, сноси соперников</p>
      </motion.div>

      {/* Центральная карточка */}
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.5, delay: 0.1 }} className="relative z-10 w-full max-w-md space-y-4">
        <div className="rounded-3xl border border-slate-700/80 bg-[#0b1117]/85 p-6 shadow-[0_0_60px_rgba(56,189,248,0.08)] backdrop-blur-md">
          {/* Командир + баланс */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Командир</div>
              <div className="flex items-center gap-2 text-xl font-black text-white">
                <UserRound className="h-5 w-5 text-sky-400" />
                {name}
                <button
                  onClick={() => setNicknameLocked(false)}
                  className="text-[11px] font-semibold text-sky-400 underline-offset-2 hover:underline"
                  title="Сменить имя (хранится на устройстве)"
                >
                  сменить
                </button>
              </div>
            </div>
            <button
              onClick={() => setShopOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 transition-colors hover:bg-cyan-500/20"
              title="Магазин"
            >
              <Gem className="h-4.5 w-4.5 text-cyan-300 [filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" />
              <span className="text-lg font-black text-cyan-200">{G.fmt(wallet.crystals)}</span>
            </button>
          </div>

          {/* ЕДИНСТВЕННАЯ КНОПКА ИГРАТЬ */}
          <motion.div
            animate={{ boxShadow: ['0 0 24px rgba(56,189,248,0.35)', '0 0 44px rgba(56,189,248,0.6)', '0 0 24px rgba(56,189,248,0.35)'] }}
            transition={{ duration: 1.8, repeat: Infinity }}
            className="mt-5 rounded-2xl"
          >
            <Button
              disabled={!validName || !connected}
              onClick={() => actions.findGame(name.trim())}
              className="h-[74px] w-full bg-gradient-to-r from-sky-500 via-cyan-400 to-sky-500 text-2xl font-black tracking-wide text-slate-950 hover:from-sky-400 hover:via-cyan-300 hover:to-sky-400"
            >
              <Rocket className="mr-3 h-7 w-7" /> ИГРАТЬ
            </Button>
          </motion.div>
          <div className="mt-2 text-center text-[11px] leading-relaxed text-slate-300">
            Онлайн-матч: соперники подбираются автоматически (2–4 командира)
          </div>

          {/* Кнопка ВКонтакте */}
          <a
            href={VK_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault()
              openVk()
            }}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 text-sm font-bold text-sky-200 transition-colors hover:bg-sky-500/20"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 fill-sky-400" aria-hidden>
              <path d="M12.7 18.7c-5.9 0-9.3-4.1-9.4-10.9h3c.1 5 2.3 7.1 4 7.5V7.8h2.9v4.3c1.7-.2 3.5-2.2 4.1-4.3h2.8c-.5 2.7-2.4 4.6-3.8 5.4 1.4.7 3.6 2.5 4.4 5.5h-3.1c-.6-2-2.3-3.6-4.4-3.8v3.8h-.5Z" />
            </svg>
            Мы в ВКонтакте — новости и промокоды
          </a>

          {/* Отдельные кнопки меню */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            <Button onClick={() => setShopOpen(true)} className="h-[58px] w-full flex-col gap-0.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20">
              <ShoppingCart className="h-4.5 w-4.5" />
              <span className="text-[10px] font-bold">Магазин</span>
            </Button>
            <Button onClick={() => setPromoOpen(true)} className="h-[58px] w-full flex-col gap-0.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20">
              <Ticket className="h-4.5 w-4.5" />
              <span className="text-[10px] font-bold">Промокод</span>
            </Button>
            <RulesDialog />
            <SettingsDialog
              onReset={() => {
                actions.resetProgress()
              }}
            />
          </div>
        </div>

        {/* Статус сервера */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <Radio className={`h-3.5 w-3.5 ${connected ? 'text-sky-400' : 'text-rose-500'}`} />
          {connected ? 'Сервер онлайн · матчмейкинг активен' : 'Подключение к серверу…'}
        </div>
      </motion.div>

      {/* Юридические ссылки */}
      <div className="relative z-10 mt-6">
        <LegalLinks />
      </div>

      {/* Ошибки */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl border border-rose-500/40 bg-rose-950/90 px-4 py-2 text-sm font-semibold text-rose-200 shadow-lg">
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Диалоги */}
      <ShopDialog open={shopOpen} onOpenChange={setShopOpen} wallet={wallet} actions={actions} />
      <PromoDialog open={promoOpen} onOpenChange={setPromoOpen} wallet={wallet} actions={actions} />
    </div>
  )
}

function RulesDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-[58px] w-full flex-col gap-0.5 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20">
          <HelpCircle className="h-4.5 w-4.5" />
          <span className="text-[10px] font-bold">Как играть</span>
        </Button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-h-[85vh] overflow-y-auto border-slate-700 bg-[#0b1117] text-slate-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold text-sky-400">Правила «Неоновых башен»</DialogTitle>
        </DialogHeader>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-slate-300">
          <li>
            <b className="text-slate-100">Цель</b> — набрать наибольший счёт за 10 минут или выбить все чужие команды. Играют 2–4 командира, свободные места занимают соперники под управлением ИИ.
          </li>
          <li>
            <b className="text-slate-100">Башни и марши</b>: тапните свою башню, затем цель — часть гарнизона уйдёт маршем (пунктирная линия). Дошедшие бойцы захватывают цель, если их больше защитников.
          </li>
          <li>
            <b className="text-slate-100">Здания</b>: захватывайте Золотую шахту (+30/с золота), Лесопилку (+25/с дерева), Лабораторию (+5/с идей), Казарму (+пополнение), Радиовышку (+атака) и Снабжение (+защита). Здания можно улучшать до 3 уровня.
          </li>
          <li>
            <b className="text-slate-100">Ресурсы</b>: золото — найм бойцов, дерево — улучшения, идеи — исследования (+8% к атаке за уровень). Каждая ваша башня сама пополняет гарнизон.
          </li>
          <li>
            <b className="text-slate-100">Улучшения</b>: башня до ★3 — больше защитников и выше лимит. Исследования усиливают атаку армии.
          </li>
          <li>
            <b className="text-slate-100">События «ВЛАСТЬ…»</b>: время от времени включается «Власть экономики» (золото ×2), «Власть войны» (+40% атака) и другие — ловите момент!
          </li>
          <li>
            <b className="text-slate-100">Счёт команд</b>: растёт от добычи золота, захватов и побед над командами. Полоса наверху показывает, кто ведёт.
          </li>
          <li>
            <b className="text-slate-100">Онлайн</b>: нажмите «ИГРАТЬ» — идёт поиск, матч стартует автоматически на 2, 3 или 4 игроков. Отключившийся игрок передаётся ИИ и может вернуться.
          </li>
          <li>
            <b className="text-slate-100">Кристаллы</b>: за каждый матч — награда (победа +250, победы над командами +80, захваты +15). Тратьте их в «Магазине» на скины башен, активируйте промокоды.
          </li>
        </ol>
        <p className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 text-xs text-slate-400">
          <Sparkles className="h-4 w-4 shrink-0 text-amber-300" />
          Совет: скины из магазина видны всем в матче, а баланс и промокоды хранятся только на вашем устройстве.
        </p>
      </DialogContent>
    </Dialog>
  )
}

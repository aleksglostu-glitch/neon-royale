'use client'

/**
 * NEON ROYALE — боевой экран на весь экран.
 * Травяная арена (не чёрная), река с мостами, модели героев и башен,
 * перетаскивание карточек, статичный фон в оффскрин-канвасе (плавность).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ARENA, CARD_MAP, artOf, levelMult, towerSkin, type CardDef,
} from '@/lib/game/neon/cards'
import type { BattleView } from '@/lib/game/neon/engine'

interface BattleScreenProps {
  battle: BattleView
  deploy: (handIdx: number, x: number, y: number) => Promise<{ ok: boolean; error?: string }>
  onLeave: () => void
}

/* ============================ ГЕОМЕТРИЯ ============================ */
const W = ARENA.xMax - ARENA.xMin // 17.2
const H = ARENA.yMax - ARENA.yMin // 31.2

interface Cam {
  s: number
  cx: number
  cy: number
}

function makeCam(w: number, h: number): Cam {
  const s = Math.min(w / (W + 0.6), h / (H + 0.6))
  return { s, cx: w / 2, cy: h / 2 }
}

/* ============================ СТАТИЧНЫЙ ФОН ============================ */
let seedState = 1234567
function srand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff
  return seedState / 0x7fffffff
}

function drawStaticArena(bg: HTMLCanvasElement, cam: Cam, w: number, h: number, dpr = 1) {
  const c = bg.getContext('2d')
  if (!c) return
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  seedState = 987654321
  const { s, cx, cy } = cam
  const X = (x: number) => cx + x * s
  const Y = (y: number) => cy + y * s

  c.clearRect(0, 0, w, h)
  // Внешний фон
  const outer = c.createLinearGradient(0, 0, 0, h)
  outer.addColorStop(0, '#0a1626')
  outer.addColorStop(1, '#08101d')
  c.fillStyle = outer
  c.fillRect(0, 0, w, h)

  // Поле — трава двумя тонами (полосами, как у Clаsh Royale)
  const stripes = 12
  for (let i = 0; i < stripes; i++) {
    const y0 = Y(ARENA.yMin + (H / stripes) * i)
    const y1 = Y(ARENA.yMin + (H / stripes) * (i + 1))
    c.fillStyle = i % 2 === 0 ? '#3f9d4e' : '#379047'
    c.fillRect(X(ARENA.xMin), y0, W * s, y1 - y0 + 1)
  }
  // Виньетка по краям поля
  const vg = c.createRadialGradient(cx, cy, Math.min(w, h) * 0.28, cx, cy, Math.max(w, h) * 0.72)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(4,12,8,0.42)')
  c.fillStyle = vg
  c.fillRect(0, 0, w, h)

  // Травинки (детерминированные)
  const tufts = Math.floor((W * H) * 26)
  for (let i = 0; i < tufts; i++) {
    const gx = ARENA.xMin + srand() * W
    const gy = ARENA.yMin + srand() * H
    if (Math.abs(gy) < 0.75) continue // не на реке
    c.strokeStyle = srand() > 0.5 ? 'rgba(20,80,32,0.5)' : 'rgba(140,220,120,0.28)'
    c.lineWidth = Math.max(1, s * 0.03)
    const hgt = s * (0.1 + srand() * 0.16)
    c.beginPath()
    c.moveTo(X(gx), Y(gy))
    c.quadraticCurveTo(X(gx) + s * 0.05, Y(gy) - hgt, X(gx) + s * (srand() * 0.14 - 0.07), Y(gy) - hgt * 1.4)
    c.stroke()
  }
  // Цветочки
  for (let i = 0; i < 40; i++) {
    const gx = ARENA.xMin + srand() * W
    const gy = ARENA.yMin + srand() * H
    if (Math.abs(gy) < 1 || Math.abs(gy - 8.6) < 1.6 || Math.abs(gy + 8.6) < 1.6) continue
    c.fillStyle = srand() > 0.5 ? 'rgba(255,240,150,0.5)' : 'rgba(255,160,200,0.45)'
    c.beginPath()
    c.arc(X(gx), Y(gy), s * 0.05, 0, 6.283)
    c.fill()
  }

  // Река
  const rTop = Y(-0.52)
  const rBot = Y(0.52)
  const river = c.createLinearGradient(0, rTop, 0, rBot)
  river.addColorStop(0, '#1c7fbd')
  river.addColorStop(0.45, '#2ea7e0')
  river.addColorStop(1, '#1a6fa8')
  c.fillStyle = river
  c.fillRect(X(ARENA.xMin), rTop, W * s, rBot - rTop)
  // Берега
  c.fillStyle = '#c2b280'
  c.fillRect(X(ARENA.xMin), rTop - s * 0.09, W * s, s * 0.09)
  c.fillRect(X(ARENA.xMin), rBot, W * s, s * 0.09)
  // Блики воды
  for (let i = 0; i < 60; i++) {
    const gx = ARENA.xMin + srand() * W
    const gy = -0.45 + srand() * 0.9
    c.fillStyle = 'rgba(255,255,255,0.22)'
    c.beginPath()
    c.ellipse(X(gx), Y(gy), s * (0.06 + srand() * 0.12), s * 0.03, 0, 0, 6.283)
    c.fill()
  }

  // Мосты
  for (const bx of ARENA.bridges) {
    const bw = 1.7
    const x0 = X(bx - bw / 2)
    const x1 = X(bx + bw / 2)
    const y0 = Y(-0.75)
    const y1 = Y(0.75)
    c.fillStyle = '#8b5e34'
    c.fillRect(x0, y0, x1 - x0, y1 - y0)
    c.fillStyle = '#a9743f'
    for (let i = 0; i < 6; i++) {
      const py = y0 + ((y1 - y0) / 6) * i + (y1 - y0) * 0.015
      c.fillRect(x0 + 2, py, x1 - x0 - 4, (y1 - y0) / 6 - (y1 - y0) * 0.03)
    }
    c.strokeStyle = 'rgba(61,37,16,0.85)'
    c.lineWidth = Math.max(2, s * 0.06)
    c.strokeRect(x0, y0, x1 - x0, y1 - y0)
  }

  // Площадки башен (каменные круги)
  for (const t of [
    { x: -4.6, y: 8.6 }, { x: 4.6, y: 8.6 }, { x: 0, y: 13.8 },
    { x: -4.6, y: -8.6 }, { x: 4.6, y: -8.6 }, { x: 0, y: -13.8 },
  ]) {
    const r = s * (Math.abs(t.y) > 10 ? 1.55 : 1.3)
    const g = c.createRadialGradient(X(t.x), Y(t.y), r * 0.2, X(t.x), Y(t.y), r)
    g.addColorStop(0, 'rgba(90,100,120,0.55)')
    g.addColorStop(1, 'rgba(70,80,95,0.12)')
    c.fillStyle = g
    c.beginPath()
    c.arc(X(t.x), Y(t.y), r, 0, 6.283)
    c.fill()
    c.strokeStyle = 'rgba(15,25,35,0.5)'
    c.lineWidth = 2
    c.stroke()
  }

  // Центральная линия и рамка арены
  c.strokeStyle = 'rgba(255,255,255,0.14)'
  c.lineWidth = Math.max(1.5, s * 0.04)
  c.setLineDash([s * 0.5, s * 0.4])
  c.beginPath()
  c.moveTo(X(ARENA.xMin), cy)
  c.lineTo(X(ARENA.xMax), cy)
  c.stroke()
  c.setLineDash([])
  c.strokeStyle = 'rgba(34,211,238,0.35)'
  c.lineWidth = 3
  c.strokeRect(X(ARENA.xMin), Y(ARENA.yMin), W * s, H * s)
}

/* ============================ МОДЕЛИ ============================ */

function drawUnit(c: CanvasRenderingContext2D, cam: Cam, u: { card: string; x: number; y: number; hp: number; maxHp: number; phase: number; side: number; slow: boolean; build: boolean }, now: number, isMine: boolean) {
  const def = CARD_MAP[u.card]
  if (!def) return
  const { s, cx, cy } = cam
  const d = cx + u.x * s
  const y = cy + u.y * s
  const r = def.size * s * 1.9
  const col = def.color

  if (def.build) {
    drawBuilding(c, cam, u, def, isMine)
    return
  }

  // Тень
  c.fillStyle = 'rgba(10,25,12,0.35)'
  c.beginPath()
  c.ellipse(d, y + r * 0.42, r * 0.62, r * 0.24, 0, 0, 6.283)
  c.fill()

  // Замедление — ледяной ореол
  if (u.slow) {
    c.fillStyle = 'rgba(125,211,252,0.3)'
    c.beginPath()
    c.arc(d, y, r * 1.25, 0, 6.283)
    c.fill()
  }

  const bob = Math.sin(u.phase) * r * 0.07
  const legSw = Math.sin(u.phase) * r * 0.14
  // Ноги
  c.strokeStyle = '#1e2836'
  c.lineWidth = Math.max(1.6, r * 0.12)
  c.lineCap = 'round'
  c.beginPath()
  c.moveTo(d - r * 0.16, y + r * 0.2 + bob)
  c.lineTo(d - r * 0.16 - legSw * 0.4, y + r * 0.5 + bob)
  c.moveTo(d + r * 0.16, y + r * 0.2 + bob)
  c.lineTo(d + r * 0.16 + legSw * 0.4, y + r * 0.5 + bob)
  c.stroke()
  c.lineCap = 'butt'

  // Тело
  const bodyG = c.createLinearGradient(d - r * 0.4, y - r * 0.4, d + r * 0.3, y + r * 0.4)
  bodyG.addColorStop(0, lighten(col, 28))
  bodyG.addColorStop(0.55, col)
  bodyG.addColorStop(1, darken(col, 42))
  c.fillStyle = bodyG
  roundRect(c, d - r * 0.36, y - r * 0.3 + bob, r * 0.72, r * 0.66, r * 0.24)
  c.fill()
  c.strokeStyle = 'rgba(8,14,24,0.75)'
  c.lineWidth = Math.max(1, r * 0.05)
  roundRect(c, d - r * 0.36, y - r * 0.3 + bob, r * 0.72, r * 0.66, r * 0.24)
  c.stroke()
  // Пояс команды
  c.fillStyle = isMine ? 'rgba(34,211,238,0.75)' : 'rgba(244,114,182,0.75)'
  c.fillRect(d - r * 0.36, y + r * 0.04 + bob, r * 0.72, r * 0.08)

  // Голова
  const hy = y - r * 0.52 + bob
  c.fillStyle = lighten(col, 34)
  c.beginPath()
  c.arc(d, hy, r * 0.3, 0, 6.283)
  c.fill()
  c.strokeStyle = 'rgba(8,14,24,0.7)'
  c.lineWidth = Math.max(1, r * 0.045)
  c.stroke()
  // Глаза
  c.fillStyle = '#0b1224'
  c.beginPath()
  c.arc(d - r * 0.1, hy, r * 0.05, 0, 6.283)
  c.arc(d + r * 0.1, hy, r * 0.05, 0, 6.283)
  c.fill()
  c.fillStyle = 'rgba(255,255,255,0.7)'
  c.beginPath()
  c.arc(d - r * 0.085, hy - r * 0.02, r * 0.018, 0, 6.283)
  c.arc(d + r * 0.115, hy - r * 0.02, r * 0.018, 0, 6.283)
  c.fill()

  drawWeapon(c, def, d, y, hy, r, bob, col)

  // Полоска HP
  if (u.hp < u.maxHp) {
    const wpx = r * 1.1
    const hpY = y - r * 1.05
    c.fillStyle = 'rgba(0,0,0,0.55)'
    roundRect(c, d - wpx / 2, hpY, wpx, Math.max(3, r * 0.13), 3)
    c.fill()
    const frac = Math.max(0, u.hp / u.maxHp)
    c.fillStyle = isMine ? '#22d3ee' : '#f472b6'
    roundRect(c, d - wpx / 2, hpY, wpx * frac, Math.max(3, r * 0.13), 3)
    c.fill()
  }
}

function drawWeapon(c: CanvasRenderingContext2D, def: CardDef, d: number, y: number, hy: number, r: number, bob: number, col: string) {
  const w = def.weapon ?? 'sword'
  c.lineCap = 'round'
  switch (w) {
    case 'sword': {
      c.strokeStyle = '#dbe4f0'
      c.lineWidth = Math.max(1.4, r * 0.09)
      c.beginPath()
      c.moveTo(d + r * 0.34, y + r * 0.02 + bob)
      c.lineTo(d + r * 0.62, hy - r * 0.06 + bob)
      c.stroke()
      c.strokeStyle = glowOf(col, 0.5)
      c.lineWidth = Math.max(2, r * 0.16)
      c.stroke()
      break
    }
    case 'bow': {
      c.strokeStyle = '#a16207'
      c.lineWidth = Math.max(1.4, r * 0.08)
      c.beginPath()
      c.arc(d + r * 0.44, y + bob, r * 0.3, -Math.PI / 2.4, Math.PI / 2.4)
      c.stroke()
      c.strokeStyle = 'rgba(226,232,240,0.75)'
      c.lineWidth = Math.max(0.8, r * 0.03)
      c.beginPath()
      c.moveTo(d + r * 0.44 + Math.cos(-Math.PI / 2.4) * r * 0.3, y + bob + Math.sin(-Math.PI / 2.4) * r * 0.3)
      c.lineTo(d + r * 0.44 + Math.cos(Math.PI / 2.4) * r * 0.3, y + bob + Math.sin(Math.PI / 2.4) * r * 0.3)
      c.stroke()
      break
    }
    case 'staff': {
      c.strokeStyle = '#6b4b2a'
      c.lineWidth = Math.max(1.3, r * 0.07)
      c.beginPath()
      c.moveTo(d + r * 0.3, y + r * 0.3 + bob)
      c.lineTo(d + r * 0.44, hy - r * 0.1 + bob)
      c.stroke()
      const og = c.createRadialGradient(d + r * 0.44, hy - r * 0.14, 1, d + r * 0.44, hy - r * 0.14, r * 0.2)
      og.addColorStop(0, '#ffffff')
      og.addColorStop(0.4, col)
      og.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = og
      c.beginPath()
      c.arc(d + r * 0.44, hy - r * 0.14, r * 0.2, 0, 6.283)
      c.fill()
      break
    }
    case 'axe': {
      c.strokeStyle = '#7c5334'
      c.lineWidth = Math.max(1.3, r * 0.07)
      c.beginPath()
      c.moveTo(d + r * 0.3, y + r * 0.26 + bob)
      c.lineTo(d + r * 0.56, hy - r * 0.02 + bob)
      c.stroke()
      c.fillStyle = '#cbd5e1'
      c.beginPath()
      c.moveTo(d + r * 0.5, hy - r * 0.16)
      c.quadraticCurveTo(d + r * 0.78, hy - r * 0.05, d + r * 0.52, hy + r * 0.1)
      c.closePath()
      c.fill()
      break
    }
    case 'claw': {
      c.strokeStyle = lighten(col, 20)
      c.lineWidth = Math.max(1.1, r * 0.06)
      for (const off of [-0.08, 0.04, 0.16]) {
        c.beginPath()
        c.moveTo(d + r * 0.3, y + off * r + bob)
        c.lineTo(d + r * 0.56, y + (off - 0.05) * r + bob)
        c.stroke()
      }
      break
    }
    case 'spear': {
      c.strokeStyle = '#94a3b8'
      c.lineWidth = Math.max(1.2, r * 0.06)
      c.beginPath()
      c.moveTo(d + r * 0.26, y + r * 0.3 + bob)
      c.lineTo(d + r * 0.6, hy - r * 0.12 + bob)
      c.stroke()
      c.fillStyle = '#e2e8f0'
      c.beginPath()
      c.moveTo(d + r * 0.6, hy - r * 0.26)
      c.lineTo(d + r * 0.7, hy - r * 0.1)
      c.lineTo(d + r * 0.5, hy - r * 0.1)
      c.closePath()
      c.fill()
      break
    }
    case 'hammer': {
      c.strokeStyle = '#7c5334'
      c.lineWidth = Math.max(1.4, r * 0.08)
      c.beginPath()
      c.moveTo(d + r * 0.3, y + r * 0.26 + bob)
      c.lineTo(d + r * 0.58, hy - r * 0.04 + bob)
      c.stroke()
      c.fillStyle = '#9aa7b8'
      roundRect(c, d + r * 0.44, hy - r * 0.2, r * 0.28, r * 0.2, r * 0.06)
      c.fill()
      break
    }
    case 'flame': {
      const fg = c.createRadialGradient(d + r * 0.5, hy, 1, d + r * 0.5, hy, r * 0.34)
      fg.addColorStop(0, '#fef9c3')
      fg.addColorStop(0.4, '#fb923c')
      fg.addColorStop(1, 'rgba(0,0,0,0)')
      c.fillStyle = fg
      c.beginPath()
      c.arc(d + r * 0.5, hy, r * 0.34, 0, 6.283)
      c.fill()
      break
    }
  }
  c.lineCap = 'butt'
}

function drawBuilding(c: CanvasRenderingContext2D, cam: Cam, u: { card: string; x: number; y: number; hp: number; maxHp: number; phase: number; slow: boolean }, def: CardDef, isMine: boolean) {
  const { s, cx, cy } = cam
  const d = cx + u.x * s
  const y = cy + u.y * s
  const r = def.size * s * 2.1
  const col = def.color
  // Тень
  c.fillStyle = 'rgba(10,25,12,0.4)'
  c.beginPath()
  c.ellipse(d, y + r * 0.45, r * 0.75, r * 0.26, 0, 0, 6.283)
  c.fill()
  // Основание
  const g = c.createLinearGradient(d - r * 0.5, y - r * 0.6, d + r * 0.5, y + r * 0.5)
  g.addColorStop(0, lighten(col, 18))
  g.addColorStop(0.6, col)
  g.addColorStop(1, darken(col, 45))
  c.fillStyle = g
  roundRect(c, d - r * 0.42, y - r * 0.52, r * 0.84, r * 0.92, r * 0.18)
  c.fill()
  c.strokeStyle = 'rgba(8,14,24,0.8)'
  c.lineWidth = Math.max(1, r * 0.05)
  roundRect(c, d - r * 0.42, y - r * 0.52, r * 0.84, r * 0.92, r * 0.18)
  c.stroke()
  // Купол
  c.fillStyle = lighten(col, 30)
  c.beginPath()
  c.arc(d, y - r * 0.52, r * 0.3, Math.PI, 2 * Math.PI)
  c.fill()
  // Ядро-свечение
  const cg = c.createRadialGradient(d, y - r * 0.1, 1, d, y - r * 0.1, r * 0.3)
  cg.addColorStop(0, '#ffffff')
  cg.addColorStop(0.5, glowOf(col, 0.9))
  cg.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = cg
  c.beginPath()
  c.arc(d, y - r * 0.1, r * 0.3, 0, 6.283)
  c.fill()
  // Маркер владельца
  c.fillStyle = isMine ? '#22d3ee' : '#f472b6'
  c.fillRect(d - r * 0.42, y + r * 0.24, r * 0.84, r * 0.07)
  // Кольцо времени жизни
  const lifeFrac = Math.max(0, Math.min(1, u.hp / u.maxHp))
  if (lifeFrac < 1) {
    c.strokeStyle = 'rgba(255,255,255,0.5)'
    c.lineWidth = Math.max(1.5, r * 0.06)
    c.beginPath()
    c.arc(d, y, r * 0.72, -Math.PI / 2, -Math.PI / 2 + 6.283 * lifeFrac)
    c.stroke()
  }
  // HP
  const wpx = r * 1.05
  const hpY = y - r * 1.0
  c.fillStyle = 'rgba(0,0,0,0.55)'
  roundRect(c, d - wpx / 2, hpY, wpx, Math.max(3, r * 0.13), 3)
  c.fill()
  c.fillStyle = isMine ? '#22d3ee' : '#f472b6'
  roundRect(c, d - wpx / 2, hpY, wpx * Math.max(0, lifeFrac), Math.max(3, r * 0.13), 3)
  c.fill()
}

function drawTower(c: CanvasRenderingContext2D, cam: Cam, t: { id: number; kind: string; side: number; x: number; y: number; hp: number; maxHp: number; active: boolean }, skinId: string | undefined, isMine: boolean, now: number) {
  const { s, cx, cy } = cam
  const d = cx + t.x * s
  const y = cy + t.y * s
  const king = t.kind === 'king'
  const r = (king ? 1.5 : 1.15) * s
  const sk = towerSkin(skinId ?? (isMine ? 'stone' : 'stone'))
  const body = sk.body
  const dark = sk.bodyDark
  const accent = sk.accent

  if (t.hp <= 0) {
    // Руины
    c.fillStyle = 'rgba(30,35,44,0.85)'
    c.beginPath()
    c.ellipse(d, y + r * 0.2, r * 0.8, r * 0.5, 0, 0, 6.283)
    c.fill()
    c.fillStyle = 'rgba(15,20,26,0.9)'
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.283 + 0.4
      c.beginPath()
      c.arc(d + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.3, r * 0.18, 0, 6.283)
      c.fill()
    }
    c.strokeStyle = 'rgba(0,0,0,0.6)'
    c.lineWidth = 2
    c.beginPath()
    c.ellipse(d, y + r * 0.2, r * 0.8, r * 0.5, 0, 0, 6.283)
    c.stroke()
    return
  }

  // Тень
  c.fillStyle = 'rgba(10,16,26,0.45)'
  c.beginPath()
  c.ellipse(d, y + r * 0.55, r * 0.85, r * 0.3, 0, 0, 6.283)
  c.fill()

  // Корпус
  const g = c.createLinearGradient(d - r * 0.6, y - r, d + r * 0.6, y + r)
  g.addColorStop(0, lighten(body, 16))
  g.addColorStop(0.55, body)
  g.addColorStop(1, dark)
  c.fillStyle = g
  roundRect(c, d - r * 0.55, y - r * 0.85, r * 1.1, r * 1.45, r * 0.2)
  c.fill()
  c.strokeStyle = 'rgba(8,12,22,0.85)'
  c.lineWidth = Math.max(1.5, r * 0.06)
  roundRect(c, d - r * 0.55, y - r * 0.85, r * 1.1, r * 1.45, r * 0.2)
  c.stroke()

  // Кладка
  c.strokeStyle = 'rgba(0,0,0,0.22)'
  c.lineWidth = 1
  for (let i = 1; i <= 3; i++) {
    const ly = y - r * 0.85 + (r * 1.45 / 4) * i
    c.beginPath()
    c.moveTo(d - r * 0.5, ly)
    c.lineTo(d + r * 0.5, ly)
    c.stroke()
  }

  // Неоновое окно-ядро
  const pulse = 0.6 + 0.4 * Math.sin(now / 500 + t.id)
  const og = c.createRadialGradient(d, y - r * 0.15, 1, d, y - r * 0.15, r * 0.34)
  og.addColorStop(0, '#ffffff')
  og.addColorStop(0.45, accent)
  og.addColorStop(1, 'rgba(0,0,0,0)')
  c.globalAlpha = t.active ? pulse : 0.35
  c.fillStyle = og
  c.beginPath()
  c.arc(d, y - r * 0.15, r * 0.34, 0, 6.283)
  c.fill()
  c.globalAlpha = 1

  // Крыша / корона
  const roofY = y - r * 0.85
  c.fillStyle = lighten(body, 26)
  c.beginPath()
  c.moveTo(d - r * 0.62, roofY)
  c.lineTo(d, roofY - r * 0.5)
  c.lineTo(d + r * 0.62, roofY)
  c.closePath()
  c.fill()
  c.strokeStyle = accent
  c.lineWidth = Math.max(1.6, r * 0.07)
  c.beginPath()
  c.moveTo(d - r * 0.62, roofY)
  c.lineTo(d, roofY - r * 0.5)
  c.lineTo(d + r * 0.62, roofY)
  c.stroke()
  // Флаг цвета команды
  c.strokeStyle = '#334155'
  c.lineWidth = Math.max(1, r * 0.05)
  c.beginPath()
  c.moveTo(d, roofY - r * 0.5)
  c.lineTo(d, roofY - r * 0.82)
  c.stroke()
  c.fillStyle = isMine ? '#22d3ee' : '#f472b6'
  c.beginPath()
  c.moveTo(d, roofY - r * 0.82)
  c.lineTo(d + r * 0.34, roofY - r * 0.72)
  c.lineTo(d, roofY - r * 0.62)
  c.closePath()
  c.fill()
  // Корона короля
  if (king) {
    c.fillStyle = '#fbbf24'
    c.beginPath()
    const kr = r * 0.22
    const kx = d + r * 0.4
    const ky = roofY - r * 0.68
    c.moveTo(kx - kr, ky + kr * 0.8)
    c.lineTo(kx - kr, ky)
    c.lineTo(kx - kr * 0.5, ky + kr * 0.25)
    c.lineTo(kx, ky - kr * 0.35)
    c.lineTo(kx + kr * 0.5, ky + kr * 0.25)
    c.lineTo(kx + kr, ky)
    c.lineTo(kx + kr, ky + kr * 0.8)
    c.closePath()
    c.fill()
  }

  // HP
  const wpx = r * 1.3
  const hpY = y - r * 1.32
  const frac = Math.max(0, t.hp / t.maxHp)
  c.fillStyle = 'rgba(0,0,0,0.6)'
  roundRect(c, d - wpx / 2, hpY, wpx, Math.max(4, r * 0.14), 3)
  c.fill()
  c.fillStyle = isMine ? '#22d3ee' : '#f472b6'
  roundRect(c, d - wpx / 2, hpY, wpx * frac, Math.max(4, r * 0.14), 3)
  c.fill()
  c.fillStyle = '#eaf6ff'
  c.font = `bold ${Math.max(9, r * 0.17)}px system-ui, sans-serif`
  c.textAlign = 'center'
  c.fillText(`${Math.max(0, Math.ceil(t.hp))}`, d, hpY + r * 0.14)
  c.textAlign = 'left'
}

function drawEffect(c: CanvasRenderingContext2D, cam: Cam, e: { kind: string; x: number; y: number; t: number; color?: string }, now: number) {
  const age = now - e.t
  if (age > 550) return
  const p = age / 550
  const { s, cx, cy } = cam
  const d = cx + e.x * s
  const y = cy + e.y * s
  const col = e.color ?? '#fbbf24'
  if (e.kind === 'spawn') {
    c.strokeStyle = glowOf(col, 0.85 * (1 - p))
    c.lineWidth = Math.max(2, s * 0.1 * (1 - p))
    c.beginPath()
    c.arc(d, y, s * (0.3 + p * 1.2), 0, 6.283)
    c.stroke()
  } else if (e.kind === 'hit') {
    c.fillStyle = glowOf(col, 0.9 * (1 - p))
    c.beginPath()
    c.arc(d, y - s * 0.2, s * (0.16 + p * 0.18), 0, 6.283)
    c.fill()
  } else if (e.kind === 'splash') {
    c.strokeStyle = glowOf(col, 0.7 * (1 - p))
    c.lineWidth = Math.max(2, s * 0.14 * (1 - p))
    c.beginPath()
    c.arc(d, y, s * (0.2 + p * 0.9), 0, 6.283)
    c.stroke()
  } else if (e.kind === 'crown') {
    c.strokeStyle = `rgba(251,191,36,${1 - p})`
    c.lineWidth = Math.max(3, s * 0.16 * (1 - p))
    c.beginPath()
    c.arc(d, y, s * (0.4 + p * 2.2), 0, 6.283)
    c.stroke()
    c.fillStyle = `rgba(253,224,71,${0.8 * (1 - p)})`
    c.font = `bold ${s * 1.1}px system-ui`
    c.textAlign = 'center'
    c.fillText('👑', d, y - s * (0.5 + p * 1.4))
    c.textAlign = 'left'
  }
}

/* ============================ ХЕЛПЕРЫ ЦВЕТА ============================ */
function hexRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}
function lighten(hex: string, amt: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgb(${Math.min(255, r + amt)},${Math.min(255, g + amt)},${Math.min(255, b + amt)})`
}
function darken(hex: string, amt: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgb(${Math.max(0, r - amt)},${Math.max(0, g - amt)},${Math.max(0, b - amt)})`
}
function glowOf(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r},${g},${b},${alpha})`
}
function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

/* ============================ ЭКРАН ============================ */
export default function BattleScreen({ battle, deploy, onLeave }: BattleScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const camRef = useRef<Cam>({ s: 10, cx: 0, cy: 0 })
  const battleRef = useRef(battle)
  battleRef.current = battle
  const dragRef = useRef<{ idx: number; x: number; y: number; ok: boolean } | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  const endedRef = useRef(false)

  const me = battle.me
  const foe = battle.foe
  const mySkin = me.towerSkin || 'stone'
  const foeSkin = foe.towerSkin || 'stone'

  const over = battle.over && !!battle.result
  const result = battle.result

  // Тикер для таймера HUD
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    if (!over) endedRef.current = false
  }, [over])

  /* ---- Канвас ---- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const bg = document.createElement('canvas')
    let bgDpr = 1
    let raf = 0
    let running = true
    const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
    const dprCap = isNative ? 1.6 : 2

    const resize = () => {
      const dpr = Math.min(dprCap, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      camRef.current = makeCam(w, h)
      // Фон — в том же DPR, чтобы трава была чёткой
      bgDpr = dpr
      bg.width = Math.max(1, Math.floor(w * dpr))
      bg.height = Math.max(1, Math.floor(h * dpr))
      drawStaticArena(bg, camRef.current, w, h, dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const loop = () => {
      if (!running) return
      const cam = camRef.current
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const st = battleRef.current
      const tnow = Date.now()
      ctx.drawImage(bg, 0, 0, w, h)

      // Зона выкладки при перетаскивании
      if (dragRef.current && dragRef.current.ok) {
        const { s, cx, cy } = cam
        ctx.fillStyle = 'rgba(74,222,128,0.16)'
        ctx.strokeStyle = 'rgba(74,222,128,0.65)'
        ctx.lineWidth = 2
        ctx.setLineDash([6, 5])
        const zx = cx + (-ARENA.dxMax) * s
        const zy = cy + ARENA.dMin * s
        ctx.fillRect(zx, zy, ARENA.dxMax * 2 * s, (ARENA.dMax - ARENA.dMin) * s)
        ctx.strokeRect(zx, zy, ARENA.dxMax * 2 * s, (ARENA.dMax - ARENA.dMin) * s)
        ctx.setLineDash([])
      }

      // Эффекты (под юнитами)
      for (const e of st.effects) drawEffect(ctx, cam, e, tnow)

      // Башни
      for (const t of st.towers) drawTower(ctx, cam, t, t.side === 0 ? mySkin : foeSkin, t.side === 0, tnow)
      // Юниты: сначала дальние (меньше y — выше на экране)
      const units = [...st.units].sort((a, b) => a.y - b.y)
      for (const u of units) drawUnit(ctx, cam, u, tnow, u.side === 0)

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [mySkin, foeSkin])

  /* ---- Перетаскивание карт ---- */
  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const cam = camRef.current
    const wx = (clientX - rect.left - cam.cx) / cam.s
    const wy = (clientY - rect.top - cam.cy) / cam.s
    return { x: wx, y: wy }
  }, [])

  const onCardDown = (idx: number) => (e: React.PointerEvent) => {
    if (battle.me.elixir < (CARD_MAP[battle.me.hand[idx]]?.cost ?? 99)) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDragIdx(idx)
  }
  const onCardMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return
    const p = screenToWorld(e.clientX, e.clientY)
    if (!p) return
    const ok = p.y >= ARENA.dMin && p.y <= ARENA.dMax && Math.abs(p.x) <= ARENA.dxMax
    dragRef.current = { idx: dragIdx, x: p.x, y: p.y, ok }
    setDragPos({ x: e.clientX, y: e.clientY })
  }
  const onCardUp = () => {
    const dr = dragRef.current
    setDragIdx(null)
    setDragPos(null)
    dragRef.current = null
    if (!dr || !dr.ok) return
    void deploy(dr.idx, Math.round(100 * dr.x) / 100, Math.round(100 * dr.y) / 100)
  }

  const timeLeft = Math.max(0, Math.ceil((battle.endsAt - now) / 1000))
  const doubleElixir = timeLeft <= 60
  const timerStr = `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`

  const handDefs = useMemo(() => battle.me.hand.map((id) => CARD_MAP[id]).filter(Boolean), [battle.me.hand])
  const nextDef = CARD_MAP[battle.me.next] ?? null

  return (
    <div className="fixed inset-0 z-40 flex touch-none select-none flex-col overflow-hidden bg-[#07101c]">
      {/* Арена */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerMove={onCardMove}
        onPointerUp={onCardUp}
        style={{ touchAction: 'none' }}
      />

      {/* Верхняя панель */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="nr-panel flex items-center gap-2 px-2.5 py-1.5">
          <span className="text-lg">{foe.isBot ? '🤖' : '👤'}</span>
          <div className="leading-tight">
            <div className="text-[12px] font-black text-pink-300">{foe.name}</div>
            <div className="text-[10px] font-bold text-pink-100/70">{'👑'.repeat(foe.crowns) || '—'}</div>
          </div>
        </div>
        <div className="nr-panel flex flex-col items-center px-3 py-1.5">
          <div className={`text-[16px] font-black tabular-nums ${doubleElixir ? 'text-fuchsia-300' : 'text-white'}`}>{timerStr}</div>
          {doubleElixir && <div className="text-[8.5px] font-extrabold tracking-widest text-fuchsia-400">×2 ЭЛИКСИР</div>}
        </div>
        <button
          className="nrb nrb-ghost pointer-events-auto flex h-9 w-9 items-center justify-center"
          onClick={onLeave}
          aria-label="Выйти из боя"
        >
          ✕
        </button>
      </div>

      {/* Кроны свои */}
      <div className="pointer-events-none absolute left-2 top-16 z-10 nr-panel px-2.5 py-1.5 leading-tight">
        <div className="text-[12px] font-black text-cyan-300">{me.name}</div>
        <div className="text-[10px] font-bold text-cyan-100/70">{'👑'.repeat(me.crowns) || '—'}</div>
      </div>

      {/* Нижняя панель: эликсир + карты */}
      <div className="absolute inset-x-0 bottom-0 z-10 pb-[max(0.4rem,env(safe-area-inset-bottom))]">
        {/* Следующая карта + эликсир */}
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-2 px-2">
          <div className="nr-panel flex items-center gap-2 px-2 py-1.5">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Далее</div>
            <div className="relative h-11 w-8 overflow-hidden rounded-md" style={{ border: '1px solid #22d3ee55' }}>
              {nextDef && artOf(nextDef.id) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={artOf(nextDef.id)} alt="" className="h-full w-full object-cover" draggable={false} />
              )}
              <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-center text-[9px] font-black text-fuchsia-300">{nextDef?.cost}</div>
            </div>
          </div>
          <div className="nr-panel flex-1 px-2 py-1.5">
            <div className="flex items-center gap-1">
              {Array.from({ length: 10 }, (_, i) => {
                const filled = battle.me.elixir >= i + 1
                const part = !filled && battle.me.elixir > i ? battle.me.elixir - i : 0
                return (
                  <div key={i} className="relative h-3.5 flex-1 overflow-hidden rounded-sm bg-[#1b1030]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-sm"
                      style={{
                        width: filled ? '100%' : `${part * 100}%`,
                        background: 'linear-gradient(180deg,#f0abfc,#a21caf)',
                        boxShadow: filled ? '0 0 8px rgba(217,70,239,0.55)' : undefined,
                      }}
                    />
                  </div>
                )
              })}
              <div className="ml-1 w-7 text-right text-[13px] font-black tabular-nums text-fuchsia-300">{Math.floor(battle.me.elixir)}</div>
            </div>
          </div>
        </div>
        {/* Карты в руке */}
        <div
          className="mx-auto mt-1.5 flex w-full max-w-[560px] items-stretch justify-center gap-2 px-2"
          onPointerMove={onCardMove}
          onPointerUp={onCardUp}
          onPointerCancel={onCardUp}
        >
          {handDefs.map((def, i) => {
            const afford = battle.me.elixir >= def.cost
            return (
              <div
                key={`${def.id}-${i}`}
                className={`relative flex-1 ${afford ? '' : 'opacity-45 grayscale'}`}
                style={{ touchAction: 'none' }}
                onPointerDown={onCardDown(i)}
              >
                <CardHand def={def} level={me.cardLevels?.[def.id] ?? 1} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Призрак перетаскиваемой карты */}
      {dragIdx !== null && dragPos && handDefs[dragIdx] && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 opacity-80"
          style={{ left: dragPos.x, top: dragPos.y }}
        >
          <div className="w-[74px]">
            <CardHand def={handDefs[dragIdx]} level={me.cardLevels?.[handDefs[dragIdx].id] ?? 1} />
          </div>
        </div>
      )}

      {/* Результат */}
      {over && result && !endedRef.current && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="nr-panel mx-4 w-full max-w-[340px] p-5 text-center">
            <div
              className="text-3xl font-black tracking-wide"
              style={{
                color: result.outcome === 'win' ? '#4ade80' : result.outcome === 'draw' ? '#facc15' : '#f87171',
                textShadow: '0 0 26px rgba(255,255,255,0.35)',
              }}
            >
              {result.outcome === 'win' ? 'ПОБЕДА!' : result.outcome === 'draw' ? 'НИЧЬЯ' : 'ПОРАЖЕНИЕ'}
            </div>
            <div className="mt-2 text-4xl">{'👑'.repeat(result.myCrowns)}<span className="mx-2 text-slate-500">vs</span>{'👑'.repeat(result.foeCrowns)}</div>
            <div className="mt-3 flex justify-center gap-3 text-sm font-bold">
              <span className="rounded-lg bg-amber-500/15 px-3 py-1.5 text-amber-300">+{result.gold} 🪙</span>
              <span className={`rounded-lg px-3 py-1.5 ${result.trophies >= 0 ? 'bg-cyan-500/15 text-cyan-300' : 'bg-red-500/15 text-red-300'}`}>
                {result.trophies >= 0 ? '+' : ''}{result.trophies} 🏆
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-400">соперник: {battle.foe.name}{battle.foe.isBot ? ' (бот)' : ''}</div>
            <button className="nrb nrb-cyan mt-4 w-full py-2.5 text-sm font-extrabold" onClick={onLeave}>
              В МЕНЮ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Мини-карта для руки (арт + цена) */
function CardHand({ def, level }: { def: CardDef; level: number }) {
  const r = def.rarity ?? 'common'
  const frame: Record<string, string> = {
    common: 'linear-gradient(160deg,#3f4c63,#1c2433)',
    rare: 'linear-gradient(160deg,#2563eb33,#1d4ed855,#172554)',
    epic: 'linear-gradient(160deg,#7e22ce66,#a21caf44,#3b0764)',
    legend: 'linear-gradient(160deg,#b4530966,#f59e0b55,#7c2d12)',
    fox: 'linear-gradient(160deg,#c2410c66,#fb923c55,#7c2d12)',
  }
  return (
    <div className="relative overflow-hidden rounded-lg" style={{ border: '1.5px solid transparent', background: frame[r] }}>
      <div className="relative aspect-[3/3.4] overflow-hidden rounded-[6px] bg-[#232c3d]">
        {artOf(def.id) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artOf(def.id)} alt={def.name} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">{def.emoji}</div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3" style={{ background: 'linear-gradient(180deg,transparent,rgba(0,0,0,0.75))' }} />
        <div
          className="absolute left-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-black text-fuchsia-950"
          style={{ background: 'linear-gradient(160deg,#f0abfc,#c026d3)', boxShadow: '0 0 8px rgba(217,70,239,0.7)' }}
        >
          {def.cost}
        </div>
        <div className="absolute inset-x-1 bottom-0.5 truncate text-center text-[9.5px] font-black text-white" style={{ textShadow: '0 1px 2px #000' }}>
          {def.name}
        </div>
      </div>
    </div>
  )
}

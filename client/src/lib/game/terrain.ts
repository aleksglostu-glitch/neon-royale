/**
 * Генератор травяного поля (прорисовывается один раз в offscreen-canvas).
 * Яркая зелень как в мобильных стратегиях: газон, кустики, цветы, камни, дорожки.
 * Детерминированная генерация (seeded RNG) — меню и матч выглядят одинаково.
 */
import { MAP_W, MAP_H, SEAT_POS } from './shared'

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let cached: HTMLCanvasElement | null = null

export function getTerrainCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  if (cached) return cached
  const cv = document.createElement('canvas')
  cv.width = MAP_W
  cv.height = MAP_H
  const ctx = cv.getContext('2d')
  if (!ctx) return null
  const rnd = mulberry32(20260112)

  // ---- База: свежий газон ----
  const base = ctx.createLinearGradient(0, 0, 0, MAP_H)
  base.addColorStop(0, '#83cb4f')
  base.addColorStop(0.5, '#79c247')
  base.addColorStop(1, '#6db83f')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, MAP_W, MAP_H)

  // ---- Большие мягкие пятна света/тени (неровности газона) ----
  for (let i = 0; i < 16; i++) {
    const x = rnd() * MAP_W
    const y = rnd() * MAP_H
    const r = 130 + rnd() * 240
    const light = rnd() > 0.5
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, light ? 'rgba(154,220,105,0.30)' : 'rgba(88,158,52,0.28)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }

  // ---- Диагональные полосы «свежепокошенного» газона ----
  ctx.save()
  ctx.globalAlpha = 0.06
  for (let i = -2; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#ffffff' : '#2f6b1d'
    ctx.beginPath()
    const x0 = i * 220
    ctx.moveTo(x0, 0)
    ctx.lineTo(x0 + 110, 0)
    ctx.lineTo(x0 + 110 - MAP_H, MAP_H)
    ctx.lineTo(x0 - MAP_H, MAP_H)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()

  // ---- Грунтовые дорожки: от баз к центру ----
  const cx = MAP_W / 2
  const cy = MAP_H / 2
  ctx.strokeStyle = 'rgba(190,148,92,0.34)'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const p of SEAT_POS) {
    const mx = (p.x + cx) / 2 + (rnd() - 0.5) * 160
    const my = (p.y + cy) / 2 + (rnd() - 0.5) * 160
    ctx.lineWidth = 46 + rnd() * 14
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.quadraticCurveTo(mx, my, cx + (rnd() - 0.5) * 60, cy + (rnd() - 0.5) * 60)
    ctx.stroke()
  }
  // Кольцевая дорожка в центре
  ctx.lineWidth = 34
  ctx.strokeStyle = 'rgba(190,148,92,0.22)'
  ctx.beginPath()
  ctx.ellipse(cx, cy, 210, 150, 0.5, 0, Math.PI * 2)
  ctx.stroke()

  // ---- Протоптанные точки на дорожках ----
  ctx.fillStyle = 'rgba(160,120,70,0.25)'
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2
    const rr = rnd() * 260
    ctx.beginPath()
    ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7, 5 + rnd() * 8, 3 + rnd() * 5, rnd() * 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- Травинки-пучки ----
  const tuftColors = ['#95d95f', '#5aa832', '#7cc247', '#a5e06b', '#4f9c2b']
  for (let i = 0; i < 900; i++) {
    const x = rnd() * MAP_W
    const y = rnd() * MAP_H
    const s = 3 + rnd() * 5
    ctx.strokeStyle = tuftColors[Math.floor(rnd() * tuftColors.length)]
    ctx.globalAlpha = 0.35 + rnd() * 0.5
    ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let k = -1; k <= 1; k++) {
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x + k * s * 0.6, y - s, x + k * s, y - s * 1.8)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // ---- Цветочки ----
  for (let i = 0; i < 80; i++) {
    const x = rnd() * MAP_W
    const y = rnd() * MAP_H
    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.75)' : 'rgba(247,226,107,0.8)'
    ctx.beginPath()
    ctx.arc(x, y, 1.4 + rnd() * 1.4, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- Камни ----
  for (let i = 0; i < 14; i++) {
    const x = rnd() * MAP_W
    const y = rnd() * MAP_H
    const r = 5 + rnd() * 9
    ctx.fillStyle = '#9aa3a8'
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.72, rnd() * 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(90,100,105,0.5)'
    ctx.beginPath()
    ctx.ellipse(x + r * 0.2, y + r * 0.25, r * 0.6, r * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- Кусты ----
  for (let i = 0; i < 12; i++) {
    const x = rnd() * MAP_W
    const y = rnd() * MAP_H
    const n = 3 + Math.floor(rnd() * 3)
    for (let k = 0; k < n; k++) {
      const bx = x + (rnd() - 0.5) * 34
      const by = y + (rnd() - 0.5) * 20
      const br = 8 + rnd() * 10
      ctx.fillStyle = '#3e7d27'
      ctx.beginPath()
      ctx.arc(bx, by, br, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#54963a'
      ctx.beginPath()
      ctx.arc(bx - br * 0.25, by - br * 0.3, br * 0.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // ---- Лёгкое затемнение краёв поля ----
  const edge = ctx.createRadialGradient(cx, cy, MAP_H * 0.45, cx, cy, MAP_W * 0.72)
  edge.addColorStop(0, 'rgba(20,60,20,0)')
  edge.addColorStop(1, 'rgba(16,52,16,0.42)')
  ctx.fillStyle = edge
  ctx.fillRect(0, 0, MAP_W, MAP_H)

  cached = cv
  return cached
}

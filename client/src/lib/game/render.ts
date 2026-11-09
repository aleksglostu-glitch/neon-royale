// ============================================================
// NEON ROYALE — канвас-рендерер арены
// Оптимизации: пререндер фона, спрайты из арта карточек,
// пулы FX, никаких аллокаций в горячем цикле.
// ============================================================
import { ARENA_W, ARENA_H, RIVER_Y, BRIDGE_X, DEPLOY_Y_MIN, DEPLOY_Y_MAX, Snapshot, Unit } from './engine';
import { CARD_BY_ID } from './cards';

const TILE = 1;
const TEAM_COLORS = ['#ff4fa0', '#3fd4ff'];   // 0 = враг (розовый), 1 = я (голубой)
const TEAM_DARK = ['#8f2358', '#1a6f96'];

interface Fx { kind: string; x: number; y: number; t: number; ttl: number; side?: number; color?: string; x2?: number; y2?: number }

export class ArenaRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private bg: HTMLCanvasElement | null = null;      // пререндер фона
  private sprites = new Map<string, HTMLImageElement>();
  private w = 0; private h = 0;                     // css пиксели
  private scale = 10; private ox = 0; private oy = 0;
  private snap: Snapshot | null = null;
  mySide: 0 | 1 = 1;
  private fx: Fx[] = [];
  private time = 0;
  private shake = 0;
  selectedCard: string | null = null;
  showZones = false;
  attached = false;

  constructor() { this.preloadSprites(); }

  private preloadSprites() {
    for (const c of Object.values(CARD_BY_ID)) {
      const img = new Image();
      img.src = c.art;
      this.sprites.set(c.id, img);
    }
  }

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.attached = true;
    this.resize();
  }

  setSnapshot(s: Snapshot) {
    // отслеживание урона для FX
    if (this.snap) {
      for (const u of s.units) {
        const prev = this.snap.units.find(v => v.uid === u.uid);
        if (prev && u.hp < prev.hp - 0.5) {
          this.fx.push({ kind: u.isTower ? 'towerhit' : 'hit', x: u.x, y: u.y, t: this.time, ttl: 0.35, side: u.side });
          if (u.isTower) this.shake = Math.min(0.35, this.shake + 0.12);
        }
        if (prev && u.hp > prev.hp + 0.5) this.fx.push({ kind: 'heal', x: u.x, y: u.y, t: this.time, ttl: 0.5, color: '#4dff88' });
      }
      const prevIds = new Set(this.snap.units.map(u => u.uid));
      for (const u of s.units) prevIds.delete(u.uid);
      for (const id of prevIds) {
        const dead = this.snap.units.find(u => u.uid === id);
        if (dead) this.fx.push({ kind: 'death', x: dead.x, y: dead.y, t: this.time, ttl: 0.55, side: dead.side, color: dead.isTower ? '#ffd34d' : undefined });
      }
    }
    this.snap = s;
  }

  resize() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2); // DPR ограничен для скорости
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width; this.h = rect.height;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // аренa вписана с полями
    const padTop = 8, padBottom = 8, padX = 6;
    const availW = this.w - padX * 2, availH = this.h - padTop - padBottom;
    this.scale = Math.min(availW / ARENA_W, availH / ARENA_H);
    this.ox = (this.w - ARENA_W * this.scale) / 2;
    this.oy = padTop + (availH - ARENA_H * this.scale) / 2;
    this.renderBg();
  }

  private renderBg() {
    const s = this.scale;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(ARENA_W * s) + 4;
    cv.height = Math.ceil(ARENA_H * s) + 4;
    const c = cv.getContext('2d')!;
    const W = cv.width, H = cv.height;
    // трава: шахматка тёмно-зелёная
    for (let ty = 0; ty < ARENA_H; ty++) {
      for (let tx = 0; tx < ARENA_W; tx++) {
        const even = (tx + ty) % 2 === 0;
        c.fillStyle = even ? '#2f8f3e' : '#2a8338';
        c.fillRect(tx * s, ty * s, s + 1, s + 1);
      }
    }
    // светлые полосы газона
    c.globalAlpha = 0.08;
    for (let ty = 0; ty < ARENA_H; ty += 4) {
      c.fillStyle = '#b8ffb0';
      c.fillRect(0, ty * s, W, s * 2);
    }
    c.globalAlpha = 1;
    // тёмная виньетка по краям
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,10,0,0.4)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
    // зона высадки: мягкая подсветка своих половин
    c.globalAlpha = 0.05;
    c.fillStyle = '#3fd4ff';
    c.fillRect(0, RIVER_Y * s, W, H - RIVER_Y * s);
    c.fillStyle = '#ff4fa0';
    c.fillRect(0, 0, W, RIVER_Y * s);
    c.globalAlpha = 1;
    // река
    const rh = 2.2 * s;
    const rg = c.createLinearGradient(0, RIVER_Y * s - rh / 2, 0, RIVER_Y * s + rh / 2);
    rg.addColorStop(0, '#12557a');
    rg.addColorStop(0.5, '#1d7fb2');
    rg.addColorStop(1, '#12557a');
    c.fillStyle = rg;
    c.fillRect(0, RIVER_Y * s - rh / 2, W, rh);
    // берега
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(0, RIVER_Y * s - rh / 2, W, 2);
    c.fillRect(0, RIVER_Y * s + rh / 2 - 2, W, 2);
    // мосты
    for (const bx of BRIDGE_X) {
      const bw = 2.2 * s, bh = rh + 0.6 * s;
      const x0 = bx * s - bw / 2, y0 = RIVER_Y * s - bh / 2;
      c.fillStyle = '#7a4f2a';
      c.fillRect(x0, y0, bw, bh);
      c.fillStyle = '#8f5c31';
      for (let i = 0; i < 5; i++) c.fillRect(x0 + 2 + i * (bw - 4) / 5, y0 + 2, (bw - 4) / 5 - 2, bh - 4);
      c.fillStyle = '#5d3a1c';
      c.fillRect(x0, y0, 3, bh); c.fillRect(x0 + bw - 3, y0, 3, bh);
    }
    // платформы башен
    const plats: Array<[number, number, number]> = [
      [4.5, 5.5, 1.6], [13.5, 5.5, 1.6],
      [9, 2.6, 1.9],
      [4.5, ARENA_H - 5.5, 1.6], [13.5, ARENA_H - 5.5, 1.6],
      [9, ARENA_H - 2.6, 1.9],
    ];
    for (const [px, py, pr] of plats) {
      c.beginPath(); c.arc(px * s, py * s, pr * s, 0, Math.PI * 2);
      c.fillStyle = '#3a3f47'; c.fill();
      c.lineWidth = Math.max(2, s * 0.1);
      c.strokeStyle = '#23272d'; c.stroke();
      c.beginPath(); c.arc(px * s, py * s, pr * s * 0.82, 0, Math.PI * 2);
      c.fillStyle = '#4a505a'; c.fill();
    }
    this.bg = cv;
  }

  // ---------- координаты ----------
  private sx(x: number): number { return this.ox + x * this.scale; }
  private sy(y: number): number { return this.oy + y * this.scale; }
  screenToTile(px: number, py: number): { x: number; y: number } | null {
    const x = (px - this.ox) / this.scale;
    const y = (py - this.oy) / this.scale;
    if (x < -0.5 || y < -0.5 || x > ARENA_W + 0.5 || y > ARENA_H + 0.5) return null;
    return { x: Math.max(0.5, Math.min(ARENA_W - 0.5, x)), y: Math.max(1, Math.min(ARENA_H - 1, y)) };
  }

  // ---------- FX от движка ----------
  pushFx(kind: string, x: number, y: number, side?: number, color?: string) {
    this.fx.push({ kind, x, y, t: this.time, ttl: kind === 'play' ? 0.5 : 0.4, side, color });
  }

  // ---------- главный рендер ----------
  render(dt: number) {
    const ctx = this.ctx;
    if (!ctx || !this.canvas) return;
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.2);
    const shx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 10 : 0;
    const shy = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 10 : 0;

    ctx.save();
    ctx.translate(shx, shy);
    // фон
    if (this.bg) ctx.drawImage(this.bg, this.ox - 2, this.oy - 2);
    else { ctx.fillStyle = '#1f5c2a'; ctx.fillRect(0, 0, this.w, this.h); }

    // анимация воды
    const s = this.scale;
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#bfeaff';
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    for (let i = 0; i < 6; i++) {
      const yy = RIVER_Y + Math.sin(this.time * 1.4 + i * 2.1) * 0.7;
      const x0 = ((this.time * 30 + i * 137) % (ARENA_W * s)) - 20;
      ctx.beginPath();
      ctx.moveTo(this.sx(x0 / s), this.sy(yy));
      ctx.lineTo(this.sx(x0 / s + 2.2), this.sy(yy));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // зона высадки при выбранной карте
    if (this.showZones && this.selectedCard) {
      const y0 = this.mySide === 1 ? DEPLOY_Y_MIN : 0;
      const y1 = this.mySide === 1 ? ARENA_H : DEPLOY_Y_MAX;
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#3fd4ff';
      ctx.fillRect(this.sx(0), this.sy(y0), ARENA_W * s, (y1 - y0) * s);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#7fe3ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.sx(0), this.sy(y0), ARENA_W * s, (y1 - y0) * s);
      ctx.globalAlpha = 1;
    }

    const snap = this.snap;
    if (snap) {
      // сортировка по y для псевдо-глубины
      const units = snap.units;
      const sorted = units.slice().sort((a, b) => a.y - b.y);
      for (const u of sorted) this.drawUnit(ctx, u, snap);
      // FX поверх
      this.drawFx(ctx);
    }
    ctx.restore();
  }

  private drawUnit(ctx: CanvasRenderingContext2D, u: Unit, snap: Snapshot) {
    const s = this.scale;
    const px = this.sx(u.x), py = this.sy(u.y);
    const team = u.side;
    const col = TEAM_COLORS[team];
    const colD = TEAM_DARK[team];

    if (u.isTower) {
      this.drawTower(ctx, u, px, py);
      return;
    }

    const r = u.radius * s;
    const fly = u.flying;
    const lift = fly ? s * 0.9 : 0;

    // тень
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(px, py + r * 0.5, r * (fly ? 0.7 : 0.95), r * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalAlpha = 1;

    const by = py - lift;

    // спавн-анимация
    if (u.spawnT > 0) {
      ctx.globalAlpha = Math.max(0.15, 1 - u.spawnT / 0.35);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(px, py, r * (0.4 + (0.35 - u.spawnT) * 3), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // тело: спрайт из арта карточки
    const img = this.sprites.get(u.card);
    ctx.save();
    ctx.beginPath();
    if (fly) {
      // крылья
      const flap = Math.sin(this.time * 10) * r * 0.25;
      ctx.ellipse(px - r * 0.9, by + flap * 0.4, r * 0.75, r * 0.42, -0.5 + flap * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = colD; ctx.fill();
      ctx.ellipse(px + r * 0.9, by + flap * 0.4, r * 0.75, r * 0.42, 0.5 - flap * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.arc(px, by, r, 0, Math.PI * 2);
    ctx.clip();
    if (img && img.complete && img.naturalWidth > 0) {
      // центр-кроп верхушки арта (лицо/торс персонажа)
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const cropH = ih * 0.62, cropW = cropH;
      const cx0 = (iw - cropW) / 2, cy0 = ih * 0.06;
      ctx.drawImage(img, cx0, cy0, cropW, cropH, px - r, by - r, r * 2, r * 2);
    } else {
      const g = ctx.createLinearGradient(px - r, by - r, px + r, by + r);
      g.addColorStop(0, col); g.addColorStop(1, colD);
      ctx.fillStyle = g;
      ctx.fillRect(px - r, by - r, r * 2, r * 2);
    }
    // цветовая команда-подсветка
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = col;
    ctx.fillRect(px - r, by - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
    if (u.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, u.hitFlash * 4);
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - r, by - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
    if (u.slowT > 0) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#9fdcff';
      ctx.fillRect(px - r, by - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // кольцо команды
    ctx.beginPath();
    ctx.arc(px, by, r, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.5, s * 0.09);
    ctx.strokeStyle = col;
    ctx.stroke();

    // атака: вспышка оружия
    if (u.attackAnim > 0) {
      const a = u.attackAnim / 0.25;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      const ang = Math.atan2((u.targetUid ? 0 : 1), u.facing);
      ctx.beginPath();
      ctx.moveTo(px + u.facing * r * 0.4, by);
      ctx.lineTo(px + u.facing * r * 1.7, by - r * 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // хп-бар
    if (u.hp < u.maxHp) {
      const bw = r * 2.2, bh = Math.max(3, s * 0.16);
      const bx = px - bw / 2, byy = by - r - bh - 3;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx, byy, bw, bh);
      ctx.fillStyle = col;
      ctx.fillRect(bx + 1, byy + 1, (bw - 2) * Math.max(0, u.hp / u.maxHp), bh - 2);
    }
  }

  private drawTower(ctx: CanvasRenderingContext2D, u: Unit, px: number, py: number) {
    const s = this.scale;
    const col = TEAM_COLORS[u.side];
    const king = u.isTower === 'king';
    const R = u.radius * s;
    const dead = u.hp <= 0;

    if (dead) {
      // руины
      ctx.fillStyle = '#3c4148';
      ctx.beginPath();
      ctx.arc(px, py, R * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#23272d';
      for (let i = 0; i < 5; i++) {
        const a = i * 1.3;
        ctx.fillRect(px + Math.cos(a) * R * 0.5 - 3, py + Math.sin(a) * R * 0.5 - 3, 6, 6);
      }
      return;
    }

    // тело башни
    const g = ctx.createLinearGradient(px - R, py - R * 1.6, px + R, py + R);
    g.addColorStop(0, '#6a7280');
    g.addColorStop(1, '#434a55');
    ctx.fillStyle = g;
    roundRect(ctx, px - R * 0.72, py - R * 1.15, R * 1.44, R * 1.7, R * 0.18);
    ctx.fill();
    // зубцы
    ctx.fillStyle = '#565e6a';
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(px + i * R * 0.52 - R * 0.14, py - R * 1.32, R * 0.28, R * 0.25);
    }
    // купол команды
    ctx.fillStyle = col;
    roundRect(ctx, px - R * 0.58, py - R * 1.02, R * 1.16, R * 0.5, R * 0.12);
    ctx.fill();
    // окно
    ctx.fillStyle = '#171b21';
    ctx.fillRect(px - R * 0.14, py - R * 0.45, R * 0.28, R * 0.5);
    if (king) {
      // корона
      ctx.fillStyle = '#ffd34d';
      const cy = py - R * 1.5;
      ctx.beginPath();
      ctx.moveTo(px - R * 0.45, cy + R * 0.25);
      ctx.lineTo(px - R * 0.45, cy - R * 0.1);
      ctx.lineTo(px - R * 0.18, cy + R * 0.08);
      ctx.lineTo(px, cy - R * 0.22);
      ctx.lineTo(px + R * 0.18, cy + R * 0.08);
      ctx.lineTo(px + R * 0.45, cy - R * 0.1);
      ctx.lineTo(px + R * 0.45, cy + R * 0.25);
      ctx.closePath();
      ctx.fill();
      if (!u.active) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = '#23272d';
        ctx.beginPath(); ctx.arc(px, py - R * 0.2, R * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      // флажок
      ctx.strokeStyle = '#8a919c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py - R * 1.32);
      ctx.lineTo(px, py - R * 1.85);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(px, py - R * 1.85);
      ctx.lineTo(px + R * 0.5, py - R * 1.7);
      ctx.lineTo(px, py - R * 1.55);
      ctx.closePath();
      ctx.fill();
    }
    // вспышка урона
    if (u.hitFlash > 0) {
      ctx.globalAlpha = Math.min(1, u.hitFlash * 3);
      ctx.fillStyle = '#fff';
      roundRect(ctx, px - R * 0.72, py - R * 1.15, R * 1.44, R * 1.7, R * 0.18);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // хп
    const bw = R * 1.9, bh = Math.max(4, s * 0.2);
    const bx = px - bw / 2, byy = py - R * 2.15;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, bx, byy, bw, bh, 3);
    ctx.fill();
    ctx.fillStyle = col;
    roundRect(ctx, bx + 1, byy + 1, (bw - 2) * Math.max(0, u.hp / u.maxHp), bh - 2, 2);
    ctx.fill();
    // цифры хп
    if (s > 11) {
      ctx.fillStyle = '#fff';
      ctx.font = `600 ${Math.max(8, s * 0.42)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.ceil(u.hp)), px, byy + bh - 1);
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D) {
    const s = this.scale;
    this.fx = this.fx.filter(f => this.time - f.t < f.ttl);
    for (const f of this.fx) {
      const a = 1 - (this.time - f.t) / f.ttl;
      const px = this.sx(f.x), py = this.sy(f.y);
      ctx.globalAlpha = Math.max(0, a);
      switch (f.kind) {
        case 'hit':
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(px, py, s * 0.12 * a + 2, 0, Math.PI * 2); ctx.fill();
          break;
        case 'towerhit':
          ctx.strokeStyle = '#ffd34d';
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(px, py, s * (0.5 + (1 - a) * 0.8), 0, Math.PI * 2); ctx.stroke();
          break;
        case 'death': {
          ctx.strokeStyle = f.color ?? '#ffffff';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(px, py, s * (0.3 + (1 - a) * 1.4), 0, Math.PI * 2); ctx.stroke();
          break;
        }
        case 'heal':
          ctx.strokeStyle = f.color ?? '#4dff88';
          ctx.lineWidth = 2.5;
          for (let i = 0; i < 3; i++) {
            const ang = this.time * 3 + i * 2.1;
            ctx.beginPath();
            ctx.arc(px + Math.cos(ang) * s * 0.6, py - s * (0.4 + (1 - a)) - i * 3, 2.4, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        case 'play': {
          const col = TEAM_COLORS[f.side ?? this.mySide];
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(px, py, s * (0.2 + (1 - a) * 1.1), 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = Math.max(0, a * 0.25);
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(px, py, s * 0.9, 0, Math.PI * 2); ctx.fill();
          break;
        }
      }
      ctx.globalAlpha = 1;
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

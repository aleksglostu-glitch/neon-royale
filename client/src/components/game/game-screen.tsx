'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Coins, TreePine, Lightbulb, Swords, LogOut, Timer, Crown, ShieldCheck } from 'lucide-react'
import * as G from '@/lib/game/shared'
import type { GameActions } from '@/hooks/use-game'
import GameMap, { type Selection } from './game-map'
import ActionPanel from './action-panel'
import ResultScreen from './result-screen'

interface GameScreenProps {
  game: G.GameState
  myId: string | null
  isAdmin: boolean
  actions: GameActions
}

interface Toast {
  id: string
  text: string
  color: string | null
}

interface BigBanner {
  id: string
  text: string
  color: string
}

function ScoreBar({ game, myId }: { game: G.GameState; myId: string | null }) {
  const total = Math.max(1, game.players.reduce((s, p) => s + p.score, 0))
  const leader = [...game.players].sort((a, b) => b.score - a.score)[0]
  return (
    <div className="px-2 pt-1">
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-amber-300">
          <Crown className="h-3.5 w-3.5" />
          {game.event ? game.event.name : leader ? `Лидер: ${leader.name}` : ''}
        </div>
        {game.event && <div className="text-[10px] font-semibold text-amber-200/80">{game.event.desc}</div>}
      </div>
      <div className="flex h-8 w-full overflow-hidden rounded-lg border border-slate-700/70 bg-slate-900">
        {game.players.map((p) => {
          const isMe = p.id === myId
          const w = Math.max(6, (p.score / total) * 100)
          return (
            <div
              key={p.id}
              className={`relative flex items-center justify-center overflow-hidden transition-all duration-500 ${p.eliminated ? 'opacity-35' : ''} ${isMe ? 'ring-2 ring-inset ring-white/70' : ''}`}
              style={{ width: `${w}%`, background: `linear-gradient(180deg, ${p.color}cc, ${p.color}77)` }}
            >
              <span className="truncate px-1 text-[12px] font-black text-[#071018] [text-shadow:0_1px_0_rgba(255,255,255,0.25)]">{G.fmt(p.score)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResourceChip({ icon, value, rate, color }: { icon: React.ReactNode; value: number; rate: string; color: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-800/70 px-2 py-1">
      {icon}
      <span className="text-[13px] font-extrabold" style={{ color }}>
        {G.fmt(value)}
      </span>
      <span className="text-[9px] opacity-75" style={{ color }}>{rate}</span>
    </div>
  )
}

/** Секретное админ-меню (лисья база): доступно только с админ-промокодом */
function AdminMenu({ actions }: { actions: GameActions }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const run = async (type: string, label: string) => {
    setBusy(true)
    const r = await actions.adminAction(type)
    setMsg(r.ok ? `${label} — готово 🦊` : (r.error ?? 'Ошибка'))
    setTimeout(() => setMsg(null), 2200)
    setBusy(false)
  }

  const items: { type: string; label: string; hint: string; cls: string }[] = [
    { type: 'res', label: '🪙 Припасы', hint: '+1500◎ +800▲ +150✦', cls: 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25' },
    { type: 'treasure', label: '💰 Сокровищница', hint: '+5000 золота', cls: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-200 hover:bg-yellow-500/25' },
    { type: 'units', label: '⚔ Дружины', hint: 'заполнить гарнизоны', cls: 'bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/25' },
    { type: 'weaken', label: '🦊 Лисий шёпот', hint: 'врагам −50% гарнизона', cls: 'bg-violet-500/15 border-violet-500/40 text-violet-200 hover:bg-violet-500/25' },
  ]

  return (
    <div className="absolute right-2 top-3 z-20 flex flex-col items-end gap-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-black backdrop-blur transition-colors ${
          open ? 'border-rose-400/70 bg-rose-500/25 text-rose-100' : 'border-rose-500/40 bg-[#1a0d08]/90 text-rose-300 hover:bg-rose-500/20'
        }`}
        title="Секретное админ-меню (лисья база)"
      >
        <ShieldCheck className="h-4 w-4" /> 🦊 Админ
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            className="w-56 rounded-xl border border-rose-500/40 bg-[#120a08]/95 p-2 shadow-xl backdrop-blur"
          >
            <div className="px-1 pb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-rose-300/80">Лисья база · управление</div>
            <div className="grid grid-cols-2 gap-1.5">
              {items.map((it) => (
                <button
                  key={it.type}
                  disabled={busy}
                  onClick={() => run(it.type, it.label)}
                  className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-center disabled:opacity-40 ${it.cls}`}
                >
                  <span className="text-[11px] font-black leading-tight">{it.label}</span>
                  <span className="text-[9px] leading-tight opacity-80">{it.hint}</span>
                </button>
              ))}
            </div>
            {msg && <div className="mt-1.5 rounded-lg bg-slate-800/80 px-2 py-1 text-center text-[11px] font-bold text-slate-200">{msg}</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function GameScreen({ game, myId, isAdmin, actions }: GameScreenProps) {
  const [sel, setSel] = useState<Selection>(null)
  const [share, setShare] = useState(0.5)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [banner, setBanner] = useState<BigBanner | null>(null)
  const selRef = useRef<Selection>(null)
  const shareRef = useRef(share)
  const seenEvents = useRef<Set<string>>(new Set())
  const seenBig = useRef<Set<string>>(new Set())
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    selRef.current = sel
  }, [sel])
  useEffect(() => {
    shareRef.current = share
  }, [share])

  const me = game.players.find((p) => p.id === myId) ?? null

  // Тосты из событий сервера («Враги разбиты!», «ВЛАСТЬ…» и т.п.)
  useEffect(() => {
    const fresh: Toast[] = []
    for (const e of game.events) {
      if (!seenEvents.current.has(e.id)) {
        seenEvents.current.add(e.id)
        if (game.events.length - [...game.events].indexOf(e) <= 6) fresh.push({ id: e.id, text: e.text, color: e.color })
      }
    }
    if (fresh.length === 0) return
    const timer = setTimeout(() => {
      setToasts((prev) => [...prev, ...fresh].slice(-3))
      for (const f of fresh) {
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== f.id)), 2600)
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [game.events])

  // Крупный баннер по важным событиям («ВЛАСТЬ …», выбытие команды, финал)
  useEffect(() => {
    for (const e of game.events) {
      if (e.big && !seenBig.current.has(e.id)) {
        seenBig.current.add(e.id)
        const { id, text, color } = e
        setTimeout(() => {
          setBanner({ id, text, color: color ?? '#fbbf24' })
          if (bannerTimer.current) clearTimeout(bannerTimer.current)
          bannerTimer.current = setTimeout(() => setBanner(null), 3000)
        }, 0)
      }
    }
  }, [game.events])

  useEffect(() => {
    return () => {
      if (bannerTimer.current) clearTimeout(bannerTimer.current)
    }
  }, [])

  const skinGold = me ? G.skinById(me.skin).perkGold ?? 0 : 0
  const income = useMemo(
    () => (me ? G.computeIncome(game.towers, game.buildings, me.id, skinGold, game.event) : null),
    [game, me, skinGold]
  )

  const pushToast = useCallback((text: string, color: string | null) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setToasts((prev) => [...prev, { id, text, color }].slice(-3))
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2200)
  }, [])

  // Клик по карте: своя башня → выбор; выбор есть и тап по другой цели → марш
  const handleSelect = useCallback(
    (s: Selection) => {
      const prev = selRef.current
      if (s && prev && prev.kind === 'tower' && (s.kind !== 'tower' || s.id !== prev.id)) {
        const from = game.towers.find((t) => t.id === prev.id)
        if (from && from.owner === myId) {
          actions.gameAction('march', { fromId: prev.id, toKind: s.kind, toId: s.id, share: shareRef.current })
          const target = s.kind === 'tower' ? `№${s.id}` : G.BUILDING_NAMES[game.buildings.find((b) => b.id === s.id)?.type ?? 'mine']
          pushToast(`Маршрут → ${target}`, game.players.find((p) => p.id === myId)?.color ?? null)
          return // своя башня остаётся выбранной
        }
      }
      if (s && prev && s.kind === 'tower' && prev.kind === 'tower' && s.id === prev.id) {
        setSel(null)
        return
      }
      setSel(s)
    },
    [game, myId, actions, pushToast]
  )

  if (game.over) {
    return <ResultScreen game={game} myId={myId} actions={actions} />
  }

  const remaining = game.endsAt - game.now
  const myUnits = me ? game.towers.filter((t) => t.owner === me.id).reduce((s, t) => s + t.garrison, 0) : 0

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#070b10] text-slate-100">
      {/* Шапка: события/лидер + полоса счёта команд (как на референсе) */}
      <header className="border-b border-slate-800 bg-[#0a0f16]">
        <div className="flex items-center gap-2 px-3 py-1.5">
          {me && income ? (
            <div className="flex flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <ResourceChip icon={<Coins className="h-4 w-4 text-amber-400" />} value={me.res.gold} rate={`+${income.gold.toFixed(1)}/с`} color="#fcd34d" />
              <ResourceChip icon={<TreePine className="h-4 w-4 text-lime-400" />} value={me.res.wood} rate={`+${income.wood.toFixed(1)}/с`} color="#bef264" />
              <ResourceChip icon={<Lightbulb className="h-4 w-4 text-cyan-300" />} value={me.res.ideas} rate={`+${income.ideas.toFixed(1)}/с`} color="#67e8f9" />
              <ResourceChip icon={<Swords className="h-4 w-4 text-rose-400" />} value={myUnits} rate="в гарнизонах" color="#fda4af" />
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-800/70 px-2 py-1 text-[13px] font-bold text-slate-200">
            <Timer className="h-4 w-4" />
            {G.fmtTime(remaining)}
          </div>
          <button
            onClick={actions.leaveGame}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-xs font-semibold text-slate-400 transition-colors hover:border-rose-500/50 hover:text-rose-300"
          >
            <LogOut className="h-3.5 w-3.5" /> Выйти
          </button>
        </div>
        <ScoreBar game={game} myId={myId} />
      </header>

      {/* Карта */}
      <main className="relative min-h-0 flex-1">
        <GameMap game={game} myId={myId} sel={sel} onSelect={handleSelect} />

        {/* Тосты (как на референсе: «Маршрут → №6», «Враги разбиты!») */}
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex w-[92%] max-w-md -translate-x-1/2 flex-col items-center gap-1.5">
          <AnimatePresence initial={false}>
            {toasts.map((t) => (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -12, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex max-w-full items-center gap-2 truncate rounded-full border border-slate-600/60 bg-[#101823]/95 px-4 py-1.5 text-[13px] font-semibold shadow-lg backdrop-blur"
                style={{ color: t.color ?? '#e2e8f0' }}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: t.color ?? '#64748b' }} />
                <span className="truncate">{t.text}</span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Индикатор события */}
        {game.event && (
          <div className="pointer-events-none absolute right-2 top-3 z-10 rounded-xl border border-amber-500/40 bg-[#171204]/90 px-3 py-1.5 text-right backdrop-blur">
            <div className="flex items-center gap-1 text-[11px] font-black text-amber-300">
              <Crown className="h-3 w-3" /> {game.event.name}
            </div>
            <div className="text-[10px] text-amber-200/80">{game.event.desc}</div>
          </div>
        )}

        {/* Секретное админ-меню (лисья база) */}
        {isAdmin && <AdminMenu actions={actions} />}

        {/* Крупный баннер события по центру карты */}
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <AnimatePresence>
            {banner && (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, scale: 0.6, y: 24 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -18 }}
                transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                className="max-w-[86%] rounded-2xl border-2 bg-[#0a0f16]/95 px-6 py-4 text-center shadow-[0_0_60px_rgba(251,191,36,0.25)] backdrop-blur"
                style={{ borderColor: banner.color }}
              >
                <div className="text-lg font-black leading-snug sm:text-xl" style={{ color: banner.color, textShadow: `0 0 24px ${banner.color}66` }}>
                  {banner.text}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Панель действий — фиксированная высота, чтобы карта не прыгала при выборе */}
      <div className="h-[158px] shrink-0 overflow-hidden">
        <ActionPanel game={game} myId={myId} sel={sel} actions={actions} share={share} onShare={setShare} onClearSel={() => setSel(null)} />
      </div>
    </div>
  )
}

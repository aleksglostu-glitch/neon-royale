'use client'

import { motion } from 'framer-motion'
import { Trophy, RotateCcw, Home, Gem, Medal, Skull, Swords, Flag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import * as G from '@/lib/game/shared'
import type { GameActions } from '@/hooks/use-game'
import { loadName } from '@/hooks/use-game'

interface ResultScreenProps {
  game: G.GameState
  myId: string | null
  actions: GameActions
}

export default function ResultScreen({ game, myId, actions }: ResultScreenProps) {
  const results = game.results ?? []
  const iWon = game.winner && game.winner === myId
  const me = results.find((r) => r.id === myId && !r.isBot)
  const winner = game.players.find((p) => p.id === game.winner)

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#07090d] px-4 py-10 text-slate-100">
      <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-xl space-y-6">
        <div className="text-center">
          <Trophy className={`mx-auto h-16 w-16 ${iWon ? 'text-amber-400 [filter:drop-shadow(0_0_24px_rgba(251,191,36,0.7))]' : 'text-slate-500'}`} />
          <h1 className="mt-4 text-3xl font-black sm:text-4xl [text-shadow:0_0_30px_rgba(52,211,153,0.35)]">
            {iWon ? <span className="text-amber-300">ПОБЕДА!</span> : winner ? <>Победитель: <span style={{ color: winner.color }}>{winner.name}</span></> : 'Матч окончен'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{game.winReason}</p>
        </div>

        {/* Таблица результатов */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
          <div className="grid grid-cols-[2.2rem_1fr_4.5rem_3.5rem_3.5rem] gap-1 border-b border-slate-800 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <span>#</span>
            <span>Командир</span>
            <span className="text-right">Счёт</span>
            <span className="text-right">🏴</span>
            <span className="text-right">⚔</span>
          </div>
          {results.map((r) => {
            const isMe = r.id === myId && !r.isBot
            return (
              <div
                key={r.id}
                className={`grid grid-cols-[2.2rem_1fr_4.5rem_3.5rem_3.5rem] items-center gap-1 px-4 py-2.5 text-sm ${isMe ? 'bg-slate-800/50' : ''} ${r.place === 1 ? 'font-extrabold' : ''}`}
              >
                <span className="flex items-center gap-1 text-slate-400">
                  {r.place === 1 ? <Medal className="h-4 w-4 text-amber-400" /> : <span>{r.place}</span>}
                </span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: r.color, boxShadow: `0 0 8px ${r.color}` }} />
                  <span className="truncate" style={{ color: r.color }}>
                    {r.name}
                    {isMe ? ' (вы)' : ''}
                  </span>
                  {r.isBot && <span className="rounded bg-slate-700 px-1 text-[9px] font-bold text-slate-300">ИИ</span>}
                  {!r.won && r.place === 1 && <Flag className="h-3.5 w-3.5 text-amber-400" />}
                </span>
                <span className="text-right tabular-nums text-slate-100">{G.fmt(r.score)}</span>
                <span className="text-right tabular-nums text-slate-400">{r.captures}</span>
                <span className="text-right tabular-nums text-slate-400">{r.kills}</span>
              </div>
            )
          })}
        </div>

        {/* Награда */}
        {me && (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
            <Gem className="h-6 w-6 text-cyan-300" />
            <div>
              <div className="text-lg font-black text-cyan-200">+{me.reward} кристаллов</div>
              <div className="text-xs text-slate-400">Награда начислена на устройство (данные никуда не отправляются)</div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={() => actions.findGame(loadName())} className="h-12 flex-1 gap-2 rounded-xl bg-emerald-500 text-base font-black text-emerald-950 hover:bg-emerald-400">
            <RotateCcw className="h-5 w-5" /> Сыграть ещё
          </Button>
          <Button onClick={actions.leaveGame} variant="outline" className="h-12 flex-1 gap-2 rounded-xl border-slate-700 bg-slate-900 text-base font-bold hover:bg-slate-800">
            <Home className="h-5 w-5" /> В меню
          </Button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-600">
          <Skull className="h-3.5 w-3.5" /> Захваты и победы приносят кристаллы · <Swords className="h-3.5 w-3.5" /> улучшайте армию исследованиями
        </p>
      </motion.div>
    </div>
  )
}

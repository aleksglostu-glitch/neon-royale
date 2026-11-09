'use client'

import { Button } from '@/components/ui/button'
import { Hammer, Coins, TreePine, Users, Zap, Info, X, Crosshair } from 'lucide-react'
import * as G from '@/lib/game/shared'
import type { Selection } from './game-map'
import type { GameActions } from '@/hooks/use-game'

interface ActionPanelProps {
  game: G.GameState
  myId: string | null
  sel: Selection
  actions: GameActions
  share: number
  onShare: (s: number) => void
  onClearSel: () => void
}

function Cost({ icon, value, ok, color }: { icon: string; value: number; ok: boolean; color?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-bold ${ok ? 'text-slate-100' : 'text-rose-400'}`}>
      <span style={{ color: color ?? '#94a3b8' }}>{icon}</span>
      {G.fmt(value)}
    </span>
  )
}

function ActionButton({
  onClick,
  disabled,
  children,
  tone = 'default',
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  tone?: 'default' | 'gold' | 'violet' | 'lime'
}) {
  const tones: Record<string, string> = {
    default: 'bg-slate-800 hover:bg-slate-700 border-slate-600',
    gold: 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-200',
    violet: 'bg-violet-500/15 hover:bg-violet-500/25 border-violet-500/40 text-violet-200',
    lime: 'bg-lime-500/15 hover:bg-lime-500/25 border-lime-500/40 text-lime-200',
  }
  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      className={`h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl border px-2 text-xs font-bold ${tones[tone]} disabled:cursor-not-allowed disabled:opacity-40`}
    >
      {children}
    </Button>
  )
}

export default function ActionPanel({ game, myId, sel, actions, share, onShare, onClearSel }: ActionPanelProps) {
  const me = game.players.find((p) => p.id === myId)

  const tower = sel?.kind === 'tower' ? game.towers.find((t) => t.id === sel.id) ?? null : null
  const building = sel?.kind === 'building' ? game.buildings.find((b) => b.id === sel.id) ?? null : null
  const ownerOf = (ownerId: string | null) => (ownerId ? game.players.find((p) => p.id === ownerId) ?? null : null)

  return (
    <div className="flex h-full w-full flex-col justify-center border-t border-slate-800 bg-[#0a0f16]/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
      {!tower && !building && (
        <div className="flex items-center justify-center gap-2 py-2 text-center text-sm text-slate-400">
          <Info className="h-4 w-4 shrink-0" />
          <span>Выберите свою башню, затем цель — войски пойдут маршем. Доля: <b className="text-slate-200">{Math.round(share * 100)}%</b></span>
        </div>
      )}

      {tower && (
        <TowerPanel game={game} myId={myId} tower={tower} owner={ownerOf(tower.owner)} me={me ?? null} actions={actions} share={share} onShare={onShare} onClearSel={onClearSel} />
      )}
      {building && (
        <BuildingPanel game={game} myId={myId} building={building} owner={ownerOf(building.owner)} me={me ?? null} actions={actions} onClearSel={onClearSel} />
      )}
    </div>
  )
}

function TowerPanel({
  game,
  myId,
  tower,
  owner,
  me,
  actions,
  share,
  onShare,
  onClearSel,
}: {
  game: G.GameState
  myId: string | null
  tower: G.TowerState
  owner: G.PlayerState | null
  me: G.PlayerState | null
  actions: GameActions
  share: number
  onShare: (s: number) => void
  onClearSel: () => void
}) {
  const isMine = !!owner && owner.id === myId
  const cap = G.towerCap(tower.level)
  const upCost = tower.level < G.TOWER_MAX_LEVEL ? G.towerUpgradeCost(tower.level + 1) : null
  const evBuilders = game.event?.kind === 'builders'
  const canUp = upCost && me && me.res.gold >= (evBuilders ? upCost.gold * 0.6 : upCost.gold) && me.res.wood >= (evBuilders ? upCost.wood * 0.6 : upCost.wood)
  const marchers = Math.max(G.MIN_MARCH_UNITS, Math.floor(tower.garrison * share))

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded-lg px-2 py-0.5 text-xs font-black" style={{ background: owner?.color ?? '#334155', color: '#071018' }}>
          Башня №{tower.id}
        </span>
        <span className="text-xs font-semibold text-slate-300">
          {owner ? (isMine ? 'ваша' : owner.name + (owner.isBot ? ' (ИИ)' : '')) : 'нейтральная'}
        </span>
        <span className="text-xs text-amber-300" title="Уровень">{'★'.repeat(tower.level)}</span>
        <span className="ml-auto flex items-center gap-1 text-xs font-bold text-slate-200">
          <Users className="h-3.5 w-3.5 text-rose-300" />
          {G.fmt(tower.garrison)} / {cap}
        </span>
        <button onClick={onClearSel} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-slate-200">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isMine ? (
        <>
          <div className="flex gap-2">
            <ActionButton
              tone="gold"
              disabled={!me || me.res.gold < G.hireCost(G.HIRE_PACK) || tower.garrison >= cap}
              onClick={() => actions.gameAction('hire', { towerId: tower.id, packs: 1 })}
            >
              <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> +{G.HIRE_PACK}</span>
              <Cost icon="◎" value={G.hireCost(G.HIRE_PACK)} ok={!!me && me.res.gold >= G.hireCost(G.HIRE_PACK)} color="#fbbf24" />
            </ActionButton>
            <ActionButton
              tone="lime"
              disabled={!upCost || !canUp}
              onClick={() => actions.gameAction('upgradeTower', { towerId: tower.id })}
            >
              <span className="flex items-center gap-1"><Hammer className="h-3.5 w-3.5" /> Улучшить{upCost ? ` до ★${tower.level + 1}` : ' — макс'}</span>
              {upCost ? (
                <span className="flex items-center gap-2">
                  <Cost icon="◎" value={evBuilders ? Math.round(upCost.gold * 0.6) : upCost.gold} ok={!!me && me.res.gold >= (evBuilders ? upCost.gold * 0.6 : upCost.gold)} color="#fbbf24" />
                  <Cost icon="▲" value={evBuilders ? Math.round(upCost.wood * 0.6) : upCost.wood} ok={!!me && me.res.wood >= (evBuilders ? upCost.wood * 0.6 : upCost.wood)} color="#a3e635" />
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">предел</span>
              )}
            </ActionButton>
            <ActionButton tone="violet" disabled={!me || me.res.ideas < G.researchCost(me.research + 1) || me.research >= G.RESEARCH_MAX_LEVEL} onClick={() => actions.gameAction('research')}>
              <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5" /> Урон ур.{me ? me.research + 1 : '?'}</span>
              <Cost icon="✦" value={me ? G.researchCost(me.research + 1) : 0} ok={!!me && me.res.ideas >= G.researchCost(me.research + 1)} color="#22d3ee" />
            </ActionButton>
          </div>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Доля марша:</span>
            <div className="flex flex-1 gap-2">
              {[0.25, 0.5, 1].map((s) => (
                <button
                  key={s}
                  onClick={() => onShare(s)}
                  className={`h-9 flex-1 rounded-lg border text-sm font-black transition-colors ${
                    share === s ? 'border-sky-400 bg-sky-500/20 text-sky-200' : 'border-slate-700 bg-slate-900 text-slate-400'
                  }`}
                >
                  {Math.round(s * 100)}% <span className="text-[10px] font-semibold opacity-70">≈{G.fmt(Math.max(G.MIN_MARCH_UNITS, Math.floor(tower.garrison * s)))}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="text-center text-[11px] text-slate-500">Теперь выберите на карте цель — башню или здание</div>
        </>
      ) : (
        <div className="flex items-center justify-center gap-3 py-1.5 text-sm text-slate-300">
          <Crosshair className="h-4 w-4 text-rose-400" />
          {owner ? `Башня игрока ${owner.name}` : 'Нейтральная башня'} — выберите свою башню и отправьте маршем {(tower.garrison * 1.3 + 8).toFixed(0)}+ бойцов для захвата
        </div>
      )}
    </div>
  )
}

function BuildingPanel({
  game,
  myId,
  building,
  owner,
  me,
  actions,
  onClearSel,
}: {
  game: G.GameState
  myId: string | null
  building: G.BuildingState
  owner: G.PlayerState | null
  me: G.PlayerState | null
  actions: GameActions
  onClearSel: () => void
}) {
  const isMine = !!owner && owner.id === myId
  const rate = G.BUILDING_RATE[building.type]
  const upCost = building.level < G.BUILDING_MAX_LEVEL ? G.buildingUpgradeCost(building.level + 1) : null
  const evBuilders = game.event?.kind === 'builders'
  const canUp = upCost && me && me.res.gold >= (evBuilders ? upCost.gold * 0.6 : upCost.gold) && me.res.wood >= (evBuilders ? upCost.wood * 0.6 : upCost.wood)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="rounded-lg px-2 py-0.5 text-xs font-black" style={{ background: owner?.color ?? '#334155', color: '#071018' }}>
          {G.BUILDING_NAMES[building.type]}
        </span>
        <span className="text-xs font-semibold text-slate-300">
          {owner ? (isMine ? 'ваше' : `игрока ${owner.name}`) : 'нейтральное'}
        </span>
        <span className="ml-auto text-xs font-bold text-slate-200">
          {rate.res !== 'none' && (
            <span className="mr-2">
              +{(rate.rate * building.level).toFixed(0)}/{rate.res === 'gold' ? 'с ◎' : rate.res === 'wood' ? 'с ▲' : 'с ✦'}
            </span>
          )}
          {rate.res === 'none' && <span className="mr-2">{G.BUILDING_DESC[building.type]}</span>}
          <Users className="mr-0.5 inline h-3.5 w-3.5 text-rose-300" />
          {G.fmt(building.garrison)}
        </span>
        <button onClick={onClearSel} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-slate-200">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {isMine ? (
        <div className="flex gap-2">
          <ActionButton tone="lime" disabled={!upCost || !canUp} onClick={() => actions.gameAction('upgradeBuilding', { buildingId: building.id })}>
            <span className="flex items-center gap-1"><Hammer className="h-3.5 w-3.5" /> Улучшить{upCost ? ` до ур.${building.level + 1}` : ' — макс'}</span>
            {upCost ? (
              <span className="flex items-center gap-2">
                <Cost icon="◎" value={evBuilders ? Math.round(upCost.gold * 0.6) : upCost.gold} ok={!!me && me.res.gold >= (evBuilders ? upCost.gold * 0.6 : upCost.gold)} color="#fbbf24" />
                <Cost icon="▲" value={evBuilders ? Math.round(upCost.wood * 0.6) : upCost.wood} ok={!!me && me.res.wood >= (evBuilders ? upCost.wood * 0.6 : upCost.wood)} color="#a3e635" />
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">предел</span>
            )}
          </ActionButton>
          <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 px-3 text-center text-[11px] leading-tight text-slate-400">
            Уровень ускоряет эффект здания. Пришлите маршем войски для защиты.
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-3 py-1.5 text-sm text-slate-300">
          <Coins className="h-4 w-4 text-amber-300" />
          {owner ? `Захватите маршем, чтобы отбить у ${owner.name}` : 'Отправьте маршем войски, чтобы захватить здание'}
        </div>
      )}
    </div>
  )
}

'use client'

/**
 * NEON ROYALE — премиальная карточка.
 * Рамка по редкости, золотое тиснение, блик, уровень, статы, цена.
 */
import { memo } from 'react'
import { artOf, levelMult, type CardDef } from '@/lib/game/neon/cards'

const RARITY: Record<string, { label: string; frame: string; glow: string; bg: string; text: string }> = {
  common: { label: 'Обычная', frame: 'linear-gradient(160deg,#3f4c63,#1c2433)', glow: 'rgba(148,163,184,0.45)', bg: '#232c3d', text: '#dbe4f0' },
  rare: { label: 'Редкая', frame: 'linear-gradient(160deg,#2563eb33,#1d4ed855,#172554)', glow: 'rgba(96,165,250,0.55)', bg: '#1b2a4a', text: '#dbeafe' },
  epic: { label: 'Эпическая', frame: 'linear-gradient(160deg,#7e22ce66,#a21caf44,#3b0764)', glow: 'rgba(192,132,252,0.6)', bg: '#2a1745', text: '#f3e8ff' },
  legend: { label: 'Легендарная', frame: 'linear-gradient(160deg,#b4530966,#f59e0b55,#7c2d12)', glow: 'rgba(251,191,36,0.7)', bg: '#33200d', text: '#fef3c7' },
  fox: { label: '🦊 Секретная', frame: 'linear-gradient(160deg,#c2410c66,#fb923c55,#7c2d12)', glow: 'rgba(251,146,60,0.75)', bg: '#331708', text: '#ffedd5' },
}

export function rarityStyle(def: CardDef) {
  return RARITY[def.rarity ?? 'common'] ?? RARITY.common
}

interface CardArtProps {
  def: CardDef
  level?: number
  className?: string
  /** Скрыть нижний блок статов (для маленьких превью) */
  compact?: boolean
  costBadge?: boolean
}

/** Арт-часть карточки: рамка + портрет + градиенты */
export const CardArt = memo(function CardArt({ def, level = 1, className = '', compact, costBadge = true }: CardArtProps) {
  const r = rarityStyle(def)
  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`} style={{ border: '2px solid transparent', background: r.frame }}>
      <div className="absolute inset-[2px] overflow-hidden rounded-[10px]" style={{ background: r.bg }}>
        {artOf(def.id) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artOf(def.id)} alt={def.name} className="h-full w-full object-cover" draggable={false} loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-5xl">{def.emoji}</div>
        )}
        {/* Градиент для читаемости */}
        <div className="absolute inset-x-0 bottom-0 h-2/5" style={{ background: 'linear-gradient(180deg,transparent, rgba(0,0,0,0.78))' }} />
        {/* Блик */}
        <div className="nr-sheen absolute inset-0" />
      </div>
      {/* Эликсир */}
      {costBadge && (
        <div
          className="absolute left-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-black text-fuchsia-950"
          style={{ background: 'linear-gradient(160deg,#f0abfc,#c026d3)', boxShadow: '0 0 10px rgba(217,70,239,0.7), inset 0 1px rgba(255,255,255,0.55)' }}
        >
          {def.cost}
        </div>
      )}
      {/* Уровень */}
      {level > 0 && (
        <div className="absolute right-1.5 top-1.5 rounded-md border border-amber-300/50 bg-black/55 px-1.5 py-0.5 text-[10px] font-black text-amber-300">
          ур.{level}
        </div>
      )}
      {/* Имя */}
      {!compact && (
        <div className="absolute inset-x-1.5 bottom-1.5">
          <div className="truncate text-[12.5px] font-black leading-tight" style={{ color: r.text, textShadow: '0 1px 3px #000' }}>
            {def.name}
          </div>
          <div className="flex items-center gap-1 text-[9.5px] font-bold text-slate-300">
            <span>❤ {Math.round(def.hp * levelMult(level))}</span>
            <span>·</span>
            <span>⚔ {Math.round(def.dmg * levelMult(level))}</span>
            {def.build && <span className="ml-auto rounded bg-sky-500/25 px-1 text-sky-200">башня</span>}
          </div>
        </div>
      )}
    </div>
  )
})

/** Строки описания карты для деталей */
export function cardStatLines(def: CardDef, level: number): string[] {
  const lines: string[] = []
  if (def.build) lines.push(`Живёт ${def.life ?? 30} сек, не двигается`)
  lines.push(`HP ${Math.round(def.hp * levelMult(level))} · Урон ${Math.round(def.dmg * levelMult(level))}`)
  lines.push(`Скорость атаки ${def.hitSpeed}с · Дальность ${def.range}`)
  if (def.splash) lines.push(`Урон по площади (${def.splash})`)
  if (def.slow) lines.push(`Замедляет цель`)
  lines.push(def.targets === 'towers' ? 'Только по башням' : 'По юнитам и башням')
  return lines
}

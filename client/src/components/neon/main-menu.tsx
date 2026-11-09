'use client'

/**
 * NEON ROYALE — главное меню: вкладки внизу (как в Clash Royale):
 * Главная, Магазин, Колода, Топ. Плюс оверлеи: настройки, политика, соглашение, ник, промокод.
 */
import { useMemo, useState } from 'react'
import {
  CARDS, CARD_MAP, DEFAULT_DECK, MAX_CARD_LEVEL, MAX_TOWER_LEVEL, nextUpgradeCost, TOWER_LEVEL_COSTS,
  towerSkin, towerOwned, TOWER_SKINS, artOf, levelMult, type CardDef,
} from '@/lib/game/neon/cards'
import { PRIVACY_POLICY, USER_AGREEMENT, VK_URL } from '@/lib/game/neon/legal'
import type { NeonApp, TabKey } from '@/hooks/use-neon'
import { QUEUE_WINDOW_MS } from '@/hooks/use-neon'
import { CardArt, cardStatLines, rarityStyle } from './card-ui'

const TABS: { key: TabKey; label: string; color: string; icon: string }[] = [
  { key: 'home', label: 'Главная', color: '#f472b6', icon: '⚔️' },
  { key: 'shop', label: 'Магазин', color: '#fbbf24', icon: '🛒' },
  { key: 'deck', label: 'Колода', color: '#67e8f9', icon: '🃏' },
  { key: 'top', label: 'Топ', color: '#c4b5fd', icon: '🏆' },
]

export default function MainMenu({ app }: { app: NeonApp }) {
  const { profile, tab, setTab, online, searching, queueLeft } = app

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-[#0a0e18] text-slate-100">
      {/* Фон-арт */}
      <div className="absolute inset-0 opacity-45" style={{ backgroundImage: 'url(/art/bg-menu.jpg)', backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(7,10,18,0.55) 0%, rgba(7,10,18,0.86) 55%, rgba(7,10,18,0.97) 100%)' }} />

      {/* Шапка */}
      <header className="relative z-10 flex items-center gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/art/logo-royale.png" alt="Neon Royale" className="h-10 w-10 rounded-xl" style={{ boxShadow: '0 0 18px rgba(34,211,238,0.35)' }} />
        <button
          className="nr-panel flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
          onClick={() => app.setOverlay('nick')}
        >
          <div className="min-w-0">
            <div className="truncate text-[13px] font-black text-white">{profile.nick || 'Командир'}</div>
            <div className="text-[10px] font-bold text-slate-400">{online ? '🟢 онлайн' : '⚪ офлайн-режим'}</div>
          </div>
        </button>
        <div className="nr-panel flex items-center gap-1.5 px-2.5 py-1.5">
          <span className="text-[13px]">🪙</span>
          <span className="text-[13px] font-black tabular-nums text-amber-300">{profile.gold.toLocaleString('ru-RU')}</span>
        </div>
        <div className="nr-panel flex items-center gap-1.5 px-2.5 py-1.5">
          <span className="text-[13px]">🏆</span>
          <span className="text-[13px] font-black tabular-nums text-cyan-300">{profile.trophies}</span>
        </div>
        <button className="nrb nrb-ghost flex h-9 w-9 shrink-0 items-center justify-center" onClick={() => app.setOverlay('settings')} aria-label="Настройки">
          ⚙️
        </button>
      </header>

      {/* Контент вкладки */}
      <main className="nr-scroll relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-3">
        {tab === 'home' && <HomeTab app={app} />}
        {tab === 'shop' && <ShopTab app={app} />}
        {tab === 'deck' && <DeckTab app={app} />}
        {tab === 'top' && <TopTab app={app} />}
      </main>

      {/* Вкладки внизу */}
      <nav className="relative z-10 grid grid-cols-4 gap-1.5 px-2 pb-[max(0.55rem,env(safe-area-inset-bottom))]">
        {TABS.map((t) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              className={`nrb nrb-nav relative flex items-center justify-center gap-1 py-2 text-[11px] font-extrabold ${active ? 'tab-active' : ''}`}
              style={{ ['--nc' as string]: t.color, color: active ? '#fff' : t.color }}
              onClick={() => setTab(t.key)}
            >
              {active && <span className="tab-glow absolute inset-0 rounded-xl" />}
              <span className="relative text-[15px]">{t.icon}</span>
              <span className="relative">{t.label}</span>
            </button>
          )
        })}
      </nav>

      {/* Поиск соперника */}
      {searching && <SearchOverlay app={app} left={queueLeft} window={QUEUE_WINDOW_MS} />}

      {/* Оверлеи */}
      {app.overlay === 'settings' && <SettingsOverlay app={app} />}
      {app.overlay === 'privacy' && <LegalOverlay title="Политика конфиденциальности" text={PRIVACY_POLICY} onClose={() => app.setOverlay(null)} />}
      {app.overlay === 'terms' && <LegalOverlay title="Пользовательское соглашение" text={USER_AGREEMENT} onClose={() => app.setOverlay(null)} />}
      {app.overlay === 'nick' || app.needNick ? <NickOverlay app={app} /> : null}
      {app.overlay === 'promo' && <PromoOverlay app={app} />}

      {/* Тост */}
      {app.toast && (
        <div className="pointer-events-none fixed inset-x-0 top-[max(4.2rem,calc(env(safe-area-inset-top)+3.6rem))] z-[60] flex justify-center px-4">
          <div className={`nr-panel max-w-[92vw] px-4 py-2.5 text-center text-[13px] font-bold ${app.toast.bad ? 'text-red-300' : 'text-cyan-100'}`} style={{ background: app.toast.bad ? 'linear-gradient(160deg,#3b0d12,#1c090c)' : undefined }}>
            {app.toast.msg}
          </div>
        </div>
      )}

      {/* Оффер ВК (после 5 минут игры, раз на устройство) */}
      {app.vkOffer && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="nr-panel w-full max-w-[330px] p-5 text-center">
            <div className="text-3xl">💙</div>
            <div className="mt-2 text-lg font-black text-white">Мы в ВКонтакте!</div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed text-slate-300">
              Новости, промокоды и общение с разработчиком. Подпишись и получи <b className="text-amber-300">+300 золота</b>!
            </div>
            <button className="nrb nrb-vk mt-4 w-full py-2.5 text-sm font-extrabold" onClick={() => { app.vkOpen(); app.setVkOffer(false) }}>
              Подписаться
            </button>
            <button className="nrb nrb-ghost mt-2 w-full py-2 text-[12px] font-bold" onClick={() => app.setVkOffer(false)}>
              Позже
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================ ГЛАВНАЯ ============================ */
function HomeTab({ app }: { app: NeonApp }) {
  const { profile } = app
  const skin = towerSkin(app.cosmetics.selectedTower)
  return (
    <div className="flex min-h-full flex-col">
      {/* Арена-инфо */}
      <div className="nr-panel relative overflow-hidden p-4">
        <div className="absolute -right-6 -top-8 h-36 w-36 rounded-full" style={{ background: `radial-gradient(circle, ${skin.accent}22, transparent 70%)` }} />
        <div className="flex items-center gap-3">
          <TowerPreview skin={skin.id} size={64} />
          <div className="min-w-0">
            <div className="text-[16px] font-black text-white">{skin.name}</div>
            <div className="text-[11px] font-semibold text-slate-400">{skin.desc}</div>
            <div className="mt-1 flex gap-1.5">
              <span className="rounded-md bg-sky-500/15 px-2 py-0.5 text-[10px] font-black text-sky-300">Башни ур. {profile.towerLevel}</span>
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-black text-amber-300">{profile.trophies} 🏆</span>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/30 px-2 py-2">
            <div className="text-[15px] font-black text-emerald-400">{profile.wins}</div>
            <div className="text-[9.5px] font-bold text-slate-400">ПОБЕД</div>
          </div>
          <div className="rounded-xl bg-black/30 px-2 py-2">
            <div className="text-[15px] font-black text-yellow-400">{profile.draws}</div>
            <div className="text-[9.5px] font-bold text-slate-400">НИЧЬИХ</div>
          </div>
          <div className="rounded-xl bg-black/30 px-2 py-2">
            <div className="text-[15px] font-black text-red-400">{profile.losses}</div>
            <div className="text-[9.5px] font-bold text-slate-400">ПОРАЖЕНИЙ</div>
          </div>
        </div>
      </div>

      {/* БОЙ */}
      <div className="mt-4">
        <button className="nrb nrb-fight relative w-full overflow-hidden py-6 text-center" onClick={app.queueStart}>
          <span className="nr-sheen absolute inset-0" />
          <span className="relative block text-[26px] font-black tracking-[0.14em]">В БОЙ!</span>
          <span className="relative mt-0.5 block text-[11px] font-bold text-pink-100/80">
            {app.online ? 'Поиск живого соперника · 15 сек · далее бот' : 'Офлайн: бой против бота'}
          </span>
        </button>
      </div>

      {/* Дружеская колода превью */}
      <div className="nr-panel mt-4 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12px] font-black text-slate-200">ТВОЯ КОЛОДА</div>
          <button className="text-[11px] font-bold text-cyan-300" onClick={() => app.setTab('deck')}>изменить →</button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {profile.deck.map((id) => {
            const def = CARD_MAP[id]
            if (!def) return null
            return <CardArt key={id} def={def} level={profile.cards[id] ?? 1} className="aspect-[3/3.5]" />
          })}
        </div>
      </div>

      {/* ВКонтакте */}
      <button className="nrb nrb-vk mt-3 flex items-center justify-center gap-2 py-3 text-sm font-extrabold" onClick={app.vkOpen}>
        💙 Мы в ВКонтакте
      </button>

      <div className="mt-3 text-center text-[10px] leading-relaxed text-slate-500">
        ИП Снегирёв Иван · Neon Royale · {new Date().getFullYear()}
      </div>
    </div>
  )
}

/* ============================ МАГАЗИН ============================ */
function ShopTab({ app }: { app: NeonApp }) {
  const { profile } = app
  const [section, setSection] = useState<'heroes' | 'towers' | 'skins'>('heroes')
  const shopHeroes = CARDS.filter((c) => c.unlock === 'shop' && !c.build)
  const shopBuilds = CARDS.filter((c) => c.unlock === 'shop' && c.build)
  const visibleSkins = TOWER_SKINS.filter((s) => !s.fox || profile.isFox)

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {([['heroes', '⚔️ Герои'], ['towers', '🗼 Башни-карты'], ['skins', '🏰 Башни']] as const).map(([k, label]) => (
          <button key={k} className={`nrb py-2 text-[12px] font-extrabold ${section === k ? 'nrb-cyan' : 'nrb-ghost'}`} onClick={() => setSection(k)}>
            {label}
          </button>
        ))}
      </div>

      {(section === 'heroes' || section === 'towers') && (
        <div className="grid grid-cols-3 gap-2.5">
          {(section === 'heroes' ? shopHeroes : shopBuilds).map((def) => {
            const owned = !!profile.cards[def.id]
            return (
              <div key={def.id}>
                <CardArt def={def} level={owned ? (profile.cards[def.id] ?? 1) : 0} className="aspect-[3/3.9]" costBadge={!owned} />
                <div className="mt-1.5">
                  {owned ? (
                    <div className="rounded-lg bg-emerald-500/15 py-1.5 text-center text-[10.5px] font-black text-emerald-300">КУПЛЕНО</div>
                  ) : (
                    <button
                      className={`nrb w-full py-1.5 text-[11px] font-black ${profile.gold >= (def.shopPrice ?? 0) ? 'nrb-gold' : 'nrb-ghost'}`}
                      onClick={() => void app.shop('buyCard', def.id)}
                    >
                      🪙 {def.shopPrice?.toLocaleString('ru-RU')}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {section === 'skins' && (
        <div className="space-y-2.5">
          <div className="nr-panel flex items-center justify-between p-3">
            <div>
              <div className="text-[13px] font-black text-white">Усиление всех башен</div>
              <div className="text-[10.5px] text-slate-400">+10% HP и урона за уровень (макс. ур. {MAX_TOWER_LEVEL})</div>
            </div>
            {profile.towerLevel >= MAX_TOWER_LEVEL ? (
              <div className="rounded-lg bg-emerald-500/15 px-3 py-2 text-[11px] font-black text-emerald-300">МАКС</div>
            ) : (
              <button
                className={`nrb px-3 py-2 text-[12px] font-black ${profile.gold >= TOWER_LEVEL_COSTS[profile.towerLevel - 1] ? 'nrb-gold' : 'nrb-ghost'}`}
                onClick={() => void app.shop('upTowers')}
              >
                🪙 {TOWER_LEVEL_COSTS[profile.towerLevel - 1].toLocaleString('ru-RU')}
              </button>
            )}
          </div>
          {visibleSkins.map((sk) => {
            const owned = profile.towerSkin === sk.id || towerOwned(sk, profile.trophies, profile.isFox, profile.skins)
            const selected = profile.towerSkin === sk.id
            return (
              <div key={sk.id} className="nr-panel flex items-center gap-3 p-3">
                <TowerPreview skin={sk.id} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-black" style={{ color: sk.accent }}>{sk.name}</div>
                  <div className="text-[10.5px] leading-snug text-slate-400">{sk.desc}</div>
                  {!sk.fox && sk.unlockTrophies >= 0 && <div className="mt-0.5 text-[10px] font-bold text-cyan-300/80">или открытие при {sk.unlockTrophies} 🏆</div>}
                </div>
                {selected ? (
                  <div className="rounded-lg bg-cyan-500/20 px-3 py-2 text-[11px] font-black text-cyan-200">ВЫБРАНА</div>
                ) : owned ? (
                  <button className="nrb nrb-cyan px-3 py-2 text-[11px] font-black" onClick={() => app.selectTower(sk.id)}>ВЫБРАТЬ</button>
                ) : (
                  <button
                    className={`nrb px-3 py-2 text-[11px] font-black ${profile.gold >= sk.price ? 'nrb-gold' : 'nrb-ghost'}`}
                    onClick={() => void app.shop('buyTower', sk.id)}
                  >
                    🪙 {sk.price.toLocaleString('ru-RU')}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ============================ КОЛОДА ============================ */
function DeckTab({ app }: { app: NeonApp }) {
  const { profile } = app
  const [deck, setDeck] = useState<string[]>(profile.deck.length === 8 ? [...profile.deck] : [...DEFAULT_DECK])
  const [selSlot, setSelSlot] = useState<number | null>(null)
  const [details, setDetails] = useState<string | null>(null)
  const owned = useMemo(() => CARDS.filter((c) => profile.cards[c.id] || c.unlock === 'start'), [profile.cards])
  const avg = Math.round(Object.values(profile.cards).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(profile.cards).length))

  const pickCard = (id: string) => {
    if (deck.includes(id)) {
      app.say('Эта карта уже в колоде')
      return
    }
    const slot = selSlot ?? 0
    const nd = [...deck]
    nd[slot] = id
    setDeck(nd)
    setSelSlot(null)
    app.say('Карта поставлена в колоду — не забудь сохранить')
  }

  return (
    <div>
      <div className="nr-panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[13px] font-black text-white">Колода боя</div>
          <div className="text-[10.5px] font-bold text-slate-400">средний ур. {avg}</div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {deck.map((id, i) => {
            const def = CARD_MAP[id]
            if (!def) return null
            return (
              <button
                key={`${i}-${id}`}
                className={`relative rounded-xl transition-transform ${selSlot === i ? 'scale-[1.04] ring-2 ring-cyan-400' : ''}`}
                onClick={() => setSelSlot(i)}
              >
                <CardArt def={def} level={profile.cards[id] ?? 1} className="aspect-[3/3.9]" />
                {selSlot === i && <div className="absolute inset-x-0 -bottom-1 text-center text-[9px] font-black text-cyan-300">ВЫБРАН СЛОТ</div>}
              </button>
            )
          })}
        </div>
        <button className="nrb nrb-cyan mt-3 w-full py-2.5 text-[13px] font-black" onClick={() => void app.saveDeck(deck)}>
          СОХРАНИТЬ КОЛОДУ
        </button>
      </div>

      <div className="mt-4 text-[12px] font-black text-slate-300">
        ТВОИ КАРТЫ <span className="font-bold text-slate-500">({owned.length})</span>
        <span className="ml-2 font-normal text-[10.5px] text-slate-500">тап по слоту → тап по карте</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2.5">
        {owned.map((def) => (
          <button key={def.id} onClick={() => pickCard(def.id)} onContextMenu={(e) => { e.preventDefault(); setDetails(def.id) }}>
            <CardArt def={def} level={profile.cards[def.id] ?? 1} className="aspect-[3/3.9]" />
          </button>
        ))}
      </div>
      <div className="mt-2 text-center text-[10px] text-slate-500">долгое нажатие по карте — подробности и улучшение</div>

      {details && (
        <CardDetails
          def={CARD_MAP[details]}
          level={profile.cards[details] ?? 1}
          gold={profile.gold}
          onClose={() => setDetails(null)}
          onUpgrade={async () => {
            const r = await app.shop('upCard', details)
            if (r.ok) setDetails(null)
          }}
        />
      )}
    </div>
  )
}

function CardDetails({ def, level, gold, onClose, onUpgrade }: { def: CardDef; level: number; gold: number; onClose: () => void; onUpgrade: () => Promise<void> }) {
  const cost = nextUpgradeCost(level)
  const r = rarityStyle(def)
  return (
    <div className="absolute inset-0 z-[60] flex items-end bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="nr-panel mx-auto w-full max-w-[380px] p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex gap-3">
          <CardArt def={def} level={level} className="h-[150px] w-[104px] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-black" style={{ color: r.text }}>{def.name}</div>
            <div className="text-[10px] font-bold" style={{ color: r.text }}>{r.label}</div>
            <div className="mt-1 text-[11px] leading-snug text-slate-300">{def.desc}</div>
            <div className="mt-1.5 space-y-0.5">
              {cardStatLines(def, level).map((l, i) => (
                <div key={i} className="text-[10px] font-bold text-slate-400">· {l}</div>
              ))}
            </div>
          </div>
        </div>
        {level < MAX_CARD_LEVEL ? (
          <button
            className={`nrb mt-3 w-full py-2.5 text-[13px] font-black ${gold >= cost ? 'nrb-gold' : 'nrb-ghost'}`}
            onClick={() => void onUpgrade()}
          >
            УЛУЧШИТЬ ДО УР. {level + 1} — 🪙 {cost.toLocaleString('ru-RU')}
          </button>
        ) : (
          <div className="mt-3 rounded-lg bg-amber-500/15 py-2.5 text-center text-[12px] font-black text-amber-300">МАКСИМАЛЬНЫЙ УРОВЕНЬ</div>
        )}
        <button className="nrb nrb-ghost mt-2 w-full py-2 text-[12px] font-bold" onClick={onClose}>Закрыть</button>
      </div>
    </div>
  )
}

/* ============================ ТОП ============================ */
function TopTab({ app }: { app: NeonApp }) {
  const rows = app.leaderboard?.source === 'server' ? app.leaderboard.rows : app.localLeaderboard()
  const isLocal = app.leaderboard?.source !== 'server'
  return (
    <div>
      <div className="nr-panel p-3 text-center">
        <div className="text-lg font-black text-white">🏆 Таблица лидеров</div>
        <div className="mt-0.5 text-[11px] font-bold text-slate-400">
          {isLocal ? 'офлайн-режим: локальный топ (сервер недоступен)' : `сервер · игроков в топе: ${rows.length}`}
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {rows.slice(0, 50).map((r, i) => {
          const me = r.nick === app.profile.nick
          return (
            <div key={`${r.nick}-${i}`} className={`nr-panel flex items-center gap-3 px-3 py-2 ${me ? 'ring-1 ring-cyan-400/60' : ''}`}>
              <div className={`w-7 text-center text-[14px] font-black ${i === 0 ? 'text-amber-300' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-300' : 'text-slate-500'}`}>
                {i + 1}
              </div>
              <div className="text-[15px]">{i === 0 ? '👑' : '🎮'}</div>
              <div className="min-w-0 flex-1 truncate text-[13px] font-black text-slate-100">
                {r.nick} {me && <span className="text-[9px] font-bold text-cyan-300">— это ты</span>}
              </div>
              {typeof r.wins === 'number' && <div className="text-[10px] font-bold text-emerald-300/80">{r.wins} побед</div>}
              <div className="text-[13px] font-black tabular-nums text-cyan-300">{r.trophies} 🏆</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ============================ ОВЕРЛЕИ ============================ */
function SearchOverlay({ app, left, window: win }: { app: NeonApp; left: number; window: number }) {
  const frac = 1 - Math.max(0, Math.min(1, left / win))
  return (
    <div className="absolute inset-0 z-[65] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="nr-panel flex w-[290px] flex-col items-center p-6">
        <div className="relative h-28 w-28">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#1e293b" strokeWidth="9" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#22d3ee" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${frac * 264} 264`} style={{ transition: 'stroke-dasharray 0.3s linear' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[22px]">🔍</div>
        </div>
        <div className="mt-3 text-[16px] font-black text-white">Поиск соперника…</div>
        <div className="mt-1 text-[12px] font-bold text-slate-400">осталось {Math.ceil(left / 1000)} сек · затем бой с ботом</div>
        <button className="nrb nrb-danger mt-4 w-full py-2.5 text-[13px] font-black" onClick={app.queueCancel}>
          ОТМЕНИТЬ
        </button>
      </div>
    </div>
  )
}

function SettingsOverlay({ app }: { app: NeonApp }) {
  const { profile, online } = app
  const [nick, setNick] = useState(profile.nick)
  return (
    <div className="absolute inset-0 z-[65] flex flex-col bg-black/80 backdrop-blur-sm" onClick={() => app.setOverlay(null)}>
      <div className="nr-panel mx-3 my-auto max-h-[86dvh] w-auto max-w-[400px] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-black text-white">⚙️ Настройки</div>

        <div className="mt-3">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Твой ник</div>
          <div className="mt-1 flex gap-2">
            <input
              className="nrb min-w-0 flex-1 bg-black/30 px-3 py-2.5 text-[13px] font-bold text-white outline-none"
              value={nick}
              maxLength={16}
              onChange={(e) => setNick(e.target.value)}
              placeholder="Ник (2–16 символов)"
            />
            <button className="nrb nrb-cyan px-4 py-2.5 text-[12px] font-black" onClick={() => app.setNick(nick)}>
              ОК
            </button>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">ник должен быть уникальным на сервере</div>
        </div>

        <button className="nrb nrb-gold mt-3 w-full py-2.5 text-[13px] font-black" onClick={() => app.setOverlay('promo')}>
          🎟️ Ввести промокод
        </button>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <button className="nrb nrb-ghost py-2.5 text-[12px] font-bold" onClick={() => app.setOverlay('privacy')}>📜 Политика ИП</button>
          <button className="nrb nrb-ghost py-2.5 text-[12px] font-bold" onClick={() => app.setOverlay('terms')}>📄 Соглашение</button>
        </div>

        <button className="nrb nrb-vk mt-2 w-full py-2.5 text-[13px] font-extrabold" onClick={app.vkOpen}>
          💙 Мы в ВКонтакте
        </button>

        <div className="mt-3 rounded-xl bg-black/30 p-3 text-[11px] leading-relaxed text-slate-400">
          <div>Сервер: <b className={online ? 'text-emerald-400' : 'text-slate-500'}>{online ? 'подключён' : 'нет связи'}</b></div>
          <div>Ник: <b className="text-slate-200">{profile.nick}</b></div>
          <div>Прогресс: {profile.trophies} 🏆 · {profile.gold} 🪙 · побед {profile.wins}</div>
          {profile.isFox && <div className="mt-1 font-bold text-orange-300">🦊 Лисий доступ активен</div>}
        </div>

        <button className="nrb nrb-ghost mt-3 w-full py-2 text-[12px] font-bold" onClick={() => app.setOverlay(null)}>Закрыть</button>
      </div>
    </div>
  )
}

function NickOverlay({ app }: { app: NeonApp }) {
  const [nick, setNick] = useState('')
  return (
    <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/90 p-4">
      <div className="nr-panel w-full max-w-[340px] p-5 text-center">
        <div className="text-2xl">🎮</div>
        <div className="mt-1 text-lg font-black text-white">{app.needNick ? 'Как тебя звать на арене?' : 'Смена ника'}</div>
        <div className="mt-1 text-[12px] text-slate-400">Придумай уникальный ник — его увидят соперники и таблица лидеров.</div>
        <input
          className="nrb mt-4 w-full bg-black/30 px-3 py-3 text-center text-[15px] font-black text-white outline-none"
          value={nick}
          maxLength={16}
          onChange={(e) => setNick(e.target.value)}
          placeholder="Твой ник"
          autoFocus
        />
        <button
          className="nrb nrb-fight mt-3 w-full py-3 text-[14px] font-black tracking-wider"
          onClick={() => {
            if (app.setNick(nick)) app.setOverlay(null)
          }}
        >
          В ИГРУ!
        </button>
        {!app.needNick && (
          <button className="nrb nrb-ghost mt-2 w-full py-2 text-[12px] font-bold" onClick={() => app.setOverlay(null)}>
            Закрыть
          </button>
        )}
      </div>
    </div>
  )
}

function PromoOverlay({ app }: { app: NeonApp }) {
  const [code, setCode] = useState('')
  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={() => app.setOverlay(null)}>
      <div className="nr-panel w-full max-w-[340px] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="text-center text-lg font-black text-white">🎟️ Промокод</div>
        <input
          className="nrb mt-3 w-full bg-black/30 px-3 py-3 text-center text-[15px] font-black uppercase tracking-wider text-white outline-none"
          value={code}
          maxLength={20}
          onChange={(e) => setCode(e.target.value)}
          placeholder="ВВЕДИ КОД"
        />
        <button
          className="nrb nrb-gold mt-3 w-full py-3 text-[14px] font-black"
          onClick={async () => {
            const r = await app.promo(code)
            if (r.ok) app.setOverlay(null)
          }}
        >
          АКТИВИРОВАТЬ
        </button>
        <div className="mt-2 text-center text-[10px] leading-relaxed text-slate-500">
          особые коды проверяются на сервере; лисьи карты открываются только секретным кодом
        </div>
        <button className="nrb nrb-ghost mt-2 w-full py-2 text-[12px] font-bold" onClick={() => app.setOverlay(null)}>Закрыть</button>
      </div>
    </div>
  )
}

function LegalOverlay({ title, text, onClose }: { title: string; text: string; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-[70] flex flex-col bg-black/88 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-3 my-auto flex max-h-[88dvh] flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="nr-panel flex min-h-0 flex-1 flex-col p-4">
          <div className="pb-2 text-center text-[15px] font-black text-white">{title}</div>
          <div className="nr-scroll min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap text-[11.5px] leading-relaxed text-slate-300">{text}</div>
          <button className="nrb nrb-ghost mt-3 w-full py-2 text-[12px] font-bold" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  )
}

/* ============================ ПРЕВЬЮ БАШНИ ============================ */
function TowerPreview({ skin, size = 56 }: { skin: string; size?: number }) {
  const sk = towerSkin(skin)
  return (
    <div className="relative shrink-0 rounded-2xl" style={{ width: size, height: size, background: `radial-gradient(circle at 50% 60%, ${sk.accent}33, #0a0e18 75%)`, border: `1.5px solid ${sk.accent}55` }}>
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: size * 0.14 }}>
        {/* корпус */}
        <div style={{ width: size * 0.42, height: size * 0.5, background: `linear-gradient(160deg, ${sk.body}, ${sk.bodyDark})`, borderRadius: size * 0.08, border: '1px solid rgba(0,0,0,0.6)' }} />
        {/* крыша */}
        <div style={{ position: 'absolute', bottom: size * 0.5, left: '50%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: `${size * 0.26}px solid transparent`, borderRight: `${size * 0.26}px solid transparent`, borderBottom: `${size * 0.22}px solid ${sk.body}` }} />
        {/* свечение */}
        <div style={{ position: 'absolute', bottom: size * 0.2, left: '50%', transform: 'translateX(-50%)', width: size * 0.16, height: size * 0.16, borderRadius: '50%', background: sk.accent, boxShadow: `0 0 ${size * 0.14}px ${sk.accent}` }} />
      </div>
    </div>
  )
}

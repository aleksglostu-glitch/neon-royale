'use client'

/**
 * NEON ROYALE — главный хук приложения.
 * Восстановлен из сборки: режимы local/server, очередь 15 сек, магазин, колода, промокоды.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  CARD_MAP, DEFAULT_DECK, MAX_CARD_LEVEL, MAX_TOWER_LEVEL, nextUpgradeCost, TOWER_LEVEL_COSTS,
  towerSkin, towerOwned, TOWER_SKINS, validDeck,
} from '@/lib/game/neon/cards'
import { Battle, createLocalBattle, type BattleView } from '@/lib/game/neon/engine'
import {
  defaultCosmetics, defaultProfile, loadCosmetics, loadNick, loadProfile, normalizeNick, saveCosmetics,
  saveNick, saveProfile, uid, localPromoCheck, type Cosmetics, type Profile,
} from '@/lib/game/neon/profile'

export const SERVER_URL = 'https://app-75f85dd2607fb481.up.railway.app'
export const VK_URL = 'https://vk.ru/club240566635'
/** Окно поиска соперника, мс */
export const QUEUE_WINDOW_MS = 15_000

export type Screen = 'menu' | 'battle'
export type Mode = 'local' | 'server'
export type TabKey = 'home' | 'shop' | 'deck' | 'top'

export interface LbRow {
  nick: string
  trophies: number
  wins?: number
}

export interface SearchResult {
  t: number
  outcome: 'win' | 'draw' | 'lose'
  myCrowns: number
  foeCrowns: number
  foe: string
  isBot: boolean
  gold: number
  trophies: number
}

interface ShopResp {
  ok: boolean
  error?: string
  profile?: Profile
  label?: string
}

/** Тип ответа промокода сервера */
interface PromoResp {
  ok: boolean
  error?: string
  fox?: boolean
  gold?: number
  profile?: Profile
  label?: string
}

export function useNeon() {
  const socketRef = useRef<Socket | null>(null)
  const battleRef = useRef<Battle | null>(null)
  const localOverRef = useRef(false)
  const lastResultKey = useRef<string | null>(null)
  const modeRef = useRef<Mode>('local')
  const loggedRef = useRef(false)
  const searchingRef = useRef(false)
  const queueEndRef = useRef(0)

  const [online, setOnline] = useState(false)
  const [profile, setProfile] = useState<Profile>(defaultProfile)
  const [cosmetics, setCosmetics] = useState<Cosmetics>(defaultCosmetics)
  const [screen, setScreen] = useState<Screen>('menu')
  const [tab, setTab] = useState<TabKey>('home')
  const [overlay, setOverlay] = useState<'settings' | 'privacy' | 'terms' | 'nick' | 'promo' | null>(null)
  const [mode, setMode] = useState<Mode>('local')
  const [battle, setBattle] = useState<BattleView | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchStart, setSearchStart] = useState(0)
  const [queueLeft, setQueueLeft] = useState(0)
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null)
  const [leaderboard, setLeaderboard] = useState<{ rows: LbRow[]; source: 'server' | 'local' } | null>(null)
  const [vkOffer, setVkOffer] = useState(false)
  const [needNick, setNeedNick] = useState(false)

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const say = useCallback((msg: string, bad?: boolean) => {
    setToast({ msg, bad })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  // ---- Профиль на старте ----
  useEffect(() => {
    setProfile(loadProfile())
    setCosmetics(loadCosmetics())
    const n = loadNick()
    if (!n) setNeedNick(true)
  }, [])

  const mergeProfile = useCallback((p: Profile) => {
    if (!p) return
    setProfile(p)
    saveProfile(p)
  }, [])

  // ---- Сетевой режим ----
  useEffect(() => {
    let server = SERVER_URL
    try {
      const q = new URLSearchParams(window.location.search).get('server')
      if (q) server = q.replace(/\/+$/, '')
    } catch {}
    const s = io(server, {
      path: '/',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1200,
      reconnectionDelayMax: 5000,
    })
    socketRef.current = s

    s.on('connect', () => {
      s.emit(
        'r:login',
        { uid: uid(), nick: loadNick() },
        (resp: { profile?: Profile; nickTaken?: boolean; nick?: string } | undefined) => {
          if (resp?.profile) {
            loggedRef.current = true
            setOnline(true)
            mergeProfile(resp.profile)
            if (resp.nickTaken && loadNick()) say('Этот ник уже занял другой игрок — выбери другой в настройках', true)
            if (typeof resp.nick === 'string' && resp.nick) saveNick(resp.nick)
            // Вернуться в активный сетевой бой после обрыва
            const hasBattle = modeRef.current === 'server'
            if (!hasBattle) s.emit('r:rejoin', {}, (rj: { ok?: boolean; battle?: BattleView } | undefined) => {
              if (rj?.ok && rj.battle) {
                modeRef.current = 'server'
                setMode('server')
                searchingRef.current = false
                setSearching(false)
                setBattle(rj.battle)
                setScreen('battle')
              }
            })
          }
        }
      )
      s.emit('r:leaderboard', {}, (resp: { ok?: boolean; rows?: LbRow[] } | undefined) => {
        if (resp?.ok && Array.isArray(resp.rows) && resp.rows.length > 0) {
          setLeaderboard({ rows: resp.rows.slice(0, 100), source: 'server' })
        }
      })
    })
    s.on('disconnect', () => setOnline(false))

    s.on('r:search:started', () => {
      if (searchingRef.current || modeRef.current === 'server') return
      searchingRef.current = true
      setSearching(true)
      setSearchStart(Date.now())
    })
    s.on('r:search:cancelled', () => {
      if (modeRef.current === 'server') return
      searchingRef.current = false
      setSearching(false)
    })
    s.on('r:match:start', (d: { foe?: { name?: string; isBot?: boolean } } | undefined) => {
      // Если уже идёт локальный бой, который стартовали < 4 сек назад, и соперник живой — заменяем на сетевой
      if (battleRef.current) {
        return
      }
      searchingRef.current = false
      modeRef.current = 'server'
      setMode('server')
      setSearching(false)
      localOverRef.current = false
      battleRef.current = null
      setBattle(null)
      lastResultKey.current = null
      setScreen('battle')
    })
    s.on('r:state', (st: BattleView) => {
      if (battleRef.current || modeRef.current !== 'server') return
      setBattle(st)
      if (st.over && st.result) {
        const key = `${st.id}:${st.result.outcome}`
        if (lastResultKey.current !== key) {
          lastResultKey.current = key
          addHistory({ t: Date.now(), outcome: st.result.outcome, myCrowns: st.result.myCrowns, foeCrowns: st.result.foeCrowns, foe: st.foe.name, isBot: st.foe.isBot, gold: st.result.gold, trophies: st.result.trophies })
        }
      }
    })
    s.on('r:battle:end', () => {
      s.emit('r:profile:get', {}, (resp: { profile?: Profile } | undefined) => {
        if (resp?.profile) mergeProfile(resp.profile)
      })
      setTimeout(() => {
        if (modeRef.current === 'server') {
          modeRef.current = 'local'
          setMode('local')
          battleRef.current = null
          setBattle(null)
          setScreen('menu')
        }
      }, 2600)
    })
    s.on('r:error', (d: { message?: string } | undefined) => {
      if (d?.message) say(d.message, true)
    })

    // Оффер ВК после 5 минут суммарной игры (один раз на устройство)
    const playedIv = setInterval(() => {
      try {
        const n = Number(localStorage.getItem('nr-played') || '0') + 1
        localStorage.setItem('nr-played', String(n))
        if (n >= 300 && !localStorage.getItem('nr-vk-offer-shown')) {
          localStorage.setItem('nr-vk-offer-shown', '1')
          setVkOffer(true)
        }
      } catch {}
    }, 1000)

    return () => {
      clearInterval(playedIv)
      s.close()
      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Локальный бой: тикер ----
  useEffect(() => {
    if (mode !== 'local' || !battle) return
    let last = Date.now()
    const iv = setInterval(() => {
      const b = battleRef.current
      if (!b) return
      const now = Date.now()
      const dt = Math.min(0.25, (now - last) / 1000)
      last = now
      b.tick(dt)
      const view = b.serialize(0)
      setBattle(view)
      if (b.over && !localOverRef.current) {
        localOverRef.current = true
        const res = view.result
        if (res) {
          setProfile((p) => {
            const np = {
              ...p,
              gold: p.gold + res.gold,
              trophies: Math.max(0, p.trophies + res.trophies),
              wins: p.wins + (res.outcome === 'win' ? 1 : 0),
              losses: p.losses + (res.outcome === 'lose' ? 1 : 0),
              draws: p.draws + (res.outcome === 'draw' ? 1 : 0),
            }
            saveProfile(np)
            return np
          })
          addHistory({ t: Date.now(), outcome: res.outcome, myCrowns: res.myCrowns, foeCrowns: res.foeCrowns, foe: view.foe.name, isBot: true, gold: res.gold, trophies: res.trophies })
        }
        setTimeout(() => {
          if (modeRef.current === 'local') {
            battleRef.current = null
            setBattle(null)
            setScreen('menu')
          }
        }, 2600)
        clearInterval(iv)
      }
    }, 100)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, battle?.id])

  // ---- Очередь: локальный таймаут 15 сек ----
  useEffect(() => {
    if (!searching) return
    const iv = setInterval(() => {
      if (!searchingRef.current) return
      const left = Math.max(0, queueEndRef.current - Date.now())
      setQueueLeft(left)
      if (left <= 0) {
        searchingRef.current = false
        setSearching(false)
        try {
          socketRef.current?.emit('r:queue:cancel')
        } catch {}
        startLocalBattle()
      }
    }, 250)
    return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching])

  const ack = useCallback(
    (event: string, data: unknown): Promise<Record<string, unknown>> =>
      new Promise((resolve) => {
        let done = false
        socketRef.current?.emit(event, data, (resp: Record<string, unknown> | undefined) => {
          if (!done) {
            done = true
            resolve(resp ?? {})
          }
        })
        setTimeout(() => {
          if (!done) {
            done = true
            resolve({ ok: false, error: 'Сервер не отвечает' })
          }
        }, 8000)
      }),
    []
  )

  const addHistory = useCallback((row: SearchResult) => {
    setCosmetics((c) => {
      const nc = { ...c, history: [row, ...c.history].slice(0, 30) }
      saveCosmetics(nc)
      return nc
    })
  }, [])

  // ---- Действия ----
  const startLocalBattle = useCallback(() => {
    const p = profileRef.current
    battleRef.current = createLocalBattle({
      myName: p.nick,
      deck: p.deck,
      cardLevels: p.cards,
      towerLevel: p.towerLevel,
      towerSkin: cosmeticsRef.current.selectedTower,
      isFox: p.isFox,
    })
    queueEndRef.current = 0
    localOverRef.current = false
    lastResultKey.current = null
    modeRef.current = 'local'
    setMode('local')
    searchingRef.current = false
    setSearching(false)
    setBattle(battleRef.current.serialize(0))
    setScreen('battle')
  }, [])

  const profileRef = useRef<Profile>(profile)
  const cosmeticsRef = useRef<Cosmetics>(cosmetics)
  useEffect(() => {
    profileRef.current = profile
  }, [profile])
  useEffect(() => {
    cosmeticsRef.current = cosmetics
  }, [cosmetics])

  const queueStart = useCallback(() => {
    if (socketRef.current?.connected && loggedRef.current) {
      if (searchingRef.current || battleRef.current) return
      searchingRef.current = true
      queueEndRef.current = Date.now() + QUEUE_WINDOW_MS
      setSearchStart(Date.now())
      setSearching(true)
      socketRef.current.emit('r:queue:start')
    } else {
      startLocalBattle()
    }
  }, [startLocalBattle])

  const queueCancel = useCallback(() => {
    searchingRef.current = false
    socketRef.current?.emit('r:queue:cancel')
    setSearching(false)
  }, [])

  /** Выйти из боя: локальный — сразу, сетевой — сообщаем серверу */
  const leaveBattle = useCallback(() => {
    if (modeRef.current === 'server') {
      try {
        socketRef.current?.emit('r:battle:leave')
      } catch {}
      modeRef.current = 'local'
      setMode('local')
    }
    battleRef.current = null
    setBattle(null)
    setScreen('menu')
  }, [])

  const deploy = useCallback(async (handIdx: number, x: number, y: number): Promise<{ ok: boolean; error?: string }> => {
    if (modeRef.current === 'local') {
      const b = battleRef.current
      if (!b) return { ok: false, error: 'Бой не активен' }
      const r = b.deploy(0, handIdx, x, y)
      return r
    }
    const r = (await ack('r:deploy', { cardIdx: handIdx, x, y })) as { ok?: boolean; error?: string }
    return { ok: !!r.ok, error: r.error }
  }, [ack])

  // ---- Магазин ----
  const shop = useCallback(
    async (action: 'buyCard' | 'upCard' | 'upTowers' | 'buyTower' | 'vkBonus', cardId?: string): Promise<ShopResp> => {
      if (loggedRef.current) {
        const r = (await ack('r:shop', { action, card: cardId })) as unknown as ShopResp
        if (r.ok) {
          if (r.profile) mergeProfile(r.profile)
          if (r.label) say(String(r.label))
          return r
        }
        if (r.error) say(String(r.error), true)
        return r
      }
      // Локальный режим
      const p = profileRef.current
      const apply = (np: Profile) => {
        saveProfile(np)
        setProfile(np)
      }
      if (action === 'buyCard') {
        const def = cardId ? CARD_MAP[cardId] : null
        if (!def || def.unlock !== 'shop' || !def.shopPrice) return { ok: false, error: 'Карта не продаётся' }
        if (p.cards[def.id]) return { ok: false, error: 'Уже куплена' }
        if (p.gold < def.shopPrice) return { ok: false, error: `Не хватает ${def.shopPrice - p.gold} золота` }
        apply({ ...p, gold: p.gold - def.shopPrice, cards: { ...p.cards, [def.id]: 1 } })
        say(`${def.name} куплена!`)
        return { ok: true }
      }
      if (action === 'upCard') {
        const def = cardId ? CARD_MAP[cardId] : null
        if (!def || !p.cards[def.id]) return { ok: false, error: 'Карты нет' }
        const lvl = p.cards[def.id]
        if (lvl >= MAX_CARD_LEVEL) return { ok: false, error: 'Максимальный уровень' }
        const cost = nextUpgradeCost(lvl)
        if (p.gold < cost) return { ok: false, error: `Не хватает ${cost - p.gold} золота` }
        apply({ ...p, gold: p.gold - cost, cards: { ...p.cards, [def.id]: lvl + 1 } })
        say(`${def.name} — уровень ${lvl + 1}!`)
        return { ok: true }
      }
      if (action === 'upTowers') {
        if (p.towerLevel >= MAX_TOWER_LEVEL) return { ok: false, error: 'Максимальный уровень' }
        const cost = TOWER_LEVEL_COSTS[p.towerLevel - 1]
        if (p.gold < cost) return { ok: false, error: `Не хватает ${cost - p.gold} золота` }
        apply({ ...p, gold: p.gold - cost, towerLevel: p.towerLevel + 1 })
        say(`Башни усилены до ур. ${p.towerLevel + 1}!`)
        return { ok: true }
      }
      if (action === 'buyTower') {
        const sk = towerSkin(cardId ?? '')
        if (sk.price <= 0) return { ok: false, error: 'Этот скин не продаётся' }
        if (p.towerSkin === sk.id) return { ok: false, error: 'Уже открыта' }
        if (p.gold < sk.price) return { ok: false, error: `Не хватает ${sk.price - p.gold} золота` }
        apply({ ...p, gold: p.gold - sk.price, towerSkin: sk.id })
        setCosmetics((c) => {
          const nc = { ...c, selectedTower: sk.id }
          saveCosmetics(nc)
          return nc
        })
        say(`Башня «${sk.name}» куплена!`)
        return { ok: true }
      }
      if (action === 'vkBonus') {
        if (p.vkBonus) return { ok: false, error: 'Бонус уже получен' }
        apply({ ...p, gold: p.gold + 300, vkBonus: true })
        say('Бонус ВКонтакте: +300 золота!')
        return { ok: true }
      }
      return { ok: false, error: 'Неизвестное действие' }
    },
    [ack, mergeProfile, say]
  )

  // ---- Колода ----
  const saveDeck = useCallback(
    async (deck: string[]): Promise<{ ok: boolean; error?: string }> => {
      const p = profileRef.current
      if (!(deck.length === 8 && new Set(deck).size === 8 && deck.every((id) => CARD_MAP[id] && p.cards[id]))) {
        say('Колода должна быть из 8 ваших карт', true)
        return { ok: false, error: 'bad deck' }
      }
      if (loggedRef.current) {
        const r = (await ack('r:deck:save', { deck })) as { ok?: boolean; profile?: Profile; error?: string }
        if (r.ok) {
          if (r.profile) mergeProfile(r.profile)
          say('Колода сохранена!')
          return { ok: true }
        }
        say(String(r.error ?? 'Ошибка'), true)
        return { ok: false }
      }
      const np = { ...p, deck: [...deck] }
      saveProfile(np)
      setProfile(np)
      say('Колода сохранена!')
      return { ok: true }
    },
    [ack, mergeProfile, say]
  )

  // ---- Выбор скина башни ----
  const selectTower = useCallback(
    (skinId: string): boolean => {
      const sk = towerSkin(skinId)
      const p = profileRef.current
      const owned = sk.id === p.towerSkin || towerOwned(sk, p.trophies, p.isFox, p.skins)
      if (!owned) {
        say('Эта башня ещё не открыта', true)
        return false
      }
      setCosmetics((c) => {
        const nc = { ...c, selectedTower: sk.id }
        saveCosmetics(nc)
        return nc
      })
      if (loggedRef.current) socketRef.current?.emit('r:cosmetics', { towerSkin: sk.id })
      setProfile((pp) => ({ ...pp, towerSkin: sk.id }))
      return true
    },
    [say]
  )

  // ---- Промокоды (онлайн — сервер, оффлайн — локальная проверка) ----
  const promo = useCallback(
    async (codeRaw: string): Promise<{ ok: boolean; error?: string }> => {
      const code = codeRaw.trim().toUpperCase()
      if (!code) return { ok: false, error: 'Введите код' }
      if (loggedRef.current) {
        const r = (await ack('r:promo', { code: codeRaw })) as unknown as PromoResp
        if (r.ok) {
          if (r.profile) mergeProfile(r.profile)
          if (r.fox) say('Промокод активирован! Особые карты и башни разблокированы')
          else if (r.label || r.gold) say(`Промокод активирован: +${r.gold ?? 0} золота`)
          return { ok: true }
        }
        say(String(r.error ?? 'Код не принят'), true)
        return { ok: false, error: r.error }
      }
      const lp = localPromoCheck(code)
      if (!lp) {
        say('Код не найден (нужна связь с сервером для особых кодов)', true)
        return { ok: false, error: 'Код не найден' }
      }
      const p = profileRef.current
      if (p.promoUsed.includes(lp.code)) return { ok: false, error: 'Код уже использован' }
      const np = { ...p, gold: p.gold + lp.gold, promoUsed: [...p.promoUsed, lp.code] }
      saveProfile(np)
      setProfile(np)
      say(`Промокод «${lp.label}»: +${lp.gold} золота!`)
      return { ok: true }
    },
    [ack, mergeProfile, say]
  )

  // ---- Ник ----
  const setNick = useCallback(
    (raw: string): boolean => {
      const nick = normalizeNick(raw)
      if (nick.length < 2) {
        say('Ник должен быть от 2 символов', true)
        return false
      }
      saveNick(nick)
      setNeedNick(false)
      if (loggedRef.current) {
        socketRef.current?.emit('r:login', { uid: uid(), nick }, (resp: { profile?: Profile; nickTaken?: boolean } | undefined) => {
          if (resp?.profile) mergeProfile(resp.profile)
          if (resp?.nickTaken) say('Этот ник уже занял другой игрок', true)
        })
      } else {
        setProfile((p) => ({ ...p, nick }))
      }
      return true
    },
    [mergeProfile, say]
  )

  // ---- ВКонтакте ----
  const vkOpen = useCallback(() => {
    try {
      window.open(VK_URL, '_blank', 'noopener,noreferrer')
    } catch {
      window.location.href = VK_URL
    }
    const p = profileRef.current
    if (!p.vkBonus) {
      void shop('vkBonus')
    }
  }, [shop])

  /** Локальная таблица лидеров (когда сервер недоступен): боты + игрок */
  const localLeaderboard = useCallback((): LbRow[] => {
    const p = profileRef.current
    const bots: LbRow[] = [
      { nick: 'НеоКороль', trophies: 1450, wins: 60 },
      { nick: 'Лисёнок', trophies: 1120, wins: 48 },
      { nick: 'Вихрь', trophies: 940, wins: 41 },
      { nick: 'Сокол', trophies: 720, wins: 33 },
      { nick: 'Мираж', trophies: 530, wins: 26 },
      { nick: 'Кобра', trophies: 380, wins: 19 },
      { nick: 'Барс', trophies: 240, wins: 12 },
      { nick: 'Атом', trophies: 120, wins: 7 },
      { nick: 'Тень', trophies: 60, wins: 4 },
      { nick: 'Рысь', trophies: 20, wins: 1 },
    ]
    return [...bots, { nick: p.nick || 'Командир', trophies: p.trophies, wins: p.wins }].sort((a, b) => b.trophies - a.trophies)
  }, [])

  return {
    online, profile, cosmetics, screen, tab, overlay, mode, battle, searching, searchStart, queueLeft,
    toast, leaderboard, vkOffer, needNick,
    setTab, setOverlay, setVkOffer, setLeaderboard,
    say, queueStart, queueCancel, deploy, startLocalBattle, leaveBattle,
    shop, saveDeck, selectTower, promo, setNick, vkOpen, localLeaderboard,
  }
}

export type NeonApp = ReturnType<typeof useNeon>

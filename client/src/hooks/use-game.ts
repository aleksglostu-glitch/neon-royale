'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { io } from 'socket.io-client'
import * as G from '@/lib/game/shared'

export type Phase = 'menu' | 'searching' | 'game'

/** Группа ВКонтакте игры */
export const VK_URL = 'https://vk.ru/club240566635'

export function openVk() {
  try {
    window.open(VK_URL, '_blank', 'noopener,noreferrer')
  } catch {
    window.location.href = VK_URL
  }
}

/** Сколько секунд в игре нужно набрать до предложения подписки */
export const SUB_OFFER_AFTER_S = 300
/** Награда за подписку (один раз на устройство) */
export const SUB_REWARD_CRYSTALS = 500

export interface SearchStatus {
  found: number
  windowRemaining: number
  countdown: number | null
}

export interface RoomMember {
  socketId: string
  name: string
  isBot: boolean
  skin?: string
}

export interface RoomState {
  code: string
  host: string
  members: RoomMember[]
}

/** Кошелёк хранится ТОЛЬКО на устройстве (никакие данные не отправляются на сервер) */
export interface Wallet {
  crystals: number
  ownedSkins: string[]
  selectedSkin: string
  totalEarned: number
  matchesWon: number
  usedPromos: string[]
  /** Секретный админ-доступ (лисья база + меню управления) */
  isAdmin: boolean
  adminKey: string | null
  /** Предложение подписки: получена ли награда / когда последний раз показывали */
  subClaimed: boolean
  subLastShown: number
  /** Суммарное время в матчах, сек */
  playSeconds: number
}

const AUTH_KEY = 'neon-towers-auth'
const NAME_KEY = 'neon-towers-name'
const WALLET_KEY = 'neon-towers-wallet'
const SERVER_KEY = 'neon-towers-server'

interface Auth {
  playerId: string
  key: string
}

function defaultWallet(): Wallet {
  return {
    crystals: 150,
    ownedSkins: ['standard'],
    selectedSkin: 'standard',
    totalEarned: 0,
    matchesWon: 0,
    usedPromos: [],
    isAdmin: false,
    adminKey: null,
    subClaimed: false,
    subLastShown: 0,
    playSeconds: 0,
  }
}

export function loadWallet(): Wallet {
  if (typeof window === 'undefined') return defaultWallet()
  try {
    const raw = localStorage.getItem(WALLET_KEY)
    if (!raw) return defaultWallet()
    const w = JSON.parse(raw) as Wallet
    return { ...defaultWallet(), ...w, ownedSkins: w.ownedSkins?.length ? w.ownedSkins : ['standard'] }
  } catch {
    return defaultWallet()
  }
}

function saveWallet(w: Wallet) {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(w))
  } catch {}
}

/** Адрес игрового сервера: в вебе — относительный (через шлюз), в APK — абсолютный.
 *  Для EXE-сборки (localhost без шлюза) используем запечённый адрес локального сервера. */
export function resolveServerUrl(): string {
  if (typeof window === 'undefined') return ''
  const saved = localStorage.getItem(SERVER_KEY)
  if (saved && saved.trim()) return saved.trim().replace(/\/+$/, '')
  const isNative = !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  const hasExeFlag = window.location.search.includes('exe=1')
  if (isNative || isLocal || hasExeFlag) {
    const baked = process.env.NEXT_PUBLIC_DEFAULT_SERVER
    return (baked ?? '').trim().replace(/\/+$/, '')
  }
  return ''
}

export function saveServerUrl(url: string) {
  try {
    if (url.trim()) localStorage.setItem(SERVER_KEY, url.trim().replace(/\/+$/, ''))
    else localStorage.removeItem(SERVER_KEY)
  } catch {}
}

function loadAuth(): Auth | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as Auth) : null
  } catch {
    return null
  }
}

export function loadName(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(NAME_KEY) ?? ''
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name)
  } catch {}
}

export function useGame() {
  const socketRef = useRef<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const [phase, setPhase] = useState<Phase>('menu')
  const [search, setSearch] = useState<SearchStatus | null>(null)
  const [game, setGame] = useState<G.GameState | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [room, setRoom] = useState<RoomState | null>(null)
  const [inRoomCode, setInRoomCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wallet, setWallet] = useState<Wallet>(defaultWallet)
  const [selfId, setSelfId] = useState<string | null>(null)
  const [subOfferOpen, setSubOfferOpen] = useState(false)
  const authRef = useRef<Auth | null>(null)
  const myIdRef = useRef<string | null>(null)
  const rewardedRef = useRef<string | null>(null)
  const phaseRef = useRef<Phase>('menu')

  useEffect(() => {
    myIdRef.current = myId
  }, [myId])
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    const walletTimer = setTimeout(() => setWallet(loadWallet()), 0)

    const serverUrl = resolveServerUrl()
    const s = io(serverUrl ? `${serverUrl}/?XTransformPort=3003` : '/?XTransformPort=3003', {
      // polling первым: если websocket не прошёл через шлюз, клиент сам его поднимет
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
      reconnection: true,
      // Бесконечные попытки: если сервер перезапустился или пропал интернет,
      // приложение само вернётся в сеть, как только связь появится
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
    socketRef.current = s

    s.on('connect', () => {
      setConnected(true)
      setSelfId(s.id ?? null)
      // Пытаемся вернуться в матч после обрыва или перезагрузки страницы
      const auth = authRef.current ?? loadAuth()
      if (auth) {
        authRef.current = auth
        s.emit('rejoin', auth)
      }
    })
    s.on('disconnect', () => setConnected(false))

    s.on('search:started', () => {
      setPhase('searching')
      setSearch({ found: 1, windowRemaining: G.SEARCH_WINDOW_MS, countdown: null })
    })
    s.on('search:status', (p: SearchStatus) => setSearch(p))
    s.on('search:cancelled', () => {
      setPhase('menu')
      setSearch(null)
    })
    s.on('match:start', (d: { gameId: string; playerId?: string; key?: string }) => {
      if (d.playerId && d.key) {
        const auth = { playerId: d.playerId, key: d.key }
        authRef.current = auth
        try {
          sessionStorage.setItem(AUTH_KEY, JSON.stringify(auth))
        } catch {}
        setMyId(d.playerId)
      }
      setSearch(null)
      setPhase('game')
    })
    s.on('game:state', (st: G.GameState) => {
      setGame(st)
      // Награда за матч начисляется локально, один раз на матч
      if (st.over && st.results && myIdRef.current) {
        const mine = st.results.find((r) => r.id === myIdRef.current && !r.isBot)
        if (mine && rewardedRef.current !== st.id) {
          rewardedRef.current = st.id
          const w = loadWallet()
          const updated: Wallet = {
            ...w,
            crystals: w.crystals + mine.reward,
            totalEarned: w.totalEarned + mine.reward,
            matchesWon: w.matchesWon + (mine.won ? 1 : 0),
          }
          saveWallet(updated)
          setWallet(updated)
        }
      }
    })
    s.on('rejoin:ok', (d: { playerId: string }) => {
      setMyId(d.playerId)
      setPhase('game')
    })
    s.on('rejoin:fail', () => {
      authRef.current = null
      try {
        sessionStorage.removeItem(AUTH_KEY)
      } catch {}
      setPhase('menu')
      setGame(null)
    })
    s.on('room:joined', (d: { code: string }) => setInRoomCode(d.code))
    s.on('room:state', (r: RoomState) => setRoom(r))
    s.on('error:msg', (d: { message: string }) => {
      setError(d.message)
      setTimeout(() => setError(null), 3500)
    })

    return () => {
      clearTimeout(walletTimer)
      s.disconnect()
      socketRef.current = null
    }
  }, [])

  // Счётчик времени в матчах + предложение подписки после 5 минут игры
  useEffect(() => {
    const iv = setInterval(() => {
      if (phaseRef.current !== 'game') return
      const w = loadWallet()
      const playSeconds = w.playSeconds + 1
      const next: Wallet = { ...w, playSeconds }
      saveWallet(next)
      setWallet(next)
      if (playSeconds >= SUB_OFFER_AFTER_S && !w.subClaimed) {
        const dayMs = 24 * 60 * 60 * 1000
        if (Date.now() - w.subLastShown > dayMs) {
          saveWallet({ ...loadWallet(), subLastShown: Date.now() })
          setSubOfferOpen(true)
        }
      }
    }, 1000)
    return () => clearInterval(iv)
  }, [])

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data)
  }, [])

  const updateWallet = useCallback((fn: (w: Wallet) => Wallet) => {
    const w = loadWallet()
    const updated = fn(w)
    saveWallet(updated)
    setWallet(updated)
    return updated
  }, [])

  const actions = {
    findGame: (name: string) => {
      saveName(name)
      emit('findGame', { name, skin: loadWallet().selectedSkin })
    },
    cancelSearch: () => emit('cancelSearch'),
    playWithBots: (name: string) => {
      saveName(name)
      emit('playWithBots', { name, skin: loadWallet().selectedSkin })
    },
    roomCreate: (name: string) => {
      saveName(name)
      emit('room:create', { name, skin: loadWallet().selectedSkin })
    },
    roomJoin: (name: string, code: string) => {
      saveName(name)
      emit('room:join', { name, code, skin: loadWallet().selectedSkin })
    },
    roomAddBot: () => emit('room:addBot'),
    roomRemoveMember: (socketId: string) => emit('room:removeMember', { socketId }),
    roomLeave: () => {
      emit('room:leave')
      setRoom(null)
      setInRoomCode(null)
    },
    roomStart: () => emit('room:start'),
    gameAction: (type: string, payload?: Record<string, unknown>) => emit('game:action', { type, payload }),
    leaveGame: () => {
      emit('game:leave')
      setPhase('menu')
      setGame(null)
      setMyId(null)
      authRef.current = null
      try {
        sessionStorage.removeItem(AUTH_KEY)
      } catch {}
    },
    clearError: () => setError(null),

    // ---- Промокоды: проверка ТОЛЬКО на сервере (коды скрыты в его коде) ----
    promoRedeem: (code: string): Promise<{ ok: boolean; message?: string; error?: string }> => {
      return new Promise((resolve) => {
        const s = socketRef.current
        if (!s) return resolve({ ok: false, error: 'Нет связи с сервером' })
        let settled = false
        const done = (r: { ok: boolean; message?: string; error?: string }) => {
          if (!settled) {
            settled = true
            resolve(r)
          }
        }
        s.timeout(8000).emit(
          'promo:redeem',
          { code },
          (err: unknown, resp: unknown) => {
            if (err) return done({ ok: false, error: 'Сервер не ответил' })
            const r = resp as { ok: boolean; error?: string; crystals?: number; label?: string; admin?: boolean; adminKey?: string }
            if (!r?.ok) return done({ ok: false, error: r?.error ?? 'Ошибка' })
            const codeUp = code.toUpperCase().trim()
            const w = loadWallet()
            const used = w.usedPromos.includes(codeUp)
            if (r.admin) {
              if (w.isAdmin) return done({ ok: true, message: 'Лисий доступ уже открыт 🦊' })
              const next = updateWallet((cur) => ({
                ...cur,
                isAdmin: true,
                adminKey: r.adminKey ?? null,
                ownedSkins: cur.ownedSkins.includes('foxbase') ? cur.ownedSkins : [...cur.ownedSkins, 'foxbase'],
                selectedSkin: 'foxbase',
                usedPromos: used ? cur.usedPromos : [...cur.usedPromos, codeUp],
              }))
              setWallet(next)
              return done({ ok: true, message: '🦊 Лисья база разблокирована! Открыт админ-доступ.' })
            }
            const crystals = r.crystals ?? 0
            const next = updateWallet((cur) => ({
              ...cur,
              crystals: used ? cur.crystals : cur.crystals + crystals,
              totalEarned: used ? cur.totalEarned : cur.totalEarned + crystals,
              usedPromos: used ? cur.usedPromos : [...cur.usedPromos, codeUp],
            }))
            setWallet(next)
            return done(
              used
                ? { ok: true, message: 'Этот код уже был активирован на устройстве — повторно кристаллы не начисляются' }
                : { ok: true, message: `Промокод «${r.label ?? ''}»: +${crystals} кристаллов!` }
            )
          }
        )
      })
    },

    /** Секретное админ-действие (только с ключом админ-промокода) */
    adminAction: (type: string): Promise<{ ok: boolean; error?: string }> => {
      return new Promise((resolve) => {
        const s = socketRef.current
        const key = loadWallet().adminKey
        if (!s || !key) return resolve({ ok: false, error: 'Нет доступа' })
        let settled = false
        const done = (r: { ok: boolean; error?: string }) => {
          if (!settled) {
            settled = true
            resolve(r)
          }
        }
        s.timeout(6000).emit('admin:action', { key, type }, (err: unknown, resp: unknown) => {
          if (err) return done({ ok: false, error: 'Сервер не ответил' })
          const r = resp as { ok: boolean; error?: string }
          done(r?.ok ? { ok: true } : { ok: false, error: r?.error ?? 'Ошибка' })
        })
      })
    },
    shopBuy: (skinId: string): { ok: boolean; message?: string; error?: string } => {
      const skin = G.skinById(skinId)
      if (skin.id === 'standard') return { ok: false, error: 'Этот скин уже доступен' }
      const w = loadWallet()
      if (w.ownedSkins.includes(skin.id)) return { ok: false, error: 'Скин уже куплен' }
      if (w.crystals < skin.price) return { ok: false, error: `Не хватает ${skin.price - w.crystals} кристаллов` }
      updateWallet((cur) => ({ ...cur, crystals: cur.crystals - skin.price, ownedSkins: [...cur.ownedSkins, skin.id], selectedSkin: skin.id }))
      return { ok: true, message: `Скин «${skin.name}» куплен и надет!` }
    },
    shopSelect: (skinId: string): { ok: boolean; error?: string } => {
      const w = loadWallet()
      if (!w.ownedSkins.includes(skinId)) return { ok: false, error: 'Скин не куплен' }
      updateWallet((cur) => ({ ...cur, selectedSkin: skinId }))
      return { ok: true }
    },
    resetProgress: () => {
      updateWallet(() => defaultWallet())
    },
  }

  /** Диалог подписки: закрыть (без награды) */
  const closeSubOffer = useCallback(() => setSubOfferOpen(false), [])
  /** Награда за подписку: +кристаллы, один раз на устройство */
  const claimSubReward = useCallback((): boolean => {
    const w = loadWallet()
    if (w.subClaimed) return false
    const next = updateWallet((cur) => ({
      ...cur,
      subClaimed: true,
      subLastShown: Date.now(),
      crystals: cur.crystals + SUB_REWARD_CRYSTALS,
      totalEarned: cur.totalEarned + SUB_REWARD_CRYSTALS,
    }))
    setWallet(next)
    setSubOfferOpen(false)
    return true
  }, [updateWallet])

  return { connected, phase, search, game, myId, selfId, room, inRoomCode, error, wallet, subOfferOpen, closeSubOffer, claimSubReward, actions }
}

export type GameActions = ReturnType<typeof useGame>['actions']

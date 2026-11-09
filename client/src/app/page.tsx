'use client'

/**
 * NEON ROYALE — точка входа.
 * Заставка студии (3 сек, тап — пропуск) → меню с вкладками / бой.
 */
import { useCallback, useMemo, useState } from 'react'
import { useNeon } from '@/hooks/use-neon'
import MainMenu from '@/components/neon/main-menu'
import BattleScreen from '@/components/neon/battle-screen'
import StudioSplash from '@/components/neon/studio-splash'

export default function Page() {
  const app = useNeon()
  const [splashGone, setSplashGone] = useState(false)
  const hideSplash = useCallback(() => setSplashGone(true), [])
  const splashSeconds = useMemo(() => {
    if (typeof window === 'undefined') return 3
    try {
      const p = Number(new URLSearchParams(window.location.search).get('splash'))
      if (Number.isFinite(p) && p > 0) return Math.min(15, p)
    } catch {}
    return 3
  }, [])

  return (
    <div className="min-h-[100dvh] overscroll-none bg-[#07090d] text-slate-100">
      {app.screen === 'battle' && app.battle ? (
        <BattleScreen battle={app.battle} deploy={app.deploy} onLeave={app.leaveBattle} />
      ) : (
        <MainMenu app={app} />
      )}

      {!splashGone && <StudioSplash seconds={splashSeconds} onDone={hideSplash} />}
    </div>
  )
}

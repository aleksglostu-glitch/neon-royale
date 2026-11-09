'use client'

/**
 * NEON ROYALE — заставка студии «Ивана Снегирёва».
 * Сначала плавное ПРОЯВЛЕНИЕ из темноты, логотип держится ярким,
 * затемнение — только в самом конце. ~3 сек. Тап — пропустить.
 */
import { useEffect, useRef, useState } from 'react'

export default function StudioSplash({ seconds = 3, onDone }: { seconds?: number; onDone?: () => void }) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out' | 'gone'>('in')
  const doneRef = useRef(false)

  useEffect(() => {
    const inMs = Math.round(seconds * 1000 * 0.45)
    const outMs = Math.round(seconds * 1000 * 0.55)
    const t1 = setTimeout(() => setPhase('hold'), inMs)
    const t2 = setTimeout(() => setPhase('out'), inMs + Math.max(0, seconds * 1000 - inMs - outMs))
    const t3 = setTimeout(() => {
      setPhase('gone')
      doneRef.current = true
      onDone?.()
    }, seconds * 1000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'gone') return null

  const finish = () => {
    if (doneRef.current) return
    doneRef.current = true
    setPhase('gone')
    onDone?.()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black select-none"
      style={{
        // Проявление: чёрный уходит; затемнение в конце: чёрный возвращается
        opacity: phase === 'in' ? undefined : 1,
        animation:
          phase === 'in'
            ? 'nrSplashIn 1.2s ease-out both'
            : phase === 'out'
              ? 'nrSplashOut 1.5s ease-in both'
              : undefined,
        cursor: 'pointer',
      }}
      onClick={finish}
      role="button"
      aria-label="Пропустить заставку"
    >
      <div
        className="nr-splash-inner flex flex-col items-center gap-5"
        style={{
          animation:
            phase === 'in'
              ? 'nrLogoIn 1.4s cubic-bezier(0.22,1,0.36,1) both'
              : phase === 'out'
                ? 'nrLogoOut 1.5s ease-in both'
                : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/art/studio-logo.jpg"
          alt="Студия разработки Ивана Снегирёва"
          className="w-[54vmin] max-w-[310px] rounded-3xl"
          style={{ boxShadow: '0 0 60px rgba(226,60,60,0.35), 0 0 120px rgba(226,60,60,0.18)' }}
          draggable={false}
        />
        <div className="text-center">
          <div className="text-[15px] font-extrabold tracking-[0.22em] text-rose-200">СТУДИЯ РАЗРАБОТКИ</div>
          <div
            className="mt-1 text-2xl font-black tracking-wide text-white"
            style={{ textShadow: '0 0 22px rgba(244,63,94,0.75), 0 2px 10px rgba(0,0,0,0.8)' }}
          >
            ИВАНА СНЕГИРЁВА
          </div>
          <div className="mt-2 text-[11px] font-semibold tracking-wider text-slate-400">представляет</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/art/logo-royale.png"
          alt="Neon Royale"
          className="w-[26vmin] max-w-[150px] rounded-2xl"
          style={{ boxShadow: '0 0 44px rgba(34,211,238,0.4)' }}
          draggable={false}
        />
      </div>
      <div className="absolute bottom-6 text-[11px] font-medium tracking-widest text-slate-500">коснитесь, чтобы продолжить</div>
    </div>
  )
}

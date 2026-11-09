'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

/**
 * Заставка студии разработки Ивана Снегирёва.
 * Показывается при входе в приложение: 3 секунды с плавным затемнением.
 * Сама управляет своей временной шкалой и вызывает onDone в конце.
 */
export default function StudioSplash({ seconds = 3, onDone }: { seconds?: number; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const hold = Math.max(0.5, seconds - 0.7) // 0.7 c — время затемнения
    const t1 = setTimeout(() => setLeaving(true), hold * 1000) // начинаем затемнение
    const t2 = setTimeout(() => onDone(), seconds * 1000) // полностью уходит
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [seconds, onDone])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.7, ease: 'easeInOut' }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#070a10]"
      aria-label="Заставка студии разработки"
    >
      {/* Мягкое свечение фона */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500/10 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-0 left-0 h-72 w-72 rounded-full bg-sky-500/10 blur-[110px]" />

      <motion.div
        initial={{ scale: 0.94, y: 14 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="relative flex flex-col items-center px-6 text-center"
      >
        {/* Эмблема: снегирь (птица студии) */}
        <motion.svg
          width="120"
          height="120"
          viewBox="0 0 120 120"
          initial={{ opacity: 0, scale: 0.7, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1, delay: 0.25, ease: 'easeOut' }}
          role="img"
          aria-label="Снегирь — эмблема студии"
        >
          <defs>
            <linearGradient id="breast" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
            <linearGradient id="back" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#64748b" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>
          </defs>
          {/* Свечение-круг */}
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e11d48" strokeOpacity="0.35" strokeWidth="1.5" />
          <circle cx="60" cy="60" r="47" fill="#0d1420" stroke="#334155" strokeWidth="1.5" />
          {/* Хвост */}
          <path d="M78 62 L100 52 L96 68 Z" fill="#1e293b" stroke="#475569" strokeWidth="1" />
          {/* Тело: спинка */}
          <path d="M34 58 C36 46 50 38 62 40 C74 42 82 52 80 62 C78 72 66 78 54 76 C42 74 32 68 34 58 Z" fill="url(#back)" />
          {/* Красная грудка */}
          <path d="M40 58 C42 68 52 74 60 74 C68 74 76 68 78 60 C72 70 50 72 40 58 Z" fill="url(#breast)" />
          <path d="M38 56 C40 66 50 72 58 73 C50 74 40 68 36 58 Z" fill="#be123c" opacity="0.7" />
          {/* Голова */}
          <circle cx="42" cy="46" r="12" fill="#111827" />
          {/* Клюв */}
          <path d="M30 46 L20 49 L30 52 Z" fill="#f59e0b" />
          {/* Глаз */}
          <circle cx="38" cy="44" r="2.2" fill="#f8fafc" />
          <circle cx="38.6" cy="44.4" r="1.1" fill="#0f172a" />
          {/* Ветка под лапами */}
          <path d="M24 82 C42 78 66 78 88 84" stroke="#7c4a21" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Снежинки */}
          <circle cx="86" cy="34" r="1.6" fill="#e2e8f0" opacity="0.9" />
          <circle cx="94" cy="42" r="1.1" fill="#e2e8f0" opacity="0.7" />
          <circle cx="26" cy="30" r="1.3" fill="#e2e8f0" opacity="0.8" />
        </motion.svg>

        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.55 }}
          className="mt-5 text-[11px] font-bold uppercase tracking-[0.42em] text-slate-400"
        >
          Студия разработки
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.75 }}
          className="mt-2 text-3xl font-black tracking-wide text-white [text-shadow:0_0_40px_rgba(225,29,72,0.35)] sm:text-4xl"
        >
          Ивана <span className="text-rose-400">Снегирёва</span>
        </motion.h1>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, delay: 1.0, ease: 'easeOut' }}
          className="mt-5 h-px w-40 bg-gradient-to-r from-transparent via-rose-500/70 to-transparent"
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.25 }}
          className="mt-4 text-xs font-medium tracking-[0.3em] text-slate-500"
        >
          ПРЕДСТАВЛЯЕТ
        </motion.p>
      </motion.div>
    </motion.div>
  )
}

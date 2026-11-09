'use client'

import { motion } from 'framer-motion'
import { BellRing, Gem, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { openVk, SUB_REWARD_CRYSTALS } from '@/hooks/use-game'

interface SubDialogProps {
  open: boolean
  onClose: () => void
  onClaim: () => boolean
}

/**
 * Предложение подписки: показывается после 5 минут игры (раз в сутки, пока не получена награда).
 * Подписка бесплатная: кнопка открывает группу ВКонтакте и начисляет награду (один раз на устройство).
 */
export default function SubDialog({ open, onClose, onClaim }: SubDialogProps) {
  const subscribe = () => {
    openVk()
    onClaim()
  }
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent aria-describedby={undefined} className="border-rose-500/40 bg-[#0b1117] text-slate-200 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-extrabold text-rose-300">
            <BellRing className="h-5 w-5" /> Подпишись на нашу группу!
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm leading-relaxed text-slate-300">
            Подпишись на нашу группу <b className="text-sky-300">ВКонтакте</b> — там мы публикуем новости, обновления и
            раздаём <b className="text-cyan-200">промокоды</b>.
          </p>
          <div className="flex items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3">
            <Gem className="h-6 w-6 text-cyan-300 [filter:drop-shadow(0_0_8px_rgba(34,211,238,0.8))]" />
            <span className="text-2xl font-black text-cyan-200">+{SUB_REWARD_CRYSTALS}</span>
            <span className="text-sm font-semibold text-cyan-100/80">кристаллов в подарок</span>
          </div>
          <Button onClick={subscribe} className="h-12 w-full bg-rose-500 text-base font-black text-white hover:bg-rose-400">
            Подписаться и получить
          </Button>
          <Button onClick={onClose} variant="ghost" className="h-9 w-full text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="mr-1 h-3.5 w-3.5" /> Позже
          </Button>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-[10px] text-slate-500">
            Награда начисляется один раз на устройстве сразу после нажатия кнопки.
          </motion.p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

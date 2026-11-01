'use client'

import { useEffect, useRef, useState } from 'react'
import { Undo2 } from 'lucide-react'
import GlassButton from './GlassButton'

/** Recolhe a alteração antes de aplicar o desfazer ao formulário. */
export default function UndoChangeButton({ label, onUndo }: { label: string; onUndo: () => void }) {
  const animation = useRef<Animation | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => () => animation.current?.cancel(), [])
  return <GlassButton variant="custom" disabled={busy} aria-busy={busy} aria-label={`Desfazer ${label}`}
    className="changes-undo-button history-action-motion inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
    onClick={event => {
      if (busy) return
      const card = event.currentTarget.closest<HTMLElement>('[data-testid="alteracao"]')
      if (!card || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onUndo(); return }
      setBusy(true)
      const height = card.getBoundingClientRect().height
      card.style.overflow = 'hidden'
      const motion = card.animate([
        { opacity: 1, transform: 'translateX(0)', height: `${height}px`, paddingTop: '12px', paddingBottom: '12px', borderWidth: '1px', offset: 0 },
        { opacity: .3, transform: 'translateX(-8px)', height: `${height}px`, paddingTop: '12px', paddingBottom: '12px', borderWidth: '1px', offset: .45 },
        { opacity: 0, transform: 'translateX(-8px)', height: '0px', paddingTop: '0px', paddingBottom: '0px', borderWidth: '0px', offset: 1 },
      ], { duration: 360, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'forwards' })
      animation.current = motion
      motion.onfinish = () => {
        onUndo()
        motion.cancel()
        card.style.overflow = ''
        setBusy(false)
      }
      motion.oncancel = () => { card.style.overflow = '' }
    }}><Undo2 className="h-3.5 w-3.5" />Desfazer</GlassButton>
}

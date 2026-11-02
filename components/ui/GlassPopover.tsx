'use client'

import { useLayoutEffect, useRef, useState, type RefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Caixa ancorada com o mesmo material dos selects, sem backdrop modal. */
export default function GlassPopover({ open, onClose, anchor, label, children, id }: {
  open: boolean; onClose: () => void; anchor: RefObject<HTMLElement | null>; label: string; children: ReactNode; id?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useLayoutEffect(() => { close.current = onClose }, [onClose])
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number }>()
  useLayoutEffect(() => {
    if (!open) return
    const trigger = anchor.current
    const place = () => {
      if (!trigger) return
      const rect = trigger.getBoundingClientRect(), width = Math.min(360, window.innerWidth - 24)
      const height = panel.current?.scrollHeight ?? 280
      const below = window.innerHeight - rect.bottom - 20, above = rect.top - 20
      const up = below < Math.min(height, 280) && above > below
      setPosition({ left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)), top: up ? Math.max(12, rect.top - Math.min(height, above) - 8) : rect.bottom + 8, width, maxHeight: Math.max(100, up ? above : below) })
    }
    place()
    panel.current?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      const target = event.target as Element
      if (!panel.current?.contains(target) && !trigger?.contains(target) && !target.closest('[data-glass-select-panel]')) close.current()
    }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); close.current(); trigger?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open, anchor])
  if (!open || typeof document === 'undefined') return null
  return createPortal(<div id={id} ref={panel} data-glass-select-panel role="dialog" aria-label={label} tabIndex={-1} style={{ position: 'fixed', ...position, zIndex: 9000, visibility: position ? 'visible' : 'hidden' }} className="overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-xl outline-none">{children}</div>, document.body)
}

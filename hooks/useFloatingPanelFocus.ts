'use client'

import { useEffect, useRef, type RefObject } from 'react'

/** Teclado dos painéis do editor, sem interferir nos modais abertos acima deles. */
export function useFloatingPanelFocus(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const panel = ref.current
    if (!open || !panel) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const controls = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
      .filter(el => !el.closest('[inert], [hidden], [aria-hidden="true"]'))
    ;(controls()[0] ?? panel).focus({ preventScroll: true })
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !panel.contains(document.activeElement)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        close.current()
      } else if (event.key === 'Tab') {
        const items = controls(), first = items[0], last = items.at(-1)
        if (!first || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last ?? panel : first ?? panel).focus()
        }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      if ((panel.contains(document.activeElement) || document.activeElement === document.body) && trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus({ preventScroll: true })
    }
  }, [open, ref])
}

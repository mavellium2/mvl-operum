'use client'

import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** Mantém a ordem dos cards e suaviza deslocamentos após alterações de conteúdo. */
export default function AnimatedCardStack({ children, className }: { children: ReactNode; className?: string }) {
  const root = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const node = root.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const cards = Array.from(node.children) as HTMLElement[]
    const positions = new Map(cards.map(card => [card, card.offsetTop]))
    const animations = new Map<HTMLElement, Animation>()
    const observer = new ResizeObserver(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      for (const card of cards) {
        const previous = positions.get(card) ?? card.offsetTop
        const next = card.offsetTop
        positions.set(card, next)
        if (Math.abs(previous - next) < 1) continue
        // Inclui a posição visual atual se outra mudança acontecer no meio do movimento.
        const current = animations.get(card)
        const visualOffset = current ? new DOMMatrixReadOnly(getComputedStyle(card).transform).m42 : 0
        current?.cancel()
        if (!reduced) animations.set(card, card.animate([
          { transform: `translateY(${previous - next + visualOffset}px)` },
          { transform: 'translateY(0)' },
        ], { duration: 420, easing: 'cubic-bezier(.22, 1, .36, 1)' }))
      }
    })
    cards.forEach(card => observer.observe(card))
    observer.observe(node)
    return () => { observer.disconnect(); animations.forEach(animation => animation.cancel()) }
  }, [])
  return <aside ref={root} className={className}>{children}</aside>
}

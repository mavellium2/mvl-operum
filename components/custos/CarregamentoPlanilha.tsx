'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import GlassButton from '@/components/ui/GlassButton'

/** Mount once near the viewport; keep edits and chart interaction state afterward. */
export function SobDemandaPlanilha({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!ref.current || ready || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setReady(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ready])
  return <div ref={ref} className="planilha-demand-section" style={!ready && label.startsWith('gráfico') ? { minHeight: 380 } : undefined}>{ready ? children : <GlassButton variant="ghost" onClick={() => setReady(true)}>Carregar {label}</GlassButton>}</div>
}

/** A table sentinel also provides an explicit keyboard path to the next batch. */
export function MaisAtividadesPlanilha({ remaining, onLoad }: { remaining: number; onLoad: () => void }) {
  const ref = useRef<HTMLTableRowElement>(null)
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); onLoad() }
    }, { rootMargin: '200px' })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [remaining, onLoad])
  return <tr ref={ref}><td colSpan={18} className="px-3 py-2"><GlassButton variant="ghost" onClick={onLoad}>Carregar mais atividades ({remaining} restantes)</GlassButton></td></tr>
}

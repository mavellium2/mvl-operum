'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import Skeleton from '@/components/ui/Skeleton'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'

export function SkeletonGraficoPlanilha({ label = 'gráfico' }: { label?: string }) {
  return <GlassCard className="planilha-chart-skeleton" role="status" aria-label={`Carregando ${label}`}>
    <Skeleton className="h-4 w-52 max-w-full" />
    <Skeleton className="mt-3 h-3 w-36" />
    <div className="planilha-chart-skeleton-bars" aria-hidden="true">{[55, 80, 35, 100, 65, 45].map((height, index) => <div key={index}><Skeleton style={{ height: `${height}%` }} /><Skeleton style={{ height: `${height * .7}%` }} /></div>)}</div>
    <Skeleton className="mt-4 h-3 w-2/3" />
  </GlassCard>
}

/** Mount once near the viewport; keep edits and chart interaction state afterward. */
export function SobDemandaPlanilha({ children, label, whenVisible = false }: { children: ReactNode; label: string; whenVisible?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!ref.current || ready || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && (!whenVisible || entry.intersectionRatio >= 0.5))) { setReady(true); observer.disconnect() }
    }, { rootMargin: whenVisible ? '0px' : '200px', threshold: whenVisible ? 0.5 : 0 })
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [ready, whenVisible])
  return <div ref={ref} className="planilha-demand-section" style={!ready && label.startsWith('gráfico') ? { minHeight: 380 } : undefined}>{ready ? children : label.startsWith('gráfico') ? <div className="planilha-chart-placeholder"><SkeletonGraficoPlanilha label={label} /><GlassButton className="planilha-chart-load" variant="ghost" onClick={() => setReady(true)}>Carregar {label}</GlassButton></div> : <GlassButton variant="ghost" onClick={() => setReady(true)}>Carregar {label}</GlassButton>}</div>
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

'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Um controlador de altura e rolagem para um campo ou uma linha de campos. */
export default function ExpandableFieldGroup({ children }: {
  children: (controls: { recolhido: boolean; onRecolhidoChange: (value: boolean) => void; gerenciarRolagem: false }) => ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current) }, [])

  function change(next: boolean) {
    if (pending.current) clearTimeout(pending.current)
    const group = root.current
    if (!group) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let scroller = group.parentElement
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement
    const viewport = scroller
    function reveal() {
      if (!group?.isConnected) return
      const top = viewport?.getBoundingClientRect().top ?? 0
      const delta = group.getBoundingClientRect().top - top - 16
      if (Math.abs(delta) > 1) {
        if (viewport) viewport.scrollTo({ top: viewport.scrollTop + delta, behavior: reduced ? 'instant' : 'smooth' })
        else window.scrollTo({ top: window.scrollY + delta, behavior: reduced ? 'instant' : 'smooth' })
      }
    }
    // Expandir ancora o título no topo. Recolher libera espaço abaixo sem
    // reposicionar a rolagem: os próximos campos sobem naturalmente.
    setCollapsed(next)
    if (!next) {
      pending.current = setTimeout(() => { reveal(); pending.current = null }, reduced ? 0 : 100)
    } else pending.current = null
  }
  return <div ref={root} className="col-span-full grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2" style={{ overflowAnchor: 'none', scrollMarginBlock: 16 }}>
    {/* O callback é entregue aos eventos dos campos; não lê refs durante a renderização. */}
    {/* eslint-disable-next-line react-hooks/refs */}
    {children({ recolhido: collapsed, onRecolhidoChange: change, gerenciarRolagem: false })}
  </div>
}

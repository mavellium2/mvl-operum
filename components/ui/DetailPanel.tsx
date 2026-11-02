'use client'
import type { ReactNode } from 'react'
import GlassCard from './GlassCard'
import GlassCloseButton from './GlassCloseButton'
import './DetailPanel.css'

/** Painel de detalhes compartilhado por cadastros, sem bloquear a lista ao lado. */
export default function DetailPanel({ title, label, onClose, children, floating = false, className = '' }: { title?: string; label?: string; onClose?: () => void; children: ReactNode; floating?: boolean; className?: string }) {
  return <GlassCard as="section" role={floating ? 'dialog' : undefined} aria-label={label ?? title} className={`detail-panel ${floating ? 'detail-panel--floating' : ''} ${className}`}>
    {title && <div className="detail-panel-heading"><h2>{title}</h2>{onClose && <GlassCloseButton label="Fechar painel" onClick={onClose} />}</div>}
    <div className="detail-panel-content">{children}</div>
  </GlassCard>
}

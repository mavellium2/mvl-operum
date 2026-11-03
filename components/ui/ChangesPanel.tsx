'use client'

import { forwardRef, useRef, useId, useSyncExternalStore, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import GlassCloseButton from './GlassCloseButton'
import UndoChangeButton from './UndoChangeButton'
import { diffTexto } from '@/lib/diffTexto'
import { useFloatingPanelFocus } from '@/hooks/useFloatingPanelFocus'
import { useAppearance } from '@/hooks/useAppearance'
import { appearanceBlendStyle } from '@/lib/appearancePalette'
import './ChangesPanel.css'

export interface ReviewChange { chave: string; rotulo: string; antes: string; depois: string; texto?: boolean }
interface Props { context: { type: 'project' | 'permissions' | 'spreadsheet'; id: string; label?: string }; open: boolean; visited?: boolean; originX?: number; changes: ReviewChange[]; onClose: () => void; onUndo: (key: string) => void; floating?: boolean; anchor?: { left: number; bottom?: number; top?: number; width: number } }

const ChangesPanel = forwardRef<HTMLDivElement, Props>(function ChangesPanel({ context, open, visited = false, originX, changes, onClose, onUndo, floating = false, anchor }, ref) {
  const instanceId = useId()
  const title = context.type === 'permissions' ? `Alterações nos acessos${context.label ? ` de ${context.label}` : ''}` : context.type === 'spreadsheet' ? 'Alterações na planilha' : 'O que mudou desde o último salvamento'
  const local = useRef<HTMLDivElement>(null)
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false)
  const { period, blend } = useAppearance()
  useFloatingPanelFocus(local, floating && open, onClose)
  const panel = <div id={instanceId} data-context={context.type} data-context-id={context.id} role="dialog" aria-label="Alterações não salvas" aria-hidden={!open} inert={!open} data-open={open} data-visited={visited}
    style={{ '--history-drop-x': originX !== undefined ? `${originX}px` : '50%', ...(floating ? { translate: 'none' } : {}), ...(floating && anchor ? { left: anchor.left, bottom: anchor.bottom ?? 'auto', top: anchor.top ?? 'auto', width: anchor.width, marginLeft: 0 } : {}) } as CSSProperties}
    ref={node => { local.current = node; if (typeof ref === 'function') ref(node); else if (ref) ref.current = node }} tabIndex={-1}
    className={`project-changes-panel project-history-panel ${floating ? 'shared-changes-floating' : 'absolute bottom-full mb-3'} vidro-flutuante rounded-[22px] p-3`}>
    <div className="flex items-center justify-between px-3 py-2"><h3 className="text-sm font-bold text-slate-900">{title}</h3><GlassCloseButton label="Fechar" onClick={onClose} className="project-history-close" /></div>
    <ul className="space-y-3 px-1 pb-1 pt-2">{changes.map(change => <li key={`${context.type}:${context.id}:${change.chave}`} className="history-version-card rounded-2xl px-4 py-3" data-testid="alteracao">
      <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{change.rotulo}</span><UndoChangeButton label={change.rotulo} onUndo={() => onUndo(change.chave)} /></div>
      {change.texto ? <DiffTexto antes={change.antes} depois={change.depois} /> : <div className="flex flex-wrap items-center gap-2 text-sm">{change.antes ? <del className="rounded-lg bg-rose-50 px-2 py-0.5 text-rose-700">{change.antes}</del> : <span className="text-slate-400">vazio</span>}<span className="text-slate-400" aria-hidden="true">→</span>{change.depois ? <ins className="rounded-lg bg-emerald-50 px-2 py-0.5 text-emerald-800 no-underline">{change.depois}</ins> : <span className="text-slate-400">vazio</span>}</div>}
    </li>)}</ul>
  </div>
  if (!floating) return panel
  if (!mounted) return null
  return createPortal(<div className="project-appearance shared-changes-portal" data-period={period ?? undefined} style={appearanceBlendStyle(blend)}>
    <div aria-hidden="true" className="project-history-backdrop fixed inset-0" data-open={open} onClick={onClose} />{panel}
  </div>, document.body)
})
export default ChangesPanel
function DiffTexto({ antes, depois }: { antes: string; depois: string }) {
  if (!antes && !depois) return <span className="text-sm text-slate-400">vazio</span>
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
      {diffTexto(antes, depois).map((p, i) => p.tipo === 'igual' ? <span key={i}>{p.texto}</span>
        : p.tipo === 'removido' ? <del key={i} className="rounded bg-rose-100 px-0.5 text-rose-700 decoration-rose-400">{p.texto}</del>
        : <ins key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-800 no-underline">{p.texto}</ins>)}
    </p>
  )
}

'use client'

import { OPCOES_FASE, OPCOES_ORGANIZAR } from './OrganizarIcons'
import { formatoDaEap, formatoDaFase } from '@/lib/wbsLayout'

import { useRef, useState, type Dispatch } from 'react'
import { X } from 'lucide-react'
import type { WbsNodeClient, WbsNodeStyle, WbsLayoutOrientation } from '@/types/wbs'
import type { WbsAction } from '@/lib/wbsReducer'

interface Props {
  selectedNodeIds: string[]
  nodes: Record<string, WbsNodeClient>
  canEdit: boolean
  dispatch: Dispatch<WbsAction>
  onClose: () => void
}

// ── Layout helpers ─────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase tracking-widest py-1.5 hover:text-gray-700 transition-colors cursor-pointer"
      >
        <span className="text-gray-400">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-1 mb-2">
      <span className="text-[11px] text-gray-600 shrink-0 leading-tight">{label}</span>
      {children}
    </div>
  )
}

// ── Paleta básica padrão Office (Tema + Padrão) — §E.2 ────────────────────────

const OFFICE_PALETTE = [
  '#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47',
  '#C00000', '#FF0000', '#FFC000', '#FFFF00', '#92D050', '#00B050', '#00B0F0', '#0070C0', '#002060', '#7030A0',
]

// ── Color picker + hex text (sincronizados) ────────────────────────────────────

function ColorField({
  label, value, mixed, disabled, onChange,
}: { label: string; value: string; mixed: boolean; disabled?: boolean; onChange: (v: string) => void }) {
  const [localHex, setLocalHex] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  const [prevMixed, setPrevMixed] = useState(mixed)

  if (!mixed && (prevValue !== value || prevMixed !== mixed)) {
    setPrevValue(value)
    setPrevMixed(mixed)
    setLocalHex(value)
  }

  const handleHex = (v: string) => {
    setLocalHex(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
  }

  return (
    <FieldRow label={label}>
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={value}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            className="w-7 h-7 rounded border border-gray-200 p-0.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <input
            type="text"
            value={mixed ? '' : localHex}
            maxLength={7}
            placeholder={mixed ? '—' : '#000000'}
            disabled={disabled}
            onChange={e => handleHex(e.target.value)}
            onBlur={() => { if (!/^#[0-9a-fA-F]{6}$/.test(localHex)) setLocalHex(value) }}
            className="w-16 text-[11px] font-mono border border-gray-200 rounded px-1.5 py-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
        </div>
        <div className="flex flex-wrap max-w-[168px] gap-[3px]">
          {OFFICE_PALETTE.map(c => {
            const active = !mixed && value.toLowerCase() === c.toLowerCase()
            return (
              <button
                key={c}
                type="button"
                title={c}
                disabled={disabled}
                onClick={() => onChange(c)}
                className={`w-4 h-4 rounded-sm border shrink-0 cursor-pointer disabled:cursor-not-allowed transition-transform hover:scale-125 ${
                  active ? 'border-blue-500 ring-1 ring-blue-300' : 'border-gray-200'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Paleta ${c}`}
              />
            )
          })}
        </div>
      </div>
    </FieldRow>
  )
}

// ── Número + sufixo ────────────────────────────────────────────────────────────

function NumField({
  label, value, min, max, step, suffix, disabled, placeholder, title: tooltip, onChange,
}: {
  label: string; value: number | undefined; min: number; max?: number; step?: number;
  suffix?: string; disabled?: boolean; placeholder?: string; title?: string;
  onChange: (v: number) => void
}) {
  return (
    <FieldRow label={label}>
      <div className="flex items-center gap-1" title={tooltip}>
        <input
          type="number"
          min={min}
          max={max}
          step={step ?? 1}
          value={value ?? ''}
          disabled={disabled}
          placeholder={placeholder ?? String(min)}
          onChange={e => { if (e.target.value !== '') onChange(Number(e.target.value)) }}
          className="w-14 text-[11px] text-right border border-gray-200 rounded px-1.5 py-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
        />
        {suffix && <span className="text-[11px] text-gray-400 shrink-0">{suffix}</span>}
      </div>
    </FieldRow>
  )
}

// ── Helpers de valor comum ─────────────────────────────────────────────────────

function commonStr(nodes: WbsNodeClient[], selector: (n: WbsNodeClient) => string): { same: true; value: string } | { same: false; value: string } {
  const vals = nodes.map(selector)
  const first = vals[0] ?? ''
  return vals.every(v => v === first) ? { same: true, value: first } : { same: false, value: first }
}

function commonNum(nodes: WbsNodeClient[], selector: (n: WbsNodeClient) => number): { same: true; value: number } | { same: false; value: number } {
  const vals = nodes.map(selector)
  const first = vals[0] ?? 0
  return vals.every(v => v === first) ? { same: true, value: first } : { same: false, value: first }
}

// ── Painel principal ───────────────────────────────────────────────────────────

export default function WbsPropertiesPanel({ selectedNodeIds, nodes, canEdit, dispatch, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  const selectedNodes = selectedNodeIds.map(id => nodes[id]).filter((n): n is WbsNodeClient => Boolean(n))
  const count = selectedNodes.length
  if (count === 0) return (
    <aside className="absolute right-4 top-4 z-30 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-label="Estilo">
      <div className="flex items-center justify-between"><strong>Estilo</strong><button type="button" aria-label="Fechar estilo" onClick={onClose}><X size={18} /></button></div>
      <p className="mt-4 text-sm text-gray-600">Selecione um ou mais elementos para ajustar o estilo.</p>
    </aside>
  )

  // ── Valores comuns de estilo ──
  const bgC = commonStr(selectedNodes, n => n.style.backgroundColor)
  const bcC = commonStr(selectedNodes, n => n.style.borderColor)
  const tcC = commonStr(selectedNodes, n => n.style.textColor)
  const bwC = commonNum(selectedNodes, n => n.style.borderWidth)
  const fsC = commonNum(selectedNodes, n => n.style.fontSize)
  const brC = commonNum(selectedNodes, n => n.style.borderRadius)
  // Formato (ADR-047): da EAP inteira quando a raiz está selecionada; da fase quando só há fases.
  const raiz = Object.values(nodes).find(n => n.parentId === null)
  const formatoEap = formatoDaEap(raiz?.layout)
  const ehRaiz = count === 1 && selectedNodes[0].parentId === null
  const soFases = !!raiz && selectedNodes.every(n => n.parentId === raiz.id)
  const formatoC = commonStr(selectedNodes, n => ehRaiz ? formatoEap : formatoDaFase(n.layout, formatoEap) ?? 'LADO_A_LADO')

  const updateStyle = (patch: Partial<WbsNodeStyle>) => {
    dispatch({ type: 'UPDATE_STYLE', payload: { style: patch } })
  }

  const updateLayout = (layout: WbsLayoutOrientation) => {
    // Na raiz é o formato da EAP inteira: as fases voltam a seguir a EAP, como no Organizar.
    if (ehRaiz) { dispatch({ type: 'SET_EAP_FORMAT', payload: { layout } }); return }
    for (const id of selectedNodeIds) {
      dispatch({ type: 'SET_LAYOUT', payload: { nodeId: id, layout } })
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-4 top-4 z-30 w-64 max-h-[calc(100%-2rem)] rounded-xl border border-gray-200 bg-white shadow-xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-gray-100 bg-gray-50 shrink-0">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-800">
            {count === 1 ? (
              <span title={selectedNodes[0].title} className="truncate block">{selectedNodes[0].title}</span>
            ) : (
              `${count} elementos selecionados`
            )}
          </p>
          {count === 1 && (
            <p className="text-[10px] text-gray-400 mt-0.5">{selectedNodes[0].code}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-1 transition-colors cursor-pointer"
          aria-label="Fechar painel de estilo"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 pt-2 pb-4 flex-1 overflow-y-auto">

        {/* ─── ESTILO ─── */}
        <Section title="Estilo">
          <ColorField
            label="Cor de fundo"
            value={bgC.value}
            mixed={!bgC.same}
            disabled={!canEdit}
            onChange={v => updateStyle({ backgroundColor: v })}
          />
          <ColorField
            label="Cor da borda"
            value={bcC.value}
            mixed={!bcC.same}
            disabled={!canEdit}
            onChange={v => updateStyle({ borderColor: v })}
          />
          <ColorField
            label="Cor do texto"
            value={tcC.value}
            mixed={!tcC.same}
            disabled={!canEdit}
            onChange={v => updateStyle({ textColor: v })}
          />
          <NumField
            label="Espessura da borda"
            value={bwC.same ? bwC.value : undefined}
            min={0} max={8} step={1} suffix="px"
            placeholder={!bwC.same ? '—' : undefined}
            disabled={!canEdit}
            onChange={v => updateStyle({ borderWidth: v })}
          />
          <NumField
            label="Tamanho da fonte"
            value={fsC.same ? fsC.value : undefined}
            min={8} max={24} step={1} suffix="px"
            placeholder={!fsC.same ? '—' : undefined}
            disabled={!canEdit}
            onChange={v => updateStyle({ fontSize: v })}
          />
          <NumField
            label="Raio da borda"
            value={brC.same ? brC.value : undefined}
            min={0} max={24} step={1} suffix="px"
            placeholder={!brC.same ? '—' : undefined}
            disabled={!canEdit}
            onChange={v => updateStyle({ borderRadius: v })}
          />

          {(ehRaiz || soFases) && (
            <FieldRow label={ehRaiz ? 'Formato da EAP' : 'Formato da fase'}>
              <select
                value={formatoC.same ? formatoC.value : ''}
                disabled={!canEdit || (!ehRaiz && formatoEap === 'HORIZONTAL')}
                title={!ehRaiz && formatoEap === 'HORIZONTAL' ? 'No Horizontal, todas as fases seguem a EAP' : undefined}
                onChange={e => updateLayout(e.target.value as WbsLayoutOrientation)}
                className="text-[11px] border border-gray-200 rounded px-1.5 py-1 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-400 cursor-pointer"
              >
                {!formatoC.same && <option value="">—</option>}
                {(ehRaiz ? OPCOES_ORGANIZAR : OPCOES_FASE).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </FieldRow>
          )}

          {canEdit && (
            <div className="flex gap-1 mt-2">
              <button
                onClick={() => dispatch({ type: 'COPY_STYLE', payload: { nodeId: selectedNodeIds[0] } })}
                className="flex-1 text-[11px] border border-gray-200 rounded py-1 hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
              >
                Copiar estilo
              </button>
              <button
                onClick={() => dispatch({ type: 'PASTE_STYLE_TO_SELECTED' })}
                className="flex-1 text-[11px] border border-gray-200 rounded py-1 hover:bg-gray-50 text-gray-700 transition-colors cursor-pointer"
              >
                Colar estilo
              </button>
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}

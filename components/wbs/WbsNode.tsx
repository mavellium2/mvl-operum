'use client'

import { fmtDataBR } from '@/lib/planilhaCustos'

import React, { type Dispatch, useEffect, useRef } from 'react'
import type { WbsNodeClient, WbsNodeGeometry, WbsViewMode } from '@/types/wbs'
import type { WbsFinancialSummary } from '@/lib/wbsRollup'
import type { WbsAction } from '@/lib/wbsReducer'

interface WbsNodeCardProps {
  viewMode?: WbsViewMode
  canEdit?: boolean
  canViewCosts?: boolean
  owner?: string
  duration?: number
  financial?: WbsFinancialSummary
  node: WbsNodeClient
  geom: WbsNodeGeometry
  isSelected: boolean
  isEditing: boolean
  isDragTarget: boolean
  editingInitialText?: string
  onSelect: (nodeId: string, multi: boolean) => void
  dispatch: Dispatch<WbsAction>
}

const WbsNodeCard = React.memo(function WbsNodeCard({
  viewMode = 'chart', canEdit = true, canViewCosts = false, owner, financial,
  node, geom, isSelected, isEditing, isDragTarget, editingInitialText, onSelect, dispatch,
}: WbsNodeCardProps) {
  const isParent = node.childrenIds.length > 0

  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!isEditing) return
    if (editingInitialText != null) {
      // Digitação substituindo o título: cursor no fim do texto inicial.
      const el = inputRef.current
      if (el) { const len = el.value.length; el.setSelectionRange(len, len) }
    } else {
      inputRef.current?.select()
    }
  }, [isEditing, editingInitialText])

  const ring = isSelected
    ? '0 0 0 2px #3b82f6, 0 0 0 4px rgba(59,130,246,0.2)'
    : isDragTarget
      ? '0 0 0 2px #10b981'
      : 'none'

  return (
    <div
      data-node-id={node.id}
      style={{
        position: 'absolute',
        left: geom.x,
        top: geom.y,
        width: geom.width,
        height: geom.height,
        boxSizing: 'border-box',
        backgroundColor: node.style.backgroundColor,
        border: `${node.style.borderWidth}px solid ${node.style.borderColor}`,
        borderRadius: node.style.borderRadius,
        color: node.style.textColor,
        fontSize: node.style.fontSize,
        boxShadow: ring,
        cursor: 'pointer',
        userSelect: 'none',
        overflow: 'visible',
      }}
      onClick={e => {
        e.stopPropagation()
        if (e.ctrlKey || e.metaKey || e.shiftKey) { onSelect(node.id, true); return }
        // Card recolhido: clique expande em vez de abrir a edição de texto.
        if (node.collapsed) {
          onSelect(node.id, false)
          dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: node.id, collapsed: false } })
          return
        }
        // Clique num nó já selecionado entra direto em edição; senão, apenas seleciona.
        if (canEdit && isSelected && !isEditing) {
          dispatch({ type: 'SET_EDITING', payload: { nodeId: node.id } })
        } else {
          onSelect(node.id, false)
        }
      }}
      onDoubleClick={e => {
        e.stopPropagation()
        if (node.collapsed) {
          dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: node.id, collapsed: false } })
          return
        }
        if (canEdit) dispatch({ type: 'SET_EDITING', payload: { nodeId: node.id } })
      }}
    >
      {/* Collapse toggle — pílula na borda inferior, meio para fora; − expandido / + recolhido */}
      {isParent && (
        <button
          type="button"
          aria-expanded={!node.collapsed}
          onPointerDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', bottom: -10, left: '50%', transform: 'translate(-50%, 0)',
            width: 26, height: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, lineHeight: 1, fontWeight: 700, zIndex: 3,
            color: node.collapsed ? '#ffffff' : '#475569',
            background: node.collapsed ? '#3b82f6' : '#ffffff',
            border: `1px solid ${node.collapsed ? '#3b82f6' : '#cbd5e1'}`,
            borderRadius: 10, cursor: 'pointer', padding: 0,
            boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
          }}
          onClick={e => { e.stopPropagation(); dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: node.id, collapsed: !node.collapsed } }) }}
          title={node.collapsed ? 'Expandir' : 'Recolher'}
          aria-label={node.collapsed ? 'Expandir' : 'Recolher'}
        >
          {node.collapsed ? '+' : '−'}
        </button>
      )}

      {/* Code + Title */}
      <div style={{ position: 'absolute', top: 4, left: 8, right: 8, bottom: viewMode === 'chart' ? 4 : 128, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {isEditing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
            <span style={{ whiteSpace: 'nowrap', fontWeight: 500, color: node.style.textColor, flexShrink: 0 }}>
              {node.code}
            </span>
            <input
              ref={inputRef}
              autoFocus
              defaultValue={editingInitialText != null ? editingInitialText : node.title}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 3, padding: '0 4px', fontSize: node.style.fontSize, color: node.style.textColor, outline: 'none' }}
              onBlur={e => {
                const t = e.currentTarget.value.trim()
                if (t && t !== node.title) dispatch({ type: 'RENAME_NODE', payload: { nodeId: node.id, title: t } })
                dispatch({ type: 'SET_EDITING', payload: { nodeId: null } })
              }}
              onKeyDown={e => {
                if (e.key === 'Tab') {
                  // Tab durante a edição: confirma o texto e navega níveis
                  // (Tab = desce, cria filho; Shift+Tab = sobe, vai ao pai).
                  e.preventDefault()
                  e.stopPropagation()
                  e.currentTarget.blur()
                  if (e.shiftKey) {
                    const parentId = node.parentId
                    if (parentId) {
                      dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [parentId] } })
                      dispatch({ type: 'SET_EDITING', payload: { nodeId: parentId } })
                    }
                  } else {
                    dispatch({ type: 'INSERT_CHILD', payload: { parentId: node.id } })
                  }
                  return
                }
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') { dispatch({ type: 'SET_EDITING', payload: { nodeId: null } }); e.stopPropagation() }
                e.stopPropagation()
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        ) : (
          <span style={{
            whiteSpace: 'nowrap', fontWeight: 500, lineHeight: 1.3,
            // Raiz em pé do Horizontal: lida de baixo para cima, como no modelo "Pintar uma sala".
            ...(geom.vertical ? { writingMode: 'vertical-rl' as const, transform: 'rotate(180deg)' } : {}),
          }}>
            {node.code} {node.title}
          </span>
        )}
      </div>
      {viewMode !== 'chart' && <div style={{ position: 'absolute', top: 38, left: 8, right: 8, fontSize: 11, lineHeight: 1.7 }}>
        {viewMode === 'details' ? <>
          <div>Responsável: {owner ?? 'Não definido'}</div>
          <div>Minutos orçados: {formatHours((financial?.budgetHours ?? 0) * 60)}</div><div>Minutos realizados: {formatHours((financial?.actualHours ?? 0) * 60)}</div>
          <div>Prevista: {fmtDataBR(node.properties.dataPrevista) || '—'}</div>
          <div>Realizada: {fmtDataBR(node.properties.dataRealizacao) || '—'}</div>
          {canViewCosts && <><div>Custo orçado: {formatMoney(financial?.budgetCost)}</div><div>Custo real: {formatMoney(financial?.actualCost)}</div></>}
        </> : <>
          <div>Horas orçadas: {formatHours(financial?.budgetHours)}</div>
          <div>Horas reais: {formatHours(financial?.actualHours)}</div>
          <div>Custo orçado: {formatMoney(financial?.budgetCost)}</div>
          <div>Custo real: {formatMoney(financial?.actualCost)}</div>
        </>}
      </div>}
    </div>
  )
})

function formatMoney(value: number | null | undefined) {
  return value == null ? 'Sem valor/hora' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}
function formatHours(value = 0) { return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value) }

export default WbsNodeCard

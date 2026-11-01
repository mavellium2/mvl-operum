'use client'

import OperumButton from '@/components/ui/GlassButton'
import { type Dispatch, useEffect, useRef } from 'react'
import type { WbsAction } from '@/lib/wbsReducer'
import type { WbsNodeClient } from '@/types/wbs'

export interface WbsContextMenuState {
  x: number
  y: number
  /** nó clicado com o botão direito; null = clique em área vazia */
  nodeId: string | null
}

interface Item {
  label: string
  shortcut?: string
  action: () => void
  disabled?: boolean
  danger?: boolean
}

interface WbsContextMenuProps {
  state: WbsContextMenuState | null
  onClose: () => void
  nodes: Record<string, WbsNodeClient>
  selectedNodeIds: string[]
  canEdit: boolean
  hasCopiedStyle: boolean
  hasClipboardNodes: boolean
  dispatch: Dispatch<WbsAction>
  onRequestDelete: () => void
  onPasteStyle: () => void
  onFitScreen: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onZoomReset: () => void
}

function ItemButton({ item, onClose }: { item: Item; onClose: () => void }) {
  return (
    <OperumButton variant="danger" type="button"
      disabled={item.disabled}
      onClick={() => { if (item.disabled) return; item.action(); onClose() }}
      className={`w-full flex items-center justify-between px-4 py-1.5 text-sm text-left transition-colors cursor-pointer disabled:opacity-40 disabled:pointer-events-none ${
        item.danger
          ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
          : 'text-gray-800 hover:bg-blue-50 hover:text-blue-700'
      }`}
    >
      <span>{item.label}</span>
      {item.shortcut && <span className="ml-8 text-xs text-gray-500 shrink-0">{item.shortcut}</span>}
    </OperumButton>
  )
}

export default function WbsContextMenu({
  state, onClose, nodes, selectedNodeIds, canEdit, hasCopiedStyle, hasClipboardNodes,
  dispatch, onRequestDelete, onPasteStyle, onFitScreen, onZoomIn, onZoomOut, onZoomReset,
}: WbsContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Mantém o menu dentro da janela
  useEffect(() => {
    const el = ref.current
    if (!el || !state) return
    const r = el.getBoundingClientRect()
    const M = 8
    const dx = Math.min(0, window.innerWidth - M - r.right)
    const dy = Math.min(0, window.innerHeight - M - r.bottom)
    el.style.transform = dx < 0 || dy < 0 ? `translate(${dx}px, ${dy}px)` : ''
  }, [state])

  // Fecha com Esc, scroll ou clique fora
  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onWheel = () => onClose()
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('wheel', onWheel, { capture: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('wheel', onWheel, { capture: true })
    }
  }, [state, onClose])

  if (!state) return null

  const node = state.nodeId ? nodes[state.nodeId] : null
  const hasClip = hasClipboardNodes
  const isParent = node ? node.childrenIds.length > 0 : false

  let items: (Item | null)[] = []

  if (node) {
    items = [
      { label: 'Inserir Filho', shortcut: 'Tab', action: () => dispatch({ type: 'INSERT_CHILD', payload: { parentId: node.id } }), disabled: !canEdit },
      { label: 'Inserir Irmão', shortcut: 'Enter', action: () => dispatch({ type: 'INSERT_SIBLING', payload: { siblingId: node.id } }), disabled: !canEdit || !node.parentId },
      { label: 'Renomear', shortcut: 'F2', action: () => dispatch({ type: 'SET_EDITING', payload: { nodeId: node.id } }) },
      isParent
        ? { label: node.collapsed ? 'Expandir' : 'Recolher', shortcut: '[ / ]', action: () => dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: node.id, collapsed: !node.collapsed } }) }
        : null,
      { label: 'Duplicar', shortcut: 'Ctrl+D', action: () => dispatch({ type: 'DUPLICATE', payload: { nodeIds: [node.id] } }), disabled: !canEdit || !node.parentId },
      null,
      { label: 'Copiar', shortcut: 'Ctrl+C', action: () => dispatch({ type: 'COPY', payload: { nodeIds: [node.id] } }) },
      { label: 'Recortar', shortcut: 'Ctrl+X', action: () => dispatch({ type: 'CUT', payload: { nodeIds: [node.id] } }), disabled: !canEdit || !node.parentId },
      { label: 'Colar', shortcut: 'Ctrl+V', action: () => dispatch({ type: 'PASTE', payload: { parentId: node.id } }), disabled: !canEdit || !hasClip },
      null,
      { label: 'Copiar Estilo', shortcut: 'Ctrl+Shift+C', action: () => dispatch({ type: 'COPY_STYLE', payload: { nodeId: node.id } }) },
      { label: 'Colar Estilo', shortcut: 'Ctrl+Shift+V', action: onPasteStyle, disabled: !hasCopiedStyle || selectedNodeIds.length === 0 },
      { label: 'Limpar Estilo', shortcut: 'Ctrl+Shift+X', action: () => dispatch({ type: 'CLEAR_STYLE' }), disabled: !canEdit || selectedNodeIds.length === 0 },
      null,
      { label: 'Remover', shortcut: 'Delete', action: onRequestDelete, disabled: !canEdit || !node.parentId, danger: true },
    ]
  } else {
    items = [
      { label: 'Selecionar Tudo', shortcut: 'Ctrl+A', action: () => dispatch({ type: 'SET_SELECTION', payload: { nodeIds: Object.keys(nodes) } }) },
      { label: 'Colar', shortcut: 'Ctrl+V', action: () => { if (selectedNodeIds[0]) dispatch({ type: 'PASTE', payload: { parentId: selectedNodeIds[0] } }) }, disabled: !canEdit || !hasClip || !selectedNodeIds[0] },
      null,
      { label: 'Ajustar Tela', action: onFitScreen },
      { label: 'Zoom In', shortcut: '+', action: onZoomIn },
      { label: 'Zoom Out', shortcut: '−', action: onZoomOut },
      { label: 'Zoom 100%', shortcut: 'Ctrl+0', action: onZoomReset },
    ]
  }

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: state.x, top: state.y, zIndex: 10000 }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="bg-white shadow-xl rounded-md border border-gray-200 py-1 min-w-[230px]">
        {items.map((item, idx) => {
          if (!item) return <hr key={idx} className="my-1 border-gray-200" />
          return <ItemButton key={item.label} item={item} onClose={onClose} />
        })}
      </div>
    </div>
  )
}

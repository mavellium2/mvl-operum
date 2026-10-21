'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

// useLayoutEffect no cliente (mede antes do paint), useEffect no servidor (no-op em SSR)
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
import { computeLayout, resolveDropPosition, NODE_W, NODE_H } from '@/lib/wbsLayout'
import { measureNodeWidths } from '@/lib/wbsMedidas'
import { elaboradoresDe } from '@/lib/elaboradores'
import { computeFinancialRollups, computeRollups } from '@/lib/wbsRollup'
import WbsGantt from './WbsGantt'
import { useCalendarToday } from '@/hooks/useCalendarToday'
import type { WbsNodeClient, WbsTreeState, WbsViewMode } from '@/types/wbs'
import { useToast } from '@/components/ui/Toast'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { WbsProvider, useWbs, arvoresDoServidor } from './WbsContext'
import WbsMenubar from './WbsMenubar'
import WbsNodeCard from './WbsNode'
import WbsContextMenu, { type WbsContextMenuState } from './WbsContextMenu'
import WbsPropertiesPanel from './WbsPropertiesPanel'
import { getWbsTreeAction, saveTreeAction } from '@/app/actions/wbs'
import { getSprintExclusaoInfoAction } from '@/app/actions/sprints'
import type { GetTreeResult } from '@/services/wbsService'
import type { DropPosition } from '@/types/wbs'

const SCROLL_SPEED = 1.0

export interface WbsCanvasProps {
  projetoId: string
  tenantId: string
  userId: string
  canEdit: boolean
  initialTree: GetTreeResult
  initialView?: WbsViewMode
  canViewCosts?: boolean
  rates?: Record<string, number | null>
  owners?: Record<string, string>
  today?: string
}

interface DragState {
  nodeId: string
  nodeIds: string[]
  x: number
  y: number
  targetId: string | null
  targetPos: DropPosition | null
}

interface PendingDrag {
  nodeId: string
  nodeIds: string[]
  startX: number
  startY: number
}

/**
 * Junto do autosave: o motivo informado ao excluir uma fase com dados e os vínculos
 * (card/sprint) dos itens recortados que ainda não foram colados — recortar não exclui.
 */
function extrasDoSalvamento(s: WbsTreeState, motivo: string) {
  return {
    motivoExclusao: motivo || undefined,
    preservar: s.clipboard.actionType === 'CUT'
      ? s.clipboard.nodes.flatMap(n => [n.properties?.cardId, n.properties?.sprintId]).filter((v): v is string => typeof v === 'string')
      : undefined,
  }
}

function WbsCanvasInner({ projetoId, canEdit, initialView = 'chart', canViewCosts = false, rates = {}, owners = {}, today = new Date().toISOString().slice(0, 10) }: Omit<WbsCanvasProps, 'initialTree' | 'tenantId' | 'userId'>) {
  const calendarToday = useCalendarToday(today)
  const [viewMode, setViewMode] = useState<WbsViewMode>(initialView === 'costs' && !canViewCosts ? 'chart' : initialView)
  const changeView = (mode: WbsViewMode) => {
    if (mode === 'costs' && !canViewCosts) return
    setViewMode(mode)
    const url = new URL(window.location.href)
    url.searchParams.set('view', mode)
    window.history.replaceState(null, '', url)
  }
  const { state, dispatch } = useWbs()
  const { toast } = useToast()

  const stateRef = useRef(state)
  useIsomorphicLayoutEffect(() => { stateRef.current = state }, [state])

  const canvasRef = useRef<HTMLDivElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevNodesRef = useRef(state.nodes)
  // Track pending pointer-down to distinguish click vs. drag (no capture until 4 px moved)
  const pendingDragRef = useRef<PendingDrag | null>(null)
  const hasInitiallyCenteredRef = useRef(false)

  const spaceDownRef = useRef(false)
  const [spaceDown, setSpaceDown] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panningRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null)
  const pendingPanRef = useRef<{ startX: number; startY: number } | null>(null)

  const [drag, setDrag] = useState<DragState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Fases (sprints) com dados na exclusão: motivo obrigatório, enviado no próximo autosave.
  const [sprintsComDados, setSprintsComDados] = useState<Array<{ nome: string; cards: number; segundos: number }>>([])
  const [motivoExclusao, setMotivoExclusao] = useState('')
  const motivoExclusaoRef = useRef('')
  // Snapshot dos nós a excluir: ao abrir o modal, a seleção é limpa para o foco
  // do teclado ficar só dentro do modal (Tab não volta aos cards).
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([])
  const [showStylePanel, setShowStylePanel] = useState(false)
  // Menu de contexto (clique direito): posição e nó clicado
  const [contextMenu, setContextMenu] = useState<WbsContextMenuState | null>(null)
  // Marquee (seleção múltipla com Shift+arrastar) — coordenadas do canvas
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const pendingMarqueeRef = useRef<{ startX: number; startY: number } | null>(null)
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null)

  const [nodeWidths, setNodeWidths] = useState<Record<string, number>>({})
  useIsomorphicLayoutEffect(() => { setNodeWidths(measureNodeWidths(state.nodes)) }, [state.nodes])
  const nodeHeight = viewMode === 'chart' ? NODE_H : 184
  const displayWidths = useMemo(() => viewMode === 'chart' ? nodeWidths : Object.fromEntries(Object.entries(nodeWidths).map(([id, width]) => [id, Math.max(width, 250)])), [nodeWidths, viewMode])
  // A raiz em pé do Horizontal só vale no gráfico: nos cartões detalhados o texto não caberia.
  const layout = useMemo(
    () => computeLayout(state.nodes, state.rootId, displayWidths, nodeHeight, { raizEmPe: viewMode === 'chart' }),
    [state.nodes, state.rootId, displayWidths, nodeHeight, viewMode],
  )
  const rollups = useMemo(() => computeRollups(state.nodes, state.rootId), [state.nodes, state.rootId])
  const finances = useMemo(() => computeFinancialRollups(state.nodes, state.rootId, rates), [state.nodes, state.rootId, rates])

  // ── Seguir o card recém-criado: centraliza a tela nele ────────────────────
  useEffect(() => {
    const focusId = state.focusNodeId
    if (!focusId) return
    const rect = canvasRef.current?.getBoundingClientRect()
    const g = layout.geometry[focusId]
    if (!rect || !g) return
    const zoom = stateRef.current.viewport.zoom
    const cx = g.x + g.width / 2
    const cy = g.y + g.height / 2
    dispatch({
      type: 'SET_VIEWPORT',
      payload: { zoom, panX: rect.width / 2 - cx * zoom, panY: rect.height / 2 - cy * zoom },
    })
    dispatch({ type: 'SET_FOCUS_NODE', payload: { nodeId: null } })
  }, [state.focusNodeId, layout.geometry, dispatch])

  const requestDelete = useCallback(() => {
    const ids = stateRef.current.selectedNodeIds
    setPendingDeleteIds(ids)
    setSprintsComDados([])
    setMotivoExclusao('')
    dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [] } })
    setConfirmDelete(true)
    // Excluir uma fase exclui a sprint dela: se a sprint tem dados, pede o motivo.
    const nodes = stateRef.current.nodes
    const fases: Array<{ sprintId: string; nome: string }> = []
    const pilha = [...ids]
    while (pilha.length) {
      const n = nodes[pilha.pop()!]
      if (!n) continue
      const sid = n.properties?.sprintId
      if (typeof sid === 'string') fases.push({ sprintId: sid, nome: `${n.code} ${n.title}` })
      pilha.push(...n.childrenIds)
    }
    if (fases.length) {
      void Promise.all(fases.map(async f => ({ f, info: await getSprintExclusaoInfoAction(f.sprintId) }))).then(lista => {
        setSprintsComDados(lista.flatMap(({ f, info }) => ('exigeMotivo' in info && info.exigeMotivo ? [{ nome: f.nome, cards: info.cards, segundos: info.segundosRegistrados }] : [])))
      })
    }
  }, [dispatch])

  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve())
  const savedVersionRef = useRef(state.sync.serverVersion)
  const saveSnapshot = useCallback((snapshot: WbsTreeState) => {
    const reason = motivoExclusaoRef.current
    const operation = saveQueueRef.current.catch(() => {}).then(async () => {
      const result = await saveTreeAction({
        projetoId, serverVersion: Math.max(snapshot.sync.serverVersion, savedVersionRef.current),
        rootId: snapshot.rootId, nodes: snapshot.nodes, ...extrasDoSalvamento(snapshot, reason),
      }).catch(() => ({ ok: false as const, conflict: false, error: 'Não foi possível salvar a EAP. Tente novamente.' }))
      if (result.ok) savedVersionRef.current = result.serverVersion
      return result
    })
    saveQueueRef.current = operation
    return operation
  }, [projetoId])

  // ── Autosave ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.nodes === prevNodesRef.current) return
    prevNodesRef.current = state.nodes
    if (!canEdit || arvoresDoServidor.has(state.nodes)) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const s = stateRef.current
      saveTimerRef.current = null
      dispatch({ type: 'SET_SYNC_STATUS', payload: { status: 'SAVING' } })
      const res = await saveSnapshot(s)
      if (res.ok) {
        motivoExclusaoRef.current = ''
        dispatch({ type: 'SET_SYNC_STATUS', payload: { status: stateRef.current.nodes === s.nodes ? 'IDLE' : 'DIRTY', serverVersion: res.serverVersion, lastSavedAt: Date.now() } })
      } else if (res.conflict) {
        // A EAP mudou no servidor (outra pessoa ou a sincronização com as sprints):
        // carrega a versão atual em vez de deixar o editor travado em conflito.
        const atual = await getWbsTreeAction(projetoId)
        if (atual.ok) {
          arvoresDoServidor.add(atual.nodes)
          dispatch({ type: 'SET_TREE', payload: { nodes: atual.nodes, rootId: atual.rootId, serverVersion: atual.serverVersion } })
          toast('A EAP foi atualizada no servidor enquanto você editava. Carregamos a versão atual; refaça a última alteração.', 'warning')
        } else {
          dispatch({ type: 'SET_SYNC_STATUS', payload: { status: 'CONFLICT' } })
          toast('Conflito: esta EAP foi editada por outra pessoa. Recarregue a página.', 'warning')
        }
      } else {
        dispatch({ type: 'SET_SYNC_STATUS', payload: { status: 'ERROR' } })
        toast(res.error || 'Erro ao salvar automaticamente', 'error')
      }
    }, 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [state.nodes, canEdit, projetoId, dispatch, toast, saveSnapshot])

  // Flush de alterações pendentes: o debounce de 1500ms cancela o save no cleanup,
  // então navegar antes do tempo (back/SPA) perdia a edição silenciosamente.
  // Este handler grava o estado mais recente de forma imediata ao desmontar ou ao
  // unload do navegador, evitando a perda total de dados.
  const flushPendingSaveRef = useRef<() => void>(() => {})
  useIsomorphicLayoutEffect(() => {
    flushPendingSaveRef.current = () => {
      const s = stateRef.current
      if (!canEdit || s.sync.status === 'IDLE' || s.sync.status === 'SAVING') return
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
      saveSnapshot(s)
        .then(res => {
          if (res.ok) {
            dispatch({ type: 'SET_SYNC_STATUS', payload: { status: stateRef.current.nodes === s.nodes ? 'IDLE' : 'DIRTY', serverVersion: res.serverVersion, lastSavedAt: Date.now() } })
          } else if (res.conflict) {
            dispatch({ type: 'SET_SYNC_STATUS', payload: { status: 'CONFLICT' } })
          } else {
            dispatch({ type: 'SET_SYNC_STATUS', payload: { status: 'ERROR' } })
          }
        })
        .catch(() => {})
    }
  })
  useEffect(() => {
    const flush = () => flushPendingSaveRef.current()
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [])

  // ── Save helpers ────────────────────────────────────────────────────────────
  const handleManualSave = useCallback(async () => {
    if (!canEdit) return
    const s = stateRef.current
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null }
    dispatch({ type: 'SET_SYNC_STATUS', payload: { status: 'SAVING' } })
    const res = await saveSnapshot(s)
    if (res.ok) {
      dispatch({ type: 'SET_SYNC_STATUS', payload: { status: stateRef.current.nodes === s.nodes ? 'IDLE' : 'DIRTY', serverVersion: res.serverVersion, lastSavedAt: Date.now() } })
      toast('EAP salva com sucesso', 'success')
    } else {
      dispatch({ type: 'SET_SYNC_STATUS', payload: { status: res.conflict ? 'CONFLICT' : 'ERROR' } })
      toast(res.error || 'Erro ao salvar', 'error')
    }
  }, [canEdit, dispatch, toast, saveSnapshot])

  // ── Zoom helpers (reutilizados por teclado, menu de contexto e roda) ──────
  const zoomBy = useCallback((factor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    const vp = stateRef.current.viewport
    const mx = rect ? rect.width / 2 : 0
    const my = rect ? rect.height / 2 : 0
    const newZoom = Math.min(3, Math.max(0.1, vp.zoom * factor))
    dispatch({ type: 'SET_VIEWPORT', payload: { zoom: newZoom, panX: mx - (mx - vp.panX) * (newZoom / vp.zoom), panY: my - (my - vp.panY) * (newZoom / vp.zoom) } })
  }, [dispatch])

  const zoomReset = useCallback(() => {
    const vp = stateRef.current.viewport
    dispatch({ type: 'SET_VIEWPORT', payload: { zoom: 1, panX: vp.panX, panY: vp.panY } })
  }, [dispatch])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (viewMode === 'gantt' || !canEdit) return
      // Com um modal aberto (ex.: ConfirmDialog), os atalhos do canvas não devem
      // disparar — deixa o navegador/modal tratar Tab, Enter, Delete etc.
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return
      const tag = (e.target as HTMLElement)?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      const s = stateRef.current
      const sel = s.selectedNodeIds[0]
      const ctrl = e.ctrlKey || e.metaKey

      if (e.key === 'Escape') {
        if (s.editingNodeId) dispatch({ type: 'SET_EDITING', payload: { nodeId: null } })
        else dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [] } })
        return
      }
      if (isInput) return

      if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'UNDO' }) }
      else if (ctrl && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); dispatch({ type: 'REDO' }) }
      else if (ctrl && e.key === 's') { e.preventDefault(); handleManualSave() }
      else if (ctrl && e.key === 'a') { e.preventDefault(); dispatch({ type: 'SET_SELECTION', payload: { nodeIds: Object.keys(s.nodes) } }) }
      else if (ctrl && e.shiftKey && (e.key === 'C' || e.key === 'c')) { e.preventDefault(); if (sel) dispatch({ type: 'COPY_STYLE', payload: { nodeId: sel } }) }
      else if (ctrl && e.shiftKey && (e.key === 'V' || e.key === 'v')) {
        e.preventDefault()
        if (s.clipboard.copiedStyle && s.selectedNodeIds.length > 0) {
          dispatch({ type: 'PASTE_STYLE_TO_SELECTED' })
          toast(`Estilo aplicado a ${s.selectedNodeIds.length} elemento(s)`, 'success')
        }
      }
      else if (ctrl && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault()
        if (s.selectedNodeIds.length > 0) {
          dispatch({ type: 'CLEAR_STYLE' })
          toast(`Estilo limpo de ${s.selectedNodeIds.length} elemento(s)`, 'success')
        }
      }
      else if (ctrl && e.key === '0') { e.preventDefault(); zoomReset() }
      else if (e.code === 'KeyD' && ctrl && !e.shiftKey) {
        // Ctrl+D é reservado no navegador (favoritos) em alguns casos — usar
        // Ctrl+Alt+D quando o evento chegar. Casamos por e.code (tecla física)
        // para não falhar com AltGr/layouts (ex.: ABNT2).
        e.preventDefault()
        if (s.selectedNodeIds.some(id => s.nodes[id]?.parentId)) dispatch({ type: 'DUPLICATE', payload: { nodeIds: s.selectedNodeIds } })
      }
      else if (!sel) return
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1.15) }
      else if (e.key === '-') { e.preventDefault(); zoomBy(1 / 1.15) }
      else if (e.key === '[') { e.preventDefault(); const n = s.nodes[sel]; if (n?.childrenIds.length) dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: sel, collapsed: true } }) }
      else if (e.key === ']') { e.preventDefault(); const n = s.nodes[sel]; if (n?.childrenIds.length) dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: sel, collapsed: false } }) }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const dir = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right'
        const n = s.nodes[sel]
        if (!n) return
        if (dir === 'left') {
          if (n.childrenIds.length > 0 && !n.collapsed) dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: sel, collapsed: true } })
          else if (n.parentId) dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [n.parentId] } })
        } else if (dir === 'right') {
          if (n.childrenIds.length > 0) {
            const first = s.nodes[n.childrenIds[0]]
            if (first) {
              if (n.collapsed) dispatch({ type: 'SET_COLLAPSED', payload: { nodeId: sel, collapsed: false } })
              dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [first.id] } })
            }
          }
        } else {
          const parent = n.parentId ? s.nodes[n.parentId] : undefined
          const siblings = parent ? parent.childrenIds.map(id => s.nodes[id]).filter((x): x is WbsNodeClient => Boolean(x)) : [n]
          const idx = siblings.findIndex(x => x.id === sel)
          if (dir === 'down') { if (idx >= 0 && idx < siblings.length - 1) dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [siblings[idx + 1].id] } }) }
          else if (idx > 0) dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [siblings[idx - 1].id] } })
          else if (parent) dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [parent.id] } })
        }
      }
      else if (e.key.length === 1 && e.key !== ' ' && !ctrl && !e.altKey && !s.editingNodeId && s.selectedNodeIds.length === 1) {
        // Digitar sobre um único card selecionado já começa a edição, substituindo o título.
        e.preventDefault()
        dispatch({ type: 'SET_EDITING', payload: { nodeId: sel, initialText: e.key } })
      }
      else if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); const p = s.nodes[sel]?.parentId; if (p) dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [p] } }) }
      else if (e.key === 'Tab') { e.preventDefault(); dispatch({ type: 'INSERT_CHILD', payload: { parentId: sel } }) }
      else if (e.key === 'Enter') { e.preventDefault(); dispatch({ type: 'INSERT_SIBLING', payload: { siblingId: sel } }) }
      else if (e.key === 'F2') { e.preventDefault(); dispatch({ type: 'SET_EDITING', payload: { nodeId: sel } }) }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (s.selectedNodeIds.some(id => s.nodes[id]?.parentId)) requestDelete() }
      else if (ctrl && e.key === 'c') { e.preventDefault(); dispatch({ type: 'COPY', payload: { nodeIds: s.selectedNodeIds } }) }
      else if (ctrl && e.key === 'x') { e.preventDefault(); dispatch({ type: 'CUT', payload: { nodeIds: s.selectedNodeIds } }) }
      else if (ctrl && e.key === 'v') { e.preventDefault(); dispatch({ type: 'PASTE', payload: { parentId: sel } }) }
    }
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [dispatch, showStylePanel, viewMode, canEdit]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Space key tracking (pan cursor) ────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (e.target instanceof Element && e.target.closest('[role="dialog"]')) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      if (!spaceDownRef.current) { spaceDownRef.current = true; setSpaceDown(true) }
    }
    const onUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceDownRef.current = false
      setSpaceDown(false)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  // ── Wheel → pan/zoom (passive:false para permitir preventDefault) ───────────
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const vp = stateRef.current.viewport
      const rect = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) {
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const f = e.deltaY < 0 ? 1.15 : 1 / 1.15
        const newZoom = Math.min(3, Math.max(0.1, vp.zoom * f))
        dispatch({ type: 'SET_VIEWPORT', payload: { zoom: newZoom, panX: mx - (mx - vp.panX) * (newZoom / vp.zoom), panY: my - (my - vp.panY) * (newZoom / vp.zoom) } })
      } else if (e.shiftKey) {
        // Shift+scroll de mouse → horizontal (deltaX é 0, usa deltaY como eixo H)
        dispatch({ type: 'SET_VIEWPORT', payload: { ...vp, panX: vp.panX - e.deltaY * SCROLL_SPEED } })
      } else {
        // Scroll normal ou trackpad: aplica X e Y simultaneamente
        dispatch({ type: 'SET_VIEWPORT', payload: { ...vp, panX: vp.panX - e.deltaX * SCROLL_SPEED, panY: vp.panY - e.deltaY * SCROLL_SPEED } })
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [dispatch, viewMode])

  // ── Fit to screen (zoom p/ caber tudo, card principal sempre centralizado) ─
  const fitToScreen = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect || !layout.bounds.width || !layout.bounds.height) return
    const PAD = 40
    const zoom = Math.min(1, Math.min(
      (rect.width - PAD * 2) / layout.bounds.width,
      (rect.height - PAD * 2) / layout.bounds.height,
    ))
    // Centraliza o card principal (raiz) na horizontal; na vertical fica
    // um pouco abaixo do topo (não centralizado verticalmente).
    const TOP_OFFSET = 28
    const rootGeom = state.rootId ? layout.geometry[state.rootId] : undefined
    const cx = rootGeom ? rootGeom.x + rootGeom.width / 2 : layout.bounds.width / 2
    const cy = rootGeom ? rootGeom.y : 0
    const panX = rect.width / 2 - cx * zoom
    const panY = TOP_OFFSET - cy * zoom
    dispatch({ type: 'SET_VIEWPORT', payload: { zoom, panX, panY } })
  }, [layout.bounds, layout.geometry, state.rootId, dispatch])

  // ── Center tree on first render (once bounds are known) ───────────────────
  useEffect(() => {
    if (hasInitiallyCenteredRef.current || !layout.bounds.width || !layout.bounds.height) return
    hasInitiallyCenteredRef.current = true
    requestAnimationFrame(() => fitToScreen())
  }, [layout.bounds, fitToScreen])

  // ── Ao abrir a EAP, o foco já começa no card raiz — pronto para Tab/Enter ──
  useEffect(() => {
    if (state.rootId && state.selectedNodeIds.length === 0) {
      dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [state.rootId] } })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Node selection (multi-select via Ctrl/Cmd+click) ──────────────────────
  const handleNodeSelect = useCallback((nodeId: string, multi: boolean) => {
    const s = stateRef.current
    if (multi) {
      const already = s.selectedNodeIds.includes(nodeId)
      dispatch({
        type: 'SET_SELECTION',
        payload: { nodeIds: already ? s.selectedNodeIds.filter(id => id !== nodeId) : [...s.selectedNodeIds, nodeId] },
      })
    } else {
      dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [nodeId] } })
    }
  }, [dispatch])

  // ── Menu de contexto (botão direito) ────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const target = (e.target as HTMLElement).closest('[data-node-id]')
    const nodeId = target?.getAttribute('data-node-id') ?? null
    if (nodeId) {
      const s = stateRef.current
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        const already = s.selectedNodeIds.includes(nodeId)
        dispatch({
          type: 'SET_SELECTION',
          payload: { nodeIds: already ? s.selectedNodeIds.filter(id => id !== nodeId) : [...s.selectedNodeIds, nodeId] },
        })
      } else {
        dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [nodeId] } })
      }
    }
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId })
  }, [dispatch])

  // ── DnD — click vs. drag distinguished by 4 px movement threshold ─────────
  // We do NOT call setPointerCapture on pointerdown; this allows native
  // click / dblclick events to fire on the node elements normally.
  // Capture is only set once movement exceeds the threshold (actual drag).
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Middle button OR Space+left → pan
    if (e.button === 1 || (e.button === 0 && spaceDownRef.current)) {
      e.preventDefault()
      const vp = stateRef.current.viewport
      panningRef.current = { startX: e.clientX, startY: e.clientY, startPanX: vp.panX, startPanY: vp.panY }
      e.currentTarget.setPointerCapture(e.pointerId)
      setIsPanning(true)
      return
    }
    if (e.button !== 0) return
    let el = e.target as HTMLElement | null
    while (el && !el.dataset.nodeId) el = el.parentElement
    if (e.shiftKey && !el?.dataset.nodeId) {
      // Shift + arrastar em área vazia → seleção múltipla (marquee)
      pendingMarqueeRef.current = { startX: e.clientX, startY: e.clientY }
      return
    }
    if (el?.dataset.nodeId) {
      const clicked = el.dataset.nodeId
      const s = stateRef.current
      // Se o card clicado já está selecionado, arrasta TODA a seleção (exceto a raiz).
      const nodeIds = s.selectedNodeIds.includes(clicked)
        ? s.selectedNodeIds.filter(id => id !== s.rootId && s.nodes[id]?.parentId)
        : [clicked]
      pendingDragRef.current = { nodeId: clicked, nodeIds, startX: e.clientX, startY: e.clientY }
    } else {
      pendingPanRef.current = { startX: e.clientX, startY: e.clientY }
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const pendingM = pendingMarqueeRef.current
    if (pendingM) {
      const dx = e.clientX - pendingM.startX
      const dy = e.clientY - pendingM.startY
      if (dx * dx + dy * dy > 16) {
        pendingMarqueeRef.current = null
        e.currentTarget.setPointerCapture(e.pointerId)
        const rect = canvasRef.current?.getBoundingClientRect()
        const vp = stateRef.current.viewport
        const m = {
          x0: (pendingM.startX - (rect?.left ?? 0) - vp.panX) / vp.zoom,
          y0: (pendingM.startY - (rect?.top ?? 0) - vp.panY) / vp.zoom,
          x1: (e.clientX - (rect?.left ?? 0) - vp.panX) / vp.zoom,
          y1: (e.clientY - (rect?.top ?? 0) - vp.panY) / vp.zoom,
        }
        marqueeRef.current = m
        setMarquee(m)
      }
      return
    }
    if (marqueeRef.current) {
      const rect = canvasRef.current?.getBoundingClientRect()
      const vp = stateRef.current.viewport
      const m = marqueeRef.current
      const next = { ...m, x1: (e.clientX - (rect?.left ?? 0) - vp.panX) / vp.zoom, y1: (e.clientY - (rect?.top ?? 0) - vp.panY) / vp.zoom }
      marqueeRef.current = next
      setMarquee(next)
      return
    }
    if (panningRef.current) {
      const { startX, startY, startPanX, startPanY } = panningRef.current
      dispatch({ type: 'SET_VIEWPORT', payload: { ...stateRef.current.viewport, panX: startPanX + e.clientX - startX, panY: startPanY + e.clientY - startY } })
      return
    }
    if (pendingPanRef.current) {
      const dx = e.clientX - pendingPanRef.current.startX
      const dy = e.clientY - pendingPanRef.current.startY
      if (dx * dx + dy * dy > 16) {
        const vp = stateRef.current.viewport
        panningRef.current = { startX: pendingPanRef.current.startX, startY: pendingPanRef.current.startY, startPanX: vp.panX, startPanY: vp.panY }
        pendingPanRef.current = null
        e.currentTarget.setPointerCapture(e.pointerId)
        setIsPanning(true)
      }
      return
    }
    const pending = pendingDragRef.current
    if (pending && !drag) {
      const dx = e.clientX - pending.startX
      const dy = e.clientY - pending.startY
      if (dx * dx + dy * dy > 16 && canEdit && pending.nodeIds.length > 0) {
        e.currentTarget.setPointerCapture(e.pointerId)
        setDrag({ nodeId: pending.nodeId, nodeIds: pending.nodeIds, x: e.clientX, y: e.clientY, targetId: null, targetPos: null })
        pendingDragRef.current = null
      }
      return
    }
    if (!drag) return

    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const vp = stateRef.current.viewport
    const cx = (e.clientX - rect.left - vp.panX) / vp.zoom
    const cy = (e.clientY - rect.top - vp.panY) / vp.zoom

    // Não permite soltar sobre o próprio nó nem sobre seus descendentes (evita ciclo).
    const draggedSubtree = new Set<string>()
    for (const nid of drag.nodeIds) {
      const q = [nid]
      while (q.length) {
        const id = q.shift()!
        if (draggedSubtree.has(id)) continue
        draggedSubtree.add(id)
        q.push(...(stateRef.current.nodes[id]?.childrenIds ?? []))
      }
    }

    let targetId: string | null = null
    let targetPos: DropPosition | null = null
    for (const [id, geom] of Object.entries(layout.geometry)) {
      if (draggedSubtree.has(id)) continue
      const pos = resolveDropPosition(cx, cy, geom)
      if (pos) { targetId = id; targetPos = pos; break }
    }
    setDrag(prev => prev ? { ...prev, x: e.clientX, y: e.clientY, targetId, targetPos } : null)
  }, [drag, canEdit, layout.geometry, dispatch])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const m = marqueeRef.current
    if (m) {
      const minX = Math.min(m.x0, m.x1)
      const maxX = Math.max(m.x0, m.x1)
      const minY = Math.min(m.y0, m.y1)
      const maxY = Math.max(m.y0, m.y1)
      const hit: string[] = []
      for (const [id, g] of Object.entries(layout.geometry)) {
        if (g.x <= maxX && g.x + g.width >= minX && g.y <= maxY && g.y + g.height >= minY) {
          hit.push(id)
        }
      }
      dispatch({ type: 'SET_SELECTION', payload: { nodeIds: hit } })
      marqueeRef.current = null
      setMarquee(null)
      pendingMarqueeRef.current = null
      try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* já liberado */ }
      return
    }
    pendingMarqueeRef.current = null
    if (panningRef.current) {
      panningRef.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
      setIsPanning(false)
      return
    }
    pendingPanRef.current = null
    pendingDragRef.current = null
    if (!drag) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (drag.targetId && drag.targetPos) {
      if (drag.nodeIds.length === 1) {
        dispatch({ type: 'MOVE_NODE', payload: { nodeId: drag.nodeIds[0], targetId: drag.targetId, position: drag.targetPos } })
      } else {
        dispatch({ type: 'MOVE_NODES', payload: { nodeIds: drag.nodeIds, targetId: drag.targetId, position: drag.targetPos } })
      }
    }
    setDrag(null)
  }, [drag, dispatch, layout.geometry])

  const { viewport } = state
  const transform = `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`
  const draggingNode = drag ? state.nodes[drag.nodeId] : null

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <WbsMenubar
        viewMode={viewMode}
        onChangeView={changeView}
        canViewCosts={canViewCosts}
        syncStatus={state.sync.status}
        lastSavedAt={state.sync.lastSavedAt}
        zoom={viewport.zoom}
        panX={viewport.panX}
        panY={viewport.panY}
        canUndo={state.history.past.length > 0}
        canRedo={state.history.future.length > 0}
        canEdit={canEdit}
        nodes={state.nodes}
        rootId={state.rootId}
        selectedNodeIds={state.selectedNodeIds}
        projetoId={projetoId}
        dispatch={dispatch}
        hasCopiedStyle={state.clipboard.copiedStyle !== null}
        hasClipboardNodes={state.clipboard.nodes.length > 0}
        onFitScreen={fitToScreen}
        onManualSave={handleManualSave}
        onRequestDelete={requestDelete}
        showStylePanel={showStylePanel}
        onToggleStylePanel={() => setShowStylePanel(true)}
        onPasteStyle={() => {
          const s = stateRef.current
          if (s.clipboard.copiedStyle && s.selectedNodeIds.length > 0) {
            dispatch({ type: 'PASTE_STYLE_TO_SELECTED' })
            toast(`Estilo aplicado a ${s.selectedNodeIds.length} elemento(s)`, 'success')
          }
        }}
      />

      {viewMode === 'gantt' ? <WbsGantt nodes={state.nodes} rootId={state.rootId} today={calendarToday} /> : <div className="relative flex flex-1 overflow-hidden">
        {/* Canvas */}
        <div
          ref={canvasRef}
          data-wbs-canvas=""
          className="relative flex-1 overflow-hidden bg-[#f8fafc] select-none"
          style={{ cursor: drag || isPanning ? 'grabbing' : spaceDown ? 'grab' : 'default' }}
          onClick={e => { if (!e.shiftKey) dispatch({ type: 'SET_SELECTION', payload: { nodeIds: [] } }) }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onContextMenu={handleContextMenu}
        >
          {/* Dot grid */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize: '24px 24px' }}
          />

          {/* Transformed layer */}
          <div style={{ transform, transformOrigin: '0 0', position: 'absolute', willChange: 'transform' }}>
            {/* Connectors */}
            <svg
              style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
              width={layout.bounds.width || 1}
              height={layout.bounds.height || 1}
            >
              {layout.connectors.map(c => (
                <path key={`${c.fromId}-${c.toId}`} d={c.path} stroke="#cbd5e1" strokeWidth="1.5" fill="none" />
              ))}
              {/* Drop target indicator */}
              {drag?.targetId && drag.targetPos && layout.geometry[drag.targetId] && (() => {
                const g = layout.geometry[drag.targetId]
                return (
                  <rect
                    x={g.x - 2} y={g.y - 2} width={g.width + 4} height={g.height + 4}
                    fill="none"
                    stroke={drag.targetPos === 'INSIDE' ? '#3b82f6' : '#10b981'}
                    strokeWidth="2" rx="7"
                    strokeDasharray={drag.targetPos !== 'INSIDE' ? '5 3' : undefined}
                  />
                )
              })()}
            </svg>

            {/* Nodes */}
            {Object.values(state.nodes).map(node => {
              const geom = layout.geometry[node.id]
              if (!geom) return null
              return (
                <WbsNodeCard
                  key={node.id}
                  node={node}
                  viewMode={viewMode}
                  canEdit={canEdit}
                  canViewCosts={canViewCosts}
                  owner={elaboradoresDe(node.properties).map(id => owners[id]).filter(Boolean).join(', ') || node.properties.elaboradoPor || undefined}
                  duration={rollups[node.id]?.durationDays}
                  financial={finances[node.id]}
                  geom={geom}
                  isSelected={state.selectedNodeIds.includes(node.id)}
                  isEditing={state.editingNodeId === node.id}
                  editingInitialText={state.editingNodeId === node.id ? state.editingInitialText : undefined}
                  isDragTarget={drag?.targetId === node.id}
                  onSelect={handleNodeSelect}
                  dispatch={dispatch}
                />
              )
            })}

            {/* Marquee de seleção */}
            {marquee && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(marquee.x0, marquee.x1),
                  top: Math.min(marquee.y0, marquee.y1),
                  width: Math.abs(marquee.x1 - marquee.x0),
                  height: Math.abs(marquee.y1 - marquee.y0),
                  border: '1px solid #3b82f6',
                  backgroundColor: 'rgba(59, 130, 246, 0.12)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>

          {/* Coordinate indicator */}
          <div className="absolute bottom-2 left-2 text-xs text-gray-400 select-none pointer-events-none font-mono">
            x: {Math.round(-viewport.panX / viewport.zoom)}  y: {Math.round(-viewport.panY / viewport.zoom)}
          </div>

          {/* Empty state hint */}
          {state.rootId && Object.keys(state.nodes).length === 1 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
              <p className="text-xs text-gray-400 bg-white/80 px-3 py-1.5 rounded-full border border-gray-200">
                Tab = filho • Shift+Tab = volta • Enter = irmão • F2 = renomear • Shift+arrastar = selecionar
              </p>
            </div>
          )}
        </div>

        {/* Painel de estilo — popover flutuante, só aparece quando aberto pela toolbar */}
        {showStylePanel && (
          <WbsPropertiesPanel
            selectedNodeIds={state.selectedNodeIds}
            nodes={state.nodes}
            canEdit={canEdit}
            dispatch={dispatch}
            onClose={() => setShowStylePanel(false)}
          />
        )}
      </div>}

      {/* DnD ghost */}
      {drag && draggingNode && (
        <div style={{
          position: 'fixed', left: drag.x + 12, top: drag.y - nodeHeight / 2,
          width: layout.geometry[drag.nodeId]?.width ?? NODE_W, height: nodeHeight, boxSizing: 'border-box',
          backgroundColor: draggingNode.style.backgroundColor,
          border: `${draggingNode.style.borderWidth}px solid ${draggingNode.style.borderColor}`,
          borderRadius: draggingNode.style.borderRadius,
          color: draggingNode.style.textColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0.8, pointerEvents: 'none', zIndex: 9999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          fontSize: draggingNode.style.fontSize, fontWeight: 500,
        }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 8px' }}>
            {draggingNode.title}
          </span>
          {drag.nodeIds.length > 1 && (
            <span style={{ position: 'absolute', top: -8, right: -8, backgroundColor: '#3b82f6', color: '#fff', borderRadius: 9999, fontSize: 11, fontWeight: 700, padding: '1px 6px', zIndex: 1 }}>
              {drag.nodeIds.length}
            </span>
          )}
        </div>
      )}

      {/* Badge indicando o que acontecerá no drop (Filho / Antes / Depois) */}
      {drag?.targetId && drag.targetPos && (
        <div style={{ position: 'fixed', left: drag.x + 12, top: drag.y + nodeHeight / 2 + 8, zIndex: 9999, pointerEvents: 'none' }}>
          <div className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold text-white shadow-lg ${
            drag.targetPos === 'INSIDE' ? 'bg-blue-600' : 'bg-emerald-600'
          }`}>
            {drag.targetPos === 'INSIDE' ? '↳ Filho' : drag.targetPos === 'BEFORE' ? '← Antes' : '→ Depois'}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (pendingDeleteIds.length > 0) {
            motivoExclusaoRef.current = motivoExclusao.trim()
            dispatch({ type: 'DELETE_NODES', payload: { nodeIds: pendingDeleteIds } })
          }
          setConfirmDelete(false)
        }}
        title="Excluir elementos"
        message={(() => {
          const hasRootSelected = state.rootId ? pendingDeleteIds.includes(state.rootId) : false
          const targetCount = pendingDeleteIds.length
          const firstName = pendingDeleteIds[0] ? state.nodes[pendingDeleteIds[0]]?.title : undefined
          const base = targetCount > 1
            ? `Excluir ${targetCount} elementos e suas subárvores?`
            : `Excluir "${firstName ?? 'este nó'}" e toda a subárvore?`
          const note = hasRootSelected ? ' O card principal não é excluído.' : ''
          return `${base}${note} Use Ctrl+Z para desfazer.`
        })()}
        cancelVariant="primary"
        cancelAutoFocus
        confirmLabel="Excluir"
        confirmDisabled={sprintsComDados.length > 0 && motivoExclusao.trim().length < 5}
      >
        {sprintsComDados.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Excluir {sprintsComDados.length === 1 ? 'esta fase exclui a sprint' : 'estas fases exclui as sprints'} com dados:{' '}
              {sprintsComDados.map(s => `${s.nome} (${s.cards} card${s.cards === 1 ? '' : 's'}${s.segundos > 0 ? `, ${Math.floor(s.segundos / 3600)}h${String(Math.round((s.segundos % 3600) / 60)).padStart(2, '0')}` : ''})`).join('; ')}.
              A exclusão fica no histórico de alterações das sprints.
            </p>
            <label htmlFor="wbs-motivo-exclusao" className="text-sm font-medium text-gray-700">Motivo da exclusão *</label>
            <textarea
              id="wbs-motivo-exclusao"
              value={motivoExclusao}
              onChange={e => setMotivoExclusao(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Por que esta fase/sprint está sendo excluída?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>
        )}
      </ConfirmDialog>

      {/* Menu de contexto (clique direito) */}
      <WbsContextMenu
        state={contextMenu}
        onClose={() => setContextMenu(null)}
        nodes={state.nodes}
        selectedNodeIds={state.selectedNodeIds}
        canEdit={canEdit}
        hasCopiedStyle={state.clipboard.copiedStyle !== null}
        hasClipboardNodes={state.clipboard.nodes.length > 0}
        dispatch={dispatch}
        onRequestDelete={requestDelete}
        onPasteStyle={() => {
          const s = stateRef.current
          if (s.clipboard.copiedStyle && s.selectedNodeIds.length > 0) {
            dispatch({ type: 'PASTE_STYLE_TO_SELECTED' })
            toast(`Estilo aplicado a ${s.selectedNodeIds.length} elemento(s)`, 'success')
          }
        }}
        onFitScreen={fitToScreen}
        onZoomIn={() => zoomBy(1.15)}
        onZoomOut={() => zoomBy(1 / 1.15)}
        onZoomReset={zoomReset}
      />
    </div>
  )
}

export default function WbsCanvas({ initialTree, ...props }: WbsCanvasProps) {
  return (
    <WbsProvider initialTree={initialTree} projetoId={props.projetoId}>
      <WbsCanvasInner {...props} />
    </WbsProvider>
  )
}

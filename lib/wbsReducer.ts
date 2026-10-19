import { v4 as uuidv4 } from 'uuid'
import type {
  WbsTreeState, WbsNodeClient, WbsNodeStyle, WbsNodeProperties,
  WbsLayoutOrientation, WbsHistoryEntry, WbsViewport, DropPosition,
} from '@/types/wbs'
import { recalcCodes } from './wbsCode'

const MAX_HISTORY = 50

export const DEFAULT_STYLE: WbsNodeStyle = {
  backgroundColor: '#ffffff',
  borderColor: '#d1d5db',
  textColor: '#111827',
  borderWidth: 1,
  fontSize: 14,
  borderRadius: 6,
}

export type WbsAction =
  | { type: 'INSERT_CHILD'; payload: { parentId: string } }
  | { type: 'INSERT_SIBLING'; payload: { siblingId: string } }
  | { type: 'DUPLICATE'; payload: { nodeIds: string[] } }
  | { type: 'DELETE_NODE'; payload: { nodeId: string } }
  | { type: 'DELETE_NODES'; payload: { nodeIds: string[] } }
  | { type: 'RENAME_NODE'; payload: { nodeId: string; title: string } }
  | { type: 'MOVE_NODE'; payload: { nodeId: string; targetId: string; position: DropPosition } }
  | { type: 'MOVE_NODES'; payload: { nodeIds: string[]; targetId: string; position: DropPosition } }
  | { type: 'SET_LAYOUT'; payload: { nodeId: string; layout: WbsLayoutOrientation } }
  /** Organizar sem fase selecionada: formato na raiz e todas as fases de volta a "Igual à EAP" (ADR-047). */
  | { type: 'SET_EAP_FORMAT'; payload: { layout: WbsLayoutOrientation } }
  | { type: 'UPDATE_STYLE'; payload: { style: Partial<WbsNodeStyle> } }
  | { type: 'UPDATE_PROPERTIES'; payload: { nodeId: string; properties: Partial<WbsNodeProperties> } }
  | { type: 'SET_COLLAPSED'; payload: { nodeId: string; collapsed: boolean } }
  | { type: 'COPY_STYLE'; payload: { nodeId: string } }
  | { type: 'PASTE_STYLE'; payload: { nodeIds: string[] } }
  | { type: 'PASTE_STYLE_TO_SELECTED' }
  | { type: 'CLEAR_STYLE' }
  | { type: 'COPY'; payload: { nodeIds: string[] } }
  | { type: 'CUT'; payload: { nodeIds: string[] } }
  | { type: 'PASTE'; payload: { parentId: string } }
  | { type: 'SET_SELECTION'; payload: { nodeIds: string[] } }
  | { type: 'SET_EDITING'; payload: { nodeId: string | null; initialText?: string } }
  | { type: 'SET_FOCUS_NODE'; payload: { nodeId: string | null } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_VIEWPORT'; payload: WbsViewport }
  | { type: 'SET_SYNC_STATUS'; payload: Partial<WbsTreeState['sync']> }
  | { type: 'RESET_TREE'; payload?: { rootTitle?: string } }
  | { type: 'SET_TREE'; payload: { nodes: Record<string, WbsNodeClient>; rootId: string | null; serverVersion: number } }
  /** Troca os nós pela mesclagem com o servidor, mantendo seleção e histórico; o autosave grava em seguida. */
  | { type: 'REBASE'; payload: { nodes: Record<string, WbsNodeClient>; base: Record<string, WbsNodeClient>; serverVersion: number } }

// ── Helpers ──────────────────────────────────────────────────────────────────

function collectSubtree(rootId: string, nodes: Record<string, WbsNodeClient>): Set<string> {
  const ids = new Set<string>()
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()!
    if (ids.has(id) || !nodes[id]) continue
    ids.add(id)
    nodes[id].childrenIds.forEach(cid => stack.push(cid))
  }
  return ids
}

function isInSubtree(candidate: string, subtreeRoot: string, nodes: Record<string, WbsNodeClient>): boolean {
  return collectSubtree(subtreeRoot, nodes).has(candidate)
}

/** Recompacta orders 0,1,2… e atualiza childrenIds do pai. */
function recompactChildren(parentId: string, nodes: Record<string, WbsNodeClient>): Record<string, WbsNodeClient> {
  const result = { ...nodes }
  const parent = result[parentId]
  if (!parent) return result

  const sorted = parent.childrenIds
    .map(id => result[id])
    .filter((n): n is WbsNodeClient => Boolean(n))
    .sort((a, b) => a.order - b.order)

  sorted.forEach((child, idx) => {
    result[child.id] = { ...result[child.id], order: idx }
  })
  result[parentId] = { ...result[parentId], childrenIds: sorted.map(c => c.id) }
  return result
}

function pushHistory(state: WbsTreeState): WbsTreeState['history'] {
  const entry: WbsHistoryEntry = { nodes: state.nodes, rootId: state.rootId }
  return {
    past: [...state.history.past.slice(-(MAX_HISTORY - 1)), entry],
    future: [],
  }
}

/**
 * Move um ou mais nós para junto do alvo (INSIDE = filho; BEFORE/AFTER = irmão).
 * Retorna null se o movimento for inválido (ciclo, alvo inexistente, só raiz etc.).
 * Mantém a ordem relativa visual dos nós movidos e evita órfãos quando o alvo é
 * a raiz com BEFORE/AFTER (cai para INSIDE).
 */
function moveNodes(
  state: WbsTreeState,
  nodeIds: string[],
  targetId: string,
  position: DropPosition
): WbsTreeState | null {
  const nodes = state.nodes
  const target = nodes[targetId]
  if (!target) return null

  // Só nós existentes e com pai (a raiz não move)
  const rawSet = new Set(nodeIds.filter(id => nodes[id]?.parentId))
  if (rawSet.size === 0) return null

  // Fica apenas com os nós "de topo": sem ancestral também no lote
  // (descendentes já vão junto na subárvore do movido).
  const toMove = new Set<string>()
  for (const id of nodeIds) {
    if (!rawSet.has(id)) continue
    let anc = nodes[id]?.parentId ?? null
    let hasSelectedAncestor = false
    while (anc) {
      if (rawSet.has(anc)) { hasSelectedAncestor = true; break }
      anc = nodes[anc]?.parentId ?? null
    }
    if (!hasSelectedAncestor) toMove.add(id)
  }
  if (toMove.size === 0) return null

  // Prevenção de ciclo: o alvo não pode estar dentro da subárvore de nenhum movido
  for (const id of toMove) {
    if (targetId === id || isInSubtree(targetId, id, nodes)) return null
  }

  // BEFORE/AFTER reposiciona no pai do alvo. Se o alvo for a raiz (sem pai),
  // não há onde "inserir ao lado" — cai para INSIDE (vira filho da raiz).
  const newParentId = position === 'INSIDE' ? targetId : (target.parentId ?? targetId)

  let newNodes: Record<string, WbsNodeClient> = { ...nodes }

  // 1. Remover os movidos dos pais antigos
  const oldParents = new Set<string>()
  for (const id of toMove) {
    const pid = nodes[id].parentId
    if (pid && newNodes[pid]) oldParents.add(pid)
  }
  for (const pid of oldParents) {
    newNodes[pid] = {
      ...newNodes[pid],
      childrenIds: newNodes[pid].childrenIds.filter(cid => !toMove.has(cid)),
    }
    newNodes = recompactChildren(pid, newNodes)
  }

  // 2. Ordem de inserção no novo pai (estado pós-remoção)
  let insertOrder: number
  if (position === 'INSIDE') {
    insertOrder = newParentId && newNodes[newParentId] ? newNodes[newParentId].childrenIds.length : 0
  } else {
    insertOrder = (newNodes[targetId]?.order ?? 0) + (position === 'BEFORE' ? 0 : 1)
  }

  // 3. Ordem relativa visual dos movidos (pré-ordem na árvore ORIGINAL)
  const movedList = [...toMove]
  if (state.rootId) {
    const pre: string[] = []
    const seen = new Set<string>()
    const walk = [state.rootId]
    while (walk.length > 0) {
      const id = walk.shift()!
      if (!id || !nodes[id] || seen.has(id)) continue
      seen.add(id)
      pre.push(id)
      const ch = nodes[id].childrenIds
      for (let i = ch.length - 1; i >= 0; i--) walk.unshift(ch[i])
    }
    movedList.sort((a, b) => pre.indexOf(a) - pre.indexOf(b))
  }

  // 4. Deslocar irmãos (não movidos) do novo pai pela quantidade inserida
  if (newParentId && newNodes[newParentId]) {
    for (const cid of newNodes[newParentId].childrenIds) {
      const c = newNodes[cid]
      if (c && !toMove.has(cid) && c.order >= insertOrder) {
        newNodes[cid] = { ...c, order: c.order + movedList.length }
      }
    }
  }

  // 5. Posicionar os movidos em sequência
  let cursor = insertOrder
  for (const id of movedList) {
    newNodes[id] = { ...newNodes[id], parentId: newParentId, order: cursor }
    cursor++
  }

  // 6. Reconstrói childrenIds do novo pai e recompacta
  if (newParentId && newNodes[newParentId]) {
    const newChildIds = [...newNodes[newParentId].childrenIds, ...movedList]
      .filter(id => newNodes[id])
      .sort((a, b) => newNodes[a].order - newNodes[b].order)
    newNodes[newParentId] = { ...newNodes[newParentId], childrenIds: newChildIds }
    newNodes = recompactChildren(newParentId, newNodes)
  }

  // 7. Recalcular códigos
  if (state.rootId) newNodes = recalcCodes(newNodes)

  return { ...state, nodes: newNodes, history: pushHistory(state), sync: { ...state.sync, status: 'DIRTY' } }
}

function makeNode(parentId: string | null, order: number, style: WbsNodeStyle): WbsNodeClient {
  return {
    id: uuidv4(),
    parentId,
    order,
    code: '',
    title: 'Novo elemento',
    layout: 'LADO_A_LADO',
    collapsed: false,
    style: { ...style },
    properties: {},
    childrenIds: [],
  }
}

/** Clone profundo iterativo — novos IDs, mantém estrutura interna. */
function semVinculoComSprint(properties: WbsNodeClient['properties']): WbsNodeClient['properties'] {
  const { cardId: _cardId, sprintId: _sprintId, ...resto } = properties ?? {}
  return resto
}

function cloneSubtree(
  rootId: string,
  nodes: Record<string, WbsNodeClient>,
  /** Cópia (não recorte): a cópia não herda o vínculo com card/sprint, senão dois nós apontariam para o mesmo. */
  semVinculo = false,
): { cloned: Record<string, WbsNodeClient>; newRootId: string } {
  const idMap = new Map<string, string>()
  const stack = [rootId]
  const order: string[] = []

  while (stack.length > 0) {
    const id = stack.pop()!
    if (!nodes[id] || idMap.has(id)) continue
    idMap.set(id, uuidv4())
    order.push(id)
    for (let i = nodes[id].childrenIds.length - 1; i >= 0; i--) {
      stack.push(nodes[id].childrenIds[i])
    }
  }

  const cloned: Record<string, WbsNodeClient> = {}
  for (const id of order) {
    const n = nodes[id]
    const newId = idMap.get(id)!
    cloned[newId] = {
      ...n,
      id: newId,
      parentId: n.parentId ? (idMap.get(n.parentId) ?? null) : null,
      childrenIds: n.childrenIds.map(cid => idMap.get(cid) ?? cid),
      ...(semVinculo ? { properties: semVinculoComSprint(n.properties) } : {}),
    }
  }
  return { cloned, newRootId: idMap.get(rootId)! }
}

// ── Reducer ──────────────────────────────────────────────────────────────────

export function wbsReducer(state: WbsTreeState, action: WbsAction): WbsTreeState {
  switch (action.type) {

    case 'INSERT_CHILD': {
      const { parentId } = action.payload
      const parent = state.nodes[parentId]
      if (!parent) return state

      const newNode = makeNode(parentId, parent.childrenIds.length, parent.style)
      let newNodes: Record<string, WbsNodeClient> = {
        ...state.nodes,
        [newNode.id]: newNode,
        [parentId]: { ...parent, childrenIds: [...parent.childrenIds, newNode.id] },
      }
      newNodes = recalcCodes(newNodes)
      return {
        ...state,
        nodes: newNodes,
        selectedNodeIds: [newNode.id],
        editingNodeId: newNode.id,
        focusNodeId: newNode.id,
        history: pushHistory(state),
        sync: { ...state.sync, status: 'DIRTY' },
      }
    }

    case 'INSERT_SIBLING': {
      const { siblingId } = action.payload
      const sibling = state.nodes[siblingId]
      if (!sibling || sibling.parentId === null) return state

      const parentId = sibling.parentId
      const parent = state.nodes[parentId]
      if (!parent) return state

      const newOrder = sibling.order + 1
      let newNodes: Record<string, WbsNodeClient> = { ...state.nodes }

      // Deslocar irmãos posteriores
      for (const cid of parent.childrenIds) {
        const child = newNodes[cid]
        if (child && child.order >= newOrder) {
          newNodes[cid] = { ...child, order: child.order + 1 }
        }
      }

      const newNode = makeNode(parentId, newOrder, sibling.style)
      newNodes[newNode.id] = newNode

      const allChildren = [...parent.childrenIds, newNode.id]
        .map(id => newNodes[id])
        .filter((n): n is WbsNodeClient => Boolean(n))
        .sort((a, b) => a.order - b.order)

      newNodes[parentId] = { ...newNodes[parentId], childrenIds: allChildren.map(c => c.id) }
      newNodes = recalcCodes(newNodes)
      return {
        ...state,
        nodes: newNodes,
        selectedNodeIds: [newNode.id],
        editingNodeId: newNode.id,
        focusNodeId: newNode.id,
        history: pushHistory(state),
        sync: { ...state.sync, status: 'DIRTY' },
      }
    }

    case 'DELETE_NODE': {
      const { nodeId } = action.payload
      const node = state.nodes[nodeId]
      if (!node) return state

      const toDelete = collectSubtree(nodeId, state.nodes)
      let newNodes: Record<string, WbsNodeClient> = { ...state.nodes }
      toDelete.forEach(id => { delete newNodes[id] })

      const parentId = node.parentId
      if (parentId && newNodes[parentId]) {
        newNodes[parentId] = {
          ...newNodes[parentId],
          childrenIds: newNodes[parentId].childrenIds.filter(id => !toDelete.has(id)),
        }
        newNodes = recompactChildren(parentId, newNodes)
      }

      const newRootId = toDelete.has(state.rootId ?? '') ? null : state.rootId
      if (newRootId) newNodes = recalcCodes(newNodes)

      return {
        ...state,
        nodes: newNodes,
        rootId: newRootId,
        selectedNodeIds: state.selectedNodeIds.filter(id => !toDelete.has(id)),
        editingNodeId: toDelete.has(state.editingNodeId ?? '') ? null : state.editingNodeId,
        history: pushHistory(state),
        sync: { ...state.sync, status: 'DIRTY' },
      }
    }

    case 'DELETE_NODES': {
      const { nodeIds } = action.payload
      // O card raiz (principal) nunca é excluído; nós sem pai são ignorados.
      const ids = nodeIds.filter(id => id !== state.rootId && state.nodes[id]?.parentId)
      if (ids.length === 0) return state

      const toDelete = new Set<string>()
      for (const id of ids) {
        for (const sid of collectSubtree(id, state.nodes)) toDelete.add(sid)
      }

      let newNodes: Record<string, WbsNodeClient> = { ...state.nodes }
      toDelete.forEach(id => { delete newNodes[id] })

      const affectedParents = new Set<string>()
      for (const id of ids) {
        const pid = state.nodes[id]?.parentId
        if (pid && newNodes[pid]) affectedParents.add(pid)
      }
      for (const pid of affectedParents) {
        newNodes[pid] = { ...newNodes[pid], childrenIds: newNodes[pid].childrenIds.filter(cid => !toDelete.has(cid)) }
        newNodes = recompactChildren(pid, newNodes)
      }

      const newRootId = toDelete.has(state.rootId ?? '') ? null : state.rootId
      if (newRootId) newNodes = recalcCodes(newNodes)

      return {
        ...state,
        nodes: newNodes,
        rootId: newRootId,
        selectedNodeIds: state.selectedNodeIds.filter(id => !toDelete.has(id)),
        editingNodeId: toDelete.has(state.editingNodeId ?? '') ? null : state.editingNodeId,
        history: pushHistory(state),
        sync: { ...state.sync, status: 'DIRTY' },
      }
    }

    case 'RENAME_NODE': {
      const { nodeId, title } = action.payload
      const node = state.nodes[nodeId]
      if (!node) return state
      return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, title } }, sync: { ...state.sync, status: 'DIRTY' } }
    }
    case 'MOVE_NODE': {
      const { nodeId, targetId, position } = action.payload
      return moveNodes(state, [nodeId], targetId, position) ?? state
    }

    case 'MOVE_NODES': {
      const { nodeIds, targetId, position } = action.payload
      return moveNodes(state, nodeIds, targetId, position) ?? state
    }

    case 'SET_LAYOUT': {
      const { nodeId, layout } = action.payload
      const node = state.nodes[nodeId]
      if (!node) return state
      return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, layout } }, sync: { ...state.sync, status: 'DIRTY' } }
    }

    case 'SET_EAP_FORMAT': {
      const { layout } = action.payload
      if (!state.rootId || !state.nodes[state.rootId]) return state
      const nodes: typeof state.nodes = {}
      for (const [id, n] of Object.entries(state.nodes)) {
        const alvo = id === state.rootId ? layout : 'LADO_A_LADO'
        nodes[id] = n.layout === alvo ? n : { ...n, layout: alvo }
      }
      return { ...state, nodes, history: pushHistory(state), sync: { ...state.sync, status: 'DIRTY' } }
    }

    case 'UPDATE_STYLE': {
      const { style } = action.payload
      if (state.selectedNodeIds.length === 0) return state
      const updated = { ...state.nodes }
      for (const id of state.selectedNodeIds) {
        if (!updated[id]) continue
        updated[id] = { ...updated[id], style: { ...updated[id].style, ...style } }
      }
      return { ...state, nodes: updated, history: pushHistory(state), sync: { ...state.sync, status: 'DIRTY' } }
    }

    case 'UPDATE_PROPERTIES': {
      const { nodeId, properties } = action.payload
      const node = state.nodes[nodeId]
      if (!node) return state
      return {
        ...state,
        nodes: { ...state.nodes, [nodeId]: { ...node, properties: { ...node.properties, ...properties } } },
        sync: { ...state.sync, status: 'DIRTY' },
      }
    }

    case 'SET_COLLAPSED': {
      const { nodeId, collapsed } = action.payload
      const node = state.nodes[nodeId]
      if (!node) return state
      return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, collapsed } } }
    }

    case 'COPY_STYLE': {
      const node = state.nodes[action.payload.nodeId]
      if (!node) return state
      return { ...state, clipboard: { ...state.clipboard, copiedStyle: { ...node.style }, actionType: null } }
    }

    case 'PASTE_STYLE': {
      const style = state.clipboard.copiedStyle
      if (!style) return state
      const newNodes = { ...state.nodes }
      for (const id of action.payload.nodeIds) {
        if (newNodes[id]) newNodes[id] = { ...newNodes[id], style: { ...style } }
      }
      return { ...state, nodes: newNodes, sync: { ...state.sync, status: 'DIRTY' } }
    }

    case 'PASTE_STYLE_TO_SELECTED': {
      const style = state.clipboard.copiedStyle
      if (!style || state.selectedNodeIds.length === 0) return state
      const updated = { ...state.nodes }
      for (const id of state.selectedNodeIds) {
        if (!updated[id]) continue
        updated[id] = { ...updated[id], style: { ...style } }
      }
      return { ...state, nodes: updated, history: pushHistory(state), sync: { ...state.sync, status: 'DIRTY' } }
    }

    case 'CLEAR_STYLE': {
      if (state.selectedNodeIds.length === 0) return state
      const updated = { ...state.nodes }
      for (const id of state.selectedNodeIds) {
        if (!updated[id]) continue
        updated[id] = { ...updated[id], style: { ...DEFAULT_STYLE } }
      }
      return { ...state, nodes: updated, history: pushHistory(state), sync: { ...state.sync, status: 'DIRTY' } }
    }

    case 'COPY': {
      const allNodes: WbsNodeClient[] = []
      const seen = new Set<string>()
      for (const id of action.payload.nodeIds) {
        collectSubtree(id, state.nodes).forEach(sid => {
          if (!seen.has(sid)) { seen.add(sid); allNodes.push(state.nodes[sid]) }
        })
      }
      return { ...state, clipboard: { ...state.clipboard, nodes: allNodes, actionType: 'COPY' } }
    }

    case 'CUT': {
      const allNodes: WbsNodeClient[] = []
      const seen = new Set<string>()
      let newNodes = { ...state.nodes }
      let newRootId = state.rootId

      for (const id of action.payload.nodeIds) {
        const subtree = collectSubtree(id, state.nodes)
        subtree.forEach(sid => {
          if (!seen.has(sid)) { seen.add(sid); allNodes.push(state.nodes[sid]) }
          delete newNodes[sid]
        })
        const parentId = state.nodes[id]?.parentId
        if (parentId && newNodes[parentId]) {
          newNodes[parentId] = { ...newNodes[parentId], childrenIds: newNodes[parentId].childrenIds.filter(cid => !subtree.has(cid)) }
          newNodes = recompactChildren(parentId, newNodes)
        }
        if (subtree.has(newRootId ?? '')) newRootId = null
      }

      if (newRootId) newNodes = recalcCodes(newNodes)
      return {
        ...state,
        nodes: newNodes,
        rootId: newRootId,
        clipboard: { ...state.clipboard, nodes: allNodes, actionType: 'CUT' },
        selectedNodeIds: [],
        history: pushHistory(state),
        sync: { ...state.sync, status: 'DIRTY' },
      }
    }

    case 'PASTE': {
      const { parentId } = action.payload
      const parent = state.nodes[parentId]
      if (!parent || state.clipboard.nodes.length === 0) return state

      const clipMap: Record<string, WbsNodeClient> = {}
      state.clipboard.nodes.forEach(n => { clipMap[n.id] = n })
      const clipIds = new Set(state.clipboard.nodes.map(n => n.id))
      const roots = state.clipboard.nodes.filter(n => !n.parentId || !clipIds.has(n.parentId))

      let newNodes = { ...state.nodes }
      let insertOrder = parent.childrenIds.length

      for (const root of roots) {
        const { cloned, newRootId } = cloneSubtree(root.id, clipMap, state.clipboard.actionType !== 'CUT')
        Object.assign(newNodes, cloned)
        newNodes[newRootId] = { ...newNodes[newRootId], parentId, order: insertOrder }
        newNodes[parentId] = { ...newNodes[parentId], childrenIds: [...newNodes[parentId].childrenIds, newRootId] }
        insertOrder++
      }

      if (state.rootId) newNodes = recalcCodes(newNodes)
      return { ...state, nodes: newNodes, history: pushHistory(state), sync: { ...state.sync, status: 'DIRTY' } }
    }

    case 'DUPLICATE': {
      const { nodeIds } = action.payload
      const selectedSet = new Set(nodeIds)
      // Mantém só os nós "de topo" da seleção (sem ancestral selecionado).
      const isTop = (id: string) => {
        let p = state.nodes[id]?.parentId
        while (p) {
          if (selectedSet.has(p)) return false
          p = state.nodes[p]?.parentId
        }
        return true
      }
      const roots = nodeIds.filter(isTop)

      const byParent = new Map<string, string[]>()
      for (const id of roots) {
        const parentId = state.nodes[id]?.parentId
        if (!parentId) continue
        const list = byParent.get(parentId) ?? []
        list.push(id)
        byParent.set(parentId, list)
      }
      if (byParent.size === 0) return state

      let newNodes = { ...state.nodes }
      const shiftUp = (parentId: string, fromOrder: number) => {
        for (const cid of newNodes[parentId].childrenIds) {
          const c = newNodes[cid]
          if (c && c.order >= fromOrder) newNodes[cid] = { ...c, order: c.order + 1 }
        }
      }

      for (const [parentId, ids] of byParent) {
        // Maior order primeiro: cada duplicata é inserida logo após o original.
        const sorted = ids
          .map(id => newNodes[id])
          .filter((n): n is WbsNodeClient => Boolean(n))
          .sort((a, b) => b.order - a.order)

        for (const root of sorted) {
          const { cloned, newRootId } = cloneSubtree(root.id, state.nodes, true)
          const newOrder = root.order + 1
          shiftUp(parentId, newOrder)
          Object.assign(newNodes, cloned)
          newNodes[newRootId] = { ...newNodes[newRootId], parentId, order: newOrder }
          newNodes[parentId] = { ...newNodes[parentId], childrenIds: [...newNodes[parentId].childrenIds, newRootId] }
        }
        newNodes = recompactChildren(parentId, newNodes)
      }

      if (state.rootId) newNodes = recalcCodes(newNodes)
      return { ...state, nodes: newNodes, history: pushHistory(state), sync: { ...state.sync, status: 'DIRTY' } }
    }

    case 'SET_SELECTION':
      return { ...state, selectedNodeIds: action.payload.nodeIds }

    case 'SET_EDITING':
      return {
        ...state,
        editingNodeId: action.payload.nodeId,
        editingInitialText: action.payload.nodeId ? action.payload.initialText : undefined,
      }

    case 'SET_FOCUS_NODE':
      return { ...state, focusNodeId: action.payload.nodeId }

    case 'UNDO': {
      if (state.history.past.length === 0) return state
      const past = [...state.history.past]
      const entry = past.pop()!
      const current: WbsHistoryEntry = { nodes: state.nodes, rootId: state.rootId }
      return { ...state, nodes: entry.nodes, rootId: entry.rootId, history: { past, future: [current, ...state.history.future] } }
    }

    case 'REDO': {
      if (state.history.future.length === 0) return state
      const [entry, ...future] = state.history.future
      const current: WbsHistoryEntry = { nodes: state.nodes, rootId: state.rootId }
      return { ...state, nodes: entry.nodes, rootId: entry.rootId, history: { past: [...state.history.past, current], future } }
    }

    case 'SET_VIEWPORT':
      return { ...state, viewport: action.payload }

    case 'SET_SYNC_STATUS':
      return { ...state, sync: { ...state.sync, ...action.payload } }

    case 'RESET_TREE': {
      const rootId = uuidv4()
      const root: WbsNodeClient = {
        id: rootId, parentId: null, order: 0, code: '1',
        title: action.payload?.rootTitle ?? 'Projeto',
        layout: 'LADO_A_LADO', collapsed: false,
        style: { ...DEFAULT_STYLE }, properties: {}, childrenIds: [],
      }
      return {
        ...state,
        nodes: { [rootId]: root },
        rootId,
        selectedNodeIds: [],
        editingNodeId: null,
        history: pushHistory(state),
        sync: { ...state.sync, status: 'DIRTY' },
      }
    }

    // Substitui a árvore inteira pelo resultado do servidor (usado após import).
    // Sincroniza serverVersion para que o próximo autosave não entre em conflito.
    case 'SET_TREE': {
      return {
        ...state,
        nodes: action.payload.nodes,
        rootId: action.payload.rootId,
        selectedNodeIds: [],
        editingNodeId: null,
        focusNodeId: null,
        clipboard: { nodes: [], copiedStyle: null, actionType: null },
        history: { past: [], future: [] },
        viewport: state.viewport,
        sync: { status: 'IDLE', lastSavedAt: Date.now(), serverVersion: action.payload.serverVersion, base: action.payload.nodes },
      }
    }

    case 'REBASE': {
      const { nodes, base, serverVersion } = action.payload
      const existe = (id: string) => !!nodes[id]
      return {
        ...state,
        nodes,
        selectedNodeIds: state.selectedNodeIds.filter(existe),
        editingNodeId: state.editingNodeId && existe(state.editingNodeId) ? state.editingNodeId : null,
        sync: { ...state.sync, status: 'DIRTY', serverVersion, base },
      }
    }

    default:
      return state
  }
}

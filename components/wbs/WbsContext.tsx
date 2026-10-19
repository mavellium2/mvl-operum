'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useReducer, useRef, type Dispatch } from 'react'
import { getWbsTreeAction } from '@/app/actions/wbs'
import { wbsReducer, type WbsAction } from '@/lib/wbsReducer'
import type { WbsTreeState } from '@/types/wbs'
import type { GetTreeResult } from '@/services/wbsService'

interface WbsContextValue {
  state: WbsTreeState
  dispatch: Dispatch<WbsAction>
}

const WbsContext = createContext<WbsContextValue | null>(null)

/** Árvores recebidas do servidor (já gravadas): o autosave não as regrava. */
export const arvoresDoServidor = new WeakSet<object>()

export function WbsProvider({
  children,
  initialTree,
  projetoId,
}: {
  children: React.ReactNode
  initialTree: GetTreeResult
  /** Quando informado, busca a versão atual ao abrir e ao voltar para a aba. */
  projetoId?: string
}) {
  const [state, dispatch] = useReducer(wbsReducer, undefined, () => ({
    nodes: initialTree.nodes,
    rootId: initialTree.rootId,
    selectedNodeIds: [],
    editingNodeId: null,
    focusNodeId: null,
    clipboard: { nodes: [], copiedStyle: null, actionType: null },
    history: { past: [], future: [] },
    viewport: { zoom: 1, panX: 40, panY: 40 },
    sync: { status: 'IDLE' as const, lastSavedAt: null, serverVersion: initialTree.serverVersion },
  }))

  // A página roda a sincronização EAP ↔ sprint a cada renderização no servidor (ex.: ao
  // trocar de visualização), e ela pode avançar a versão da árvore. Sem adotar a árvore
  // nova, o próximo autosave (ex.: uma exclusão) era recusado como conflito.
  const { status, serverVersion } = state.sync
  useEffect(() => {
    if (initialTree.serverVersion > serverVersion && status === 'IDLE' && !state.editingNodeId) {
      arvoresDoServidor.add(initialTree.nodes)
      dispatch({ type: 'SET_TREE', payload: { nodes: initialTree.nodes, rootId: initialTree.rootId, serverVersion: initialTree.serverVersion } })
    }
  }, [initialTree, serverVersion, status, state.editingNodeId])

  // A página pode vir do cache do navegador (Voltar) ou a EAP pode ter mudado em outra
  // aba (quadro, planilha, documento rodam a sincronização). Sem alteração pendente,
  // busca a árvore atual ao abrir e ao voltar para a aba.
  const syncRef = useRef(state.sync)
  useLayoutEffect(() => { syncRef.current = state.sync }, [state.sync])
  const atualizar = useCallback(async () => {
    if (!projetoId || syncRef.current.status !== 'IDLE') return
    const before = syncRef.current
    const res = await getWbsTreeAction(projetoId)
    if (syncRef.current !== before || !res.ok || res.serverVersion <= syncRef.current.serverVersion || syncRef.current.status !== 'IDLE') return
    arvoresDoServidor.add(res.nodes)
    dispatch({ type: 'SET_TREE', payload: { nodes: res.nodes, rootId: res.rootId, serverVersion: res.serverVersion } })
  }, [projetoId])
  useEffect(() => {
    void atualizar()
    const aoVoltar = () => { if (document.visibilityState === 'visible') void atualizar() }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => { document.removeEventListener('visibilitychange', aoVoltar); window.removeEventListener('focus', aoVoltar) }
  }, [atualizar])

  return <WbsContext.Provider value={{ state, dispatch }}>{children}</WbsContext.Provider>
}

export function useWbs() {
  const ctx = useContext(WbsContext)
  if (!ctx) throw new Error('useWbs deve ser usado dentro de WbsProvider')
  return ctx
}

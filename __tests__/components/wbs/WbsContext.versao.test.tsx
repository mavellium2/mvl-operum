import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

vi.mock('@/app/actions/wbs', () => ({ getWbsTreeAction: vi.fn() }))

import { WbsProvider, useWbs } from '@/components/wbs/WbsContext'
import { getWbsTreeAction } from '@/app/actions/wbs'
import type { GetTreeResult } from '@/services/wbsService'

const arvore = (serverVersion: number, titulo: string): GetTreeResult => ({
  rootId: 'r', serverVersion,
  nodes: { r: { id: 'r', parentId: null, order: 0, code: '1', title: titulo, layout: 'LADO_A_LADO', collapsed: false, style: {} as never, properties: {}, childrenIds: [] } },
})

function Versao() {
  const { state, dispatch } = useWbs()
  return <><p>{state.sync.serverVersion} {state.nodes.r?.title} {state.sync.status}</p><button onClick={() => dispatch({ type: 'RENAME_NODE', payload: { nodeId: 'r', title: 'Minha edição' } })}>Editar</button></>
}

beforeEach(() => { vi.mocked(getWbsTreeAction).mockReset() })

describe('editor da EAP adota a versão atual do servidor', () => {
  it('ao abrir, busca a árvore e adota se o servidor estiver mais novo (página vinda do cache)', async () => {
    vi.mocked(getWbsTreeAction).mockResolvedValue({ ok: true, ...arvore(7, 'Servidor') } as never)
    render(<WbsProvider initialTree={arvore(3, 'Cache')} projetoId="p1"><Versao /></WbsProvider>)
    await waitFor(() => expect(screen.getByText('7 Servidor IDLE')).toBeInTheDocument())
  })

  it('nova renderização do servidor com versão maior substitui a árvore sem alteração pendente', async () => {
    vi.mocked(getWbsTreeAction).mockResolvedValue({ ok: false, error: 'x' } as never)
    const { rerender } = render(<WbsProvider initialTree={arvore(3, 'Antes')}><Versao /></WbsProvider>)
    expect(screen.getByText('3 Antes IDLE')).toBeInTheDocument()
    await act(async () => { rerender(<WbsProvider initialTree={arvore(4, 'Depois')}><Versao /></WbsProvider>) })
    expect(screen.getByText('4 Depois IDLE')).toBeInTheDocument()
  })
  it('resposta de leitura antiga não sobrescreve edição feita durante a busca', async () => {
    let resolve!: (value: never) => void
    vi.mocked(getWbsTreeAction).mockReturnValue(new Promise(done => { resolve = done }))
    render(<WbsProvider initialTree={arvore(3, 'Antes')} projetoId="p1"><Versao /></WbsProvider>)
    await act(async () => { screen.getByRole('button', { name: 'Editar' }).click() })
    await act(async () => { resolve({ ok: true, ...arvore(4, 'Servidor') } as never) })
    expect(screen.getByText('3 Minha edição DIRTY')).toBeInTheDocument()
  })

})

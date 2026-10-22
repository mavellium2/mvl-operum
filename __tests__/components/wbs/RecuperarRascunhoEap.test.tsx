import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RecuperarRascunhoEap from '@/components/wbs/RecuperarRascunhoEap'
import type { WbsNodeClient } from '@/types/wbs'
import type { ArvoreEap } from '@/lib/wbsMerge'

const style = { backgroundColor: '#fff', borderColor: '#000', textColor: '#000', borderWidth: 1, fontSize: 13, borderRadius: 4 }
const n = (id: string, parentId: string | null, order: number, title: string, childrenIds: string[] = []): WbsNodeClient =>
  ({ id, parentId, order, code: '', title, layout: 'LADO_A_LADO', collapsed: false, style, properties: {}, childrenIds }) as WbsNodeClient
const arv = (...l: WbsNodeClient[]): ArvoreEap => ({ rootId: 'r', nodes: Object.fromEntries(l.map(x => [x.id, x])) })

const base = arv(n('r', null, 0, 'Projeto', ['a', 'b']), n('a', 'r', 0, 'A'), n('b', 'r', 1, 'B'))
const local = arv(n('r', null, 0, 'Projeto', ['a', 'b']), n('a', 'r', 0, 'A minha'), n('b', 'r', 1, 'B minha'))
const servidor = arv(n('r', null, 0, 'Projeto', ['a', 'b']), n('a', 'r', 0, 'A'), n('b', 'r', 1, 'B do colega'))
const rascunho = { versao: 1 as const, tenantId: 't', userId: 'u', projetoId: 'p', motivo: 'conflito' as const, salvoEm: Date.parse('2026-10-21T13:00:00Z'), base, local }

describe('RecuperarRascunhoEap', () => {
  it('mostra o que ficou pendente, o que reaplica e o que conflita', () => {
    render(<RecuperarRascunhoEap rascunho={rascunho} atual={servidor} onAplicar={vi.fn()} onDescartar={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Alterações não salvas preservadas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Suas alterações (2)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Podem ser reaplicadas (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Conflitam com o servidor (1)' })).toBeInTheDocument()
    expect(screen.getByText(/B do colega/)).toBeInTheDocument()
  })

  it('reaplicar entrega a árvore mesclada, sem sobrescrever o colega', () => {
    const onAplicar = vi.fn()
    render(<RecuperarRascunhoEap rascunho={rascunho} atual={servidor} onAplicar={onAplicar} onDescartar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reaplicar minhas alterações' }))
    const { arvore } = onAplicar.mock.calls[0][0]
    expect(arvore.nodes.a.title).toBe('A minha')
    expect(arvore.nodes.b.title).toBe('B do colega')
  })

  it('descartar pede confirmação antes de apagar', () => {
    const onDescartar = vi.fn()
    render(<RecuperarRascunhoEap rascunho={rascunho} atual={servidor} onAplicar={vi.fn()} onDescartar={onDescartar} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    expect(onDescartar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Descartar alterações' }))
    expect(onDescartar).toHaveBeenCalled()
  })
})

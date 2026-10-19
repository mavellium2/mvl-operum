import { describe, it, expect } from 'vitest'
import { mesclarArvores } from '@/lib/wbsMerge'
import type { WbsNodeClient } from '@/types/wbs'

const S = { backgroundColor: '#fff', borderColor: '#000', textColor: '#000', borderWidth: 1, fontSize: 14, borderRadius: 4 }

function no(id: string, parentId: string | null, order: number, extra: Partial<WbsNodeClient> = {}): WbsNodeClient {
  return { id, parentId, order, code: '', title: id, layout: 'LADO_A_LADO', collapsed: false, style: S, properties: {}, childrenIds: [], ...extra }
}

/** Monta a árvore com childrenIds coerentes. */
function arvore(...nos: WbsNodeClient[]): Record<string, WbsNodeClient> {
  const out = Object.fromEntries(nos.map(n => [n.id, { ...n, childrenIds: [] as string[] }]))
  for (const n of Object.values(out).sort((a, b) => a.order - b.order)) if (n.parentId) out[n.parentId].childrenIds.push(n.id)
  return out
}

describe('mesclarArvores', () => {
  // Caso relatado em 19/10: o usuário cria 1.1.1, o autosave grava, a sincronização com as
  // sprints grava o cardId dele (versão avança) e o usuário já criou 1.1.2.
  const base = arvore(no('r', null, 0), no('f1', 'r', 0), no('a', 'f1', 0))
  const servidor = arvore(no('r', null, 0), no('f1', 'r', 0, { properties: { sprintId: 's1' } }), no('a', 'f1', 0, { properties: { cardId: 'c1' } }))
  const local = arvore(no('r', null, 0), no('f1', 'r', 0), no('a', 'f1', 0), no('b', 'f1', 1, { title: 'Novo elemento' }))

  it('mantém o item criado no cliente e recebe o cardId/sprintId gravados no servidor', () => {
    const m = mesclarArvores(base, local, servidor)
    expect(m.b.title).toBe('Novo elemento')
    expect(m.a.properties).toEqual({ cardId: 'c1' })
    expect(m.f1.properties).toEqual({ sprintId: 's1' })
    expect(m.f1.childrenIds).toEqual(['a', 'b'])
  })

  it('o que o cliente mudou prevalece sobre o servidor', () => {
    const l = { ...local, a: { ...local.a, title: 'Comprar tintas' } }
    const s = { ...servidor, a: { ...servidor.a, title: 'Título do card' } }
    expect(mesclarArvores(base, l, s).a.title).toBe('Comprar tintas')
  })

  it('o que só o servidor mudou é adotado', () => {
    const s = { ...servidor, a: { ...servidor.a, title: 'Título do card' } }
    expect(mesclarArvores(base, local, s).a.title).toBe('Título do card')
  })

  it('item excluído no cliente não volta', () => {
    const l = arvore(no('r', null, 0), no('f1', 'r', 0))
    const m = mesclarArvores(base, l, servidor)
    expect(m.a).toBeUndefined()
    expect(m.f1.childrenIds).toEqual([])
  })

  it('item criado no servidor (card sem nó) entra no fim, sem repetir a ordem', () => {
    const s = arvore(...Object.values(servidor), no('x', 'f1', 1, { properties: { cardId: 'c9' } }))
    const m = mesclarArvores(base, local, s)
    expect(m.f1.childrenIds).toEqual(['a', 'b', 'x'])
    expect(['a', 'b', 'x'].map(id => m[id].order)).toEqual([0, 1, 2])
  })

  it('filho novo de um item excluído do outro lado sai junto', () => {
    const s = arvore(no('r', null, 0))
    const m = mesclarArvores(base, local, s)
    expect(Object.keys(m)).toEqual(['r'])
    expect(m.r.childrenIds).toEqual([])
  })
})

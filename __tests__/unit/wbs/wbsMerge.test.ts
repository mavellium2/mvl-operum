import { describe, it, expect, beforeEach } from 'vitest'
import { mesclarRascunho, alteracoesLocais, type ArvoreEap } from '@/lib/wbsMerge'
import { salvarRascunho, lerRascunho, apagarRascunho, chaveDoRascunho } from '@/lib/wbsRascunho'
import type { WbsNodeClient } from '@/types/wbs'

const style = { backgroundColor: '#fff', borderColor: '#000', textColor: '#000', borderWidth: 1, fontSize: 13, borderRadius: 4 }
const n = (id: string, parentId: string | null, order: number, title = id): WbsNodeClient =>
  ({ id, parentId, order, code: '', title, layout: 'LADO_A_LADO', collapsed: false, style, properties: {}, childrenIds: [] }) as WbsNodeClient

function arvore(...lista: WbsNodeClient[]): ArvoreEap {
  const nodes: Record<string, WbsNodeClient> = {}
  for (const x of lista) nodes[x.id] = { ...x, childrenIds: [] }
  for (const x of Object.values(nodes)) if (x.parentId && nodes[x.parentId]) nodes[x.parentId].childrenIds.push(x.id)
  return { rootId: 'r', nodes }
}
const base = () => arvore(n('r', null, 0, 'Projeto'), n('f1', 'r', 0, 'Fase 1'), n('a', 'f1', 0, 'Atividade A'), n('b', 'f1', 1, 'Atividade B'))
const titulos = (a: ArvoreEap) => Object.fromEntries(Object.values(a.nodes).map(x => [x.id, x.title]))

describe('mesclarRascunho', () => {
  it('aplica o que só a pessoa mudou, mantendo o que o servidor mudou em outros itens', () => {
    const local = base(); local.nodes.a.title = 'Atividade A revisada'
    const servidor = base(); servidor.nodes.b.title = 'B por outra pessoa'
    const r = mesclarRascunho(base(), local, servidor)
    expect(titulos(r.arvore)).toMatchObject({ a: 'Atividade A revisada', b: 'B por outra pessoa' })
    expect(r.aplicadas).toEqual([{ nodeId: 'a', titulo: 'Atividade A revisada', tipo: 'alterado' }])
    expect(r.conflitos).toEqual([])
  })

  it('mesmo item alterado dos dois lados: fica o servidor e a alteração vira conflito', () => {
    const local = base(); local.nodes.a.title = 'Minha versão'
    const servidor = base(); servidor.nodes.a.title = 'Versão do colega'
    const r = mesclarRascunho(base(), local, servidor)
    expect(r.arvore.nodes.a.title).toBe('Versão do colega')
    expect(r.conflitos).toEqual([expect.objectContaining({ nodeId: 'a', tipo: 'alterado', motivo: expect.stringContaining('Versão do colega') })])
  })

  it('itens criados entram no pai, inclusive filhos de itens criados', () => {
    const local = arvore(...Object.values(base().nodes), n('novo', 'f1', 2, 'Nova'), n('neto', 'novo', 0, 'Neta'))
    const r = mesclarRascunho(base(), local, base())
    expect(r.arvore.nodes.f1.childrenIds).toEqual(['a', 'b', 'novo'])
    expect(r.arvore.nodes.novo.childrenIds).toEqual(['neto'])
    expect(r.aplicadas.filter(x => x.tipo === 'criado').map(x => x.nodeId).sort()).toEqual(['neto', 'novo'])
  })

  it('item criado sob um pai excluído no servidor vira conflito', () => {
    const local = arvore(...Object.values(base().nodes), n('novo', 'b', 0, 'Sob B'))
    const servidor = arvore(n('r', null, 0, 'Projeto'), n('f1', 'r', 0, 'Fase 1'), n('a', 'f1', 0, 'Atividade A'))
    const r = mesclarRascunho(base(), local, servidor)
    expect(r.arvore.nodes.novo).toBeUndefined()
    expect(r.conflitos).toEqual([expect.objectContaining({ nodeId: 'novo', tipo: 'criado' })])
  })

  it('remoção da pessoa sai; se o servidor alterou o item, fica e vira conflito', () => {
    const local = arvore(n('r', null, 0, 'Projeto'), n('f1', 'r', 0, 'Fase 1'), n('a', 'f1', 0, 'Atividade A'))
    expect(mesclarRascunho(base(), local, base()).arvore.nodes.b).toBeUndefined()
    const servidor = base(); servidor.nodes.b.title = 'B editada'
    const r = mesclarRascunho(base(), local, servidor)
    expect(r.arvore.nodes.b.title).toBe('B editada')
    expect(r.conflitos).toEqual([expect.objectContaining({ nodeId: 'b', tipo: 'removido' })])
  })

  it('não remove um item que ganhou filho no servidor', () => {
    const local = arvore(n('r', null, 0, 'Projeto'), n('f1', 'r', 0, 'Fase 1'), n('a', 'f1', 0, 'Atividade A'))
    const servidor = arvore(...Object.values(base().nodes), n('filho', 'b', 0, 'Filho do colega'))
    const r = mesclarRascunho(base(), local, servidor)
    expect(r.arvore.nodes.b).toBeDefined()
    expect(r.arvore.nodes.b.childrenIds).toEqual(['filho'])
  })

  it('mover para dentro de um item criado funciona; ordem dos irmãos é normalizada', () => {
    const local = arvore(n('r', null, 0, 'Projeto'), n('f1', 'r', 0, 'Fase 1'), n('a', 'f1', 0, 'Atividade A'), n('g', 'r', 1, 'Fase nova'), n('b', 'g', 0, 'Atividade B'))
    const r = mesclarRascunho(base(), local, base())
    expect(r.arvore.nodes.g.childrenIds).toEqual(['b'])
    expect(r.arvore.nodes.f1.childrenIds).toEqual(['a'])
    expect(r.arvore.nodes.a.order).toBe(0)
  })

  it('lista o que ficou pendente em relação à base', () => {
    const local = arvore(n('r', null, 0, 'Projeto'), n('f1', 'r', 0, 'Fase 1 renomeada'), n('a', 'f1', 0, 'Atividade A'), n('novo', 'f1', 1, 'Nova'))
    expect(alteracoesLocais(base(), local).map(x => `${x.tipo}:${x.nodeId}`).sort()).toEqual(['alterado:f1', 'criado:novo', 'removido:b'])
  })
})

describe('rascunho no navegador', () => {
  beforeEach(() => localStorage.clear())
  const dados = { tenantId: 't1', userId: 'u1', projetoId: 'p1', motivo: 'conflito' as const, salvoEm: 1000, base: base(), local: base() }

  it('isola por tenant, usuário e projeto', () => {
    expect(salvarRascunho(dados)).toBe(true)
    expect(lerRascunho('t1', 'u1', 'p1', 2000)).toMatchObject({ projetoId: 'p1', motivo: 'conflito' })
    expect(lerRascunho('t2', 'u1', 'p1', 2000)).toBeNull()
    expect(lerRascunho('t1', 'u2', 'p1', 2000)).toBeNull()
    expect(lerRascunho('t1', 'u1', 'p2', 2000)).toBeNull()
  })

  it('limpa ao resolver, ao expirar e quando o conteúdo é de outro dono', () => {
    salvarRascunho(dados)
    apagarRascunho('t1', 'u1', 'p1')
    expect(lerRascunho('t1', 'u1', 'p1', 2000)).toBeNull()
    salvarRascunho(dados)
    expect(lerRascunho('t1', 'u1', 'p1', 1000 + 31 * 24 * 3600 * 1000)).toBeNull()
    localStorage.setItem(chaveDoRascunho('t1', 'u1', 'p1'), JSON.stringify({ ...dados, versao: 1, userId: 'intruso' }))
    expect(lerRascunho('t1', 'u1', 'p1', 2000)).toBeNull()
  })
})

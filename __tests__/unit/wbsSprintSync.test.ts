// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  project: { findFirst: vi.fn() },
  wbsNode: { findMany: vi.fn(), update: vi.fn(), create: vi.fn(), count: vi.fn(), findFirst: vi.fn(), aggregate: vi.fn(), delete: vi.fn() },
  card: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
  sprint: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
  sprintColumn: { findFirst: vi.fn(), createMany: vi.fn() },
  cardResponsible: { findMany: vi.fn(), createMany: vi.fn() },
  user: { findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: vi.fn() }))

import { sincronizarEapComSprint } from '@/services/wbsService'
import { computarPlanilhaCustos } from '@/lib/planilhaCustos'
import type { WbsNodeClient } from '@/types/wbs'

const node = (id: string, parentId: string | null, title: string, props: object = {}, updatedAt = new Date('2026-10-01')) =>
  ({ id, parentId, title, order: 0, code: '', properties: props, updatedAt })
const sprint = (id: string, name: string, updatedAt = new Date('2026-09-01')) => ({ id, name, updatedAt })
const ZERO = { cardsCriados: 0, nosCriados: 0, nosMovidos: 0, nosRemovidos: 0, sprintsCriadas: 0, cardsMovidos: 0, titulosAtualizados: 0, elaboradoresSincronizados: 0 }

function arvoreMutavel(iniciais: ReturnType<typeof node>[]) {
  let rows = iniciais.map(n => ({ ...n, version: 0 }))
  tx.wbsNode.findMany.mockImplementation(async ({ where = {} } = {}) => structuredClone(rows.filter(n => !('parentId' in where) || n.parentId === where.parentId).sort((a, b) => a.order - b.order)))
  tx.wbsNode.findFirst.mockImplementation(async () => structuredClone(rows.find(n => n.parentId === null)))
  tx.wbsNode.update.mockImplementation(async ({ where, data }) => {
    const n = rows.find(n => n.id === where.id)!
    Object.assign(n, data)
    return structuredClone(n)
  })
  tx.wbsNode.delete.mockImplementation(async ({ where }) => {
    const ids = new Set([where.id])
    for (let i = 0; i < 20; i++) for (const n of rows) if (n.parentId && ids.has(n.parentId)) ids.add(n.id)
    rows = rows.filter(n => !ids.has(n.id))
  })
  return () => structuredClone(rows)
}

describe('exclusão de sprint refletida na EAP e planilha', () => {
  it('remove a fase excluída, preserva os cards do backlog e renumera 1.3 e filhos para 1.2', async () => {
    const rows = arvoreMutavel([
      { ...node('r', null, 'Projeto'), code: '1' },
      { ...node('a', 'r', 'Primeira', { sprintId: 's1' }), code: '1.1' },
      { ...node('b', 'r', 'Excluída', { sprintId: 's2' }), order: 1, code: '1.2' },
      node('backlog', 'b', 'Voltou ao backlog', { cardId: 'c2' }),
      node('extra', 'b', 'Linha sem card', { materiaisOrcado: 500 }),
      { ...node('c', 'r', 'Terceira', { sprintId: 's3' }), order: 2, code: '1.3' },
      { ...node('atividade', 'c', 'Atividade', { cardId: 'c3' }), code: '1.3.1' },
    ])
    // deletedAt:null is the live query, {not:null} is confirmation of the deleted sprint.
    tx.sprint.findMany.mockImplementation(async ({ where }) => where.deletedAt?.not === null ? [{ id: 's2' }] : [sprint('s1', '1.1 Primeira'), sprint('s3', '1.3 Terceira')])
    const cards = [
      { id: 'c2', title: 'Voltou ao backlog', description: '', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: null },
      { id: 'c3', title: 'Atividade', description: '', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: 's3' },
    ]
    tx.card.findMany.mockResolvedValue(cards)
    const result = await sincronizarEapComSprint('p1', 't1')
    expect(result.nosRemovidos).toBe(3)
    expect(rows().map(n => n.id)).not.toEqual(expect.arrayContaining(['b', 'backlog', 'extra']))
    expect(rows().find(n => n.id === 'c')).toMatchObject({ code: '1.2', order: 1 })
    expect(rows().find(n => n.id === 'atividade')?.code).toBe('1.2.1')
    expect(tx.sprint.update).toHaveBeenCalledWith({ where: { id: 's3' }, data: { name: '1.2 Terceira' } })
    expect(tx.card.create).not.toHaveBeenCalled()
    expect(tx.card.update).not.toHaveBeenCalled()
    expect(tx.sprint.create).not.toHaveBeenCalled()
    const tree = Object.fromEntries(rows().map(n => [n.id, { ...n, childrenIds: rows().filter(c => c.parentId === n.id).map(c => c.id) }])) as unknown as Record<string, WbsNodeClient>
    const sheet = computarPlanilhaCustos(tree, 'r', { valorReferencia: 4000, horasPorDia: 8 }, new Map())
    expect(sheet.macrofases.map(f => f.nodeId)).toEqual(['a', 'c'])
    expect(sheet.macrofases.some(f => f.nodeId === 'b')).toBe(false)
    expect(await sincronizarEapComSprint('p1', 't1')).toMatchObject({ nosRemovidos: 0, cardsCriados: 0, sprintsCriadas: 0 })
  })

  it('não remove fase com referência desconhecida ou de outro projeto', async () => {
    const rows = arvoreMutavel([node('r', null, 'Projeto'), node('b', 'r', 'Desconhecida', { sprintId: 'outro' })])
    tx.sprint.findMany.mockResolvedValue([])
    tx.card.findMany.mockResolvedValue([])
    await sincronizarEapComSprint('p1', 't1')
    expect(rows().map(n => n.id)).toContain('b')
    expect(tx.wbsNode.delete).not.toHaveBeenCalled()
    expect(tx.sprint.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', deletedAt: { not: null }, id: { in: ['outro'] } } }))
  })

  it('move atividade da fase excluída para sua sprint viva antes de remover a fase', async () => {
    const rows = arvoreMutavel([node('r', null, 'Projeto'), node('b', 'r', 'Excluída', { sprintId: 's2' }), node('c', 'r', 'Viva', { sprintId: 's3' }), node('n', 'b', 'Atividade', { cardId: 'c3', materiaisOrcado: 250 })])
    tx.sprint.findMany.mockImplementation(async ({ where }) => where.deletedAt?.not === null ? [{ id: 's2' }] : [sprint('s3', 'Viva')])
    tx.card.findMany.mockResolvedValue([{ id: 'c3', title: 'Atividade', description: '', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: 's3' }])
    await sincronizarEapComSprint('p1', 't1')
    expect(rows().find(n => n.id === 'n')).toMatchObject({ parentId: 'c', properties: { cardId: 'c3', materiaisOrcado: 250 } })
    expect(rows().map(n => n.id)).not.toContain('b')
  })
})

beforeEach(() => {
  vi.resetAllMocks()
  tx.project.findFirst.mockResolvedValue({ id: 'p1' })
  tx.wbsNode.findMany.mockResolvedValue([])
  tx.wbsNode.findFirst.mockResolvedValue({ id: 'r', version: 0 })
  tx.wbsNode.update.mockResolvedValue({ version: 1 })
  tx.wbsNode.aggregate.mockResolvedValue({ _max: { order: 1 } })
  tx.wbsNode.create.mockResolvedValue({ id: 'no-novo' })
  tx.sprint.findMany.mockResolvedValue([])
  tx.sprint.findFirst.mockResolvedValue({ id: 's1' })
  tx.sprintColumn.findFirst.mockResolvedValue({ id: 'cAFazer' })
  tx.card.aggregate.mockResolvedValue({ _max: { sprintPosition: 4 } })
  tx.card.create.mockResolvedValue({ id: 'card-novo' })
  tx.sprint.create.mockResolvedValue({ id: 's-nova' })
  tx.cardResponsible.findMany.mockResolvedValue([])
  tx.user.findMany.mockResolvedValue([])
})

describe('sincronizarEapComSprint', () => {
  it('sprint sem nó vira nó no nível 2 (filho da raiz), com o vínculo', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([node('r', null, 'Projeto')]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1')])
    tx.card.findMany.mockResolvedValue([])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r.nosCriados).toBe(1)
    expect(tx.wbsNode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parentId: 'r', title: 'Sprint 1', properties: { sprintId: 's1' } }),
    }))
  })

  it('nó de nível 2 com o nome da sprint é vinculado, sem duplicar', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([node('r', null, 'Projeto'), node('n2', 'r', ' sprint 1 ')]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1')])
    tx.card.findMany.mockResolvedValue([])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r).toEqual(ZERO)
    expect(tx.wbsNode.create).not.toHaveBeenCalled()
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'n2' }, data: { properties: { sprintId: 's1' } } })
  })

  it('card da sprint vira nó dentro do nó da sprint (nível 3), não da raiz', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([node('r', null, 'Projeto'), node('ns', 'r', 'Sprint 1', { sprintId: 's1' })]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1')])
    tx.card.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'cx', title: 'Ajustar login', description: '', updatedAt: new Date(), sprintId: 's1' }])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r.nosCriados).toBe(1)
    expect(tx.wbsNode.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ parentId: 'ns', order: 2, title: 'Ajustar login', properties: { cardId: 'cx' } }),
    }))
    expect(tx.card.create).not.toHaveBeenCalled()
  })

  it('card do backlog (sem sprint) não vira nó', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([node('r', null, 'Projeto')]).mockResolvedValue([])
    tx.card.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'cb', title: 'Ideia', description: '', updatedAt: new Date(), sprintId: null }])
    expect(await sincronizarEapComSprint('p1', 't1')).toEqual(ZERO)
    expect(tx.wbsNode.create).not.toHaveBeenCalled()
  })

  it('folha do nível 3 vira card em "A Fazer" da sprint do seu nível 2', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), node('ns', 'r', 'Sprint 2', { sprintId: 's2' }), node('n1', 'ns', 'Modelar banco'),
    ]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1'), sprint('s2', 'Sprint 2')])
    tx.card.findMany.mockResolvedValue([])
    tx.wbsNode.create.mockResolvedValue({ id: 'ns1' })
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r.cardsCriados).toBe(1)
    expect(tx.card.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ title: 'Modelar banco', sprintId: 's2', sprintColumnId: 'cAFazer', sprintPosition: 5, projectId: 'p1' }),
    }))
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { properties: { cardId: 'card-novo' } } })
  })

  it('nó de card que ficou no nível 2 (versão anterior) é movido para dentro da sprint do card', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), node('ns', 'r', 'Sprint 1', { sprintId: 's1' }), node('n1', 'r', 'Tarefa', { cardId: 'c1' }),
    ]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1')])
    tx.card.findMany
      .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: 's1' }])
      .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', description: '', updatedAt: new Date('2026-10-01'), sprintId: 's1' }])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r.nosMovidos).toBe(1)
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { parentId: 'ns', order: 2 } })
    expect(tx.card.create).not.toHaveBeenCalled()
    expect(tx.wbsNode.create).not.toHaveBeenCalled()
  })

  it('card que mudou de sprint leva o nó para a nova sprint', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), node('a', 'r', 'Sprint 1', { sprintId: 's1' }), node('b', 'r', 'Sprint 2', { sprintId: 's2' }),
      node('n1', 'a', 'Tarefa', { cardId: 'c1' }),
    ]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1'), sprint('s2', 'Sprint 2')])
    tx.card.findMany
      .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: 's2' }])
      .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', description: '', updatedAt: new Date('2026-10-01'), sprintId: 's2' }])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r.nosMovidos).toBe(1)
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { parentId: 'b', order: 2 } })
  })

  it('já sincronizado não escreve nada (idempotente) e card excluído não é recriado', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), node('ns', 'r', 'Sprint 1', { sprintId: 's1' }),
      node('n1', 'ns', 'A', { cardId: 'c1' }), node('n2', 'ns', 'B', { cardId: 'c2' }),
    ])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1')])
    tx.card.findMany
      .mockResolvedValueOnce([
        { id: 'c1', title: 'A', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: 's1' },
        { id: 'c2', title: 'B', deletedAt: new Date(), updatedAt: new Date('2026-10-01'), sprintId: 's1' },
      ])
      .mockResolvedValueOnce([{ id: 'c1', title: 'A', description: '', updatedAt: new Date(), sprintId: 's1' }])
    expect(await sincronizarEapComSprint('p1', 't1')).toEqual(ZERO)
    expect(tx.card.create).not.toHaveBeenCalled()
    expect(tx.wbsNode.create).not.toHaveBeenCalled()
    expect(tx.wbsNode.update).not.toHaveBeenCalled()
  })

  it('título alterado por último vence: card mais novo atualiza o nó; sprint renomeada atualiza o nível 2', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), node('ns', 'r', 'Sprint antiga', { sprintId: 's1' }),
      node('n1', 'ns', 'Velho', { cardId: 'c1' }, new Date('2026-10-01')),
    ]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint nova', new Date('2026-10-05'))])
    tx.card.findMany
      .mockResolvedValueOnce([{ id: 'c1', title: 'Novo', deletedAt: null, updatedAt: new Date('2026-10-05'), sprintId: 's1' }])
      .mockResolvedValueOnce([{ id: 'c1', title: 'Novo', description: '', updatedAt: new Date('2026-10-05'), sprintId: 's1' }])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r.titulosAtualizados).toBe(2)
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { title: 'Novo' } })
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'ns' }, data: { title: 'Sprint nova' } })
  })

  it('card do backlog solto no nível 2 (versão anterior) sai da EAP', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), node('ns', 'r', 'Sprint 1', { sprintId: 's1' }), node('nb', 'r', 'Ideia', { cardId: 'cb' }),
    ]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1')])
    tx.card.findMany
      .mockResolvedValueOnce([{ id: 'cb', title: 'Ideia', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: null }])
      .mockResolvedValueOnce([{ id: 'cb', title: 'Ideia', description: '', updatedAt: new Date('2026-10-01'), sprintId: null }])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r.nosRemovidos).toBe(1)
    expect(tx.wbsNode.delete).toHaveBeenCalledWith({ where: { id: 'nb' } })
    expect(tx.wbsNode.create).not.toHaveBeenCalled()
    expect(tx.card.create).not.toHaveBeenCalled()
  })

  it('card que voltou ao backlog sai de dentro da sprint', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), node('ns', 'r', 'Sprint 1', { sprintId: 's1' }), node('n1', 'ns', 'Tarefa', { cardId: 'c1' }),
    ]).mockResolvedValue([])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1')])
    tx.card.findMany
      .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: null }])
      .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', description: '', updatedAt: new Date('2026-10-01'), sprintId: null }])
    expect((await sincronizarEapComSprint('p1', 't1')).nosRemovidos).toBe(1)
    expect(tx.wbsNode.delete).toHaveBeenCalledWith({ where: { id: 'n1' } })
  })

  it('nível 2 sem sprint vira sprint com as colunas padrão, e a folha vira card nela', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), { ...node('f2', 'r', 'Fase 2'), code: '1.2' }, node('n1', 'f2', 'Tarefa'),
    ]).mockResolvedValue([])
    tx.card.findMany.mockResolvedValue([])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r.sprintsCriadas).toBe(1)
    expect(tx.sprint.create).toHaveBeenCalledWith({ data: { name: '1.2 Fase 2', projectId: 'p1' }, select: { id: true } })
    expect(tx.sprintColumn.createMany).toHaveBeenCalledWith({ data: ['A Fazer', 'Em andamento', 'Em teste', 'Concluído'].map((title, position) => ({ title, position, sprintId: 's-nova' })) })
    expect(tx.card.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: 'Tarefa', sprintId: 's-nova' }) }))
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'f2' }, data: { properties: { sprintId: 's-nova' } } })
  })

  it('nome da sprint acompanha o código do nó ("código título")', async () => {
    tx.wbsNode.findMany
      .mockResolvedValueOnce([node('r', null, 'Projeto'), { ...node('ns', 'r', 'Fase 1', { sprintId: 's1' }), code: '1.1' }])
      .mockResolvedValueOnce([{ code: '1.1', title: 'Fase 1', properties: { sprintId: 's1' } }])
    tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Fase 1')])
    tx.card.findMany.mockResolvedValue([])
    await sincronizarEapComSprint('p1', 't1')
    expect(tx.sprint.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { name: '1.1 Fase 1' } })
    expect(tx.wbsNode.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ title: expect.anything() }) }))
  })

  it('card do backlog de uma fase que acabou de virar sprint vai para "A Fazer" dela (nó preservado)', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([
      node('r', null, 'Projeto'), node('m', 'r', 'Fase 1'), node('n1', 'm', 'Tarefa', { cardId: 'c1' }),
    ]).mockResolvedValue([])
    tx.card.findMany
      .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', deletedAt: null, updatedAt: new Date('2026-10-01'), sprintId: null }])
      .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', description: '', updatedAt: new Date('2026-10-01'), sprintId: null }])
    const r = await sincronizarEapComSprint('p1', 't1')
    expect(r).toMatchObject({ sprintsCriadas: 1, cardsMovidos: 1, nosRemovidos: 0 })
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { sprintId: 's-nova', sprintColumnId: 'cAFazer', sprintPosition: 5 } })
    expect(tx.wbsNode.delete).not.toHaveBeenCalled()
  })

  it('sem raiz (EAP ainda não criada) não cria nada', async () => {
    tx.wbsNode.findMany.mockResolvedValueOnce([])
    expect(await sincronizarEapComSprint('p1', 't1')).toEqual(ZERO)
    expect(tx.card.create).not.toHaveBeenCalled()
  })

  describe('Elaborado por = responsáveis do card (ADR-044)', () => {
    const arvore = (props: object) => {
      tx.wbsNode.findMany.mockResolvedValueOnce([
        node('r', null, 'Projeto'), node('ns', 'r', 'Sprint 1', { sprintId: 's1' }),
        node('n1', 'ns', 'Tarefa', { cardId: 'c1', ...props }),
      ]).mockResolvedValue([])
      tx.sprint.findMany.mockResolvedValue([sprint('s1', 'Sprint 1')])
      tx.card.findMany
        .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', deletedAt: null, updatedAt: new Date('2026-09-01'), sprintId: 's1' }])
        .mockResolvedValueOnce([{ id: 'c1', title: 'Tarefa', description: '', updatedAt: new Date('2026-09-01'), sprintId: 's1' }])
      tx.user.findMany.mockResolvedValue([{ id: 'ana', name: 'Ana' }, { id: 'bia', name: 'Bia' }])
    }
    const propsGravadas = () => tx.wbsNode.update.mock.calls.find(c => c[0].where.id === 'n1' && c[0].data.properties)?.[0].data.properties

    it('primeira vez: junta elaborador antigo e responsáveis, e põe no card quem faltava', async () => {
      arvore({ elaboradoPorUserId: 'ana' })
      tx.cardResponsible.findMany.mockResolvedValue([{ cardId: 'c1', userId: 'bia' }])
      const r = await sincronizarEapComSprint('p1', 't1')
      expect(tx.cardResponsible.createMany).toHaveBeenCalledWith({ data: [{ cardId: 'c1', userId: 'ana' }], skipDuplicates: true })
      expect(propsGravadas()).toMatchObject({ elaboradoPorUserIds: ['bia', 'ana'], elaboradoPorUserId: 'bia', elaboradoPor: 'Bia, Ana', elaboradoSincronizado: true })
      expect(r.elaboradoresSincronizados).toBe(1)
    })

    it('depois de sincronizado o card manda: quem saiu do card sai do Elaborado por', async () => {
      arvore({ elaboradoPorUserIds: ['ana', 'bia'], elaboradoPor: 'Ana, Bia', elaboradoSincronizado: true })
      tx.cardResponsible.findMany.mockResolvedValue([{ cardId: 'c1', userId: 'bia' }])
      await sincronizarEapComSprint('p1', 't1')
      expect(tx.cardResponsible.createMany).not.toHaveBeenCalled()
      expect(propsGravadas()).toMatchObject({ elaboradoPorUserIds: ['bia'], elaboradoPor: 'Bia' })
    })

    it('ninguém dos dois lados: não grava nada', async () => {
      arvore({})
      tx.cardResponsible.findMany.mockResolvedValue([])
      const r = await sincronizarEapComSprint('p1', 't1')
      expect(r).toEqual(ZERO)
      expect(propsGravadas()).toBeUndefined()
    })
  })
})

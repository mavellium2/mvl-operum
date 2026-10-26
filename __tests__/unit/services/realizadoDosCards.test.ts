// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/prisma'
import { aplicarRealizadoDosCards } from '@/services/realizadoDosCards'
import { getTree } from '@/services/wbsService'
import { computarPlanilhaCustos } from '@/lib/planilhaCustos'
import { computeFinancialRollups } from '@/lib/wbsRollup'
import { computePlanilha } from '@/lib/custosCalc'
import { WbsNodePropertiesSchema } from '@/lib/validation/wbsSchemas'
import { minutosRealizados } from '@/lib/tempoRealizado'
import type { WbsNodeClient } from '@/types/wbs'

vi.mock('@/lib/prisma', () => ({ default: {
  card: { findMany: vi.fn().mockResolvedValue([]) }, timeEntry: { groupBy: vi.fn() }, wbsNode: { findMany: vi.fn() },
  $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
} }))
const n = (id: string, parentId: string | null, childrenIds: string[], properties: WbsNodeClient['properties'] = {}): WbsNodeClient => ({
  id, parentId, childrenIds, properties, order: 0, code: id, title: id, layout: 'LADO_A_LADO', collapsed: false,
  style: { backgroundColor: '#fff', borderColor: '#000', textColor: '#000', borderWidth: 1, fontSize: 12, borderRadius: 0 },
})
const fixture = () => ({
  root: n('root', null, ['fase']), fase: n('fase', 'root', ['a', 'b']),
  a: n('a', 'fase', [], { cardId: 'c1', tempoMinutos: 120, tempoRealMinutos: 999, materiaisReal: 5, elaboradoPorUserId: 'u1' }),
  b: n('b', 'fase', [], { cardId: 'c2', tempoRealMinutos: 15 }),
})
const aggregate = vi.mocked(prisma.timeEntry.groupBy)
function responses(seconds: number | null) {
  aggregate.mockResolvedValueOnce([{ cardId: 'c1', _count: { _all: 2 } }] as never)
  aggregate.mockResolvedValueOnce(seconds === null ? [] : [{ cardId: 'c1', _sum: { duration: seconds } }] as never)
}
beforeEach(() => { vi.clearAllMocks(); aggregate.mockReset(); vi.mocked(prisma.card.findMany).mockResolvedValue([]) })

describe('apontamentos → realizado da planilha/EAP', () => {
  it('1h30 registrada substitui o manual, calcula custo e preserva orçamento/materiais', async () => {
    const original = fixture(); responses(5400)
    const nodes = await aplicarRealizadoDosCards(original, 'p1', 't1')
    const sheet = computarPlanilhaCustos(nodes, 'root', { valorReferencia: 4000, horasPorDia: 8 },
      new Map([['u1', { userId: 'u1', name: 'Ana', remuneracao: 14400, horasDiarias: 8 }]]))
    expect(sheet.macrofases[0].atividades[0]).toMatchObject({ minReal: 90, totalReal: 95, minOrcado: 120, materiaisReal: 5, tempoRealDosCards: true })
    expect(sheet.macrofases[0].atividades[1]).toMatchObject({ minReal: 15, tempoRealDosCards: false })
    expect(computeFinancialRollups(nodes, 'root', { u1: 1 }).a).toMatchObject({ actualHours: 1.5, actualCost: 95 })
    expect(computePlanilha(nodes, 'root', { valorPorMinuto: 1, horasPorDia: 8 }).rows.find(row => row.id === 'a')?.custoReal).toBe(95)
    expect(original.a.properties).toMatchObject({ tempoRealMinutos: 999, tempoMinutos: 120, materiaisReal: 5 })
    expect(original.a.properties.tempoRealApontadoSegundos).toBeUndefined()
  })
  it('editar o apontamento recalcula a leitura, sem acumular o resultado anterior', async () => {
    responses(3600)
    const first = await aplicarRealizadoDosCards(fixture(), 'p1', 't1')
    responses(1800)
    const second = await aplicarRealizadoDosCards(first, 'p1', 't1')
    expect(minutosRealizados(first.a.properties)).toBe(60)
    expect(minutosRealizados(second.a.properties)).toBe(30)
  })
  it('excluir o último registro zera o tempo, sem ressuscitar os 999 minutos manuais', async () => {
    responses(null)
    const nodes = await aplicarRealizadoDosCards(fixture(), 'p1', 't1')
    expect(minutosRealizados(nodes.a.properties)).toBe(0)
    expect(nodes.a.properties.tempoRealMinutos).toBe(999)
  })
  it('sem registros encerrados mantém o realizado manual (inclusive timer só em curso)', async () => {
    aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const nodes = await aplicarRealizadoDosCards(fixture(), 'p1', 't1')
    expect(minutosRealizados(nodes.a.properties)).toBe(999)
    expect(nodes.a.properties.tempoRealApontadoSegundos).toBeUndefined()
  })
  it('preserva segundos somados sem arredondar individualmente os apontamentos', async () => {
    responses(58)
    const nodes = await aplicarRealizadoDosCards(fixture(), 'p1', 't1')
    expect(minutosRealizados(nodes.a.properties)).toBeCloseTo(58 / 60)
  })
  it('filtra card/projeto/instituição e autores; ignora ativos e removidos na soma', async () => {
    responses(60)
    await aplicarRealizadoDosCards(fixture(), 'p1', 't1')
    const history = aggregate.mock.calls[0][0]!, totals = aggregate.mock.calls[1][0]!
    expect(history.where).toMatchObject({ cardId: { in: ['c1', 'c2'] }, isRunning: false, endedAt: { not: null }, user: { tenantId: 't1' }, card: { deletedAt: null, OR: [
      { sprintId: null, projectId: 'p1', project: { tenantId: 't1', deletedAt: null } },
      { sprint: { projectId: 'p1', deletedAt: null, project: { tenantId: 't1', deletedAt: null } } },
    ] } })
    expect(history.where).not.toHaveProperty('deletedAt')
    expect(totals.where).toMatchObject({ deletedAt: null, duration: { gte: 0 } })
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: 'RepeatableRead' })
  })
  it('getTree entrega a mesma projeção a todos os consumidores e ela não entra no schema salvo', async () => {
    vi.mocked(prisma.wbsNode.findMany).mockResolvedValue(Object.values(fixture()).map(node => ({ ...node, version: 1 })) as never)
    responses(7200)
    const tree = await getTree('p1', 't1')
    expect(minutosRealizados(tree.nodes.a.properties)).toBe(120)
    expect(WbsNodePropertiesSchema.parse(tree.nodes.a.properties)).not.toHaveProperty('tempoRealApontadoSegundos')
  })
  it('não consulta apontamentos quando a EAP não tem folhas vinculadas', async () => {
    const nodes = { root: n('root', null, []) }
    expect(await aplicarRealizadoDosCards(nodes, 'p1', 't1')).toBe(nodes)
    expect(aggregate).not.toHaveBeenCalled()
  })
})

describe('conclusão na sprint → data realizada, sem inventar esforço ou gasto', () => {
  const card = (columnId = 'done', at = '2026-10-27T01:30:00Z') => ({
    id: 'c1', sprintColumnId: columnId,
    sprint: { sprintColumns: [{ id: 'todo', title: 'A Fazer', position: 0 }, { id: 'done', title: 'Concluído', position: 1 }] },
    movements: [{ fromColumnId: 'todo', toColumnId: columnId, movedAt: new Date(at) }],
  })
  it('usa a data do movimento em São Paulo, inclusive em cards concluídos antes da correção', async () => {
    responses(null); vi.mocked(prisma.card.findMany).mockResolvedValue([card()] as never)
    const original = fixture()
    const nodes = await aplicarRealizadoDosCards(original, 'p1', 't1')
    const sheet = computarPlanilhaCustos(nodes, 'root', { valorReferencia: 4000, horasPorDia: 8 })
    expect(sheet.macrofases[0].atividades[0]).toMatchObject({ dataRealizacao: '2026-10-26', materiaisReal: 5, minReal: 0 })
    expect(original.a.properties.dataRealizacaoCard).toBeUndefined()
    expect(computeFinancialRollups(nodes, 'root', {}).a.dataRealizacao).toBe('2026-10-26')
    expect(vi.mocked(prisma.card.findMany).mock.calls.at(-1)![0]).toMatchObject({ where: { sprint: { projectId: 'p1', project: { tenantId: 't1' } } } })
    // Saving the EAP never persists a projected date as an explicit completion.
    expect(WbsNodePropertiesSchema.parse(nodes.a.properties)).not.toHaveProperty('dataRealizacaoCard')
  })
  it('preserva uma data informada explicitamente na planilha', async () => {
    responses(null); vi.mocked(prisma.card.findMany).mockResolvedValue([card()] as never)
    const original = fixture(); original.a.properties.dataRealizacao = '2026-10-23'
    const nodes = await aplicarRealizadoDosCards(original, 'p1', 't1')
    expect(computarPlanilhaCustos(nodes, 'root', { valorReferencia: 4000, horasPorDia: 8 }).macrofases[0].atividades[0].dataRealizacao).toBe('2026-10-23')
  })
  it('reabrir remove a data automática e concluir novamente usa o novo movimento', async () => {
    responses(null); vi.mocked(prisma.card.findMany).mockResolvedValue([card()] as never)
    const first = await aplicarRealizadoDosCards(fixture(), 'p1', 't1')
    responses(null); vi.mocked(prisma.card.findMany).mockResolvedValue([card('todo')] as never)
    const reopened = await aplicarRealizadoDosCards(first, 'p1', 't1')
    expect(reopened.a.properties.dataRealizacaoCard).toBeNull()
    responses(null); vi.mocked(prisma.card.findMany).mockResolvedValue([card('done', '2026-10-28T12:00:00Z')] as never)
    const finished = await aplicarRealizadoDosCards(reopened, 'p1', 't1')
    expect(finished.a.properties.dataRealizacaoCard).toBe('2026-10-28')
  })
  it('não estima data sem movimento de conclusão nem usa updatedAt', async () => {
    responses(null); vi.mocked(prisma.card.findMany).mockResolvedValue([{ ...card(), movements: [] }] as never)
    expect((await aplicarRealizadoDosCards(fixture(), 'p1', 't1')).a.properties.dataRealizacaoCard).toBeNull()
  })
})

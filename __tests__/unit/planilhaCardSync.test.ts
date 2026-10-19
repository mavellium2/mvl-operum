// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  wbsNode: { findMany: vi.fn() },
  card: { findFirst: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
  sprintColumn: { findFirst: vi.fn() }, cardMovement: { create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) } }))
import { concluidaNaPlanilha, diaDaPlanilha, sincronizarCardsDaPlanilha } from '@/services/planilhaCardSync'

beforeEach(() => {
  vi.clearAllMocks()
  tx.wbsNode.findMany.mockResolvedValue([{ properties: { cardId: 'c', dataPrevista: '2026-10-20', dataRealizacao: '2026-10-19' } }])
  tx.card.findFirst.mockResolvedValue({ id: 'c', sprintId: 's', sprintColumnId: 'todo', sprintColumn: { title: 'A Fazer' }, endDate: null, responsibles: [{ userId: 'u' }] })
  tx.sprintColumn.findFirst.mockResolvedValue({ id: 'done', title: 'Concluído' })
  tx.card.aggregate.mockResolvedValue({ _max: { sprintPosition: 4 } })
})
describe('Planilha de Custos → cards', () => {
  it('conclusão exige data válida ou percentual explícito; tempo gasto sozinho não conclui', () => {
    expect(concluidaNaPlanilha({ tempoRealMinutos: 120 })).toBe(false)
    expect(concluidaNaPlanilha({ dataRealizacao: '2026-02-30' })).toBe(false)
    expect(concluidaNaPlanilha({ percentualConclusao: 100 })).toBe(true)
    expect(diaDaPlanilha('2026-10-19')).toBe('2026-10-19')
  })
  it('atualiza prazo e coluna com histórico, sem fabricar lançamentos de tempo', async () => {
    expect(await sincronizarCardsDaPlanilha('p', 't')).toEqual({ updated: 1 })
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { endDate: new Date('2026-10-20T00:00:00-03:00'), sprintColumnId: 'done', sprintPosition: 5 } })
    expect(tx.cardMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromColumnId: 'todo', toColumnId: 'done' }) })
    expect(tx.card.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sprint: expect.objectContaining({ projectId: 'p', project: { tenantId: 't' } }) }) }))
  })
  it('repetir a leitura de um card já sincronizado não grava nem duplica histórico', async () => {
    tx.card.findFirst.mockResolvedValue({ id: 'c', sprintId: 's', sprintColumnId: 'done', endDate: new Date('2026-10-20T00:00:00-03:00'), responsibles: [{ userId: 'u' }] })
    expect(await sincronizarCardsDaPlanilha('p', 't')).toEqual({ updated: 0 })
    expect(tx.cardMovement.create).not.toHaveBeenCalled()
    expect(tx.card.update).not.toHaveBeenCalled()
  })
  it('vínculo inexistente ou de outro tenant não altera nenhum card', async () => {
    tx.card.findFirst.mockResolvedValue(null)
    expect(await sincronizarCardsDaPlanilha('p', 't')).toEqual({ updated: 0 })
    expect(tx.card.update).not.toHaveBeenCalled()
  })
  it('sem responsável ativo só sincroniza o prazo, preservando a regra do quadro', async () => {
    tx.card.findFirst.mockResolvedValue({ id: 'c', sprintId: 's', sprintColumnId: 'todo', endDate: null, responsibles: [] })
    await sincronizarCardsDaPlanilha('p', 't')
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { endDate: new Date('2026-10-20T00:00:00-03:00') } })
    expect(tx.cardMovement.create).not.toHaveBeenCalled()
  })
})

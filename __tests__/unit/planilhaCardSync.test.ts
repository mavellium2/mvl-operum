// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const tx = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  wbsNode: { findMany: vi.fn() },
  card: { findMany: vi.fn(), update: vi.fn(), aggregate: vi.fn() },
  sprintColumn: { findMany: vi.fn() },
  cardMovement: { create: vi.fn(), findMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: (fn: (db: typeof tx) => unknown) => fn(tx) } }))
import {
  concluidaNaPlanilha, chaveDaConclusao, decidirConclusao, diaDaPlanilha, sincronizarCardsDaPlanilha,
  MOTIVO_CONCLUSAO, MOTIVO_REABERTURA,
} from '@/services/planilhaCardSync'
import { colunaDeConclusao } from '@/lib/cardUtils'

const COLUNAS = [
  { id: 'todo', title: 'A Fazer', position: 0 },
  { id: 'doing', title: 'Em andamento', position: 1 },
  { id: 'test', title: 'Em teste', position: 2 },
  { id: 'done', title: 'Concluído', position: 3 },
]
const cardEm = (coluna: string, extra: Record<string, unknown> = {}) => ({
  id: 'c', sprintId: 's', sprintColumnId: coluna, sprintColumn: { title: COLUNAS.find(c => c.id === coluna)?.title },
  endDate: new Date('2026-10-20T00:00:00-03:00'), responsibles: [{ userId: 'u' }], ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  tx.wbsNode.findMany.mockResolvedValue([{ properties: { cardId: 'c', dataPrevista: '2026-10-20', dataRealizacao: '2026-10-19' } }])
  tx.card.findMany.mockResolvedValue([{ ...cardEm('todo'), endDate: null }])
  tx.sprintColumn.findMany.mockResolvedValue(COLUNAS)
  tx.cardMovement.findMany.mockResolvedValue([])
  tx.card.aggregate.mockResolvedValue({ _max: { sprintPosition: 4 } })
})

describe('Planilha de Custos → cards', () => {
  it('conclusão exige data válida ou percentual explícito; tempo gasto sozinho não conclui', () => {
    expect(concluidaNaPlanilha({ tempoRealMinutos: 120 })).toBe(false)
    expect(concluidaNaPlanilha({ dataRealizacao: '2026-02-30' })).toBe(false)
    expect(concluidaNaPlanilha({ percentualConclusao: 100 })).toBe(true)
    expect(diaDaPlanilha('2026-10-19')).toBe('2026-10-19')
    expect(chaveDaConclusao({ dataRealizacao: '2026-10-19', percentualConclusao: 100 })).toBe('data:2026-10-19')
    expect(chaveDaConclusao({ percentualConclusao: 100 })).toBe('pct:100')
  })

  it('atualiza prazo e coluna com histórico (com a chave da conclusão), sem fabricar lançamentos de tempo', async () => {
    expect(await sincronizarCardsDaPlanilha('p', 't')).toMatchObject({ updated: 1 })
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { endDate: new Date('2026-10-20T00:00:00-03:00'), sprintColumnId: 'done', sprintPosition: 5 } })
    expect(tx.cardMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromColumnId: 'todo', toColumnId: 'done', reason: `${MOTIVO_CONCLUSAO} [data:2026-10-19]` }) })
    expect(tx.card.findMany).toHaveBeenCalledTimes(1)
    expect(tx.card.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { in: ['c'] }, sprint: expect.objectContaining({ projectId: 'p', project: { tenantId: 't' } }) }) }))
  })

  it('repetir a leitura de um card já sincronizado não grava nem duplica histórico', async () => {
    tx.card.findMany.mockResolvedValue([cardEm('done')])
    expect(await sincronizarCardsDaPlanilha('p', 't')).toMatchObject({ updated: 0 })
    expect(tx.cardMovement.create).not.toHaveBeenCalled()
    expect(tx.card.update).not.toHaveBeenCalled()
  })

  it('vínculo inexistente ou de outro tenant não altera nenhum card', async () => {
    tx.card.findMany.mockResolvedValue([])
    expect(await sincronizarCardsDaPlanilha('p', 't')).toMatchObject({ updated: 0 })
    expect(tx.card.update).not.toHaveBeenCalled()
  })

  it('sem responsável ativo só sincroniza o prazo, preservando a regra do quadro', async () => {
    tx.card.findMany.mockResolvedValue([{ ...cardEm('todo'), endDate: null, responsibles: [] }])
    expect(await sincronizarCardsDaPlanilha('p', 't')).toMatchObject({ semResponsavel: 1 })
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { endDate: new Date('2026-10-20T00:00:00-03:00') } })
    expect(tx.cardMovement.create).not.toHaveBeenCalled()
  })
})

describe('coluna de conclusão renomeada', () => {
  it('reconhece nomes de conclusão e, sem nenhum, usa a última coluna', () => {
    expect(colunaDeConclusao([{ title: 'A Fazer', position: 0 }, { title: 'Entregue', position: 1 }, { title: 'Arquivo', position: 2 }])?.title).toBe('Entregue')
    expect(colunaDeConclusao([{ title: 'Backlog', position: 1 }, { title: 'Pronto pra ir', position: 5 }, { title: 'Fazendo', position: 2 }])?.title).toBe('Pronto pra ir')
    expect(colunaDeConclusao([])).toBeNull()
  })

  it('conclui na coluna renomeada', async () => {
    tx.sprintColumn.findMany.mockResolvedValue([{ id: 'todo', title: 'A Fazer', position: 0 }, { id: 'ok', title: 'Finalizado ✓', position: 1 }])
    await sincronizarCardsDaPlanilha('p', 't')
    expect(tx.card.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sprintColumnId: 'ok' }) }))
  })

  it('sprint sem colunas: não quebra e conta a pendência', async () => {
    tx.sprintColumn.findMany.mockResolvedValue([])
    expect(await sincronizarCardsDaPlanilha('p', 't')).toMatchObject({ semColunaDeConclusao: 1 })
    expect(tx.cardMovement.create).not.toHaveBeenCalled()
  })
})

describe('reabertura e origem da conclusão', () => {
  const conclusaoDaPlanilha = (chave: string, de = 'test') => ({ reason: `${MOTIVO_CONCLUSAO} [${chave}]`, toColumnId: 'done', fromColumnId: de })
  const manual = (para: string, de: string) => ({ reason: null, toColumnId: para, fromColumnId: de })

  it('retirar a conclusão na planilha reabre o card concluído por ela, de volta à coluna de origem', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ properties: { cardId: 'c', dataPrevista: '2026-10-20', dataRealizacao: null } }])
    tx.card.findMany.mockResolvedValue([cardEm('done')])
    tx.cardMovement.findMany.mockResolvedValue([conclusaoDaPlanilha('data:2026-10-19', 'test')])
    expect(await sincronizarCardsDaPlanilha('p', 't')).toMatchObject({ reabertos: 1, updated: 1 })
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { sprintColumnId: 'test', sprintPosition: 5 } })
    expect(tx.cardMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ fromColumnId: 'done', toColumnId: 'test', reason: MOTIVO_REABERTURA }) })
  })

  it('conclusão manual não é desfeita pela planilha', () => {
    expect(decidirConclusao({ chave: null, naConclusao: true, conclusaoId: 'done', movimentos: [manual('done', 'test'), conclusaoDaPlanilha('pct:100')] })).toEqual({ acao: 'nada' })
    expect(decidirConclusao({ chave: null, naConclusao: true, conclusaoId: 'done', movimentos: [] })).toEqual({ acao: 'nada' })
  })

  it('card reaberto à mão com a mesma conclusão na planilha não volta para Concluído', async () => {
    tx.card.findMany.mockResolvedValue([cardEm('doing')])
    tx.cardMovement.findMany.mockResolvedValue([manual('doing', 'done'), conclusaoDaPlanilha('data:2026-10-19')])
    expect(await sincronizarCardsDaPlanilha('p', 't')).toMatchObject({ mantidosManual: 1, updated: 0 })
    expect(tx.cardMovement.create).not.toHaveBeenCalled()
  })

  it('uma conclusão diferente (nova data) vale de novo', () => {
    expect(decidirConclusao({ chave: 'data:2026-10-25', naConclusao: false, conclusaoId: 'done', movimentos: [manual('doing', 'done'), conclusaoDaPlanilha('data:2026-10-19')] })).toEqual({ acao: 'concluir' })
  })

  it('concluir de novo depois de retirada vale', () => {
    expect(decidirConclusao({ chave: 'data:2026-10-19', naConclusao: false, conclusaoId: 'done', movimentos: [{ reason: MOTIVO_REABERTURA, toColumnId: 'test', fromColumnId: 'done' }, conclusaoDaPlanilha('data:2026-10-19')] })).toEqual({ acao: 'concluir' })
  })

  it('coluna de origem excluída: reabre na coluna anterior à de conclusão', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ properties: { cardId: 'c', percentualConclusao: 50 } }])
    tx.card.findMany.mockResolvedValue([cardEm('done')])
    tx.cardMovement.findMany.mockResolvedValue([conclusaoDaPlanilha('pct:100', 'coluna-apagada')])
    await sincronizarCardsDaPlanilha('p', 't')
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'c' }, data: { sprintColumnId: 'test', sprintPosition: 5 } })
  })

  it('reabrir não mexe em responsáveis e repetir não duplica', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ properties: { cardId: 'c' } }])
    tx.card.findMany.mockResolvedValue([cardEm('test')])
    tx.cardMovement.findMany.mockResolvedValue([{ reason: MOTIVO_REABERTURA, toColumnId: 'test', fromColumnId: 'done' }, conclusaoDaPlanilha('pct:100')])
    expect(await sincronizarCardsDaPlanilha('p', 't')).toMatchObject({ updated: 0, reabertos: 0 })
    expect(tx.card.update).not.toHaveBeenCalled()
  })
})

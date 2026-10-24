// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = vi.hoisted(() => ({
  wbsNode: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
  card: { updateMany: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(), update: vi.fn(), count: vi.fn() },
  sprint: { findMany: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
  timeEntry: { aggregate: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: vi.fn() }))
import { registrarAcao } from '@/services/auditoriaService'

import { saveTree } from '@/services/wbsService'
import type { WbsNodeClient } from '@/types/wbs'

const n = (id: string, parentId: string | null, childrenIds: string[], properties: Record<string, unknown> = {}): WbsNodeClient =>
  ({ id, parentId, order: 0, code: '', title: id, layout: 'LADO_A_LADO', collapsed: false, style: {} as never, properties, childrenIds })

beforeEach(() => {
  vi.resetAllMocks()
  tx.wbsNode.findFirst.mockResolvedValue({ version: 3 })
  tx.sprint.findMany.mockResolvedValue([])
  tx.card.findMany.mockResolvedValue([])
  tx.card.aggregate.mockResolvedValue({ _max: { position: 4 } })
  tx.sprint.findFirst.mockResolvedValue({ id: 's1', name: '1.2 Fase 2', projectId: 'p1', status: 'ACTIVE' })
  tx.card.count.mockResolvedValue(0)
  tx.timeEntry.aggregate.mockResolvedValue({ _sum: { duration: 0 } })
})

const salvar = (nodes: Record<string, WbsNodeClient>, refletirExclusoes = true, motivoExclusao?: string, preservar?: string[]) =>
  saveTree({ projectId: 'p1', tenantId: 't1', serverVersion: 3, rootId: 'r', nodes }, 'u1', { refletirExclusoes, motivoExclusao, preservar })

describe('excluir na EAP exclui do lado da sprint', () => {
  it('nó de card removido no editor exclui o card', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ id: 'r', properties: {} }, { id: 'a', properties: { cardId: 'c1' } }])
    expect(await salvar({ r: n('r', null, []) })).toMatchObject({ ok: true })
    expect(tx.card.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1'] }, deletedAt: null, OR: [{ projectId: 'p1' }, { sprint: { projectId: 'p1' } }] },
      data: { deletedAt: expect.any(Date) },
    })
  })

  it('recortar e colar (id novo, mesmo card) não exclui o card', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ id: 'r', properties: {} }, { id: 'a', properties: { cardId: 'c1' } }])
    tx.card.findMany.mockResolvedValue([{ id: 'c1' }])
    await salvar({ r: n('r', null, ['a2']), a2: n('a2', 'r', [], { cardId: 'c1' }) })
    expect(tx.card.updateMany).not.toHaveBeenCalled()
  })

  it('vínculo com card de outro projeto é descartado ao salvar', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ id: 'r', properties: {} }])
    tx.card.findMany.mockResolvedValue([])
    await salvar({ r: n('r', null, ['a']), a: n('a', 'r', [], { cardId: 'c-de-outra-instituicao', tempoMinutos: 30 }) })
    expect(tx.card.findMany).toHaveBeenCalledWith({ where: { id: { in: ['c-de-outra-instituicao'] }, OR: [{ projectId: 'p1' }, { sprint: { projectId: 'p1' } }] }, select: { id: true } })
    const gravados = tx.wbsNode.createMany.mock.calls[0][0].data as { id: string; properties: Record<string, unknown> }[]
    expect(gravados.find(g => g.id === 'a')!.properties).toEqual({ tempoMinutos: 30 })
  })

  it('fase removida exclui a sprint e manda os cards que sobraram para o fim do backlog', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ id: 'r', properties: {} }, { id: 'f', properties: { sprintId: 's1' } }])
    tx.sprint.findMany.mockResolvedValue([{ id: 's1' }])
    tx.card.findMany.mockResolvedValue([{ id: 'cx' }])
    await salvar({ r: n('r', null, []) })
    expect(tx.card.update).toHaveBeenCalledWith({ where: { id: 'cx' }, data: { projectId: 'p1', sprintId: null, sprintColumnId: null, sprintPosition: null, position: 5 } })
    expect(tx.sprint.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { deletedAt: expect.any(Date) } })
  })

  it('fase cuja sprint tem dados só é excluída com motivo, e o histórico guarda o motivo e o resumo', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ id: 'r', properties: {} }, { id: 'f', properties: { sprintId: 's1' } }])
    tx.sprint.findMany.mockResolvedValue([{ id: 's1' }])
    tx.card.count.mockResolvedValue(3)
    tx.timeEntry.aggregate.mockResolvedValue({ _sum: { duration: 7200 } })
    await expect(salvar({ r: n('r', null, []) })).rejects.toThrow(/motivo/)
    expect(tx.sprint.update).not.toHaveBeenCalled()
    await salvar({ r: n('r', null, []) }, true, 'Fase cancelada pelo cliente')
    expect(tx.sprint.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { deletedAt: expect.any(Date) } })
    expect(registrarAcao).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE', entity: 'Sprint', entityId: 's1', userId: 'u1',
      details: expect.objectContaining({ motivo: 'Fase cancelada pelo cliente', origem: 'eap', resumo: { cards: 3, segundosRegistrados: 7200, status: 'ACTIVE' } }),
    }), tx)
  })

  it('item recortado e ainda não colado não exclui o card', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ id: 'r', properties: {} }, { id: 'a', properties: { cardId: 'c1' } }])
    await salvar({ r: n('r', null, []) }, true, undefined, ['c1'])
    expect(tx.card.updateMany).not.toHaveBeenCalled()
  })

  it('importação (sem refletirExclusoes) nunca exclui cards', async () => {
    tx.wbsNode.findMany.mockResolvedValue([{ id: 'a', properties: { cardId: 'c1' } }])
    await salvar({ r: n('r', null, []) }, false)
    expect(tx.card.updateMany).not.toHaveBeenCalled()
  })

  it('conflito de versão não exclui nada', async () => {
    tx.wbsNode.findFirst.mockResolvedValue({ version: 9 })
    expect(await salvar({ r: n('r', null, []) })).toEqual({ ok: false, reason: 'CONFLICT' })
    expect(tx.card.updateMany).not.toHaveBeenCalled()
    expect(tx.wbsNode.deleteMany).not.toHaveBeenCalled()
  })
})

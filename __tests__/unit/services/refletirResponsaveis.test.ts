// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = vi.hoisted(() => ({
  wbsNode: { findFirst: vi.fn(), update: vi.fn() },
  card: { findUnique: vi.fn() },
  cardResponsible: { findMany: vi.fn() },
  wbsTree: { upsert: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: vi.fn() }))

import { refletirResponsaveisNoNo } from '@/services/wbsService'

beforeEach(() => {
  vi.resetAllMocks()
  tx.wbsNode.update.mockResolvedValue({ version: 3 })
  tx.card.findUnique.mockResolvedValue({ projectId: 'p1', sprint: null })
})

describe('refletirResponsaveisNoNo', () => {
  it('nó ligado ao card passa a ter os responsáveis em Elaborado por', async () => {
    tx.wbsNode.findFirst.mockResolvedValueOnce({ id: 'n1', projectId: 'p1', tenantId: 't1', properties: { cardId: 'c1', tempoMinutos: 30 } })
      .mockResolvedValue({ id: 'r', version: 2 })
    tx.cardResponsible.findMany.mockResolvedValue([{ userId: 'ana', user: { name: 'Ana' } }, { userId: 'bia', user: { name: 'Bia' } }])
    expect(await refletirResponsaveisNoNo('c1')).toBe(true)
    expect(tx.wbsNode.findFirst.mock.calls[0][0].where).toEqual({ projectId: 'p1', properties: { path: ['cardId'], equals: 'c1' } })
    expect(tx.wbsNode.update.mock.calls[0][0]).toEqual({ where: { id: 'n1' }, data: { properties: {
      cardId: 'c1', tempoMinutos: 30, elaboradoPorUserIds: ['ana', 'bia'], elaboradoPorUserId: 'ana', elaboradoPor: 'Ana, Bia', elaboradoSincronizado: true,
    } } })
  })

  it('busca o nó só no projeto do card (nó de outro projeto apontando para ele não recebe nomes)', async () => {
    tx.card.findUnique.mockResolvedValue({ projectId: null, sprint: { projectId: 'p-do-card' } })
    tx.wbsNode.findFirst.mockResolvedValue(null)
    expect(await refletirResponsaveisNoNo('c1')).toBe(false)
    expect(tx.wbsNode.findFirst.mock.calls[0][0].where).toMatchObject({ projectId: 'p-do-card' })
    expect(tx.cardResponsible.findMany).not.toHaveBeenCalled()
  })

  it('card inexistente: nada a fazer', async () => {
    tx.card.findUnique.mockResolvedValue(null)
    expect(await refletirResponsaveisNoNo('c-x')).toBe(false)
    expect(tx.wbsNode.findFirst).not.toHaveBeenCalled()
  })

  it('card sem nó na EAP: nada a fazer', async () => {
    tx.wbsNode.findFirst.mockResolvedValue(null)
    expect(await refletirResponsaveisNoNo('c9')).toBe(false)
    expect(tx.wbsNode.update).not.toHaveBeenCalled()
  })

  it('já igual: não grava nem muda a versão', async () => {
    tx.wbsNode.findFirst.mockResolvedValueOnce({ id: 'n1', projectId: 'p1', tenantId: 't1', properties: { cardId: 'c1', elaboradoPorUserIds: ['ana'], elaboradoPor: 'Ana', elaboradoSincronizado: true } })
    tx.cardResponsible.findMany.mockResolvedValue([{ userId: 'ana', user: { name: 'Ana' } }])
    expect(await refletirResponsaveisNoNo('c1')).toBe(true)
    expect(tx.wbsNode.update).not.toHaveBeenCalled()
  })
})

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  default: {
    card: { findFirst: vi.fn() },
    project: { findFirst: vi.fn(), update: vi.fn() },
  },
}))

import prisma from '@/lib/prisma'
import { primeiraDataDeTarefa, sincronizarInicioDoProjeto, sincronizarInicioPeloCard } from '@/services/inicioDoProjeto'

beforeEach(() => vi.clearAllMocks())

describe('início do projeto pela primeira tarefa', () => {
  it('busca a menor data de início entre os cards ativos do projeto, no tenant', async () => {
    vi.mocked(prisma.card.findFirst).mockResolvedValue({ startDate: new Date('2026-03-02T00:00:00Z') } as never)
    expect(await primeiraDataDeTarefa('p1', 't1')).toEqual(new Date('2026-03-02T00:00:00Z'))
    expect(prisma.card.findFirst).toHaveBeenCalledWith({
      where: { projectId: 'p1', deletedAt: null, startDate: { not: null }, project: { id: 'p1', tenantId: 't1' } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    })
  })

  it('grava a data da primeira tarefa quando ela muda', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ startDate: new Date('2026-02-10T00:00:00Z') } as never)
    vi.mocked(prisma.card.findFirst).mockResolvedValue({ startDate: new Date('2026-03-02T00:00:00Z') } as never)
    await sincronizarInicioDoProjeto('p1', 't1')
    expect(prisma.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { startDate: new Date('2026-03-02T00:00:00Z') } })
  })

  it('mesma data: não grava de novo', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ startDate: new Date('2026-03-02T00:00:00Z') } as never)
    vi.mocked(prisma.card.findFirst).mockResolvedValue({ startDate: new Date('2026-03-02T15:00:00Z') } as never)
    await sincronizarInicioDoProjeto('p1', 't1')
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it('sem nenhuma tarefa com data, mantém a data informada (não inventa)', async () => {
    vi.mocked(prisma.project.findFirst).mockResolvedValue({ startDate: new Date('2026-02-10T00:00:00Z') } as never)
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null)
    expect(await sincronizarInicioDoProjeto('p1', 't1')).toEqual(new Date('2026-02-10T00:00:00Z'))
    expect(prisma.project.update).not.toHaveBeenCalled()
  })

  it('falha ao recalcular não quebra a alteração do card', async () => {
    vi.mocked(prisma.card.findFirst).mockRejectedValue(new Error('db'))
    await expect(sincronizarInicioPeloCard('c1', 't1')).resolves.toBeUndefined()
  })
})

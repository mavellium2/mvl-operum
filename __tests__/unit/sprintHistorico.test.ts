// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const db = vi.hoisted(() => ({
  sprint: { findFirst: vi.fn() },
  card: { count: vi.fn() },
  timeEntry: { aggregate: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: db }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: vi.fn() }))
vi.mock('@/services/wbsService', () => ({ sincronizarEapComSprint: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u1', tenantId: 't1' }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/api-client', () => ({ sprintsApi: { delete: vi.fn(), update: vi.fn(), create: vi.fn() } }))

import { diferencasSprint, sprintTemDados } from '@/services/sprintHistoricoService'
import { deleteSprintAction } from '@/app/actions/sprints'
import { sprintsApi } from '@/lib/api-client'
import { registrarAcao } from '@/services/auditoriaService'
import { sincronizarEapComSprint } from '@/services/wbsService'

beforeEach(() => {
  vi.clearAllMocks()
  db.sprint.findFirst.mockResolvedValue({ id: 's1', name: 'Sprint 1', projectId: 'p1', status: 'ACTIVE' })
  db.card.count.mockResolvedValue(0)
  db.timeEntry.aggregate.mockResolvedValue({ _sum: { duration: 0 } })
  vi.mocked(registrarAcao).mockResolvedValue({} as never)
})

describe('histórico de alterações da sprint', () => {
  it('registra só os campos que mudaram, com datas no formato do dia', () => {
    expect(diferencasSprint(
      { name: 'Sprint 1', status: 'PLANNED', endDate: new Date('2026-10-01T00:00:00Z') },
      { name: 'Sprint 1', status: 'ACTIVE', endDate: '2026-11-01T00:00:00.000Z' },
    )).toEqual({ status: { de: 'PLANNED', para: 'ACTIVE' }, endDate: { de: '2026-10-01', para: '2026-11-01' } })
  })
  it('sprint com dados = cards abertos ou horas registradas', () => {
    expect(sprintTemDados({ cards: 0, segundosRegistrados: 0 })).toBe(false)
    expect(sprintTemDados({ cards: 2, segundosRegistrados: 0 })).toBe(true)
    expect(sprintTemDados({ cards: 0, segundosRegistrados: 60 })).toBe(true)
  })
})

describe('excluir sprint pelo quadro', () => {
  it('sprint com dados sem motivo é recusada e não é excluída', async () => {
    db.card.count.mockResolvedValue(4)
    const r = await deleteSprintAction('s1', 'p1', '  ')
    expect(r).toEqual({ error: expect.stringMatching(/motivo/) })
    expect(sprintsApi.delete).not.toHaveBeenCalled()
    expect(sincronizarEapComSprint).not.toHaveBeenCalled()
  })
  it('com motivo exclui e grava no histórico o motivo e o resumo', async () => {
    db.card.count.mockResolvedValue(4)
    db.timeEntry.aggregate.mockResolvedValue({ _sum: { duration: 3600 } })
    expect(await deleteSprintAction('s1', 'p1', 'Escopo cancelado')).toEqual({ success: true })
    expect(sprintsApi.delete).toHaveBeenCalledWith('s1')
    expect(sincronizarEapComSprint).toHaveBeenCalledWith('p1', 't1')
    expect(registrarAcao).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE', entity: 'Sprint', entityId: 's1', userId: 'u1',
      details: expect.objectContaining({ projectId: 'p1', nome: 'Sprint 1', motivo: 'Escopo cancelado', resumo: { cards: 4, segundosRegistrados: 3600, status: 'ACTIVE' } }),
    }), undefined)
  })
  it('sprint vazia é excluída sem motivo', async () => {
    expect(await deleteSprintAction('s1', 'p1')).toEqual({ success: true })
    expect(sprintsApi.delete).toHaveBeenCalled()
  })
})

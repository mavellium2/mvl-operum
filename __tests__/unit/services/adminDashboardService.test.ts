import { describe, it, expect, vi, beforeEach } from 'vitest'
const { session, metrics, projects, drafts } = vi.hoisted(() => ({ session: vi.fn(), metrics: vi.fn(), projects: vi.fn(), drafts: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: session }))
vi.mock('@/lib/prisma', () => ({ default: { project: { findMany: projects }, projectDraft: { findMany: drafts } } }))
vi.mock('@/lib/api-client', () => ({ sprintsApi: { getGlobalMetrics: metrics } }))
import { getAdminDashboardData } from '@/services/adminDashboardService'
beforeEach(() => {
  vi.clearAllMocks()
  session.mockResolvedValue({ tenantId: 'instituicao-a', role: 'admin' })
  projects.mockResolvedValue([{ id: 'p1', name: 'Projeto A', status: 'ACTIVE', sprints: [{ id: 's1', status: 'ACTIVE' }], _count: { sprints: 1 } }])
  drafts.mockResolvedValue([])
  metrics.mockResolvedValue({ kpis: { totalSprints: 1, totalCards: 2, horasTotais: 3, custoTotal: 50 }, sprintMetrics: [{ id: 's1', name: 'Sprint A', cardsTotal: 2, cardsConcluidos: 1, horasTotais: 3, custoTotal: 50 }], overdueCards: [], userMetrics: [] })
})
describe('dashboard administrativa por instituição', () => {
  it('limita projetos, rascunhos e sprints ativos à instituição da sessão', async () => {
    const result = await getAdminDashboardData()
    expect(projects).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'instituicao-a', deletedAt: null }, include: expect.objectContaining({ sprints: expect.objectContaining({ where: { deletedAt: null } }), _count: { select: { sprints: { where: { deletedAt: null } } } } }) }))
    expect(drafts).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'instituicao-a', project: { tenantId: 'instituicao-a', deletedAt: null } } }))
    expect(metrics).toHaveBeenCalledTimes(1)
    expect(result.activeProjetos[0]).toMatchObject({ id: 'p1', totalCards: 2, totalHoras: 3, totalCusto: 50 })
  })
  it('recalcula o escopo ao trocar de instituição e não reaproveita indicadores', async () => {
    await getAdminDashboardData()
    session.mockResolvedValue({ tenantId: 'instituicao-b', role: 'admin' })
    projects.mockResolvedValue([])
    metrics.mockResolvedValue({ kpis: { totalSprints: 0, totalCards: 0, horasTotais: 0, custoTotal: 0 }, sprintMetrics: [], overdueCards: [], userMetrics: [] })
    const result = await getAdminDashboardData()
    expect(projects).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'instituicao-b', deletedAt: null } }))
    expect(result.activeProjetos).toEqual([])
    expect(result.kpis.custoTotal).toBe(0)
  })
  it('recusa usuário comum antes de consultar indicadores', async () => {
    session.mockResolvedValue({ tenantId: 'instituicao-a', role: 'user' })
    await expect(getAdminDashboardData()).rejects.toThrow('Acesso administrativo necessário')
    expect(projects).not.toHaveBeenCalled()
    expect(metrics).not.toHaveBeenCalled()
  })
})

import 'server-only'
import prisma from '@/lib/prisma'
import { verifySession } from '@/lib/dal'
import { sprintsApi } from '@/lib/api-client'

export async function getAdminDashboardData() {
  const { tenantId, role } = await verifySession()
  if (role !== 'admin') throw new Error('Acesso administrativo necessário')

  const [dashboard, projetos, pendingDrafts] = await Promise.all([
    sprintsApi.getGlobalMetrics(),
    prisma.project.findMany({
      where: { tenantId, deletedAt: null },
      include: {
        sprints: {
          where: { deletedAt: null },
          select: { id: true, status: true },
        },
        _count: { select: { sprints: { where: { deletedAt: null } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.projectDraft.findMany({
      where: { tenantId, project: { tenantId, deletedAt: null } },
      select: { projectId: true, savedAt: true },
    }),
  ])

  const { kpis, sprintMetrics, overdueCards, userMetrics } = dashboard
  const metricsBySprint = new Map(sprintMetrics.map(sprint => [sprint.id, sprint]))

  // Calculate per-project metrics
  const projetoMetrics = await Promise.all(
    projetos.map(async p => {
      const sprintIds = p.sprints.map(s => s.id)
      let totalCards = 0
      let totalConcluidos = 0
      let totalHoras = 0
      let totalCusto = 0

      if (sprintIds.length > 0) {
        const metricsArr = sprintIds.flatMap(id => { const metrics = metricsBySprint.get(id); return metrics ? [metrics] : [] })
        for (const m of metricsArr) {
          totalCards += m.cardsTotal
          totalConcluidos += m.cardsConcluidos
          totalHoras += m.horasTotais
          totalCusto += m.custoTotal
        }
      }

      const pctConcluido = totalCards > 0 ? Math.round((totalConcluidos / totalCards) * 100) : 0
      const sprintsAtivas = p.sprints.filter(s => s.status === 'ACTIVE').length

      return {
        id: p.id,
        name: p.name,
        description: p.description,
        status: p.status,
        createdAt: p.createdAt,
        totalSprints: p._count.sprints,
        sprintsAtivas,
        totalCards,
        totalConcluidos,
        pctConcluido,
        totalHoras,
        totalCusto,
      }
    }),
  )

  const activeProjetos = projetoMetrics.filter(p => p.status === 'ACTIVE')
  const concludedProjetos = projetoMetrics.filter(p => p.status === 'COMPLETED')

  return { kpis, sprintMetrics, overdueCards, userMetrics, activeProjetos, concludedProjetos, pendingDrafts }
}

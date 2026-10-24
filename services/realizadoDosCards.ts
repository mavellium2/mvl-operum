import 'server-only'
import prisma from '@/lib/prisma'
import type { WbsNodeClient } from '@/types/wbs'

/** Projeção de leitura; não copia apontamentos para o campo manual da EAP. */
export async function aplicarRealizadoDosCards(nodes: Record<string, WbsNodeClient>, projectId: string, tenantId: string) {
  const ids = [...new Set(Object.values(nodes).filter(n => !n.childrenIds.length).map(n => n.properties.cardId).filter((id): id is string => !!id))]
  if (!ids.length) return nodes
  const where = {
    cardId: { in: ids }, isRunning: false, endedAt: { not: null },
    user: { tenantId },
    card: { deletedAt: null, OR: [
      { sprintId: null, projectId, project: { tenantId, deletedAt: null } },
      { sprint: { projectId, deletedAt: null, project: { tenantId, deletedAt: null } } },
    ] },
  }
  const [history, totals] = await prisma.$transaction([
    // Histórico removido também identifica a fonte: excluir o último registro
    // zera o total, sem ressuscitar um valor manual antigo da planilha.
    prisma.timeEntry.groupBy({ by: ['cardId'], orderBy: { cardId: 'asc' }, where, _count: { _all: true } }),
    prisma.timeEntry.groupBy({ by: ['cardId'], orderBy: { cardId: 'asc' }, where: { ...where, deletedAt: null, duration: { gte: 0 } }, _sum: { duration: true } }),
  ], { isolationLevel: 'RepeatableRead' })
  const seconds = new Map(history.map(row => [row.cardId, 0]))
  for (const row of totals) seconds.set(row.cardId, row._sum?.duration ?? 0)
  const result = { ...nodes }
  for (const node of Object.values(nodes)) {
    const cardId = node.properties.cardId
    if (!node.childrenIds.length && cardId && seconds.has(cardId)) {
      result[node.id] = { ...node, properties: { ...node.properties, tempoRealApontadoSegundos: seconds.get(cardId)! } }
    }
  }
  return result
}

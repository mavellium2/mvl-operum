import 'server-only'
import prisma from '@/lib/prisma'
import { colunaDeConclusao } from '@/lib/cardUtils'
import { diaConclusaoCard } from '@/lib/dataRealizacao'
import type { WbsNodeClient } from '@/types/wbs'

/** Projeção canônica do tempo e da conclusão; não copia valores para os campos manuais da EAP. */
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
  const [history, totals, cards] = await prisma.$transaction([
    // Histórico removido também identifica a fonte: excluir o último registro
    // zera o total, sem ressuscitar um valor manual antigo da planilha.
    prisma.timeEntry.groupBy({ by: ['cardId'], orderBy: { cardId: 'asc' }, where, _count: { _all: true } }),
    prisma.timeEntry.groupBy({ by: ['cardId'], orderBy: { cardId: 'asc' }, where: { ...where, deletedAt: null, duration: { gte: 0 } }, _sum: { duration: true } }),
    prisma.card.findMany({ where: { id: { in: ids }, deletedAt: null, sprint: { projectId, deletedAt: null, project: { tenantId, deletedAt: null } } }, select: {
      id: true, sprintColumnId: true,
      sprint: { select: { sprintColumns: { where: { deletedAt: null }, select: { id: true, title: true, position: true } } } },
      movements: { orderBy: [{ movedAt: 'desc' }, { id: 'desc' }], take: 1, select: { toColumnId: true, fromColumnId: true, movedAt: true } },
    } }),
  ], { isolationLevel: 'RepeatableRead' })
  const seconds = new Map(history.map(row => [row.cardId, 0]))
  for (const row of totals) seconds.set(row.cardId, row._sum?.duration ?? 0)
  const completionDates = new Map(cards.map(card => {
    const done = colunaDeConclusao(card.sprint?.sprintColumns ?? [])
    const latest = card.movements[0]
    const day = done && card.sprintColumnId === done.id && latest?.toColumnId === done.id && latest.fromColumnId !== latest.toColumnId ? diaConclusaoCard(latest.movedAt) : null
    return [card.id, day]
  }))
  const result = { ...nodes }
  for (const node of Object.values(nodes)) {
    const cardId = node.properties.cardId
    if (!node.childrenIds.length && cardId) {
      result[node.id] = { ...node, properties: { ...node.properties,
        ...(seconds.has(cardId) ? { tempoRealApontadoSegundos: seconds.get(cardId)! } : {}),
        dataRealizacaoCard: completionDates.get(cardId) ?? null,
      } }
    }
  }
  return result
}

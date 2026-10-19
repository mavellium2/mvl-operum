import 'server-only'
import prisma from '@/lib/prisma'
import type { WbsNodeProperties } from '@/types/wbs'

/** A conclusão explícita da planilha é diferente do tempo registrado pelo timer. */
export function concluidaNaPlanilha(p: WbsNodeProperties): boolean {
  return (p.percentualConclusao ?? 0) >= 100 || !!diaDaPlanilha(p.dataRealizacao)
}
export function diaDaPlanilha(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return null
  const day = value.slice(0, 10), date = new Date(`${day}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null
}

/** Datas e conclusão EAP/planilha → cards ligados, inclusive dados anteriores à correção. */
export async function sincronizarCardsDaPlanilha(projectId: string, tenantId: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'eap-sprint:' + projectId}))`
    const nodes = await tx.wbsNode.findMany({ where: { projectId, tenantId, project: { deletedAt: null } }, select: { properties: true } })
    let updated = 0
    for (const node of nodes) {
      const p = (node.properties ?? {}) as WbsNodeProperties
      if (typeof p.cardId !== 'string') continue
      const card = await tx.card.findFirst({ where: { id: p.cardId, deletedAt: null, sprint: { projectId, project: { tenantId }, deletedAt: null } }, select: { id: true, endDate: true, sprintId: true, sprintColumnId: true, sprintColumn: { select: { title: true } }, responsibles: { where: { user: { tenantId, deletedAt: null, isActive: true, projects: { some: { projectId, active: true } } } }, select: { userId: true } } } })
      if (!card?.sprintId) continue
      const data: { endDate?: Date | null; sprintColumnId?: string; sprintPosition?: number } = {}
      if ('dataPrevista' in p) {
        const day = diaDaPlanilha(p.dataPrevista)
        if ((card.endDate?.toISOString().slice(0, 10) ?? null) !== day) data.endDate = day ? new Date(`${day}T00:00:00-03:00`) : null
      }
      // Concluído exige responsável, como a movimentação manual. Nunca fabrica apontamentos de tempo.
      if (concluidaNaPlanilha(p) && card.responsibles.length) {
        const done = await tx.sprintColumn.findFirst({ where: { sprintId: card.sprintId, deletedAt: null, title: { equals: 'Concluído', mode: 'insensitive' } }, orderBy: { position: 'desc' }, select: { id: true, title: true } })
        if (done && done.id !== card.sprintColumnId) {
          data.sprintColumnId = done.id
          data.sprintPosition = ((await tx.card.aggregate({ where: { sprintColumnId: done.id, deletedAt: null }, _max: { sprintPosition: true } }))._max.sprintPosition ?? -1) + 1
          await tx.cardMovement.create({ data: { cardId: card.id, fromColumnId: card.sprintColumnId, fromColumnTitle: card.sprintColumn?.title, toColumnId: done.id, toColumnTitle: done.title, reason: 'Conclusão registrada na Planilha de Custos' } })
        }
      }
      if (Object.keys(data).length) { await tx.card.update({ where: { id: card.id }, data }); updated++ }
    }
    return { updated }
  })
}

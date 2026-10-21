import prisma from '@/lib/prisma'

/**
 * Data de início do projeto = data de início da primeira tarefa (card "Projeto:
 * usar a primeira tarefa como data de início").
 *
 * - Considera a menor data de início entre os cards ativos do projeto.
 * - Recalculada quando um card muda (criar, editar, excluir pelo quadro).
 * - Sem nenhuma tarefa com data, vale a data informada em Editar projeto; nenhuma
 *   data é inventada.
 */
export async function primeiraDataDeTarefa(projectId: string, tenantId: string): Promise<Date | null> {
  const card = await prisma.card.findFirst({
    where: { projectId, deletedAt: null, startDate: { not: null }, project: { id: projectId, tenantId } },
    orderBy: { startDate: 'asc' },
    select: { startDate: true },
  })
  return card?.startDate ?? null
}

const mesmoDia = (a: Date | null | undefined, b: Date | null | undefined) =>
  !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)

/** Grava no projeto a data da primeira tarefa, quando houver e for diferente da atual. */
export async function sincronizarInicioDoProjeto(projectId: string, tenantId: string): Promise<Date | null> {
  const projeto = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { startDate: true } })
  if (!projeto) return null
  const primeira = await primeiraDataDeTarefa(projectId, tenantId)
  if (primeira && !mesmoDia(primeira, projeto.startDate)) {
    await prisma.project.update({ where: { id: projectId }, data: { startDate: primeira } })
  }
  return primeira ?? projeto.startDate ?? null
}

/** Mesma sincronização a partir de um card (inclusive recém-excluído). Nunca falha a operação do card. */
export async function sincronizarInicioPeloCard(cardId: string, tenantId: string): Promise<void> {
  try {
    const card = await prisma.card.findFirst({ where: { id: cardId }, select: { projectId: true } })
    if (card?.projectId) await sincronizarInicioDoProjeto(card.projectId, tenantId)
  } catch {
    // a data do projeto é recalculada na próxima alteração; o card já foi salvo
  }
}

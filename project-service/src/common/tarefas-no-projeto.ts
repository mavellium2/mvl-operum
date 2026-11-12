import { prisma } from '../prisma'

/**
 * Tarefas de uma pessoa num projeto: cards (não excluídos) do projeto em que ela é
 * responsável, lançou horas ou comentou. Os cards ficam no sprint-service, mas o
 * banco é o mesmo; por isso a contagem é feita em SQL.
 */
export async function tarefasNoProjeto(userId: string, projectId: string) {
  const [linha] = await prisma.$queryRaw<{ responsavel: number; horas: number; comentarios: number }[]>`
    WITH cards AS (
      SELECT c.id FROM "Card" c LEFT JOIN "Sprint" s ON s.id = c."sprintId"
      WHERE c."deletedAt" IS NULL AND (c."projectId" = ${projectId} OR s."projectId" = ${projectId})
    )
    SELECT
      (SELECT count(*) FROM "CardResponsible" WHERE "userId" = ${userId} AND "cardId" IN (SELECT id FROM cards))::int AS responsavel,
      (SELECT count(*) FROM "TimeEntry" WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "cardId" IN (SELECT id FROM cards))::int AS horas,
      (SELECT count(*) FROM "Comment" WHERE "userId" = ${userId} AND "deletedAt" IS NULL AND "cardId" IN (SELECT id FROM cards))::int AS comentarios`
  return linha ?? { responsavel: 0, horas: 0, comentarios: 0 }
}

/** Mensagem de bloqueio da exclusão: diz o que prende a pessoa e o que fazer no lugar. */
export function motivoParaNaoExcluir(t: { responsavel: number; horas: number; comentarios: number }): string | null {
  const partes = [
    t.responsavel ? `responsável por ${t.responsavel} card(s)` : '',
    t.horas ? `${t.horas} lançamento(s) de horas` : '',
    t.comentarios ? `${t.comentarios} comentário(s)` : '',
  ].filter(Boolean)
  if (!partes.length) return null
  return `Não é possível excluir: a pessoa tem tarefas neste projeto (${partes.join(', ')}). Inative com um motivo para tirar o acesso e manter o histórico.`
}

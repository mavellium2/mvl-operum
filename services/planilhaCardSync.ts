import 'server-only'
import prisma from '@/lib/prisma'
import { colunaDeConclusao } from '@/lib/cardUtils'
import type { WbsNodeProperties } from '@/types/wbs'

/**
 * Planilha de Custos → cards ligados: prazo (dataPrevista → Card.endDate) e
 * conclusão/reabertura (ADR-054).
 *
 * Regra de origem:
 * - A planilha conclui o card quando registra a conclusão (data realizada válida
 *   ou 100%). O movimento leva a "chave" dessa conclusão no motivo.
 * - Se alguém reabrir o card à mão, a mesma conclusão da planilha não o devolve a
 *   Concluído; só uma conclusão diferente (outra data, ou a volta depois de
 *   retirada) vale de novo. Movimentação manual prevalece sobre a planilha.
 * - Retirar a conclusão na planilha reabre o card só se foi a planilha que o
 *   concluiu (o último movimento para a coluna de conclusão é dela); volta para a
 *   coluna de onde veio. Conclusão manual nunca é desfeita pela planilha.
 * - A coluna de conclusão é identificada pelo nome mesmo quando renomeada
 *   (`colunaDeConclusao`). Responsáveis e histórico são preservados; nunca cria
 *   apontamento de tempo.
 */

export const MOTIVO_CONCLUSAO = 'Conclusão registrada na Planilha de Custos'
export const MOTIVO_REABERTURA = 'Conclusão retirada na Planilha de Custos'

/** A conclusão explícita da planilha é diferente do tempo registrado pelo timer. */
export function concluidaNaPlanilha(p: WbsNodeProperties): boolean {
  return chaveDaConclusao(p) !== null
}
export function diaDaPlanilha(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10))) return null
  const day = value.slice(0, 10), date = new Date(`${day}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null
}

/** Identifica a conclusão registrada na planilha: "data:2026-10-19", "pct:100" ou null. */
export function chaveDaConclusao(p: WbsNodeProperties): string | null {
  const dia = diaDaPlanilha(p.dataRealizacao)
  if (dia) return `data:${dia}`
  return (p.percentualConclusao ?? 0) >= 100 ? 'pct:100' : null
}

export interface MovimentoResumo { reason: string | null; toColumnId: string | null; fromColumnId: string | null }

/** Chave gravada no motivo de um movimento de conclusão da planilha ("… [data:2026-10-19]"). */
export function chaveDoMovimento(m: MovimentoResumo): string | null {
  if (!m.reason?.startsWith(MOTIVO_CONCLUSAO)) return null
  return /\[([^\]]+)\]$/.exec(m.reason)?.[1] ?? 'legado'
}

export type Decisao =
  | { acao: 'nada' }
  | { acao: 'concluir' }
  | { acao: 'reabrir'; para: string | null }
  | { acao: 'manter-manual' }

/**
 * Decide o que a planilha faz com a coluna do card. `movimentos` em ordem do mais
 * recente para o mais antigo. Função pura: a mesma entrada dá a mesma decisão
 * (idempotência).
 */
export function decidirConclusao(entrada: { chave: string | null; naConclusao: boolean; conclusaoId: string; movimentos: MovimentoResumo[] }): Decisao {
  const { chave, naConclusao, conclusaoId, movimentos } = entrada
  const ultimoDaPlanilha = movimentos.find(m => m.reason?.startsWith(MOTIVO_CONCLUSAO) || m.reason?.startsWith(MOTIVO_REABERTURA))
  if (chave) {
    if (naConclusao) return { acao: 'nada' }
    // A mesma conclusão já foi aplicada e o card saiu de lá depois: foi reaberto à mão.
    if (ultimoDaPlanilha && chaveDoMovimento(ultimoDaPlanilha) === chave) return { acao: 'manter-manual' }
    return { acao: 'concluir' }
  }
  if (!naConclusao) return { acao: 'nada' }
  // Quem levou o card para a coluna de conclusão por último?
  const entrada_ = movimentos.find(m => m.toColumnId === conclusaoId)
  if (!entrada_ || !chaveDoMovimento(entrada_)) return { acao: 'nada' } // conclusão manual: planilha não desfaz
  return { acao: 'reabrir', para: entrada_.fromColumnId }
}

/** Datas e conclusão EAP/planilha → cards ligados, inclusive dados anteriores à correção. */
export async function sincronizarCardsDaPlanilha(projectId: string, tenantId: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'eap-sprint:' + projectId}))`
    const nodes = await tx.wbsNode.findMany({ where: { projectId, tenantId, project: { deletedAt: null } }, select: { properties: true } })
    const colunasPorSprint = new Map<string, { id: string; title: string; position: number }[]>()
    const resultado = { updated: 0, reabertos: 0, mantidosManual: 0, semColunaDeConclusao: 0 }
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

      let colunas = colunasPorSprint.get(card.sprintId)
      if (!colunas) {
        colunas = await tx.sprintColumn.findMany({ where: { sprintId: card.sprintId, deletedAt: null }, orderBy: { position: 'asc' }, select: { id: true, title: true, position: true } })
        colunasPorSprint.set(card.sprintId, colunas)
      }
      const conclusao = colunaDeConclusao(colunas)
      const chave = chaveDaConclusao(p)
      if (!conclusao) {
        if (chave) resultado.semColunaDeConclusao++
      } else if (chave || card.sprintColumnId === conclusao.id) {
        const movimentos = await tx.cardMovement.findMany({ where: { cardId: card.id }, orderBy: { movedAt: 'desc' }, take: 50, select: { reason: true, toColumnId: true, fromColumnId: true } })
        const decisao = decidirConclusao({ chave, naConclusao: card.sprintColumnId === conclusao.id, conclusaoId: conclusao.id, movimentos })
        const proximaPosicao = async (colunaId: string) => ((await tx.card.aggregate({ where: { sprintColumnId: colunaId, deletedAt: null }, _max: { sprintPosition: true } }))._max.sprintPosition ?? -1) + 1

        // Concluído exige responsável, como a movimentação manual.
        if (decisao.acao === 'concluir' && card.responsibles.length) {
          data.sprintColumnId = conclusao.id
          data.sprintPosition = await proximaPosicao(conclusao.id)
          await tx.cardMovement.create({ data: { cardId: card.id, fromColumnId: card.sprintColumnId, fromColumnTitle: card.sprintColumn?.title, toColumnId: conclusao.id, toColumnTitle: conclusao.title, reason: `${MOTIVO_CONCLUSAO} [${chave}]` } })
        } else if (decisao.acao === 'reabrir') {
          const antes = colunas.filter(c => c.position < conclusao.position)
          const destino = colunas.find(c => c.id === decisao.para && c.id !== conclusao.id) ?? antes.at(-1) ?? colunas.find(c => c.id !== conclusao.id)
          if (destino) {
            data.sprintColumnId = destino.id
            data.sprintPosition = await proximaPosicao(destino.id)
            await tx.cardMovement.create({ data: { cardId: card.id, fromColumnId: conclusao.id, fromColumnTitle: conclusao.title, toColumnId: destino.id, toColumnTitle: destino.title, reason: MOTIVO_REABERTURA } })
            resultado.reabertos++
          }
        } else if (decisao.acao === 'manter-manual') {
          resultado.mantidosManual++
        }
      }
      if (Object.keys(data).length) { await tx.card.update({ where: { id: card.id }, data }); resultado.updated++ }
    }
    return resultado
  })
}

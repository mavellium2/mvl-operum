import 'server-only'
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma'

/**
 * Estado da sincronização EAP ↔ planilha ↔ sprints (card "Exibir status,
 * pendências e opção de repetir a sincronização", ADR-055). Gravado a cada
 * tentativa; nunca diz "sincronizado" quando sobrou pendência ou houve erro.
 */
export type SituacaoSincronizacao = 'OK' | 'PENDENCIAS' | 'FALHA'

export interface PendenciaSincronizacao { tipo: string; quantidade: number; mensagem: string }

export interface StatusSincronizacao {
  situacao: SituacaoSincronizacao
  ultimaTentativaEm: string
  ultimaConclusaoEm: string | null
  erro: string | null
  pendencias: PendenciaSincronizacao[]
}

/** Contadores devolvidos pela sincronização dos cards (`sincronizarCardsDaPlanilha`). */
export interface ResultadoCards { semResponsavel?: number; semColunaDeConclusao?: number; mantidosManual?: number }

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Pendências em linguagem do usuário a partir dos contadores da sincronização. */
export function pendenciasDe(cards: ResultadoCards | null | undefined): PendenciaSincronizacao[] {
  const lista: PendenciaSincronizacao[] = []
  const semResp = cards?.semResponsavel ?? 0
  if (semResp > 0) lista.push({ tipo: 'sem-responsavel', quantidade: semResp, mensagem: `${plural(semResp, 'atividade concluída', 'atividades concluídas')} na planilha sem responsável ativo: o card não foi para a coluna de conclusão. Defina um responsável.` })
  const semCol = cards?.semColunaDeConclusao ?? 0
  if (semCol > 0) lista.push({ tipo: 'sem-coluna', quantidade: semCol, mensagem: `${plural(semCol, 'card concluído', 'cards concluídos')} na planilha em sprint sem colunas: crie as colunas da sprint.` })
  const manual = cards?.mantidosManual ?? 0
  if (manual > 0) lista.push({ tipo: 'reaberto-manual', quantidade: manual, mensagem: `${plural(manual, 'card reaberto', 'cards reabertos')} à mão continua aberto embora a planilha registre a conclusão. Remova a conclusão na planilha ou conclua o card.` })
  return lista
}

function erroLegivel(erro: unknown): string {
  const msg = erro instanceof Error ? erro.message : String(erro)
  // Mensagens de banco/stack não ajudam o usuário; o detalhe fica no log do servidor.
  if (/prisma|P\d{4}|ECONN|timeout|deadlock|serializ/i.test(msg)) return 'Não foi possível concluir a sincronização (banco indisponível ou ocupado). Tente novamente em instantes.'
  return msg.slice(0, 500) || 'Erro desconhecido na sincronização.'
}

function paraStatus(r: { situacao: string; ultimaTentativaEm: Date; ultimaConclusaoEm: Date | null; erro: string | null; pendencias: Prisma.JsonValue }): StatusSincronizacao {
  return {
    situacao: (['OK', 'PENDENCIAS', 'FALHA'].includes(r.situacao) ? r.situacao : 'FALHA') as SituacaoSincronizacao,
    ultimaTentativaEm: r.ultimaTentativaEm.toISOString(),
    ultimaConclusaoEm: r.ultimaConclusaoEm?.toISOString() ?? null,
    erro: r.erro,
    pendencias: Array.isArray(r.pendencias) ? (r.pendencias as unknown as PendenciaSincronizacao[]) : [],
  }
}

export async function registrarSucesso(projectId: string, tenantId: string, cards: ResultadoCards | null | undefined, resumo: unknown): Promise<StatusSincronizacao> {
  const agora = new Date()
  const pendencias = pendenciasDe(cards)
  const dados = {
    tenantId, situacao: pendencias.length ? 'PENDENCIAS' : 'OK', ultimaTentativaEm: agora, ultimaConclusaoEm: agora, erro: null,
    pendencias: pendencias as unknown as Prisma.InputJsonValue, resumo: (resumo ?? null) as Prisma.InputJsonValue,
  }
  const r = await prisma.projetoSincronizacao.upsert({ where: { projectId }, create: { projectId, ...dados }, update: dados })
  return paraStatus(r)
}

export async function registrarFalha(projectId: string, tenantId: string, erro: unknown): Promise<StatusSincronizacao> {
  const agora = new Date()
  // Mantém a última conclusão e as pendências conhecidas: a falha é desta tentativa.
  const r = await prisma.projetoSincronizacao.upsert({
    where: { projectId },
    create: { projectId, tenantId, situacao: 'FALHA', ultimaTentativaEm: agora, erro: erroLegivel(erro) },
    update: { situacao: 'FALHA', ultimaTentativaEm: agora, erro: erroLegivel(erro) },
  })
  return paraStatus(r)
}

export async function statusDaSincronizacao(projectId: string, tenantId: string): Promise<StatusSincronizacao | null> {
  try {
    const r = await prisma.projetoSincronizacao.findFirst({ where: { projectId, tenantId } })
    return r ? paraStatus(r) : null
  } catch {
    return null
  }
}

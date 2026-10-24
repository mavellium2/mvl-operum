import 'server-only'
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma'
import { registrarAcao } from './auditoriaService'

/**
 * Histórico de alterações das sprints (criação, alteração e exclusão), gravado na
 * auditoria (`AuditLog`, entity "Sprint"). Exclusão de sprint com dados exige motivo.
 */

export const MOTIVO_MINIMO = 5

export interface ResumoSprint {
  id: string
  nome: string
  projectId: string | null
  status: string
  cards: number
  segundosRegistrados: number
}

/** Snapshot dos campos rastreados no histórico. */
export interface CamposSprint {
  name?: string | null
  status?: string | null
  startDate?: Date | string | null
  endDate?: Date | string | null
  description?: string | null
  qualidade?: number | null
  dificuldade?: number | null
}

const CAMPOS: Array<keyof CamposSprint> = ['name', 'status', 'startDate', 'endDate', 'description', 'qualidade', 'dificuldade']

const normalizar = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 10) : v ?? null)

/** Campos que mudaram, no formato { campo: { de, para } }. */
export function diferencasSprint(antes: CamposSprint | null, depois: CamposSprint): Record<string, { de: unknown; para: unknown }> {
  const out: Record<string, { de: unknown; para: unknown }> = {}
  for (const campo of CAMPOS) {
    if (!(campo in depois)) continue
    const de = normalizar(antes?.[campo]), para = normalizar(depois[campo])
    if (de !== para) out[campo] = { de, para }
  }
  return out
}

/** Sprint "com dados": tem cards abertos ou tempo registrado neles. */
export const sprintTemDados = (r: Pick<ResumoSprint, 'cards' | 'segundosRegistrados'>) => r.cards > 0 || r.segundosRegistrados > 0

export async function camposDaSprint(sprintId: string, tx: Prisma.TransactionClient | typeof prisma = prisma, tenantId?: string): Promise<(CamposSprint & { projectId: string | null }) | null> {
  return tx.sprint.findFirst({
    where: { id: sprintId, ...(tenantId ? { project: { tenantId } } : {}) },
    select: { name: true, status: true, startDate: true, endDate: true, description: true, qualidade: true, dificuldade: true, projectId: true },
  })
}

/** `tenantId`: só sprints de projetos da instituição (chamadas a partir de ações do usuário). */
export async function resumoDaSprint(sprintId: string, tx: Prisma.TransactionClient | typeof prisma = prisma, tenantId?: string): Promise<ResumoSprint | null> {
  const sprint = await tx.sprint.findFirst({ where: { id: sprintId, deletedAt: null, ...(tenantId ? { project: { tenantId } } : {}) }, select: { id: true, name: true, projectId: true, status: true } })
  if (!sprint) return null
  const [cards, tempo] = await Promise.all([
    tx.card.count({ where: { sprintId, deletedAt: null } }),
    tx.timeEntry.aggregate({ where: { deletedAt: null, card: { sprintId, deletedAt: null } }, _sum: { duration: true } }),
  ])
  return { id: sprint.id, nome: sprint.name, projectId: sprint.projectId, status: sprint.status, cards, segundosRegistrados: tempo._sum.duration ?? 0 }
}

export async function registrarHistoricoSprint(
  p: {
    tenantId: string
    userId?: string
    sprintId: string
    acao: 'CREATE' | 'UPDATE' | 'DELETE'
    projectId: string | null
    nome: string
    alteracoes?: Record<string, { de: unknown; para: unknown }>
    motivo?: string | null
    resumo?: Pick<ResumoSprint, 'cards' | 'segundosRegistrados' | 'status'> | null
    origem: 'quadro' | 'eap'
  },
  tx?: Prisma.TransactionClient,
) {
  if (p.acao === 'UPDATE' && (!p.alteracoes || Object.keys(p.alteracoes).length === 0)) return null
  return registrarAcao({
    tenantId: p.tenantId, userId: p.userId, action: p.acao, entity: 'Sprint', entityId: p.sprintId,
    details: {
      projectId: p.projectId, nome: p.nome, origem: p.origem,
      ...(p.alteracoes ? { alteracoes: p.alteracoes } : {}),
      ...(p.motivo ? { motivo: p.motivo } : {}),
      ...(p.resumo ? { resumo: p.resumo } : {}),
    },
  }, tx)
}

export interface EventoHistoricoSprint {
  id: string
  quando: Date
  usuario: string | null
  acao: string
  nome: string
  origem: string | null
  alteracoes: Record<string, { de: unknown; para: unknown }>
  motivo: string | null
  resumo: { cards?: number; segundosRegistrados?: number; status?: string } | null
}

/** Histórico das sprints do projeto, do mais recente para o mais antigo. */
export async function historicoDasSprints(tenantId: string, projectId: string, limite = 200): Promise<EventoHistoricoSprint[]> {
  const logs = await prisma.auditLog.findMany({
    where: { tenantId, entity: 'Sprint', details: { path: ['projectId'], equals: projectId } },
    orderBy: { timestamp: 'desc' },
    take: limite,
  })
  const ids = [...new Set(logs.map(l => l.userId).filter((v): v is string => !!v))]
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []
  const nomeDe = new Map(users.map(u => [u.id, u.name]))
  return logs.map(l => {
    const d = (l.details as Record<string, unknown> | null) ?? {}
    return {
      id: l.id,
      quando: l.timestamp,
      usuario: l.userId ? nomeDe.get(l.userId) ?? null : null,
      acao: l.action,
      nome: typeof d.nome === 'string' ? d.nome : '',
      origem: typeof d.origem === 'string' ? d.origem : null,
      alteracoes: (d.alteracoes as EventoHistoricoSprint['alteracoes']) ?? {},
      motivo: typeof d.motivo === 'string' ? d.motivo : null,
      resumo: (d.resumo as EventoHistoricoSprint['resumo']) ?? null,
    }
  })
}

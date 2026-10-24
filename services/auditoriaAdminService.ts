import prisma from '@/lib/prisma'
import { registrarAcao } from './auditoriaService'

/**
 * Auditoria das ações de administração sobre usuários e instituições.
 * As alterações são feitas no auth-service; aqui ficam o "antes/depois" e
 * quem fez, na tabela AuditLog da instituição afetada.
 */

/** Campos do usuário que entram no "antes/depois". Senha, hash, MFA e tokens ficam de fora. */
const CAMPOS_USUARIO = {
  name: true, email: true, role: true, isActive: true, cargo: true, departamento: true,
  hourlyRate: true, avatarUrl: true, forcePasswordChange: true, phone: true, cep: true,
  logradouro: true, numero: true, complemento: true, bairro: true, cidade: true, estado: true, notes: true,
} as const

export type DadosUsuarioAuditado = Partial<Record<keyof typeof CAMPOS_USUARIO, unknown>>

export async function dadosDoUsuario(userId: string, tenantId: string): Promise<DadosUsuarioAuditado | null> {
  return prisma.user.findFirst({ where: { id: userId, tenantId }, select: CAMPOS_USUARIO })
}

export function diferencas(antes: Record<string, unknown> | null, depois: Record<string, unknown> | null) {
  const out: Record<string, { de: unknown; para: unknown }> = {}
  for (const campo of new Set([...Object.keys(antes ?? {}), ...Object.keys(depois ?? {})])) {
    const de = antes?.[campo] ?? null, para = depois?.[campo] ?? null
    if (JSON.stringify(de) !== JSON.stringify(para)) out[campo] = { de, para }
  }
  return out
}

export async function auditarAdmin(p: {
  tenantId: string
  autorId: string
  action: string
  entity: 'User' | 'Tenant'
  entityId?: string
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    await registrarAcao({ tenantId: p.tenantId, userId: p.autorId, action: p.action, entity: p.entity, entityId: p.entityId, details: p.details })
  } catch (error) {
    // A alteração já foi feita no auth-service; a falha fica no log do servidor.
    console.error(`[auditoria] falha ao registrar ${p.action} ${p.entity} ${p.entityId ?? ''}`, error)
  }
}

/**
 * Executa a alteração de um usuário e registra o que mudou. Lê o antes e o
 * depois no banco da instituição de quem faz.
 */
export async function comAuditoriaDeUsuario<T>(
  sessao: { userId: string; tenantId: string },
  action: string,
  userId: string,
  alterar: () => Promise<T>,
  extras?: Record<string, unknown>,
): Promise<T> {
  const antes = await dadosDoUsuario(userId, sessao.tenantId).catch(() => null)
  const resultado = await alterar()
  const depois = await dadosDoUsuario(userId, sessao.tenantId).catch(() => null)
  await auditarAdmin({
    tenantId: sessao.tenantId, autorId: sessao.userId, action, entity: 'User', entityId: userId,
    details: { alteracoes: diferencas(antes, depois), ...extras },
  })
  return resultado
}

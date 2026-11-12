'use server'

import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { adminApi, authApi } from '@/lib/api-client'
import { createTenant, updateTenant, ConflictError } from '@/services/tenantService'
import { CreateTenantSchema } from '@/lib/validation/tenantSchemas'
import { availableInstitutionIdentifier } from '@/lib/institutionIdentifier'
import { normalizarContato } from '@/lib/contato'
import { erroMoeda } from '@/lib/dinheiro'
import { exigirOperadorDaPlataforma } from '@/lib/platformOperator'
import prisma from '@/lib/prisma'
import { auditarAdmin, comAuditoriaDeUsuario, dadosDoUsuario, diferencas } from '@/services/auditoriaAdminService'
import { notificarPendenciasDoMembroInativo } from '@/services/membroInativo'
import { CONTA_INATIVADA, motivoDaContaInativada } from '@/lib/contaInativada'

async function requireAdmin() {
  const session = await verifySession()
  if (session.role !== 'admin') {
    throw new Error('Acesso restrito a administradores')
  }
  return session
}

export async function listUsersAction() {
  try {
    await requireAdmin()
    const users = await adminApi.listUsers()
    return { users }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao listar usuários' }
  }
}

export async function adminCreateUserAction(data: {
  name: string
  email: string
  password: string
  isAdmin?: boolean
  forcePasswordChange?: boolean
  avatarUrl?: string
  phone?: string
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  estado?: string
  notes?: string
}) {
  try {
    const session = await requireAdmin()
    const contato = normalizarContato(data, { emailObrigatorio: true })
    if (contato.error) return { error: contato.error }
    const user = await adminApi.createUser(contato.data as Record<string, unknown>)
    const novoId = (user as { id?: string } | null)?.id
    if (novoId) {
      const depois = await dadosDoUsuario(novoId, session.tenantId).catch(() => null)
      await auditarAdmin({
        tenantId: session.tenantId, autorId: session.userId, action: 'USUARIO_CRIAR', entity: 'User', entityId: novoId,
        details: { alteracoes: diferencas(null, depois) },
      })
    }
    revalidatePath('/admin/users')
    return { user }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar usuário' }
  }
}

export async function adminUpdateUserAction(
  userId: string,
  data: {
    name?: string
    email?: string
    avatarUrl?: string
    phone?: string
    cep?: string
    logradouro?: string
    numero?: string
    complemento?: string
    bairro?: string
    cidade?: string
    estado?: string
    notes?: string
    password?: string
    cargo?: string
    departamento?: string
    hourlyRate?: number
  },
) {
  try {
    const session = await requireAdmin()
    const contato = normalizarContato(data)
    if (contato.error) return { error: contato.error }
    if (data.hourlyRate !== undefined) {
      const erroValor = erroMoeda(data.hourlyRate, { rotulo: 'Valor/hora' })
      if (erroValor) return { error: erroValor }
    }
    // A senha nova não entra na auditoria; só o fato de ter sido trocada.
    const user = await comAuditoriaDeUsuario(session, 'USUARIO_EDITAR', userId,
      () => adminApi.updateUser(userId, contato.data as Record<string, unknown>),
      data.password ? { senhaRedefinida: true } : undefined)
    revalidatePath('/admin/users')
    return { user }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar usuário' }
  }
}

/**
 * Desativa ou reativa a conta. Desativar (motivo obrigatório) derruba as sessões e
 * inativa a pessoa em todos os projetos com esse motivo, numa transação só: ela
 * continua visível nos projetos e documentos (em vermelho), os dados dela ficam, e
 * os cards abertos dela passam a pedir outro responsável (o gerente é avisado).
 * Reativar devolve só os vínculos que a desativação tirou.
 */
export async function toggleUserActiveAction(userId: string, active: boolean, motivo?: string) {
  try {
    const session = await requireAdmin()
    const reason = (motivo ?? '').trim()
    if (!active && reason.length < 3) return { error: 'Informe o motivo da inativação.' }
    if (reason.length > 400) return { error: 'O motivo pode ter no máximo 400 caracteres.' }
    if (!active && userId === session.userId) return { error: 'Você não pode inativar a própria conta.' }
    let projetosInativados: string[] = []
    const user = await comAuditoriaDeUsuario(session, active ? 'USUARIO_ATIVAR' : 'USUARIO_DESATIVAR', userId, () =>
      prisma.$transaction(async tx => {
        const existente = await tx.user.findFirst({ where: { id: userId, tenantId: session.tenantId, deletedAt: null }, select: { id: true, isActive: true } })
        if (!existente) throw new Error('Usuário não encontrado')
        const doTenant = { project: { tenantId: session.tenantId, deletedAt: null } }
        const agora = new Date()
        if (!active) {
          const ativos = await tx.userProject.findMany({ where: { userId, active: true, ...doTenant }, select: { projectId: true } })
          projetosInativados = [...new Set(ativos.map(a => a.projectId))]
          await tx.userProject.updateMany({
            where: { userId, active: true, ...doTenant },
            data: { active: false, endDate: agora, inactiveReason: motivoDaContaInativada(reason), inactivatedAt: agora },
          })
        } else {
          await tx.userProject.updateMany({
            where: { userId, active: false, inactiveReason: { startsWith: CONTA_INATIVADA }, ...doTenant },
            data: { active: true, endDate: null, inactiveReason: null, inactivatedAt: null },
          })
        }
        return tx.user.update({
          where: { id: userId },
          // Desativar invalida as sessões (mesma regra do auth-service).
          data: { isActive: active, ...(!active && existente.isActive ? { tokenVersion: { increment: 1 } } : {}) },
          select: { id: true, name: true, email: true, isActive: true, role: true, tokenVersion: true },
        })
      }), active ? undefined : { motivo: reason, projetos: projetosInativados.length })
    // Cards abertos sem responsável ativo: avisa os gerentes de cada projeto (não desfaz a inativação se falhar).
    await Promise.all(projetosInativados.map(async projectId => {
      try { await notificarPendenciasDoMembroInativo(projectId, { id: userId, name: user.name }, motivoDaContaInativada(reason)) } catch { /* aviso é best-effort */ }
      revalidatePath(`/projetos/${projectId}`, 'layout')
    }))
    revalidatePath('/admin/users')
    return { user, projetos: projetosInativados.length }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar status do usuário' }
  }
}

/** O que impede excluir uma conta: qualquer vínculo com projetos, tarefas ou documentos. */
async function vinculosDoUsuario(tenantId: string, userId: string) {
  const [projetos, papeis, responsavel, horas, comentarios, movimentos, sprints, etiquetas, versoes, atas, presencas, acoesAta, externo, versoesProjeto, versoesPlanilha, rascunhosProjeto, operacoes] = await Promise.all([
    prisma.userProject.count({ where: { userId } }),
    prisma.userProjectRole.count({ where: { userId } }),
    prisma.cardResponsible.count({ where: { userId } }),
    prisma.timeEntry.count({ where: { userId } }),
    prisma.comment.count({ where: { userId } }),
    prisma.cardMovement.count({ where: { userId } }),
    prisma.sprint.count({ where: { createdBy: userId } }),
    prisma.tag.count({ where: { userId } }),
    prisma.documentVersion.count({ where: { OR: [{ authorId: userId }, { approvedById: userId }] } }),
    prisma.ata.count({ where: { OR: [{ elaboradoPorUserId: userId }, { aprovadoPorUserId: userId }] } }),
    prisma.ataPresente.count({ where: { userId } }),
    prisma.ataAcao.count({ where: { responsavelUserId: userId } }),
    prisma.projectStakeholder.count({ where: { stakeholder: { userId, tenantId } } }),
    prisma.projetoVersao.count({ where: { autorId: userId } }),
    prisma.planilhaVersao.count({ where: { autorId: userId } }),
    prisma.projectDraft.count({ where: { authorId: userId } }),
    prisma.projetoOperacao.count({ where: { userId } }),
  ])
  const itens = [
    [projetos, 'projeto(s)'], [papeis, 'papel(éis) em projeto'], [responsavel, 'card(s) como responsável'], [horas, 'lançamento(s) de horas'],
    [comentarios, 'comentário(s)'], [movimentos, 'movimentação(ões) de card'], [sprints, 'sprint(s) criada(s)'], [etiquetas, 'etiqueta(s)'],
    [versoes, 'versão(ões) de documento'], [atas, 'ata(s) elaborada(s)/aprovada(s)'], [presencas, 'presença(s) em ata'], [acoesAta, 'ação(ões) de ata'],
    [externo, 'projeto(s) como externo'], [versoesProjeto + versoesPlanilha + rascunhosProjeto + operacoes, 'registro(s) no histórico de projetos'],
  ] as const
  return itens.filter(([n]) => n > 0).map(([n, rotulo]) => `${n} ${rotulo}`)
}

/**
 * Exclui a conta de vez. Só quando ela não tem vínculo nenhum (projeto, tarefa,
 * documento, ata…); com vínculos, o caminho é inativar. Notificações, rascunhos e
 * preferências pessoais saem junto; o contato da pessoa, se houver, fica sem conta.
 */
export async function excluirUsuarioAction(userId: string) {
  try {
    const session = await requireAdmin()
    if (userId === session.userId) return { error: 'Você não pode excluir a própria conta.' }
    const alvo = await prisma.user.findFirst({ where: { id: userId, tenantId: session.tenantId, deletedAt: null }, select: { id: true, platformOperator: true } })
    if (!alvo) return { error: 'Usuário não encontrado.' }
    if (alvo.platformOperator) return { error: 'O operador da plataforma não pode ser excluído por aqui.' }
    const vinculos = await vinculosDoUsuario(session.tenantId, userId)
    if (vinculos.length) return { error: `Não é possível excluir: a conta tem vínculos (${vinculos.join(', ')}). Inative com um motivo para tirar o acesso e manter o histórico.`, vinculos }
    const antes = await dadosDoUsuario(userId, session.tenantId).catch(() => null)
    await prisma.$transaction([
      prisma.userPermission.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ])
    await auditarAdmin({ tenantId: session.tenantId, autorId: session.userId, action: 'USUARIO_EXCLUIR', entity: 'User', entityId: userId, details: { alteracoes: diferencas(antes, null) } })
    revalidatePath('/admin/users')
    return { success: true as const }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao excluir o usuário.' }
  }
}

export async function setUserRoleAction(userId: string, role: string) {
  if (!['admin', 'member'].includes(role)) {
    return { error: 'Role inválida. Apenas "admin" ou "member" são permitidas globalmente.' }
  }
  try {
    const session = await requireAdmin()
    const user = await comAuditoriaDeUsuario(session, 'USUARIO_PAPEL', userId, () => adminApi.setRole(userId, role))
    revalidatePath('/admin/users')
    return { user }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar role do usuário' }
  }
}

const VALID_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'REMOVED'] as const
type TenantStatus = typeof VALID_STATUSES[number]

export async function checkInstitutionIdentifierAction(identifier: string) {
  try {
    await exigirOperadorDaPlataforma()
    const parsed = CreateTenantSchema.shape.subdomain.safeParse(identifier)
    if (!parsed.success) return { error: parsed.error.issues[0].message }
    // Inclui instituições removidas: a restrição única também reserva seus identificadores.
    const occupied = await prisma.tenant.findMany({ where: { subdomain: { startsWith: parsed.data.slice(0, 55) } }, select: { subdomain: true } })
    const suggestion = availableInstitutionIdentifier(parsed.data, occupied.map(t => t.subdomain))
    return { available: suggestion === parsed.data, suggestion }
  } catch { return { error: 'Não foi possível verificar o identificador. Tente novamente.' } }
}

export async function createTenantAction(data: { name: string; subdomain: string }) {
  try {
    const session = await exigirOperadorDaPlataforma()
    // Instituição, administrador vinculado e auditoria são gravados juntos.
    const tenant = await createTenant(data, session.userId)
    revalidatePath('/admin/tenants')
    return { tenant }
  } catch (err) {
    if (err instanceof ConflictError || (err && typeof err === 'object' && 'code' in err && err.code === 'P2002')) return { error: 'Este identificador já está em uso. Escolha outro e tente novamente.' }
    return { error: err instanceof Error ? err.message : 'Erro ao criar instituição' }
  }
}

export async function joinAsTenantAdminAction(tenantId: string) {
  try {
    const session = await exigirOperadorDaPlataforma()
    await authApi.provisionTenantAdmin(tenantId, session.role)
    await auditarAdmin({ tenantId, autorId: session.userId, action: 'INSTITUICAO_PROVISIONAR_ADMIN', entity: 'Tenant', entityId: tenantId, details: { autorTenantId: session.tenantId } })
    revalidatePath('/admin/tenants')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao entrar na instituição' }
  }
}

export async function updateTenantStatusAction(id: string, status: TenantStatus) {
  if (!VALID_STATUSES.includes(status)) {
    return { error: 'Status inválido' }
  }
  try {
    const session = await exigirOperadorDaPlataforma()
    const antes = await prisma.tenant.findUnique({ where: { id }, select: { status: true } }).catch(() => null)
    await updateTenant(id, { status })
    await auditarAdmin({ tenantId: id, autorId: session.userId, action: 'INSTITUICAO_STATUS', entity: 'Tenant', entityId: id, details: { alteracoes: diferencas(antes, { status }), autorTenantId: session.tenantId } })
    revalidatePath('/admin/tenants')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar status' }
  }
}

export async function updateTenantNameAction(id: string, name: string, subdomain?: string) {
  if (!name?.trim()) return { error: 'Nome não pode ser vazio' }
  try {
    const session = await exigirOperadorDaPlataforma()
    const antes = await prisma.tenant.findUnique({ where: { id }, select: { name: true, subdomain: true } }).catch(() => null)
    const data = { name: name.trim(), ...(subdomain !== undefined ? { subdomain: subdomain.trim().toLowerCase() } : {}) }
    await updateTenant(id, data)
    await auditarAdmin({ tenantId: id, autorId: session.userId, action: 'INSTITUICAO_RENOMEAR', entity: 'Tenant', entityId: id, details: { alteracoes: diferencas(antes, data), autorTenantId: session.tenantId } })
    revalidatePath('/admin/tenants')
    return {}
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') return { error: 'Este identificador já está em uso. Escolha outro.' }
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar instituição' }
  }
}

export async function joinTenantAction(tenantId: string, password: string) {
  try {
    const session = await exigirOperadorDaPlataforma()
    await authApi.joinTenant(tenantId, password)
    await auditarAdmin({ tenantId, autorId: session.userId, action: 'INSTITUICAO_ENTRAR', entity: 'Tenant', entityId: tenantId, details: { autorTenantId: session.tenantId } })
    revalidatePath('/admin/tenants')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao entrar na instituição' }
  }
}

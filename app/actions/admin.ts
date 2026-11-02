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

export async function toggleUserActiveAction(userId: string, active: boolean) {
  try {
    const session = await requireAdmin()
    const user = await comAuditoriaDeUsuario(session, active ? 'USUARIO_ATIVAR' : 'USUARIO_DESATIVAR', userId,
      () => adminApi.toggleActive(userId, active))
    revalidatePath('/admin/users')
    return { user }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar status do usuário' }
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

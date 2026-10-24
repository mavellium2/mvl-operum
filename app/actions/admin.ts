'use server'

import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { adminApi, authApi } from '@/lib/api-client'
import { createTenant, updateTenant, ConflictError } from '@/services/tenantService'
import { normalizarContato } from '@/lib/contato'
import { erroMoeda } from '@/lib/dinheiro'
import { exigirOperadorDaPlataforma } from '@/lib/platformOperator'

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
    await requireAdmin()
    const contato = normalizarContato(data, { emailObrigatorio: true })
    if (contato.error) return { error: contato.error }
    const user = await adminApi.createUser(contato.data as Record<string, unknown>)
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
    await requireAdmin()
    const contato = normalizarContato(data)
    if (contato.error) return { error: contato.error }
    if (data.hourlyRate !== undefined) {
      const erroValor = erroMoeda(data.hourlyRate, { rotulo: 'Valor/hora' })
      if (erroValor) return { error: erroValor }
    }
    const user = await adminApi.updateUser(userId, contato.data as Record<string, unknown>)
    revalidatePath('/admin/users')
    return { user }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar usuário' }
  }
}

export async function toggleUserActiveAction(userId: string, active: boolean) {
  try {
    await requireAdmin()
    const user = await adminApi.toggleActive(userId, active)
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
    await requireAdmin()
    const user = await adminApi.setRole(userId, role)
    revalidatePath('/admin/users')
    return { user }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar role do usuário' }
  }
}

const VALID_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'REMOVED'] as const
type TenantStatus = typeof VALID_STATUSES[number]

export async function createTenantAction(data: { name: string; subdomain: string }) {
  try {
    const session = await exigirOperadorDaPlataforma()
    const tenant = await createTenant(data)
    // Auto-provision creator as admin in the new tenant using their existing password hash.
    // Non-fatal: if this fails (e.g. already has access), the tenant was still created.
    try {
      await authApi.provisionTenantAdmin(tenant.id, session.role)
    } catch { /* swallow — creator can join via "Entrar" button */ }
    revalidatePath('/admin/tenants')
    return { tenant }
  } catch (err) {
    if (err instanceof ConflictError) return { error: 'Subdomínio já está em uso' }
    return { error: err instanceof Error ? err.message : 'Erro ao criar instituição' }
  }
}

export async function joinAsTenantAdminAction(tenantId: string) {
  try {
    const session = await exigirOperadorDaPlataforma()
    await authApi.provisionTenantAdmin(tenantId, session.role)
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
    await exigirOperadorDaPlataforma()
    await updateTenant(id, { status })
    revalidatePath('/admin/tenants')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar status' }
  }
}

export async function updateTenantNameAction(id: string, name: string) {
  if (!name?.trim()) return { error: 'Nome não pode ser vazio' }
  try {
    await exigirOperadorDaPlataforma()
    await updateTenant(id, { name: name.trim() })
    revalidatePath('/admin/tenants')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar nome' }
  }
}

export async function joinTenantAction(tenantId: string, password: string) {
  try {
    await exigirOperadorDaPlataforma()
    await authApi.joinTenant(tenantId, password)
    revalidatePath('/admin/tenants')
    return {}
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao entrar na instituição' }
  }
}

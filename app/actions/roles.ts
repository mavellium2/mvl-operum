'use server'

import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { rolesApi } from '@/lib/api-client'
import prisma from '@/lib/prisma'
import { funcaoKey } from '@/lib/utils/normalize'

export async function createRoleAction(
  _prevState: unknown,
  input: { name: string; scope: 'TENANT' | 'PROJETO'; description?: string },
) {
  try {
    await verifySession()
    const role = await rolesApi.create(input as Record<string, unknown>)
    return { role }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar role' }
  }
}

export async function getRolesAction(scope?: 'TENANT' | 'PROJETO') {
  try {
    await verifySession()
    const roles = await rolesApi.list() as Array<Record<string, unknown>>
    if (scope) return roles.filter(r => r.scope === scope)
    return roles
  } catch {
    return []
  }
}

export async function updateRoleAction(_prevState: unknown, id: string, data: Record<string, unknown>) {
  try {
    await verifySession()
    const role = await rolesApi.update(id, data)
    return { role }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar role' }
  }
}

export async function assignPermissionAction(roleId: string, permissionId: string) {
  try {
    await verifySession()
    await rolesApi.assignPermission(roleId, permissionId)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atribuir permissão' }
  }
}

export async function removePermissionAction(roleId: string, permissionId: string) {
  try {
    await verifySession()
    await rolesApi.removePermission(roleId, permissionId)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao remover permissão' }
  }
}

export async function getOrCreateRoleAction(name: string) {
  try {
    await verifySession()
    const roles = await rolesApi.list() as Array<{ id: string; name: string }>
    // Equivalência por funcaoKey (acento, caixa e plural), em qualquer escopo:
    // evita "Gerente de Projetos" ao lado do papel "Gerente de Projeto".
    const key = funcaoKey(name)
    const existing = roles.find(r => funcaoKey(r.name) === key)
    if (existing) return { role: existing }
    const role = await rolesApi.create({ name, scope: 'TENANT', nameKey: name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') })
    revalidatePath('/projetos')
    return { role }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar role' }
  }
}

export async function updateRoleNameAction(id: string, name: string) {
  try {
    await verifySession()
    const roles = await rolesApi.list() as Array<{ id: string; name: string }>
    const key = funcaoKey(name)
    const conflito = roles.find(r => r.id !== id && funcaoKey(r.name) === key)
    if (conflito) return { error: `Já existe a função "${conflito.name}".` }
    const role = await rolesApi.update(id, { name: name.trim() })
    return { role }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar role' }
  }
}

export async function deleteRoleAction(id: string) {
  try {
    const { role, tenantId } = await verifySession()
    // Remover função é do admin (o gateway exige); confere antes de mexer no banco,
    // e só na função da própria instituição.
    if (role !== 'admin') return { error: 'Acesso restrito a administradores' }
    if (!(await prisma.role.findFirst({ where: { id, tenantId }, select: { id: true } }))) return { error: 'Função não encontrada' }
    // Associações por projeto não existem mais: limpa as antigas em vez de bloquear.
    await prisma.projetoFuncao.deleteMany({ where: { funcaoId: id } })
    await rolesApi.delete(id)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao remover role' }
  }
}

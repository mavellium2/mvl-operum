'use server'

import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { departmentsApi } from '@/lib/api-client'
import prisma from '@/lib/prisma'
import { renomearDepartamentoNosProjetos } from '@/services/departamentosDoProjeto'

/** Renomear no cadastro também atualiza a lista de nomes gravada nos projetos. */
async function comRenomeacao<T>(tenantId: string, id: string, novoNome: unknown, atualizar: () => Promise<T>): Promise<T> {
  const antes = typeof novoNome === 'string'
    ? await prisma.department.findFirst({ where: { id, tenantId }, select: { name: true } })
    : null
  const resultado = await atualizar()
  if (antes && typeof novoNome === 'string') {
    try { await renomearDepartamentoNosProjetos(tenantId, antes.name, novoNome) } catch { /* documentos já leem o nome atual pela associação */ }
    revalidatePath('/projetos')
  }
  return resultado
}

export async function createDepartmentAction(
  _prevState: unknown,
  input: { name: string; description?: string; hourlyRate?: number },
) {
  try {
    await verifySession()
    const department = await departmentsApi.create(input as Record<string, unknown>)
    return { department }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar departamento' }
  }
}

export async function getDepartmentsAction() {
  try {
    await verifySession()
    return await departmentsApi.list()
  } catch {
    return []
  }
}

export async function updateDepartmentAction(_prevState: unknown, id: string, data: Record<string, unknown>) {
  try {
    const { tenantId } = await verifySession()
    const department = await comRenomeacao(tenantId, id, data.name, () => departmentsApi.update(id, data))
    return { department }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar departamento' }
  }
}

export async function deactivateDepartmentAction(id: string) {
  try {
    await verifySession()
    await departmentsApi.update(id, { active: false })
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao desativar departamento' }
  }
}

export async function getOrCreateDepartmentAction(name: string) {
  try {
    await verifySession()
    const list = await departmentsApi.list() as Array<{ id: string; name: string }>
    const existing = list.find(d => d.name.toLowerCase() === name.toLowerCase())
    if (existing) return { department: existing }
    const department = await departmentsApi.create({ name })
    revalidatePath('/projetos')
    return { department }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao salvar departamento' }
  }
}

export async function updateDepartmentNameAction(id: string, name: string) {
  try {
    const { tenantId } = await verifySession()
    const department = await comRenomeacao(tenantId, id, name.trim(), () => departmentsApi.update(id, { name: name.trim() }))
    return { department }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar departamento' }
  }
}

export async function deleteDepartmentAction(id: string) {
  try {
    const { role, tenantId } = await verifySession()
    // Remover departamento é do admin (o gateway exige); confere antes de mexer no
    // banco, e só no departamento da própria instituição.
    if (role !== 'admin') return { error: 'Acesso restrito a administradores' }
    if (!(await prisma.department.findFirst({ where: { id, tenantId }, select: { id: true } }))) return { error: 'Departamento não encontrado' }
    // Associações por projeto não existem mais: limpa as antigas em vez de bloquear.
    await prisma.projetoDepartamento.deleteMany({ where: { departamentoId: id } })
    await departmentsApi.delete(id)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao remover departamento' }
  }
}

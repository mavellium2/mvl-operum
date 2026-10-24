'use server'

import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { projectsApi } from '@/lib/api-client'

export async function createProjectAction(
  _prevState: unknown,
  input: { name: string; description?: string; initialMemberId?: string },
) {
  try {
    const { tenantId } = await verifySession()
    const project = await projectsApi.create({ name: input.name, description: input.description, tenantId }) as Record<string, unknown>
    if (input.initialMemberId) {
      await projectsApi.addMember(project.id as string, { userId: input.initialMemberId })
      // O novo membro pode estar parado em /no-project — libera o gate dele.
      revalidatePath('/no-project')
      revalidatePath('/')
    }
    revalidatePath('/projetos')
    return { project }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar projeto' }
  }
}

export async function getProjectsAction() {
  try {
    const result = await projectsApi.list()
    return result.items
  } catch {
    return []
  }
}

export async function getProjectAction(id: string) {
  try {
    await verifySession()
    const project = await projectsApi.get(id)
    return { project }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Projeto não encontrado' }
  }
}

export async function updateProjectAction(
  _prevState: unknown,
  id: string,
  data: Record<string, unknown>,
) {
  try {
    await verifySession()
    const project = await projectsApi.update(id, data)
    revalidatePath('/projetos')
    revalidatePath(`/projetos/${id}`)
    return { project }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar projeto' }
  }
}

export async function deleteProjectAction(id: string) {
  try {
    await verifySession()
    await projectsApi.delete(id)
    revalidatePath('/projetos')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao remover projeto' }
  }
}

export async function addMemberAction(projectId: string, userId: string) {
  try {
    await verifySession()
    await projectsApi.addMember(projectId, { userId })
    revalidatePath(`/projetos/${projectId}/membros`)
    revalidatePath(`/projetos/${projectId}`)
    // O membro adicionado pode estar parado em /no-project — libera o gate dele.
    revalidatePath('/no-project')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao adicionar membro' }
  }
}

export async function removeMemberAction(projectId: string, userId: string) {
  try {
    await verifySession()
    await projectsApi.removeMember(projectId, userId)
    revalidatePath(`/projetos/${projectId}/membros`)
    revalidatePath(`/projetos/${projectId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao remover membro' }
  }
}

export async function getMembersAction(projectId: string) {
  try {
    await verifySession()
    return await projectsApi.getMembers(projectId)
  } catch {
    return []
  }
}

export async function updateUserProjectAction(
  userId: string,
  projectId: string,
  data: Record<string, unknown>,
) {
  try {
    await verifySession()
    // Só os campos do vínculo (role, departamento, valor/hora): o resto é descartado.
    const { role, departmentId, hourlyRate } = data
    await projectsApi.addMember(projectId, { userId, role, departmentId, hourlyRate })
    revalidatePath(`/projetos/${projectId}/membros`)
    revalidatePath(`/projetos/${projectId}`)
    revalidatePath('/admin/users')
    // O vínculo do usuário mudou (ativado/desativado) — libera o gate dele.
    revalidatePath('/no-project')
    revalidatePath('/')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar membro' }
  }
}

export async function getUserProjectsAction(userId: string) {
  try {
    await verifySession()
    return await projectsApi.getUserProjects(userId)
  } catch {
    return []
  }
}

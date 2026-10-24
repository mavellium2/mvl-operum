'use server'

import { PutObjectCommand } from '@aws-sdk/client-s3'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { stakeholdersApi, projectsApi } from '@/lib/api-client'
import { s3, BUCKET, publicUrl } from '@/lib/minio'
import prisma from '@/lib/prisma'
import { normalizarContato } from '@/lib/contato'

interface StakeholderInput {
  name: string
  company?: string
  competence?: string
  email?: string
  phone?: string
  cep?: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade?: string
  estado?: string
  notes?: string
  logoUrl?: string
}

export async function createStakeholderAction(data: StakeholderInput, projectId?: string) {
  try {
    await verifySession()
    const contato = normalizarContato(data)
    if (contato.error) return { error: contato.error }
    const stakeholder = await stakeholdersApi.create(contato.data as unknown as Record<string, unknown>, projectId)
    if (projectId) {
      await stakeholdersApi.linkProject((stakeholder as { id: string }).id, projectId)
      revalidatePath(`/projetos/${projectId}/stakeholders`)
    }
    return { success: true, stakeholder }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar stakeholder.' }
  }
}

export async function updateStakeholderAction(stakeholderId: string, data: StakeholderInput, projectId: string) {
  try {
    const { tenantId } = await verifySession()
    // Valores já salvos passam sem validar: dados antigos não bloqueiam a edição de outros campos.
    const atual = await prisma.stakeholder.findFirst({ where: { id: stakeholderId, tenantId }, select: { email: true, phone: true } })
    const contato = normalizarContato(data, { atual })
    if (contato.error) return { error: contato.error }
    const stakeholder = await stakeholdersApi.update(stakeholderId, contato.data as unknown as Record<string, unknown>, projectId)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true, stakeholder }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar stakeholder.' }
  }
}

/**
 * Inativa (com motivo) ou reativa um stakeholder externo. A inativação mantém o
 * vínculo com o projeto: ele continua nos documentos, destacado como inativo.
 * A autorização é a da edição do cadastro (projeto:equipe em todos os projetos
 * onde ele aparece), aplicada pelo gateway.
 */
export async function setStakeholderAtivoAction(
  projectId: string,
  stakeholderId: string,
  ativo: boolean,
  motivo?: string,
) {
  try {
    await verifySession()
    const reason = (motivo ?? '').trim()
    if (!ativo && reason.length < 3) return { error: 'Informe o motivo da inativação.' }
    if (reason.length > 500) return { error: 'O motivo pode ter no máximo 500 caracteres.' }
    const stakeholder = await stakeholdersApi.update(
      stakeholderId,
      (ativo ? { isActive: true } : { isActive: false, inactiveReason: reason }) as unknown as Record<string, unknown>,
      projectId,
    )
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true as const, stakeholder }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar a situação do stakeholder.' }
  }
}

export async function bindStakeholderAction(projectId: string, stakeholderId: string) {
  try {
    await verifySession()
    await stakeholdersApi.linkProject(stakeholderId, projectId)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao vincular stakeholder ao projeto.' }
  }
}

export async function unbindStakeholderAction(projectId: string, stakeholderId: string) {
  try {
    await verifySession()
    await stakeholdersApi.unlinkProject(stakeholderId, projectId)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao remover stakeholder do projeto.' }
  }
}

export async function reorderStakeholdersAction(projectId: string, orderedIds: string[]) {
  try {
    await verifySession()
    await stakeholdersApi.reorderByProject(projectId, orderedIds)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao reordenar stakeholders.' }
  }
}

export async function reorderMembersAction(projectId: string, orderedUserIds: string[]) {
  try {
    await verifySession()
    await projectsApi.reorderMembers(projectId, orderedUserIds)
    revalidatePath(`/projetos/${projectId}/stakeholders`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao reordenar membros.' }
  }
}

const SIGNATURE_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg']
const SIGNATURE_MAX_BYTES = 2 * 1024 * 1024

export async function uploadMemberSignatureAction(formData: FormData, userId: string) {
  try {
    const { role, userId: callerId, tenantId } = await verifySession()
    if (role !== 'admin' && callerId !== userId) {
      return { error: 'Não autorizado' }
    }

    if (!(await prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null }, select: { id: true } }))) return { error: 'Usuário não encontrado' }
    const file = formData.get('file') as File
    if (!file || file.size === 0) return { error: 'Arquivo inválido' }
    if (!SIGNATURE_ALLOWED_TYPES.includes(file.type)) return { error: 'Apenas PNG e JPEG são aceitos' }
    if (file.size > SIGNATURE_MAX_BYTES) return { error: 'Arquivo excede 2 MB' }

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const key = `signatures/${userId}/signature-${Date.now()}.${ext}`

    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: Buffer.from(await file.arrayBuffer()),
        ContentType: file.type,
      }),
    )

    const signatureUrl = publicUrl(key)
    await prisma.user.update({ where: { id: userId, tenantId }, data: { signatureUrl } })
    return { signatureUrl }
  } catch (err) {
    console.error('[uploadMemberSignatureAction]', err)
    return { error: err instanceof Error ? err.message : 'Erro ao fazer upload da assinatura' }
  }
}

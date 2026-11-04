'use server'

import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { filesApi, cardsApi } from '@/lib/api-client'

const CUID_RE = /^c[a-z0-9]{20,30}$/
const MAX_FILENAME_LENGTH = 255
// Reject path separators, null bytes, and traversal sequences
const UNSAFE_FILENAME_RE = /[/\\:*?"<>|\x00]|\.\./

function assertCuid(id: string, label = 'ID'): void {
  if (!id || !CUID_RE.test(id)) throw new Error(`${label} inválido`)
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > MAX_FILENAME_LENGTH) {
    throw new Error(`Nome deve ter entre 1 e ${MAX_FILENAME_LENGTH} caracteres`)
  }
  if (UNSAFE_FILENAME_RE.test(trimmed)) {
    throw new Error('Nome de arquivo contém caracteres inválidos')
  }
  return trimmed
}

export async function listCardAttachmentsAction(cardId: string) {
  try {
    assertCuid(cardId, 'cardId')
    await verifySession()
    await cardsApi.get(cardId)
    const attachments = await filesApi.listByCards([cardId])
    return { attachments: attachments.map(({ createdAt, ...attachment }) => ({
      ...attachment, uploadedAt: new Date(createdAt).getTime(),
    })) }
  } catch {
    return { error: 'Não foi possível carregar os anexos do card.' }
  }
}

export async function setCoverAction(cardId: string, attachmentId: string) {
  try {
    assertCuid(cardId, 'cardId')
    assertCuid(attachmentId, 'attachmentId')
    await verifySession()
    await cardsApi.get(cardId)  // IDOR guard: antes esta action não conferia nem o card
    await filesApi.setCover(cardId, attachmentId)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao definir capa' }
  }
}

export async function renameAttachmentAction(attachmentId: string, cardId: string, fileName: string) {
  try {
    assertCuid(attachmentId, 'attachmentId')
    assertCuid(cardId, 'cardId')
    const safeName = sanitizeFileName(fileName)
    // Verify session and that the caller has read access to the card (IDOR guard)
    await verifySession()
    await cardsApi.get(cardId)  // throws if card is inaccessible to this user's tenant
    await filesApi.rename(attachmentId, safeName, cardId)  // file-service confere que o anexo é desse card
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao renomear anexo' }
  }
}

export async function getAttachmentUrlAction(attachmentId: string, cardId: string) {
  try {
    assertCuid(attachmentId, 'attachmentId')
    assertCuid(cardId, 'cardId')
    await verifySession()
    await cardsApi.get(cardId)  // IDOR guard
    const { url } = await filesApi.getPresignedUrl(attachmentId, cardId)
    return { url }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao obter URL do anexo' }
  }
}

export async function deleteAttachmentAction(attachmentId: string, cardId?: string) {
  try {
    assertCuid(attachmentId, 'attachmentId')
    await verifySession()
    if (cardId) {
      assertCuid(cardId, 'cardId')
      await cardsApi.get(cardId)  // IDOR guard: verify card is accessible
    }
    await filesApi.delete(attachmentId, cardId)
    revalidatePath('/arquivos')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao excluir anexo' }
  }
}

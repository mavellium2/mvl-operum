'use server'

import { verifySession } from '@/lib/dal'
import { cardsApi } from '@/lib/api-client'
import prisma from '@/lib/prisma'
import { permissoesNoProjeto } from '@/services/authz'
import { sprintPath } from '@/lib/sprintPath'

export async function createCommentAction(cardId: string, texto: string, mentionedUserIds?: string[]) {
  try {
    const { userId, tenantId } = await verifySession()
    const comment = await cardsApi.createComment(cardId, texto)
    if (Array.isArray(mentionedUserIds) && mentionedUserIds.length) {
      try {
        await notificarMencoes({ cardId, tenantId, userId, autor: comment.user.name, texto, mentionedUserIds })
      } catch (error) {
        console.error('[comentarios] Falha ao registrar notificações de menção', error)
      }
    }
    return { comment }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar comentário' }
  }
}

async function notificarMencoes({ cardId, tenantId, userId, autor, texto, mentionedUserIds }: {
  cardId: string
  tenantId: string
  userId: string
  autor: string
  texto: string
  mentionedUserIds: string[]
}) {
  const ids = [...new Set(mentionedUserIds.filter(id => typeof id === 'string' && id !== userId))].slice(0, 50)
  if (!ids.length) return
  const card = await prisma.card.findFirst({
    where: { id: cardId, deletedAt: null },
    select: { title: true, projectId: true, sprintId: true, sprint: { select: { projectId: true } } },
  })
  const projectId = card?.projectId ?? card?.sprint?.projectId
  if (!card || !projectId) return
  const projeto = await prisma.project.findFirst({
    where: { id: projectId, tenantId, deletedAt: null },
    select: {
      name: true,
      members: {
        where: { active: true, userId: { in: ids }, user: { tenantId, isActive: true, deletedAt: null } },
        select: { user: { select: { id: true, name: true, role: true } } },
      },
    },
  })
  if (!projeto) return
  const trecho = texto.replace(/^(?:\[anexo:c[a-z0-9]{20,30}\](?:\n|$))+/, '').trim()
  const registros = await Promise.all(projeto.members.map(async ({ user }) => {
    if (!trecho.includes(`@${user.name}`)) return null
    const permissoes = await permissoesNoProjeto(user.id, tenantId, user.role, projectId)
    if (!permissoes.has('projeto:ver') || !permissoes.has('quadro:ver')) return null
    const reference = permissoes.has('planilha:ver')
      ? `/projetos/${projectId}/planilha-custos`
      : card.sprintId ? sprintPath(card.sprintId, projectId, cardId) : `/projetos/${projectId}`
    return {
      userId: user.id,
      type: 'MENTIONED' as const,
      title: `${autor} mencionou você em ${projeto.name}`,
      message: `${card.title} · ${trecho.length > 220 ? `${trecho.slice(0, 217)}…` : trecho}`,
      reference,
      referenceType: 'CARD_MENTION',
    }
  }))
  const data = registros.filter(registro => registro !== null)
  if (data.length) await prisma.notification.createMany({ data })
}

export async function getCommentsAction(cardId: string) {
  try {
    await verifySession()
    const comments = await cardsApi.listComments(cardId)
    return { comments }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao buscar comentários', comments: [] as never[] }
  }
}

export async function updateCommentAction(cardId: string, commentId: string, content: string) {
  try {
    await verifySession()
    // Authorization: sprint-service enforces ownership — throws ForbiddenException (403)
    // if x-user-id (injected by API gateway from session) !== comment.userId.
    // The catch below surfaces that as { error: 'Sem permissão para editar' }.
    // The UI additionally renders the edit button only for the current user's comments.
    await cardsApi.updateComment(cardId, commentId, content)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao editar comentário' }
  }
}

export async function deleteCommentAction(cardId: string, commentId: string) {
  try {
    await verifySession()
    // Authorization: same contract as updateCommentAction — server enforces ownership via
    // ForbiddenException; UI hides the delete button for comments not owned by currentUser.
    await cardsApi.deleteComment(cardId, commentId)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao excluir comentário' }
  }
}

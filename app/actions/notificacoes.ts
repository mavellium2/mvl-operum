'use server'

import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { notificationsApi } from '@/lib/api-client'
import prisma from '@/lib/prisma'

export async function getNotificacoesAction(filters?: { status?: string; type?: string }) {
  try {
    const { userId } = await verifySession()
    const notifications = await notificationsApi.list(userId) as Array<{ type: string; status: string }>
    if (filters?.type) return notifications.filter(n => n.type === filters.type)
    if (filters?.status) return notifications.filter(n => n.status === filters.status)
    return notifications
  } catch {
    return []
  }
}

export async function getUnreadMentionsAction() {
  try {
    const { userId } = await verifySession()
    return await prisma.notification.findMany({
      where: { userId, type: 'MENTIONED', status: 'UNREAD', deletedAt: null },
      select: { id: true, title: true, message: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  } catch {
    return []
  }
}

export async function markNotificacaoAsReadAction(id: string) {
  try {
    await verifySession()
    await notificationsApi.markRead(id)
    revalidatePath('/notificacoes')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error marking as read' }
  }
}

export async function markAllAsReadAction() {
  try {
    const { userId } = await verifySession()
    await notificationsApi.markAllRead(userId)
    revalidatePath('/notificacoes')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error marking all as read' }
  }
}

export async function archiveNotificacaoAction(id: string) {
  try {
    await verifySession()
    await notificationsApi.archive(id)
    revalidatePath('/notificacoes')
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error archiving notification' }
  }
}

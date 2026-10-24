import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, NotificationStatus } from '../../lib/generated/prisma'
import { prisma } from '../prisma'
import { CreateNotificationDto } from './dto/create-notification.dto'

@Injectable()
export class NotificationService {
  private readonly prisma = prisma

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type,
        title: dto.title,
        message: dto.message,
        reference: dto.reference,
        referenceType: dto.referenceType,
      },
    })
  }

  async findAllByUser(userId: string, status?: string, limit = 50) {
    const where: Prisma.NotificationWhereInput = { userId, deletedAt: null }
    if (status) where.status = status as NotificationStatus

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  /** Com `ownerId`, a notificação precisa ser dessa pessoa (senão 404, sem revelar que existe). */
  async findById(id: string, ownerId?: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, deletedAt: null, ...(ownerId ? { userId: ownerId } : {}) },
    })
    if (!notification) throw new NotFoundException('Notification not found')
    return notification
  }

  async markAsRead(id: string, ownerId?: string) {
    await this.findById(id, ownerId)
    return this.prisma.notification.update({
      where: { id },
      data: { status: 'READ', readAt: new Date() },
    })
  }

  async markAsArchived(id: string, ownerId?: string) {
    await this.findById(id, ownerId)
    return this.prisma.notification.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    })
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, status: 'UNREAD', deletedAt: null },
      data: { status: 'READ', readAt: new Date() },
    })
  }

  async softDelete(id: string, ownerId?: string) {
    await this.findById(id, ownerId)
    return this.prisma.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  async countUnread(userId: string) {
    return this.prisma.notification.count({
      where: { userId, status: 'UNREAD', deletedAt: null },
    })
  }
}

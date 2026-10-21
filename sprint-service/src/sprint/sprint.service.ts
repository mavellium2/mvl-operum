import { isTransactionConflict } from '../common/transaction-conflict'
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '../prisma'
import { assertColumn, assertProject, PUBLIC_USER_SELECT, sprintInTenant } from '../common/tenant-scope'
import { z } from 'zod'

export const CreateSprintSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  projectId: z.string().optional(),
  createdBy: z.string().optional(),
})

export const UpdateSprintSchema = CreateSprintSchema.partial().extend({
  qualidade: z.number().optional(),
  dificuldade: z.number().optional(),
})

export const CreateColumnSchema = z.object({
  title: z.string().min(1),
  position: z.number().int(),
  /** Cor da coluna em hex (#rrggbb); null volta para a aparência padrão. */
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Cor inválida').nullable().optional(),
})

export type CreateSprintDto = z.infer<typeof CreateSprintSchema>
export type UpdateSprintDto = z.infer<typeof UpdateSprintSchema>
export type CreateColumnDto = z.infer<typeof CreateColumnSchema>

export const DEFAULT_SPRINT_COLUMNS = ['A Fazer', 'Em andamento', 'Em teste', 'Concluído']

@Injectable()
export class SprintService {
  async list(tenantId: string, projectId?: string, authorized?: string[]) {
    return prisma.sprint.findMany({
      where: { deletedAt: null, ...sprintInTenant(tenantId), ...(projectId ? { projectId } : {}), ...(authorized ? { AND: [{ projectId: { in: authorized } }] } : {}) },
      include: { sprintColumns: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(tenantId: string, id: string) {
    const sprint = await prisma.sprint.findFirst({
      where: { id, deletedAt: null, ...sprintInTenant(tenantId) },
      include: {
        sprintColumns: { orderBy: { position: 'asc' } },
        cards: { where: { deletedAt: null }, orderBy: { position: 'asc' } },
      },
    })
    if (!sprint) throw new NotFoundException('Sprint não encontrada')
    return sprint
  }

  async create(tenantId: string, dto: CreateSprintDto) {
    // Sprint sem projeto ficaria fora de qualquer tenant — projectId é obrigatório.
    if (!dto.projectId) throw new BadRequestException('projectId é obrigatório')
    await assertProject(tenantId, dto.projectId)
    const sprint = await prisma.sprint.create({
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    })

    // Colunas padrão além do backlog — A Fazer, Em andamento, Em teste, Concluído.
    await prisma.sprintColumn.createMany({
      data: DEFAULT_SPRINT_COLUMNS.map((title, position) => ({ title, position, sprintId: sprint.id })),
    })

    return sprint
  }

  async update(tenantId: string, id: string, dto: UpdateSprintDto) {
    await this.findOne(tenantId, id)
    if (dto.projectId) await assertProject(tenantId, dto.projectId)
    return prisma.sprint.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    })
  }

  async remove(tenantId: string, id: string) {
    // SERIALIZABLE protects the backlog tail and the sprint/card snapshot.
    // Retry only serialization conflicts; validation and write failures roll back.
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(async tx => {
          const sprint = await tx.sprint.findFirst({
            where: { id, deletedAt: null, ...sprintInTenant(tenantId) },
            select: { projectId: true },
          })
          if (!sprint) throw new NotFoundException('Sprint não encontrada')
          if (!sprint.projectId) throw new ConflictException('Sprint sem projeto: corrija o vínculo antes de excluir')
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'eap-sprint:' + sprint.projectId}))`
          const cards = await tx.card.findMany({
            where: { sprintId: id, deletedAt: null },
            select: { id: true, projectId: true },
            orderBy: [{ sprintColumn: { position: 'asc' } }, { sprintPosition: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          })
          if (cards.some(card => card.projectId && card.projectId !== sprint.projectId)) {
            throw new ConflictException('Há cards vinculados a outro projeto: corrija os vínculos antes de excluir a sprint')
          }
          const tail = await tx.card.aggregate({
            where: { projectId: sprint.projectId, sprintId: null, deletedAt: null },
            _max: { position: true },
          })
          let position = (tail._max.position ?? -1) + 1
          for (const card of cards) {
            await tx.card.update({
              where: { id: card.id },
              data: { projectId: sprint.projectId, sprintId: null, sprintColumnId: null, sprintPosition: null, position: position++ },
            })
          }
          await tx.sprint.update({ where: { id }, data: { deletedAt: new Date() } })
        }, { isolationLevel: 'Serializable' })
      } catch (error) {
        if (isTransactionConflict(error)) {
          if (attempt < 2) continue
          throw new ConflictException('O backlog foi alterado durante a exclusão. Tente novamente')
        }
        throw error
      }
    }
  }

  async listColumns(tenantId: string, sprintId: string, timeMode: 'full' | 'summary' = 'full') {
    await this.findOne(tenantId, sprintId)
    const columns = await prisma.sprintColumn.findMany({
      where: { sprintId, deletedAt: null },
      orderBy: { position: 'asc' },
      include: {
        cards: {
          where: { deletedAt: null },
          orderBy: { sprintPosition: 'asc' },
          include: {
            tags: { include: { tag: true } },
            responsibles: { include: { user: { select: PUBLIC_USER_SELECT } } },
            timeEntries: timeMode === 'summary'
              ? { where: { deletedAt: null, isRunning: true, user: { tenantId, deletedAt: null } }, select: { id: true, userId: true, startedAt: true, isRunning: true, duration: true } }
              : { where: { deletedAt: null } },
          },
        },
      },
    })
    if (timeMode === 'full') return columns
    const ids = columns.flatMap(column => column.cards.map(card => card.id))
    const totals = ids.length ? await prisma.timeEntry.groupBy({
      by: ['cardId'], where: { cardId: { in: ids }, deletedAt: null, isRunning: false, user: { tenantId, deletedAt: null } }, _sum: { duration: true },
    }) : []
    const byCard = new Map(totals.map(row => [row.cardId, row._sum.duration ?? 0]))
    return columns.map(column => ({ ...column, cards: column.cards.map(card => ({ ...card, totalDurationSeconds: byCard.get(card.id) ?? 0 })) }))
  }

  async createColumn(tenantId: string, sprintId: string, dto: CreateColumnDto) {
    await this.findOne(tenantId, sprintId)
    return prisma.sprintColumn.create({ data: { sprintId, ...dto } })
  }

  async updateColumn(tenantId: string, sprintId: string, columnId: string, dto: Partial<CreateColumnDto>) {
    await assertColumn(tenantId, sprintId, columnId)
    return prisma.sprintColumn.update({ where: { id: columnId }, data: dto })
  }

  async deleteColumn(tenantId: string, sprintId: string, columnId: string) {
    await assertColumn(tenantId, sprintId, columnId)
    await prisma.sprintColumn.update({ where: { id: columnId }, data: { deletedAt: new Date() } })
  }
}

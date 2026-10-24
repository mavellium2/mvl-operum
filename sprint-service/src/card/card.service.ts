import { colunaExigeResponsavel, mensagemSemResponsavel, mensagemUltimoResponsavel } from './responsavel-obrigatorio'
import { isTransactionConflict } from '../common/transaction-conflict'
import { BadRequestException, ConflictException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { prisma } from '../prisma'
import type { Prisma } from '../../lib/generated/prisma'
import { sprintInTenant } from '../common/tenant-scope'
import {
  assertCard,
  assertColumn,
  assertProject,
  assertSprint,
  assertTag,
  assertUserInTenant,
  cardInTenant,
  PUBLIC_USER_SELECT,
} from '../common/tenant-scope'
import { z } from 'zod'
import { TaskPageQuerySchema, taskPageScope, readTaskCursor, writeTaskCursor, taskPageBoundary } from './task-page'

export const CreateCardSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  color: z.string().optional(),
  position: z.number().int().optional(),
  sprintId: z.string().min(1).optional(),
  sprintColumnId: z.string().min(1).optional(),
  sprintPosition: z.number().int().optional(),
  projectId: z.string().min(1).optional(),
  priority: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
})

/** Ids a conferir (file-service): quais são cards do tenant. */
export const CardsInTenantSchema = z
  .object({ ids: z.array(z.string().min(1).max(64)).max(500) })
  .strict()

export const UpdateCardSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  color: z.string().optional(),
  position: z.number().int().optional(),
  sprintId: z.string().min(1).nullable().optional(),
  sprintColumnId: z.string().min(1).nullable().optional(),
  sprintPosition: z.number().int().nullable().optional(),
  projectId: z.string().min(1).optional(),
  priority: z.string().optional(),
  // null remove a data (ex.: tirar o prazo do card pela interface).
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  reason: z.string().optional(),
  userId: z.string().optional(),
})

/** undefined = não mexe; null = remove; string = nova data. */
function toDateUpdate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined
  return value === null ? null : new Date(value)
}

export type CreateCardDto = z.infer<typeof CreateCardSchema>
export type UpdateCardDto = z.infer<typeof UpdateCardSchema>

@Injectable()
export class CardService {
  async listPage(tenantId: string, raw: unknown) {
    const parsed = TaskPageQuerySchema.safeParse(raw)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message)
    const q = parsed.data
    const scope = taskPageScope(tenantId, q)
    const cursor = readTaskCursor(q.cursor, scope)
    return prisma.$transaction(async tx => {
      let projectId = q.projectId
      if (q.sprintId) {
        const sprint = await tx.sprint.findFirst({ where: { id: q.sprintId, deletedAt: null, project: { tenantId, deletedAt: null } }, select: { projectId: true } })
        if (!sprint || (projectId && projectId !== sprint.projectId)) throw new NotFoundException('Sprint não encontrada neste projeto')
        projectId = sprint.projectId
      }
      const project = await tx.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { id: true } })
      if (!project) throw new NotFoundException('Projeto não encontrado')
      const AND: Prisma.CardWhereInput[] = [{ deletedAt: null }, {
        OR: [
          { sprintId: null, projectId },
          { sprint: { projectId, deletedAt: null }, OR: [{ projectId: null }, { projectId }] },
        ],
      }, {
        OR: [{ sprintColumnId: null }, { sprintColumn: { deletedAt: null, sprint: { projectId, deletedAt: null, ...(q.sprintId ? { id: q.sprintId } : {}) } } }],
      }]
      if (q.sprintId) AND.push({ sprintId: q.sprintId })
      if (q.backlog === 'true') AND.push({ sprintId: null })
      if (q.columnId) AND.push({ sprintColumnId: q.columnId })
      if (q.priority) AND.push({ priority: q.priority })
      if (q.responsibleId) AND.push({ responsibles: { some: { userId: q.responsibleId, user: { tenantId, deletedAt: null } } } })
      if (q.dueBefore || q.dueAfter) AND.push({ endDate: { ...(q.dueBefore ? { lte: new Date(q.dueBefore) } : {}), ...(q.dueAfter ? { gte: new Date(q.dueAfter) } : {}) } })
      if (q.q) AND.push({ OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }] })
      const upperRow = cursor ? null : await tx.card.findFirst({ where: { AND }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { createdAt: true, id: true } })
      const upper = cursor?.upper ?? (upperRow ? { at: upperRow.createdAt.toISOString(), id: upperRow.id } : null)
      if (!upper) return { items: [], total: 0, next_cursor: null }
      AND.push(taskPageBoundary(upper, 'upper'))
      const total = await tx.card.count({ where: { AND } })
      if (cursor) AND.push(taskPageBoundary(cursor.after, 'after'))
      const rows = await tx.card.findMany({
        where: { AND }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: q.limit + 1,
        select: {
          id: true, title: true, priority: true, projectId: true, sprintId: true, sprintColumnId: true, startDate: true, endDate: true, createdAt: true,
          ...(q.fields === 'full' ? { description: true, color: true, position: true, sprintPosition: true, updatedAt: true } : {}),
          sprint: { select: { id: true, name: true } }, sprintColumn: { select: { id: true, title: true } },
          tags: { where: { tag: { tenantId } }, select: { tag: { select: { id: true, name: true, color: true } } } },
          responsibles: { where: { user: { tenantId, deletedAt: null } }, select: { user: { select: PUBLIC_USER_SELECT } } },
        },
      })
      const items = rows.slice(0, q.limit)
      return { items, total, next_cursor: rows.length > q.limit ? writeTaskCursor(scope, upper, items[items.length - 1]) : null }
    }, { isolationLevel: 'RepeatableRead' })
  }

  async listBacklog(tenantId: string, projectId: string) {
    await assertProject(tenantId, projectId)
    return prisma.card.findMany({
      where: { projectId, sprintId: null, deletedAt: null },
      include: {
        tags: { include: { tag: true } },
        responsibles: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
      orderBy: { position: 'asc' },
    })
  }

  async listBySprint(tenantId: string, sprintId: string) {
    await assertSprint(tenantId, sprintId)
    return prisma.card.findMany({
      where: { sprintId, deletedAt: null },
      include: {
        tags: { include: { tag: true } },
        responsibles: { include: { user: { select: PUBLIC_USER_SELECT } } },
      },
      orderBy: [{ sprintColumnId: 'asc' }, { position: 'asc' }],
    })
  }

  async search(
    tenantId: string,
    q: string,
    opts?: { authorized?: string[]; sprintId?: string; projectId?: string; inProjectId?: string; responsibleUserId?: string },
  ) {
    const AND: object[] = [cardInTenant(tenantId)]
    if (opts?.authorized) AND.push({ OR: [{ sprint: { projectId: { in: opts.authorized } } }, { sprintId: null, projectId: { in: opts.authorized } }] })
    // Card do projeto no backlog (projectId) OU numa sprint do projeto (card
    // criado dentro da sprint pode não ter projectId próprio).
    if (opts?.inProjectId) {
      AND.push({ OR: [{ projectId: opts.inProjectId }, { sprint: { projectId: opts.inProjectId } }] })
    }
    if (q) {
      AND.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      })
    }
    const where: Record<string, unknown> = { AND, deletedAt: null }
    if (opts?.sprintId) where.sprintId = opts.sprintId
    if (opts?.projectId) where.projectId = opts.projectId
    if (opts?.responsibleUserId) where.responsibles = { some: { userId: opts.responsibleUserId } }

    return prisma.card.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        responsibles: { include: { user: { select: PUBLIC_USER_SELECT } } },
        sprint: { select: { id: true, name: true, status: true, projectId: true } },
        sprintColumn: { select: { id: true, title: true } },
        timeEntries: { where: { deletedAt: null }, select: { duration: true } },
      },
      take: 50,
      orderBy: { updatedAt: 'desc' },
    })
  }

  /**
   * Dos ids informados, os de cards não excluídos do tenant. O file-service usa
   * para conferir o tenant antes de gravar ou devolver anexos: ele não conhece
   * cards nem tenants.
   */
  async idsInTenant(tenantId: string, ids: string[]): Promise<{ ids: string[] }> {
    if (ids.length === 0) return { ids: [] }
    const found = await prisma.card.findMany({
      where: { id: { in: [...new Set(ids)] }, deletedAt: null, ...cardInTenant(tenantId) },
      select: { id: true },
    })
    return { ids: found.map(c => c.id) }
  }

  async findOne(tenantId: string, id: string) {
    const card = await prisma.card.findFirst({
      where: { id, deletedAt: null, ...cardInTenant(tenantId) },
      include: {
        tags: { include: { tag: true } },
        responsibles: { include: { user: { select: PUBLIC_USER_SELECT } } },
        comments: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true } } } },
        timeEntries: { where: { deletedAt: null } },
      },
    })
    if (!card) throw new NotFoundException('Card não encontrado')
    return card
  }

  /** Valida que projeto, sprint e coluna referenciados pertencem ao tenant e são coerentes entre si. */
  private async assertPlacement(
    tenantId: string,
    placement: { projectId?: string | null; sprintId?: string | null; sprintColumnId?: string | null },
  ) {
    if (placement.projectId) await assertProject(tenantId, placement.projectId)
    if (placement.sprintId) await assertSprint(tenantId, placement.sprintId)
    if (placement.sprintColumnId) {
      if (!placement.sprintId) throw new BadRequestException('sprintColumnId exige sprintId')
      await assertColumn(tenantId, placement.sprintId, placement.sprintColumnId)
    }
  }

  async create(tenantId: string, dto: CreateCardDto) {
    // Card sem projeto nem sprint ficaria fora de qualquer tenant.
    if (!dto.projectId && !dto.sprintId) throw new BadRequestException('projectId ou sprintId é obrigatório')
    await this.assertPlacement(tenantId, dto)
    return prisma.card.create({
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      },
    })
  }

  async update(tenantId: string, id: string, dto: UpdateCardDto) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(async tx => {
          const { reason, userId, ...data } = dto
          const current = await tx.card.findFirst({ where: { id, deletedAt: null, ...cardInTenant(tenantId) } })
          if (!current) throw new NotFoundException('Card não encontrado')
          const placementChanged = data.projectId !== undefined || data.sprintId !== undefined || data.sprintColumnId !== undefined || data.sprintPosition !== undefined || data.position !== undefined
          if (!placementChanged) return tx.card.update({ where: { id }, data: { ...data, startDate: toDateUpdate(data.startDate), endDate: toDateUpdate(data.endDate) } })

          const sourceSprint = current.sprintId ? await tx.sprint.findFirst({ where: { id: current.sprintId, deletedAt: null, ...sprintInTenant(tenantId) } }) : null
          if (current.sprintId && !sourceSprint) throw new NotFoundException('Sprint não encontrada')
          const sourceProjectId = current.projectId ?? sourceSprint?.projectId
          if (!sourceProjectId || (current.projectId && sourceSprint && current.projectId !== sourceSprint.projectId)) {
            throw new ConflictException('Vínculo do card com o projeto é inconsistente')
          }
          const sprintId = data.sprintId !== undefined ? data.sprintId : current.sprintId
          const targetSprint = sprintId === current.sprintId ? sourceSprint : sprintId ? await tx.sprint.findFirst({ where: { id: sprintId, deletedAt: null, ...sprintInTenant(tenantId) } }) : null
          if (sprintId && !targetSprint) throw new NotFoundException('Sprint não encontrada')
          const projectId = data.projectId ?? targetSprint?.projectId ?? sourceProjectId
          if (targetSprint && targetSprint.projectId !== projectId) throw new BadRequestException('Projeto e sprint devem pertencer ao mesmo projeto')
          if (!await tx.project.findFirst({ where: { id: projectId, tenantId }, select: { id: true } })) throw new NotFoundException('Projeto não encontrado')
          const sprintColumnId = !sprintId ? null : data.sprintColumnId !== undefined ? data.sprintColumnId : sprintId !== current.sprintId ? null : current.sprintColumnId
          if (!sprintId && data.sprintColumnId) throw new BadRequestException('sprintColumnId exige sprintId')
          const targetColumn = sprintColumnId ? await tx.sprintColumn.findFirst({ where: { id: sprintColumnId, sprintId, deletedAt: null, sprint: sprintInTenant(tenantId) } }) : null
          if (sprintColumnId && !targetColumn) throw new NotFoundException('Coluna não encontrada')
          if (current.sprintColumnId && !current.sprintId) throw new ConflictException('Vínculo do card com a coluna é inconsistente')
          const sourceColumn = current.sprintColumnId ? await tx.sprintColumn.findFirst({ where: { id: current.sprintColumnId, sprintId: current.sprintId, sprint: sprintInTenant(tenantId) } }) : null
          if (current.sprintColumnId && !sourceColumn) throw new ConflictException('Vínculo do card com a coluna é inconsistente')
          const source = this.bucket(sourceProjectId, current.sprintId, current.sprintColumnId)
          const target = this.bucket(projectId, sprintId, sprintColumnId)
          const moved = source.key !== target.key
          if (moved && userId && !await tx.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } })) throw new NotFoundException('Usuário não encontrado')
          // A partir de "Em andamento" o card precisa de responsável (só ao mover para lá:
          // cards antigos que já estão na coluna continuam editáveis).
          if (moved && targetColumn && sprintId) {
            const colunas = await tx.sprintColumn.findMany({ where: { sprintId, deletedAt: null }, select: { id: true, title: true, position: true } })
            if (colunaExigeResponsavel(colunas, targetColumn.id) && await tx.cardResponsible.count({ where: { cardId: id } }) === 0) {
              throw new BadRequestException(mensagemSemResponsavel(targetColumn.title))
            }
          }

          await tx.card.update({ where: { id }, data: {
            ...data, projectId, sprintId, sprintColumnId,
            sprintPosition: sprintColumnId ? data.sprintPosition ?? current.sprintPosition : null,
            startDate: toDateUpdate(data.startDate), endDate: toDateUpdate(data.endDate),
          } })
          const requested = target.field === 'sprintPosition' ? data.sprintPosition : data.position
          await this.renumber(tx, target.where, target.field, projectId, { id, index: requested ?? (moved ? undefined : current[target.field] ?? undefined) })
          if (moved) await this.renumber(tx, source.where, source.field, sourceProjectId)
          if (moved) await tx.cardMovement.create({ data: {
            cardId: id, userId: userId ?? null,
            fromColumnId: current.sprintColumnId, fromColumnTitle: sourceColumn?.title ?? sourceSprint?.name ?? 'Backlog',
            toColumnId: sprintColumnId, toColumnTitle: targetColumn?.title ?? targetSprint?.name ?? 'Backlog',
            reason: reason ?? null,
          } })
          return tx.card.findUniqueOrThrow({ where: { id } })
        }, { isolationLevel: 'Serializable' })
      } catch (error) {
        if (isTransactionConflict(error)) {
          if (attempt < 2) continue
          throw new ConflictException('O quadro foi alterado durante a movimentação. Tente novamente')
        }
        throw error
      }
    }
  }

  private bucket(projectId: string, sprintId: string | null, columnId: string | null): { key: string; where: Prisma.CardWhereInput; field: 'position' | 'sprintPosition' } {
    if (sprintId && columnId) return { key: `column:${columnId}`, where: { sprintId, sprintColumnId: columnId }, field: 'sprintPosition' }
    if (sprintId) return { key: `sprint:${sprintId}`, where: { sprintId, sprintColumnId: null }, field: 'position' }
    return { key: `backlog:${projectId}`, where: { projectId, sprintId: null }, field: 'position' }
  }

  /** All reads/writes use the caller transaction; ties always resolve by creation and ID. */
  private async renumber(tx: Prisma.TransactionClient, where: Prisma.CardWhereInput, field: 'position' | 'sprintPosition', projectId: string, moved?: { id: string; index?: number }) {
    const cards = await tx.card.findMany({
      where: { ...where, deletedAt: null, ...(moved ? { id: { not: moved.id } } : {}) },
      orderBy: [{ [field]: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, position: true, sprintPosition: true, projectId: true },
    })
    if (cards.some(card => card.projectId && card.projectId !== projectId)) throw new ConflictException('Há cards com vínculo de projeto inconsistente no quadro')
    const ordered: { id: string; position: number | null | undefined }[] = cards.map(card => ({ id: card.id, position: card[field] }))
    if (moved) ordered.splice(Math.max(0, Math.min(moved.index ?? ordered.length, ordered.length)), 0, { id: moved.id, position: undefined })
    for (const [position, card] of ordered.entries()) {
      if (card.position !== position) await tx.card.update({ where: { id: card.id }, data: { [field]: position } })
    }
  }

  async listMovements(tenantId: string, cardId: string) {
    await assertCard(tenantId, cardId)
    return prisma.cardMovement.findMany({
      where: { cardId },
      orderBy: { movedAt: 'asc' },
    })
  }

  async remove(tenantId: string, id: string) {
    await assertCard(tenantId, id)
    await prisma.card.update({ where: { id }, data: { deletedAt: new Date() } })
  }

  async addTag(tenantId: string, cardId: string, tagId: string) {
    await assertCard(tenantId, cardId)
    await assertTag(tenantId, tagId)
    return prisma.cardTag.upsert({
      where: { cardId_tagId: { cardId, tagId } },
      create: { cardId, tagId },
      update: {},
    })
  }

  async removeTag(tenantId: string, cardId: string, tagId: string) {
    await assertCard(tenantId, cardId)
    await prisma.cardTag.delete({ where: { cardId_tagId: { cardId, tagId } } })
  }

  async addResponsible(tenantId: string, cardId: string, userId: string) {
    await assertCard(tenantId, cardId)
    await assertUserInTenant(tenantId, userId)
    return prisma.cardResponsible.upsert({
      where: { cardId_userId: { cardId, userId } },
      create: { cardId, userId },
      update: {},
    })
  }

  async removeResponsible(tenantId: string, cardId: string, userId: string) {
    await assertCard(tenantId, cardId)
    await prisma.$transaction(async tx => {
      const card = await tx.card.findUnique({ where: { id: cardId }, select: { sprintId: true, sprintColumnId: true } })
      if (card?.sprintId && card.sprintColumnId) {
        const colunas = await tx.sprintColumn.findMany({ where: { sprintId: card.sprintId, deletedAt: null }, select: { id: true, title: true, position: true } })
        const restantes = await tx.cardResponsible.count({ where: { cardId, userId: { not: userId } } })
        if (restantes === 0 && colunaExigeResponsavel(colunas, card.sprintColumnId)) {
          throw new BadRequestException(mensagemUltimoResponsavel(colunas.find(c => c.id === card.sprintColumnId)!.title))
        }
      }
      await tx.cardResponsible.delete({ where: { cardId_userId: { cardId, userId } } })
    })
  }

  async listTags(tenantId: string) {
    return prisma.tag.findMany({ where: { tenantId }, orderBy: { name: 'asc' } })
  }

  async createTag(tenantId: string, userId: string, name: string, color?: string) {
    return prisma.tag.upsert({
      where: { name_userId: { name, userId } },
      create: { tenantId, userId, name, color: color ?? '#6b7280' },
      update: { color: color ?? '#6b7280' },
    })
  }

  /** Etiquetas são pessoais: só a dona apaga (ou o admin da instituição). */
  async deleteTag(tenantId: string, tagId: string, quem: { userId: string; isAdmin: boolean }) {
    await assertTag(tenantId, tagId)
    if (!quem.isAdmin) {
      const dona = await prisma.tag.findFirst({ where: { id: tagId, tenantId, userId: quem.userId }, select: { id: true } })
      if (!dona) throw new ForbiddenException('Só quem criou a etiqueta pode apagá-la')
    }
    await prisma.tag.delete({ where: { id: tagId } })
  }
}

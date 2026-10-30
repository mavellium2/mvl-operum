import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import { prisma } from '../prisma'
import { assertUserInTenant } from '../common/tenant-scope'
import { z } from 'zod'
import type { Prisma } from '../../lib/generated/prisma'
import { isTransactionConflict } from '../common/transaction-conflict'

export const MacroFasesSchema = z.array(z.object({
  fase: z.string().trim().max(500),
  dataLimite: z.string().max(10).optional().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), 'Data limite inválida'),
  custo: z.string().max(50).optional().refine(value => !value || /^(?:\d+(?:[.,]\d+)?|\d{1,3}(?:\.\d{3})+(?:,\d+)?)$/.test(value), 'Custo inválido'),
}).strict()).max(500).superRefine((fases, ctx) => {
  const titles = new Set<string>()
  for (const [index, item] of fases.entries()) {
    if (!item.fase && (item.dataLimite || item.custo)) ctx.addIssue({ code: 'custom', path: [index, 'fase'], message: 'Informe o nome da macrofase' })
    if (!item.fase) continue
    const title = item.fase.toLowerCase()
    if (titles.has(title)) ctx.addIssue({ code: 'custom', path: [index, 'fase'], message: 'Macrofases duplicadas' })
    titles.add(title)
  }
}).transform(fases => fases.filter(f => f.fase))

export const CreateProjectSchema = z.object({
  macroFases: MacroFasesSchema.optional(),
  tenantId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  logoUrl: z.string().optional(),
  slogan: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  justificativa: z.string().optional(),
  objetivos: z.string().optional(),
  metodologia: z.string().optional(),
  descricaoProduto: z.string().optional(),
  premissas: z.string().optional(),
  restricoes: z.string().optional(),
  limitesAutoridade: z.string().optional(),
  semestre: z.string().optional(),
  /** Ano da turma AMS, independente de termo e ano calendário. */
  anoAms: z.enum(["1", "2"]).nullable().optional(),
  /** Termo do curso (ex.: "5") e turno — usados quando o período não é anual. */
  termo: z.string().max(20).optional(),
  turno: z.string().max(30).optional(),
  ano: z.number().int().optional(),
  departamentos: z.array(z.string()).optional(),
})

/**
 * Vínculo de membro: só estes campos chegam ao Prisma. Sem o schema, o corpo
 * era espalhado no upsert e podia trocar `projectId` (membro em projeto de
 * outra instituição), `active`, `order`... Campos desconhecidos são descartados.
 */
export const AddMemberSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  role: z.string().trim().max(500).nullable().optional(),
  departmentId: z.string().trim().min(1).max(128).nullable().optional(),
  hourlyRate: z.number().min(0).max(1_000_000).nullable().optional(),
})
export type AddMemberInput = z.infer<typeof AddMemberSchema>

export const UpdateProjectSchema = CreateProjectSchema.partial().omit({ tenantId: true }).extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'COMPLETED', 'ARCHIVED']).optional(),
})

export type CreateProjectDto = z.infer<typeof CreateProjectSchema>
export type UpdateProjectDto = z.infer<typeof UpdateProjectSchema>

@Injectable()
export class ProjectService {
  withoutDocuments<T extends object>(project: T) {
    const result = { ...project } as T & Record<string, unknown>
    for (const key of ['justificativa','objetivos','metodologia','descricaoProduto','premissas','restricoes','limitesAutoridade']) delete result[key]
    return result
  }

  async list(tenantId: string, page = 1, limit = 20, authorized?: string[]) {
    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      prisma.project.findMany({
        where: { tenantId, deletedAt: null, ...(authorized ? { id: { in: authorized } } : {}) },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { members: { where: { active: true } } },
          },
        },
      }),
      prisma.project.count({ where: { tenantId, deletedAt: null, ...(authorized ? { id: { in: authorized } } : {}) } }),
    ])
    return { items: items.map(p => this.withoutDocuments(p)), total, page, limit }
  }

  async findOne(id: string, tenantId: string) {
    const project = await prisma.project.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        members: true,
        macroFases: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] },
        stakeholders: { include: { stakeholder: true } },
      },
    })
    if (!project) throw new NotFoundException('Projeto não encontrado')
    return project
  }

  async create(dto: CreateProjectDto) {
    if (dto.anoAms && dto.semestre !== 'ano') throw new BadRequestException('Ano do AMS só pode ser informado no período Ano')
    const existing = await prisma.project.findFirst({
      where: { name: dto.name, tenantId: dto.tenantId, deletedAt: null },
    })
    if (existing) throw new ConflictException('Projeto com esse nome já existe')

    const { macroFases, ...fields } = dto
    const validated = macroFases === undefined ? undefined : this.validateMacroFases(macroFases)
    return this.transaction(async tx => {
      const project = await tx.project.create({ data: {
        ...fields,
        ...(dto.semestre !== undefined && dto.semestre !== 'ano' ? { anoAms: null } : {}),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        departamentos: dto.departamentos ?? [],
      } })
      if (validated !== undefined) await this.replaceMacroFases(tx, project.id, validated)
      return tx.project.findUniqueOrThrow({ where: { id: project.id } })
    })
  }

  async update(id: string, tenantId: string, dto: UpdateProjectDto) {
    const { macroFases, ...fields } = dto
    const validated = macroFases === undefined ? undefined : this.validateMacroFases(macroFases)
    return this.transaction(async tx => {
      const existing = await tx.project.findFirst({ where: { id, tenantId, deletedAt: null }, select: { id: true, semestre: true } })
      if (!existing) throw new NotFoundException('Projeto não encontrado')
      if (dto.anoAms && (dto.semestre ?? existing.semestre) !== 'ano') throw new BadRequestException('Ano do AMS só pode ser informado no período Ano')
      await tx.project.update({ where: { id }, data: {
        ...fields,
        ...(dto.semestre !== undefined && dto.semestre !== 'ano' ? { anoAms: null } : {}),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      } })
      if (validated !== undefined) await this.replaceMacroFases(tx, id, validated)
      return tx.project.findUniqueOrThrow({ where: { id } })
    })
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId)
    await prisma.project.update({ where: { id }, data: { deletedAt: new Date() } })
  }

  async getMembers(projectId: string, tenantId: string) {
    await this.findOne(projectId, tenantId)
    return prisma.userProject.findMany({
      where: { projectId, active: true },
      orderBy: { order: 'asc' },
    })
  }

  async reorderMembers(projectId: string, tenantId: string, orderedUserIds: string[]) {
    await this.findOne(projectId, tenantId)
    await Promise.all(
      orderedUserIds.map((userId, index) =>
        prisma.userProject.updateMany({
          where: { projectId, userId },
          data: { order: index },
        }),
      ),
    )
  }

  async addMember(projectId: string, tenantId: string, userId: string, input: Omit<AddMemberInput, 'userId'>) {
    await this.findOne(projectId, tenantId)
    await assertUserInTenant(userId, tenantId)
    const data = {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
      ...(input.hourlyRate !== undefined ? { hourlyRate: input.hourlyRate } : {}),
    }
    if (data.departmentId) {
      const dept = await prisma.department.findFirst({ where: { id: data.departmentId, tenantId }, select: { id: true } })
      if (!dept) throw new BadRequestException('Departamento inválido')
    }
    return prisma.userProject.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { ...data, userId, projectId },
      update: { ...data, active: true, inactiveReason: null, inactivatedAt: null },
    })
  }

  async removeMember(projectId: string, tenantId: string, userId: string) {
    await this.findOne(projectId, tenantId)
    // Desvincular não é inativar: sem motivo, o membro sai também de Stakeholders.
    await prisma.userProject.update({
      where: { userId_projectId: { userId, projectId } },
      data: { active: false, inactiveReason: null, inactivatedAt: null },
    })
  }

  /**
   * Inativa (com motivo) ou reativa um membro da equipe no projeto. Inativo perde o
   * acesso (active = false, como no desvincular), mas o motivo o mantém visível em
   * Stakeholders e nos documentos. Só vale para quem é ou foi membro do projeto.
   */
  async setMemberSituacao(projectId: string, tenantId: string, userId: string, ativo: boolean, motivo?: string) {
    await this.findOne(projectId, tenantId)
    const existing = await prisma.userProject.findUnique({ where: { userId_projectId: { userId, projectId } } })
    if (!existing) throw new NotFoundException('Membro não encontrado neste projeto')
    if (ativo) {
      return prisma.userProject.update({
        where: { id: existing.id },
        data: { active: true, endDate: null, inactiveReason: null, inactivatedAt: null },
      })
    }
    const reason = (motivo ?? '').trim()
    if (reason.length < 3) throw new BadRequestException('Informe o motivo da inativação.')
    if (reason.length > 500) throw new BadRequestException('O motivo pode ter no máximo 500 caracteres.')
    if (!existing.active) throw new BadRequestException('Este membro não está ativo no projeto.')
    const agora = new Date()
    return prisma.userProject.update({
      where: { id: existing.id },
      data: { active: false, endDate: agora, inactiveReason: reason, inactivatedAt: agora },
    })
  }

  async getUserActiveProjects(userId: string, tenantId: string, authorized?: string[]) {
    return prisma.userProject.findMany({
      where: { userId, active: true, ...(authorized ? { projectId: { in: authorized } } : {}), project: { tenantId, deletedAt: null } },
      include: { project: { select: { id: true, name: true, status: true } } },
    })
  }

  async listMacroFases(projectId: string, tenantId: string) {
    await this.findOne(projectId, tenantId)
    return prisma.projectMacroFase.findMany({ where: { projectId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] })
  }

  async upsertMacroFase(projectId: string, tenantId: string, fases: unknown) {
    const validated = this.validateMacroFases(fases)
    return this.transaction(async tx => {
      if (!await tx.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { id: true } })) throw new NotFoundException('Projeto não encontrado')
      return this.replaceMacroFases(tx, projectId, validated)
    })
  }

  private validateMacroFases(fases: unknown) {
    const parsed = MacroFasesSchema.safeParse(fases)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message)
    return parsed.data
  }

  private async replaceMacroFases(tx: Prisma.TransactionClient, projectId: string, fases: z.infer<typeof MacroFasesSchema>) {
    const previous = await tx.projectMacroFase.findMany({ where: { projectId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] })
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } })
    const normalize = (f: { fase: string; dataLimite?: string | null; custo?: string | null }) => ({ fase: f.fase, dataLimite: f.dataLimite ?? '', custo: f.custo ?? '' })
    if (project.macroFasesRevision > 0 && JSON.stringify(previous.map(normalize)) === JSON.stringify(fases.map(normalize))) return { count: previous.length }
    await tx.projectMacroFase.deleteMany({ where: { projectId } })
    const result = await tx.projectMacroFase.createMany({ data: fases.map((f, position) => ({ projectId, position, ...f })) })
    await tx.project.update({ where: { id: projectId }, data: { macroFasesRevision: { increment: 1 }, macroFasesSyncError: null } })
    return result
  }

  private async transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await prisma.$transaction(operation, { isolationLevel: 'Serializable' }) }
      catch (error) {
        if (!isTransactionConflict(error)) throw error
        if (attempt >= 2) throw new ConflictException('As macrofases foram alteradas durante a operação. Tente novamente')
      }
    }
  }
}

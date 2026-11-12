import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '../prisma'
import { assertProjectInTenant } from '../common/tenant-scope'
import { z } from 'zod'

export const CreateStakeholderSchema = z.object({
  tenantId: z.string(),
  name: z.string().min(1),
  logoUrl: z.string().optional(),
  company: z.string().optional(),
  competence: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  cep: z.string().optional(),
  logradouro: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  notes: z.string().optional(),
})

/** Motivo mínimo ao inativar: "x" não explica nada para quem ler o histórico depois. */
export const MIN_INACTIVE_REASON = 3
export const MAX_INACTIVE_REASON = 500

export const UpdateStakeholderSchema = CreateStakeholderSchema.partial()
  .omit({ tenantId: true })
  .extend({
    /** false inativa (exige inactiveReason); true reativa e limpa o motivo. */
    isActive: z.boolean().optional(),
    inactiveReason: z.string().trim().max(MAX_INACTIVE_REASON).optional(),
  })
  .superRefine((dto, ctx) => {
    if (dto.isActive === false && (dto.inactiveReason ?? '').length < MIN_INACTIVE_REASON) {
      ctx.addIssue({ code: 'custom', path: ['inactiveReason'], message: 'Informe o motivo da inativação.' })
    }
  })

export type CreateStakeholderDto = z.infer<typeof CreateStakeholderSchema>
export type UpdateStakeholderDto = z.infer<typeof UpdateStakeholderSchema>

@Injectable()
export class StakeholderService {
  async list(tenantId: string) {
    return prisma.stakeholder.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    })
  }

  async findOne(id: string, tenantId: string) {
    const s = await prisma.stakeholder.findFirst({
      where: { id, tenantId },
      include: { projects: { include: { project: true } } },
    })
    if (!s) throw new NotFoundException('Stakeholder não encontrado')
    return s
  }

  async create(dto: CreateStakeholderDto) {
    return prisma.stakeholder.create({ data: dto })
  }

  async update(id: string, tenantId: string, dto: UpdateStakeholderDto) {
    await this.findOne(id, tenantId)
    const { isActive, inactiveReason, ...dados } = dto
    const estado =
      isActive === false
        ? { isActive: false, inactiveReason: inactiveReason ?? null, inactivatedAt: new Date() }
        : isActive === true
          ? { isActive: true, inactiveReason: null, inactivatedAt: null }
          : {}
    return prisma.stakeholder.update({ where: { id }, data: { ...dados, ...estado } })
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId)
    await prisma.stakeholder.update({ where: { id }, data: { isActive: false, inactivatedAt: new Date() } })
  }

  async linkProject(stakeholderId: string, projectId: string, tenantId: string) {
    const contato = await this.findOne(stakeholderId, tenantId)
    await assertProjectInTenant(projectId, tenantId)
    // Uma pessoa é interna OU externa em cada projeto: quem é membro aqui não entra como externo.
    const userId = (contato as { userId?: string | null }).userId
    if (userId && await prisma.userProject.findFirst({ where: { projectId, userId, active: true }, select: { id: true } })) {
      throw new ConflictException('Esta pessoa já é interna neste projeto. Use "Mudar para externo".')
    }
    return prisma.projectStakeholder.upsert({
      where: { projectId_stakeholderId: { projectId, stakeholderId } },
      create: { projectId, stakeholderId },
      update: {},
    })
  }

  async unlinkProject(stakeholderId: string, projectId: string, tenantId: string) {
    await this.findOne(stakeholderId, tenantId)
    await prisma.projectStakeholder.delete({
      where: { projectId_stakeholderId: { projectId, stakeholderId } },
    })
  }

  async listByProject(projectId: string, tenantId: string) {
    await assertProjectInTenant(projectId, tenantId)
    return prisma.projectStakeholder.findMany({
      where: { projectId },
      include: { stakeholder: true },
      orderBy: { order: 'asc' },
    })
  }

  async reorderStakeholders(projectId: string, tenantId: string, orderedIds: string[]) {
    await assertProjectInTenant(projectId, tenantId)
    await Promise.all(
      orderedIds.map((stakeholderId, index) =>
        prisma.projectStakeholder.updateMany({
          where: { projectId, stakeholderId },
          data: { order: index },
        }),
      ),
    )
  }
}

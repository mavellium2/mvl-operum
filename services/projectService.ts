import prisma from '@/lib/prisma'
import { CreateProjectSchema, UpdateProjectSchema } from '@/lib/validation/projectSchemas'
import type { CreateProjectInput, UpdateProjectInput, MacroFaseInput } from '@/lib/validation/projectSchemas'
import {
  setProjectManagerRole,
  removeProjectRole,
  isProjectManager,
  countProjectManagers,
} from './projectRoleService'

const activeOnly = { deletedAt: null } as const

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export async function createProject(input: CreateProjectInput) {
  const parsed = CreateProjectSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  const {
    name, tenantId, description,
    logoUrl, slogan, location, startDate, endDate,
    justificativa, objetivos, metodologia, descricaoProduto,
    premissas, restricoes, limitesAutoridade,
    semestre, anoAms, termo, turno, ano, departamentos,
    macroFases,
  } = parsed.data

  if (anoAms && semestre !== 'ano') throw new Error('Ano do AMS só pode ser informado no período Ano')

  const existing = await prisma.project.findFirst({
    where: { name, tenantId, ...activeOnly },
  })
  if (existing) {
    throw new ConflictError('Project with this name already exists in this tenant')
  }

  return prisma.project.create({
    data: {
      name,
      tenantId,
      description:       description       ?? undefined,
      logoUrl:           logoUrl           ?? undefined,
      slogan:            slogan            ?? undefined,
      location:          location          ?? undefined,
      startDate:         startDate ? new Date(startDate) : undefined,
      endDate:           endDate   ? new Date(endDate)   : undefined,
      justificativa:     justificativa     ?? undefined,
      objetivos:         objetivos         ?? undefined,
      metodologia:       metodologia       ?? undefined,
      descricaoProduto:  descricaoProduto  ?? undefined,
      premissas:         premissas         ?? undefined,
      restricoes:        restricoes        ?? undefined,
      limitesAutoridade: limitesAutoridade ?? undefined,
      semestre:          semestre          ?? undefined,
      anoAms:            semestre === 'ano' ? anoAms ?? null : null,
      termo:             termo             ?? undefined,
      turno:             turno             ?? undefined,
      ano:               ano               ?? undefined,
      departamentos:     departamentos     ?? [],
      macroFases: {
        create: (macroFases ?? [])
          .filter(f => f.fase.trim() !== '')
          .map(f => ({ fase: f.fase, dataLimite: f.dataLimite, custo: f.custo })),
      },
    },
  })
}

export async function findAllByTenant(tenantId: string) {
  return prisma.project.findMany({
    where: { tenantId, ...activeOnly },
    orderBy: { createdAt: 'asc' },
  })
}

export async function findById(id: string) {
  return prisma.project.findUnique({
    where: { id, ...activeOnly },
    include: {
      _count:     { select: { sprints: true } },
      macroFases: { orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function updateProject(
  id: string,
  input: UpdateProjectInput & { macroFases?: MacroFaseInput[] },
) {
  const { macroFases, ...projectFields } = input
  const parsed = UpdateProjectSchema.safeParse(projectFields)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  const existing = await prisma.project.findUnique({
    where: { id, ...activeOnly },
  })
  if (!existing) {
    throw new NotFoundError('Project not found')
  }

  if (parsed.data.anoAms && (parsed.data.semestre ?? existing.semestre) !== 'ano') throw new Error('Ano do AMS só pode ser informado no período Ano')

  if (existing.status === 'COMPLETED' || existing.status === 'ARCHIVED') {
    throw new Error('Cannot modify a completed or archived project')
  }

  const { startDate, endDate, departamentos, ...rest } = parsed.data

  return prisma.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id },
      data: {
        ...rest,
        ...(rest.semestre !== undefined && rest.semestre !== 'ano' ? { anoAms: null } : {}),
        startDate:     startDate     ? new Date(startDate) : undefined,
        endDate:       endDate       ? new Date(endDate)   : undefined,
        ...(departamentos !== undefined && { departamentos }),
      },
    })

    if (macroFases !== undefined) {
      await tx.projectMacroFase.deleteMany({ where: { projectId: id } })
      const toCreate = macroFases.filter(f => f.fase.trim() !== '')
      if (toCreate.length > 0) {
        await tx.projectMacroFase.createMany({
          data: toCreate.map(f => ({
            projectId:  id,
            fase:       f.fase,
            dataLimite: f.dataLimite,
            custo:      f.custo,
          })),
        })
      }
    }

    return updated
  })
}

export async function deleteProject(id: string) {
  return prisma.project.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}

export async function addMember(projectId: string, userId: string) {
  const existing = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (existing) {
    if (existing.active) throw new ConflictError('User is already an active member of this project')
    return prisma.userProject.update({
      where: { id: existing.id },
      data: { active: true, endDate: null, startDate: new Date() },
    })
  }

  return prisma.userProject.create({
    data: { userId, projectId },
  })
}

export async function removeMember(projectId: string, userId: string) {
  const existing = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!existing) {
    throw new NotFoundError('Member not found in this project')
  }

  const isPm = await isProjectManager(userId, projectId)
  if (isPm) {
    const count = await countProjectManagers(projectId)
    if (count <= 1) {
      throw new Error('Cannot remove the only Project Manager')
    }
    await removeProjectRole(userId, projectId)
  }

  return prisma.userProject.update({
    where: { id: existing.id },
    data: { active: false, endDate: new Date() },
  })
}

export async function getMembersWithDetails(projectId: string) {
  return prisma.userProject.findMany({
    where: { projectId, active: true },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true, role: true } },
    },
    orderBy: { startDate: 'asc' },
  })
}

export async function updateUserProject(
  userId: string,
  projectId: string,
  data: {
    projectRole?: string
    roles?: string[]
    departments?: string[]
    role?: string
    departmentId?: string | null
    hourlyRate?: number | null
    active?: boolean
    tenantId?: string
  },
) {
  const existing = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!existing) throw new NotFoundError('Member not found')

  const roleStr =
    data.roles !== undefined
      ? data.roles.length > 0
        ? data.roles.join(', ')
        : null
      : data.role !== undefined
        ? data.role || null
        : undefined

  const result = await prisma.userProject.update({
    where: { id: existing.id },
    data: {
      ...(roleStr !== undefined ? { role: roleStr } : {}),
      ...(data.departmentId !== undefined ? { departmentId: data.departmentId } : {}),
      ...(data.hourlyRate !== undefined ? { hourlyRate: data.hourlyRate } : {}),
      ...(data.active !== undefined
        ? { active: data.active, endDate: data.active ? null : new Date() }
        : {}),
    },
  })

  if (data.projectRole !== undefined && data.tenantId) {
    if (data.projectRole === 'gerente') {
      await setProjectManagerRole(userId, projectId, data.tenantId)
    } else {
      await removeProjectRole(userId, projectId)
    }
  }

  return result
}

export async function getUserProjectsWithDetails(userId: string) {
  return prisma.userProject.findMany({
    where: { userId, active: true, project: { deletedAt: null } },
    include: {
      project: { select: { id: true, name: true, status: true } },
      department: { select: { name: true } },
    },
    orderBy: { startDate: 'asc' },
  })
}

export async function getUserActiveProjects(userId: string, tenantId: string) {
  return prisma.userProject.findMany({
    where: {
      userId,
      active: true,
      project: { tenantId, ...activeOnly },
    },
    select: { id: true, projectId: true },
  })
}

export async function getProjectPaginated(tenantId: string, page: number = 1, limit: number = 9) {
  const skip = (page - 1) * limit;

  const [projetos, total] = await Promise.all([
    prisma.project.findMany({
      where: { tenantId, deletedAt: null }, // Oculta os deletados
      skip,
      take: limit,
      orderBy: { updatedAt: 'desc' }, // Ordem: O último movimentado/acessado aparece primeiro
      include: {
        _count: {
          select: { members: { where: { active: true } } } // Traz a quantidade de integrantes ativos
        }
      }
    }),
    prisma.project.count({
      where: { tenantId, deletedAt: null }
    })
  ]);

  return {
    projetos,
    totalPages: Math.ceil(total / limit),
    currentPage: page
  };
}
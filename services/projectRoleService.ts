import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma'

export async function getOrCreateGerenteProjetoRole(tenantId: string, db: Prisma.TransactionClient = prisma) {
  const existing = await db.role.findFirst({
    where: { tenantId, nameKey: 'gerente', scope: 'PROJETO' },
  })
  if (existing) return existing
  return db.role.create({
    data: { tenantId, name: 'Gerente de Projeto', nameKey: 'gerente', scope: 'PROJETO' },
  })
}

const GERENTE_LABEL = 'Gerente de Projeto'

function normalizeCargos(role: string | null | undefined): string[] {
  return (role ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean)
}

export async function setProjectManagerRole(userId: string, projectId: string, tenantId: string, db: Prisma.TransactionClient = prisma) {
  const role = await getOrCreateGerenteProjetoRole(tenantId, db)
  const existing = await db.userProjectRole.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (existing) {
    await db.userProjectRole.update({
      where: { id: existing.id },
      data: { roleId: role.id, deletedAt: null },
    })
  } else {
    await db.userProjectRole.create({
      data: { userId, projectId, roleId: role.id },
    })
  }

  // Mantém em sincronia o cargo string (UserProject.role) que alimenta a lista
  // de "cargos/funções" em Stakeholders — senão o gerente não aparece com a
  // função "Gerente de Projeto", embora o papel (UserProjectRole) exista.
  const cargos = normalizeCargos(
    (await db.userProject.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { role: true },
    }))?.role,
  )
  if (!cargos.some(c => c.toLowerCase() === GERENTE_LABEL.toLowerCase())) {
    await db.userProject.update({
      where: { userId_projectId: { userId, projectId } },
      data: { role: [...cargos, GERENTE_LABEL].join(', ') },
    })
  }
}

export async function removeProjectRole(userId: string, projectId: string, db: Prisma.TransactionClient = prisma) {
  const existing = await db.userProjectRole.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (existing) {
    await db.userProjectRole.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    })
  }

  // Remove o "Gerente de Projeto" da lista de cargos do membro, para a
  // listagem de Stakeholders não ficar com a função órfã quando o papel cai.
  const cargos = normalizeCargos(
    (await db.userProject.findUnique({
      where: { userId_projectId: { userId, projectId } },
      select: { role: true },
    }))?.role,
  )
  const restantes = cargos.filter(c => c.toLowerCase() !== GERENTE_LABEL.toLowerCase())
  if (restantes.length !== cargos.length) {
    await db.userProject.update({
      where: { userId_projectId: { userId, projectId } },
      data: { role: restantes.join(', ') },
    })
  }
}

export async function isProjectManager(userId: string, projectId: string): Promise<boolean> {
  const entry = await prisma.userProjectRole.findFirst({
    where: {
      userId,
      projectId,
      deletedAt: null,
      role: {
        is: {
          nameKey: 'gerente',
          scope: 'PROJETO',
        },
      },
    },
  })
  return entry !== null
}

export async function countProjectManagers(projectId: string): Promise<number> {
  return prisma.userProjectRole.count({
    where: { projectId, deletedAt: null, role: { nameKey: 'gerente', scope: 'PROJETO' } },
  })
}

export async function getProjectsWhereManager(userId: string): Promise<string[]> {
  const entries = await prisma.userProjectRole.findMany({
    where: { userId, deletedAt: null, role: { nameKey: 'gerente', scope: 'PROJETO' } },
    select: { projectId: true },
  })
  return entries.map(e => e.projectId)
}

export async function getProjectRoleForMember(userId: string, projectId: string): Promise<'gerente' | 'member'> {
  const pm = await isProjectManager(userId, projectId)
  return pm ? 'gerente' : 'member'
}

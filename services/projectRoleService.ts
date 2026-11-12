import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma'

export async function getOrCreateGerenteProjetoRole(tenantId: string, db: Prisma.TransactionClient = prisma) {
  // Upsert pela chave única (nameKey, tenant, escopo): duas gravações ao mesmo tempo não
  // criam dois papéis de gerente, e um papel excluído volta em vez de nascer outro.
  return db.role.upsert({
    where: { nameKey_tenantId_scope: { nameKey: 'gerente', tenantId, scope: 'PROJETO' } },
    create: { tenantId, name: 'Gerente de Projeto', nameKey: 'gerente', scope: 'PROJETO' },
    update: { deletedAt: null },
  })
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

  // A função "Gerente de Projeto" entra na lista de funções do membro (Stakeholders),
  // junto do papel (UserProjectRole). É um vínculo com o mesmo papel do cadastro.
  const vinculo = await db.userProject.findUnique({ where: { userId_projectId: { userId, projectId } }, select: { id: true, funcoes: { select: { ordem: true } } } })
  if (vinculo) {
    await db.userProjectFuncao.upsert({
      where: { userProjectId_roleId: { userProjectId: vinculo.id, roleId: role.id } },
      create: { userProjectId: vinculo.id, roleId: role.id, ordem: Math.max(-1, ...vinculo.funcoes.map(f => f.ordem)) + 1 },
      update: {},
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

  // Tira a função de gerente da lista do membro, para não ficar órfã quando o papel cai.
  const gerente = await db.role.findFirst({ where: { nameKey: 'gerente', scope: 'PROJETO', funcoesDeMembros: { some: { userProject: { userId, projectId } } } }, select: { id: true } })
  if (gerente) {
    await db.userProjectFuncao.deleteMany({ where: { roleId: gerente.id, userProject: { userId, projectId } } })
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

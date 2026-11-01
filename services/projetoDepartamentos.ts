import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma'

/**
 * Garante que o catálogo (Department) tenha os departamentos escolhidos e
 * sincroniza as associações reais (ProjetoDepartamento) do projeto com essa
 * seleção — o form de projeto agora fica conectado ao cadastro global.
 */
export async function syncProjetoDepartamentos(projetoId: string, tenantId: string, names: string[], db: Prisma.TransactionClient = prisma) {
  const uniqueNames = [...new Set(names.map(n => n.trim()).filter(Boolean))]

  // Resolve (ou cria) cada departamento no catálogo global do tenant.
  const departmentIds: string[] = []
  for (const name of uniqueNames) {
    const existing = await db.department.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    })
    let dept = existing
    if (!dept) {
      dept = await db.department.create({ data: { tenantId, name } })
    } else if (dept.deletedAt !== null) {
      dept = await db.department.update({ where: { id: dept.id }, data: { deletedAt: null } })
    }
    departmentIds.push(dept.id)
  }

  const current = await db.projetoDepartamento.findMany({
    where: { projetoId },
    select: { id: true, departamentoId: true },
  })
  const currentIds = new Set(current.map(c => c.departamentoId))
  const desired = new Set(departmentIds)

  const toCreate = departmentIds.filter(id => !currentIds.has(id))
  const toDelete = current.filter(c => !desired.has(c.departamentoId))

  if (toCreate.length > 0) {
    await db.projetoDepartamento.createMany({
      data: toCreate.map(departamentoId => ({ projetoId, departamentoId })),
      skipDuplicates: true,
    })
  }
  if (toDelete.length > 0) {
    await db.projetoDepartamento.deleteMany({
      where: { projetoId, departamentoId: { in: toDelete.map(d => d.departamentoId) } },
    })
  }
}

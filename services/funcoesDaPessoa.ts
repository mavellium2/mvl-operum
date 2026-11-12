import 'server-only'
import type { Prisma } from '@/lib/generated/prisma'
import prisma from '@/lib/prisma'
import { separarFuncoes } from '@/lib/funcoes'
import { garantirFuncao } from '@/services/funcoesCatalogo'

/**
 * Funções de uma pessoa num projeto: uma lista de vínculos com o cadastro de
 * funções (UserProjectFuncao para o membro, ProjectStakeholderFuncao para o
 * externo). Nada é gravado como texto com separador.
 */

type Db = Prisma.TransactionClient | typeof prisma

/** Para `include`/`select`: as funções na ordem escolhida, com o nome do cadastro. */
export const FUNCOES_ORDENADAS = {
  orderBy: { ordem: 'asc' as const },
  select: { roleId: true, role: { select: { name: true } } },
}

/** Nomes das funções, na ordem. */
export const nomesDasFuncoes = (funcoes: { role: { name: string } }[] | null | undefined) => (funcoes ?? []).map(f => f.role.name)

/** Ids das funções do cadastro para estes nomes (reaproveita equivalentes; cria só se faltar). */
async function idsDasFuncoes(tenantId: string, nomes: string[], db: Db) {
  const ids: string[] = []
  // Cada nome é uma função; a separação aqui só protege contra entrada antiga em texto.
  for (const nome of separarFuncoes(nomes)) {
    const funcao = await garantirFuncao(tenantId, nome, db)
    if (!ids.includes(funcao.id)) ids.push(funcao.id)
  }
  return ids
}

/** Troca as funções do membro no projeto pelas informadas (na ordem). */
export async function definirFuncoesDoMembro(tenantId: string, userProjectId: string, nomes: string[], db: Db = prisma) {
  const ids = await idsDasFuncoes(tenantId, nomes, db)
  await db.userProjectFuncao.deleteMany({ where: { userProjectId, roleId: { notIn: ids } } })
  for (const [ordem, roleId] of ids.entries()) {
    await db.userProjectFuncao.upsert({
      where: { userProjectId_roleId: { userProjectId, roleId } },
      create: { userProjectId, roleId, ordem },
      update: { ordem },
    })
  }
  return ids
}

/** Troca as funções do externo no projeto pelas informadas (na ordem). */
export async function definirFuncoesDoExterno(tenantId: string, projectStakeholderId: string, nomes: string[], db: Db = prisma) {
  const ids = await idsDasFuncoes(tenantId, nomes, db)
  await db.projectStakeholderFuncao.deleteMany({ where: { projectStakeholderId, roleId: { notIn: ids } } })
  for (const [ordem, roleId] of ids.entries()) {
    await db.projectStakeholderFuncao.upsert({
      where: { projectStakeholderId_roleId: { projectStakeholderId, roleId } },
      create: { projectStakeholderId, roleId, ordem },
      update: { ordem },
    })
  }
  return ids
}

/** Copia funções por id (troca de interno ↔ externo leva as mesmas funções). */
export async function copiarFuncoes(
  ids: string[],
  destino: { userProjectId: string } | { projectStakeholderId: string },
  db: Db = prisma,
) {
  for (const [ordem, roleId] of ids.entries()) {
    if ('userProjectId' in destino) {
      await db.userProjectFuncao.upsert({ where: { userProjectId_roleId: { userProjectId: destino.userProjectId, roleId } }, create: { userProjectId: destino.userProjectId, roleId, ordem }, update: { ordem } })
    } else {
      await db.projectStakeholderFuncao.upsert({ where: { projectStakeholderId_roleId: { projectStakeholderId: destino.projectStakeholderId, roleId } }, create: { projectStakeholderId: destino.projectStakeholderId, roleId, ordem }, update: { ordem } })
    }
  }
}

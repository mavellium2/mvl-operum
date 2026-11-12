import 'server-only'
import type { Prisma } from '@/lib/generated/prisma'
import prisma from '@/lib/prisma'
import { funcaoKey } from '@/lib/utils/normalize'
import { ehFuncaoDeGerente } from '@/lib/funcoes'
import { getOrCreateGerenteProjetoRole } from '@/services/projectRoleService'

type Db = Prisma.TransactionClient | typeof prisma

/**
 * A função do catálogo para este nome: reaproveita a equivalente (acento, caixa e
 * plural, em qualquer escopo, inclusive excluída, que volta). "Gerente de Projeto"
 * é sempre o papel de gerente do sistema. Só cria quando não há equivalente.
 */
export async function garantirFuncao(tenantId: string, nome: string, db: Db = prisma) {
  if (ehFuncaoDeGerente(nome)) return getOrCreateGerenteProjetoRole(tenantId, db as Prisma.TransactionClient)
  const chave = funcaoKey(nome)
  const todas = await db.role.findMany({ where: { tenantId }, select: { id: true, name: true, deletedAt: true, scope: true, nameKey: true } })
  const equivalentes = todas.filter(r => funcaoKey(r.name) === chave)
  const ativa = equivalentes.find(r => !r.deletedAt)
  if (ativa) return ativa
  if (equivalentes[0]) return db.role.update({ where: { id: equivalentes[0].id }, data: { deletedAt: null } })
  const nameKey = nome.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || `funcao-${Date.now()}`
  return db.role.upsert({
    where: { nameKey_tenantId_scope: { nameKey, tenantId, scope: 'TENANT' } },
    create: { tenantId, name: nome, nameKey, scope: 'TENANT' },
    update: { deletedAt: null },
  })
}

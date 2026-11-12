/**
 * Funde funções (Role) equivalentes do mesmo tenant — ex.: "Gerente de Projeto"
 * (papel RBAC, escopo PROJETO) e "Gerente de Projetos" (criada no cadastro,
 * escopo TENANT). A equivalência usa `funcaoKey` (acento, caixa e plural).
 *
 * Para cada grupo, mantém a vencedora (papel RBAC do gerente, senão a mais
 * antiga) e, nas duplicadas:
 *   - repassa UserProjectRole.roleId para a vencedora;
 *   - move as associações ProjetoFuncao (descarta as que já existem);
 *   - copia as RolePermission que faltarem na vencedora;
 *   - repassa as funções dos membros e externos (UserProjectFuncao,
 *     ProjectStakeholderFuncao) para a vencedora, sem repetir;
 *   - aplica soft delete (deletedAt).
 *
 * Antes disso, separa funções compostas ("Desenvolvedora Front-End | Redatora"):
 * cada parte vira (ou reaproveita) uma função; associações a projetos e
 * permissões passam para as partes, quem tinha a composta passa a ter cada
 * parte, o papel do membro vai para a 1ª parte e a composta recebe soft delete.
 *
 * Idempotente. Por padrão só mostra o plano (dry-run):
 *   pnpm exec tsx scripts/dedupe-funcoes.ts
 *   pnpm exec tsx scripts/dedupe-funcoes.ts --apply
 *   pnpm exec tsx scripts/dedupe-funcoes.ts --tenant=<id> [--apply]
 */
import 'dotenv/config'
import prisma from '@/lib/prisma'
import { planejarDeduplicacao, type GrupoDuplicado } from '@/lib/funcoesDedupe'
import { funcaoKey } from '@/lib/utils/normalize'
import { separarFuncoes } from '@/lib/funcoes'

const APPLY = process.argv.includes('--apply')
/** --tenant=<id>: só esta instituição (útil para rodar em produção uma por vez). */
const TENANT = process.argv.find(a => a.startsWith('--tenant='))?.slice('--tenant='.length)


async function fundirGrupo(tenantId: string, grupo: GrupoDuplicado) {
  const keeperId = grupo.vencedora.id
  const dupIds = grupo.duplicadas.map(d => d.id)

  await prisma.$transaction(async tx => {
    await tx.userProjectRole.updateMany({ where: { roleId: { in: dupIds } }, data: { roleId: keeperId } })

    const assocKeeper = new Set(
      (await tx.projetoFuncao.findMany({ where: { funcaoId: keeperId }, select: { projetoId: true } })).map(a => a.projetoId),
    )
    for (const a of await tx.projetoFuncao.findMany({ where: { funcaoId: { in: dupIds } } })) {
      if (assocKeeper.has(a.projetoId)) {
        await tx.projetoFuncao.delete({ where: { id: a.id } })
      } else {
        await tx.projetoFuncao.update({ where: { id: a.id }, data: { funcaoId: keeperId } })
        assocKeeper.add(a.projetoId)
      }
    }

    const permsKeeper = new Set(
      (await tx.rolePermission.findMany({ where: { roleId: keeperId }, select: { permissionId: true } })).map(p => p.permissionId),
    )
    for (const p of await tx.rolePermission.findMany({ where: { roleId: { in: dupIds } } })) {
      if (!permsKeeper.has(p.permissionId)) {
        await tx.rolePermission.create({ data: { roleId: keeperId, permissionId: p.permissionId } })
        permsKeeper.add(p.permissionId)
      }
    }

    // Funções de membros e externos: passam para a vencedora, sem vínculo repetido.
    await repassarVinculos(tx, dupIds, [keeperId])

    await tx.role.updateMany({ where: { id: { in: dupIds } }, data: { deletedAt: new Date() } })
  })
}

const COMPOSTA = /[|;,]/

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Quem tinha uma das funções `de` passa a ter as funções `para` (membros e externos), sem repetir. */
async function repassarVinculos(tx: Tx, de: string[], para: string[]) {
  for (const v of await tx.userProjectFuncao.findMany({ where: { roleId: { in: de } } })) {
    for (const [i, roleId] of para.entries()) {
      await tx.userProjectFuncao.upsert({ where: { userProjectId_roleId: { userProjectId: v.userProjectId, roleId } }, create: { userProjectId: v.userProjectId, roleId, ordem: v.ordem + i }, update: {} })
    }
  }
  await tx.userProjectFuncao.deleteMany({ where: { roleId: { in: de.filter(id => !para.includes(id)) } } })
  for (const v of await tx.projectStakeholderFuncao.findMany({ where: { roleId: { in: de } } })) {
    for (const [i, roleId] of para.entries()) {
      await tx.projectStakeholderFuncao.upsert({ where: { projectStakeholderId_roleId: { projectStakeholderId: v.projectStakeholderId, roleId } }, create: { projectStakeholderId: v.projectStakeholderId, roleId, ordem: v.ordem + i }, update: {} })
    }
  }
  await tx.projectStakeholderFuncao.deleteMany({ where: { roleId: { in: de.filter(id => !para.includes(id)) } } })
}

/** Função do catálogo equivalente a `nome` (reaproveita, restaura ou cria). */
async function funcaoPara(tenantId: string, nome: string) {
  const todas = await prisma.role.findMany({ where: { tenantId }, select: { id: true, name: true, deletedAt: true } })
  const eq = todas.filter(r => funcaoKey(r.name) === funcaoKey(nome))
  const ativa = eq.find(r => !r.deletedAt)
  if (ativa) return ativa.id
  if (eq[0]) { await prisma.role.update({ where: { id: eq[0].id }, data: { deletedAt: null } }); return eq[0].id }
  const nameKey = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const criada = await prisma.role.upsert({
    where: { nameKey_tenantId_scope: { nameKey, tenantId, scope: 'TENANT' } },
    create: { tenantId, name: nome, nameKey, scope: 'TENANT' }, update: { deletedAt: null },
  })
  return criada.id
}

/** Separa as funções compostas do tenant: quem as tinha passa a ter cada parte. */
async function separarCompostas(tenantId: string): Promise<number> {
  const compostas = await prisma.role.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, name: true } })
  let total = 0
  for (const r of compostas.filter(c => COMPOSTA.test(c.name))) {
    const partes = separarFuncoes(r.name)
    total++
    console.log(`  separar "${r.name}" → ${partes.map(p => `"${p}"`).join(', ')}`)
    if (!APPLY) continue
    const ids: string[] = []
    for (const parte of partes) ids.push(await funcaoPara(tenantId, parte))
    await prisma.$transaction(async tx => {
      await tx.userProjectRole.updateMany({ where: { roleId: r.id }, data: { roleId: ids[0] } })
      await repassarVinculos(tx, [r.id], ids)
      for (const a of await tx.projetoFuncao.findMany({ where: { funcaoId: r.id } })) {
        for (const id of ids) {
          if (!(await tx.projetoFuncao.findFirst({ where: { projetoId: a.projetoId, funcaoId: id }, select: { id: true } }))) {
            await tx.projetoFuncao.create({ data: { projetoId: a.projetoId, funcaoId: id } })
          }
        }
        await tx.projetoFuncao.delete({ where: { id: a.id } })
      }
      for (const p of await tx.rolePermission.findMany({ where: { roleId: r.id } })) {
        for (const id of ids) await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: id, permissionId: p.permissionId } }, create: { roleId: id, permissionId: p.permissionId }, update: {} })
      }
      await tx.role.update({ where: { id: r.id }, data: { deletedAt: new Date() } })
    })
  }
  return total
}

async function main() {
  const tenants = await prisma.tenant.findMany({ where: TENANT ? { id: TENANT } : {}, select: { id: true, name: true } })
  let total = 0

  for (const t of tenants) {
    console.log(`\nTenant ${t.name} (${t.id})`)
    total += await separarCompostas(t.id)
    const funcoes = await prisma.role.findMany({
      where: { tenantId: t.id, deletedAt: null },
      select: { id: true, name: true, nameKey: true, scope: true, createdAt: true },
    })
    const grupos = planejarDeduplicacao(funcoes)
    if (grupos.length === 0) continue

    for (const g of grupos) {
      total += g.duplicadas.length
      console.log(`  manter  "${g.vencedora.name}" [${g.vencedora.scope}] ${g.vencedora.id}`)
      for (const d of g.duplicadas) console.log(`  fundir  "${d.name}" [${d.scope}] ${d.id}`)
      if (APPLY) await fundirGrupo(t.id, g)
    }
  }

  if (total === 0) console.log('Nenhuma função composta ou duplicada encontrada.')
  else if (APPLY) console.log(`\n${total} função(ões) fundida(s).`)
  else console.log(`\n${total} função(ões) seriam fundidas. Rode com --apply para gravar.`)
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

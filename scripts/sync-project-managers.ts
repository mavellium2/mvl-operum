/**
 * Backfill idempotente: quem tem o papel de gerente no projeto (UserProjectRole,
 * "Gerente de Projeto") tem também essa função na sua lista de funções do projeto
 * (UserProjectFuncao), para aparecer assim em Stakeholders. Não mexe em mais nada.
 *
 * Rode quando necessário: pnpm exec tsx scripts/sync-project-managers.ts
 */
import 'dotenv/config'
import prisma from '@/lib/prisma'

async function ensureGerenteCargo(userId: string, projectId: string, roleId: string) {
  const up = await prisma.userProject.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { id: true, funcoes: { select: { roleId: true, ordem: true } } },
  })
  if (!up) return { userId, projectId, status: 'SEM_MEMBRO' as const }
  if (up.funcoes.some(f => f.roleId === roleId)) return { userId, projectId, status: 'OK' as const }
  await prisma.userProjectFuncao.create({
    data: { userProjectId: up.id, roleId, ordem: Math.max(-1, ...up.funcoes.map(f => f.ordem)) + 1 },
  })
  return { userId, projectId, status: 'CORRIGIDO' as const }
}

async function main() {
  const gerenteRoles = await prisma.userProjectRole.findMany({
    where: { deletedAt: null, role: { is: { nameKey: 'gerente', scope: 'PROJETO' } } },
    select: { userId: true, projectId: true, roleId: true },
  })

  console.log(`Encontrados ${gerenteRoles.length} UserProjectRole de gerente active.`)

  const resultados: { userId: string; projectId: string; status: string }[] = []
  for (const r of gerenteRoles) {
    const res = await ensureGerenteCargo(r.userId, r.projectId, r.roleId)
    resultados.push(res)
  }

  const corrigidos = resultados.filter(r => r.status === 'CORRIGIDO')
  if (corrigidos.length === 0) {
    console.log('Tudo já está sincronizado — nenhum cargo precisou de ajuste.')
  } else {
    console.log(`\nCargos "Gerente de Projeto" adicionados em ${corrigidos.length} projeto(s):`)
    corrigidos.slice(0, 50).forEach(c => console.log(`  - ${c.userId} @ ${c.projectId}`))
  }
}

main()
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

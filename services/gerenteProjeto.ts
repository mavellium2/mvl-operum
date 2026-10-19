import 'server-only'
import prisma from '@/lib/prisma'

export interface GerenteDoProjeto {
  /** Nome(s) do(s) gerente(s), como sai nos documentos ("Ana e Bruno"). Vazio sem gerente. */
  userIds?: string[]
  nome: string
  /** Assinatura do primeiro gerente, para documentos aprovados. */
  signatureUrl: string | null
}

/**
 * Gerente(s) do projeto: usuários com o papel `gerente` em `UserProjectRole`.
 * Fonte única do campo "Gerente do projeto" de todos os documentos.
 */
export async function gerenteDoProjeto(projectId: string): Promise<GerenteDoProjeto> {
  const entradas = await prisma.userProjectRole.findMany({
    where: { projectId, deletedAt: null, role: { nameKey: 'gerente' } },
    select: { userId: true },
  })
  if (entradas.length === 0) return { nome: '', signatureUrl: null }
  const users = await prisma.user.findMany({
    where: { id: { in: entradas.map(e => e.userId) } },
    select: { name: true, signatureUrl: true },
  })
  return { userIds: entradas.map(e => e.userId), nome: users.map(u => u.name).join(' e '), signatureUrl: users[0]?.signatureUrl ?? null }
}

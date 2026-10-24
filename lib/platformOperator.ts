import 'server-only'
import prisma from '@/lib/prisma'
import { verifySession } from '@/lib/dal'

/**
 * Operador da plataforma (ADR-060): gerencia as instituições do Operum. O
 * `admin` de uma instituição administra só a própria; o papel vem do banco a
 * cada chamada, nunca da sessão ou do cliente.
 */
export async function ehOperadorDaPlataforma(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformOperator: true, isActive: true, deletedAt: true },
  })
  return !!user && user.platformOperator && user.isActive && !user.deletedAt
}

export async function exigirOperadorDaPlataforma() {
  const session = await verifySession()
  if (!(await ehOperadorDaPlataforma(session.userId))) {
    throw new Error('Acesso restrito ao operador da plataforma')
  }
  return session
}

import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma'
import { isTransactionConflict } from '@/lib/transactionConflict'
import type { SessaoAuthz } from './authz'

function canonico(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonico)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonico(v)]))
  return value
}

/** Recibo e efeitos são confirmados juntos. O mesmo pedido nunca executa duas vezes. */
export async function executarOperacaoProjeto<T extends object>(
  session: SessaoAuthz, projectId: string, requestId: string | undefined, payload: unknown,
  executar: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const operacaoId = requestId ?? randomUUID()
  const payloadHash = createHash('sha256').update(JSON.stringify(canonico(payload))).digest('hex')
  const where = { tenantId_projectId_userId_requestId: { tenantId: session.tenantId, projectId, userId: session.userId, requestId: operacaoId } }
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await prisma.$transaction(async tx => {
        const projeto = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Project" WHERE "id" = ${projectId} AND "tenantId" = ${session.tenantId} AND "deletedAt" IS NULL FOR UPDATE`
        if (!projeto.length) throw new Error('Projeto não encontrado')
        const recibo = await tx.projetoOperacao.findUnique({ where })
        if (recibo) {
          if (recibo.payloadHash !== payloadHash) throw new Error('Esta tentativa já foi usada com outros dados. Atualize a tela antes de continuar.')
          return recibo.resultado as T
        }
        const resultado = await executar(tx)
        await tx.projetoOperacao.create({ data: { tenantId: session.tenantId, projectId, userId: session.userId, requestId: operacaoId, payloadHash, resultado: JSON.parse(JSON.stringify(resultado)) as Prisma.InputJsonValue } })
        return resultado
      }, { isolationLevel: 'Serializable', maxWait: 10000, timeout: 30000 })
    } catch (error) {
      if (tentativa < 2 && isTransactionConflict(error)) continue
      throw error
    }
  }
}

import { timingSafeEqual } from 'node:crypto'
import prisma from '@/lib/prisma'
import { getTaskBudget, setTaskBudget } from '@/services/taskBudgetService'
import { isAccessDenied } from '@/services/apiAuthorization'
import { WbsNotFoundError, WbsValidationError } from '@/services/wbsService'
import { ZodError } from 'zod'

type Context = { params: Promise<{ cardId: string }> }

async function handle(request: Request, context: Context) {
  const expected = process.env.INTERNAL_API_KEY
  const supplied = request.headers.get('x-internal-api-key') ?? ''
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }
  const userId = request.headers.get('x-user-id')
  const tenantId = request.headers.get('x-tenant-id')
  const { cardId } = await context.params
  if (!userId || !tenantId || !/^[A-Za-z0-9_-]{1,64}$/.test(cardId)) return Response.json({ error: 'Requisição inválida' }, { status: 400 })
  try {
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId, status: 'active', isActive: true, deletedAt: null,
      tenant: { status: 'ACTIVE', deletedAt: null } }, select: { role: true } })
    if (!user) return Response.json({ error: 'Sem permissão' }, { status: 403 })
    const session = { userId, tenantId, role: user.role }
    const result = request.method === 'PATCH'
      ? await setTaskBudget(session, cardId, await request.json().catch(() => null))
      : await getTaskBudget(session, cardId)
    return Response.json(result)
  } catch (error) {
    if (isAccessDenied(error)) return Response.json({ error: 'Sem permissão' }, { status: 403 })
    if (error instanceof WbsNotFoundError) return Response.json({ error: error.message }, { status: 404 })
    if (error instanceof WbsValidationError || error instanceof ZodError) return Response.json({ error: error.message }, { status: 400 })
    console.error('[task-budget]', error instanceof Error ? error.name : 'Error')
    return Response.json({ error: 'Orçamento indisponível' }, { status: 503 })
  }
}

export const GET = handle
export const PATCH = handle

import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { authorizeApi, isAccessDenied } from '@/services/apiAuthorization'

const schema = z.object({ userId: z.string().min(1), tenantId: z.string().min(1), method: z.enum(['GET','HEAD','POST','PATCH','PUT','DELETE']), path: z.string().startsWith('/').max(10000), body: z.record(z.string(), z.unknown()).optional() }).strict()

export async function POST(request: Request) {
  const expected = process.env.INTERNAL_API_KEY
  const supplied = request.headers.get('x-internal-api-key') ?? ''
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return Response.json({ error: 'Não autorizado' }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'Requisição inválida' }, { status: 400 })
  const { userId, tenantId, method, path, body } = parsed.data
  try {
    // Instituição suspensa ou removida não autoriza nada, nem com sessão/PAT ainda válidos.
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId, isActive: true, deletedAt: null, tenant: { status: 'ACTIVE', deletedAt: null } }, select: { role: true } })
    if (!user) return Response.json({ allowed: false }, { status: 403 })
    return Response.json(await authorizeApi({ userId, tenantId, role: user.role }, method, path, body))
  } catch (error) {
    // Falha de infraestrutura nunca vira uma autorização positiva.
    if (isAccessDenied(error)) return Response.json({ allowed: false }, { status: 403 })
    console.error('[authorize]', error instanceof Error ? error.name : 'Error')
    return Response.json({ error: 'Autorização indisponível' }, { status: 503 })
  }
}

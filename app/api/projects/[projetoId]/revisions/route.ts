import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import {
  canProjectPermission,
  requireProjectPermission,
} from '@/services/projectAccess'
import {
  submeterDocumento,
  revisarDocumento,
  salvarRascunho,
  rascunhoDocumento,
  excluirVersao,
  descartarRascunho,
} from '@/services/documentRevisionService'
import {
  tipoDocumento,
  metaDocumento,
  validarRecurso,
} from '@/lib/validation/documentRevisionSchemas'
import { documentRevisionErrorResponse } from '@/lib/documentRevisionHttp'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'

type Ctx = { params: Promise<{ projetoId: string }> }

export async function GET(req: Request, { params }: Ctx) {
  const session = await verifySession()
  try {
    const { projetoId } = await params
    await requireProjectPermission(session, projetoId, 'documentos:ver')
    const query = new URL(req.url).searchParams
    const documentType = tipoDocumento.parse(query.get('type'))
    const resourceId = query.get('resourceId') ?? ''
    validarRecurso(documentType, resourceId)
    if (query.get('draft') === '1')
      return Response.json(
        await rascunhoDocumento(session, projetoId, documentType, resourceId),
      )
    if (query.get('tab') === 'registro') {
      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: session.tenantId,
          entity: 'Document',
          entityId: projetoId,
          AND: [
            { details: { path: ['documentType'], equals: documentType } },
            ...(documentType === 'ATA' && !resourceId
              ? []
              : [{ details: { path: ['resourceId'], equals: resourceId } }]),
          ],
        },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: 200,
      })
      const users = await prisma.user.findMany({
        where: {
          tenantId: session.tenantId,
          id: { in: logs.flatMap((log) => (log.userId ? [log.userId] : [])) },
        },
        select: { id: true, name: true },
      })
      const names = new Map(users.map((user) => [user.id, user.name]))
      return Response.json(
        logs.map((log) => ({
          ...log,
          userName: log.userId ? (names.get(log.userId) ?? null) : null,
        })),
      )
    }
    const versions = await prisma.documentVersion.findMany({
      where: {
        projectId: projetoId,
        documentType,
        ...(documentType === 'ATA' && !resourceId ? {} : { resourceId }),
      },
      include: {
        author: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
      take: 200,
    })
    return Response.json({
      versions,
      canApprove: await canProjectPermission(
        session,
        projetoId,
        'documentos:aprovar',
      ),
      canDelete: await canProjectPermission(
        session,
        projetoId,
        'documentos:excluir',
      ),
    })
  } catch (error) {
    return documentRevisionErrorResponse(error)
  }
}

const input = z.object({
  type: tipoDocumento,
  resourceId: z.string().max(64).default(''),
  payload: z.unknown(),
  meta: metaDocumento.optional(),
  draft: z.boolean().optional(),
})
export async function POST(req: Request, { params }: Ctx) {
  const session = await verifySession()
  try {
    const { projetoId } = await params
    const data = input.parse(await req.json())
    const result = data.draft
      ? await salvarRascunho(
          session,
          projetoId,
          data.type,
          data.payload,
          data.resourceId,
        )
      : await submeterDocumento(
          session,
          projetoId,
          data.type,
          data.payload,
          metaDocumento.parse(data.meta),
          data.resourceId,
        )
    revalidatePath(`/projetos/${projetoId}`, 'layout')
    return Response.json(result, { status: 201 })
  } catch (error) {
    return documentRevisionErrorResponse(error)
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const session = await verifySession()
  try {
    const { projetoId } = await params
    const data = z
      .object({
        versionId: z.string().min(1).max(64),
        action: z.enum(['approve', 'reject']),
      })
      .parse(await req.json())
    const result = await revisarDocumento(
      session,
      projetoId,
      data.versionId,
      data.action,
    )
    revalidatePath(`/projetos/${projetoId}`, 'layout')
    return Response.json(result)
  } catch (error) {
    return documentRevisionErrorResponse(error)
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const session = await verifySession()
  try {
    const { projetoId } = await params
    const body = await req.json()
    // Rascunho privado: { draft: true, type, resourceId } descarta as alterações não salvas.
    if (body?.draft === true) {
      const rascunho = z
        .object({ draft: z.literal(true), type: tipoDocumento, resourceId: z.string().max(64).default('') })
        .parse(body)
      return Response.json(await descartarRascunho(session, projetoId, rascunho.type, rascunho.resourceId))
    }
    const { versionId } = z
      .object({ versionId: z.string().min(1).max(64) })
      .parse(body)
    const result = await excluirVersao(session, projetoId, versionId)
    revalidatePath(`/projetos/${projetoId}`, 'layout')
    return Response.json(result)
  } catch (error) {
    return documentRevisionErrorResponse(error)
  }
}

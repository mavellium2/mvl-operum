import { NextResponse } from 'next/server'
import { verifyRouteSession } from '@/lib/routeAuth'
import { cardsApi } from '@/lib/api-client'
import { erroDoAnexo, tipoDoAnexo } from '@/lib/attachmentTypes'
import prisma from '@/lib/prisma'
import { authorizeApi, isAccessDenied } from '@/services/apiAuthorization'

const FILE_SERVICE_URL = (process.env.FILE_SERVICE_URL ?? '').replace(/\/$/, '')
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? ''

/**
 * Esta rota fala direto com o file-service (sem o gateway), então aplica a mesma
 * regra que o gateway aplicaria: enviar exige editar cards do projeto; apagar
 * exige a permissão sobre o anexo. Papel lido do banco, nunca da sessão.
 */
async function autorizado(session: { userId: string; tenantId: string }, method: 'POST' | 'DELETE', path: string): Promise<Response | null> {
  try {
    const user = await prisma.user.findFirst({ where: { id: session.userId, tenantId: session.tenantId, isActive: true, deletedAt: null }, select: { role: true } })
    if (!user) return Response.json({ error: 'Acesso negado' }, { status: 403 })
    const access = await authorizeApi({ userId: session.userId, tenantId: session.tenantId, role: user.role }, method, path)
    return access.allowed ? null : Response.json({ error: 'Acesso negado' }, { status: 403 })
  } catch (err) {
    if (isAccessDenied(err)) return Response.json({ error: 'Sem permissão para esta operação' }, { status: 403 })
    console.error('[uploads] falha ao autorizar', err instanceof Error ? err.name : 'Error')
    return Response.json({ error: 'Autorização indisponível' }, { status: 503 })
  }
}

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof verifyRouteSession>>
  try { session = await verifyRouteSession(request) }
  catch { return Response.json({ error: 'Autenticação indisponível' }, { status: 503 }) }
  if (!session?.userId) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const formData = await request.formData()
  const cardId = formData.get('cardId') as string | null
  const file = formData.get('file') as File | null

  if (!cardId) return Response.json({ error: 'cardId é obrigatório' }, { status: 400 })
  if (!file) return Response.json({ error: 'Arquivo é obrigatório' }, { status: 400 })
  const tipo = tipoDoAnexo(file)
  const erro = erroDoAnexo(file)
  if (!tipo || erro) {
    // Tipo aceito com erro = arquivo grande demais.
    return Response.json({ error: erro }, { status: tipo ? 413 : 400 })
  }

  // Verify card exists and is accessible. Falha do sprint-service (5xx ou
  // rede) não é "acesso negado": responder 403 aí escondia a causa real.
  let card: unknown = null
  try {
    card = await cardsApi.get(cardId)
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === undefined || status >= 500) {
      console.error('[uploads POST] falha ao verificar o card', { cardId, status, err })
      return Response.json({ error: 'Não foi possível verificar o card agora. Tente de novo.' }, { status: 502 })
    }
  }
  if (!card) return Response.json({ error: 'Acesso negado' }, { status: 403 })
  const negado = await autorizado(session as { userId: string; tenantId: string }, 'POST', `/files/upload?cardId=${encodeURIComponent(cardId)}`)
  if (negado) return negado

  if (!FILE_SERVICE_URL) {
    return Response.json({ error: 'Serviço de arquivos não configurado' }, { status: 503 })
  }

  const upstream = new FormData()
  // O file-service valida e grava pelo Content-Type da parte: manda o tipo resolvido.
  upstream.append('file', tipo === file.type ? file : new File([file], file.name, { type: tipo }))
  let res: Response
  try {
    res = await fetch(`${FILE_SERVICE_URL}/files/upload?cardId=${encodeURIComponent(cardId)}`, {
      method: 'POST',
      headers: {
        'X-Internal-Api-Key': INTERNAL_API_KEY,
        'X-User-Id': session.userId as string,
        'X-Tenant-Id': session.tenantId as string,
      },
      body: upstream,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return Response.json({ error: `File service indisponível: ${msg}` }, { status: 502 })
  }
  const body = await res.json().catch(() => ({})) as Record<string, unknown>
  if (!res.ok) {
    const error = (body.message ?? body.error ?? `HTTP ${res.status}`) as string
    return Response.json({ error }, { status: res.status })
  }
  return Response.json(body, { status: 201 })
}

export async function DELETE(request: Request) {
  let session: Awaited<ReturnType<typeof verifyRouteSession>>
  try { session = await verifyRouteSession(request) }
  catch { return Response.json({ error: 'Autenticação indisponível' }, { status: 503 }) }
  if (!session?.userId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const url = new URL(request.url)
  const attachmentId = url.searchParams.get('id')
  if (!attachmentId) {
    return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })
  }

  if (!FILE_SERVICE_URL) {
    return NextResponse.json({ error: 'Serviço de arquivos não configurado' }, { status: 503 })
  }

  const negado = await autorizado(session as { userId: string; tenantId: string }, 'DELETE', `/files/${encodeURIComponent(attachmentId)}`)
  if (negado) return negado

  const res = await fetch(`${FILE_SERVICE_URL}/files/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
    headers: {
      'X-Internal-Api-Key': INTERNAL_API_KEY,
      'X-User-Id': session.userId as string,
      'X-Tenant-Id': session.tenantId as string,
    },
  })
  if (res.status === 204) return new Response(null, { status: 204 })
  const body = await res.json().catch(() => ({}))
  return NextResponse.json(body, { status: res.status })
}

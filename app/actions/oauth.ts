'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { oauthApi } from '@/lib/api-client'
import { parseAuthorizeRequest } from '@/lib/oauth/authorizeRequest'

export type OAuthDecisionResult = { redirect: string } | { error: string }

const TENANT_ID = /^[A-Za-z0-9_-]{1,64}$/

function result(decision: Awaited<ReturnType<typeof oauthApi.approve>>): OAuthDecisionResult {
  if ('redirect' in decision && decision.redirect) return { redirect: decision.redirect }
  return { error: 'description' in decision ? decision.description : 'Não foi possível concluir a autorização.' }
}

/**
 * Permitir: o auth-service revalida a requisição inteira e os workspaces e
 * devolve a URL de retorno com o código. A navegação para fora do Operum é
 * feita pelo navegador (a CSP do app limita form-action a 'self').
 */
export async function approveOAuthAction(rawRequest: Record<string, unknown>, tenantIds: string[], allowWrite: boolean): Promise<OAuthDecisionResult> {
  await verifySession()
  const req = parseAuthorizeRequest(rawRequest)
  if (!req) return { error: 'Pedido de autorização inválido.' }
  const ids = [...new Set(tenantIds)].filter(id => typeof id === 'string' && TENANT_ID.test(id))
  if (ids.length === 0) return { error: 'Escolha ao menos um workspace.' }
  if (ids.length > 10) return { error: 'Escolha no máximo 10 workspaces.' }
  try {
    return result(await oauthApi.approve(req, ids, allowWrite === true))
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível concluir a autorização.' }
  }
}

export async function denyOAuthAction(rawRequest: Record<string, unknown>): Promise<OAuthDecisionResult> {
  await verifySession()
  const req = parseAuthorizeRequest(rawRequest)
  if (!req) return { error: 'Pedido de autorização inválido.' }
  try {
    return result(await oauthApi.deny(req))
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Não foi possível concluir.' }
  }
}

export async function listOAuthGrantsAction() {
  try {
    await verifySession()
    return { grants: await oauthApi.grants() }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao listar apps conectados', grants: [] }
  }
}

export async function revokeOAuthGrantAction(id: string) {
  try {
    await verifySession()
    if (!TENANT_ID.test(id)) return { error: 'Conexão inválida' }
    await oauthApi.revokeGrant(id)
    revalidatePath('/perfil/tokens')
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao desconectar' }
  }
}

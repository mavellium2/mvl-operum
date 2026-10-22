import type { OAuthAuthorizeRequest } from '@/lib/api-client'

const FIELDS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'] as const
const REQUIRED = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method'] as const
const MAX_LEN = 500

/**
 * Lê os parâmetros da requisição de autorização (query da página ou payload da
 * Server Action). A validação completa (cliente, redirect, PKCE, escopos) é do
 * auth-service; aqui só formato e tamanho. `null` = requisição malformada.
 */
export function parseAuthorizeRequest(input: Record<string, unknown>): OAuthAuthorizeRequest | null {
  const out: Record<string, string> = {}
  for (const key of FIELDS) {
    const raw = input[key]
    const value = Array.isArray(raw) ? undefined : raw
    if (value === undefined || value === null || value === '') continue
    if (typeof value !== 'string' || value.length > MAX_LEN) return null
    out[key] = value
  }
  if (REQUIRED.some(k => !out[k])) return null
  return out as OAuthAuthorizeRequest
}

const SCOPE_LABELS: Record<string, string> = {
  'operum:read': 'Ver projetos, sprints, tarefas, comentários e tempos',
  'operum:write': 'Criar e alterar tarefas, comentários, anexos e tempos',
  offline_access: 'Continuar conectado sem pedir login de novo (até 90 dias)',
}

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope
}

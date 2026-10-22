const API_URL = (process.env.API_GATEWAY_INTERNAL_URL ?? 'http://api-gateway:4000').replace(/\/$/, '')
const REQUEST_TIMEOUT_MS = 10_000
/** Upload de anexo (até 50 MB) passa pelo gateway até o file-service e o MinIO. */
const UPLOAD_TIMEOUT_MS = 120_000

const MAX_PUBLIC_MESSAGE_CHARS = 300

export interface GatewayError extends Error {
  status?: number
  /**
   * Mensagem segura para devolver ao modelo: só existe quando veio do campo
   * `message`/`error` (string) de um corpo JSON do serviço — nunca texto bruto,
   * HTML de proxy ou o fallback com método/path interno.
   */
  publicMessage?: string
}

export const OAUTH_ACCESS_PREFIX = 'opr_oat_'

/**
 * Cabeçalhos de autenticação para o api-gateway. PAT: só o Authorization.
 * Token OAuth: também a chave interna do mcp-server (o gateway só aceita o
 * token OAuth vindo daqui, que é a audiência dele) e o workspace escolhido.
 */
export function gatewayAuthHeaders(token: string, tenantId?: string): Record<string, string> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
  if (token.startsWith(OAUTH_ACCESS_PREFIX)) {
    headers['X-Operum-Mcp-Key'] = process.env.MCP_GATEWAY_KEY ?? ''
    if (tenantId) headers['X-Operum-Tenant'] = tenantId
  }
  return headers
}

async function request<T>(token: string, path: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS, tenantId?: string): Promise<T> {
  // FormData: o fetch monta o Content-Type multipart com o boundary.
  const isForm = init.body instanceof FormData
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...gatewayAuthHeaders(token, tenantId),
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (res.status === 204) return undefined as T

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = body
    let publicMessage: string | undefined
    try {
      const parsed = JSON.parse(body) as { message?: unknown; error?: unknown }
      const candidate = typeof parsed.message === 'string' ? parsed.message : typeof parsed.error === 'string' ? parsed.error : undefined
      if (candidate) {
        message = candidate
        publicMessage = candidate.slice(0, MAX_PUBLIC_MESSAGE_CHARS)
      }
    } catch {
      // corpo não é JSON — usa o texto bruto só para log interno
    }
    const err = new Error(message || `${init.method ?? 'GET'} ${path} -> ${res.status}`) as GatewayError
    err.status = res.status
    err.publicMessage = publicMessage
    throw err
  }

  return res.json() as Promise<T>
}

function toQueryString(params?: Record<string, string | number | undefined>): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number][]
  if (entries.length === 0) return ''
  return '?' + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()
}

export interface Gateway {
  get: <T>(path: string, params?: Record<string, string | number | undefined>) => Promise<T>
  post: <T>(path: string, body?: unknown) => Promise<T>
  patch: <T>(path: string, body?: unknown) => Promise<T>
  delete: <T>(path: string) => Promise<T>
  /** POST multipart/form-data (upload de anexo), com prazo maior. */
  upload: <T>(path: string, form: FormData) => Promise<T>
}

/**
 * Cliente HTTP do api-gateway autenticado com o token do chamador (PAT ou
 * OAuth). `tenantId` escolhe o workspace de uma conexão OAuth; com PAT é
 * ignorado (o PAT já é preso a um tenant). Nunca fala com Prisma/serviços de
 * domínio diretamente (D2).
 */
export function gateway(token: string, tenantId?: string): Gateway {
  const T = REQUEST_TIMEOUT_MS
  return {
    get: (path, params) => request(token, `${path}${toQueryString(params)}`, {}, T, tenantId),
    post: (path, body) => request(token, path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }, T, tenantId),
    patch: (path, body) => request(token, path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }, T, tenantId),
    delete: (path) => request(token, path, { method: 'DELETE' }, T, tenantId),
    upload: (path, form) => request(token, path, { method: 'POST', body: form }, UPLOAD_TIMEOUT_MS, tenantId),
  }
}

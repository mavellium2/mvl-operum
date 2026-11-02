/**
 * HTTP client for auth-service.
 * Used by Server Actions when AUTH_SERVICE_URL is defined.
 */

const AUTH_URL = (process.env.AUTH_SERVICE_URL ?? '').replace(/\/$/, '')
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? ''

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Api-Key': INTERNAL_KEY,
    ...extra,
  }
}

export async function authServiceLogin(email: string, password: string, subdomain?: string, preferredTenantId?: string) {
  const res = await fetch(`${AUTH_URL}/auth/login`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, password, ...(subdomain ? { subdomain } : {}), ...(preferredTenantId ? { preferredTenantId } : {}) }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? 'Credenciais inválidas')
  }
  return res.json() as Promise<{
    token: string
    forcePasswordChange: boolean
    user: { id: string; name: string; email: string; role: string; tenantId: string }
  }>
}

export async function authServiceLogout(token: string) {
  const response = await fetch(`${AUTH_URL}/auth/logout`, {
    method: 'POST',
    headers: headers({ Authorization: `Bearer ${token}` }),
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('Não foi possível confirmar o encerramento da sessão. Tente novamente.')
}

export async function authServiceRegister(data: {
  name: string
  email: string
  password: string
  tenantId: string
  role?: string
  forcePasswordChange?: boolean
}) {
  const res = await fetch(`${AUTH_URL}/auth/register`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? 'Erro ao criar usuário')
  }
  return res.json()
}

export async function authServiceRequestReset(email: string, subdomain?: string) {
  const res = await fetch(`${AUTH_URL}/auth/password/request-reset`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, ...(subdomain ? { subdomain } : {}) }),
  })
  return res.json()
}

export async function authServiceValidateCode(email: string, code: string, subdomain?: string) {
  const res = await fetch(`${AUTH_URL}/auth/password/validate-code`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, code, ...(subdomain ? { subdomain } : {}) }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Código inválido ou expirado.')
  }
  return res.json()
}

export async function authServiceResetPassword(
  email: string,
  code: string,
  newPassword: string,
  subdomain?: string,
) {
  const res = await fetch(`${AUTH_URL}/auth/password/reset`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email, code, newPassword, ...(subdomain ? { subdomain } : {}) }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error ?? 'Código inválido ou expirado.')
  }
  return res.json()
}

export async function authServiceAlterarSenha(token: string, password: string) {
  const res = await fetch(`${AUTH_URL}/auth/password/alterar`, {
    method: 'POST',
    headers: headers({ Authorization: `Bearer ${token}` }),
    body: JSON.stringify({ password }),
  })
  if (!res.ok) throw new Error('Erro ao alterar senha')
}

export class AuthUnavailableError extends Error {
  readonly status = 503
  constructor() { super('Autenticação indisponível. Tente novamente.'); this.name = 'AuthUnavailableError' }
}
export async function authServiceVerify(token: string): Promise<{ userId: string; tenantId: string; role: string } | null> {
  try {
    const response = await fetch(`${AUTH_URL}/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store', signal: AbortSignal.timeout(3000),
    })
    if (response.status === 401) return null
    if (!response.ok) throw new AuthUnavailableError()
    const data = await response.json() as Record<string, unknown>
    if (typeof data.userId !== 'string' || typeof data.tenantId !== 'string' || typeof data.role !== 'string') throw new AuthUnavailableError()
    return { userId: data.userId, tenantId: data.tenantId, role: data.role }
  } catch { throw new AuthUnavailableError() }
}

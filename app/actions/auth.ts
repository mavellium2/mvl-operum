'use server'

import { SESSION_COOKIE_OPTIONS } from '@/lib/sessionCookie'
import { LAST_SEEN_COOKIE, destinoInterno } from '@/lib/sessionIdle'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import Redis from 'ioredis'
import {
  RequestResetSchema,
  ValidateCodeSchema,
  ResetPasswordSchema,
} from '@/lib/validation/authSchemas'
import type { FormState } from '@/types/auth'
import {
  authServiceLogin,
  authServiceLogout,
  authServiceRegister,
  authServiceRequestReset,
  authServiceValidateCode,
  authServiceResetPassword,
} from '@/lib/authClient'
import { projectsApi, authApi } from '@/lib/api-client'
import { verifySession, resolveProjectDestination } from '@/lib/dal'
import { revalidatePath } from 'next/cache'


let _rateLimitRedis: Redis | null = null

function getRateLimitRedis(): Redis | null {
  if (_rateLimitRedis) return _rateLimitRedis
  try {
    _rateLimitRedis = new Redis({
      host: process.env.REDIS_HOST ?? 'redis-session',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    })
    _rateLimitRedis.on('error', () => {})
    return _rateLimitRedis
  } catch {
    return null
  }
}

async function redisRateLimit(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
  try {
    const redis = getRateLimitRedis()
    if (!redis) return false
    const attempts = await redis.incr(key)
    if (attempts === 1) await redis.expire(key, ttlSeconds)
    return attempts > limit
  } catch {
    return false // fail open — Redis unavailable
  }
}

export async function signupAction(prevState: FormState, formData: FormData): Promise<FormState> {
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const tenantId = process.env.DEFAULT_TENANT_ID
  if (!tenantId) return { message: 'Cadastro indisponível — tenant não configurado' }

  try {
    await authServiceRegister({ name, email, password, tenantId })
    const { token } = await authServiceLogin(email, password)
    const cookieStore = await cookies()
    cookieStore.set('session', token, SESSION_COOKIE_OPTIONS)
  } catch (err) {
    return { message: err instanceof Error ? err.message : 'Erro ao criar conta. Tente novamente.' }
  }

  redirect('/')
}

export async function loginAction(prevState: FormState, formData: FormData): Promise<FormState> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  // Rate limit: max 10 login attempts per IP per 15 minutes.
  const headerStore = await headers()
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rateLimited = await redisRateLimit(`login_rate:${ip}`, 10, 900)
  if (rateLimited) {
    return { message: 'Muitas tentativas de login. Aguarde 15 minutos.' }
  }

  let forcePasswordChange = false
  let projectRedirect = '/projetos'

  const subdomain = await getSubdomain()

  try {
    const result = await authServiceLogin(email, password, subdomain)
    forcePasswordChange = result.forcePasswordChange
    const cookieStore = await cookies()
    cookieStore.set('session', result.token, SESSION_COOKIE_OPTIONS)
    const { role, id: userId } = result.user
    if (role !== 'admin') {
      const projects = await projectsApi.getUserProjects(userId).catch(() => []) as unknown[]
      if (projects.length === 0) projectRedirect = '/no-project'
      else if (projects.length === 1) projectRedirect = `/projetos/${(projects[0] as { projectId?: string; id?: string }).projectId ?? (projects[0] as { id: string }).id}/dashboard`
    }
  } catch (err) {
    if (err instanceof Error) return { message: err.message }
    console.error('[loginAction] non-Error thrown:', err)
    return { message: 'Erro ao fazer login. Tente novamente.' }
  }

  if (forcePasswordChange) redirect('/alterar-senha')
  // Volta para onde o usuário estava (ex.: sessão expirada por inatividade),
  // só para caminhos internos e se ele tiver algum projeto.
  const from = destinoInterno(formData.get('from') as string | null)
  // A autorização OAuth não depende de projeto: volta para ela mesmo sem nenhum.
  if (from?.startsWith('/oauth/')) redirect(from)
  redirect(from && projectRedirect !== '/no-project' ? from : projectRedirect)
}

/**
 * Chamada pelo IdleLogout enquanto há atividade na tela sem requisições
 * (ex.: lendo um card). Não faz nada: passar pelo proxy já renova o last_seen.
 */
export async function touchSessionAction() {
  return { ok: true }
}

/** Sessão expirada por inatividade no navegador: encerra e volta ao login. */
export async function expireSessionAction(from: string) {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (token) await authServiceLogout(token).catch(() => {})
  cookieStore.delete('session')
  cookieStore.delete(LAST_SEEN_COOKIE)
  const params = new URLSearchParams({ motivo: 'inatividade' })
  const destino = destinoInterno(from)
  if (destino) params.set('from', destino)
  redirect(`/login?${params.toString()}`)
}

export async function logoutAction() {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  if (token) await authServiceLogout(token)
  cookieStore.delete('session')
  cookieStore.delete(LAST_SEEN_COOKIE)
  redirect('/login')
}

// ── Password Recovery ──────────────────────────────────────

/** Extrai o subdomínio do host da request (nunca do cliente). */
async function getSubdomain(): Promise<string | undefined> {
  try {
    const headerStore = await headers()
    const host = (headerStore.get('host') ?? '').split(':')[0] // remove a porta (ex.: "localhost:3000")
    const sub = host.split('.')[0]
    return sub && sub !== 'www' && sub !== 'localhost' && !/^\d/.test(sub) ? sub : undefined
  } catch {
    return undefined
  }
}

export async function requestPasswordResetAction(_prevState: unknown, formData: FormData) {
  const raw = { email: (formData.get('email') as string | null)?.toLowerCase().trim() ?? '' }
  const parsed = RequestResetSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const { email } = parsed.data

  // Rate limit front-end: 3 solicitações por e-mail por 15 min (defense-in-depth)
  const rateLimited = await redisRateLimit(`reset_rate:${email}`, 3, 900)
  if (rateLimited) {
    return { error: 'Muitas tentativas. Aguarde 15 minutos.' }
  }

  const subdomain = await getSubdomain()
  // Sempre retorna sucesso — anti-enumeração
  return authServiceRequestReset(email, subdomain)
}

export async function validateResetCodeAction(_prevState: unknown, formData: FormData) {
  const raw = {
    email: (formData.get('email') as string | null)?.toLowerCase().trim() ?? '',
    code: (formData.get('code') as string | null)?.toUpperCase().trim() ?? '',
  }
  const parsed = ValidateCodeSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const subdomain = await getSubdomain()
  try {
    return await authServiceValidateCode(parsed.data.email, parsed.data.code, subdomain)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Código inválido ou expirado.' }
  }
}

export async function resetPasswordAction(_prevState: unknown, formData: FormData) {
  const newPassword = (formData.get('newPassword') as string | null) ?? ''
  const confirmPassword = (formData.get('confirmPassword') as string | null) ?? ''

  if (newPassword !== confirmPassword) {
    return { error: 'Senhas não coincidem.' }
  }

  const raw = {
    email: (formData.get('email') as string | null)?.toLowerCase().trim() ?? '',
    code: (formData.get('code') as string | null)?.toUpperCase().trim() ?? '',
    newPassword,
  }
  const parsed = ResetPasswordSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const subdomain = await getSubdomain()
  try {
    return await authServiceResetPassword(
      parsed.data.email,
      parsed.data.code,
      parsed.data.newPassword,
      subdomain,
    )
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Código inválido ou expirado.' }
  }
}

export async function getMyTenantsAction() {
  await verifySession() // redirects to /login if not authenticated
  try {
    return await authApi.getMyTenants()
  } catch {
    return []
  }
}

// CUID v1/v2 format — prevents arbitrary string injection downstream
const CUID_RE = /^c[a-z0-9]{20,}$/i

export async function switchTenantAction(targetTenantId: string) {
  if (!targetTenantId?.trim() || !CUID_RE.test(targetTenantId)) return

  const { token: oldToken } = await verifySession()

  // Verify the user actually has a membership in the target tenant before switching.
  // This is a client-side guard; auth-service enforces the same check server-side.
  const myTenants = await authApi.getMyTenants().catch(() => [])
  const isMember = myTenants.some(t => t.tenantId === targetTenantId)
  if (!isMember) return

  const result = await authApi.switchTenant(targetTenantId)

  // Invalidate old session only after the new one is issued, to avoid a race
  // where the gateway rejects the switch call as "Sessão expirada".
  authServiceLogout(oldToken).catch((err: unknown) => {
    console.warn('[switchTenantAction] failed to invalidate old session:', err instanceof Error ? err.message : err)
  })

  const cookieStore = await cookies()
  cookieStore.set('session', result.token, SESSION_COOKIE_OPTIONS)

  revalidatePath('/', 'layout')
  redirect('/projetos')
}

/**
 * Usado pelo botão "Verificar novamente" em /no-project. Reaplica a mesma
 * regra de destino da Home (consulta o banco a cada chamada) e redireciona
 * automaticamente se o usuário já tiver acesso. Se ainda não tiver, retorna
 * sem redirecionar — o cliente mostra um aviso discreto.
 */
export async function checkProjectAccessAction(): Promise<{ hasAccess: false }> {
  const destination = await resolveProjectDestination()
  if (destination) redirect(destination)
  return { hasAccess: false }
}

/**
 * Opções do cookie `session`. Sem `maxAge`/`expires`: é um cookie de sessão
 * do navegador, que some ao fechar o navegador. O JWT continua com o próprio
 * `exp` (7 dias) como teto, e a inatividade é controlada pelo proxy.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
}

/** Preferência de instituição; nunca substitui autenticação ou autorização. */
export const LAST_TENANT_COOKIE = 'operum_last_tenant'
export const LAST_TENANT_COOKIE_OPTIONS = { ...SESSION_COOKIE_OPTIONS, maxAge: 60 * 60 * 24 * 30 }

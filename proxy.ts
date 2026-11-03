import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify, importSPKI, type JWTPayload } from 'jose'
import { LAST_SEEN_COOKIE, idleMs, isIdleExpired, isPassiveRequest } from '@/lib/sessionIdle'
import { LAST_TENANT_COOKIE, LAST_TENANT_COOKIE_OPTIONS } from '@/lib/sessionCookie'

const TENANT_ID_RE = /^(?:c[a-z0-9]{20,63}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

function normalizePem(raw: string): string {
  return raw.replace(/\\n/g, '\n')
}

async function verifyToken(token: string): Promise<JWTPayload | null> {
  const publicKeyPem = process.env.JWT_PUBLIC_KEY
    ? normalizePem(process.env.JWT_PUBLIC_KEY)
    : null

  if (publicKeyPem) {
    try {
      const publicKey = await importSPKI(publicKeyPem, 'RS256')
      const { payload } = await jwtVerify(token, publicKey, { algorithms: ['RS256'] })
      return payload
    } catch {
      // not a valid RS256 token — try HS256
    }
  }

  const secret = process.env.SESSION_SECRET
  if (secret) {
    try {
      const hs256Secret = new TextEncoder().encode(secret)
      const { payload } = await jwtVerify(token, hs256Secret, { algorithms: ['HS256'] })
      return payload
    } catch {
      return null
    }
  }

  return null
}

/**
 * Para onde voltar depois do login. A autorização OAuth depende da query
 * (client_id, redirect_uri, PKCE...), então ela vai junto; nas demais páginas,
 * só o caminho, como antes.
 */
function returnTo(request: NextRequest): string {
  const { pathname, search } = request.nextUrl
  return pathname.startsWith('/oauth/') ? `${pathname}${search}` : pathname
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('session')?.value

  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', returnTo(request))
    return NextResponse.redirect(loginUrl)
  }

  const session = await verifyToken(token)
  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', returnTo(request))
    const response = NextResponse.redirect(loginUrl)
    response.cookies.delete('session')
    return response
  }

  // Sessão por inatividade: sem atividade real por mais que o limite, o
  // usuário refaz o login (e volta para a mesma página depois).
  const now = Date.now()
  if (isIdleExpired(request.cookies.get(LAST_SEEN_COOKIE)?.value, now, idleMs())) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', returnTo(request))
    loginUrl.searchParams.set('motivo', 'inatividade')
    const response = NextResponse.redirect(loginUrl)
    if (typeof session.tenantId === 'string' && TENANT_ID_RE.test(session.tenantId)) {
      response.cookies.set(LAST_TENANT_COOKIE, session.tenantId, LAST_TENANT_COOKIE_OPTIONS)
    }
    response.cookies.delete('session')
    response.cookies.delete(LAST_SEEN_COOKIE)
    return response
  }

  const response = NextResponse.next()
  // Polling e prefetch não renovam a atividade, senão a sessão nunca expiraria.
  if (!isPassiveRequest(request.nextUrl.pathname, request.headers)) {
    response.cookies.set(LAST_SEEN_COOKIE, String(now), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    })
  }
  return response
}

// Arquivos do PWA (manifest, service worker, ícones e /offline) são públicos:
// o navegador os busca sem sessão para instalar o app.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|login|register|recuperar-senha|api/internal/authorize|api/internal/task-budget/|api/internal/task-costs/|api/health|api/metrics|api/me|api/csv|api/uploads|manifest.webmanifest|sw.js|icons/|apple-touch-icon|offline|privacidade$|termos$).*)',
  ],
}

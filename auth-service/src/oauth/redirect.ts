/**
 * Comparação de redirect_uri (SDD-mcp-oauth §4.2).
 *
 * Regra geral: igualdade exata com um URI registrado. Exceção do RFC 8252
 * §7.3 para clientes nativos (Claude Code): em loopback http
 * (`localhost`/`127.0.0.1`) só a porta pode variar.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1'])

function parse(uri: string): URL | null {
  try {
    return new URL(uri)
  } catch {
    return null
  }
}

export function isLoopback(uri: string): boolean {
  const u = parse(uri)
  return !!u && u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname)
}

/** URI aceitável como redirect: HTTPS ou loopback http, sem fragmento nem credenciais. */
export function isValidRedirectUri(uri: string): boolean {
  const u = parse(uri)
  if (!u || u.hash || u.username || u.password) return false
  if (u.protocol === 'https:') return true
  return isLoopback(uri)
}

export function redirectMatches(requested: string, registered: string): boolean {
  if (requested === registered) return true
  if (!isLoopback(requested) || !isLoopback(registered)) return false
  const a = new URL(requested)
  const b = new URL(registered)
  return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search
}

export function redirectAllowed(requested: string, registered: string[]): boolean {
  return isValidRedirectUri(requested) && registered.some(r => redirectMatches(requested, r))
}

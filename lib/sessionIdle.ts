/**
 * Expiração da sessão por inatividade (sem dependências de Node: roda no
 * proxy e no navegador).
 */

/** Cookie com o instante (ms) da última atividade real do usuário. */
export const LAST_SEEN_COOKIE = 'last_seen'

const PADRAO_MINUTOS = 30

/** Minutos sem uso até a sessão expirar (`NEXT_PUBLIC_SESSION_IDLE_MINUTES`, padrão 30). */
export function idleMinutes(raw: string | undefined = process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 1 ? n : PADRAO_MINUTOS
}

export function idleMs(raw?: string): number {
  return idleMinutes(raw) * 60_000
}

/** Sem `last_seen` válido (sessão antiga, cookie apagado) não expira: o cookie é criado agora. */
export function isIdleExpired(lastSeen: string | undefined, now: number, limiteMs: number): boolean {
  const t = Number(lastSeen)
  if (!lastSeen || !Number.isFinite(t) || t <= 0) return false
  return now - t > limiteMs
}

/** Requisições automáticas que NÃO contam como atividade (senão a sessão nunca expira). */
const ROTAS_PASSIVAS = ['/api/notificacoes/count']

export function isPassiveRequest(pathname: string, headers: Headers): boolean {
  if (ROTAS_PASSIVAS.includes(pathname)) return true
  if (headers.get('next-router-prefetch')) return true
  const purpose = `${headers.get('purpose') ?? ''} ${headers.get('sec-purpose') ?? ''}`.toLowerCase()
  return purpose.includes('prefetch')
}

/**
 * Destino seguro para voltar depois do login: só caminhos internos
 * ("/projetos/x"), nunca URLs externas ("//evil.com", "https://…").
 */
export function destinoInterno(from: string | null | undefined): string | null {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) return null
  // O parser de URL descarta tab/CR/LF e trata "\" como "/": "/\t/evil.com"
  // vira "//evil.com". Recusa controles e barra invertida e confere a origem.
  if (/[\u0000-\u001F\u007F\\]/.test(from)) return null
  let url: URL
  try { url = new URL(from, 'http://operum.invalid') } catch { return null }
  if (url.origin !== 'http://operum.invalid') return null
  return url.pathname + url.search + url.hash
}

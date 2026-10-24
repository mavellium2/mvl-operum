import { createHash } from 'crypto'
import { gateway as defaultGatewayFactory, OAUTH_ACCESS_PREFIX, type Gateway } from './gateway.js'
import { UserError } from './errors.js'

export const PAT_PREFIX = 'opr_pat_'
export const MAX_TOKENS = 10
const PAT_PATTERN = /^opr_pat_[A-Za-z0-9]{8,128}$/
const OAUTH_PATTERN = /^opr_oat_[A-Za-z0-9]{8,128}$/

export function isOAuthToken(token: string): boolean {
  return token.startsWith(OAUTH_ACCESS_PREFIX)
}
const IDENTITY_TTL_MS = 60_000

export interface TenantIdentity {
  tenantId: string
  tenantName: string | null
  userId: string
  userName: string
  email: string
  role: string
}

export interface TenantContext extends TenantIdentity {
  gw: Gateway
  isDefault: boolean
  /** Hash do token — usado como chave de idempotência/cache, nunca o token cru. */
  tokenHash: string
}

interface MeResponse {
  id: string
  name: string
  email: string
  role: string
  tenantId: string
}

interface MyTenantItem {
  tenantId: string
  tenantName: string
  isCurrent: boolean
}

/**
 * Extrai os PATs da requisição: `Authorization: Bearer <pat>` (padrão) e
 * `X-Operum-Tokens: <pat>,<pat>` (demais tenants). Cada PAT é preso a um único
 * tenant no Operum — é assim que um único servidor MCP opera vários tenants sem
 * que nenhum token ganhe acesso além do próprio.
 * Retorna null quando o conjunto é inválido (→ 401).
 */
export function parseTokens(authorization: string | undefined, extra: string | string[] | undefined): string[] | null {
  const primary = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  const extraRaw = Array.isArray(extra) ? extra.join(',') : (extra ?? '')

  // Token OAuth (conector do Claude): uma conexão já cobre os workspaces
  // autorizados no consentimento. Não se mistura com PATs extras.
  if (OAUTH_PATTERN.test(primary)) return extraRaw.trim() ? null : [primary]
  if (!PAT_PATTERN.test(primary)) return null

  const others = extraRaw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
  if (others.some(t => !PAT_PATTERN.test(t))) return null

  const tokens = [...new Set([primary, ...others])]
  if (tokens.length > MAX_TOKENS) return null
  return tokens
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Cache de identidade por hash do token (TTL igual ao cache de introspecção do
// gateway): evita 2 chamadas extras por tool call. Revogação continua imediata
// porque toda chamada de domínio passa pelo gateway, que introspecta o PAT.
const identityCache = new Map<string, { expires: number; identity: TenantIdentity }>()

export function clearIdentityCache(): void {
  identityCache.clear()
}

async function fetchIdentity(gw: Gateway, tokenHash: string): Promise<TenantIdentity> {
  const cached = identityCache.get(tokenHash)
  if (cached && cached.expires > Date.now()) return cached.identity

  const me = await gw.get<MeResponse>('/auth/me')
  let tenantName: string | null = null
  try {
    const tenants = await gw.get<MyTenantItem[]>('/auth/my-tenants')
    tenantName = tenants.find(t => t.tenantId === me.tenantId)?.tenantName ?? null
  } catch {
    // nome do tenant é cosmético — não falha a identidade por causa dele
  }

  const identity: TenantIdentity = {
    tenantId: me.tenantId,
    tenantName,
    userId: me.id,
    userName: me.name,
    email: me.email,
    role: me.role,
  }
  identityCache.set(tokenHash, { expires: Date.now() + IDENTITY_TTL_MS, identity })
  return identity
}

export interface TokenFailure {
  token_index: number
  status?: number
  message: string
}

/**
 * Resolve os tokens da requisição em contextos por tenant. Resolução é lazy e
 * memoizada por requisição: uma tool que usa só o tenant padrão não paga a
 * introspecção dos demais tokens.
 */
export class TenantRegistry {
  private readonly entries: { token: string; tokenHash: string; gw: Gateway }[]
  private resolved: Promise<{ contexts: TenantContext[]; failures: TokenFailure[] }> | null = null
  private defaultCtx: Promise<TenantContext> | null = null

  private readonly oauth: boolean

  constructor(tokens: string[], private readonly makeGateway: (token: string, tenantId?: string) => Gateway = defaultGatewayFactory) {
    if (tokens.length === 0) throw new Error('TenantRegistry exige ao menos um token')
    this.oauth = isOAuthToken(tokens[0])
    this.entries = tokens.map(token => ({ token, tokenHash: hashToken(token), gw: makeGateway(token) }))
  }

  /** A conexão é OAuth (conector do Claude) e não PAT. */
  get isOAuth(): boolean {
    return this.oauth
  }

  /**
   * Conexão OAuth: um só token cobre vários workspaces. O gateway devolve em
   * /auth/my-tenants só os workspaces autorizados; cada um ganha um cliente
   * com X-Operum-Tenant e uma chave de cache própria.
   */
  private async oauthContexts(def: TenantContext): Promise<{ contexts: TenantContext[]; failures: TokenFailure[] }> {
    const token = this.entries[0].token
    const granted = await def.gw.get<MyTenantItem[]>('/auth/my-tenants')
    const contexts: TenantContext[] = [def]
    const failures: TokenFailure[] = []
    for (const t of granted) {
      if (t.tenantId === def.tenantId) continue
      const tokenHash = hashToken(`${token}#${t.tenantId}`)
      const gw = this.makeGateway(token, t.tenantId)
      try {
        const identity = await fetchIdentity(gw, tokenHash)
        if (!this.entries.some(e => e.tokenHash === tokenHash)) this.entries.push({ token, tokenHash, gw })
        contexts.push({ ...identity, gw, isDefault: false, tokenHash })
      } catch (err) {
        const e = err as { status?: number; message?: string }
        failures.push({ token_index: 0, status: e?.status, message: e?.message ?? 'erro desconhecido' })
      }
    }
    return { contexts, failures }
  }

  /** Only used to encrypt a task-bound, short-lived upload grant; never serialize this token. */
  tokenFor(context: TenantContext): string {
    const entry = this.entries.find(e => e.tokenHash === context.tokenHash)
    if (!entry) throw new UserError('Token não disponível para este tenant.')
    return entry.token
  }

  get tokenCount(): number {
    return this.entries.length
  }

  /** Contexto do token do header Authorization. Erros (401 etc.) propagam para a tool. */
  getDefault(): Promise<TenantContext> {
    if (!this.defaultCtx) {
      const entry = this.entries[0]
      this.defaultCtx = fetchIdentity(entry.gw, entry.tokenHash).then(identity => ({
        ...identity,
        gw: entry.gw,
        isDefault: true,
        tokenHash: entry.tokenHash,
      }))
      // Não memoiza falha: a próxima chamada tenta de novo.
      this.defaultCtx.catch(() => {
        this.defaultCtx = null
      })
    }
    return this.defaultCtx
  }

  /** Todos os tenants alcançáveis. Tokens que falham vão para `failures` sem derrubar os demais. */
  listAll(): Promise<{ contexts: TenantContext[]; failures: TokenFailure[] }> {
    if (!this.resolved && this.oauth) {
      this.resolved = this.getDefault().then(def => this.oauthContexts(def))
      this.resolved.catch(() => {
        this.resolved = null
      })
    }
    if (!this.resolved) {
      this.resolved = (async () => {
        const results = await Promise.allSettled(
          this.entries.map(async (entry, index) => {
            const identity = await fetchIdentity(entry.gw, entry.tokenHash)
            return { ...identity, gw: entry.gw, isDefault: index === 0, tokenHash: entry.tokenHash }
          }),
        )
        const contexts: TenantContext[] = []
        const failures: TokenFailure[] = []
        const seen = new Set<string>()
        results.forEach((r, index) => {
          if (r.status === 'fulfilled') {
            // Dois tokens do mesmo tenant: vale o primeiro (o do Authorization tem prioridade).
            if (!seen.has(r.value.tenantId)) {
              seen.add(r.value.tenantId)
              contexts.push(r.value)
            }
          } else {
            const err = r.reason as { status?: number; message?: string }
            failures.push({ token_index: index, status: err?.status, message: err?.message ?? 'erro desconhecido' })
          }
        })
        return { contexts, failures }
      })()
    }
    return this.resolved
  }

  /**
   * Contexto do tenant pedido pela tool. Sem tenantId → token padrão.
   * tenantId sem token correspondente → erro acionável listando os disponíveis.
   */
  async resolve(tenantId?: string): Promise<TenantContext> {
    const def = await this.getDefault()
    if (!tenantId || tenantId === def.tenantId) return def

    const { contexts } = await this.listAll()
    const match = contexts.find(c => c.tenantId === tenantId)
    if (match) return match

    const available = contexts.map(c => `${c.tenantId} (${c.tenantName ?? 'sem nome'})`).join(', ')
    if (this.oauth) {
      throw new UserError(
        `O workspace ${tenantId} não foi autorizado nesta conexão. Workspaces disponíveis: ${available}. ` +
          'Para incluir outro, reconecte o conector do Operum no Claude e marque o workspace.',
      )
    }
    throw new UserError(
      `Nenhum token configurado para o tenant ${tenantId}. Tenants disponíveis: ${available}. ` +
        'Para operar outro tenant, gere um PAT nele (/configuracoes/integracoes) e adicione ao header X-Operum-Tokens.',
    )
  }
}

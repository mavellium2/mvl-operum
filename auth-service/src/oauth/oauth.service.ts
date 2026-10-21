import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common'
import { prisma } from '../prisma'
import { RedisService } from '../redis/redis.service'
import {
  OAUTH_ACCESS_PREFIX, OAUTH_CODE_PREFIX, OAUTH_REFRESH_PREFIX,
  generateOAuthSecret, hashApiToken, pkceS256, safeEqual,
} from '../lib/crypto'
import {
  ACCESS_TOKEN_TTL_S, CODE_TTL_S, GRANT_MAX_TTL_S, REFRESH_REUSE_GRACE_MS, REFRESH_TOKEN_TTL_S,
  SCOPE_READ, SCOPE_WRITE, SUPPORTED_SCOPES, oauthConfig,
} from './oauth.config'
import { CimdError, cimdHostAllowed, fetchClientMetadata, isCimdClientId, type CimdFetcher } from './cimd'
import { isLoopback, isValidRedirectUri, redirectAllowed } from './redirect'
import type { AuthorizeRequest } from './oauth.dto'

const CIMD_CACHE_MS = 24 * 60 * 60 * 1000
const LAST_USED_THROTTLE_MS = 60 * 1000
const DCR_CLIENT_PREFIX = 'opr_dcr_'

/** Erro OAuth no formato da RFC 6749 §5.2. */
export class OAuthError extends Error {
  constructor(readonly error: string, readonly description: string, readonly status = 400) {
    super(description)
  }
}

type ClientRow = { id: string; clientId: string; kind: string; name: string; redirectUris: string[]; fetchedAt: Date | null }
type TenantChoice = { tenantId: string; userId: string; isDefault: boolean }

export interface AuthorizeCheck {
  ok: true
  client: { name: string; kind: string; clientId: string }
  redirectUri: string
  redirectHost: string
  loopback: boolean
  scopes: string[]
  writeRequested: boolean
  tenants: { tenantId: string; tenantName: string; role: string; isCurrent: boolean }[]
}

/** Erro na autorização: `redirect` presente = devolver ao cliente; ausente = mostrar na tela. */
export interface AuthorizeFailure {
  ok: false
  error: string
  description: string
  redirect?: string
}

export interface IntrospectionResult {
  active: boolean
  grantId?: string
  clientId?: string
  clientName?: string
  scopes?: string[]
  resource?: string
  tenants?: { tenantId: string; tenantName: string; userId: string; role: string; isDefault: boolean }[]
}

function sameResource(a: string, b: string): boolean {
  return a.replace(/\/+$/, '').toLowerCase() === b.replace(/\/+$/, '').toLowerCase()
}

function withParams(uri: string, params: Record<string, string | undefined>): string {
  const u = new URL(uri)
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  return u.toString()
}

function seconds(n: number): Date {
  return new Date(Date.now() + n * 1000)
}

function minDate(a: Date, b: Date): Date {
  return a < b ? a : b
}

@Injectable()
export class OAuthService {
  private readonly logger = new Logger('OAuth')

  /** Leitor do documento CIMD; trocado nos testes. */
  fetchMetadata: CimdFetcher = fetchClientMetadata

  constructor(private readonly redis: RedisService) {}

  // ── Clientes ────────────────────────────────────────────────────────────────

  async register(dto: { redirect_uris: string[]; client_name?: string; token_endpoint_auth_method?: string; grant_types?: string[]; response_types?: string[] }) {
    const cfg = oauthConfig()
    if (dto.token_endpoint_auth_method && dto.token_endpoint_auth_method !== 'none') {
      throw new OAuthError('invalid_client_metadata', 'Só clientes públicos (token_endpoint_auth_method "none") são aceitos')
    }
    if (dto.grant_types?.some(g => g !== 'authorization_code' && g !== 'refresh_token')) {
      throw new OAuthError('invalid_client_metadata', 'grant_types não suportado')
    }
    if (dto.response_types?.some(r => r !== 'code')) {
      throw new OAuthError('invalid_client_metadata', 'response_types não suportado')
    }
    for (const uri of dto.redirect_uris) {
      const allowed = isValidRedirectUri(uri) && (isLoopback(uri) || cfg.dcrAllowedRedirects.includes(uri))
      if (!allowed) throw new OAuthError('invalid_redirect_uri', `redirect_uri não permitido: ${uri.slice(0, 200)}`)
    }
    const clientId = generateOAuthSecret(DCR_CLIENT_PREFIX)
    const name = dto.client_name?.trim() || 'Cliente MCP'
    const created = await prisma.oAuthClient.create({
      data: { clientId, kind: 'dcr', name, redirectUris: dto.redirect_uris },
    })
    this.logger.log(`AUDIT oauth.register clientRowId=${created.id} redirects=${dto.redirect_uris.length}`)
    return {
      client_id: clientId,
      client_id_issued_at: Math.floor(created.createdAt.getTime() / 1000),
      client_name: name,
      redirect_uris: dto.redirect_uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
    }
  }

  /** Cliente conhecido (DCR) ou documento CIMD de host permitido. `null` = cliente inválido. */
  async resolveClient(clientId: string): Promise<ClientRow | null> {
    if (isCimdClientId(clientId)) {
      if (!cimdHostAllowed(clientId, oauthConfig().cimdAllowedHosts)) return null
      const existing = await prisma.oAuthClient.findUnique({ where: { clientId } })
      if (existing && existing.fetchedAt && Date.now() - existing.fetchedAt.getTime() < CIMD_CACHE_MS) return existing
      let meta
      try {
        meta = await this.fetchMetadata(clientId)
      } catch (err) {
        this.logger.warn(`CIMD recusado: ${err instanceof CimdError ? err.message : 'erro de rede'}`)
        return null
      }
      return prisma.oAuthClient.upsert({
        where: { clientId },
        create: { clientId, kind: 'cimd', name: meta.name, redirectUris: meta.redirectUris, fetchedAt: new Date() },
        update: { name: meta.name, redirectUris: meta.redirectUris, fetchedAt: new Date() },
      })
    }
    if (!clientId.startsWith(DCR_CLIENT_PREFIX)) return null
    return prisma.oAuthClient.findUnique({ where: { clientId } })
  }

  // ── Autorização (tela de consentimento) ─────────────────────────────────────

  private parseScopes(scope: string | undefined): string[] | null {
    if (!scope?.trim()) return [...SUPPORTED_SCOPES]
    const requested = [...new Set(scope.trim().split(/\s+/))]
    if (requested.some(s => !(SUPPORTED_SCOPES as readonly string[]).includes(s))) return null
    if (!requested.includes(SCOPE_READ)) requested.push(SCOPE_READ)
    return requested
  }

  private async myIdentity(userId: string) {
    const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isActive: true, deletedAt: true } })
    if (!me || !me.isActive || me.deletedAt) throw new UnauthorizedException()
    return me
  }

  private async tenantsOf(email: string) {
    const users = await prisma.user.findMany({
      where: { email, deletedAt: null, isActive: true, forcePasswordChange: false },
      include: { tenant: { select: { name: true, status: true } } },
    })
    return users.filter(u => u.tenant.status === 'ACTIVE')
  }

  async checkAuthorize(req: AuthorizeRequest, userId: string): Promise<AuthorizeCheck | AuthorizeFailure> {
    const client = await this.resolveClient(req.client_id)
    if (!client) return { ok: false, error: 'invalid_client', description: 'Aplicativo não reconhecido pelo Operum.' }
    if (!redirectAllowed(req.redirect_uri, client.redirectUris)) {
      return { ok: false, error: 'invalid_request', description: 'Endereço de retorno não registrado para este aplicativo.' }
    }
    const fail = (error: string, description: string): AuthorizeFailure => ({
      ok: false, error, description,
      redirect: withParams(req.redirect_uri, { error, error_description: description, state: req.state, iss: oauthConfig().issuer }),
    })
    if (req.response_type !== 'code') return fail('unsupported_response_type', 'Só response_type=code é aceito')
    if (req.code_challenge_method !== 'S256') return fail('invalid_request', 'PKCE com S256 é obrigatório')
    if (req.resource && !sameResource(req.resource, oauthConfig().resource)) return fail('invalid_target', 'resource desconhecido')
    const scopes = this.parseScopes(req.scope)
    if (!scopes) return fail('invalid_scope', 'Escopo desconhecido')

    const me = await this.myIdentity(userId)
    const tenants = await this.tenantsOf(me.email)
    return {
      ok: true,
      client: { name: client.name, kind: client.kind, clientId: client.clientId },
      redirectUri: req.redirect_uri,
      redirectHost: new URL(req.redirect_uri).host,
      loopback: isLoopback(req.redirect_uri),
      scopes,
      writeRequested: scopes.includes(SCOPE_WRITE),
      tenants: tenants.map(u => ({ tenantId: u.tenantId, tenantName: u.tenant.name, role: u.role, isCurrent: u.id === userId })),
    }
  }

  /** Usuário permitiu: cria o código e devolve a URL de retorno. */
  async approve(req: AuthorizeRequest, userId: string, tenantIds: string[], allowWrite: boolean): Promise<{ redirect: string } | AuthorizeFailure> {
    const check = await this.checkAuthorize(req, userId)
    if (check.ok === false) return check as AuthorizeFailure
    const client = (await this.resolveClient(req.client_id))!

    const me = await this.myIdentity(userId)
    const mine = await this.tenantsOf(me.email)
    const unique = [...new Set(tenantIds)]
    const chosen = unique.map(id => mine.find(u => u.tenantId === id))
    if (chosen.some(u => !u)) return { ok: false, error: 'access_denied', description: 'Workspace não disponível para este usuário.' }
    const current = chosen.find(u => u!.id === userId)
    const defaultTenant = (current ?? chosen[0])!.tenantId
    const tenants: TenantChoice[] = chosen.map(u => ({ tenantId: u!.tenantId, userId: u!.id, isDefault: u!.tenantId === defaultTenant }))

    const scopes = check.scopes.filter(s => s !== SCOPE_WRITE || allowWrite)
    const code = generateOAuthSecret(OAUTH_CODE_PREFIX)
    await prisma.oAuthCode.create({
      data: {
        codeHash: hashApiToken(code),
        clientRowId: client.id,
        redirectUri: req.redirect_uri,
        codeChallenge: req.code_challenge,
        resource: oauthConfig().resource,
        scopes,
        email: me.email,
        tenants,
        expiresAt: seconds(CODE_TTL_S),
      },
    })
    this.logger.log(`AUDIT oauth.approve userId=${userId} clientRowId=${client.id} tenants=${tenants.length} write=${scopes.includes(SCOPE_WRITE)}`)
    return { redirect: withParams(req.redirect_uri, { code, state: req.state, iss: oauthConfig().issuer }) }
  }

  /** Usuário negou: URL de retorno com access_denied. */
  async deny(req: AuthorizeRequest, userId: string): Promise<{ redirect: string } | AuthorizeFailure> {
    const check = await this.checkAuthorize(req, userId)
    if (check.ok === false) return check as AuthorizeFailure
    return { redirect: withParams(req.redirect_uri, { error: 'access_denied', state: req.state, iss: oauthConfig().issuer }) }
  }

  // ── Token ───────────────────────────────────────────────────────────────────

  private async activeTenants(email: string, tenants: { tenantId: string; userId: string; isDefault: boolean }[]) {
    if (tenants.length === 0) return []
    const users = await prisma.user.findMany({
      where: { id: { in: tenants.map(t => t.userId) }, email, deletedAt: null, isActive: true, forcePasswordChange: false },
      include: { tenant: { select: { name: true, status: true } } },
    })
    return tenants.flatMap(t => {
      const u = users.find(x => x.id === t.userId && x.tenantId === t.tenantId && x.tenant.status === 'ACTIVE')
      return u ? [{ tenantId: t.tenantId, tenantName: u.tenant.name, userId: u.id, role: u.role, isDefault: t.isDefault }] : []
    })
  }

  private async issuePair(grantId: string, grantExpiresAt: Date, scopes: string[]) {
    const access = generateOAuthSecret(OAUTH_ACCESS_PREFIX)
    const refresh = generateOAuthSecret(OAUTH_REFRESH_PREFIX)
    const accessExp = minDate(seconds(ACCESS_TOKEN_TTL_S), grantExpiresAt)
    await prisma.oAuthToken.createMany({
      data: [
        { tokenHash: hashApiToken(access), grantId, type: 'access', expiresAt: accessExp },
        { tokenHash: hashApiToken(refresh), grantId, type: 'refresh', expiresAt: minDate(seconds(REFRESH_TOKEN_TTL_S), grantExpiresAt) },
      ],
    })
    return {
      access_token: access,
      token_type: 'Bearer',
      expires_in: Math.max(1, Math.floor((accessExp.getTime() - Date.now()) / 1000)),
      refresh_token: refresh,
      scope: scopes.join(' '),
    }
  }

  async exchangeCode(dto: { code: string; redirect_uri: string; client_id: string; code_verifier: string; resource?: string }) {
    const codeHash = hashApiToken(dto.code)
    const record = await prisma.oAuthCode.findUnique({ where: { codeHash } })
    if (!record) throw new OAuthError('invalid_grant', 'Código inválido')

    if (record.usedAt) {
      // Reuso do código: quem tem o código pode ser um atacante; revoga o que ele gerou.
      if (record.grantId) await this.revokeGrantById(record.grantId, 'reuso de código')
      throw new OAuthError('invalid_grant', 'Código já utilizado')
    }
    // Uma tentativa por código: marca como usado antes de conferir o resto.
    const claimed = await prisma.oAuthCode.updateMany({ where: { codeHash, usedAt: null }, data: { usedAt: new Date() } })
    if (claimed.count !== 1) throw new OAuthError('invalid_grant', 'Código já utilizado')

    if (record.expiresAt < new Date()) throw new OAuthError('invalid_grant', 'Código expirado')
    const client = await this.resolveClient(dto.client_id)
    if (!client || client.id !== record.clientRowId) throw new OAuthError('invalid_grant', 'Código emitido para outro cliente')
    if (dto.redirect_uri !== record.redirectUri) throw new OAuthError('invalid_grant', 'redirect_uri diferente do usado na autorização')
    if (!safeEqual(pkceS256(dto.code_verifier), record.codeChallenge)) throw new OAuthError('invalid_grant', 'code_verifier inválido')
    if (dto.resource && !sameResource(dto.resource, record.resource)) throw new OAuthError('invalid_target', 'resource diferente do autorizado')

    const tenants = record.tenants as unknown as TenantChoice[]
    const active = await this.activeTenants(record.email, tenants)
    if (active.length === 0) throw new OAuthError('invalid_grant', 'Usuário sem acesso ativo aos workspaces escolhidos')

    const expiresAt = seconds(GRANT_MAX_TTL_S)
    const grant = await prisma.$transaction(async tx => {
      const g = await tx.oAuthGrant.create({
        data: {
          clientRowId: client.id,
          email: record.email,
          resource: record.resource,
          scopes: record.scopes,
          redirectUri: record.redirectUri,
          expiresAt,
          tenants: { create: tenants.map(t => ({ tenantId: t.tenantId, userId: t.userId, isDefault: t.isDefault })) },
        },
      })
      await tx.oAuthCode.update({ where: { codeHash }, data: { grantId: g.id } })
      return g
    })
    await prisma.oAuthClient.update({ where: { id: client.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
    this.logger.log(`AUDIT oauth.grant grantId=${grant.id} clientRowId=${client.id} tenants=${tenants.length}`)
    void this.cleanup()
    return this.issuePair(grant.id, expiresAt, record.scopes)
  }

  async refresh(dto: { refresh_token: string; client_id: string; scope?: string; resource?: string }) {
    const tokenHash = hashApiToken(dto.refresh_token)
    const record = await prisma.oAuthToken.findUnique({
      where: { tokenHash },
      include: { grant: { include: { client: true, tenants: true } } },
    })
    if (!record || record.type !== 'refresh') throw new OAuthError('invalid_grant', 'Refresh token inválido')
    const { grant } = record
    if (grant.revokedAt || grant.expiresAt < new Date()) throw new OAuthError('invalid_grant', 'Conexão revogada ou expirada')
    if (grant.client.clientId !== dto.client_id) throw new OAuthError('invalid_grant', 'Refresh token de outro cliente')

    if (record.rotatedAt) {
      // Reuso fora da janela de retentativa: o token antigo vazou. Revoga a conexão inteira.
      if (Date.now() - record.rotatedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
        await this.revokeGrantById(grant.id, 'reuso de refresh token')
      }
      throw new OAuthError('invalid_grant', 'Refresh token já utilizado')
    }
    if (record.expiresAt < new Date()) throw new OAuthError('invalid_grant', 'Refresh token expirado')
    if (dto.resource && !sameResource(dto.resource, grant.resource)) throw new OAuthError('invalid_target', 'resource diferente do autorizado')
    if (dto.scope?.trim() && dto.scope.trim().split(/\s+/).some(s => !grant.scopes.includes(s))) {
      throw new OAuthError('invalid_scope', 'Escopo além do autorizado')
    }

    const rotated = await prisma.oAuthToken.updateMany({ where: { tokenHash, rotatedAt: null }, data: { rotatedAt: new Date() } })
    if (rotated.count !== 1) throw new OAuthError('invalid_grant', 'Refresh token já utilizado')

    const active = await this.activeTenants(grant.email, grant.tenants)
    if (active.length === 0) throw new OAuthError('invalid_grant', 'Usuário sem acesso ativo aos workspaces da conexão')
    return this.issuePair(grant.id, grant.expiresAt, grant.scopes)
  }

  // ── Revogação e introspecção ────────────────────────────────────────────────

  private async revokeGrantById(grantId: string, reason: string): Promise<void> {
    await prisma.oAuthGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: new Date() } })
    const tokens = await prisma.oAuthToken.findMany({ where: { grantId, type: 'access' }, select: { tokenHash: true } })
    await this.redis.deleteOAuthCache(tokens.map(t => t.tokenHash))
    this.logger.log(`AUDIT oauth.revoke grantId=${grantId} reason="${reason}"`)
  }

  /** RFC 7009: sempre responde 200, exista o token ou não. */
  async revokeToken(token: string): Promise<void> {
    const record = await prisma.oAuthToken.findUnique({ where: { tokenHash: hashApiToken(token) }, select: { grantId: true } })
    if (record) await this.revokeGrantById(record.grantId, 'revogação pelo cliente')
  }

  async introspect(token: string): Promise<IntrospectionResult> {
    if (!token.startsWith(OAUTH_ACCESS_PREFIX)) return { active: false }
    const record = await prisma.oAuthToken.findUnique({
      where: { tokenHash: hashApiToken(token) },
      include: { grant: { include: { client: true, tenants: true } } },
    })
    const now = new Date()
    if (!record || record.type !== 'access' || record.expiresAt < now) return { active: false }
    const { grant } = record
    if (grant.revokedAt || grant.expiresAt < now) return { active: false }

    const tenants = await this.activeTenants(grant.email, grant.tenants)
    if (tenants.length === 0) return { active: false }
    if (!tenants.some(t => t.isDefault)) tenants[0].isDefault = true

    if (!grant.lastUsedAt || now.getTime() - grant.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS) {
      await prisma.oAuthGrant.update({ where: { id: grant.id }, data: { lastUsedAt: now } }).catch(() => undefined)
    }
    return {
      active: true,
      grantId: grant.id,
      clientId: grant.client.clientId,
      clientName: grant.client.name,
      scopes: grant.scopes,
      resource: grant.resource,
      tenants,
    }
  }

  // ── Apps conectados (perfil) ────────────────────────────────────────────────

  async listGrants(userId: string) {
    const me = await this.myIdentity(userId)
    const grants = await prisma.oAuthGrant.findMany({
      where: { email: me.email, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { client: true, tenants: { include: { tenant: { select: { name: true } } } } },
      orderBy: { createdAt: 'desc' },
    })
    return grants.map(g => ({
      id: g.id,
      clientName: g.client.name,
      redirectHost: new URL(g.redirectUri).host,
      scopes: g.scopes,
      tenants: g.tenants.map(t => t.tenant.name),
      createdAt: g.createdAt,
      lastUsedAt: g.lastUsedAt,
      expiresAt: g.expiresAt,
    }))
  }

  async revokeGrantForUser(grantId: string, userId: string): Promise<void> {
    const me = await this.myIdentity(userId)
    const grant = await prisma.oAuthGrant.findFirst({ where: { id: grantId, email: me.email }, select: { id: true } })
    if (!grant) throw new NotFoundException('Conexão não encontrada')
    await this.revokeGrantById(grant.id, `revogada pelo usuário ${userId}`)
  }

  /** Limpeza oportunista de códigos e tokens vencidos há mais de um dia. */
  private async cleanup(): Promise<void> {
    if (Math.random() > 0.05) return
    const before = new Date(Date.now() - 24 * 60 * 60 * 1000)
    await prisma.oAuthCode.deleteMany({ where: { expiresAt: { lt: before } } }).catch(() => undefined)
    await prisma.oAuthToken.deleteMany({ where: { expiresAt: { lt: before } } }).catch(() => undefined)
  }
}


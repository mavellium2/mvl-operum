import { describe, it, expect, vi, beforeEach } from 'vitest'
import { randomBytes } from 'crypto'

// Banco falso em memória com só o que o OAuthService usa.
const db = vi.hoisted(() => {
  type Row = Record<string, any>
  const state = {
    users: [] as Row[],
    tenants: [] as Row[],
    clients: [] as Row[],
    codes: [] as Row[],
    grants: [] as Row[],
    grantTenants: [] as Row[],
    tokens: [] as Row[],
  }
  let seq = 0
  const id = () => `id-${++seq}`
  const match = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Row[]).some(w => match(row, w))
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return (v.in as unknown[]).includes(row[k])
        if ('gt' in v) return row[k] > v.gt
        if ('lt' in v) return row[k] < v.lt
      }
      return row[k] === v
    })
  const withTenant = (u: Row) => ({ ...u, tenant: state.tenants.find(t => t.id === u.tenantId) })
  const fullGrant = (g: Row, include?: Row) => ({
    ...g,
    client: state.clients.find(c => c.id === g.clientRowId),
    tenants: state.grantTenants.filter(t => t.grantId === g.id).map(t =>
      include?.tenants?.include ? { ...t, tenant: state.tenants.find(x => x.id === t.tenantId) } : t),
  })
  const prisma: Row = {
    user: {
      findUnique: async ({ where }: Row) => state.users.find(u => u.id === where.id) ?? null,
      findMany: async ({ where }: Row) => state.users.filter(u => match(u, where)).map(withTenant),
    },
    oAuthClient: {
      create: async ({ data }: Row) => { const r = { id: id(), createdAt: new Date(), fetchedAt: null, lastUsedAt: null, ...data }; state.clients.push(r); return r },
      findUnique: async ({ where }: Row) => state.clients.find(c => c.clientId === where.clientId) ?? null,
      upsert: async ({ where, create, update }: Row) => {
        const found = state.clients.find(c => c.clientId === where.clientId)
        if (found) return Object.assign(found, update)
        const r = { id: id(), createdAt: new Date(), lastUsedAt: null, ...create }; state.clients.push(r); return r
      },
      update: async ({ where, data }: Row) => Object.assign(state.clients.find(c => c.id === where.id)!, data),
    },
    oAuthCode: {
      create: async ({ data }: Row) => { const r = { usedAt: null, grantId: null, createdAt: new Date(), ...data }; state.codes.push(r); return r },
      findUnique: async ({ where }: Row) => state.codes.find(c => c.codeHash === where.codeHash) ?? null,
      updateMany: async ({ where, data }: Row) => { const rows = state.codes.filter(c => match(c, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length } },
      update: async ({ where, data }: Row) => Object.assign(state.codes.find(c => c.codeHash === where.codeHash)!, data),
      deleteMany: async () => ({ count: 0 }),
    },
    oAuthGrant: {
      create: async ({ data }: Row) => {
        const { tenants, ...rest } = data
        const g = { id: id(), createdAt: new Date(), lastUsedAt: null, revokedAt: null, ...rest }
        state.grants.push(g)
        for (const t of tenants.create) state.grantTenants.push({ grantId: g.id, ...t })
        return g
      },
      updateMany: async ({ where, data }: Row) => { const rows = state.grants.filter(g => match(g, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length } },
      update: async ({ where, data }: Row) => Object.assign(state.grants.find(g => g.id === where.id)!, data),
      findMany: async ({ where, include }: Row) => state.grants.filter(g => match(g, where)).map(g => fullGrant(g, include)),
      findFirst: async ({ where }: Row) => state.grants.find(g => match(g, where)) ?? null,
    },
    oAuthToken: {
      createMany: async ({ data }: Row) => { for (const t of data) state.tokens.push({ rotatedAt: null, createdAt: new Date(), ...t }); return { count: data.length } },
      findUnique: async ({ where, include }: Row) => {
        const t = state.tokens.find(x => x.tokenHash === where.tokenHash)
        if (!t) return null
        if (!include) return t
        return { ...t, grant: fullGrant(state.grants.find(g => g.id === t.grantId)!, include.grant.include) }
      },
      updateMany: async ({ where, data }: Row) => { const rows = state.tokens.filter(t => match(t, where)); rows.forEach(r => Object.assign(r, data)); return { count: rows.length } },
      findMany: async ({ where }: Row) => state.tokens.filter(t => match(t, where)),
      deleteMany: async () => ({ count: 0 }),
    },
  }
  prisma.$transaction = async (fn: (tx: Row) => Promise<unknown>) => fn(prisma)
  return { state, prisma }
})

vi.mock('../prisma', () => ({ prisma: db.prisma }))

import { OAuthService, OAuthError } from '../oauth/oauth.service'
import { pkceS256, hashApiToken } from '../lib/crypto'

const CLAUDE_CIMD = 'https://claude.ai/oauth/mcp-client-metadata'
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const RESOURCE = 'https://api.operum.adm.br/mcp'

function makeRedis() {
  return { deleteOAuthCache: vi.fn() }
}

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: pkceS256(verifier) }
}

function authorizeRequest(challenge: string, overrides: Record<string, string> = {}) {
  return {
    response_type: 'code',
    client_id: CLAUDE_CIMD,
    redirect_uri: CALLBACK,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'st-1',
    scope: 'operum:read operum:write offline_access',
    resource: RESOURCE,
    ...overrides,
  }
}

function codeFrom(redirect: string): string {
  return new URL(redirect).searchParams.get('code')!
}

describe('OAuthService', () => {
  let service: OAuthService
  let redis: ReturnType<typeof makeRedis>

  beforeEach(() => {
    Object.values(db.state).forEach(arr => arr.splice(0))
    db.state.tenants.push(
      { id: 't-a', name: 'Mavellium', status: 'ACTIVE' },
      { id: 't-b', name: 'Fábio', status: 'ACTIVE' },
    )
    db.state.users.push(
      { id: 'u-a', identityId: 'u-a', tenantId: 't-a', email: 'vini@x.com', role: 'admin', isActive: true, deletedAt: null, forcePasswordChange: false },
      { id: 'u-b', identityId: 'u-a', tenantId: 't-b', email: 'vini@x.com', role: 'member', isActive: true, deletedAt: null, forcePasswordChange: false },
      { id: 'u-c', tenantId: 't-b', email: 'outro@x.com', role: 'member', isActive: true, deletedAt: null, forcePasswordChange: false },
    )
    delete process.env.OAUTH_CIMD_ALLOWED_HOSTS
    delete process.env.MCP_RESOURCE_URL
    redis = makeRedis()
    service = new OAuthService(redis as any)
    service.fetchMetadata = vi.fn(async () => ({ name: 'Claude', redirectUris: [CALLBACK] }))
  })

  async function connect(opts: { tenantIds?: string[]; allowWrite?: boolean } = {}) {
    const { verifier, challenge } = pkce()
    const req = authorizeRequest(challenge)
    const approved = await service.approve(req, 'u-a', opts.tenantIds ?? ['t-a', 't-b'], opts.allowWrite ?? true)
    if (!('redirect' in approved) || !approved.redirect.includes('code=')) throw new Error('approve falhou')
    const tokens = await service.exchangeCode({
      code: codeFrom(approved.redirect), redirect_uri: CALLBACK, client_id: CLAUDE_CIMD, code_verifier: verifier, resource: RESOURCE,
    })
    return { tokens, verifier, req }
  }

  describe('autorização', () => {
    it('mesmo e-mail sem vínculo não aparece no consentimento (ADR-061)', async () => {
      // Conta criada pelo admin de outra instituição com o e-mail da vítima.
      db.state.tenants.push({ id: 't-x', name: 'Outra', status: 'ACTIVE' })
      db.state.users.push({ id: 'u-intruso', identityId: null, tenantId: 't-x', email: 'vini@x.com', role: 'admin', isActive: true, deletedAt: null, forcePasswordChange: false })
      const check = await service.checkAuthorize(authorizeRequest(pkce().challenge), 'u-intruso')
      expect(check.ok).toBe(true)
      if (check.ok !== true) return
      expect(check.tenants.map(t => t.tenantId)).toEqual(['t-x'])
    })

    it('aceita cliente CIMD de host permitido e lista os workspaces vinculados do usuário', async () => {
      const check = await service.checkAuthorize(authorizeRequest(pkce().challenge), 'u-a')
      expect(check.ok).toBe(true)
      if (check.ok !== true) return
      expect(check.client.name).toBe('Claude')
      expect(check.redirectHost).toBe('claude.ai')
      expect(check.client.host).toBe('claude.ai')
      expect(check.tenants.map(t => t.tenantId).sort()).toEqual(['t-a', 't-b'])
      expect(check.tenants.find(t => t.tenantId === 't-a')!.isCurrent).toBe(true)
    })

    it('recusa CIMD de host fora da allowlist sem buscar o documento', async () => {
      const check = await service.checkAuthorize(authorizeRequest(pkce().challenge, { client_id: 'https://evil.example/client.json' }), 'u-a')
      expect(check).toMatchObject({ ok: false, error: 'invalid_client' })
      expect('redirect' in check && check.redirect).toBeFalsy()
      expect(service.fetchMetadata).not.toHaveBeenCalled()
    })

    it('redirect não registrado não redireciona (evita open redirect)', async () => {
      const check = await service.checkAuthorize(authorizeRequest(pkce().challenge, { redirect_uri: 'https://evil.example/cb' }), 'u-a')
      expect(check).toMatchObject({ ok: false, error: 'invalid_request' })
      expect((check as any).redirect).toBeUndefined()
    })

    it('PKCE sem S256 volta ao cliente com invalid_request e o state', async () => {
      const check = await service.checkAuthorize(authorizeRequest(pkce().challenge, { code_challenge_method: 'plain' }), 'u-a')
      expect(check.ok).toBe(false)
      const url = new URL((check as any).redirect)
      expect(url.searchParams.get('error')).toBe('invalid_request')
      expect(url.searchParams.get('state')).toBe('st-1')
    })

    it('resource de outro servidor é recusado', async () => {
      const check = await service.checkAuthorize(authorizeRequest(pkce().challenge, { resource: 'https://outro.example/mcp' }), 'u-a')
      expect(new URL((check as any).redirect).searchParams.get('error')).toBe('invalid_target')
    })

    it('escopo desconhecido é recusado', async () => {
      const check = await service.checkAuthorize(authorizeRequest(pkce().challenge, { scope: 'operum:admin' }), 'u-a')
      expect(new URL((check as any).redirect).searchParams.get('error')).toBe('invalid_scope')
    })

    it('não permite escolher workspace de outra pessoa', async () => {
      db.state.users.push({ id: 'u-x', tenantId: 't-x', email: 'outro@x.com', role: 'admin', isActive: true, deletedAt: null, forcePasswordChange: false })
      const result = await service.approve(authorizeRequest(pkce().challenge), 'u-a', ['t-x'], true)
      expect(result).toMatchObject({ ok: false, error: 'access_denied' })
      expect(db.state.codes).toHaveLength(0)
    })

    it('negar devolve access_denied ao cliente', async () => {
      const result = await service.deny(authorizeRequest(pkce().challenge), 'u-a')
      expect(new URL((result as any).redirect).searchParams.get('error')).toBe('access_denied')
    })

    it('guarda só o hash do código e devolve iss no redirect', async () => {
      const result = await service.approve(authorizeRequest(pkce().challenge), 'u-a', ['t-a'], true)
      const url = new URL((result as any).redirect)
      const code = url.searchParams.get('code')!
      expect(url.searchParams.get('iss')).toBe('https://api.operum.adm.br')
      expect(db.state.codes[0].codeHash).toBe(hashApiToken(code))
      expect(JSON.stringify(db.state.codes)).not.toContain(code)
    })
  })

  describe('token', () => {
    it('troca o código por access e refresh com os escopos e workspaces escolhidos', async () => {
      const { tokens } = await connect()
      expect(tokens.access_token).toMatch(/^opr_oat_/)
      expect(tokens.refresh_token).toMatch(/^opr_ort_/)
      expect(tokens.expires_in).toBeGreaterThan(3500)
      expect(tokens.scope.split(' ')).toContain('operum:write')

      const info = await service.introspect(tokens.access_token)
      expect(info.active).toBe(true)
      expect(info.resource).toBe(RESOURCE)
      expect(info.tenants!.map(t => [t.tenantId, t.userId, t.isDefault])).toEqual([['t-a', 'u-a', true], ['t-b', 'u-b', false]])
    })

    it('sem permitir escrita, o token sai só com leitura', async () => {
      const { tokens } = await connect({ allowWrite: false })
      expect(tokens.scope.split(' ')).not.toContain('operum:write')
    })

    it('code_verifier errado é recusado e o código não pode ser tentado de novo', async () => {
      const { challenge } = pkce()
      const approved = await service.approve(authorizeRequest(challenge), 'u-a', ['t-a'], true)
      const code = codeFrom((approved as any).redirect)
      const wrong = { code, redirect_uri: CALLBACK, client_id: CLAUDE_CIMD, code_verifier: pkce().verifier }
      await expect(service.exchangeCode(wrong)).rejects.toMatchObject({ error: 'invalid_grant' })
      await expect(service.exchangeCode(wrong)).rejects.toMatchObject({ error: 'invalid_grant' })
    })

    it('redirect_uri diferente na troca é recusado', async () => {
      const { verifier, challenge } = pkce()
      const approved = await service.approve(authorizeRequest(challenge), 'u-a', ['t-a'], true)
      await expect(service.exchangeCode({
        code: codeFrom((approved as any).redirect), redirect_uri: 'https://claude.ai/outro', client_id: CLAUDE_CIMD, code_verifier: verifier,
      })).rejects.toMatchObject({ error: 'invalid_grant' })
    })

    it('código reutilizado revoga a conexão que ele gerou', async () => {
      const { verifier, challenge } = pkce()
      const approved = await service.approve(authorizeRequest(challenge), 'u-a', ['t-a'], true)
      const dto = { code: codeFrom((approved as any).redirect), redirect_uri: CALLBACK, client_id: CLAUDE_CIMD, code_verifier: verifier }
      const tokens = await service.exchangeCode(dto)
      await expect(service.exchangeCode(dto)).rejects.toMatchObject({ error: 'invalid_grant' })
      expect((await service.introspect(tokens.access_token)).active).toBe(false)
      expect(redis.deleteOAuthCache).toHaveBeenCalled()
    })

    it('código expirado é recusado', async () => {
      const { verifier, challenge } = pkce()
      const approved = await service.approve(authorizeRequest(challenge), 'u-a', ['t-a'], true)
      db.state.codes[0].expiresAt = new Date(Date.now() - 1000)
      await expect(service.exchangeCode({
        code: codeFrom((approved as any).redirect), redirect_uri: CALLBACK, client_id: CLAUDE_CIMD, code_verifier: verifier,
      })).rejects.toMatchObject({ error: 'invalid_grant' })
    })

    it('refresh gira o par e o refresh antigo deixa de valer', async () => {
      const { tokens } = await connect()
      const next = await service.refresh({ refresh_token: tokens.refresh_token, client_id: CLAUDE_CIMD })
      expect(next.refresh_token).not.toBe(tokens.refresh_token)
      expect((await service.introspect(next.access_token)).active).toBe(true)
      await expect(service.refresh({ refresh_token: tokens.refresh_token, client_id: CLAUDE_CIMD }))
        .rejects.toMatchObject({ error: 'invalid_grant' })
    })

    it('reuso do refresh antigo fora da janela revoga a conexão inteira', async () => {
      const { tokens } = await connect()
      const next = await service.refresh({ refresh_token: tokens.refresh_token, client_id: CLAUDE_CIMD })
      const old = db.state.tokens.find(t => t.tokenHash === hashApiToken(tokens.refresh_token))!
      old.rotatedAt = new Date(Date.now() - 60_000)
      await expect(service.refresh({ refresh_token: tokens.refresh_token, client_id: CLAUDE_CIMD }))
        .rejects.toMatchObject({ error: 'invalid_grant' })
      expect((await service.introspect(next.access_token)).active).toBe(false)
      await expect(service.refresh({ refresh_token: next.refresh_token, client_id: CLAUDE_CIMD }))
        .rejects.toMatchObject({ error: 'invalid_grant' })
    })

    it('refresh de outro cliente é recusado', async () => {
      const { tokens } = await connect()
      await expect(service.refresh({ refresh_token: tokens.refresh_token, client_id: 'opr_dcr_outro' }))
        .rejects.toMatchObject({ error: 'invalid_grant' })
    })

    it('refresh pedindo escopo além do autorizado é recusado', async () => {
      const { tokens } = await connect({ allowWrite: false })
      await expect(service.refresh({ refresh_token: tokens.refresh_token, client_id: CLAUDE_CIMD, scope: 'operum:write' }))
        .rejects.toMatchObject({ error: 'invalid_scope' })
    })
  })

  describe('introspecção e revogação', () => {
    it('access expirado fica inativo', async () => {
      const { tokens } = await connect()
      db.state.tokens.find(t => t.tokenHash === hashApiToken(tokens.access_token))!.expiresAt = new Date(Date.now() - 1)
      expect((await service.introspect(tokens.access_token)).active).toBe(false)
    })

    it('refresh token não serve como access token', async () => {
      const { tokens } = await connect()
      expect((await service.introspect(tokens.refresh_token)).active).toBe(false)
    })

    it('usuário desativado num workspace sai da conexão; os outros continuam', async () => {
      const { tokens } = await connect()
      db.state.users.find(u => u.id === 'u-a')!.isActive = false
      const info = await service.introspect(tokens.access_token)
      expect(info.active).toBe(true)
      expect(info.tenants!.map(t => t.tenantId)).toEqual(['t-b'])
      expect(info.tenants![0].isDefault).toBe(true)
    })

    it('sem nenhum workspace ativo, o token fica inativo', async () => {
      const { tokens } = await connect({ tenantIds: ['t-a'] })
      db.state.users.find(u => u.id === 'u-a')!.forcePasswordChange = true
      expect((await service.introspect(tokens.access_token)).active).toBe(false)
    })

    it('revogar pelo cliente (RFC 7009) derruba access e refresh e limpa o cache do gateway', async () => {
      const { tokens } = await connect()
      await service.revokeToken(tokens.refresh_token)
      expect((await service.introspect(tokens.access_token)).active).toBe(false)
      expect(redis.deleteOAuthCache).toHaveBeenCalledWith([hashApiToken(tokens.access_token)])
      await expect(service.refresh({ refresh_token: tokens.refresh_token, client_id: CLAUDE_CIMD }))
        .rejects.toMatchObject({ error: 'invalid_grant' })
    })

    it('revogar token desconhecido não falha', async () => {
      await expect(service.revokeToken('opr_oat_desconhecido')).resolves.toBeUndefined()
    })

    it('o usuário lista e revoga as próprias conexões, não as de outra pessoa', async () => {
      const { tokens } = await connect()
      const list = await service.listGrants('u-b')
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ clientName: 'Claude', redirectHost: 'claude.ai', tenants: ['Mavellium', 'Fábio'] })
      await expect(service.revokeGrantForUser(list[0].id, 'u-c')).rejects.toThrow('Conexão não encontrada')
      await service.revokeGrantForUser(list[0].id, 'u-b')
      expect((await service.introspect(tokens.access_token)).active).toBe(false)
      expect(await service.listGrants('u-a')).toHaveLength(0)
    })
  })

  describe('registro dinâmico (DCR)', () => {
    it('registra cliente público com o callback do Claude e loopback', async () => {
      const res = await service.register({ redirect_uris: [CALLBACK, 'http://localhost/callback'], client_name: 'Claude Code' })
      expect(res.client_id).toMatch(/^opr_dcr_/)
      expect(res.token_endpoint_auth_method).toBe('none')
    })

    it('recusa redirect fora da allowlist', async () => {
      await expect(service.register({ redirect_uris: ['https://evil.example/cb'] })).rejects.toBeInstanceOf(OAuthError)
    })

    it('recusa cliente confidencial', async () => {
      await expect(service.register({ redirect_uris: [CALLBACK], token_endpoint_auth_method: 'client_secret_basic' }))
        .rejects.toMatchObject({ error: 'invalid_client_metadata' })
    })

    it('cliente DCR com loopback autoriza com qualquer porta', async () => {
      const reg = await service.register({ redirect_uris: ['http://127.0.0.1/callback'] })
      const check = await service.checkAuthorize(
        authorizeRequest(pkce().challenge, { client_id: reg.client_id, redirect_uri: 'http://127.0.0.1:53111/callback' }), 'u-a')
      expect(check).toMatchObject({ ok: true, loopback: true, client: { kind: 'dcr', host: '127.0.0.1:53111' } })
    })

    it('client_id inventado é recusado', async () => {
      const check = await service.checkAuthorize(authorizeRequest(pkce().challenge, { client_id: 'qualquer' }), 'u-a')
      expect(check).toMatchObject({ ok: false, error: 'invalid_client' })
    })
  })
})

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Server } from 'node:http'
import { parseTokens, TenantRegistry, clearIdentityCache } from '../tenants'
import { gatewayAuthHeaders } from '../gateway'
import { oauthResourceConfig, wwwAuthenticate } from '../oauth'
import { createApp } from '../app'
import { FakeOperum } from './fakeOperum'

const OAT = 'opr_oat_AAAAAAAAAAAAAAAAAAAA'
const PAT = 'opr_pat_BBBBBBBBBBBBBBBBBBBB'
const ENV = {
  OAUTH_ISSUER: 'https://api.operum.adm.br',
  MCP_RESOURCE_URL: 'https://api.operum.adm.br/mcp',
  MCP_GATEWAY_KEY: 'chave-interna',
}

describe('parseTokens com OAuth', () => {
  it('aceita o token OAuth sozinho', () => {
    expect(parseTokens(`Bearer ${OAT}`, undefined)).toEqual([OAT])
  })

  it('não mistura token OAuth com X-Operum-Tokens', () => {
    expect(parseTokens(`Bearer ${OAT}`, PAT)).toBeNull()
  })

  it('token OAuth não entra como PAT extra', () => {
    expect(parseTokens(`Bearer ${PAT}`, OAT)).toBeNull()
  })
})

describe('gatewayAuthHeaders', () => {
  const prev = process.env.MCP_GATEWAY_KEY
  afterEach(() => { process.env.MCP_GATEWAY_KEY = prev })

  it('PAT leva só o Authorization, mesmo com tenant', () => {
    expect(gatewayAuthHeaders(PAT, 't-a')).toEqual({ Authorization: `Bearer ${PAT}` })
  })

  it('OAuth leva a chave interna e o workspace', () => {
    process.env.MCP_GATEWAY_KEY = 'k'
    expect(gatewayAuthHeaders(OAT, 't-b')).toEqual({ Authorization: `Bearer ${OAT}`, 'X-Operum-Mcp-Key': 'k', 'X-Operum-Tenant': 't-b' })
  })
})

describe('TenantRegistry com OAuth', () => {
  let op: FakeOperum
  const userByTenant: Record<string, string> = { 't-a': 'u-a', 't-b': 'u-b' }

  beforeEach(() => {
    clearIdentityCache()
    op = new FakeOperum()
    op.addTenant('t-a', 'Mavellium')
    op.addTenant('t-b', 'Fábio')
    op.addUser({ id: 'u-a', tenantId: 't-a', name: 'Vini', email: 'vini@x.com', role: 'admin' })
    op.addUser({ id: 'u-b', tenantId: 't-b', name: 'Vini', email: 'vini@x.com', role: 'member' })
  })

  // Sem tenant → workspace padrão da conexão (t-a); com tenant → aquele workspace.
  const make = () => new TenantRegistry([OAT], (_t, tenantId) => op.gateway(userByTenant[tenantId ?? 't-a']))

  it('um token cobre os workspaces autorizados', async () => {
    const registry = make()
    expect(registry.isOAuth).toBe(true)
    const { contexts } = await registry.listAll()
    expect(contexts.map(c => [c.tenantId, c.userId, c.isDefault])).toEqual([['t-a', 'u-a', true], ['t-b', 'u-b', false]])
  })

  it('resolve outro workspace com o usuário daquele workspace', async () => {
    const ctx = await make().resolve('t-b')
    expect(ctx).toMatchObject({ tenantId: 't-b', userId: 'u-b', tenantName: 'Fábio' })
  })

  it('cada workspace tem chave de cache própria e o mesmo token para o link de upload', async () => {
    const registry = make()
    const a = await registry.resolve()
    const b = await registry.resolve('t-b')
    expect(a.tokenHash).not.toBe(b.tokenHash)
    expect(registry.tokenFor(b)).toBe(OAT)
  })

  it('workspace não autorizado → erro que manda reconectar o conector', async () => {
    await expect(make().resolve('t-x')).rejects.toThrow(/não foi autorizado nesta conexão.*reconecte/i)
  })
})

describe('metadados e 401 do recurso protegido', () => {
  it('sem configuração OAuth, mantém o 401 antigo', () => {
    expect(oauthResourceConfig({})).toBeNull()
    expect(wwwAuthenticate(null)).toBe('Bearer realm="operum"')
  })

  it('com configuração, aponta para os metadados e os escopos', () => {
    const cfg = oauthResourceConfig(ENV)!
    expect(cfg.metadataUrl).toBe('https://api.operum.adm.br/.well-known/oauth-protected-resource/mcp')
    expect(wwwAuthenticate(cfg)).toBe(
      'Bearer resource_metadata="https://api.operum.adm.br/.well-known/oauth-protected-resource/mcp", scope="operum:read operum:write offline_access"')
    expect(wwwAuthenticate(cfg, 'invalid_token')).toMatch(/^Bearer error="invalid_token", resource_metadata=/)
  })
})

describe('HTTP do mcp-server', () => {
  let server: Server
  let base: string

  async function start(env: NodeJS.ProcessEnv, makeRegistry?: (tokens: string[]) => TenantRegistry) {
    const app = createApp({ env, makeRegistry })
    await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  }

  beforeEach(() => clearIdentityCache())

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
  })

  const post = (headers: Record<string, string> = {}) =>
    fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) })

  it('publica os metadados do recurso nos dois caminhos', async () => {
    await start(ENV)
    for (const path of ['/.well-known/oauth-protected-resource/mcp', '/.well-known/oauth-protected-resource']) {
      const res = await fetch(`${base}${path}`)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        resource: 'https://api.operum.adm.br/mcp',
        authorization_servers: ['https://api.operum.adm.br'],
        scopes_supported: ['operum:read', 'operum:write', 'offline_access'],
        bearer_methods_supported: ['header'],
        resource_name: 'Operum',
      })
    }
  })

  it('sem token: 401 com resource_metadata', async () => {
    await start(ENV)
    const res = await post()
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toContain('resource_metadata="https://api.operum.adm.br/.well-known/oauth-protected-resource/mcp"')
  })

  it('sem configuração OAuth: não publica metadados e recusa token OAuth', async () => {
    await start({})
    expect((await fetch(`${base}/.well-known/oauth-protected-resource/mcp`)).status).toBe(404)
    const res = await post({ authorization: `Bearer ${OAT}` })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toBe('Bearer realm="operum"')
  })

  it('token OAuth vencido ou revogado vira HTTP 401 invalid_token (o Claude renova)', async () => {
    await start(ENV, tokens => new TenantRegistry(tokens, () => {
      const err = Object.assign(new Error('Token inválido ou revogado'), { status: 401 })
      const fail = () => Promise.reject(err)
      return { get: fail, post: fail, patch: fail, delete: fail, upload: fail }
    }))
    const res = await post({ authorization: `Bearer ${OAT}` })
    expect(res.status).toBe(401)
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer error="invalid_token"/)
  })

  it('gateway fora do ar com token OAuth: 503', async () => {
    await start(ENV, tokens => new TenantRegistry(tokens, () => {
      const err = Object.assign(new Error('down'), { status: 503 })
      const fail = () => Promise.reject(err)
      return { get: fail, post: fail, patch: fail, delete: fail, upload: fail }
    }))
    expect((await post({ authorization: `Bearer ${OAT}` })).status).toBe(503)
  })

  it('token OAuth válido chega ao MCP', async () => {
    const op = new FakeOperum()
    op.addTenant('t-a', 'Mavellium')
    op.addUser({ id: 'u-a', tenantId: 't-a', name: 'Vini', email: 'vini@x.com', role: 'admin' })
    clearIdentityCache()
    await start(ENV, tokens => new TenantRegistry(tokens, () => op.gateway('u-a')))
    const res = await post({ authorization: `Bearer ${OAT}` })
    expect(res.status).toBe(200)
  })

  it('PAT continua funcionando sem a checagem antecipada', async () => {
    const spy = vi.fn()
    const unused = () => Promise.reject(new Error('não deveria chamar o gateway'))
    await start(ENV, tokens => { spy(tokens); return new TenantRegistry(tokens, () => ({ get: unused, post: unused, patch: unused, delete: unused, upload: unused })) })
    const res = await post({ authorization: `Bearer ${PAT}` })
    expect(spy).toHaveBeenCalledWith([PAT])
    expect(res.status).toBe(200)
  })
})

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

const { mockRedis } = vi.hoisted(() => ({
  mockRedis: { get: vi.fn(), set: vi.fn() },
}))

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(function RedisMock() {
    return mockRedis
  }),
}))

import { authMiddleware } from '../middleware/auth'

const MCP_KEY = 'chave-interna-do-mcp-0123456789abcdef'

function makeReq(overrides: Partial<Request> = {}): Request {
  return { path: '/cards', method: 'GET', headers: {}, cookies: {}, ...overrides } as unknown as Request
}

function makeRes() {
  const res: Partial<Response> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.end = vi.fn().mockReturnValue(res)
  return res as Response & { status: ReturnType<typeof vi.fn> }
}

function introspection(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    grantId: 'grant-1',
    clientId: 'https://claude.ai/oauth/mcp-client-metadata',
    scopes: ['operum:read', 'operum:write', 'offline_access'],
    resource: 'https://api.operum.adm.br/mcp',
    tenants: [
      { tenantId: 't-a', userId: 'u-a', role: 'admin', isDefault: true },
      { tenantId: 't-b', userId: 'u-b', role: 'member', isDefault: false },
    ],
    ...overrides,
  }
}

function oauthHeaders(extra: Record<string, string> = {}) {
  return { authorization: 'Bearer opr_oat_abc', 'x-operum-mcp-key': MCP_KEY, ...extra }
}

describe('authMiddleware — token OAuth do MCP', () => {
  const middleware = authMiddleware()
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.INTERNAL_API_KEY = 'internal-key'
    process.env.MCP_GATEWAY_KEY = MCP_KEY
    delete process.env.MCP_RESOURCE_URL
    mockRedis.get.mockResolvedValue(null)
    mockRedis.set.mockResolvedValue('OK')
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => introspection() })
    vi.stubGlobal('fetch', fetchMock)
  })

  it('com a chave do MCP, injeta a identidade do workspace padrão', async () => {
    const req = makeReq({ headers: oauthHeaders() })
    const next = vi.fn()
    await middleware(req, makeRes(), next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(req.headers['x-user-id']).toBe('u-a')
    expect(req.headers['x-tenant-id']).toBe('t-a')
    expect(req.headers['x-user-role']).toBe('admin')
    expect(req.headers['x-auth-type']).toBe('oauth')
    expect(req.headers['x-api-token-id']).toBe('oauth:grant-1')
    expect(req.headers['x-oauth-tenants']).toBe('t-a,t-b')
    expect(fetchMock).toHaveBeenCalledWith('http://auth-service:4001/oauth/introspect', expect.anything())
    expect(mockRedis.set).toHaveBeenCalledWith(expect.stringMatching(/^oat:/), expect.any(String), 'EX', 60)
  })

  it('X-Operum-Tenant escolhe outro workspace da conexão, com o usuário daquele workspace', async () => {
    const req = makeReq({ headers: oauthHeaders({ 'x-operum-tenant': 't-b' }) })
    const next = vi.fn()
    await middleware(req, makeRes(), next)
    expect(req.headers['x-user-id']).toBe('u-b')
    expect(req.headers['x-tenant-id']).toBe('t-b')
    expect(req.headers['x-user-role']).toBe('member')
  })

  it('workspace fora da conexão retorna 403', async () => {
    const res = makeRes()
    const next = vi.fn()
    await middleware(makeReq({ headers: oauthHeaders({ 'x-operum-tenant': 't-x' }) }), res, next)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })

  it('sem a chave do MCP (token usado direto na API) retorna 401 sem consultar o auth-service', async () => {
    const res = makeRes()
    const next = vi.fn()
    await middleware(makeReq({ headers: { authorization: 'Bearer opr_oat_abc' } }), res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it('chave errada retorna 401', async () => {
    const res = makeRes()
    await middleware(makeReq({ headers: oauthHeaders({ 'x-operum-mcp-key': 'errada' }) }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('sem MCP_GATEWAY_KEY configurada, falha fechado', async () => {
    delete process.env.MCP_GATEWAY_KEY
    const res = makeRes()
    await middleware(makeReq({ headers: oauthHeaders({ 'x-operum-mcp-key': '' }) }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('token de outro recurso (audiência errada) retorna 401', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => introspection({ resource: 'https://outro.example/mcp' }) })
    const res = makeRes()
    await middleware(makeReq({ headers: oauthHeaders() }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('token inativo retorna 401', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ active: false }) })
    const res = makeRes()
    await middleware(makeReq({ headers: oauthHeaders() }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('escrita sem operum:write retorna 403', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => introspection({ scopes: ['operum:read'] }) })
    const res = makeRes()
    await middleware(makeReq({ method: 'POST', headers: oauthHeaders() }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('rotas de conta do auth-service seguem fechadas para o token OAuth', async () => {
    const res = makeRes()
    await middleware(makeReq({ method: 'POST', path: '/auth/switch-tenant', headers: oauthHeaders() }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('auth-service fora do ar retorna 503', async () => {
    fetchMock.mockRejectedValue(new Error('down'))
    const res = makeRes()
    await middleware(makeReq({ headers: oauthHeaders() }), res, vi.fn())
    expect(res.status).toHaveBeenCalledWith(503)
  })

  it('descarta x-oauth-tenants enviado pelo cliente numa sessão comum', async () => {
    const req = makeReq({ path: '/health', headers: { 'x-oauth-tenants': 't-x' } })
    await middleware(req, makeRes(), vi.fn())
    expect(req.headers['x-oauth-tenants']).toBeUndefined()
  })

  it('nunca repassa X-Operum-Mcp-Key e X-Operum-Tenant aos serviços', async () => {
    const req = makeReq({ headers: oauthHeaders({ 'x-operum-tenant': 't-b' }) })
    await middleware(req, makeRes(), vi.fn())
    expect(req.headers['x-operum-mcp-key']).toBeUndefined()
    expect(req.headers['x-operum-tenant']).toBeUndefined()
  })

  it('/oauth/token e os metadados são públicos', async () => {
    for (const path of ['/oauth/token', '/oauth/register', '/oauth/revoke', '/.well-known/oauth-authorization-server']) {
      const next = vi.fn()
      await middleware(makeReq({ method: 'POST', path }), makeRes(), next)
      expect(next).toHaveBeenCalledTimes(1)
    }
  })

  it('introspecção interna é bloqueada com 404, inclusive com maiúsculas ou barras extras', async () => {
    for (const path of ['/oauth/introspect', '/OAUTH/Introspect', '//oauth//introspect', '/AUTH/API-TOKENS/INTROSPECT', '/auth/api-tokens//introspect']) {
      const res = makeRes()
      const next = vi.fn()
      await middleware(makeReq({ method: 'POST', path, headers: { authorization: 'Bearer jwt' } }), res, next)
      expect(res.status).toHaveBeenCalledWith(404)
      expect(next).not.toHaveBeenCalled()
    }
  })
})

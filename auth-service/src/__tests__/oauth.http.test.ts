import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'

vi.mock('../prisma', () => ({ prisma: {} }))

import { OAuthPublicController } from '../oauth/oauth.controller'
import { OAuthService, OAuthError } from '../oauth/oauth.service'

// Testes HTTP com o Nest de verdade: caminho como o gateway reescreve e
// corpo form-urlencoded no /oauth/token (como o Claude envia).
describe('OAuth HTTP', () => {
  let app: INestApplication
  let base: string
  const service = {
    exchangeCode: vi.fn(),
    refresh: vi.fn(),
    revokeToken: vi.fn(),
    register: vi.fn(),
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [OAuthPublicController],
      providers: [{ provide: OAuthService, useValue: service }],
    }).compile()
    app = mod.createNestApplication()
    await app.listen(0, '127.0.0.1')
    base = await app.getUrl()
  })

  afterAll(async () => app.close())

  it('metadados respondem também com barra no final (reescrita do gateway)', async () => {
    for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/']) {
      const res = await fetch(`${base}${path}`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.code_challenge_methods_supported).toEqual(['S256'])
      expect(body.client_id_metadata_document_supported).toBe(true)
      expect(body.token_endpoint_auth_methods_supported).toContain('none')
      expect(body.scopes_supported).toContain('offline_access')
    }
  })

  it('/oauth/token aceita form-urlencoded e responde sem cache', async () => {
    service.exchangeCode.mockResolvedValue({ access_token: 'opr_oat_x', token_type: 'Bearer', expires_in: 3600, refresh_token: 'opr_ort_y', scope: 'operum:read' })
    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'opr_oac_abc',
        redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
        client_id: 'https://claude.ai/oauth/mcp-client-metadata',
        code_verifier: 'v'.repeat(43),
      }).toString(),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect((await res.json()).access_token).toBe('opr_oat_x')
    expect(service.exchangeCode).toHaveBeenCalledWith(expect.objectContaining({ code: 'opr_oac_abc' }))
  })

  it('erro OAuth sai no formato da RFC 6749', async () => {
    service.refresh.mockRejectedValue(new OAuthError('invalid_grant', 'Refresh token já utilizado'))
    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=opr_ort_y&client_id=c',
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_grant', error_description: 'Refresh token já utilizado' })
  })

  it('grant_type desconhecido → unsupported_grant_type', async () => {
    const res = await fetch(`${base}/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'grant_type=password',
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('unsupported_grant_type')
  })

  it('/oauth/register aceita JSON e responde 201', async () => {
    service.register.mockResolvedValue({ client_id: 'opr_dcr_x' })
    const res = await fetch(`${base}/oauth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }),
    })
    expect(res.status).toBe(201)
  })

  it('/oauth/revoke responde 200 mesmo para token desconhecido', async () => {
    service.revokeToken.mockResolvedValue(undefined)
    const res = await fetch(`${base}/oauth/revoke`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'token=opr_ort_zzz',
    })
    expect(res.status).toBe(200)
  })
})

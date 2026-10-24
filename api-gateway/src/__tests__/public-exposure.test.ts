// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AddressInfo } from 'net'
import type { Server } from 'http'

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(function RedisMock() {
    return { get: vi.fn(), set: vi.fn() }
  }),
}))

import { isPublicAuthAllowed } from '../middleware/auth'
import { createGatewayApp } from '../app'

describe('isPublicAuthAllowed', () => {
  it('libera só as leituras de identidade em /auth', () => {
    expect(isPublicAuthAllowed('GET', '/auth/me')).toBe(true)
    expect(isPublicAuthAllowed('GET', '/auth/my-tenants')).toBe(true)
    expect(isPublicAuthAllowed('GET', '/auth/all-users')).toBe(true)
  })

  it.each([
    ['POST', '/auth/register'],
    ['POST', '/auth/join-tenant'],
    ['PATCH', '/auth/me'],
    ['POST', '/auth/login'],
    ['POST', '/auth/switch-tenant'],
    ['POST', '/auth/provision-tenant-admin'],
    ['PATCH', '/auth/admin/users/u1'],
    ['GET', '/auth/users'],
    ['POST', '/AUTH/Register'],
    ['POST', '//auth//register'],
    ['POST', '/auth/%72egister'],
  ])('bloqueia %s %s', (method, path) => {
    expect(isPublicAuthAllowed(method, path)).toBe(false)
  })

  it('não interfere fora de /auth', () => {
    expect(isPublicAuthAllowed('POST', '/oauth/token')).toBe(true)
    expect(isPublicAuthAllowed('GET', '/projects')).toBe(true)
    expect(isPublicAuthAllowed('GET', '/authors')).toBe(true)
  })
})

describe('createGatewayApp({ publicExposure: true })', () => {
  let server: Server | undefined
  afterEach(() => server?.close())

  async function call(publicExposure: boolean, method: string, path: string) {
    server = createGatewayApp({ publicExposure }).listen(0)
    const { port } = server.address() as AddressInfo
    return fetch(`http://127.0.0.1:${port}${path}`, { method })
  }

  it('responde 404 para rotas de conta antes de autenticar ou repassar', async () => {
    const res = await call(true, 'POST', '/auth/register')
    expect(res.status).toBe(404)
  })

  it('na porta interna a rota segue para a autenticação', async () => {
    const res = await call(false, 'POST', '/auth/register')
    expect(res.status).toBe(401)
  })
})

describe('rate limit usa o IP real do cliente', () => {
  it('confia só em proxies de rede privada', () => {
    const app = createGatewayApp()
    const trust = app.get('trust proxy fn') as (addr: string, i: number) => boolean
    expect(trust('172.18.0.5', 0)).toBe(true)
    expect(trust('127.0.0.1', 0)).toBe(true)
    expect(trust('203.0.113.9', 0)).toBe(false)
  })
})

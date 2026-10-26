import { afterEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import type { Server } from 'http'
import type { AddressInfo } from 'net'

vi.mock('../middleware/auth', () => ({
  sameSecret: () => false, isPublicAuthAllowed: () => true,
  authMiddleware: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.headers['x-user-id'] = 'verified-user'
    req.headers['x-tenant-id'] = 'verified-tenant'
    next()
  },
}))
vi.mock('../middleware/authorization', () => ({ authorizationMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next() }))
import { createGatewayApp } from '../app'

const servers: Server[] = []
async function listen(app: express.Express) {
  const server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
  servers.push(server)
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}
afterEach(async () => {
  for (const server of servers.splice(0)) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
  vi.unstubAllEnvs()
})
describe('proxy do orçamento para o domínio da planilha', () => {
  it('preserva corpo JSON e envia identidade verificada com chave interna', async () => {
    const upstream = express()
    upstream.use(express.json())
    upstream.all('/api/internal/task-costs/:id', (req, res) => res.json({ id: req.params.id, method: req.method, body: req.body,
      key: req.headers['x-internal-api-key'], user: req.headers['x-user-id'], tenant: req.headers['x-tenant-id'] }))
    vi.stubEnv('AUTHORIZATION_SERVICE_URL', await listen(upstream))
    vi.stubEnv('INTERNAL_API_KEY', 'trusted-key')
    const base = await listen(createGatewayApp())
    const response = await fetch(`${base}/cards/c1/costs/?ignored=true`, { method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Api-Key': 'forged', 'X-User-ID': 'forged' },
      body: JSON.stringify({ actual_materials: 120 }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 'c1', method: 'PATCH', body: { actual_materials: 120 }, key: 'trusted-key', user: 'verified-user', tenant: 'verified-tenant' })
    expect((await fetch(`${base}/cards/c1/costs`)).status).toBe(200)
    expect((await fetch(`${base}/cards/c1/costs`, { method: 'DELETE' })).status).toBe(405)
  })
})

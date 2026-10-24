// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.FILE_SERVICE_URL = 'http://file-service'
})

vi.mock('@/lib/routeAuth', () => ({
  verifyRouteSession: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ default: { user: { findFirst: vi.fn().mockResolvedValue({ role: 'member' }) } } }))
vi.mock('@/services/apiAuthorization', () => ({
  authorizeApi: vi.fn().mockResolvedValue({ allowed: true }),
  isAccessDenied: (e: unknown) => e instanceof Error && e.message === 'negado',
}))
import { DELETE } from '@/app/api/uploads/route'
import { authorizeApi } from '@/services/apiAuthorization'
import { verifyRouteSession } from '@/lib/routeAuth'

const mockVerifyRoute = verifyRouteSession as ReturnType<typeof vi.fn>

function makeRequest(url: string, cookies = 'session=tok') {
  return new Request(url, {
    method: 'DELETE',
    headers: { cookie: cookies },
  })
}

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(authorizeApi).mockResolvedValue({ allowed: true })
  mockVerifyRoute.mockResolvedValue({ userId: 'u1', tenantId: 't1' })
})

afterEach(() => {
  global.fetch = originalFetch
})

describe('DELETE /api/uploads', () => {
  it('sem permissão sobre o anexo responde 403 e não chama o file-service', async () => {
    vi.mocked(authorizeApi).mockRejectedValue(new Error('negado'))
    global.fetch = vi.fn() as never
    const res = await DELETE(makeRequest('http://localhost/api/uploads?id=a1'))
    expect(res.status).toBe(403)
    expect(authorizeApi).toHaveBeenCalledWith({ userId: 'u1', tenantId: 't1', role: 'member' }, 'DELETE', '/files/a1')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns 401 when not authenticated', async () => {
    mockVerifyRoute.mockResolvedValue(null)
    const res = await DELETE(makeRequest('http://localhost/api/uploads?id=a1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when attachment id is missing', async () => {
    const res = await DELETE(makeRequest('http://localhost/api/uploads'))
    expect(res.status).toBe(400)
  })

  it('returns 404 when attachment not found', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Not found' }), { status: 404 }),
    )
    const res = await DELETE(makeRequest('http://localhost/api/uploads?id=missing'))
    expect(res.status).toBe(404)
  })

  it('returns 403 when user is not the card owner', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }),
    )
    const res = await DELETE(makeRequest('http://localhost/api/uploads?id=a1'))
    expect(res.status).toBe(403)
  })

  it('returns 204 and removes attachment when owner', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const res = await DELETE(makeRequest('http://localhost/api/uploads?id=a1'))
    expect(res.status).toBe(204)
  })

  it('envia o tenant da sessão ao file-service', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    global.fetch = fetchMock
    await DELETE(makeRequest('http://localhost/api/uploads?id=a1'))
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['X-Tenant-Id']).toBe('t1')
  })
})

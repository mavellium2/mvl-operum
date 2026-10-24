// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/internal/authorize/route'
import { authorizeApi, isAccessDenied } from '@/services/apiAuthorization'
import prisma from '@/lib/prisma'
vi.mock('@/services/apiAuthorization', () => ({ authorizeApi: vi.fn(), isAccessDenied: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { user: { findFirst: vi.fn() } } }))
const payload = { userId: 'user-A', tenantId: 'tenant-A', method: 'PATCH', path: '/cards/card-A', body: { title: 'novo' } }
const request = (key = 'internal-secret', body = payload) => new Request('http://app/api/internal/authorize', { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-api-key': key }, body: JSON.stringify(body) })
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('INTERNAL_API_KEY', 'internal-secret')
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ role: 'member' } as never)
  vi.mocked(authorizeApi).mockResolvedValue({ allowed: true })
  vi.mocked(isAccessDenied).mockReturnValue(false)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
describe('internal authorization contract', () => {
  it('exige a chave interna antes de consultar o banco', async () => {
    expect((await POST(request('wrong'))).status).toBe(401)
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })
  it('aceita somente usuário ativo do tenant e obtém o papel no banco', async () => {
    expect((await POST(request())).status).toBe(200)
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'user-A', tenantId: 'tenant-A', isActive: true, deletedAt: null, tenant: { status: 'ACTIVE', deletedAt: null } } }))
    expect(authorizeApi).toHaveBeenCalledWith({ userId: 'user-A', tenantId: 'tenant-A', role: 'member' }, 'PATCH', '/cards/card-A', { title: 'novo' })
  })
  it('não aceita papel fornecido no payload', async () => {
    const body = { ...payload, role: 'admin' }
    expect((await POST(request('internal-secret', body))).status).toBe(400)
    expect(authorizeApi).not.toHaveBeenCalled()
  })
  it('nega usuário inexistente/inativo', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    expect((await POST(request())).status).toBe(403)
  })
  it('permissão negada produz 403', async () => {
    vi.mocked(authorizeApi).mockRejectedValue(new Error('denied')); vi.mocked(isAccessDenied).mockReturnValue(true)
    expect((await POST(request())).status).toBe(403)
  })
  it('falha de infraestrutura produz 503, nunca autorização', async () => {
    vi.mocked(prisma.user.findFirst).mockRejectedValue(new Error('database unavailable'))
    expect((await POST(request())).status).toBe(503)
    expect(authorizeApi).not.toHaveBeenCalled()
  })
})

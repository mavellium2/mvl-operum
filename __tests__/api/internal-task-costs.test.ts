// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, PATCH } from '@/app/api/internal/task-costs/[cardId]/route'
import prisma from '@/lib/prisma'
import { getTaskCosts, setTaskCosts } from '@/services/taskCostsService'

vi.mock('@/lib/prisma', () => ({ default: { user: { findFirst: vi.fn() } } }))
vi.mock('@/services/taskCostsService', () => ({ getTaskCosts: vi.fn(), setTaskCosts: vi.fn() }))
const context = { params: Promise.resolve({ cardId: 'c1' }) }
const request = (method = 'GET', key = 'internal-test') => new Request('http://localhost/api/internal/task-costs/c1', {
  method, headers: { 'x-internal-api-key': key, 'x-user-id': 'u1', 'x-tenant-id': 't1', 'Content-Type': 'application/json' },
  ...(method === 'PATCH' ? { body: JSON.stringify({ actual_materials: 60 }) } : {}),
})
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('INTERNAL_API_KEY', 'internal-test')
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ role: 'member' } as never)
  vi.mocked(getTaskCosts).mockResolvedValue({ actual_materials: 60 } as never)
  vi.mocked(setTaskCosts).mockResolvedValue({ actual_materials: 120 } as never)
})
describe('rota interna de orçamento', () => {
  it('rejeita acesso sem chave interna antes de consultar usuário', async () => {
    expect((await GET(request('GET', 'forged'), context)).status).toBe(401)
    expect(prisma.user.findFirst).not.toHaveBeenCalled()
  })
  it('não aceita identidade sem usuário ativo no tenant informado', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    expect((await PATCH(request('PATCH'), context)).status).toBe(403)
    expect(setTaskCosts).not.toHaveBeenCalled()
  })
  it('recarrega o papel e delega a checagem financeira ao serviço canônico', async () => {
    expect((await PATCH(request('PATCH'), context)).status).toBe(200)
    expect(setTaskCosts).toHaveBeenCalledWith({ userId: 'u1', tenantId: 't1', role: 'member' }, 'c1', { actual_materials: 60 })
  })
})

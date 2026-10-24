// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/routeAuth', () => ({
  verifyRouteSession: vi.fn(),
}))
vi.mock('@/lib/api-client', () => ({
  sprintsApi: {
    get: vi.fn(),
    listColumns: vi.fn(),
  },
  cardsApi: {
    create: vi.fn(),
  },
}))

import { POST } from '@/app/api/csv/route'
import { verifyRouteSession } from '@/lib/routeAuth'
import { sprintsApi, cardsApi } from '@/lib/api-client'

const mockVerifyRoute = verifyRouteSession as ReturnType<typeof vi.fn>

const MOCK_SPRINT = { id: 's1', name: 'Sprint 1' }

function makeRequest(body: FormData, sessionToken?: string): Request {
  const headers: Record<string, string> = {}
  if (sessionToken) headers['cookie'] = `session=${sessionToken}`
  return new Request('http://localhost/api/csv', {
    method: 'POST',
    body,
    headers,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerifyRoute.mockResolvedValue({ userId: 'u1', tenantId: 't1', role: 'member' })
})

describe('POST /api/csv', () => {
  it('returns 401 when session cookie is missing', async () => {
    mockVerifyRoute.mockResolvedValue(null)
    const form = new FormData()
    const res = await POST(makeRequest(form))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no file is attached', async () => {
    const form = new FormData()
    form.set('sprintId', 's1')
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when file MIME type is not csv/plain', async () => {
    const form = new FormData()
    form.set('sprintId', 's1')
    form.set('file', new File(['data'], 'data.json', { type: 'application/json' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(400)
  })

  it('recusa CSV com mais de 500 linhas sem criar nenhum card', async () => {
    vi.mocked(sprintsApi.get).mockResolvedValue(MOCK_SPRINT as never)
    vi.mocked(sprintsApi.listColumns).mockResolvedValue([{ id: 'col1', title: 'A Fazer' }])
    const csv = 'title,status\n' + Array.from({ length: 501 }, (_, i) => `T${i},A Fazer`).join('\n')
    const form = new FormData()
    form.set('sprintId', 's1')
    form.set('file', new File([csv], 'tasks.csv', { type: 'text/csv' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(413)
    expect(cardsApi.create).not.toHaveBeenCalled()
  })

  it('recusa arquivo acima de 1 MB', async () => {
    const form = new FormData()
    form.set('sprintId', 's1')
    form.set('file', new File(['x'.repeat(1024 * 1024 + 1)], 'big.csv', { type: 'text/csv' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(413)
  })

  it('returns 200 with imported count for valid CSV', async () => {
    vi.mocked(sprintsApi.get).mockResolvedValue(MOCK_SPRINT as never)
    vi.mocked(sprintsApi.listColumns).mockResolvedValue([{ id: 'col1', title: 'A Fazer' }])
    vi.mocked(cardsApi.create).mockResolvedValue({ id: 'c1', title: 'Task 1', description: '', color: '#fff' })

    const csv = 'title,status\nTask 1,A Fazer\nTask 2,A Fazer'
    const form = new FormData()
    form.set('sprintId', 's1')
    form.set('file', new File([csv], 'tasks.csv', { type: 'text/csv' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.imported).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(body.errors)).toBe(true)
  })

  it('returns 200 with errors array for partially invalid CSV', async () => {
    vi.mocked(sprintsApi.get).mockResolvedValue(MOCK_SPRINT as never)
    vi.mocked(sprintsApi.listColumns).mockResolvedValue([{ id: 'col1', title: 'A Fazer' }])
    vi.mocked(cardsApi.create).mockResolvedValue({ id: 'c1', title: 'Task 1', description: '', color: '#fff' })

    const csv = 'title,status\nTask 1,A Fazer\n,A Fazer'
    const form = new FormData()
    form.set('sprintId', 's1')
    form.set('file', new File([csv], 'tasks.csv', { type: 'text/csv' }))
    const res = await POST(makeRequest(form, 'valid-token'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.errors)).toBe(true)
  })
})

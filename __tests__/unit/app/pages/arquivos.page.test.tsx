import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/dal', () => ({ verifySession: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('@/services/projectRoleService', () => ({ getProjectsWhereManager: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { card: { findMany: vi.fn() } } }))
vi.mock('@/lib/api-client', () => ({ filesApi: { listByCards: vi.fn() } }))
const received: { attachments?: unknown[] } = {}
vi.mock('@/components/arquivos/ArquivosClient', () => ({
  default: ({ initialAttachments }: { initialAttachments: unknown[] }) => {
    received.attachments = initialAttachments
    return <div data-testid="lista">{initialAttachments.length}</div>
  },
}))

import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { filesApi } from '@/lib/api-client'
import ArquivosPage from '@/app/arquivos/page'

const findCards = (prisma as unknown as { card: { findMany: ReturnType<typeof vi.fn> } }).card.findMany

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.mocked(verifySession).mockResolvedValue({ userId: 'u1', role: 'admin', tenantId: 't1' } as never)
  findCards.mockResolvedValue([
    { id: 'c1', title: 'Card sprint', projectId: null, sprint: { id: 's1', name: 'Sprint 1', projectId: 'p1' }, responsibles: [] },
    { id: 'c2', title: 'Card backlog', projectId: 'p1', sprint: null, responsibles: [] },
  ])
})

describe('/arquivos', () => {
  it('lista cards do tenant e busca os anexos no file-service (não em public.Attachment)', async () => {
    vi.mocked(filesApi.listByCards).mockResolvedValue([
      { id: 'a1', cardId: 'c2', fileName: 'b.pdf', fileType: 'application/pdf', filePath: '/b', fileSize: 10, isCover: false, createdAt: '2026-09-01T00:00:00Z' },
      { id: 'a2', cardId: 'c1', fileName: 'a.png', fileType: 'image/png', filePath: '/a', fileSize: 20, isCover: true, createdAt: '2026-09-20T00:00:00Z' },
    ])
    render(await ArquivosPage())

    expect(findCards.mock.calls[0][0].where.OR).toEqual([{ project: { tenantId: 't1' } }, { sprint: { project: { tenantId: 't1' } } }])
    expect(filesApi.listByCards).toHaveBeenCalledWith(['c1', 'c2'])
    // mais recente primeiro; card do backlog sem sprint
    expect(received.attachments).toEqual([
      expect.objectContaining({ id: 'a2', card: expect.objectContaining({ sprintId: 's1', projectId: 'p1' }) }),
      expect.objectContaining({ id: 'a1', card: expect.objectContaining({ sprintId: null, sprintName: null, projectId: 'p1' }) }),
    ])
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('falha do file-service mostra aviso em vez de quebrar a página', async () => {
    vi.mocked(filesApi.listByCards).mockRejectedValue(new Error('500'))
    render(await ArquivosPage())
    expect(screen.getByRole('alert')).toHaveTextContent(/Não foi possível carregar todos os anexos/)
    expect(screen.getByTestId('lista')).toHaveTextContent('0')
  })

  it('repete uma vez a consulta quando a conferência do card está temporariamente indisponível', async () => {
    const unavailable = Object.assign(new Error('indisponível'), { status: 503 })
    vi.mocked(filesApi.listByCards).mockRejectedValueOnce(unavailable).mockResolvedValueOnce([])

    render(await ArquivosPage())

    expect(filesApi.listByCards).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

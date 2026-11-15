// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/dal', () => ({ verifySession: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/api-client', () => ({
  sprintsApi: {
    get: vi.fn(),
    listColumns: vi.fn(),
    createColumn: vi.fn(),
  },
  adminApi: {
    listAllUsers: vi.fn(),
  },
  tagsApi: {
    list: vi.fn(),
  },
  cardsApi: {
    update: vi.fn(),
    listBacklog: vi.fn(),
  },
}))

const bloqueio = vi.hoisted(() => vi.fn())
vi.mock('@/services/membroInativo', () => ({ bloqueioDeConclusao: bloqueio }))

vi.mock('@/lib/prisma', () => ({
  default: {
    userProject: { findMany: vi.fn() },
    project: { findFirst: vi.fn(), updateMany: vi.fn() },
  },
}))
const exigir = vi.hoisted(() => vi.fn())
vi.mock('@/services/projectAccess', () => ({ requireProjectPermission: exigir, canProjectPermission: vi.fn().mockResolvedValue(false) }))

import { verifySession } from '@/lib/dal'
import { sprintsApi, adminApi, tagsApi, cardsApi } from '@/lib/api-client'
import prisma from '@/lib/prisma'
import {
  setBacklogColorAction,
  getSprintBoardAction,
  addSprintColumnAction,
  moveCardInSprintAction,
} from '@/app/actions/sprintBoard'

const mockVerify = verifySession as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.userProject.findMany).mockResolvedValue([])
  bloqueio.mockResolvedValue(null)
})

describe('getSprintBoardAction', () => {
  it('returns sprint, columns, users, tags', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(sprintsApi.get).mockResolvedValue({ id: 's1', name: 'Sprint 1' } as never)
    vi.mocked(sprintsApi.listColumns).mockResolvedValue([{ id: 'sc1', title: 'A Fazer', position: 0 }])
    vi.mocked(adminApi.listAllUsers).mockResolvedValue([])
    vi.mocked(tagsApi.list).mockResolvedValue([])
    vi.mocked(cardsApi.listBacklog).mockResolvedValue([])

    const result = await getSprintBoardAction('s1', 'proj1')
    expect(result).toHaveProperty('sprint')
    expect(result).toHaveProperty('columns')
  })

  it('returns error if sprint fetch fails', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(sprintsApi.get).mockRejectedValue(new Error('Not found'))
    vi.mocked(sprintsApi.listColumns).mockResolvedValue([])
    vi.mocked(adminApi.listAllUsers).mockResolvedValue([])
    vi.mocked(tagsApi.list).mockResolvedValue([])
    vi.mocked(cardsApi.listBacklog).mockResolvedValue([])

    const result = await getSprintBoardAction('s1', 'proj1')
    expect(result).toHaveProperty('error')
  })
})

describe('addSprintColumnAction', () => {
  it('creates a column for the sprint', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(sprintsApi.listColumns).mockResolvedValue([])
    vi.mocked(sprintsApi.createColumn).mockResolvedValue({ id: 'sc1', title: 'Nova Col', position: 0 })

    const result = await addSprintColumnAction('s1', 'Nova Col')
    expect(result).toHaveProperty('column')
    expect(sprintsApi.createColumn).toHaveBeenCalledWith('s1', { title: 'Nova Col', position: 0 })
  })
})

describe('moveCardInSprintAction', () => {
  it('recusa concluir card só com responsáveis inativos, sem gravar', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    bloqueio.mockResolvedValue('Responsável inativo no projeto: adicione outro responsável para concluir este card.')
    const result = await moveCardInSprintAction('c1', 'col-concluido', 0)
    expect(bloqueio).toHaveBeenCalledWith('c1', 'col-concluido')
    expect(result).toEqual({ error: expect.stringContaining('adicione outro responsável') })
    expect(cardsApi.update).not.toHaveBeenCalled()
  })


  it('calls cardsApi.update with sprintColumnId and sprintPosition', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.update).mockResolvedValue(undefined)

    const result = await moveCardInSprintAction('c1', 'sc2', 2)
    expect(cardsApi.update).toHaveBeenCalledWith('c1', {
      sprintColumnId: 'sc2',
      sprintPosition: 2,
    })
    expect(result).toHaveProperty('success', true)
  })

  it('includes reason when moving backwards', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.update).mockResolvedValue(undefined)

    await moveCardInSprintAction('c1', 'sc1', 0, 'Revisão necessária')
    expect(cardsApi.update).toHaveBeenCalledWith('c1', {
      sprintColumnId: 'sc1',
      sprintPosition: 0,
      reason: 'Revisão necessária',
    })
  })
})

describe('setBacklogColorAction', () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ userId: 'u1', tenantId: 't1' })
    exigir.mockResolvedValue(undefined)
    vi.mocked(prisma.project.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it('grava a cor no projeto do tenant, exigindo gerenciar colunas', async () => {
    expect(await setBacklogColorAction('p1', '#ef4444')).toEqual({ success: true })
    expect(exigir).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1' }), 'p1', 'quadro:sprints')
    expect(prisma.project.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', tenantId: 't1', deletedAt: null }, data: { backlogColor: '#ef4444' } })
  })

  it('aceita voltar ao padrão (null) e recusa cor inválida', async () => {
    expect(await setBacklogColorAction('p1', null)).toEqual({ success: true })
    expect(await setBacklogColorAction('p1', 'red')).toEqual({ error: 'Cor inválida' })
  })

  it('sem permissão não grava', async () => {
    exigir.mockRejectedValue(new Error('Sem permissão'))
    expect(await setBacklogColorAction('p1', '#ef4444')).toEqual({ error: 'Sem permissão' })
    expect(prisma.project.updateMany).not.toHaveBeenCalled()
  })
})

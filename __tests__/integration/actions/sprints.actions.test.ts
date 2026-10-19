// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  sprintsApi: {
    create: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/services/wbsService', () => ({ sincronizarEapComSprint: vi.fn() }))
vi.mock('@/services/sprintHistoricoService', () => ({
  MOTIVO_MINIMO: 5,
  resumoDaSprint: vi.fn(),
  camposDaSprint: vi.fn(),
  diferencasSprint: vi.fn().mockReturnValue({}),
  registrarHistoricoSprint: vi.fn().mockResolvedValue(null),
  sprintTemDados: vi.fn().mockReturnValue(false),
}))

import { createSprintAction, deleteSprintAction } from '@/app/actions/sprints'
import { sincronizarEapComSprint } from '@/services/wbsService'
import { resumoDaSprint } from '@/services/sprintHistoricoService'
import { revalidatePath } from 'next/cache'
import { sprintsApi } from '@/lib/api-client'
import { verifySession } from '@/lib/dal'

const mockVerify = verifySession as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
})

describe('deleteSprintAction', () => {
  beforeEach(() => {
    mockVerify.mockResolvedValue({ userId: 'u1', tenantId: 't1' })
    vi.mocked(resumoDaSprint).mockResolvedValue({ id: 's1', nome: 'Sprint', projectId: 'projeto-real', status: 'PLANNED', cards: 0, segundosRegistrados: 0 })
    vi.mocked(sprintsApi.delete).mockResolvedValue(undefined)
    vi.mocked(sincronizarEapComSprint).mockResolvedValue({ cardsCriados: 0, nosCriados: 0, nosMovidos: 0, nosRemovidos: 1, sprintsCriadas: 0, cardsMovidos: 0, titulosAtualizados: 0, elaboradoresSincronizados: 0 })
  })

  it('reconcilia o projeto da sprint no servidor e invalida quadro, EAP e planilha', async () => {
    expect(await deleteSprintAction('s1', 'projeto-adulterado')).toEqual({ success: true })
    expect(sprintsApi.delete).toHaveBeenCalledWith('s1')
    expect(sincronizarEapComSprint).toHaveBeenCalledWith('projeto-real', 't1')
    expect(revalidatePath).toHaveBeenCalledWith('/projetos/projeto-real', 'layout')
    expect(revalidatePath).not.toHaveBeenCalledWith('/projetos/projeto-adulterado', 'layout')
    expect(revalidatePath).toHaveBeenCalledWith('/sprints/s1')
  })

  it('não esconde falha da reconciliação depois da exclusão', async () => {
    vi.mocked(sincronizarEapComSprint).mockRejectedValueOnce(new Error('failed'))
    const result = await deleteSprintAction('s1')
    expect(result).toEqual({ error: expect.stringContaining('A sprint foi excluída, mas') })
    expect(revalidatePath).toHaveBeenCalledWith('/projetos/projeto-real', 'layout')
  })

  it('não altera a EAP se a API rejeita a exclusão', async () => {
    vi.mocked(sprintsApi.delete).mockRejectedValueOnce(new Error('Forbidden'))
    expect(await deleteSprintAction('s1')).toEqual({ error: 'Forbidden' })
    expect(sincronizarEapComSprint).not.toHaveBeenCalled()
  })
})

describe('createSprintAction', () => {
  it('returns error when not authenticated', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized'))
    const result = await createSprintAction(undefined, { name: 'Sprint 1' })
    expect(result?.error).toBeTruthy()
    expect(sprintsApi.create).not.toHaveBeenCalled()
  })

  it('creates sprint and returns it when authenticated', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(sprintsApi.create).mockResolvedValue({ id: 's1', name: 'Sprint 1', status: 'PLANNED' })
    const result = await createSprintAction(undefined, { name: 'Sprint 1' })
    expect(result?.sprint).toMatchObject({ name: 'Sprint 1' })
    expect(sprintsApi.create).toHaveBeenCalledOnce()
  })

  it('converts date-only strings to ISO datetime before sending', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(sprintsApi.create).mockResolvedValue({ id: 's1', name: 'Sprint 1', status: 'PLANNED' })
    await createSprintAction(undefined, { name: 'Sprint 1', startDate: '2026-08-12', endDate: '2026-09-12' })
    expect(sprintsApi.create).toHaveBeenCalledWith({
      name: 'Sprint 1',
      createdBy: 'u1',
      startDate: '2026-08-12T00:00:00.000Z',
      endDate: '2026-09-12T00:00:00.000Z',
    })
  })
})

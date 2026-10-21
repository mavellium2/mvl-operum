// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u', tenantId: 't', role: 'member' }) }))
const svc = vi.hoisted(() => ({ podeSincronizar: vi.fn(), sincronizarEapSprint: vi.fn(), statusDaSincronizacao: vi.fn() }))
vi.mock('@/services/eapSprintSyncService', () => ({ podeSincronizar: svc.podeSincronizar, sincronizarEapSprint: svc.sincronizarEapSprint }))
vi.mock('@/services/sincronizacaoStatus', () => ({ statusDaSincronizacao: svc.statusDaSincronizacao }))
import { repetirSincronizacaoAction } from '@/app/actions/sincronizacao'

describe('repetirSincronizacaoAction', () => {
  it('sem permissão não sincroniza', async () => {
    svc.podeSincronizar.mockResolvedValue(false)
    expect(await repetirSincronizacaoAction('p')).toEqual({ error: expect.stringContaining('permissão') })
    expect(svc.sincronizarEapSprint).not.toHaveBeenCalled()
  })
  it('falha devolve o estado registrado (com o motivo), nunca sucesso', async () => {
    svc.podeSincronizar.mockResolvedValue(true)
    svc.sincronizarEapSprint.mockRejectedValue(new Error('x'))
    svc.statusDaSincronizacao.mockResolvedValue({ situacao: 'FALHA' })
    expect(await repetirSincronizacaoAction('p')).toMatchObject({ error: expect.any(String), status: { situacao: 'FALHA' } })
  })
})

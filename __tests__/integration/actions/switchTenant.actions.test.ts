// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ token: 'old-token' }) }))
vi.mock('@/lib/api-client', () => ({ authApi: { getMyTenants: vi.fn(), switchTenant: vi.fn() }, projectsApi: {} }))
vi.mock('@/lib/authClient', () => ({ authServiceLogout: vi.fn().mockResolvedValue(undefined) }))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
import { switchTenantAction } from '@/app/actions/auth'
import { authApi } from '@/lib/api-client'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
beforeEach(() => { vi.clearAllMocks(); vi.mocked(cookies).mockResolvedValue({ set: vi.fn() } as never) })
it.each(['80e4ff4a-6e67-4d98-8013-b54c35c96085', 'cmvy6tsdw0000nci03eixgxbp'])('permite trocar para instituição vinculada com ID %s', async id => {
  vi.mocked(authApi.getMyTenants).mockResolvedValue([{ tenantId: id }] as never)
  vi.mocked(authApi.switchTenant).mockResolvedValue({ token: 'new-token' } as never)
  await switchTenantAction(id)
  expect(authApi.switchTenant).toHaveBeenCalledWith(id, undefined)
  expect(redirect).toHaveBeenCalledWith('/projetos')
})
it('continua impedindo acesso a instituição sem vínculo', async () => {
  vi.mocked(authApi.getMyTenants).mockResolvedValue([])
  expect(await switchTenantAction('80e4ff4a-6e67-4d98-8013-b54c35c96085')).toEqual({ error: 'Instituição não encontrada' })
  expect(authApi.switchTenant).not.toHaveBeenCalled()
})
it.each(['', '../instituicao', 'bad id', 'c'.repeat(129)])('rejeita ID inválido %s antes de consultar contas', async id => {
  expect(await switchTenantAction(id)).toEqual({ error: 'Instituição inválida' })
  expect(authApi.getMyTenants).not.toHaveBeenCalled()
})

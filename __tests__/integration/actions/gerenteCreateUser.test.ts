import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ verifySession: vi.fn(), isProjectManager: vi.fn(), createUser: vi.fn(), criarLocal: vi.fn(), achar: vi.fn() }))
vi.mock('@/services/adminService', () => ({ adminCreateUser: h.criarLocal }))
vi.mock('@/lib/dal', () => ({ verifySession: h.verifySession }))
vi.mock('@/services/projectRoleService', () => ({ isProjectManager: h.isProjectManager }))
vi.mock('@/lib/api-client', () => ({ adminApi: { createUser: h.createUser }, authApi: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/services/tenantService', () => ({ createTenant: vi.fn(), updateTenant: vi.fn(), ConflictError: class {} }))
vi.mock('@/lib/platformOperator', () => ({ exigirOperadorDaPlataforma: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { user: { findFirst: h.achar } } }))
vi.mock('@/services/auditoriaAdminService', () => ({ auditarAdmin: vi.fn(), comAuditoriaDeUsuario: vi.fn(), dadosDoUsuario: vi.fn().mockResolvedValue(null), diferencas: vi.fn() }))
vi.mock('@/services/membroInativo', () => ({ notificarPendenciasDoMembroInativo: vi.fn() }))

import { gerenteCreateUserAction } from '@/app/actions/admin'

const dados = { name: 'Ana Souza', email: 'ana@fatec.edu.br', password: 'Senha1234', isAdmin: true }

describe('gerenteCreateUserAction', () => {
  beforeEach(() => { vi.clearAllMocks(); h.criarLocal.mockResolvedValue({ id: 'u1' }); h.achar.mockResolvedValue(null) })

  it('gerente do projeto cria a conta, sem poder criar administrador', async () => {
    h.verifySession.mockResolvedValue({ role: 'user', userId: 'g1', tenantId: 't1' })
    h.isProjectManager.mockResolvedValue(true)
    expect(await gerenteCreateUserAction('p1', dados)).toEqual({ user: { id: 'u1' } })
    expect(h.createUser).not.toHaveBeenCalled()
    expect(h.criarLocal).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: false, tenantId: 't1' }))
  })

  it('quem não gerencia o projeto é recusado', async () => {
    h.verifySession.mockResolvedValue({ role: 'user', userId: 'x', tenantId: 't1' })
    h.isProjectManager.mockResolvedValue(false)
    expect(await gerenteCreateUserAction('p1', dados)).toEqual({ error: expect.stringContaining('Acesso restrito') })
    expect(h.criarLocal).not.toHaveBeenCalled()
  })

  it('e-mail já usado na instituição é recusado', async () => {
    h.verifySession.mockResolvedValue({ role: 'user', userId: 'g1', tenantId: 't1' })
    h.isProjectManager.mockResolvedValue(true)
    h.achar.mockResolvedValue({ id: 'u0' })
    expect(await gerenteCreateUserAction('p1', dados)).toEqual({ error: 'Email já cadastrado' })
    expect(h.criarLocal).not.toHaveBeenCalled()
  })
})

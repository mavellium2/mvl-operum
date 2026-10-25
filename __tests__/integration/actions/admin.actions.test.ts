// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  adminApi: {
    listUsers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    toggleActive: vi.fn(),
    setRole: vi.fn(),
  },
  authApi: { provisionTenantAdmin: vi.fn(), joinTenant: vi.fn() },
}))

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn() },
  tenant: { findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: db }))
vi.mock('@/lib/platformOperator', () => ({ exigirOperadorDaPlataforma: vi.fn() }))
vi.mock('@/services/tenantService', () => ({
  createTenant: vi.fn(), updateTenant: vi.fn(), ConflictError: class extends Error {},
}))

import { verifySession } from '@/lib/dal'
import { adminApi } from '@/lib/api-client'
import {
  listUsersAction,
  adminCreateUserAction,
  adminUpdateUserAction,
  toggleUserActiveAction,
  setUserRoleAction,
  createTenantAction,
  joinAsTenantAdminAction,
  updateTenantStatusAction,
  updateTenantNameAction,
  joinTenantAction,
} from '@/app/actions/admin'
import { exigirOperadorDaPlataforma } from '@/lib/platformOperator'
import { createTenant, updateTenant } from '@/services/tenantService'

const mockVerify = verifySession as ReturnType<typeof vi.fn>
const ADMIN_SESSION = { userId: 'u1', tenantId: 't1', role: 'admin' }
const MEMBER_SESSION = { userId: 'u2', role: 'member' }

beforeEach(() => {
  vi.clearAllMocks()
  db.auditLog.create.mockResolvedValue({})
  db.user.findFirst.mockResolvedValue(null)
})

/** Registro gravado em AuditLog na chamada `n` (0 = primeira). */
const auditado = (n = 0) => db.auditLog.create.mock.calls[n]?.[0]?.data

describe('admin guard', () => {
  it('returns unauthorized error when caller role is not admin', async () => {
    mockVerify.mockResolvedValue(MEMBER_SESSION)
    const result = await listUsersAction()
    expect(result).toMatchObject({ error: expect.stringMatching(/acesso|permiss|admin/i) })
    expect(adminApi.listUsers).not.toHaveBeenCalled()
  })

  it('returns unauthorized when not authenticated', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized'))
    const result = await listUsersAction()
    expect(result).toMatchObject({ error: expect.any(String) })
  })
})

describe('listUsersAction', () => {
  it('calls listAllUsers and returns users for admin', async () => {
    mockVerify.mockResolvedValue(ADMIN_SESSION)
    vi.mocked(adminApi.listUsers).mockResolvedValue([{ id: 'u1', name: 'Alice', email: 'alice@x.com', role: 'member', isActive: true }])
    const result = await listUsersAction()
    expect(adminApi.listUsers).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ users: [{ id: 'u1' }] })
  })
})

describe('toggleUserActiveAction', () => {
  it('calls service with correct userId and active flag', async () => {
    mockVerify.mockResolvedValue(ADMIN_SESSION)
    vi.mocked(adminApi.toggleActive).mockResolvedValue({ id: 'u2', name: 'Bob', email: 'bob@x.com', role: 'member', isActive: false })
    const result = await toggleUserActiveAction('u2', false)
    expect(adminApi.toggleActive).toHaveBeenCalledWith('u2', false)
    expect(result).toMatchObject({ user: { isActive: false } })
  })
})

describe('setUserRoleAction', () => {
  it('calls setUserRole with userId and role', async () => {
    mockVerify.mockResolvedValue(ADMIN_SESSION)
    vi.mocked(adminApi.setRole).mockResolvedValue({ id: 'u2', name: 'Bob', email: 'bob@x.com', role: 'admin' })
    const result = await setUserRoleAction('u2', 'admin')
    expect(adminApi.setRole).toHaveBeenCalledWith('u2', 'admin')
    expect(result).toMatchObject({ user: { role: 'admin' } })
  })
})

describe('adminCreateUserAction', () => {
  it('calls adminCreateUser and returns new user', async () => {
    mockVerify.mockResolvedValue(ADMIN_SESSION)
    vi.mocked(adminApi.createUser).mockResolvedValue({ id: 'u3', name: 'Bob', email: 'bob@test.com', role: 'member' })
    const result = await adminCreateUserAction({
      name: 'Bob',
      email: 'bob@test.com',
      password: 'secret123',
    })
    expect(adminApi.createUser).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ user: { id: 'u3' } })
  })
})

describe('adminUpdateUserAction', () => {
  it('calls adminUpdateUser with userId and data', async () => {
    mockVerify.mockResolvedValue(ADMIN_SESSION)
    vi.mocked(adminApi.updateUser).mockResolvedValue({ id: 'u1', name: 'Alice Updated', email: 'alice@x.com', role: 'member' })
    const result = await adminUpdateUserAction('u1', { name: 'Alice Updated' })
    expect(adminApi.updateUser).toHaveBeenCalledWith('u1', { name: 'Alice Updated' })
    expect(result).toMatchObject({ user: { id: 'u1' } })
  })
})

describe('auditoria das ações de admin sobre usuários', () => {
  beforeEach(() => mockVerify.mockResolvedValue(ADMIN_SESSION))

  it('criar usuário grava quem criou e os dados, sem a senha', async () => {
    vi.mocked(adminApi.createUser).mockResolvedValue({ id: 'u3' })
    db.user.findFirst.mockResolvedValue({ name: 'Bob', email: 'bob@test.com', role: 'member', isActive: true })
    await adminCreateUserAction({ name: 'Bob', email: 'bob@test.com', password: 'secret123' })
    expect(db.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u3', tenantId: 't1' } }))
    expect(auditado()).toMatchObject({
      tenantId: 't1', userId: 'u1', action: 'USUARIO_CRIAR', entity: 'User', entityId: 'u3',
      details: { alteracoes: { name: { de: null, para: 'Bob' }, role: { de: null, para: 'member' } } },
    })
    expect(JSON.stringify(auditado())).not.toContain('secret123')
  })

  it('editar grava só os campos alterados e marca a senha redefinida sem gravá-la', async () => {
    db.user.findFirst
      .mockResolvedValueOnce({ name: 'Alice', email: 'a@x.com', hourlyRate: 50 })
      .mockResolvedValueOnce({ name: 'Alice', email: 'a@x.com', hourlyRate: 80 })
    vi.mocked(adminApi.updateUser).mockResolvedValue({ id: 'u2' })
    await adminUpdateUserAction('u2', { hourlyRate: 80, password: 'NovaSenha#1' })
    expect(auditado()).toMatchObject({
      action: 'USUARIO_EDITAR', entityId: 'u2',
      details: { alteracoes: { hourlyRate: { de: 50, para: 80 } }, senhaRedefinida: true },
    })
    expect(auditado().details.alteracoes).not.toHaveProperty('name')
    expect(JSON.stringify(auditado())).not.toContain('NovaSenha')
  })

  it('mudar papel grava de member para admin', async () => {
    db.user.findFirst.mockResolvedValueOnce({ role: 'member' }).mockResolvedValueOnce({ role: 'admin' })
    vi.mocked(adminApi.setRole).mockResolvedValue({ id: 'u2', role: 'admin' })
    await setUserRoleAction('u2', 'admin')
    expect(auditado()).toMatchObject({ action: 'USUARIO_PAPEL', entityId: 'u2', details: { alteracoes: { role: { de: 'member', para: 'admin' } } } })
  })

  it('desativar e ativar ficam registrados', async () => {
    db.user.findFirst.mockResolvedValueOnce({ isActive: true }).mockResolvedValueOnce({ isActive: false })
    vi.mocked(adminApi.toggleActive).mockResolvedValue({ id: 'u2' })
    await toggleUserActiveAction('u2', false)
    expect(auditado()).toMatchObject({ action: 'USUARIO_DESATIVAR', details: { alteracoes: { isActive: { de: true, para: false } } } })
    await toggleUserActiveAction('u2', true)
    expect(auditado(1)).toMatchObject({ action: 'USUARIO_ATIVAR' })
  })

  it('não grava nada quando o auth-service recusa a alteração', async () => {
    vi.mocked(adminApi.setRole).mockRejectedValue(new Error('Forbidden'))
    expect(await setUserRoleAction('u2', 'admin')).toEqual({ error: 'Forbidden' })
    expect(db.auditLog.create).not.toHaveBeenCalled()
  })

  it('falha ao gravar a auditoria não esconde a alteração já feita', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    db.auditLog.create.mockRejectedValue(new Error('db'))
    vi.mocked(adminApi.setRole).mockResolvedValue({ id: 'u2', role: 'admin' })
    expect(await setUserRoleAction('u2', 'admin')).toMatchObject({ user: { role: 'admin' } })
  })
})

describe('auditoria das ações do operador sobre instituições', () => {
  const OPERADOR = { userId: 'op1', tenantId: 't-mvl', role: 'admin' }
  beforeEach(() => vi.mocked(exigirOperadorDaPlataforma).mockResolvedValue(OPERADOR as never))

  it('criar instituição e provisionar o admin ficam na auditoria da nova instituição', async () => {
    vi.mocked(createTenant).mockResolvedValue({ id: 't-novo' } as never)
    await createTenantAction({ name: 'Fatec', subdomain: 'fatec' })
    expect(auditado(0)).toMatchObject({ tenantId: 't-novo', userId: 'op1', action: 'INSTITUICAO_CRIAR', entity: 'Tenant', details: { autorTenantId: 't-mvl' } })
    expect(auditado(1)).toMatchObject({ tenantId: 't-novo', action: 'INSTITUICAO_PROVISIONAR_ADMIN' })
  })

  it('entrar como admin, entrar com senha, status e nome ficam registrados', async () => {
    db.tenant.findUnique.mockResolvedValueOnce({ status: 'ACTIVE' }).mockResolvedValueOnce({ name: 'Antigo' })
    await joinAsTenantAdminAction('t2')
    await joinTenantAction('t2', 'senha')
    await updateTenantStatusAction('t2', 'SUSPENDED')
    await updateTenantNameAction('t2', ' Novo ')
    expect(vi.mocked(updateTenant)).toHaveBeenCalledTimes(2)
    expect(db.auditLog.create.mock.calls.map(c => c[0].data.action)).toEqual([
      'INSTITUICAO_PROVISIONAR_ADMIN', 'INSTITUICAO_ENTRAR', 'INSTITUICAO_STATUS', 'INSTITUICAO_RENOMEAR',
    ])
    expect(auditado(2).details.alteracoes).toEqual({ status: { de: 'ACTIVE', para: 'SUSPENDED' } })
    expect(auditado(3).details.alteracoes).toEqual({ name: { de: 'Antigo', para: 'Novo' } })
    expect(JSON.stringify(db.auditLog.create.mock.calls)).not.toContain('senha')
  })
})

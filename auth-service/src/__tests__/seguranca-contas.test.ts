import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { ZodError } from 'zod'

// Regressões da auditoria de 24/10/2026: atribuição em massa em PATCH /auth/me
// e nas rotas de admin, troca de instituição só por e-mail e
// join/provision de instituição por qualquer usuário.

vi.mock('../prisma', () => ({
  prisma: {
    tenant: { findFirst: vi.fn() },
    user: {
      findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(),
      update: vi.fn(), updateMany: vi.fn(), create: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
}))

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('novo-hash'), compare: vi.fn() },
}))

import { AuthService } from '../auth/auth.service'
import { AdminService } from '../admin/admin.service'
import { UpdateProfileSchema } from '../auth/dto/update-profile.dto'
import { AdminCreateUserSchema, AdminUpdateUserSchema } from '../admin/admin.dto'
import { prisma } from '../prisma'
import bcrypt from 'bcryptjs'

const jwt = { sign: vi.fn().mockResolvedValue({ token: 'jwt', jti: 'jti' }), verify: vi.fn() }
const redis = { setSession: vi.fn() }
const service = () => new AuthService(jwt as never, redis as never, {} as never)

const conta = (o: Record<string, unknown> = {}) => ({
  id: 'u-1', email: 'ana@x.com', name: 'Ana', tenantId: 't-a', identityId: null, role: 'member',
  passwordHash: 'hash', tokenVersion: 0, loginAttempts: 0, isActive: true, deletedAt: null,
  platformOperator: false, ...o,
})

beforeEach(() => vi.clearAllMocks())

describe('PATCH /auth/me — só campos de perfil', () => {
  it.each(['role', 'tenantId', 'passwordHash', 'isActive', 'tokenVersion', 'platformOperator', 'identityId', 'hourlyRate', 'cargo'])(
    'recusa %s', campo => {
      expect(() => UpdateProfileSchema.parse({ name: 'Ana', [campo]: 'x' })).toThrow(ZodError)
    })

  it('aceita os campos do formulário de perfil', () => {
    expect(UpdateProfileSchema.parse({ name: 'Ana', email: 'ana@x.com', phone: '', notes: 'oi', avatarUrl: '/api/files/1/image' }))
      .toMatchObject({ name: 'Ana' })
  })

  it('recusa avatar com esquema perigoso', () => {
    expect(() => UpdateProfileSchema.parse({ avatarUrl: 'javascript:alert(1)' })).toThrow(ZodError)
    expect(() => UpdateProfileSchema.parse({ avatarUrl: '//evil.com/a.png' })).toThrow(ZodError)
  })
})

describe('rotas de admin — campos e escopo de instituição', () => {
  it('create/update recusam campos de controle', () => {
    const base = { name: 'Bia', email: 'bia@x.com', password: 'Senha123!' }
    expect(() => AdminCreateUserSchema.parse({ ...base, platformOperator: true })).toThrow(ZodError)
    expect(() => AdminCreateUserSchema.parse({ ...base, tenantId: 't-b' })).toThrow(ZodError)
    expect(() => AdminUpdateUserSchema.parse({ role: 'admin' })).toThrow(ZodError)
    expect(() => AdminUpdateUserSchema.parse({ identityId: 'u-9' })).toThrow(ZodError)
  })

  it('admin não altera usuário de outra instituição', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    await expect(new AdminService().updateUser('u-outro', 't-a', 'admin', { name: 'X' })).rejects.toThrow(NotFoundException)
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'u-outro', tenantId: 't-a' }) }))
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('setRole e toggleActive também ficam na instituição de quem chama', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    await expect(new AdminService().setRole('u-outro', 't-a', 'admin', 'admin')).rejects.toThrow(NotFoundException)
    await expect(new AdminService().toggleActive('u-outro', 't-a', 'admin', false)).rejects.toThrow(NotFoundException)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('senha redefinida pelo admin encerra as sessões', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: 'u-2' } as never)
    await new AdminService().updateUser('u-2', 't-a', 'admin', { password: 'Senha123!' })
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ passwordHash: 'novo-hash', tokenVersion: { increment: 1 } }),
    }))
  })
})

describe('troca de instituição — só contas vinculadas', () => {
  it('conta com o mesmo e-mail e sem vínculo exige a senha de destino', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(conta() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(conta({ id: 'u-vitima', tenantId: 't-b' }) as never)
    await expect(service().switchTenant('u-1', 't-b')).rejects.toThrow(ForbiddenException)
    expect(jwt.sign).not.toHaveBeenCalled()
  })

  it('senha errada não troca e conta a tentativa na conta de destino', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(conta() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(conta({ id: 'u-vitima', tenantId: 't-b' }) as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    await expect(service().switchTenant('u-1', 't-b', 'chute')).rejects.toThrow(ForbiddenException)
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-vitima' }, data: { loginAttempts: { increment: 1 } } })
    expect(jwt.sign).not.toHaveBeenCalled()
  })

  it('senha certa vincula as contas e troca', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(conta() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(conta({ id: 'u-2', tenantId: 't-b' }) as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)
    await expect(service().switchTenant('u-1', 't-b', 'certa')).resolves.toMatchObject({ token: 'jwt' })
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['u-1', 'u-2'] } }, data: { identityId: 'u-1' } })
  })

  it('contas já vinculadas trocam sem senha', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(conta({ identityId: 'u-1' }) as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(conta({ id: 'u-2', tenantId: 't-b', identityId: 'u-1' }) as never)
    await expect(service().switchTenant('u-1', 't-b')).resolves.toMatchObject({ token: 'jwt' })
    expect(bcrypt.compare).not.toHaveBeenCalled()
  })

  it('conta bloqueada por tentativas não aceita senha', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(conta() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(conta({ id: 'u-2', tenantId: 't-b', loginAttempts: 10 }) as never)
    await expect(service().switchTenant('u-1', 't-b', 'qualquer')).rejects.toThrow(ForbiddenException)
    expect(bcrypt.compare).not.toHaveBeenCalled()
  })
})

describe('entrar/provisionar instituição — só operador da plataforma', () => {
  it('admin comum de instituição não entra em outra instituição', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(conta({ role: 'admin' }) as never)
    await expect(service().joinTenant('u-1', 't-b', 'Senha1234')).rejects.toThrow(ForbiddenException)
    await expect(service().provisionTenantAdmin('u-1', 't-b')).rejects.toThrow(ForbiddenException)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('operador provisiona e a nova conta nasce vinculada', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(conta({ role: 'admin', platformOperator: true }) as never)
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue({ id: 't-b' } as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)
    await expect(service().provisionTenantAdmin('u-1', 't-b')).resolves.toEqual({ ok: true })
    expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 't-b', identityId: 'u-1' }) })
  })
})

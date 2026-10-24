import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'

// ── Mocks declarados antes dos imports que os usam ───────────────────────────

vi.mock('../prisma', () => ({
  prisma: {
    tenant: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed'),
    compare: vi.fn().mockResolvedValue(true),
  },
}))

// ── Imports após mocks ───────────────────────────────────────────────────────

import { AuthService } from '../auth/auth.service'
import { prisma } from '../prisma'
import bcrypt from 'bcryptjs'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTenant(overrides: Partial<Record<string, unknown>> = {}) {
  return { id: 'tenant-a', name: 'Tenant A', subdomain: 'a', status: 'ACTIVE', ...overrides }
}

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'ana@x.com',
    tenantId: 'tenant-a',
    passwordHash: 'hashed',
    tokenVersion: 0,
    isActive: true,
    status: 'active',
    deletedAt: null,
    loginAttempts: 0,
    forcePasswordChange: false,
    role: 'member',
    name: 'Ana',
    avatarUrl: null,
    ...overrides,
  }
}

function makeRedis() {
  return {
    setSession: vi.fn(),
    getSession: vi.fn().mockResolvedValue(null),
    deleteSession: vi.fn(),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn(),
    incrWithTTL: vi.fn().mockResolvedValue(1),
    delResetAttempts: vi.fn(),
  }
}

function makeMailer() {
  return { sendPasswordResetCode: vi.fn().mockResolvedValue(undefined) }
}

function makeJwt() {
  return {
    sign: vi.fn().mockResolvedValue({ token: 'jwt-token', jti: 'jti-1' }),
    verify: vi.fn(),
  }
}

function makeService() {
  return new AuthService(makeJwt() as never, makeRedis() as never, makeMailer() as never)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AuthService.login — resolução de tenant por subdomínio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('com 2+ tenants ACTIVE, usuário do tenant B loga pelo subdomínio de B com sucesso', async () => {
    const tenantA = makeTenant({ id: 'tenant-a', subdomain: 'a' })
    const tenantB = makeTenant({ id: 'tenant-b', subdomain: 'b' })
    const userB = makeUser({ id: 'user-b', tenantId: 'tenant-b' })

    vi.mocked(prisma.tenant.findFirst).mockImplementation((async ({ where }: any) => {
      return [tenantA, tenantB].find(t => t.subdomain === where.subdomain) ?? null
    }) as never)
    vi.mocked(prisma.user.findFirst).mockImplementation((async ({ where }: any) => {
      return where.tenantId === 'tenant-b' ? userB : null
    }) as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const service = makeService()
    const result = await service.login({ email: 'ana@x.com', password: 'Senha@123' }, 'b')

    expect(result.token).toBe('jwt-token')
    expect(result.user.tenantId).toBe('tenant-b')
  })

  it('email existe no tenant A mas não em B: logar pelo subdomínio de B retorna "Credenciais inválidas" (não cai para A)', async () => {
    const tenantB = makeTenant({ id: 'tenant-b', subdomain: 'b' })

    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(tenantB as never)
    // Usuário só existe no tenant A — busca por tenantId=tenant-b não encontra nada
    vi.mocked(prisma.user.findFirst).mockImplementation((async ({ where }: any) => {
      return where.tenantId === 'tenant-a' ? makeUser({ tenantId: 'tenant-a' }) : null
    }) as never)

    const service = makeService()
    await expect(
      service.login({ email: 'ana@x.com', password: 'Senha@123' }, 'b'),
    ).rejects.toThrow('Credenciais inválidas')

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-b' }) }),
    )
  })

  it('sem subdomain: nunca resolve um tenant arbitrário (não chama tenant.findFirst)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
    const service = makeService()

    await expect(
      service.login({ email: 'ana@x.com', password: 'Senha@123' }, undefined),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(
      service.login({ email: 'ana@x.com', password: 'Senha@123' }, undefined),
    ).rejects.toThrow('Credenciais inválidas')

    // A query de tenant.findFirst (que causava o bug de pegar QUALQUER tenant
    // ACTIVE) nunca chega a rodar sem subdomain.
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled()
  })

  it('sem subdomain, mas e-mail existe em exatamente um tenant ativo: loga com sucesso (fallback por e-mail)', async () => {
    const user = makeUser({ id: 'user-1', tenantId: 'tenant-a' })
    vi.mocked(prisma.user.findMany).mockResolvedValue([user] as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const service = makeService()
    const result = await service.login({ email: 'ana@x.com', password: 'Senha@123' }, undefined)

    expect(result.token).toBe('jwt-token')
    expect(result.user.tenantId).toBe('tenant-a')
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled()
  })

  it('subdomain presente mas sem tenant correspondente (ex.: Host de produção sem wildcard DNS, como "operum.mavellium.com.br") usa o fallback por e-mail em vez de falhar fechado', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(null as never)
    const user = makeUser({ id: 'user-1', tenantId: 'tenant-a' })
    vi.mocked(prisma.user.findMany).mockResolvedValue([user] as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never)

    const service = makeService()
    const result = await service.login({ email: 'ana@x.com', password: 'Senha@123' }, 'operum')

    expect(result.token).toBe('jwt-token')
    expect(result.user.tenantId).toBe('tenant-a')
    expect(prisma.tenant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { subdomain: 'operum', status: 'ACTIVE' } }),
    )
  })

  it('subdomain vazio ("") é tratado como ausente — usa o fallback por e-mail, não falha fechada', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
    const service = makeService()

    await expect(
      service.login({ email: 'ana@x.com', password: 'Senha@123' }, ''),
    ).rejects.toThrow('Credenciais inválidas')
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled()
    expect(prisma.user.findMany).toHaveBeenCalled()
  })

  it('sem subdomain, mesmo e-mail em 2 tenants ACTIVE com senhas diferentes: testa cada candidato e loga no tenant cuja senha bate', async () => {
    const userA = makeUser({ id: 'user-a', tenantId: 'tenant-a', passwordHash: 'hashA' })
    const userB = makeUser({ id: 'user-b', tenantId: 'tenant-b', passwordHash: 'hashB' })
    vi.mocked(prisma.user.findMany).mockResolvedValue([userA, userB] as never)
    vi.mocked(bcrypt.compare).mockImplementation(
      (async (password: string, hash: string) => password === `pass-${hash}`) as never,
    )

    const service = makeService()
    const result = await service.login({ email: 'ana@x.com', password: 'pass-hashB' }, undefined)

    expect(result.user.tenantId).toBe('tenant-b')
    expect(prisma.tenant.findFirst).not.toHaveBeenCalled()
  })

  it('sem subdomain: busca candidatos ordenados por lastLogin desc (último acesso primeiro, nunca-acessou por último)', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never)
    const service = makeService()

    await expect(
      service.login({ email: 'ana@x.com', password: 'Senha@123' }, undefined),
    ).rejects.toThrow('Credenciais inválidas')

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { lastLogin: { sort: 'desc', nulls: 'last' } } }),
    )
  })

  it('sem subdomain, mesmo e-mail em 2 tenants: senha que não bate em nenhum candidato falha genérico', async () => {
    const userA = makeUser({ id: 'user-a', tenantId: 'tenant-a', passwordHash: 'hashA' })
    const userB = makeUser({ id: 'user-b', tenantId: 'tenant-b', passwordHash: 'hashB' })
    vi.mocked(prisma.user.findMany).mockResolvedValue([userA, userB] as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)

    const service = makeService()
    await expect(
      service.login({ email: 'ana@x.com', password: 'errada' }, undefined),
    ).rejects.toThrow('Credenciais inválidas')
    // Conta a tentativa em todas as contas testadas (antes nenhuma chegava ao bloqueio).
    expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['user-a', 'user-b'] } }, data: { loginAttempts: { increment: 1 } } })
  })

  it('conta inativa ou bloqueada com senha errada responde igual a credencial inválida', async () => {
    vi.mocked(prisma.user.findMany).mockResolvedValue([makeUser({ isActive: false })] as never)
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never)
    await expect(makeService().login({ email: 'ana@x.com', password: 'errada' }, undefined)).rejects.toThrow('Credenciais inválidas')
    vi.mocked(prisma.user.findMany).mockResolvedValue([makeUser({ loginAttempts: 10 })] as never)
    await expect(makeService().login({ email: 'ana@x.com', password: 'errada' }, undefined)).rejects.toThrow('Credenciais inválidas')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('mesmo email em A e B com senhas diferentes: cada um loga só no seu tenant com sua própria senha', async () => {
    const tenantA = makeTenant({ id: 'tenant-a', subdomain: 'a' })
    const tenantB = makeTenant({ id: 'tenant-b', subdomain: 'b' })
    const userA = makeUser({ id: 'user-a', tenantId: 'tenant-a', passwordHash: 'hashA' })
    const userB = makeUser({ id: 'user-b', tenantId: 'tenant-b', passwordHash: 'hashB' })

    vi.mocked(prisma.tenant.findFirst).mockImplementation((async ({ where }: any) => {
      return [tenantA, tenantB].find(t => t.subdomain === where.subdomain) ?? null
    }) as never)
    vi.mocked(prisma.user.findFirst).mockImplementation((async ({ where }: any) => {
      if (where.tenantId === 'tenant-a') return userA
      if (where.tenantId === 'tenant-b') return userB
      return null
    }) as never)
    vi.mocked(bcrypt.compare).mockImplementation(
      (async (password: string, hash: string) =>
        (hash === 'hashA' && password === 'passA') || (hash === 'hashB' && password === 'passB')) as never,
    )

    const service = makeService()

    const resultA = await service.login({ email: 'ana@x.com', password: 'passA' }, 'a')
    expect(resultA.user.tenantId).toBe('tenant-a')

    const resultB = await service.login({ email: 'ana@x.com', password: 'passB' }, 'b')
    expect(resultB.user.tenantId).toBe('tenant-b')

    // Senha de B não funciona no tenant A
    await expect(
      service.login({ email: 'ana@x.com', password: 'passB' }, 'a'),
    ).rejects.toThrow('Credenciais inválidas')
  })
})

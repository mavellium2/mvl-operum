import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HttpException } from '@nestjs/common'

// ── Mocks declarados antes dos imports que os usam ───────────────────────────

vi.mock('../prisma', () => ({
  prisma: {
    tenant: { findFirst: vi.fn() },
    user: { findFirst: vi.fn(), update: vi.fn() },
    apiToken: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    oAuthGrant: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() },
    oAuthToken: { findMany: vi.fn().mockResolvedValue([]) },
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
import { hashResetCode } from '../lib/crypto'

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_CODE = 'A2BCDEFG'
const VALID_HASH = hashResetCode(VALID_CODE)
const FUTURE = new Date(Date.now() + 15 * 60 * 1000)
const PAST = new Date(Date.now() - 1)

function makeRedis(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    setSession: vi.fn(),
    getSession: vi.fn().mockResolvedValue(null),
    deleteSession: vi.fn(),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn(),
    incrWithTTL: vi.fn().mockResolvedValue(1),
    delResetAttempts: vi.fn(),
    ...overrides,
  }
}

function makeMailer() {
  return { sendPasswordResetCode: vi.fn().mockResolvedValue(undefined) }
}

function makeJwt() {
  return { sign: vi.fn(), verify: vi.fn() }
}

function makeTenant(name = 'Nairim') {
  return { id: 'tenant-1', name, subdomain: 'nairim', status: 'ACTIVE' }
}

function makeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    email: 'ana@x.com',
    tenantId: 'tenant-1',
    passwordHash: 'hashed',
    resetToken: VALID_HASH,
    resetTokenExpiry: FUTURE,
    tokenVersion: 0,
    isActive: true,
    status: 'active',
    deletedAt: null,
    loginAttempts: 0,
    forcePasswordChange: false,
    ...overrides,
  }
}

function makeService(redisOverrides = {}, mailerOverrides = {}) {
  return new AuthService(
    makeJwt() as never,
    makeRedis(redisOverrides) as never,
    { ...makeMailer(), ...mailerOverrides } as never,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('requestPasswordReset', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sempre retorna sucesso genérico quando e-mail existe', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)
    vi.mocked(prisma.user.update).mockResolvedValue(makeUser() as never)

    const service = makeService()
    const result = await service.requestPasswordReset({ email: 'ana@x.com', subdomain: 'nairim' })

    expect(result.success).toBe(true)
    expect(result.message).toContain('Se o e-mail estiver cadastrado')
    expect(prisma.user.update).toHaveBeenCalledOnce()
  })

  it('sempre retorna o MESMO sucesso genérico quando e-mail NÃO existe', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(null)

    const bcrypt = await import('bcryptjs')
    const service = makeService()
    const result = await service.requestPasswordReset({ email: 'naoexiste@x.com', subdomain: 'nairim' })

    expect(result.success).toBe(true)
    // Caminho dummy executa bcrypt para igualar tempo de resposta
    expect(bcrypt.default.hash).toHaveBeenCalledWith('dummy-anti-enum', 12)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('salva SHA256 do código (nunca o código em claro)', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)
    vi.mocked(prisma.user.update).mockResolvedValue(makeUser() as never)

    const service = makeService()
    await service.requestPasswordReset({ email: 'ana@x.com', subdomain: 'nairim' })

    const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0]
    const savedToken = (updateCall.data as { resetToken: string }).resetToken
    expect(savedToken).toHaveLength(64)   // SHA-256 hex
    expect(savedToken).toMatch(/^[0-9a-f]+$/)
  })

  it('envia e-mail (ou loga em dev)', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)
    vi.mocked(prisma.user.update).mockResolvedValue(makeUser() as never)

    const mailerSpy = vi.fn().mockResolvedValue(undefined)
    const service = makeService({}, { sendPasswordResetCode: mailerSpy })
    await service.requestPasswordReset({ email: 'ana@x.com', subdomain: 'nairim' })

    expect(mailerSpy).toHaveBeenCalledOnce()
    expect(mailerSpy.mock.calls[0][0]).toBe('ana@x.com')
    // O código passado ao mailer é o código original (não o hash)
    const sentCode = mailerSpy.mock.calls[0][1] as string
    expect(sentCode).toHaveLength(8)
    expect(hashResetCode(sentCode)).toBe(
      (vi.mocked(prisma.user.update).mock.calls[0][0].data as { resetToken: string }).resetToken,
    )
  })

  it('lança 429 ao exceder 3 solicitações / 15min', async () => {
    const service = makeService({ incrWithTTL: vi.fn().mockResolvedValue(4) })
    await expect(
      service.requestPasswordReset({ email: 'ana@x.com', subdomain: 'nairim' }),
    ).rejects.toBeInstanceOf(HttpException)
  })
})

describe('validateResetCode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retorna sucesso para código correto dentro do prazo', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)

    const service = makeService()
    const result = await service.validateResetCode({ email: 'ana@x.com', code: VALID_CODE, subdomain: 'nairim' })

    expect(result.success).toBe(true)
    // Código NÃO é consumido aqui
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('lança erro para código expirado', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(
      makeUser({ resetTokenExpiry: PAST }) as never,
    )

    const service = makeService()
    await expect(
      service.validateResetCode({ email: 'ana@x.com', code: VALID_CODE, subdomain: 'nairim' }),
    ).rejects.toBeInstanceOf(HttpException)
  })

  it('lança erro para código errado', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)

    const service = makeService()
    await expect(
      service.validateResetCode({ email: 'ana@x.com', code: 'WRONGCOD', subdomain: 'nairim' }),
    ).rejects.toBeInstanceOf(HttpException)
  })

  it('na 6ª tentativa invalida o código e lança erro', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)
    vi.mocked(prisma.user.update).mockResolvedValue(makeUser() as never)

    const service = makeService({ incrWithTTL: vi.fn().mockResolvedValue(6) })
    await expect(
      service.validateResetCode({ email: 'ana@x.com', code: VALID_CODE, subdomain: 'nairim' }),
    ).rejects.toBeInstanceOf(HttpException)

    // Código deve ser invalidado no banco
    const updateCall = vi.mocked(prisma.user.update).mock.calls[0][0]
    expect((updateCall.data as { resetToken: null }).resetToken).toBeNull()
  })

  it('mensagem de erro é genérica (não diferencia inválido de expirado)', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(
      makeUser({ resetTokenExpiry: PAST }) as never,
    )

    const service = makeService()
    let errorMsg = ''
    try {
      await service.validateResetCode({ email: 'ana@x.com', code: VALID_CODE, subdomain: 'nairim' })
    } catch (e) {
      const body = (e as HttpException).getResponse() as { error: string }
      errorMsg = body.error
    }
    expect(errorMsg).toBe('Código inválido ou expirado.')
  })
})

describe('resetPassword', () => {
  beforeEach(() => vi.clearAllMocks())

  it('atualiza a senha, limpa token e incrementa tokenVersion', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)
    vi.mocked(prisma.user.update).mockResolvedValue(makeUser() as never)

    const service = makeService()
    const result = await service.resetPassword({
      email: 'ana@x.com',
      code: VALID_CODE,
      newPassword: 'NewPass1!',
      subdomain: 'nairim',
    })

    expect(result.success).toBe(true)
    const updateData = vi.mocked(prisma.user.update).mock.calls[0][0].data as Record<string, unknown>
    expect(updateData.passwordHash).toBe('hashed')
    expect(updateData.resetToken).toBeNull()
    expect(updateData.resetTokenExpiry).toBeNull()
    expect(updateData.tokenVersion).toEqual({ increment: 1 })
  })

  it('limpa o contador de tentativas após reset bem-sucedido', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)
    vi.mocked(prisma.user.update).mockResolvedValue(makeUser() as never)

    const delSpy = vi.fn()
    const service = makeService({ delResetAttempts: delSpy })
    await service.resetPassword({
      email: 'ana@x.com',
      code: VALID_CODE,
      newPassword: 'NewPass1!',
      subdomain: 'nairim',
    })

    expect(delSpy).toHaveBeenCalledWith('user-1')
  })

  it('rejeita código expirado mesmo sem passar pela Etapa 2', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(
      makeUser({ resetTokenExpiry: PAST }) as never,
    )

    const service = makeService()
    await expect(
      service.resetPassword({
        email: 'ana@x.com',
        code: VALID_CODE,
        newPassword: 'NewPass1!',
        subdomain: 'nairim',
      }),
    ).rejects.toBeInstanceOf(HttpException)

    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('rejeita código errado', async () => {
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(makeTenant() as never)
    vi.mocked(prisma.user.findFirst).mockResolvedValue(makeUser() as never)

    const service = makeService()
    await expect(
      service.resetPassword({
        email: 'ana@x.com',
        code: 'WRONGCOD',
        newPassword: 'NewPass1!',
        subdomain: 'nairim',
      }),
    ).rejects.toBeInstanceOf(HttpException)
  })
})

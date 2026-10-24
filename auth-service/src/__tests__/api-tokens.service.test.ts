import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'

vi.mock('../prisma', () => ({
  prisma: {
    apiToken: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { ApiTokensService } from '../api-tokens/api-tokens.service'
import { prisma } from '../prisma'
import { hashApiToken } from '../lib/crypto'

function makeRedis() {
  return { deleteApiTokenCache: vi.fn() }
}

function makeApiToken(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'token-1',
    tenantId: 'tenant-a',
    userId: 'user-1',
    name: 'Claude Code',
    prefix: 'opr_pat_abcd',
    tokenHash: 'hash',
    scopes: ['read'],
    expiresAt: new Date(Date.now() + 86_400_000),
    lastUsedAt: null,
    revokedAt: null,
    createdAt: new Date(),
    user: { role: 'member', isActive: true, forcePasswordChange: false, deletedAt: null, status: 'active', tenantId: 'tenant-a', tenant: { status: 'ACTIVE', deletedAt: null } },
    ...overrides,
  }
}

describe('ApiTokensService', () => {
  let service: ApiTokensService
  let redis: ReturnType<typeof makeRedis>

  beforeEach(() => {
    vi.clearAllMocks()
    redis = makeRedis()
    service = new ApiTokensService(redis as any)
  })

  describe('create', () => {
    it('persiste tokenHash correspondente ao token retornado e usa expiresAt default de 90 dias', async () => {
      vi.mocked(prisma.apiToken.create).mockImplementation((async ({ data }: any) => ({
        id: 'token-1',
        ...data,
      })) as any)

      const before = Date.now()
      const result = await service.create('user-1', 'tenant-a', { name: 'Claude Code', scopes: ['read'] })
      const after = Date.now()

      expect(result.token).toMatch(/^opr_pat_/)
      expect(result.prefix).toBe(result.token.slice(0, 12))

      const createCall = vi.mocked(prisma.apiToken.create).mock.calls[0][0] as any
      expect(createCall.data.tokenHash).toBe(hashApiToken(result.token))
      expect(createCall.data.userId).toBe('user-1')
      expect(createCall.data.tenantId).toBe('tenant-a')
      expect(createCall.data.scopes).toEqual(['read'])

      const expiresAt = createCall.data.expiresAt.getTime()
      const expectedMin = before + 89 * 86_400_000
      const expectedMax = after + 91 * 86_400_000
      expect(expiresAt).toBeGreaterThan(expectedMin)
      expect(expiresAt).toBeLessThan(expectedMax)
    })

    it('usa expiresInDays customizado quando informado', async () => {
      vi.mocked(prisma.apiToken.create).mockImplementation((async ({ data }: any) => ({ id: 'token-1', ...data })) as any)

      const before = Date.now()
      await service.create('user-1', 'tenant-a', { name: 'x', scopes: ['read'], expiresInDays: 30 })

      const createCall = vi.mocked(prisma.apiToken.create).mock.calls[0][0] as any
      const expiresAt = createCall.data.expiresAt.getTime()
      expect(expiresAt).toBeGreaterThan(before + 29 * 86_400_000)
      expect(expiresAt).toBeLessThan(before + 31 * 86_400_000)
    })
  })

  describe('list', () => {
    it('escopa a busca por userId e tenantId e nunca seleciona tokenHash', async () => {
      vi.mocked(prisma.apiToken.findMany).mockResolvedValue([])

      await service.list('user-1', 'tenant-a')

      const call = vi.mocked(prisma.apiToken.findMany).mock.calls[0][0] as any
      expect(call.where).toEqual({ userId: 'user-1', tenantId: 'tenant-a' })
      expect(call.select.tokenHash).toBeUndefined()
    })
  })

  describe('revoke', () => {
    it('busca o registro escopado por id/userId/tenantId antes de revogar', async () => {
      vi.mocked(prisma.apiToken.findFirst).mockResolvedValue(makeApiToken() as any)
      vi.mocked(prisma.apiToken.update).mockResolvedValue({} as any)

      await service.revoke('token-1', 'user-1', 'tenant-a')

      const findCall = vi.mocked(prisma.apiToken.findFirst).mock.calls[0][0] as any
      expect(findCall.where).toEqual({ id: 'token-1', userId: 'user-1', tenantId: 'tenant-a' })

      const updateCall = vi.mocked(prisma.apiToken.update).mock.calls[0][0] as any
      expect(updateCall.where).toEqual({ id: 'token-1' })
      expect(updateCall.data.revokedAt).toBeInstanceOf(Date)
    })

    it('invalida o cache pat:{hash} no Redis (efeito imediato)', async () => {
      vi.mocked(prisma.apiToken.findFirst).mockResolvedValue(makeApiToken({ tokenHash: 'hash-abc' }) as any)
      vi.mocked(prisma.apiToken.update).mockResolvedValue({} as any)

      await service.revoke('token-1', 'user-1', 'tenant-a')

      expect(redis.deleteApiTokenCache).toHaveBeenCalledWith('hash-abc')
    })

    it('lança NotFoundException quando o token não pertence ao usuário/tenant, sem tocar no Redis', async () => {
      vi.mocked(prisma.apiToken.findFirst).mockResolvedValue(null)

      await expect(service.revoke('token-1', 'user-1', 'tenant-a')).rejects.toBeInstanceOf(NotFoundException)
      expect(prisma.apiToken.update).not.toHaveBeenCalled()
      expect(redis.deleteApiTokenCache).not.toHaveBeenCalled()
    })
  })

  describe('introspect', () => {
    it('retorna active=true para token válido, não revogado, não expirado, usuário ativo', async () => {
      const record = makeApiToken()
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(record as any)

      const result = await service.introspect('opr_pat_valid')

      expect(result).toEqual({
        active: true,
        userId: 'user-1',
        tenantId: 'tenant-a',
        role: 'member',
        scopes: ['read'],
        tokenId: 'token-1',
      })
    })

    it('retorna active=false para token revogado', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(makeApiToken({ revokedAt: new Date() }) as any)

      const result = await service.introspect('opr_pat_revoked')
      expect(result.active).toBe(false)
    })

    it('retorna active=false para token expirado', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(
        makeApiToken({ expiresAt: new Date(Date.now() - 1000) }) as any,
      )

      const result = await service.introspect('opr_pat_expired')
      expect(result.active).toBe(false)
    })

    it('retorna active=false quando usuário está inativo', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(
        makeApiToken({ user: { role: 'member', isActive: false, forcePasswordChange: false } }) as any,
      )

      const result = await service.introspect('opr_pat_inactive_user')
      expect(result.active).toBe(false)
    })

    it('retorna active=false quando forcePasswordChange está setado', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(
        makeApiToken({ user: { role: 'member', isActive: true, forcePasswordChange: true } }) as any,
      )

      const result = await service.introspect('opr_pat_force_change')
      expect(result.active).toBe(false)
    })

  it('retorna active=false quando a instituição está suspensa ou a conta foi apagada', async () => {
    const base = { role: 'member', isActive: true, forcePasswordChange: false, deletedAt: null, status: 'active', tenantId: 'tenant-a' }
    vi.mocked(prisma.apiToken.findUnique).mockResolvedValueOnce(
      makeApiToken({ user: { ...base, tenant: { status: 'SUSPENDED', deletedAt: null } } }) as any,
    )
    expect((await service.introspect('opr_pat_x')).active).toBe(false)
    vi.mocked(prisma.apiToken.findUnique).mockResolvedValueOnce(
      makeApiToken({ user: { ...base, deletedAt: new Date(), tenant: { status: 'ACTIVE', deletedAt: null } } }) as any,
    )
    expect((await service.introspect('opr_pat_x')).active).toBe(false)
  })

    it('retorna active=false e campos nulos quando o token não é encontrado', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(null)

      const result = await service.introspect('opr_pat_unknown')
      expect(result).toEqual({ active: false, userId: null, tenantId: null, role: null, scopes: [], tokenId: null })
    })

    it('atualiza lastUsedAt quando null', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(makeApiToken({ lastUsedAt: null }) as any)

      await service.introspect('opr_pat_valid')

      expect(prisma.apiToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { lastUsedAt: expect.any(Date) },
      })
    })

    it('não atualiza lastUsedAt quando última atualização foi há menos de 60s', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(
        makeApiToken({ lastUsedAt: new Date(Date.now() - 30_000) }) as any,
      )

      await service.introspect('opr_pat_valid')

      expect(prisma.apiToken.update).not.toHaveBeenCalled()
    })

    it('atualiza lastUsedAt quando última atualização foi há mais de 60s', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(
        makeApiToken({ lastUsedAt: new Date(Date.now() - 90_000) }) as any,
      )

      await service.introspect('opr_pat_valid')

      expect(prisma.apiToken.update).toHaveBeenCalled()
    })

    it('não atualiza lastUsedAt quando o token está inativo (revogado)', async () => {
      vi.mocked(prisma.apiToken.findUnique).mockResolvedValue(makeApiToken({ revokedAt: new Date() }) as any)

      await service.introspect('opr_pat_revoked')

      expect(prisma.apiToken.update).not.toHaveBeenCalled()
    })
  })
})

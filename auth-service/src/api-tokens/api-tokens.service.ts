import { Injectable, NotFoundException } from '@nestjs/common'
import { prisma } from '../prisma'
import { generateApiToken, hashApiToken } from '../lib/crypto'
import { RedisService } from '../redis/redis.service'
import type { CreateApiTokenDto } from './dto/create-api-token.dto'

const DEFAULT_EXPIRES_IN_DAYS = 90
const LAST_USED_THROTTLE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface IntrospectResult {
  active: boolean
  userId: string | null
  tenantId: string | null
  role: string | null
  scopes: string[]
  tokenId: string | null
}

@Injectable()
export class ApiTokensService {
  constructor(private readonly redis: RedisService) {}

  async create(userId: string, tenantId: string, dto: CreateApiTokenDto) {
    const { token, prefix } = generateApiToken()
    const tokenHash = hashApiToken(token)
    const expiresInDays = dto.expiresInDays ?? DEFAULT_EXPIRES_IN_DAYS
    const expiresAt = new Date(Date.now() + expiresInDays * DAY_MS)

    const created = await prisma.apiToken.create({
      data: {
        tenantId,
        userId,
        name: dto.name,
        prefix,
        tokenHash,
        scopes: dto.scopes,
        expiresAt,
      },
    })

    return { id: created.id, token, prefix: created.prefix, expiresAt: created.expiresAt }
  }

  async list(userId: string, tenantId: string) {
    return prisma.apiToken.findMany({
      where: { userId, tenantId },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async revoke(id: string, userId: string, tenantId: string): Promise<void> {
    // Precisa do tokenHash para invalidar a chave pat:{hash} no Redis do gateway —
    // por isso busca o registro antes de revogar, em vez de um updateMany cego.
    const record = await prisma.apiToken.findFirst({ where: { id, userId, tenantId } })
    if (!record) throw new NotFoundException('Token não encontrado')

    await prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } })
    // Efeito imediato (SDD 5.3/5.4): sem isso, o token revogado continuaria
    // ativo no cache do gateway por até 60s (TTL da introspecção).
    await this.redis.deleteApiTokenCache(record.tokenHash)
  }

  async introspect(token: string): Promise<IntrospectResult> {
    const tokenHash = hashApiToken(token)
    const record = await prisma.apiToken.findUnique({
      where: { tokenHash },
      include: { user: { include: { tenant: { select: { status: true, deletedAt: true } } } } },
    })

    if (!record) {
      return { active: false, userId: null, tenantId: null, role: null, scopes: [], tokenId: null }
    }

    const now = new Date()
    const active =
      !record.revokedAt &&
      !(record.expiresAt && record.expiresAt < now) &&
      record.user.isActive &&
      !record.user.deletedAt &&
      record.user.status === 'active' &&
      !record.user.forcePasswordChange &&
      // Instituição suspensa ou removida derruba também os PATs dela.
      record.user.tenantId === record.tenantId &&
      record.user.tenant.status === 'ACTIVE' &&
      !record.user.tenant.deletedAt

    if (active) {
      const shouldUpdateLastUsed =
        !record.lastUsedAt || now.getTime() - record.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS
      if (shouldUpdateLastUsed) {
        await prisma.apiToken.update({ where: { id: record.id }, data: { lastUsedAt: now } })
      }
    }

    return {
      active,
      userId: record.userId,
      tenantId: record.tenantId,
      role: record.user.role,
      scopes: record.scopes,
      tokenId: record.id,
    }
  }
}

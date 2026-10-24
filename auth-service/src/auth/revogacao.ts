import { prisma } from '../prisma'
import type { RedisService } from '../redis/redis.service'

/**
 * Senha trocada ou redefinida: além das sessões (tokenVersion), derruba os PATs
 * e as conexões OAuth da conta. Sem isso, quem tivesse criado um PAT (até 365
 * dias) ou aprovado uma conexão (até 90 dias) seguia com acesso depois de o
 * dono recuperar a conta. `redis` limpa o cache de introspecção do gateway na
 * hora; sem ele, o cache expira sozinho em até 60 s.
 */
export async function revogarAcessosPersistentes(userId: string, redis?: Pick<RedisService, 'deleteApiTokenCache' | 'deleteOAuthCache'>) {
  const agora = new Date()
  const tokens = await prisma.apiToken.findMany({ where: { userId, revokedAt: null }, select: { id: true, tokenHash: true } })
  if (tokens.length) {
    await prisma.apiToken.updateMany({ where: { id: { in: tokens.map(t => t.id) } }, data: { revokedAt: agora } })
    if (redis) await Promise.all(tokens.map(t => redis.deleteApiTokenCache(t.tokenHash)))
  }

  const grants = await prisma.oAuthGrant.findMany({ where: { revokedAt: null, tenants: { some: { userId } } }, select: { id: true } })
  if (grants.length) {
    const ids = grants.map(g => g.id)
    await prisma.oAuthGrant.updateMany({ where: { id: { in: ids } }, data: { revokedAt: agora } })
    if (redis) {
      const access = await prisma.oAuthToken.findMany({ where: { grantId: { in: ids }, type: 'access' }, select: { tokenHash: true } })
      await redis.deleteOAuthCache(access.map(t => t.tokenHash))
    }
  }
  return { pats: tokens.length, conexoes: grants.length }
}

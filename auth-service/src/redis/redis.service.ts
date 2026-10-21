import { Injectable, ServiceUnavailableException, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import Redis from 'ioredis'

const SESSION_TTL = 7 * 24 * 60 * 60 // 7 days in seconds
const IS_DEV = process.env.NODE_ENV !== 'production'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis
  private cacheClient: Redis
  private available = true
  private readonly logger = new Logger(RedisService.name)

  onModuleInit() {
    this.client = new Redis({
      host: process.env.REDIS_HOST ?? 'redis-session',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
      connectTimeout: 2000,
      retryStrategy: IS_DEV ? () => null : undefined,
    })

    this.cacheClient = new Redis({
      host: process.env.REDIS_CACHE_HOST ?? 'redis-cache',
      port: Number(process.env.REDIS_CACHE_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 2000,
    })
    this.cacheClient.on('error', () => {})

    this.client.on('error', () => {
      if (this.available) {
        this.logger.warn('Redis indisponível — autenticação temporariamente indisponível')
        this.available = false
      }
    })

    this.client.on('ready', () => {
      this.available = true
      this.logger.log('Redis conectado')
    })
  }

  async onModuleDestroy() {
    await Promise.all([this.client.quit().catch(() => undefined), this.cacheClient.quit().catch(() => undefined)])
  }

  private async sessionOperation<T>(operation: () => Promise<T>, devFallback: T): Promise<T> {
    try {
      if (!this.available) throw new Error('unavailable')
      return await operation()
    } catch {
      if (IS_DEV) return devFallback
      throw new ServiceUnavailableException('Autenticação indisponível. Tente novamente.')
    }
  }

  async setSession(jti: string, payload: object): Promise<void> {
    await this.sessionOperation(async () => {
      await this.client.set(`session:${jti}`, JSON.stringify(payload), 'EX', SESSION_TTL)
    }, undefined)
  }

  async getSession(jti: string): Promise<object | null> {
    return this.sessionOperation(async () => {
      const raw = await this.client.get(`session:${jti}`)
      return raw ? JSON.parse(raw) as object : null
    }, { dev: true })
  }

  async deleteSession(jti: string): Promise<void> {
    await this.sessionOperation(async () => { await this.client.del(`session:${jti}`) }, undefined)
  }

  async incr(key: string): Promise<number> {
    if (!this.available) return 0
    return this.client.incr(key).catch(() => 0)
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (!this.available) return
    await this.client.expire(key, ttlSeconds).catch(() => undefined)
  }

  /** Incrementa contador e aplica TTL no primeiro acesso. Namespace gerenciado pelo caller. */
  async incrWithTTL(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.incr(key)
    if (count === 1) await this.expire(key, ttlSeconds)
    return count
  }

  /** Remove o contador anti-brute-force de validação de código para um usuário. */
  async delResetAttempts(userId: string): Promise<void> {
    if (!this.available) return
    await this.client.del(`reset_attempts:${userId}`).catch(() => undefined)
  }

  /**
   * Invalida o cache de introspecção de PAT no api-gateway (chave `pat:{tokenHash}`,
   * TTL 60s). Chamado ao revogar um token para que o efeito seja imediato, em vez
   * de esperar o cache expirar (SDD 5.3/5.4).
   */
  async deleteApiTokenCache(tokenHash: string): Promise<void> {
    await this.cacheClient.del(`pat:${tokenHash}`).catch(() => undefined)
  }

  /** Apaga a introspecção em cache no gateway (`oat:{hash}`) dos access tokens OAuth. */
  async deleteOAuthCache(tokenHashes: string[]): Promise<void> {
    if (tokenHashes.length === 0) return
    await this.cacheClient.del(...tokenHashes.map(h => `oat:${h}`)).catch(() => undefined)
  }
}

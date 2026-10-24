import { Controller, Get, Header, Headers, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common'
import { metrics } from '../telemetry'
import { Public } from '../decorators/public.decorator'
import { databaseReady, httpReady, redisReady } from './probes'
import { timingSafeEqual } from 'crypto'

/** Comparação em tempo constante (não vaza o tamanho do prefixo correto pelo tempo de resposta). */
function mesmoSegredo(recebido: string | undefined, esperado: string): boolean {
  if (typeof recebido !== 'string') return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() { return { status: 'ok' } }

  @Public()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4')
  metrics(@Headers('authorization') authorization: string) {
    if (!process.env.INTERNAL_API_KEY || !mesmoSegredo(authorization, `Bearer ${process.env.INTERNAL_API_KEY}`)) throw new UnauthorizedException()
    return metrics()
  }

  @Public()
  @Get('ready')
  async ready() {
    const checks = await Promise.all([databaseReady(), redisReady(process.env.REDIS_QUEUE_HOST ?? 'redis')])
    if (checks.some(ok => !ok)) throw new ServiceUnavailableException('Not ready')
    return { status: 'ready' }
  }
}

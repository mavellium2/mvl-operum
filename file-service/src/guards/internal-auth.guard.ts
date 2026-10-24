import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'
import { timingSafeEqual } from 'crypto'

/** Comparação em tempo constante (não vaza o tamanho do prefixo correto pelo tempo de resposta). */
function mesmoSegredo(recebido: string | undefined, esperado: string): boolean {
  if (typeof recebido !== 'string') return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (isPublic) return true

    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()
    const key = process.env.INTERNAL_API_KEY
    if (!key) return false
    return mesmoSegredo(req.headers['x-internal-api-key'], key)
  }
}

import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { prisma } from '../prisma'
import { timingSafeEqual } from 'crypto'

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()

    // Defense-in-depth: explicitly re-verify x-internal-api-key so this guard
    // cannot be satisfied even if InternalAuthGuard is misconfigured or bypassed.
    // x-user-id is only trusted when it arrives alongside a valid internal API key,
    // because the API gateway strips/overwrites x-user-id from external requests before
    // injecting it from the verified JWT payload.
    const internalKey = process.env.INTERNAL_API_KEY
    const recebida = Buffer.from(req.headers['x-internal-api-key'] ?? '')
    const esperada = Buffer.from(internalKey ?? '')
    if (!internalKey || recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) {
      throw new UnauthorizedException()
    }

    const userId = req.headers['x-user-id']
    if (!userId) throw new UnauthorizedException()

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true, deletedAt: true },
    })

    if (!user || user.deletedAt || !user.isActive) throw new UnauthorizedException()
    if (user.role !== 'admin') throw new ForbiddenException('Acesso restrito a administradores')

    return true
  }
}

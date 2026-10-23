import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'

/**
 * Bloqueia rotas de sessão/conta para Personal Access Tokens e tokens OAuth.
 *
 * x-auth-type só existe ('pat' ou 'oauth') quando o api-gateway autenticou a
 * requisição por introspecção de token (o gateway sempre descarta o valor
 * enviado pelo cliente). Sessões JWT não o enviam.
 * Sem este guard um PAT com escopo write poderia, por exemplo, chamar
 * /auth/switch-tenant e obter um JWT de sessão completo em outro tenant.
 * O gateway já barra essas rotas para PAT (allowlist); isto é defesa em profundidade.
 */
@Injectable()
export class NoPatGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>()
    if (req.headers['x-auth-type']) {
      throw new ForbiddenException('Operação não permitida com token de acesso')
    }
    return true
  }
}

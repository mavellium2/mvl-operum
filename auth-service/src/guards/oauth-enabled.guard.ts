import { Injectable, CanActivate, NotFoundException } from '@nestjs/common'
import { oauthEnabled } from '../oauth/oauth.config'

/**
 * Responde 404 nas rotas que iniciam uma conexão OAuth (metadados, registro,
 * token e consentimento) enquanto o OAuth não está configurado. Revogação,
 * introspecção e a lista de apps conectados seguem funcionando, para quem já
 * conectou poder desconectar.
 */
@Injectable()
export class OAuthEnabledGuard implements CanActivate {
  canActivate(): boolean {
    if (!oauthEnabled()) throw new NotFoundException()
    return true
  }
}

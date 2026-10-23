import {
  Body, Controller, Delete, Get, Headers, HttpCode, HttpStatus, Param, Post, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common'

/** Parte da resposta do Express usada aqui (o auth-service não depende de @types/express). */
interface Response {
  setHeader(name: string, value: string): void
  status(code: number): { json(body: unknown): unknown; end(): unknown }
}
import { Public } from '../decorators/public.decorator'
import { NoPatGuard } from '../guards/no-pat.guard'
import { OAuthEnabledGuard } from '../guards/oauth-enabled.guard'
import { authorizationServerMetadata } from './oauth.config'
import { OAuthError, OAuthService } from './oauth.service'
import {
  ApproveSchema, AuthorizeRequestSchema, IntrospectSchema, RegisterClientSchema, RevokeSchema, TokenRequestSchema,
} from './oauth.dto'

function noStore(res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Pragma', 'no-cache')
}

function sendOAuthError(res: Response, err: unknown) {
  noStore(res)
  if (err instanceof OAuthError) {
    return res.status(err.status).json({ error: err.error, error_description: err.description })
  }
  throw err
}

/**
 * Endpoints públicos do servidor de autorização (RFC 8414, 7591, 6749, 7009).
 * Chegam pelo api-gateway sem autenticação de sessão.
 */
@Controller()
export class OAuthPublicController {
  constructor(private readonly oauth: OAuthService) {}

  @Public()
  @Get('.well-known/oauth-authorization-server')
  @UseGuards(OAuthEnabledGuard)
  metadata(@Res({ passthrough: true }) res: Response) {
    res.setHeader('Cache-Control', 'public, max-age=300')
    return authorizationServerMetadata()
  }

  @Public()
  @Post('oauth/register')
  @UseGuards(OAuthEnabledGuard)
  async register(@Body() body: unknown, @Res() res: Response) {
    const parsed = RegisterClientSchema.safeParse(body)
    if (!parsed.success) return sendOAuthError(res, new OAuthError('invalid_client_metadata', 'Metadados do cliente inválidos'))
    try {
      noStore(res)
      return res.status(HttpStatus.CREATED).json(await this.oauth.register(parsed.data))
    } catch (err) {
      return sendOAuthError(res, err)
    }
  }

  @Public()
  @Post('oauth/token')
  @UseGuards(OAuthEnabledGuard)
  async token(@Body() body: unknown, @Res() res: Response) {
    const parsed = TokenRequestSchema.safeParse(body)
    if (!parsed.success) {
      const grant = (body as Record<string, unknown> | undefined)?.grant_type
      const error = grant === 'authorization_code' || grant === 'refresh_token' ? 'invalid_request' : 'unsupported_grant_type'
      return sendOAuthError(res, new OAuthError(error, 'Requisição de token inválida'))
    }
    try {
      const result = parsed.data.grant_type === 'authorization_code'
        ? await this.oauth.exchangeCode(parsed.data)
        : await this.oauth.refresh(parsed.data)
      noStore(res)
      return res.status(HttpStatus.OK).json(result)
    } catch (err) {
      return sendOAuthError(res, err)
    }
  }

  @Public()
  @Post('oauth/revoke')
  async revoke(@Body() body: unknown, @Res() res: Response) {
    const parsed = RevokeSchema.safeParse(body)
    if (!parsed.success) return sendOAuthError(res, new OAuthError('invalid_request', 'token ausente'))
    await this.oauth.revokeToken(parsed.data.token)
    noStore(res)
    return res.status(HttpStatus.OK).end()
  }

  // Só `x-internal-api-key` (InternalAuthGuard global) — sem @Public().
  // O gateway bloqueia esta rota para quem vem de fora (BLOCKED_PATHS).
  @Post('oauth/introspect')
  @HttpCode(HttpStatus.OK)
  async introspect(@Body() body: unknown) {
    const dto = IntrospectSchema.parse(body)
    return this.oauth.introspect(dto.token)
  }
}

/**
 * Endpoints da tela de consentimento e de "apps conectados". Exigem sessão de
 * usuário (JWT): PAT e token OAuth são recusados no gateway e pelo NoPatGuard.
 */
@Controller('auth/oauth')
@UseGuards(NoPatGuard)
export class OAuthSessionController {
  constructor(private readonly oauth: OAuthService) {}

  @Post('authorize/check')
  @UseGuards(OAuthEnabledGuard)
  @HttpCode(HttpStatus.OK)
  async check(@Headers('x-user-id') userId: string, @Body() body: unknown) {
    if (!userId) throw new UnauthorizedException()
    return this.oauth.checkAuthorize(AuthorizeRequestSchema.parse(body), userId)
  }

  @Post('authorize/approve')
  @UseGuards(OAuthEnabledGuard)
  @HttpCode(HttpStatus.OK)
  async approve(@Headers('x-user-id') userId: string, @Body() body: unknown) {
    if (!userId) throw new UnauthorizedException()
    const dto = ApproveSchema.parse(body)
    return this.oauth.approve(dto.request, userId, dto.tenantIds, dto.allowWrite)
  }

  @Post('authorize/deny')
  @UseGuards(OAuthEnabledGuard)
  @HttpCode(HttpStatus.OK)
  async deny(@Headers('x-user-id') userId: string, @Body() body: unknown) {
    if (!userId) throw new UnauthorizedException()
    return this.oauth.deny(AuthorizeRequestSchema.parse(body), userId)
  }

  @Get('grants')
  async grants(@Headers('x-user-id') userId: string) {
    if (!userId) throw new UnauthorizedException()
    return this.oauth.listGrants(userId)
  }

  @Delete('grants/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeGrant(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    if (!userId) throw new UnauthorizedException()
    await this.oauth.revokeGrantForUser(id, userId)
  }
}

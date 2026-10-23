import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  Param,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common'
import { ApiTokensService } from './api-tokens.service'
import { CreateApiTokenSchema } from './dto/create-api-token.dto'
import { IntrospectApiTokenSchema } from './dto/introspect-api-token.dto'

@Controller('auth/api-tokens')
export class ApiTokensController {
  constructor(private readonly apiTokensService: ApiTokensService) {}

  // Um PAT não pode gerenciar PATs (evita token criando/revogando token).
  // x-auth-type só existe quando o api-gateway autenticou a requisição via
  // introspecção de PAT (Fase 1b) — sessões JWT normais não o enviam.
  private assertNotPat(authType: string | undefined): void {
    if (authType) throw new ForbiddenException('Tokens de acesso não podem gerenciar outros tokens')
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Headers('x-user-id') userId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-auth-type') authType: string | undefined,
    @Body() body: unknown,
  ) {
    if (!userId || !tenantId) throw new UnauthorizedException()
    this.assertNotPat(authType)
    const dto = CreateApiTokenSchema.parse(body)
    return this.apiTokensService.create(userId, tenantId, dto)
  }

  @Get()
  async list(
    @Headers('x-user-id') userId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-auth-type') authType: string | undefined,
  ) {
    if (!userId || !tenantId) throw new UnauthorizedException()
    this.assertNotPat(authType)
    return this.apiTokensService.list(userId, tenantId)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @Headers('x-user-id') userId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-auth-type') authType: string | undefined,
    @Param('id') id: string,
  ) {
    if (!userId || !tenantId) throw new UnauthorizedException()
    this.assertNotPat(authType)
    await this.apiTokensService.revoke(id, userId, tenantId)
  }

  // Somente `x-internal-api-key` (InternalAuthGuard global) — sem @Public().
  // O gateway não deve expor esta rota publicamente na Fase 1b.
  @Post('introspect')
  @HttpCode(HttpStatus.OK)
  async introspect(@Body() body: unknown) {
    const dto = IntrospectApiTokenSchema.parse(body)
    return this.apiTokensService.introspect(dto.token)
  }
}

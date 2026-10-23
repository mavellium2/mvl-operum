import { Controller, Get, Post, Body, Query, Headers, BadRequestException } from '@nestjs/common'
import { TenantId } from '../common/tenant-scope'
import { AuditService } from './audit.service'

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(
    @TenantId() tenantId: string,
    @Query('entity') entity?: string,
    @Query('entityId') entityId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, Number(page) || 1)
    const limitNum = Math.min(200, Math.max(1, Number(limit) || 50))
    return this.auditService.list(tenantId, entity, entityId, pageNum, limitNum)
  }

  @Post()
  log(
    @TenantId() tenantId: string,
    @Headers('x-user-id') userId: string,
    @Headers('x-auth-type') authType: string | undefined,
    @Headers('x-api-token-id') apiTokenId: string | undefined,
    @Body() body: { action: string; entity: string; entityId?: string; details?: object },
  ) {
    if (!body.action || !body.entity) throw new BadRequestException('action e entity são obrigatórios')
    // authType/apiTokenId vêm do gateway (não do cliente) e sobrescrevem o que vier em details.
    const details = authType === 'pat' || authType === 'oauth' ? { ...body.details, authType, apiTokenId } : body.details
    return this.auditService.log(tenantId, userId || undefined, body.action, body.entity, body.entityId, details)
  }
}

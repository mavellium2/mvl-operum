import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  Headers,
  ForbiddenException,
} from '@nestjs/common'
import { NotificationService } from './notification.service'
import { CreateNotificationSchema } from './dto/create-notification.dto'

/**
 * Quem chega pelo api-gateway traz `x-user-id` verificado (o gateway apaga o
 * valor enviado pelo cliente): o escopo é sempre esse usuário, e o `userId` de
 * query/body é ignorado. Sem o cabeçalho, a chamada é interna e direta
 * (sprint-service, app) e informa o destinatário.
 */
function escopo(headerUserId: string | undefined, informado: string | undefined): string | undefined {
  return headerUserId || informado
}

@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Post()
  async create(@Headers('x-user-id') headerUserId: string | undefined, @Body() body: unknown) {
    // Criar notificação para outra pessoa é só da fila/serviços internos.
    if (headerUserId) throw new ForbiddenException()
    const dto = CreateNotificationSchema.parse(body)
    return this.service.create(dto)
  }

  @Get()
  async findAll(
    @Headers('x-user-id') headerUserId: string | undefined,
    @Query('userId') userId: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const dono = escopo(headerUserId, userId)
    if (!dono) return []
    return this.service.findAllByUser(dono, status, limit ? Number(limit) : undefined)
  }

  @Get('count')
  async count(@Headers('x-user-id') headerUserId: string | undefined, @Query('userId') userId: string) {
    const dono = escopo(headerUserId, userId)
    if (!dono) return { count: 0 }
    const count = await this.service.countUnread(dono)
    return { count }
  }

  @Patch('mark-all-read')
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Headers('x-user-id') headerUserId: string | undefined, @Body() body: { userId?: string }) {
    const dono = escopo(headerUserId, body?.userId)
    if (!dono) {
      return { count: 0 }
    }
    const result = await this.service.markAllAsRead(dono)
    return { count: result.count }
  }

  @Get(':id')
  async findOne(@Headers('x-user-id') headerUserId: string | undefined, @Param('id') id: string) {
    return this.service.findById(id, headerUserId)
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Headers('x-user-id') headerUserId: string | undefined, @Param('id') id: string) {
    return this.service.markAsRead(id, headerUserId)
  }

  @Patch(':id/archive')
  @HttpCode(HttpStatus.OK)
  async markAsArchived(@Headers('x-user-id') headerUserId: string | undefined, @Param('id') id: string) {
    return this.service.markAsArchived(id, headerUserId)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Headers('x-user-id') headerUserId: string | undefined, @Param('id') id: string) {
    await this.service.softDelete(id, headerUserId)
  }
}

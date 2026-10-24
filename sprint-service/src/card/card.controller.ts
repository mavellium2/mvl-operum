import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
} from '@nestjs/common'
import { TenantId } from '../common/tenant-scope'
import { CardService, CardsInTenantSchema, CreateCardSchema, UpdateCardSchema } from './card.service'


@Controller()
export class CardController {
  constructor(@Inject(CardService) private readonly cardService: CardService) {}

  @Get('cards/page')
  listPage(@TenantId() tenantId: string, @Query() query: Record<string, unknown>) {
    return this.cardService.listPage(tenantId, query)
  }

  @Get('sprints/:sprintId/cards')
  listBySprint(@TenantId() tenantId: string, @Param('sprintId') sprintId: string) {
    return this.cardService.listBySprint(tenantId, sprintId)
  }

  @Get('cards/backlog')
  listBacklog(@TenantId() tenantId: string, @Query('projectId') projectId: string) {
    if (!projectId) throw new BadRequestException('projectId é obrigatório')
    return this.cardService.listBacklog(tenantId, projectId)
  }

  // Declarada ANTES de @Get('cards/:id') para não colidir com o parâmetro
  // dinâmico (senão "search" vira o :id e cai em findOne).
  @Get('cards/search')
  search(
    @TenantId() tenantId: string,
    @Headers('x-authorized-projects') authorized?: string,
    @Query('q') q?: string,
    @Query('sprintId') sprintId?: string,
    @Query('projectId') projectId?: string,
    @Query('inProjectId') inProjectId?: string,
    @Query('responsibleUserId') responsibleUserId?: string,
  ) {
    const text = q?.trim() ?? ''
    // Sem texto só é permitido listando os cards de uma pessoa num projeto
    // (busca "cards de <pessoa>"); senão a consulta traria o tenant inteiro.
    const porPessoa = !!responsibleUserId && !!inProjectId
    if (!porPessoa && text.length < 2) throw new BadRequestException('q é obrigatório (mínimo 2 caracteres)')
    return this.cardService.search(tenantId, text, { sprintId, projectId, inProjectId, responsibleUserId, authorized: authorized?.split(',') })
  }

  // Antes das rotas com :id. Só devolve ids do próprio tenant, então pode
  // ficar exposta pelo gateway sem vazar nada.
  @Post('cards/in-tenant')
  @HttpCode(HttpStatus.OK)
  idsInTenant(@TenantId() tenantId: string, @Body() body: unknown) {
    const parsed = CardsInTenantSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message)
    return this.cardService.idsInTenant(tenantId, parsed.data.ids)
  }

  @Get('cards/:id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.cardService.findOne(tenantId, id)
  }

  @Post('cards')
  create(@TenantId() tenantId: string, @Body() body: unknown) {
    const parsed = CreateCardSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message)
    return this.cardService.create(tenantId, parsed.data)
  }

  @Get('cards/:id/movements')
  listMovements(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.cardService.listMovements(tenantId, id)
  }

  @Patch('cards/:id')
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('x-user-id') userId?: string,
  ) {
    const parsed = UpdateCardSchema.safeParse({ ...(body as object), userId })
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message)
    return this.cardService.update(tenantId, id, parsed.data)
  }

  @Delete('cards/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.cardService.remove(tenantId, id)
  }

  @Post('cards/:id/tags/:tagId')
  addTag(@TenantId() tenantId: string, @Param('id') cardId: string, @Param('tagId') tagId: string) {
    return this.cardService.addTag(tenantId, cardId, tagId)
  }

  @Delete('cards/:id/tags/:tagId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTag(@TenantId() tenantId: string, @Param('id') cardId: string, @Param('tagId') tagId: string) {
    return this.cardService.removeTag(tenantId, cardId, tagId)
  }

  @Post('cards/:id/responsibles/:userId')
  addResponsible(@TenantId() tenantId: string, @Param('id') cardId: string, @Param('userId') userId: string) {
    return this.cardService.addResponsible(tenantId, cardId, userId)
  }

  @Delete('cards/:id/responsibles/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeResponsible(@TenantId() tenantId: string, @Param('id') cardId: string, @Param('userId') userId: string) {
    return this.cardService.removeResponsible(tenantId, cardId, userId)
  }

  @Get('tags')
  listTags(@TenantId() tenantId: string) {
    return this.cardService.listTags(tenantId)
  }

  @Post('tags')
  createTag(
    @TenantId() tenantId: string,
    @Headers('x-user-id') userId: string,
    @Body() body: { name: string; color?: string },
  ) {
    if (!body.name) throw new BadRequestException('name é obrigatório')
    return this.cardService.createTag(tenantId, userId, body.name, body.color)
  }

  @Delete('tags/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTag(
    @TenantId() tenantId: string,
    @Headers('x-user-id') userId: string,
    @Headers('x-user-role') role: string | undefined,
    @Param('id') tagId: string,
  ) {
    return this.cardService.deleteTag(tenantId, tagId, { userId, isAdmin: role === 'admin' })
  }
}

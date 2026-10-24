import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { ProjectService, CreateProjectSchema, UpdateProjectSchema, AddMemberSchema } from './project.service'

@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  list(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-authorized-projects') authorized?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.projectService.list(tenantId, Number(page ?? 1), Number(limit ?? 20), authorized?.split(','))
  }

  @Get('user/:userId')
  getUserProjects(
    @Param('userId') userId: string,
    @Headers('x-user-id') requesterId: string,
    @Headers('x-user-role') requesterRole: string,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-authorized-projects') authorized?: string,
  ) {
    // O gateway injeta x-user-id/x-user-role a partir do token já verificado —
    // sem esta checagem, qualquer chamador autenticado no tenant poderia listar
    // os projetos de outro usuário só trocando o :userId na URL.
    if (userId !== requesterId && requesterRole !== 'admin') {
      throw new ForbiddenException('Você só pode consultar os próprios projetos')
    }
    return this.projectService.getUserActiveProjects(userId, tenantId, authorized?.split(','))
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string, @Headers('x-redact-project-documents') redact?: string) {
    const project = await this.projectService.findOne(id, tenantId)
    return redact === 'true' ? this.projectService.withoutDocuments(project) : project
  }

  @Post()
  create(@Body() body: unknown, @Headers('x-tenant-id') tenantId: string) {
    const parsed = CreateProjectSchema.safeParse({ ...(body as object), tenantId })
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message)
    return this.projectService.create(parsed.data)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string, @Body() body: unknown) {
    const parsed = UpdateProjectSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message)
    return this.projectService.update(id, tenantId, parsed.data)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string) {
    return this.projectService.remove(id, tenantId)
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string) {
    return this.projectService.getMembers(id, tenantId)
  }

  @Post(':id/members')
  addMember(
    @Param('id') projectId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: unknown,
  ) {
    const parsed = AddMemberSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message ?? 'userId é obrigatório')
    const { userId, ...data } = parsed.data
    return this.projectService.addMember(projectId, tenantId, userId, data)
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    return this.projectService.removeMember(projectId, tenantId, userId)
  }

  @Patch(':id/members/:userId/situacao')
  setMemberSituacao(
    @Param('id') projectId: string,
    @Param('userId') userId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { ativo?: unknown; motivo?: unknown },
  ) {
    if (typeof body?.ativo !== 'boolean') throw new BadRequestException('ativo deve ser true ou false')
    if (body.motivo !== undefined && typeof body.motivo !== 'string') throw new BadRequestException('motivo deve ser texto')
    return this.projectService.setMemberSituacao(projectId, tenantId, userId, body.ativo, body.motivo as string | undefined)
  }

  @Patch(':id/members/reorder')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderMembers(
    @Param('id') projectId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: { orderedUserIds: string[] },
  ) {
    return this.projectService.reorderMembers(projectId, tenantId, body.orderedUserIds)
  }

  @Get(':id/macro-fases')
  listMacroFases(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string) {
    return this.projectService.listMacroFases(id, tenantId)
  }

  @Post(':id/macro-fases')
  upsertMacroFases(
    @Param('id') projectId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: unknown,
  ) {
    return this.projectService.upsertMacroFase(projectId, tenantId, body && typeof body === 'object' && 'fases' in body ? body.fases : undefined)
  }
}

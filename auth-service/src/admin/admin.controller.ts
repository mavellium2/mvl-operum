import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  UseGuards,
  BadRequestException,
} from '@nestjs/common'
import { AdminService } from './admin.service'
import { NoPatGuard } from '../guards/no-pat.guard'
import { AdminCreateUserSchema, AdminUpdateUserSchema } from './admin.dto'

@Controller('auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  listUsers(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-role') role: string,
  ) {
    return this.adminService.listUsers(tenantId, role)
  }

  @Post('admin/users')
  @UseGuards(NoPatGuard)
  @HttpCode(HttpStatus.CREATED)
  createUser(
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-role') role: string,
    @Body() body: unknown,
  ) {
    return this.adminService.createUser(tenantId, role, AdminCreateUserSchema.parse(body))
  }

  @Patch('admin/users/:id')
  @UseGuards(NoPatGuard)
  updateUser(
    @Param('id') userId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-role') role: string,
    @Body() body: unknown,
  ) {
    return this.adminService.updateUser(userId, tenantId, role, AdminUpdateUserSchema.parse(body))
  }

  @Patch('admin/users/:id/active')
  @UseGuards(NoPatGuard)
  toggleActive(
    @Param('id') userId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-role') role: string,
    @Body() body: { active?: unknown },
  ) {
    if (typeof body?.active !== 'boolean') throw new BadRequestException('active deve ser booleano')
    return this.adminService.toggleActive(userId, tenantId, role, body.active)
  }

  @Patch('admin/users/:id/role')
  @UseGuards(NoPatGuard)
  setRole(
    @Param('id') userId: string,
    @Headers('x-tenant-id') tenantId: string,
    @Headers('x-user-role') role: string,
    @Body() body: { role?: unknown },
  ) {
    if (typeof body?.role !== 'string') throw new BadRequestException('role inválida')
    return this.adminService.setRole(userId, tenantId, role, body.role)
  }

  @Get('all-users')
  listAllForTenant(@Headers('x-tenant-id') tenantId: string) {
    // Sem tenant o filtro do Prisma vira `undefined` e listaria usuários de todos os tenants.
    if (!tenantId) throw new UnauthorizedException()
    return this.adminService.listAllForTenant(tenantId)
  }
}

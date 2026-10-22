import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common'
import { AuthService } from './auth.service'
import { JwtService } from './jwt.service'
import { Public } from '../decorators/public.decorator'
import { AdminGuard } from '../guards/admin.guard'
import { NoPatGuard } from '../guards/no-pat.guard'
import { LoginSchema } from './dto/login.dto'
import { RegisterSchema } from './dto/register.dto'
import {
  ChangePasswordSchema,
  RequestResetSchema,
  ValidateCodeSchema,
  ResetPasswordSchema,
  AlterarSenhaSchema,
} from './dto/password.dto'
import { SwitchTenantSchema } from './dto/switch-tenant.dto'
import { JoinTenantSchema } from './dto/join-tenant.dto'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown) {
    const dto = LoginSchema.parse(body)
    return this.authService.login(dto, dto.subdomain)
  }

  // register is admin-only — protected by InternalAuthGuard (x-internal-api-key)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() body: unknown) {
    const dto = RegisterSchema.parse(body)
    return this.authService.register(dto)
  }

  @Post('logout')
  @UseGuards(NoPatGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Headers('authorization') authorization: string) {
    const token = authorization?.replace('Bearer ', '')
    if (!token) return
    const payload = await this.jwtService.verify(token)
    if (payload?.jti) {
      await this.authService.logout(payload.jti)
    }
  }

  @Get('me')
  async me(@Headers('x-user-id') userId: string) {
    if (!userId) throw new UnauthorizedException()
    return this.authService.me(userId)
  }

  @Public()
  @Get('verify')
  async verify(@Headers('authorization') authorization: string) {
    const token = authorization?.replace('Bearer ', '')
    if (!token) throw new UnauthorizedException('Token ausente')
    return this.authService.verify(token)
  }

  @Post('password/request-reset')
  @Public()
  @HttpCode(HttpStatus.OK)
  async requestReset(@Body() body: unknown) {
    const dto = RequestResetSchema.parse(body)
    return this.authService.requestPasswordReset(dto)
  }

  @Post('password/validate-code')
  @Public()
  @HttpCode(HttpStatus.OK)
  async validateCode(@Body() body: unknown) {
    const dto = ValidateCodeSchema.parse(body)
    return this.authService.validateResetCode(dto)
  }

  @Post('password/reset')
  @Public()
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() body: unknown) {
    const dto = ResetPasswordSchema.parse(body)
    return this.authService.resetPassword(dto)
  }

  @Post('password/change')
  @UseGuards(NoPatGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Headers('x-user-id') userId: string,
    @Body() body: unknown,
  ) {
    if (!userId) throw new UnauthorizedException()
    const dto = ChangePasswordSchema.parse(body)
    await this.authService.changePassword(userId, dto)
  }

  @Patch('me')
  @UseGuards(NoPatGuard)
  async updateProfile(
    @Headers('x-user-id') userId: string,
    @Body() body: Record<string, unknown>,
  ) {
    if (!userId) throw new UnauthorizedException()
    return this.authService.updateProfile(userId, body as Parameters<AuthService['updateProfile']>[1])
  }

  // Endpoint for forced password change (forcePasswordChange flow)
  @Post('password/alterar')
  @UseGuards(NoPatGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async alterarSenha(
    @Headers('x-user-id') userId: string,
    @Body() body: unknown,
  ) {
    if (!userId) throw new UnauthorizedException()
    const dto = AlterarSenhaSchema.parse(body)
    await this.authService.alterarSenha(userId, dto.password)
  }

  @Get('my-tenants')
  async myTenants(
    @Headers('x-user-id') userId: string,
    @Headers('x-auth-type') authType: string | undefined,
    @Headers('x-oauth-tenants') oauthTenants: string | undefined,
  ) {
    if (!userId) throw new UnauthorizedException()
    const tenants = await this.authService.getMyTenants(userId)
    // Conexão OAuth: só os workspaces autorizados no consentimento (o gateway
    // define x-oauth-tenants a partir da introspecção e descarta o do cliente).
    if (authType === 'oauth') {
      const granted = new Set((oauthTenants ?? '').split(',').filter(Boolean))
      return tenants.filter(t => granted.has(t.tenantId))
    }
    return tenants
  }

  @Post('switch-tenant')
  @UseGuards(NoPatGuard)
  @HttpCode(HttpStatus.OK)
  async switchTenant(
    @Headers('x-user-id') userId: string,
    @Body() body: unknown,
  ) {
    if (!userId) throw new UnauthorizedException()
    const dto = SwitchTenantSchema.parse(body)
    return this.authService.switchTenant(userId, dto.targetTenantId)
  }

  @Post('join-tenant')
  @UseGuards(NoPatGuard)
  @HttpCode(HttpStatus.OK)
  async joinTenant(
    @Headers('x-user-id') userId: string,
    @Body() body: unknown,
  ) {
    if (!userId) throw new UnauthorizedException()
    const dto = JoinTenantSchema.parse(body)
    return this.authService.joinTenant(userId, dto.tenantId, dto.password)
  }

  @Post('provision-tenant-admin')
  @HttpCode(HttpStatus.OK)
  @UseGuards(NoPatGuard, AdminGuard)
  async provisionTenantAdmin(
    @Headers('x-user-id') userId: string,
    @Body() body: { tenantId: string },
  ) {
    if (!body?.tenantId?.trim()) throw new BadRequestException('tenantId é obrigatório')
    return this.authService.provisionTenantAdmin(userId, body.tenantId.trim())
  }
}

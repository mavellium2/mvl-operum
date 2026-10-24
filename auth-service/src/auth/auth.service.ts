import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common'
import { prisma } from '../prisma'
import bcrypt from 'bcryptjs'
import { JwtService } from './jwt.service'
import { RedisService } from '../redis/redis.service'
import { MailerService } from '../mailer/mailer.service'
import { generateResetCode, hashResetCode, compareResetCode } from '../lib/crypto'
import type { UpdateProfileDto } from './dto/update-profile.dto'
import { contasVinculadas, mesmaIdentidade, vincularContas, identidade } from './identity'
import { revogarAcessosPersistentes } from './revogacao'
import type { LoginDto } from './dto/login.dto'
import type { RegisterDto } from './dto/register.dto'
import type { ChangePasswordDto, RequestResetDto, ValidateCodeDto, ResetPasswordDto } from './dto/password.dto'

const BCRYPT_ROUNDS = 12
const MAX_LOGIN_ATTEMPTS = 10
const RESET_CODE_TTL_SECONDS = 15 * 60
const RESET_CODE_TTL_MS = RESET_CODE_TTL_SECONDS * 1000
const RATE_LIMIT_MAX = 3
const MAX_VALIDATE_ATTEMPTS = 5

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    private readonly mailer: MailerService,
  ) {}

  async login(dto: LoginDto, subdomain?: string) {
    // Subdomínio informado E resolvido para um tenant ACTIVE: escopo estrito a ele.
    const tenant = subdomain
      ? await prisma.tenant.findFirst({ where: { subdomain, status: 'ACTIVE' } })
      : null

    if (tenant) {
      const user = await prisma.user.findFirst({
        where: { email: dto.email, tenantId: tenant.id, deletedAt: null },
      })
      return this.completeLogin(user, dto.password)
    }

    // Sem tenant resolvido — ausente OU presente mas sem correspondência.
    // A infra atual (Traefik) usa um Host fixo por ambiente (ex.: a própria
    // "operum.mavellium.com.br" em produção), sem wildcard DNS por tenant.
    // getSubdomain() lê o primeiro rótulo desse Host mesmo quando ele não é
    // um subdomínio de tenant de verdade — então "subdomain presente" não
    // pode ser tratado como sinal confiável de tenant inválido. Resolve pelo
    // e-mail; o mesmo e-mail pode existir em mais de um tenant (federação via
    // joinTenant/provisionTenantAdmin), cada um com sua própria senha — por
    // isso testamos a senha contra cada candidato em vez de confiar num
    // findFirst arbitrário, o que poderia autenticar no tenant errado.
    // Ordenado por lastLogin desc (tenant acessado mais recentemente primeiro);
    // quem nunca acessou nenhum tenant vai por último (qualquer um serve).
    const candidates = await prisma.user.findMany({
      where: { email: dto.email, deletedAt: null, tenant: { status: 'ACTIVE' } },
      orderBy: { lastLogin: { sort: 'desc', nulls: 'last' } },
    })

    if (candidates.length <= 1) {
      return this.completeLogin(candidates[0] ?? null, dto.password)
    }

    const testados: string[] = []
    for (const candidate of candidates) {
      if (!candidate.isActive || candidate.status !== 'active') continue
      if ((candidate.loginAttempts ?? 0) >= MAX_LOGIN_ATTEMPTS) continue
      testados.push(candidate.id)
      if (await bcrypt.compare(dto.password, candidate.passwordHash)) {
        await prisma.user.update({
          where: { id: candidate.id },
          data: { lastLogin: new Date(), loginAttempts: 0 },
        })
        return this.buildLoginResponse(candidate)
      }
    }

    // Senha errada conta tentativa em todas as contas testadas; antes, e-mails
    // com conta em mais de uma instituição nunca chegavam ao bloqueio.
    if (testados.length) {
      await prisma.user.updateMany({ where: { id: { in: testados } }, data: { loginAttempts: { increment: 1 } } })
    }
    throw new UnauthorizedException('Credenciais inválidas')
  }

  /** Valida senha/status para um único candidato já resolvido e finaliza o login. */
  private async completeLogin(
    user: Awaited<ReturnType<typeof prisma.user.findFirst>>,
    password: string,
  ) {
    if (!user) throw new UnauthorizedException('Credenciais inválidas')

    const bloqueada = (user.loginAttempts ?? 0) >= MAX_LOGIN_ATTEMPTS
    const match = await bcrypt.compare(password, user.passwordHash)
    if (!match) {
      // Mesma resposta para conta inexistente, inativa ou bloqueada: o motivo só
      // aparece para quem acertou a senha (não revela que o e-mail tem conta).
      if (!bloqueada && user.isActive && user.status === 'active') {
        await prisma.user.update({
          where: { id: user.id },
          data: { loginAttempts: { increment: 1 } },
        })
      }
      throw new UnauthorizedException('Credenciais inválidas')
    }

    if (!user.isActive || user.status !== 'active') {
      throw new UnauthorizedException('Conta inativa ou bloqueada')
    }

    if (bloqueada) {
      throw new UnauthorizedException('Conta bloqueada por excesso de tentativas. Contate o suporte.')
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date(), loginAttempts: 0 },
    })

    return this.buildLoginResponse(user)
  }

  private async buildLoginResponse(user: NonNullable<Awaited<ReturnType<typeof prisma.user.findFirst>>>) {
    const { token, jti } = await this.jwtService.sign({
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      tokenVersion: user.tokenVersion,
    })

    await this.redis.setSession(jti, {
      userId: user.id,
      tenantId: user.tenantId,
      role: user.role,
      tokenVersion: user.tokenVersion,
    })

    return {
      token,
      forcePasswordChange: user.forcePasswordChange,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        avatarUrl: user.avatarUrl,
      },
    }
  }

  async register(dto: RegisterDto) {
    const existing = await prisma.user.findFirst({
      where: { email: dto.email, tenantId: dto.tenantId, deletedAt: null },
    })
    if (existing) throw new ConflictException('Email já cadastrado')

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS)
    const user = await prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash,
        tenantId: dto.tenantId,
        role: dto.role ?? 'member',
        forcePasswordChange: dto.forcePasswordChange ?? false,
      },
    })

    const { passwordHash: _, ...safeUser } = user
    return safeUser
  }

  async logout(jti: string) {
    await this.redis.deleteSession(jti)
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        tenantId: true,
        avatarUrl: true,
        signatureUrl: true,
        cargo: true,
        departamento: true,
        hourlyRate: true,
        isActive: true,
        forcePasswordChange: true,
        platformOperator: true,
        phone: true,
        cep: true,
        logradouro: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        estado: true,
        notes: true,
        createdAt: true,
      },
    })
    if (!user) throw new NotFoundException('Usuário não encontrado')
    return user
  }

  async verify(token: string) {
    const payload = await this.jwtService.verify(token)
    if (!payload || !payload.jti || !payload.userId || !payload.tenantId) throw new UnauthorizedException('Token inválido')

    if (payload.jti) {
      const session = await this.redis.getSession(payload.jti)
      if (!session) throw new UnauthorizedException('Sessão inválida ou expirada')
    }

    let user
    try {
      user = await prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, tenantId: true, role: true, tokenVersion: true, isActive: true, status: true, deletedAt: true, tenant: { select: { status: true } } },
      })
    } catch {
      throw new ServiceUnavailableException('Autenticação indisponível. Tente novamente.')
    }

    if (!user || user.deletedAt || !user.isActive || user.status !== 'active' || user.tenantId !== payload.tenantId || user.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Usuário inativo ou removido')
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Sessão invalidada')
    }

    return { userId: user.id, tenantId: user.tenantId, role: user.role }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Usuário não encontrado')

    const match = await bcrypt.compare(dto.currentPassword, user.passwordHash)
    if (!match) throw new ForbiddenException('Senha atual incorreta')

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS)
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    })
    await revogarAcessosPersistentes(userId, this.redis)
  }

  async alterarSenha(userId: string, newPassword: string) {
    // Sem a senha atual: só vale na troca obrigatória (primeiro acesso / senha
    // redefinida). Fora dela, uma sessão roubada trocaria a senha e trancaria o dono.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { forcePasswordChange: true } })
    if (!user?.forcePasswordChange) {
      throw new ForbiddenException('Use "Alterar senha" informando a senha atual')
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        forcePasswordChange: false,
        tokenVersion: { increment: 1 },
      },
    })
    await revogarAcessosPersistentes(userId, this.redis)
  }

  private async resolveTenant(subdomain?: string) {
    return prisma.tenant.findFirst({
      where: { ...(subdomain ? { subdomain } : {}), status: 'ACTIVE' },
    })
  }

  async requestPasswordReset(dto: RequestResetDto) {
    // Rate limit: 3 solicitações por e-mail a cada 15 min
    const rateKey = `reset_rate:${dto.email}`
    const attempts = await this.redis.incrWithTTL(rateKey, RESET_CODE_TTL_SECONDS)
    if (attempts > RATE_LIMIT_MAX) {
      throw new HttpException(
        { success: false, error: 'Muitas solicitações. Aguarde 15 minutos.' },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    // Sempre responde sucesso — anti-enumeração
    try {
      const tenant = await this.resolveTenant(dto.subdomain)
      const user = tenant
        ? await prisma.user.findFirst({
            where: { email: dto.email, tenantId: tenant.id, deletedAt: null, isActive: true },
          })
        : null

      if (user) {
        const code = generateResetCode()
        const expiry = new Date(Date.now() + RESET_CODE_TTL_MS)
        await prisma.user.update({
          where: { id: user.id },
          data: {
            resetToken: hashResetCode(code),
            resetTokenExpiry: expiry,
          },
        })
        // Zera tentativas de validação para o novo código
        await this.redis.delResetAttempts(user.id)

        const tenantName = tenant?.name ?? 'Operum'
        // Falha de envio é capturada dentro do mailer — nunca vaza para o cliente
        await this.mailer.sendPasswordResetCode(dto.email, code, tenantName)
      } else {
        // Anti-enumeração: executa bcrypt dummy para equalizar o tempo de resposta
        await bcrypt.hash('dummy-anti-enum', BCRYPT_ROUNDS)
      }
    } catch (err) {
      // Erros internos não chegam ao cliente (anti-enumeração)
      if (err instanceof HttpException) throw err
      this.logger.error('requestPasswordReset internal error', err)
    }

    return { success: true, message: 'Se o e-mail estiver cadastrado, você receberá um código.' }
  }

  async validateResetCode(dto: ValidateCodeDto) {
    const tenant = await this.resolveTenant(dto.subdomain)
    const user = tenant
      ? await prisma.user.findFirst({
          where: { email: dto.email, tenantId: tenant.id, deletedAt: null },
        })
      : await prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } })

    if (!user || !user.resetToken || !user.resetTokenExpiry) {
      throw new HttpException(
        { success: false, error: 'Código inválido ou expirado.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    // Anti-brute-force: max 5 tentativas por código emitido
    const attemptsKey = `reset_attempts:${user.id}`
    const attempts = await this.redis.incrWithTTL(attemptsKey, RESET_CODE_TTL_SECONDS)
    if (attempts > MAX_VALIDATE_ATTEMPTS) {
      // Invalida o código atual para forçar nova solicitação
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: null, resetTokenExpiry: null },
      })
      throw new HttpException(
        { success: false, error: 'Código inválido ou expirado.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const expired = user.resetTokenExpiry < new Date()
    const valid = !expired && compareResetCode(dto.code, user.resetToken)

    if (!valid) {
      throw new HttpException(
        { success: false, error: 'Código inválido ou expirado.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    // Código válido — NÃO consome aqui; só a Etapa 3 consome
    return { success: true }
  }

  async updateProfile(userId: string, data: UpdateProfileDto) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException('Usuário não encontrado')
    return prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true, name: true, email: true, role: true, tenantId: true, avatarUrl: true, signatureUrl: true,
        cargo: true, departamento: true, hourlyRate: true, isActive: true, forcePasswordChange: true,
        phone: true, cep: true, logradouro: true, numero: true, complemento: true,
        bairro: true, cidade: true, estado: true, notes: true,
      },
    })
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tenant = await this.resolveTenant(dto.subdomain)
    const user = tenant
      ? await prisma.user.findFirst({
          where: { email: dto.email, tenantId: tenant.id, deletedAt: null },
        })
      : await prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } })

    // Mesmo contador da Etapa 2: chamar só a Etapa 3 não dá tentativas ilimitadas.
    if (user?.resetToken) {
      const attempts = await this.redis.incrWithTTL(`reset_attempts:${user.id}`, RESET_CODE_TTL_SECONDS)
      if (attempts > MAX_VALIDATE_ATTEMPTS) {
        await prisma.user.update({ where: { id: user.id }, data: { resetToken: null, resetTokenExpiry: null } })
        throw new HttpException({ success: false, error: 'Código inválido ou expirado.' }, HttpStatus.BAD_REQUEST)
      }
    }

    // Re-valida o código (não confia que a Etapa 2 passou)
    const invalid =
      !user ||
      !user.resetToken ||
      !user.resetTokenExpiry ||
      user.resetTokenExpiry < new Date() ||
      !compareResetCode(dto.code, user.resetToken)

    if (invalid) {
      throw new HttpException(
        { success: false, error: 'Código inválido ou expirado.' },
        HttpStatus.BAD_REQUEST,
      )
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS)
    await prisma.user.update({
      where: { id: user!.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
        tokenVersion: { increment: 1 }, // invalida todas as sessões anteriores
      },
    })

    // Remove contador de tentativas
    await this.redis.delResetAttempts(user!.id)
    await revogarAcessosPersistentes(user!.id, this.redis)
    // Revogação de sessões: tokenVersion++ já faz o gateway rejeitar tokens antigos.
    // Sessões Redis expiram naturalmente ou são rejeitadas no verify() via tokenVersion.

    return { success: true }
  }

  // ── Multi-tenant user federation ─────────────────────────────────────────────
  // Uma pessoa pode ter uma conta (User) por instituição. A troca entre elas só
  // vale para contas VINCULADAS (identityId, ADR-061): o e-mail sozinho não
  // comprova nada, porque o admin de qualquer instituição cadastra qualquer
  // e-mail. Uma conta com o mesmo e-mail ainda não vinculada aparece na lista
  // (sessão do navegador) pedindo a senha dela na primeira troca.

  async getMyTenants(userId: string, opcoes: { incluirNaoVinculadas?: boolean } = {}) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, identityId: true },
    })
    if (!me) throw new NotFoundException('Usuário não encontrado')

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [contasVinculadas(me), ...(opcoes.incluirNaoVinculadas ? [{ email: me.email }] : [])],
      },
      include: { tenant: { select: { name: true, subdomain: true, status: true } } },
    })

    return users
      .filter(u => u.tenant.status === 'ACTIVE')
      .map(u => ({
        userId: u.id,
        tenantId: u.tenantId,
        tenantName: u.tenant.name,
        tenantSubdomain: u.tenant.subdomain,
        role: u.role,
        isCurrent: u.id === userId,
        requiresPassword: !mesmaIdentidade(me, u),
      }))
  }

  async switchTenant(userId: string, targetTenantId: string, password?: string) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, identityId: true },
    })
    if (!me) throw new UnauthorizedException('Usuário não encontrado')

    const target = await prisma.user.findFirst({
      where: {
        tenantId: targetTenantId,
        deletedAt: null,
        isActive: true,
        tenant: { status: 'ACTIVE', deletedAt: null },
        OR: [contasVinculadas(me), { email: me.email }],
      },
    })
    if (!target) throw new NotFoundException('Usuário não encontrado neste workspace')

    if (!mesmaIdentidade(me, target)) {
      // Primeira troca para uma conta com o mesmo e-mail: comprova a posse
      // pela senha da conta de destino, com o mesmo limite do login.
      if (!password) throw new ForbiddenException({ code: 'PASSWORD_REQUIRED', message: 'Confirme a senha da sua conta nesta instituição' })
      // 403, não 401: a sessão atual continua válida (o app trata 401 como sessão expirada).
      if ((target.loginAttempts ?? 0) >= MAX_LOGIN_ATTEMPTS) {
        throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', message: 'Conta bloqueada por excesso de tentativas. Contate o suporte.' })
      }
      const ok = await bcrypt.compare(password, target.passwordHash)
      if (!ok) {
        await prisma.user.update({ where: { id: target.id }, data: { loginAttempts: { increment: 1 } } })
        throw new ForbiddenException({ code: 'PASSWORD_INVALID', message: 'Senha incorreta' })
      }
      await vincularContas(me, target)
      this.logger.log(`AUDIT linkAccounts userId=${userId} linkedUserId=${target.id} tenantId=${targetTenantId}`)
    }

    await prisma.user.update({
      where: { id: target.id },
      data: { lastLogin: new Date(), loginAttempts: 0 },
    })

    const { token, jti } = await this.jwtService.sign({
      userId: target.id,
      tenantId: target.tenantId,
      role: target.role,
      tokenVersion: target.tokenVersion,
    })

    await this.redis.setSession(jti, {
      userId: target.id,
      tenantId: target.tenantId,
      role: target.role,
      tokenVersion: target.tokenVersion,
    })

    this.logger.log(`AUDIT switchTenant userId=${userId} → tenantId=${targetTenantId} newUserId=${target.id}`)

    return {
      token,
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
        tenantId: target.tenantId,
      },
    }
  }

  /** Gerenciar instituições é do operador da plataforma, não do admin de uma instituição (ADR-060). */
  private async exigirOperador(userId: string) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, passwordHash: true, identityId: true, platformOperator: true, isActive: true, deletedAt: true },
    })
    if (!me || !me.isActive || me.deletedAt) throw new UnauthorizedException('Usuário não encontrado')
    if (!me.platformOperator) throw new ForbiddenException('Acesso restrito ao operador da plataforma')
    return me
  }

  async joinTenant(userId: string, targetTenantId: string, password: string) {
    const me = await this.exigirOperador(userId)

    const tenant = await prisma.tenant.findFirst({
      where: { id: targetTenantId, status: 'ACTIVE', deletedAt: null },
    })
    if (!tenant) throw new NotFoundException('Workspace não encontrado ou inativo')

    const existing = await prisma.user.findFirst({
      where: { email: me.email, tenantId: targetTenantId, deletedAt: null },
    })
    if (existing) throw new ConflictException('Você já possui acesso a este workspace')

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const grupo = identidade(me)
    await prisma.$transaction([
      prisma.user.update({ where: { id: me.id }, data: { identityId: grupo } }),
      prisma.user.create({
        data: {
          name: me.name,
          email: me.email,
          passwordHash,
          tenantId: targetTenantId,
          role: 'member',
          identityId: grupo,
        },
      }),
    ])

    this.logger.log(`AUDIT joinTenant userId=${userId} email=${me.email} tenantId=${targetTenantId}`)

    return { ok: true }
  }

  async provisionTenantAdmin(userId: string, targetTenantId: string) {
    const me = await this.exigirOperador(userId)

    const tenant = await prisma.tenant.findFirst({
      where: { id: targetTenantId, status: 'ACTIVE', deletedAt: null },
    })
    if (!tenant) throw new NotFoundException('Workspace não encontrado ou inativo')

    const existing = await prisma.user.findFirst({
      where: { email: me.email, tenantId: targetTenantId, deletedAt: null },
    })
    if (existing) throw new ConflictException('Você já possui acesso a este workspace')

    const grupo = identidade(me)
    await prisma.$transaction([
      prisma.user.update({ where: { id: me.id }, data: { identityId: grupo } }),
      prisma.user.create({
        data: {
          name: me.name,
          email: me.email,
          passwordHash: me.passwordHash,
          tenantId: targetTenantId,
          role: 'admin',
          identityId: grupo,
        },
      }),
    ])

    this.logger.log(`AUDIT provisionTenantAdmin userId=${userId} email=${me.email} tenantId=${targetTenantId}`)

    return { ok: true }
  }
}

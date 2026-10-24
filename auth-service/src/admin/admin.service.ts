import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common'
import { prisma } from '../prisma'
import bcrypt from 'bcryptjs'
import type { AdminCreateUserDto, AdminUpdateUserDto } from './admin.dto'
import { revogarAcessosPersistentes } from '../auth/revogacao'

const BCRYPT_ROUNDS = 12

// Nunca devolve passwordHash, resetToken, mfaSecret ou tokenVersion.
const USER_SELECT = {
  id: true, name: true, email: true, role: true, tenantId: true, isActive: true, avatarUrl: true,
  cargo: true, departamento: true, hourlyRate: true, phone: true, cep: true, logradouro: true,
  numero: true, complemento: true, bairro: true, cidade: true, estado: true, notes: true,
  forcePasswordChange: true, createdAt: true,
} as const

@Injectable()
export class AdminService {
  private requireAdmin(role: string) {
    if (role !== 'admin') throw new ForbiddenException('Acesso restrito a administradores')
  }

  async listUsers(tenantId: string, role: string) {
    this.requireAdmin(role)
    return prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        avatarUrl: true,
        cargo: true,
        departamento: true,
        hourlyRate: true,
        phone: true,
        cep: true,
        logradouro: true,
        numero: true,
        complemento: true,
        bairro: true,
        cidade: true,
        estado: true,
        notes: true,
        forcePasswordChange: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
    })
  }

  async createUser(tenantId: string, role: string, data: AdminCreateUserDto) {
    this.requireAdmin(role)
    if (!tenantId) throw new ForbiddenException()
    const existing = await prisma.user.findFirst({
      where: { email: data.email, tenantId, deletedAt: null },
    })
    if (existing) throw new ConflictException('Email já cadastrado')

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS)
    const { password: _password, isAdmin, forcePasswordChange, ...contato } = data
    return prisma.user.create({
      data: {
        ...contato,
        tenantId,
        passwordHash,
        role: isAdmin ? 'admin' : 'member',
        forcePasswordChange: forcePasswordChange ?? false,
      },
      select: USER_SELECT,
    })
  }

  /** Só usuários da instituição de quem chama; o id de outro tenant responde 404. */
  private async userInTenant(userId: string, tenantId: string) {
    if (!tenantId) throw new ForbiddenException()
    const user = await prisma.user.findFirst({ where: { id: userId, tenantId, deletedAt: null }, select: { id: true } })
    if (!user) throw new NotFoundException('Usuário não encontrado')
    return user
  }

  async updateUser(userId: string, callerTenantId: string, callerRole: string, data: AdminUpdateUserDto) {
    this.requireAdmin(callerRole)
    await this.userInTenant(userId, callerTenantId)

    const { password, ...rest } = data
    const updateData: Record<string, unknown> = { ...rest }
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
      // Senha redefinida pelo admin encerra as sessões abertas da conta.
      updateData.tokenVersion = { increment: 1 }
    }

    const atualizado = await prisma.user.update({ where: { id: userId }, data: updateData, select: USER_SELECT })
    if (password) await revogarAcessosPersistentes(userId)
    return atualizado
  }

  async toggleActive(userId: string, callerTenantId: string, callerRole: string, active: boolean) {
    this.requireAdmin(callerRole)
    await this.userInTenant(userId, callerTenantId)

    return prisma.user.update({
      where: { id: userId },
      data: {
        isActive: active,
        ...(active ? {} : { tokenVersion: { increment: 1 } }),
      },
      select: { id: true, name: true, email: true, isActive: true, role: true, tokenVersion: true },
    })
  }

  async setRole(userId: string, callerTenantId: string, callerRole: string, role: string) {
    this.requireAdmin(callerRole)
    if (!['admin', 'member'].includes(role)) {
      throw new ForbiddenException('Role inválida')
    }
    await this.userInTenant(userId, callerTenantId)
    return prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    })
  }

  async listAllForTenant(tenantId: string) {
    return prisma.user.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, email: true, avatarUrl: true, role: true, isActive: true },
      orderBy: { name: 'asc' },
    })
  }
}

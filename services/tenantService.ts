import prisma from '@/lib/prisma'
import { CreateTenantSchema, UpdateTenantSchema } from '@/lib/validation/tenantSchemas'
import type { CreateTenantInput, UpdateTenantInput } from '@/lib/validation/tenantSchemas'

export class ConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export async function createTenant(input: CreateTenantInput) {
  const parsed = CreateTenantSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  const { name, subdomain, config } = parsed.data

  const existing = await prisma.tenant.findUnique({
    where: { subdomain },
  })
  if (existing) {
    throw new ConflictError('Subdomínio já está em uso')
  }

  return prisma.tenant.create({
    data: { name, subdomain, config: config ?? undefined },
  })
}

export async function getTenantBySubdomain(subdomain: string) {
  return prisma.tenant.findUnique({
    where: { subdomain, deletedAt: null },
  })
}

export async function getTenantById(id: string) {
  return prisma.tenant.findUnique({
    where: { id, deletedAt: null },
  })
}

export async function getDefaultTenant() {
  return prisma.tenant.findUnique({
    where: { subdomain: 'default', deletedAt: null },
  })
}

export async function updateTenant(id: string, input: UpdateTenantInput) {
  const parsed = UpdateTenantSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0].message)
  }

  return prisma.tenant.update({
    where: { id },
    data: parsed.data,
  })
}

export async function listTenants(callerUserId: string) {
  // Lista todas as instituições: só o operador da plataforma (ADR-060).
  const caller = await prisma.user.findUnique({
    where: { id: callerUserId },
    select: { platformOperator: true, isActive: true, deletedAt: true },
  })
  if (!caller?.platformOperator || !caller.isActive || caller.deletedAt) {
    throw new Error('Acesso restrito ao operador da plataforma')
  }
  return prisma.tenant.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

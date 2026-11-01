'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { CreateTenantSchema, UpdateTenantSchema } from '@/lib/validation/tenantSchemas'
import { registrarAcao } from '@/services/auditoriaService'

const institutionSchema = CreateTenantSchema.pick({ name: true, subdomain: true }).extend({
  name: UpdateTenantSchema.shape.name.unwrap().max(120, 'Use até 120 caracteres.').min(1, 'Informe o nome da instituição.'),
  subdomain: CreateTenantSchema.shape.subdomain.max(63, 'Use até 63 caracteres no identificador.'),
}).strict()

/** Edita nome e identificador da instituição da sessão; status e tenant alvo não vêm do cliente. */
export async function updateMyInstitutionAction(input: { name: string; subdomain: string }): Promise<{ name?: string; subdomain?: string; error?: string; field?: 'name' | 'subdomain' }> {
  const session = await verifySession()
  const parsed = institutionSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue.message, field: issue.path[0] === 'subdomain' ? 'subdomain' : 'name' }
  }
  try {
    const saved = await prisma.$transaction(async tx => {
      const admin = await tx.user.findFirst({ where: { id: session.userId, tenantId: session.tenantId, role: 'admin', isActive: true, deletedAt: null }, select: { id: true } })
      if (!admin || session.role !== 'admin') throw new Error('Somente administradores podem editar a instituição ativa.')
      const tenant = await tx.tenant.findFirst({ where: { id: session.tenantId, deletedAt: null, status: 'ACTIVE' }, select: { name: true, subdomain: true } })
      if (!tenant) throw new Error('Instituição indisponível para edição.')
      if (tenant.name === parsed.data.name && tenant.subdomain === parsed.data.subdomain) return parsed.data
      await tx.tenant.update({ where: { id: session.tenantId }, data: parsed.data })
      await registrarAcao({ tenantId: session.tenantId, userId: session.userId, action: 'INSTITUICAO_ATUALIZAR', entity: 'Tenant', entityId: session.tenantId, details: { alteracoes: Object.fromEntries((['name', 'subdomain'] as const).filter(key => tenant[key] !== parsed.data[key]).map(key => [key, { de: tenant[key], para: parsed.data[key] }])) } }, tx)
      return parsed.data
    })
    revalidatePath('/configuracoes/instituicoes')
    revalidatePath('/admin/tenants')
    return saved
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') return { error: 'Este identificador já está em uso. Escolha outro.', field: 'subdomain' }
    console.error('[instituicoes] falha ao editar instituição', error)
    return { error: error instanceof Error && ['Somente administradores podem editar a instituição ativa.', 'Instituição indisponível para edição.'].includes(error.message) ? error.message : 'Não foi possível salvar. Tente novamente.' }
  }
}

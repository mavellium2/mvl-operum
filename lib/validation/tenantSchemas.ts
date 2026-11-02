import { z } from 'zod'

const TenantStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'REMOVED'])

export const CreateTenantSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(120, 'Nome deve ter até 120 caracteres'),
  subdomain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Identificador deve ter pelo menos 3 caracteres')
    .max(63, 'Identificador deve ter até 63 caracteres')
    .regex(/^[a-z0-9-]+$/, 'Subdomínio deve conter apenas letras, números e hífens'),
  config: z.record(z.string(), z.any()).optional(),
})

export const UpdateTenantSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(120, 'Nome deve ter até 120 caracteres').optional(),
  subdomain: CreateTenantSchema.shape.subdomain.max(63).optional(),
  status: TenantStatusEnum.optional(),
  config: z.record(z.string(), z.any()).optional(),
})

export type CreateTenantInput = z.infer<typeof CreateTenantSchema>
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>

import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
  preferredTenantId: z.string().min(1).max(128).optional(),
  subdomain: z.string().optional(),
})

export type LoginDto = z.infer<typeof LoginSchema>

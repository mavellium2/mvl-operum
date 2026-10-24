import { z } from 'zod'

const texto = (max: number) => z.string().trim().max(max)
// Mesma regra do cadastro pelo admin hoje (RegisterSchema): mínimo de 8.
const senha = z.string().min(8).max(128)

const contato = {
  avatarUrl: z.string().trim().max(2048).optional(),
  phone: texto(40).optional(),
  cep: texto(20).optional(),
  logradouro: texto(200).optional(),
  numero: texto(20).optional(),
  complemento: texto(120).optional(),
  bairro: texto(120).optional(),
  cidade: texto(120).optional(),
  estado: texto(60).optional(),
  notes: texto(2000).optional(),
}

/**
 * `.strict()`: campos de controle (role, tenantId, platformOperator, identityId,
 * tokenVersion, passwordHash...) nunca chegam ao Prisma por estas rotas.
 */
export const AdminCreateUserSchema = z.object({
  name: texto(120).min(2),
  email: z.string().trim().email().max(254),
  password: senha,
  isAdmin: z.boolean().optional(),
  forcePasswordChange: z.boolean().optional(),
  ...contato,
}).strict()

export const AdminUpdateUserSchema = z.object({
  name: texto(120).min(2).optional(),
  email: z.string().trim().email().max(254).optional(),
  password: senha.optional(),
  cargo: texto(120).optional(),
  departamento: texto(120).optional(),
  hourlyRate: z.number().min(0).max(1_000_000).optional(),
  ...contato,
}).strict()

export type AdminCreateUserDto = z.infer<typeof AdminCreateUserSchema>
export type AdminUpdateUserDto = z.infer<typeof AdminUpdateUserSchema>

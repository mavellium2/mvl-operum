import { z } from 'zod'
import { emailSchema, telefoneOpcionalSchema } from '@/lib/contato'

export const UserProfileSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: emailSchema,
  cargo: z.string().trim().optional(),
  departamento: z.string().trim().optional(),
  hourlyRate: z.coerce.number().min(0, 'Hourly rate cannot be negative'),
  phone: telefoneOpcionalSchema,
  cep: z.string().trim().optional(),
  logradouro: z.string().trim().optional(),
  numero: z.string().trim().optional(),
  complemento: z.string().trim().optional(),
  bairro: z.string().trim().optional(),
  cidade: z.string().trim().optional(),
  estado: z.string().trim().max(2).optional(),
  notes: z.string().trim().optional(),
})

const textoOpcional = z.string().trim().optional().transform(v => (v ? v : undefined))

/** Dados que o próprio usuário edita em Configurações → Perfil. Cargo, departamento e valor/hora ficam com a gestão. */
export const MeuPerfilSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: emailSchema,
  phone: telefoneOpcionalSchema,
  cep: textoOpcional,
  logradouro: textoOpcional,
  numero: textoOpcional,
  complemento: textoOpcional,
  bairro: textoOpcional,
  cidade: textoOpcional,
  estado: z.string().trim().max(2).optional().transform(v => (v ? v : undefined)),
  notes: textoOpcional,
})

export const ChangePasswordSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Senha atual é obrigatória'),
    novaSenha: z
      .string()
      .min(8, 'Nova senha deve ter pelo menos 8 caracteres')
      .regex(/\d/, 'Nova senha deve conter pelo menos um número')
      .regex(/[^a-zA-Z0-9]/, 'Nova senha deve conter pelo menos um caractere especial'),
    confirmacao: z.string().min(1, 'Confirmação é obrigatória'),
  })
  .refine((data) => data.novaSenha === data.confirmacao, {
    message: 'As senhas não coincidem',
    path: ['confirmacao'],
  })

export type MeuPerfilInput = z.infer<typeof MeuPerfilSchema>
export type UserProfileInput = z.infer<typeof UserProfileSchema>
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>

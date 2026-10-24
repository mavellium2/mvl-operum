import { z } from 'zod'

const texto = (max: number) => z.string().trim().max(max)
const url = z.string().trim().max(2048).refine(v => {
  if (v === '') return true
  if (v.startsWith('/') && !v.startsWith('//')) return true
  try {
    const { protocol } = new URL(v)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}, 'URL inválida')

/**
 * Campos que a própria pessoa edita em PATCH /auth/me. `.strict()`: qualquer
 * outro campo (role, tenantId, passwordHash, isActive, tokenVersion, valor/hora,
 * cargo...) é recusado, não ignorado — o gateway repassa o corpo como veio.
 */
export const UpdateProfileSchema = z.object({
  name: texto(120).min(2).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: texto(40).optional(),
  cep: texto(20).optional(),
  logradouro: texto(200).optional(),
  numero: texto(20).optional(),
  complemento: texto(120).optional(),
  bairro: texto(120).optional(),
  cidade: texto(120).optional(),
  estado: texto(60).optional(),
  notes: texto(2000).optional(),
  avatarUrl: url.optional(),
  signatureUrl: url.optional(),
}).strict()

export type UpdateProfileDto = z.infer<typeof UpdateProfileSchema>

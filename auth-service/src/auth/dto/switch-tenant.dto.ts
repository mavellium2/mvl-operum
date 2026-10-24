import { z } from 'zod'

export const SwitchTenantSchema = z.object({
  targetTenantId: z.string().min(1, 'targetTenantId é obrigatório'),
  /** Senha da conta de destino, exigida só na primeira troca (contas ainda não vinculadas). */
  password: z.string().min(1).max(128).optional(),
})

export type SwitchTenantDto = z.infer<typeof SwitchTenantSchema>

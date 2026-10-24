import { z } from 'zod'

/** Inteiros em minutos, como na Planilha de Custos; nunca são apontamentos reais. */
export const TaskBudgetSchema = z.object({
  estimated_minutes: z.number().int().min(0).max(2_147_483_647),
}).strict()

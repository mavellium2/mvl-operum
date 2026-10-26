import { z } from 'zod'
import { MOEDA_MAXIMO } from '@/lib/dinheiro'

export const TaskCostsSchema = z.object({
  estimated_materials: z.number().min(0).max(MOEDA_MAXIMO).optional(),
  actual_materials: z.number().min(0).max(MOEDA_MAXIMO).optional(),
  completed_on: z.iso.date().nullable().optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo.')

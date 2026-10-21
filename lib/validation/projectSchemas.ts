import { z } from 'zod'

const ProjectStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'COMPLETED', 'ARCHIVED'])

export const MacroFaseSchema = z.object({
  fase:       z.string(),
  dataLimite: z.string().optional(),
  custo:      z.string().optional(),
})

const tapFields = {
  logoUrl:           z.string().optional(),
  slogan:            z.string().optional(),
  location:          z.string().optional(),
  startDate:         z.string().optional(),
  endDate:           z.string().optional(),
  justificativa:     z.string().optional(),
  objetivos:         z.string().optional(),
  metodologia:       z.string().optional(),
  descricaoProduto:  z.string().optional(),
  premissas:         z.string().optional(),
  restricoes:        z.string().optional(),
  limitesAutoridade: z.string().optional(),
  semestre:          z.string().optional(),
  termo:             z.string().max(20).optional(),
  turno:             z.string().max(30).optional(),
  ano:               z.number().int().optional(),
  departamentos:     z.array(z.string()).optional(),
}

export const CreateProjectSchema = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  tenantId:    z.string().min(1, 'TenantId is required'),
  description: z.string().trim().optional(),
  ...tapFields,
  macroFases:  z.array(MacroFaseSchema).optional(),
})

export const UpdateProjectSchema = z.object({
  name:        z.string().trim().min(1, 'Name is required').max(100, 'Name must be at most 100 characters').optional(),
  description: z.string().trim().optional(),
  status:      ProjectStatusEnum.optional(),
  ...tapFields,
  // macroFases excluído — tratado separadamente no service via delete+recreate
})

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>
export type MacroFaseInput     = z.infer<typeof MacroFaseSchema>

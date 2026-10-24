import { z } from 'zod'
import { MOEDA_MAXIMO } from '@/lib/dinheiro'

// ── Limites globais (§8) ─────────────────────────────────────────────────────
export const WBS_LIMITS = {
  MAX_NODES: 5_000,
  MAX_DEPTH: 20,
  MAX_IMPORT_BYTES: 5 * 1024 * 1024, // 5 MB
} as const

// ── Enums ────────────────────────────────────────────────────────────────────
export const WBS_LAYOUTS = ['LADO_A_LADO', 'DIREITA', 'ESQUERDA', 'HORIZONTAL'] as const

/**
 * Layouts removidos, para arquivos .wbs e versões antigas: "Abaixo" e "Abaixo com L" (1.25.0)
 * viram "Direita"; "Horizontal (topo)" e "Horizontal (base)" (1.31.0) viram "Horizontal".
 */
export function normalizarLayout(valor: unknown): unknown {
  if (valor === 'ABAIXO' || valor === 'ABAIXO_L') return 'DIREITA'
  if (valor === 'HORIZONTAL_TOPO' || valor === 'HORIZONTAL_BASE') return 'HORIZONTAL'
  return valor
}

export const WbsLayoutOrientationSchema = z.preprocess(normalizarLayout, z.enum(WBS_LAYOUTS))
export const DropPositionSchema = z.enum(['INSIDE', 'BEFORE', 'AFTER'])

// ── Primitivos de nó ─────────────────────────────────────────────────────────
export const WbsNodeStyleSchema = z.object({
  backgroundColor: z.string().min(1),
  borderColor: z.string().min(1),
  textColor: z.string().min(1),
  borderWidth: z.number().int().min(0).max(20),
  fontSize: z.number().int().min(8).max(72),
  borderRadius: z.number().int().min(0).max(50),
})

export const WbsNodePropertiesSchema = z.object({
  cardId: z.string().max(64).optional(),
  sprintId: z.string().max(64).optional(),
  cost: z.number().min(0).optional(),
  durationDays: z.number().min(0).optional(),
  ownerUserId: z.string().optional(),
  description: z.string().max(2000).optional(),
  tempoMinutos: z.number().int().min(0).optional(),
  materiais: z.number().min(0).max(MOEDA_MAXIMO).optional(),
  dataPrevista: z.string().max(10).nullable().optional(),
  tempoRealMinutos: z.number().int().min(0).optional(),
  materiaisReal: z.number().min(0).max(MOEDA_MAXIMO).optional(),
  dataRealizacao: z.string().max(10).nullable().optional(),
  elaboradoPor: z.string().max(200).optional(),
  elaboradoPorUserId: z.string().nullable().optional(),
  elaboradoPorUserIds: z.array(z.string().min(1).max(64)).max(30).nullable().optional(),
  elaboradoSincronizado: z.boolean().optional(),
  percentualConclusao: z.number().int().min(0).max(100).optional(),
})

// ── Nó completo (usado em saveTree e import) ─────────────────────────────────
export const WbsNodeClientSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  order: z.number().int().min(0),
  code: z.string().max(255),
  title: z.string().min(1).max(500),
  layout: WbsLayoutOrientationSchema,
  collapsed: z.boolean(),
  style: WbsNodeStyleSchema,
  properties: WbsNodePropertiesSchema,
  childrenIds: z.array(z.string()),
})

// ── Payloads das actions (contêm tenantId/projectId para escopo) ─────────────

export const InsertChildSchema = z.object({
  parentId: z.string().min(1),
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
})

export const InsertSiblingSchema = z.object({
  siblingId: z.string().min(1),
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
})

export const DeleteNodeSchema = z.object({
  nodeId: z.string().min(1),
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
  /** Motivo, quando o nó é uma fase cuja sprint tem dados. */
  motivoExclusao: z.string().trim().max(1000).optional(),
})

export const MoveNodeSchema = z.object({
  nodeId: z.string().min(1),
  targetId: z.string().min(1),
  position: DropPositionSchema,
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
})

export const RenameNodeSchema = z.object({
  nodeId: z.string().min(1),
  title: z.string().trim().min(1, 'Título obrigatório').max(500),
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
})

export const UpdateNodeStyleSchema = z.object({
  nodeId: z.string().min(1),
  style: WbsNodeStyleSchema.partial(),
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
})

export const UpdateNodePropertiesSchema = z.object({
  nodeId: z.string().min(1),
  properties: WbsNodePropertiesSchema,
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
})

export const SetLayoutSchema = z.object({
  nodeId: z.string().min(1),
  layout: WbsLayoutOrientationSchema,
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
})

export const SetCollapsedSchema = z.object({
  nodeId: z.string().min(1),
  collapsed: z.boolean(),
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
})

// ── saveTree (autosave com concorrência otimista) ────────────────────────────
export const SaveTreeSchema = z.object({
  projectId: z.string().min(1),
  tenantId: z.string().min(1),
  serverVersion: z.number().int().min(0),
  rootId: z.string().nullable(),
  nodes: z
    .record(z.string(), WbsNodeClientSchema)
    .refine(n => Object.keys(n).length <= WBS_LIMITS.MAX_NODES, {
      message: `Máximo de ${WBS_LIMITS.MAX_NODES} nós por projeto`,
    }),
})

// ── Import .wbs ──────────────────────────────────────────────────────────────
export const WbsImportSchema = z.object({
  version: z.number().int().min(1),
  rootId: z.string().nullable(),
  nodes: z
    .record(z.string(), WbsNodeClientSchema)
    .refine(n => Object.keys(n).length <= WBS_LIMITS.MAX_NODES, {
      message: `Máximo de ${WBS_LIMITS.MAX_NODES} nós por projeto`,
    }),
})

// ── Tipos inferidos ──────────────────────────────────────────────────────────
export type InsertChildInput = z.infer<typeof InsertChildSchema>
export type InsertSiblingInput = z.infer<typeof InsertSiblingSchema>
export type DeleteNodeInput = z.infer<typeof DeleteNodeSchema>
export type MoveNodeInput = z.infer<typeof MoveNodeSchema>
export type RenameNodeInput = z.infer<typeof RenameNodeSchema>
export type UpdateNodeStyleInput = z.infer<typeof UpdateNodeStyleSchema>
export type UpdateNodePropertiesInput = z.infer<typeof UpdateNodePropertiesSchema>
export type SetLayoutInput = z.infer<typeof SetLayoutSchema>
export type SetCollapsedInput = z.infer<typeof SetCollapsedSchema>
export type SaveTreeInput = z.infer<typeof SaveTreeSchema>
export type WbsImportData = z.infer<typeof WbsImportSchema>

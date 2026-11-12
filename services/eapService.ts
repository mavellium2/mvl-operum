import prisma from '@/lib/prisma'
import { linhaDoCabecalho, type ProjetoInstitucional } from '@/lib/linhaInstitucional'
import type { Prisma } from '@/lib/generated/prisma'
import type { InputJsonValue } from '@/lib/generated/prisma/runtime/client'
import type { EapDocument, EapNode } from '@/types/eap'
import { recomputeNodeCodes, countNodes, maxDepth } from '@/lib/eapCode'
import {
  createDefaultStructure,
  structureFromTemplate,
  EAP_TEMPLATE_NAME,
  EAP_TEMPLATE_DESCRIPTION,
} from '@/lib/eapTemplate'
import { EAP_LIMITS } from '@/lib/validation/eapSchemas'

export class EapValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EapValidationError'
  }
}

export class EapNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EapNotFoundError'
  }
}

function normalizeNodes(input: unknown): EapNode[] {
  const raw = Array.isArray(input) ? input : []
  // recomputeNodeCodes preserva apenas id/title/children + campos derivados,
  // ignorando parentId/code/level/order enviados pelo cliente (autoridade do servidor).
  const normalized = recomputeNodeCodes(raw as EapNode[])

  if (normalized.length > 1) {
    throw new EapValidationError('O documento deve ter uma única raiz ("1").')
  }
  const total = countNodes(normalized)
  if (total > EAP_LIMITS.MAX_NODES) {
    throw new EapValidationError(`Máximo de ${EAP_LIMITS.MAX_NODES} nós por documento.`)
  }
  if (maxDepth(normalized) > EAP_LIMITS.MAX_DEPTH) {
    throw new EapValidationError(`Profundidade máxima de ${EAP_LIMITS.MAX_DEPTH} níveis.`)
  }
  return normalized
}

function toClientDocument(doc: {
  id: string
  projectId: string
  tenantId: string
  templateId: string
  projectName: string
  projectManager: string
  preparedBy: string
  version: string
  approvedBy: string
  signature: string
  approvalDate: string | null
  nodes: Prisma.JsonValue
  createdAt: Date
  updatedAt: Date
}): EapDocument {
  return {
    id: doc.id,
    projectId: doc.projectId,
    tenantId: doc.tenantId,
    templateId: doc.templateId,
    projectName: doc.projectName,
    projectManager: doc.projectManager,
    preparedBy: doc.preparedBy,
    version: doc.version,
    approvedBy: doc.approvedBy,
    signature: doc.signature,
    approvalDate: doc.approvalDate,
    nodes: normalizeNodes(doc.nodes),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}

/** Garante que o template EAP padrão exista no tenant (matriz protegida). */
export async function ensureTemplate(tenantId: string) {
  const existing = await prisma.eapTemplate.findFirst({
    where: { tenantId, name: EAP_TEMPLATE_NAME, isActive: true },
  })
  if (existing) return existing

  const template = await prisma.eapTemplate.upsert({
    where: { id: `eap-template-${tenantId}` },
    update: {},
    create: {
      id: `eap-template-${tenantId}`,
      tenantId,
      name: EAP_TEMPLATE_NAME,
      description: EAP_TEMPLATE_DESCRIPTION,
      version: '1.0',
      isActive: true,
      structure: createDefaultStructure() as unknown as InputJsonValue,
    },
  })
  return template
}

/**
 * Retorna o documento EAP do projeto, criando-o a partir do template quando não
 * existir (SPEC §3 — "Criar a partir do modelo EAP"). Cada projeto possui uma
 * instância INDEPENDENTE: alterar o documento nunca altera o template.
 */
export async function getOrCreateDocument(
  projectId: string,
  tenantId: string,
  prefillProjectName?: string,
): Promise<EapDocument> {
  const existing = await prisma.eapDocument.findUnique({ where: { projectId } })
  if (existing) return toClientDocument(existing)

  const template = await ensureTemplate(tenantId)

  const doc = await prisma.eapDocument.create({
    data: {
      tenantId,
      projectId,
      templateId: template.id,
      projectName: prefillProjectName ?? '',
      version: '1.0',
      nodes: structureFromTemplate(template.structure as unknown as EapNode[]) as unknown as InputJsonValue,
    },
  })
  return toClientDocument(doc)
}

export interface SaveEapInput {
  projectName: string
  projectManager: string
  preparedBy: string
  version: string
  approvedBy: string
  signature: string
  approvalDate: string | null
  nodes: EapNode[]
}

/** Salva metadados + árvore. Códigos/ordem sempre recalculados pelo servidor. */
export async function saveDocument(projectId: string, tenantId: string, input: SaveEapInput): Promise<EapDocument> {
  const doc = await prisma.eapDocument.findUnique({ where: { projectId } })
  if (!doc) throw new EapNotFoundError('Documento EAP não encontrado.')

  const updated = await prisma.eapDocument.update({
    where: { projectId },
    data: {
      projectName: input.projectName,
      projectManager: input.projectManager,
      preparedBy: input.preparedBy,
      version: input.version,
      approvedBy: input.approvedBy,
      signature: input.signature,
      approvalDate: input.approvalDate,
      nodes: normalizeNodes(input.nodes) as unknown as InputJsonValue,
    },
  })
  return toClientDocument(updated)
}

/** Recria o documento a partir do template (estrutura limpa, novos ids). */
export async function resetDocument(projectId: string, tenantId: string, prefillProjectName?: string): Promise<EapDocument> {
  const template = await ensureTemplate(tenantId)

  const doc = await prisma.eapDocument.upsert({
    where: { projectId },
    update: {
      templateId: template.id,
      projectName: prefillProjectName ?? '',
      version: '1.0',
      nodes: structureFromTemplate(template.structure as unknown as EapNode[]) as unknown as InputJsonValue,
    },
    create: {
      tenantId,
      projectId,
      templateId: template.id,
      projectName: prefillProjectName ?? '',
      version: '1.0',
      nodes: structureFromTemplate(template.structure as unknown as EapNode[]) as unknown as InputJsonValue,
    },
  })
  return toClientDocument(doc)
}

/** Linha institucional do cabeçalho — mesma regra da Ata (`lib/linhaInstitucional.ts`). */
export function formatInstitucionalInfo(project: ProjetoInstitucional): string {
  return linhaDoCabecalho(project)
}
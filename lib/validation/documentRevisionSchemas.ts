import { DocumentRevisionError } from '@/lib/documentRevisionError'
import { z } from 'zod'
import { erroMoeda, MENSAGEM_MOEDA_INVALIDA } from '@/lib/dinheiro'
import { AtualizarAtaSchema } from './ataSchemas'
import { EAP_LIMITS, SaveEapDocumentSchema } from './eapSchemas'
import { recomputeNodeCodes } from '@/lib/eapCode'
import { safeAvatarUrl } from './avatarUrl'
import type { EapNode } from '@/types/eap'

export const tipoDocumento = z.enum(['CHARTER', 'STAKEHOLDER', 'EAP', 'ATA'])
export type TipoDocumento = z.infer<typeof tipoDocumento>
const texto = z.string().max(50000).nullable().optional()
export const charterSchema = z
  .object({
    categoria: texto,
    documentContext: z.object({
      nomeProjeto: z.string().max(300), gerenteProjeto: z.string().max(1000),
      logoUrl: z.string().max(2000).nullable().optional().transform(value => safeAvatarUrl(value) ?? null),
      gerenteSignatureUrl: z.string().max(2000).nullable().optional().transform(value => safeAvatarUrl(value) ?? null),
      // papel: função do cadastro, para os integrantes saírem "Nome – papel" no Termo.
      membros: z.array(z.object({ name: z.string().max(300), papel: z.string().max(300).optional() }).strict()).max(1000),
    }).strict().optional(),
    justificativa: texto,
    objetivos: texto,
    metodologia: texto,
    descricaoProduto: texto,
    premissas: texto,
    restricoes: texto,
    limitesAutoridade: texto,
    principaisEnvolvidos: texto,
    macroFases: z
      .array(
        z.object({
          id: z.string().max(128).optional(),
          fase: z.string().max(500),
          dataLimite: texto,
          custo: texto.refine(v => erroMoeda(v) === null, MENSAGEM_MOEDA_INVALIDA),
        }),
      )
      .max(500)
      .optional(),
  })
  .strict()
const imagem = z
  .string()
  .max(2000)
  .nullable()
  .optional()
  .transform((value) => safeAvatarUrl(value) ?? null)
const headerSchema = z
  .object({
    categoria: z.string().max(1000),
    nomeProjeto: z.string().max(300),
    gerenteProjeto: z.string().max(1000),
    elaboradoPor: z.string().max(300),
    aprovadoPor: z.string().max(300),
    versao: z.string().max(50),
    dataCriacao: z.string().max(50),
    dataAprovacao: z.string().max(50),
    logoUrl: imagem,
    signatureUrl: imagem,
  })
  .strict()
export const stakeholderSchema = z
  .object({
    header: headerSchema,
    cadastrosExcluidos: z.array(z.string().regex(/^(interno|externo):[a-zA-Z0-9_-]{1,128}$/)).max(1000).optional(),
    stakeholders: z
      .array(
        z
          .object({
            ref: z.string().max(100),
            cadastroId: z.string().regex(/^(interno|externo):[a-zA-Z0-9_-]{1,128}$/).optional(),
            inativo: z.boolean().optional(),
            motivoInativo: z.string().max(1000).optional(),
            nome: z.string().max(300),
            empresaEquipe: z.string().max(500),
            cargoCompetencia: z.string().max(500),
            email: z.string().max(300),
            telefoneFax: z.string().max(200),
            endereco: z.string().max(1000),
            observacoes: z.string().max(10000).optional(),
          })
          .strict(),
      )
      .max(1000),
  })
  .strict()

const nodeSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().trim().max(500).default(''),
  children: z.array(z.unknown()).default([]),
})
/** Valida todos os descendentes iterativamente antes de qualquer percurso recursivo. */
export function validarEap(payload: unknown) {
  const input = z.object({ nodes: z.array(z.unknown()).max(1) }).parse(payload)
  const roots: EapNode[] = []
  const stack = input.nodes.map((value) => ({ value, output: roots, depth: 1 }))
  const ids = new Set<string>()
  while (stack.length) {
    const { value, output, depth } = stack.pop()!
    if (depth > EAP_LIMITS.MAX_DEPTH)
      throw new DocumentRevisionError(
        'Profundidade máxima de 20 níveis excedida',
      )
    const node = nodeSchema.parse(value)
    if (ids.has(node.id))
      throw new DocumentRevisionError('IDs de nós da EAP devem ser únicos')
    ids.add(node.id)
    if (ids.size > EAP_LIMITS.MAX_NODES)
      throw new DocumentRevisionError('Máximo de 5000 nós por documento')
    const clean: EapNode = {
      id: node.id,
      title: node.title,
      parentId: null,
      code: '',
      level: depth,
      order: 0,
      children: [],
    }
    output.push(clean)
    for (let i = node.children.length - 1; i >= 0; i--)
      stack.push({
        value: node.children[i],
        output: clean.children,
        depth: depth + 1,
      })
  }
  return SaveEapDocumentSchema.parse({
    ...z.record(z.string(), z.unknown()).parse(payload),
    nodes: recomputeNodeCodes(roots),
  })
}

export function validarDocumento(type: TipoDocumento, payload: unknown) {
  if (type === 'CHARTER') return charterSchema.parse(payload)
  if (type === 'STAKEHOLDER') return stakeholderSchema.parse(payload)
  if (type === 'ATA') return AtualizarAtaSchema.parse(payload)
  return validarEap(payload)
}

export const metaDocumento = z.object({
  commitTitle: z.string().trim().min(1).max(300),
  versao: z.string().trim().min(1).max(50),
  elaboradoPor: z.string().max(300).default(''),
  aprovadoPor: z.string().max(300).default(''),
  dataAprovacao: z.string().max(50).default(''),
})
export function validarRecurso(
  type: TipoDocumento,
  resourceId: string,
  writing = false,
) {
  z.string().max(64).parse(resourceId)
  if (type !== 'ATA' && resourceId)
    throw new DocumentRevisionError('Este documento não admite resourceId')
  if (type === 'ATA' && writing && !resourceId)
    throw new DocumentRevisionError('Identificação da ata obrigatória')
}

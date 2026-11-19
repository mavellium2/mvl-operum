import { DocumentRevisionError } from '@/lib/documentRevisionError'
import { z } from 'zod'
import { erroMoeda, MENSAGEM_MOEDA_INVALIDA } from '@/lib/dinheiro'
import { AtualizarAtaSchema } from './ataSchemas'
import { EAP_LIMITS, SaveEapDocumentSchema } from './eapSchemas'
import { recomputeNodeCodes } from '@/lib/eapCode'
import { safeAvatarUrl } from './avatarUrl'
import type { EapNode } from '@/types/eap'
import { cabecalhoFormularioSchema, escopoSchema, licoesSchema, riscoSchema } from './formulariosGP'

export const tipoDocumento = z.enum(['CHARTER', 'STAKEHOLDER', 'EAP', 'ATA', 'CAPA', 'ESCOPO', 'RISCOS', 'LICOES', 'CANVAS'])
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
    /** Texto editável antes do nome do gerente ("A gerência do projeto será de responsabilidade de"). */
    textoGerencia: z.string().max(500).optional(),
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

/** Campos editáveis da Capa (em amarelo no modelo). Logo e integrantes vêm do projeto. */
const linhaCapa = z.string().max(500)
export const capaSchema = z
  .object({
    instituicao: linhaCapa,
    curso: linhaCapa,
    disciplina: linhaCapa,
    professor: linhaCapa,
    endereco: linhaCapa,
    email: linhaCapa,
    periodo: z.string().max(50),
  })
  .partial()
  .strict()
export type CapaConteudo = z.infer<typeof capaSchema>

/** Canvas do projeto: blocos independentes editados e versionados como um documento. */
export const canvasSchema = z.object({
  cabecalho: cabecalhoFormularioSchema.optional(),
  projeto: z.string().max(500),
  solicitante: z.string().max(1000),
  gerente: z.string().max(1000),
  justificativa: z.string().max(20000),
  objetivos: z.string().max(20000),
  escopo: z.string().max(20000),
  escopoNaoIncluido: z.string().max(20000),
  estrategia: z.string().max(20000),
  stakeholders: z.string().max(20000),
  comunicacao: z.string().max(20000),
  restricoes: z.string().max(20000),
  premissas: z.string().max(20000),
  riscos: z.string().max(20000),
  fases: z.string().max(20000),
  cronograma: z.string().max(20000),
  orcamento: z.string().max(20000),
}).strict()
export type CanvasConteudo = z.infer<typeof canvasSchema>

export function validarDocumento(type: TipoDocumento, payload: unknown) {
  if (type === 'CANVAS') return canvasSchema.parse(payload)
  if (type === 'CAPA') return capaSchema.parse(payload)
  if (type === 'ESCOPO') return escopoSchema.parse(payload)
  if (type === 'RISCOS') return riscoSchema.parse(payload)
  if (type === 'LICOES') return licoesSchema.parse(payload)
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
/** Documentos com um registro por recurso (cada ata, cada risco): `resourceId` obrigatório ao gravar. */
export const documentoPorRecurso = (type: TipoDocumento) => type === 'ATA' || type === 'RISCOS'

export function validarRecurso(
  type: TipoDocumento,
  resourceId: string,
  writing = false,
) {
  z.string().max(64).parse(resourceId)
  if (!documentoPorRecurso(type) && resourceId)
    throw new DocumentRevisionError('Este documento não admite resourceId')
  if (documentoPorRecurso(type) && writing && !resourceId)
    throw new DocumentRevisionError(type === 'ATA' ? 'Identificação da ata obrigatória' : 'Identificação do risco obrigatória')
}

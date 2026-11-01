import { gerenteDoProjeto } from './gerenteProjeto'
import { charterChanges } from '@/lib/charterChanges'
import { DocumentRevisionError } from '@/lib/documentRevisionError'
import 'server-only'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { Prisma, type DocumentType } from '@/lib/generated/prisma'
import { can, exigirPermissao, type SessaoAuthz } from './authz'
import {
  validarDocumento,
  validarEap,
  validarRecurso,
  charterSchema,
  metaDocumento,
} from '@/lib/validation/documentRevisionSchemas'
import { getOrCreateDocument } from './eapService'
import { registrarAcao } from './auditoriaService'
import { AtualizarAtaSchema } from '@/lib/validation/ataSchemas'
export {
  tipoDocumento,
  metaDocumento,
  validarDocumento,
} from '@/lib/validation/documentRevisionSchemas'

async function acesso(
  s: SessaoAuthz,
  projectId: string,
  permission:
    | 'documentos:ver'
    | 'documentos:editar'
    | 'documentos:aprovar'
    | 'documentos:excluir',
) {
  await exigirPermissao(s, projectId, 'projeto:ver')
  await exigirPermissao(s, projectId, permission)
}
const whereDraft = (
  s: SessaoAuthz,
  projectId: string,
  documentType: DocumentType,
  resourceId: string,
) => ({
  projectId_userId_documentType_resourceId: {
    projectId,
    userId: s.userId,
    documentType,
    resourceId,
  },
})

export async function documentoVigente(
  s: SessaoAuthz,
  projectId: string,
  documentType: DocumentType,
  resourceId = '',
) {
  await acesso(s, projectId, 'documentos:ver')
  validarRecurso(documentType, resourceId)
  return prisma.documentVersion.findFirst({
    where: {
      projectId,
      documentType,
      resourceId,
      status: 'APPROVED',
      payload: { not: Prisma.DbNull },
    },
    orderBy: [{ approvedAt: 'desc' }, { sequence: 'desc' }],
  })
}
export async function rascunhoDocumento(
  s: SessaoAuthz,
  projectId: string,
  documentType: DocumentType,
  resourceId = '',
) {
  await acesso(s, projectId, 'documentos:editar')
  validarRecurso(documentType, resourceId, true)
  return prisma.documentDraft.findUnique({
    where: whereDraft(s, projectId, documentType, resourceId),
  })
}
/** Descarta o rascunho privado do usuário ("Descartar alterações" ao sair do documento). */
export async function descartarRascunho(
  s: SessaoAuthz,
  projectId: string,
  documentType: DocumentType,
  resourceId = '',
) {
  await acesso(s, projectId, 'documentos:editar')
  validarRecurso(documentType, resourceId, true)
  const { count } = await prisma.documentDraft.deleteMany({
    where: { projectId, userId: s.userId, documentType, resourceId, tenantId: s.tenantId },
  })
  return { descartado: count > 0 }
}
export async function salvarRascunho(
  s: SessaoAuthz,
  projectId: string,
  documentType: DocumentType,
  payload: unknown,
  resourceId = '',
) {
  await acesso(s, projectId, 'documentos:editar')
  validarRecurso(documentType, resourceId, true)
  const content = JSON.parse(
    JSON.stringify(validarDocumento(documentType, payload)),
  ) as Prisma.InputJsonValue
  return prisma.$transaction(async (tx) => {
    await bloquearProjeto(tx, s, projectId)
    if (documentType === 'ATA')
      await validarAta(tx, s, projectId, resourceId, content)
    const draft = await tx.documentDraft.upsert({
      where: whereDraft(s, projectId, documentType, resourceId),
      create: {
        tenantId: s.tenantId,
        projectId,
        userId: s.userId,
        documentType,
        resourceId,
        payload: content,
      },
      update: { payload: content },
    })
    await registrarAcao(
      {
        tenantId: s.tenantId,
        userId: s.userId,
        action: 'DOCUMENTO_RASCUNHO',
        entity: 'Document',
        entityId: projectId,
        details: { documentType, resourceId, draftId: draft.id },
      },
      tx,
    )
    return draft
  })
}
async function bloquearProjeto(
  tx: Prisma.TransactionClient,
  s: SessaoAuthz,
  projectId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "Project" WHERE id = ${projectId} AND "tenantId" = ${s.tenantId} AND "deletedAt" IS NULL FOR UPDATE`
  if (!rows.length) throw new DocumentRevisionError('Projeto não encontrado')
}
async function validarAta(
  tx: Prisma.TransactionClient,
  s: SessaoAuthz,
  projectId: string,
  resourceId: string,
  payload: unknown,
) {
  const d = AtualizarAtaSchema.parse(payload)
  const existing = await tx.ata.findUnique({ where: { id: resourceId } })
  if (
    existing &&
    (existing.projetoId !== projectId ||
      existing.tenantId !== s.tenantId ||
      existing.deletedAt)
  )
    throw new DocumentRevisionError('Ata não encontrada')
  const ids = [
    ...new Set(
      [
        d.elaboradoPorUserId,
        d.aprovadoPorUserId,
        ...d.presentes.map((p) => p.userId),
        ...d.acoes.map((a) => a.responsavelUserId),
      ].filter((v): v is string => !!v),
    ),
  ]
  if (ids.length) {
    const members = await tx.userProject.count({
      where: {
        projectId,
        active: true,
        userId: { in: ids },
        user: { tenantId: s.tenantId, deletedAt: null, isActive: true },
      },
    })
    if (members !== ids.length)
      throw new DocumentRevisionError(
        'Responsáveis devem ser membros ativos do projeto',
      )
  }
  const revision = await tx.documentVersion.findFirst({
    where: { documentType: 'ATA', resourceId, projectId: { not: projectId } },
    select: { id: true },
  })
  if (revision)
    throw new DocumentRevisionError('Ata não encontrada neste projeto')
  return existing
}

async function aplicarDocumento(
  tx: Prisma.TransactionClient,
  s: SessaoAuthz,
  projectId: string,
  documentType: DocumentType,
  resourceId: string,
  content: unknown,
) {
  if (documentType === 'ATA')
    return aplicarAta(tx, s, projectId, resourceId, content)
  if (documentType === 'CHARTER') {
    const {
      categoria: _categoria,
      documentContext: _documentContext,
      macroFases: _macroFases,
      principaisEnvolvidos: _principais,
      ...data
    } = charterSchema.parse(content)
    await tx.project.update({ where: { id: projectId }, data })
  }
  if (documentType === 'EAP') {
    // Os ids dos selects de membro (Elaborado/Aprovado por) ficam só na versão;
    // `EapDocument` guarda os nomes.
    const { preparedByUserId: _preparedByUserId, approvedByUserId: _approvedByUserId, ...data } = validarEap(content)
    const changed = await tx.eapDocument.updateMany({
      where: { projectId, tenantId: s.tenantId },
      data: { ...data, nodes: data.nodes as unknown as Prisma.InputJsonValue },
    })
    if (!changed.count)
      throw new DocumentRevisionError('Documento EAP não encontrado')
  }
}

async function aplicarAta(
  tx: Prisma.TransactionClient,
  s: SessaoAuthz,
  projectId: string,
  resourceId: string,
  payload: unknown,
) {
  const d = AtualizarAtaSchema.parse(payload)
  const project = await tx.project.findFirst({
    where: { id: projectId, tenantId: s.tenantId, deletedAt: null },
    select: { name: true },
  })
  if (!project) throw new DocumentRevisionError('Projeto não encontrado')
  const existing = await validarAta(tx, s, projectId, resourceId, payload)
  const { presentes, acoes, anexos, ...rest } = d
  const data = {
    ...rest,
    data: new Date(d.data),
    presentes: {
      create: presentes.map((p) => ({ ...p, userId: p.userId || null })),
    },
    acoes: {
      create: acoes.map((a) => ({
        ...a,
        prazo: a.prazo ? new Date(a.prazo) : null,
        responsavelUserId: a.responsavelUserId || null,
      })),
    },
    anexos: { create: anexos },
  }
  if (existing) {
    await tx.ataPresente.deleteMany({ where: { ataId: resourceId } })
    await tx.ataAcao.deleteMany({ where: { ataId: resourceId } })
    await tx.ataAnexo.deleteMany({ where: { ataId: resourceId } })
    await tx.ata.update({ where: { id: resourceId }, data })
  } else {
    const last = await tx.ata.findFirst({
      where: { projetoId: projectId },
      orderBy: { numero: 'desc' },
      select: { numero: true },
    })
    await tx.ata.create({
      data: {
        ...data,
        id: resourceId,
        projetoId: projectId,
        tenantId: s.tenantId,
        nomeProjeto: project.name,
        numero: (last?.numero ?? 0) + 1,
      },
    })
  }
}

async function snapshotTermo(
  tx: Prisma.TransactionClient,
  projectId: string,
  proposal: unknown,
) {
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      tenantId: true,
      justificativa: true,
      objetivos: true,
      metodologia: true,
      descricaoProduto: true,
      premissas: true,
      restricoes: true,
      limitesAutoridade: true,
    },
  })
  const current = await tx.documentVersion.findFirst({
    where: {
      projectId,
      documentType: 'CHARTER',
      resourceId: '',
      status: 'APPROVED',
      payload: { not: Prisma.DbNull },
    },
    orderBy: [{ approvedAt: 'desc' }, { sequence: 'desc' }],
    select: { payload: true },
  })
  let legacy: Array<{
    id: string
    fase: string
    dataLimite?: string | null
    custo?: string | null
  }> = []
  if (!current) {
    const root = await tx.wbsNode.findFirst({
      where: { projectId, tenantId: project.tenantId, parentId: null },
      orderBy: { order: 'asc' },
      select: { id: true },
    })
    const nodes = root
      ? await tx.wbsNode.findMany({
          where: { projectId, tenantId: project.tenantId, parentId: root.id },
          orderBy: { order: 'asc' },
          select: { id: true, title: true, properties: true },
        })
      : []
    legacy = nodes
      .filter((node) => node.title)
      .map((node) => {
        const props = (node.properties as Record<string, unknown>) ?? {}
        return {
          id: node.id,
          fase: node.title,
          dataLimite:
            typeof props.dataLimite === 'string' ? props.dataLimite : '',
          custo: props.custo != null ? String(props.custo) : '',
        }
      })
    if (!legacy.length)
      legacy = await tx.projectMacroFase.findMany({
        where: { projectId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, fase: true, dataLimite: true, custo: true },
      })
  }
  const { tenantId: _tenantId, ...fields } = project
  // Mesmo um cliente que envia só um campo produz um snapshot completo e imutável.
  return charterSchema.parse({
    ...fields,
    principaisEnvolvidos: '',
    macroFases: legacy,
    ...charterSchema.parse(current?.payload ?? {}),
    ...charterSchema.parse(proposal),
  })
}

export async function submeterDocumento(
  s: SessaoAuthz,
  projectId: string,
  documentType: DocumentType,
  payload: unknown,
  meta: z.infer<typeof metaDocumento>,
  resourceId = '',
  transaction?: Prisma.TransactionClient,
) {
  const db = transaction ?? prisma
  await acesso(s, projectId, 'documentos:editar')
  validarRecurso(documentType, resourceId, true)
  if (documentType === 'ATA' && !resourceId)
    throw new DocumentRevisionError('Identificação da ata obrigatória')
  const metadata = metaDocumento.parse(meta)
  const [user, gerente] = await Promise.all([
    db.user.findFirst({ where: { id: s.userId, tenantId: s.tenantId }, select: { name: true } }),
    gerenteDoProjeto(projectId, db),
  ])
  metadata.elaboradoPor = metadata.elaboradoPor.trim() || user?.name || ''
  metadata.aprovadoPor = gerente.nome
  const input = validarDocumento(documentType, payload) as unknown as Record<string, unknown>
  if (documentType === 'EAP') { input.preparedBy = metadata.elaboradoPor; input.approvedBy = gerente.nome; input.approvedByUserId = gerente.userIds?.[0] ?? null }
  if (documentType === 'STAKEHOLDER') input.header = { ...(input.header as object), elaboradoPor: metadata.elaboradoPor, aprovadoPor: gerente.nome }
  if (documentType === 'ATA') { input.elaboradoPor = metadata.elaboradoPor; input.aprovadoPor = gerente.nome; input.aprovadoPorUserId = gerente.userIds?.[0] ?? null }
  const proposed = JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue
  const approve = await can(s, projectId, 'documentos:aprovar')
  if (documentType === 'EAP') {
    if (transaction) throw new DocumentRevisionError('EAP não pode ser submetida nesta transação')
    await getOrCreateDocument(projectId, s.tenantId)
  }
  const executar = async (tx: Prisma.TransactionClient) => {
    // Serializa aprovação/submissão e define uma ordem inequívoca de vigência.
    await bloquearProjeto(tx, s, projectId)
    const content =
      documentType === 'CHARTER'
        ? (JSON.parse(
            JSON.stringify(await snapshotTermo(tx, projectId, proposed)),
          ) as Prisma.InputJsonValue)
        : proposed
    if (documentType === 'ATA')
      await validarAta(tx, s, projectId, resourceId, content)
    if (approve)
      await aplicarDocumento(
        tx,
        s,
        projectId,
        documentType,
        resourceId,
        content,
      )
    const previous = documentType === 'CHARTER' ? await tx.documentVersion.findFirst({
      where: { projectId, documentType, resourceId }, orderBy: { sequence: 'desc' }, select: { id: true, payload: true },
    }) : null
    const version = await tx.documentVersion.create({
      data: {
        ...metadata,
        projectId,
        documentType,
        resourceId,
        payload: content,
        ...(documentType === 'CHARTER' ? { previousVersionId: previous?.id ?? null, changes: JSON.parse(JSON.stringify(charterChanges(previous?.payload, content))) as Prisma.InputJsonValue } : {}),
        authorId: s.userId,
        status: approve ? 'APPROVED' : 'PENDING',
        approvedAt: approve ? new Date() : null,
        approvedById: approve ? s.userId : null,
      },
      include: { author: { select: { name: true } } },
    })
    await registrarAcao(
      {
        tenantId: s.tenantId,
        userId: s.userId,
        action: 'DOCUMENTO_VERSAO',
        entity: 'Document',
        entityId: projectId,
        details: {
          documentType,
          resourceId,
          versionId: version.id,
          status: version.status,
          commitTitle: metadata.commitTitle,
        },
      },
      tx,
    )
    await tx.documentDraft.deleteMany({
      where: {
        projectId,
        userId: s.userId,
        documentType,
        resourceId,
        tenantId: s.tenantId,
      },
    })
    return version
  }
  return transaction ? executar(transaction) : prisma.$transaction(executar)
}
export async function revisarDocumento(
  s: SessaoAuthz,
  projectId: string,
  versionId: string,
  action: 'approve' | 'reject',
) {
  await acesso(s, projectId, 'documentos:aprovar')
  return prisma.$transaction(async (tx) => {
    await bloquearProjeto(tx, s, projectId)
    const current = await tx.documentVersion.findFirst({
      where: { id: versionId, projectId, status: 'PENDING' },
    })
    if (!current)
      throw new DocumentRevisionError('Versão não encontrada ou já revisada')
    if (action === 'approve' && !current.payload)
      throw new DocumentRevisionError(
        'Versão legada sem conteúdo: crie uma nova versão antes de aprovar',
      )
    if (action === 'approve')
      await aplicarDocumento(
        tx,
        s,
        projectId,
        current.documentType,
        current.resourceId,
        validarDocumento(current.documentType, current.payload),
      )
    const version = await tx.documentVersion.update({
      where: { id: versionId },
      data: {
        status: action === 'approve' ? 'APPROVED' : 'REJECTED',
        approvedAt: action === 'approve' ? new Date() : null,
        approvedById: s.userId,
      },
      include: { author: { select: { name: true } } },
    })
    await registrarAcao(
      {
        tenantId: s.tenantId,
        userId: s.userId,
        action:
          action === 'approve' ? 'DOCUMENTO_APROVAR' : 'DOCUMENTO_REJEITAR',
        entity: 'Document',
        entityId: projectId,
        details: {
          documentType: current.documentType,
          resourceId: current.resourceId,
          versionId,
        },
      },
      tx,
    )
    return version
  })
}

export async function excluirVersao(
  s: SessaoAuthz,
  projectId: string,
  versionId: string,
) {
  await acesso(s, projectId, 'documentos:excluir')
  return prisma.$transaction(async (tx) => {
    await bloquearProjeto(tx, s, projectId)
    const version = await tx.documentVersion.findFirst({
      where: { id: versionId, projectId },
    })
    if (!version) throw new DocumentRevisionError('Versão não encontrada', 404)
    if (version.status === 'APPROVED')
      throw new DocumentRevisionError(
        'Versões aprovadas são preservadas no histórico',
        409,
      )
    await tx.documentVersion.delete({ where: { id: versionId } })
    await registrarAcao(
      {
        tenantId: s.tenantId,
        userId: s.userId,
        action: 'DOCUMENTO_EXCLUIR_VERSAO',
        entity: 'Document',
        entityId: projectId,
        details: {
          documentType: version.documentType,
          resourceId: version.resourceId,
          versionId,
          commitTitle: version.commitTitle,
        },
      },
      tx,
    )
    return { deleted: true }
  })
}

export async function excluirAta(
  s: SessaoAuthz,
  projectId: string,
  ataId: string,
) {
  await acesso(s, projectId, 'documentos:excluir')
  await prisma.$transaction(async (tx) => {
    await bloquearProjeto(tx, s, projectId)
    const changed = await tx.ata.updateMany({
      where: {
        id: ataId,
        projetoId: projectId,
        tenantId: s.tenantId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    })
    if (!changed.count)
      throw new DocumentRevisionError('Ata não encontrada', 404)
    await tx.documentVersion.updateMany({
      where: {
        projectId,
        resourceId: ataId,
        documentType: 'ATA',
        status: 'PENDING',
      },
      data: { status: 'REJECTED', approvedById: s.userId },
    })
    await registrarAcao(
      {
        tenantId: s.tenantId,
        userId: s.userId,
        action: 'DOCUMENTO_EXCLUIR',
        entity: 'Document',
        entityId: projectId,
        details: {
          documentType: 'ATA',
          resourceId: ataId,
          reason: 'Ata excluída; propostas pendentes canceladas',
        },
      },
      tx,
    )
  })
}

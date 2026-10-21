import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { exigirPermissao, SemPermissaoError } from '@/services/authz'
import { documentoVigente, submeterDocumento } from '@/services/documentRevisionService'
import {
  getOrCreateDocument,
  ensureTemplate,
  formatInstitucionalInfo,
  EapValidationError,
  EapNotFoundError,
} from '@/services/eapService'
import { SaveEapDocumentSchema, validateEapDepth } from '@/lib/validation/eapSchemas'
import type { EapNode } from '@/types/eap'
import { structureFromTemplate } from '@/lib/eapTemplate'
import { eapNodesFromWbs } from '@/lib/eapFromWbs'
import { getTree } from '@/services/wbsService'
import { gerenteDoProjeto } from '@/services/gerenteProjeto'
import { sincronizarEapSprintSePermitido } from '@/services/eapSprintSyncService'
import { ZodError } from 'zod'
import { DocumentRevisionError } from '@/lib/documentRevisionError'
import { departamentosDoProjeto } from '@/services/departamentosDoProjeto'

type RouteCtx = { params: Promise<{ projetoId: string }> }

/** Garante que o usuário é membro ativo (ou admin/gerente) do projeto. */
async function requireProjectAccess(userId: string, role: string, tenantId: string, projetoId: string, permission: 'documentos:ver' | 'documentos:editar' | 'documentos:excluir' = 'documentos:ver') {
  await exigirPermissao({ userId, role, tenantId }, projetoId, 'projeto:ver')
  await exigirPermissao({ userId, role, tenantId }, projetoId, permission)
}

async function loadProject(tenantId: string, projetoId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projetoId, tenantId, deletedAt: null },
    select: { id: true, name: true, location: true, departamentos: true, semestre: true, termo: true, turno: true, ano: true, logoUrl: true },
  })
  if (!project) return null
  // Nome atual do cadastro (a lista gravada fica desatualizada ao renomear).
  return { ...project, departamentos: await departamentosDoProjeto(projetoId, tenantId, project.departamentos) }
}

/** Árvore da aba EAP/WBS no formato do documento; `null` quando a WBS ainda não existe. */
async function nodesDaWbs(projetoId: string, tenantId: string): Promise<{ nodes: EapNode[]; arvore: { rootId: string | null; nodes: Awaited<ReturnType<typeof getTree>>['nodes'] } } | null> {
  const tree = await getTree(projetoId, tenantId)
  const nodes = eapNodesFromWbs(tree.nodes, tree.rootId)
  // A árvore da aba vai junto para o documento desenhar a EAP gráfica igual à aba.
  return nodes.length > 0 ? { nodes, arvore: { rootId: tree.rootId, nodes: tree.nodes } } : null
}

/**
 * Converte falhas conhecidas em respostas úteis. Antes, qualquer erro fora de
 * EapNotFoundError virava 500 "Erro interno" e a causa só aparecia no log.
 */
function errorResponse(err: unknown, where: string, projetoId: string) {
  if (err instanceof EapNotFoundError || err instanceof SemPermissaoError) {
    return NextResponse.json({ error: err.message }, { status: 403 })
  }
  if (err instanceof ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? 'Dados inválidos' }, { status: 400 })
  if (err instanceof DocumentRevisionError) return NextResponse.json({ error: err.message }, { status: 422 })
  if (err instanceof EapValidationError) {
    return NextResponse.json({ error: err.message }, { status: 422 })
  }
  const code = (err as { code?: unknown } | null)?.code
  console.error(`[eap ${where}]`, { projetoId, code }, err)
  // P2021/P2022: tabela ou coluna inexistente — migration do app não aplicada.
  if (code === 'P2021' || code === 'P2022') {
    return NextResponse.json(
      { error: 'Documento EAP indisponível: o banco de dados está desatualizado. Avise o administrador.' },
      { status: 503 },
    )
  }
  return NextResponse.json({ error: 'Erro interno ao carregar a EAP' }, { status: 500 })
}

/** GET — retorna o documento EAP do projeto (cria a partir do modelo no 1º acesso). */
export async function GET(_: Request, { params }: RouteCtx) {
  const { projetoId } = await params

  const { tenantId, role, userId } = await verifySession()
  try {
    await requireProjectAccess(userId, role, tenantId, projetoId)

    const project = await loadProject(tenantId, projetoId)
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    const base = await getOrCreateDocument(projetoId, tenantId, project.name)
    const vigente = await documentoVigente({ tenantId, role, userId }, projetoId, 'EAP')
    const salvo = vigente?.payload ? { ...base, ...(vigente.payload as object) } : base
    // A estrutura vem sempre da aba EAP/WBS; os campos vazios do quadro são pré-preenchidos.
    // Mesma reconciliação EAP ↔ sprint da aba EAP/WBS (ex.: tira cards do backlog) antes de ler a árvore.
    await sincronizarEapSprintSePermitido({ userId, tenantId, role }, projetoId)
    const [wbs, gerente] = await Promise.all([nodesDaWbs(projetoId, tenantId), gerenteDoProjeto(projetoId)])
    const document = {
      ...salvo,
      projectName: salvo.projectName || project.name,
      // Gerente do projeto é sempre o do cadastro, nunca digitado.
      projectManager: gerente.nome,
      ...(wbs ? { nodes: wbs.nodes } : {}),
    }
    return NextResponse.json({
      document,
      instituicao: formatInstitucionalInfo(project),
      logoUrl: project.logoUrl ?? null,
      origemWbs: Boolean(wbs),
      arvore: wbs?.arvore ?? null,
      // Assinatura do gerente só em documento com versão aprovada (mesma regra do Termo).
      assinaturaUrl: vigente ? gerente.signatureUrl : null,
    })
  } catch (err) {
    return errorResponse(err, 'GET', projetoId)
  }
}

/** PUT — salva metadados + árvore (códigos/ordem recalculados pelo servidor). */
export async function PUT(request: Request, { params }: RouteCtx) {
  const { projetoId } = await params

  const { tenantId, role, userId } = await verifySession()
  try {
    await requireProjectAccess(userId, role, tenantId, projetoId, 'documentos:editar')

    const project = await loadProject(tenantId, projetoId)
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const parsed = SaveEapDocumentSchema.safeParse(body ?? {})
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Dados inválidos'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    // Com a aba EAP/WBS montada, a versão salva guarda a estrutura dela (não a do cliente).
    const wbs = await nodesDaWbs(projetoId, tenantId)
    if (wbs) parsed.data.nodes = wbs.nodes as unknown as typeof parsed.data.nodes
    parsed.data.projectManager = (await gerenteDoProjeto(projetoId)).nome
    const nodes = parsed.data.nodes as unknown as EapNode[]
    if (!validateEapDepth(nodes)) {
      return NextResponse.json(
        { error: 'Profundidade máxima de 20 níveis excedida.' },
        { status: 400 },
      )
    }

    const version = await submeterDocumento({ tenantId, role, userId }, projetoId, 'EAP', parsed.data, { commitTitle: 'Atualização da EAP', versao: parsed.data.version, elaboradoPor: parsed.data.preparedBy, aprovadoPor: parsed.data.approvedBy, dataAprovacao: parsed.data.approvalDate ?? '' })
    const base = await getOrCreateDocument(projetoId, tenantId, project.name)
    return NextResponse.json({ document: { ...base, ...(version.payload as object) }, status: version.status, versionId: version.id })

  } catch (err) {
    return errorResponse(err, 'PUT', projetoId)
  }
}

/** POST — "Criar a partir do modelo EAP": recria o documento do template. */
export async function POST(_: Request, { params }: RouteCtx) {
  const { projetoId } = await params

  const { tenantId, role, userId } = await verifySession()
  try {
    await requireProjectAccess(userId, role, tenantId, projetoId, 'documentos:excluir')
    await exigirPermissao({ userId, role, tenantId }, projetoId, 'documentos:aprovar')

    const project = await loadProject(tenantId, projetoId)
    if (!project) {
      return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    }

    await exigirPermissao({ userId, role, tenantId }, projetoId, 'documentos:editar')
    const template = await ensureTemplate(tenantId)
    const base = await getOrCreateDocument(projetoId, tenantId, project.name)
    const document = { ...base, projectName: project.name, version: '1.0', projectManager: (await gerenteDoProjeto(projetoId)).nome, preparedBy: '', approvedBy: '', signature: '', approvalDate: null, nodes: structureFromTemplate(template.structure as unknown as EapNode[]) }
    await submeterDocumento({ tenantId, role, userId }, projetoId, 'EAP', document, { commitTitle: 'Restaurar modelo da EAP', versao: document.version, elaboradoPor: document.preparedBy, aprovadoPor: document.approvedBy, dataAprovacao: document.approvalDate ?? '' })
    return NextResponse.json({ document })
  } catch (err) {
    return errorResponse(err, 'POST', projetoId)
  }
}
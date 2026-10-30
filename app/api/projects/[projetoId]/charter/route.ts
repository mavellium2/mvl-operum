import { NextResponse } from 'next/server'
import { gerenteDoProjeto } from '@/services/gerenteProjeto'
import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { canProjectPermission as can } from '@/services/projectAccess'
import { documentoVigente, salvarRascunho } from '@/services/documentRevisionService'
import { documentRevisionErrorResponse } from '@/lib/documentRevisionHttp'
import { getTree } from '@/services/wbsService'
import { cabecalhoDaAta } from '@/services/ataService'

export async function GET(
  _: Request,
  { params }: { params: Promise<{ projetoId: string }> },
) {
  const { projetoId } = await params

  const { tenantId, role, userId } = await verifySession()
  try {
    const sessao = { tenantId, role, userId }
    if (!await can(sessao, projetoId, 'documentos:ver')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const project = await prisma.project.findFirst({
      where: { id: projetoId, tenantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        logoUrl: true,
        startDate: true,
        justificativa: true,
        objetivos: true,
        metodologia: true,
        descricaoProduto: true,
        premissas: true,
        restricoes: true,
        limitesAutoridade: true,
      },
    })
    if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })

    // Fonte única: macrofases = nós top-level da árvore WBS (EAP/Planilha).
    // Fallback: tabela ProjectMacroFase (projetos legados sem árvore).
    const tree = await getTree(projetoId, tenantId)
    let macroFases: Array<{ fase: string; dataLimite?: string; custo?: string; id?: string }> = []
    if (tree.rootId && tree.nodes[tree.rootId]) {
      const topLevelIds = tree.nodes[tree.rootId].childrenIds
      macroFases = topLevelIds.map(faseId => {
        const fase = tree.nodes[faseId]
        const props = (fase?.properties as Record<string, unknown>) ?? {}
        return {
          id: fase?.id,
          fase: fase?.title ?? '',
          dataLimite: typeof props.dataLimite === 'string' ? props.dataLimite : '',
          custo: props.custo != null ? String(props.custo) : '',
        }
      }).filter(f => f.fase)
    }
    // Fallback para projetos legados sem árvore WBS
    if (macroFases.length === 0) {
      const legacy = await prisma.projectMacroFase.findMany({
        where: { projectId: projetoId },
        orderBy: { createdAt: 'asc' },
      })
      macroFases = legacy.map(f => ({
        id: f.id,
        fase: f.fase,
        dataLimite: f.dataLimite ?? undefined,
        custo: f.custo ?? undefined,
      }))
    }

    const [gerente, userProjects, cabecalho] = await Promise.all([
      gerenteDoProjeto(projetoId),
      prisma.userProject.findMany({
        where: { projectId: projetoId, active: true },
        include: { user: { select: { name: true, signatureUrl: true } } },
        orderBy: { order: 'asc' },
      }),
      // Linha institucional do cadastro (Editar projeto > Informações iniciais), igual à da Ata.
      cabecalhoDaAta(tenantId, projetoId),
    ])

    const membros = userProjects
      .filter(up => up.user !== null)
      // papel: cargos do cadastro (UserProject.role), para sair "Nome – Papel" em Principais envolvidos.
      .map(up => ({ name: up.user.name, papel: up.role ?? '' }))

    const vigente = await documentoVigente(sessao, projetoId, 'CHARTER')
    const snapshot = vigente?.payload as Record<string, unknown> | null
    if (snapshot) { Object.assign(project, snapshot); if (Array.isArray(snapshot.macroFases)) macroFases = snapshot.macroFases as typeof macroFases }
    return NextResponse.json({
      project,
      macroFases,
      gerente: gerente.nome ? { name: gerente.nome, signatureUrl: gerente.signatureUrl } : null,
      gerenteProjeto: gerente.nome,
      membros,
      instituicao: cabecalho.instituicao,
    })
  } catch (err) {
    console.error('[charter GET]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projetoId: string }> }) {
  const session = await verifySession()
  try {
    const { projetoId } = await params
    const draft = await salvarRascunho(session, projetoId, 'CHARTER', await request.json())
    return NextResponse.json({ saved: true, draftId: draft.id })
  } catch (error) { return documentRevisionErrorResponse(error) }
}

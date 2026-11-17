import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { canProjectPermission as can } from '@/services/projectAccess'
import { documentoVigente } from '@/services/documentRevisionService'
import { cabecalhoDaAta } from '@/services/ataService'
import { gerenteDoProjeto } from '@/services/gerenteProjeto'

/**
 * Dados do sistema para os formulários de GP (Declaração do Escopo, Riscos e
 * Lições Aprendidas): linha institucional, nome, logo, gerente e assinatura do
 * projeto; textos do Termo vigente (ponto de partida do Escopo) e os níveis 1 e 2
 * da EAP (Lista de entregas). O conteúdo salvo vem das versões (`/revisions`).
 */
export async function GET(_: Request, { params }: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await params
  const { tenantId, role, userId } = await verifySession()
  const sessao = { tenantId, role, userId }
  try {
    if (!await can(sessao, projetoId, 'documentos:ver')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const projeto = await prisma.project.findFirst({
      where: { id: projetoId, tenantId, deletedAt: null },
      select: { justificativa: true, objetivos: true, descricaoProduto: true },
    })
    if (!projeto) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    const [cabecalho, gerente, termo, raiz] = await Promise.all([
      cabecalhoDaAta(tenantId, projetoId),
      gerenteDoProjeto(projetoId),
      documentoVigente(sessao, projetoId, 'CHARTER'),
      prisma.wbsNode.findFirst({ where: { projectId: projetoId, tenantId, parentId: null }, orderBy: { order: 'asc' }, select: { id: true, code: true, title: true } }),
    ])
    const filhos = raiz
      ? await prisma.wbsNode.findMany({ where: { projectId: projetoId, tenantId, parentId: raiz.id }, orderBy: { order: 'asc' }, select: { code: true, title: true } })
      : []
    const t = (termo?.payload ?? {}) as { justificativa?: string | null; objetivos?: string | null; descricaoProduto?: string | null }
    return NextResponse.json({
      nomeProjeto: cabecalho.nomeProjeto ?? '',
      instituicao: cabecalho.instituicao,
      logoUrl: cabecalho.logoUrl,
      gerente: { nome: gerente.nome, assinaturaUrl: gerente.signatureUrl ?? null },
      termo: {
        justificativa: t.justificativa ?? projeto.justificativa ?? '',
        objetivos: t.objetivos ?? projeto.objetivos ?? '',
        descricaoProduto: t.descricaoProduto ?? projeto.descricaoProduto ?? '',
      },
      entregas: {
        raiz: raiz ? { codigo: raiz.code, titulo: raiz.title } : null,
        itens: filhos.filter(f => f.title.trim()).map(f => ({ codigo: f.code, titulo: f.title })),
      },
    })
  } catch (err) {
    console.error('[formularios GET]', err instanceof Error ? err.name : 'Error')
    return NextResponse.json({ error: 'Erro ao carregar os dados do documento' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { canProjectPermission as can } from '@/services/projectAccess'
import { documentoVigente } from '@/services/documentRevisionService'
import { capaPadrao } from '@/lib/capaPadrao'

/**
 * Dados da Capa: o que vem do sistema (nome, logo e integrantes do projeto) e os
 * valores iniciais dos campos editáveis. O conteúdo salvo vem das versões (`/revisions`).
 */
export async function GET(_: Request, { params }: { params: Promise<{ projetoId: string }> }) {
  const { projetoId } = await params
  const { tenantId, role, userId } = await verifySession()
  const sessao = { tenantId, role, userId }
  try {
    if (!await can(sessao, projetoId, 'documentos:ver')) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    const projeto = await prisma.project.findFirst({
      where: { id: projetoId, tenantId, deletedAt: null },
      select: { name: true, logoUrl: true, semestre: true, ano: true },
    })
    if (!projeto) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
    const [membros, termo] = await Promise.all([
      prisma.userProject.findMany({
        where: { projectId: projetoId, active: true, user: { tenantId, deletedAt: null, isActive: true } },
        select: { user: { select: { name: true } } },
        orderBy: { order: 'asc' },
      }),
      documentoVigente(sessao, projetoId, 'CHARTER'),
    ])
    const envolvidos = (termo?.payload as { principaisEnvolvidos?: string } | null)?.principaisEnvolvidos ?? ''
    return NextResponse.json({
      nomeProjeto: projeto.name,
      logoUrl: projeto.logoUrl,
      integrantes: membros.map(m => m.user.name).filter(Boolean),
      padrao: capaPadrao({
        semestre: projeto.semestre, ano: projeto.ano, principaisEnvolvidos: envolvidos,
      }),
    })
  } catch (err) {
    console.error('[capa GET]', err instanceof Error ? err.name : 'Error')
    return NextResponse.json({ error: 'Erro ao carregar a capa' }, { status: 500 })
  }
}

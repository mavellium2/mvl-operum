import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { findById } from '@/services/projectAccess'
import { permissoesNoProjeto } from '@/services/authz'
import { getTree } from '@/services/wbsService'
import { sincronizarEapSprintSePermitido } from '@/services/eapSprintSyncService'
import { computarPlanilhaCustos, fmtDataBR, aplicarDescricoesDosCards, cardsDasAtividades, type Elaborador } from '@/lib/planilhaCustos'
import prisma from '@/lib/prisma'
import PlanilhaCustosView from '@/components/custos/PlanilhaCustosView'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Planilha de Custos' }

export default async function PlanilhaCustosPage({
  params,
}: {
  params: Promise<{ projetoId: string }>
}) {
  const { projetoId } = await params
  const { role, userId, tenantId } = await verifySession()

  const project = await findById(projetoId)
  if (!project) notFound()

  const permissoes = await permissoesNoProjeto(userId, tenantId, role, projetoId)
  if (!permissoes.has('projeto:ver') || !permissoes.has('planilha:ver')) notFound()
  const canEdit = permissoes.has('planilha:orcado')

  const valorReferencia = project.valorReferencia ?? 4000
  const horasPorDia = project.horasPorDia ?? 8

  // Membros internos do projeto (elaboradores) — trazem salário e jornada.
  const userProjects = await prisma.userProject.findMany({
    where: { projectId: projetoId, active: true },
    include: {
      user: { select: { id: true, name: true, email: true, deletedAt: true, isActive: true } },
      department: { select: { name: true } },
    },
    orderBy: { order: 'asc' },
  })

  const elaboradores: Elaborador[] = userProjects
    .filter(up => up.user.deletedAt === null && up.user.isActive)
    .map(up => ({
      userId: up.userId,
      name: up.user.name,
      remuneracao: up.remuneracao ?? null,
      horasDiarias: up.horasDiarias ?? null,
    }))

  const elaboradoresPorId = new Map(elaboradores.map(e => [e.userId, e]))

  // Usuários do tenant (para adicionar elaborador inline — membros do projeto).
  const allUsers = await prisma.user.findMany({
    where: { tenantId, deletedAt: null, isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  })
  const usuariosDisponiveis = allUsers.map(u => ({ id: u.id, name: u.name, email: u.email }))

  await sincronizarEapSprintSePermitido({ userId, tenantId, role }, projetoId)
  const tree = await getTree(projetoId, tenantId)
  const calculada = computarPlanilhaCustos(tree.nodes, tree.rootId, { valorReferencia, horasPorDia }, elaboradoresPorId)
  // Descrição mostrada ao passar o mouse na tarefa: a atual do card ligado, quando houver.
  const cardIds = cardsDasAtividades(calculada, tree.nodes)
  const cards = cardIds.length
    ? await prisma.card.findMany({ where: { id: { in: cardIds }, deletedAt: null }, select: { id: true, description: true } })
    : []
  const planilha = aplicarDescricoesDosCards(calculada, tree.nodes, new Map(cards.map(c => [c.id, c.description ?? ''])))

  return (
    <PlanilhaCustosView
      projetoId={projetoId}
      nomeProjeto={project.name}
      inicioProjeto={project.startDate ? fmtDataBR(project.startDate.toISOString()) : '—'}
      fimProjeto={project.endDate ? fmtDataBR(project.endDate.toISOString()) : '—'}
      canEdit={canEdit}
      currentUserId={userId}
      canEditOwnActual={permissoes.has('planilha:realizado-proprio')}
      canEditAllActual={permissoes.has('planilha:realizado-todos')}
      canManageMembers={permissoes.has('projeto:equipe')}
      // Inserir/excluir linha muda a EAP; excluir exige as mesmas permissões do autosave dela.
      canEditLinhas={['projeto:editar', 'planilha:orcado', 'planilha:realizado-todos'].every(p => permissoes.has(p as never))}
      planilha={planilha}
      elaboradores={elaboradores}
      usuariosDisponiveis={usuariosDisponiveis}
      exportUrl={`/api/projetos/${projetoId}/planilha-custos/export`}
    />
  )
}

import { notFound } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { findById } from '@/services/projectAccess'
import { permissoesNoProjeto } from '@/services/authz'
import { getTree, resetTree } from '@/services/wbsService'
import { podeSincronizar, sincronizarEapSprintSePermitido } from '@/services/eapSprintSyncService'
import { statusDaSincronizacao } from '@/services/sincronizacaoStatus'
import StatusSincronizacao from '@/components/sincronizacao/StatusSincronizacao'
import { computarPlanilhaCustos, fmtDataBR, aplicarCardsDasAtividades, cardsDasAtividades, type Elaborador } from '@/lib/planilhaCustos'
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
  const canEditLinhas = ['projeto:editar', 'planilha:orcado', 'planilha:realizado-todos'].every(p => permissoes.has(p as never))

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

  await sincronizarEapSprintSePermitido({ userId, tenantId, role }, projetoId)
  const [statusSync, sincroniza] = await Promise.all([statusDaSincronizacao(projetoId, tenantId), podeSincronizar({ userId, tenantId, role }, projetoId)])
  let tree = await getTree(projetoId, tenantId)
  if (!tree.rootId && canEditLinhas) {
    await resetTree({ projectId: projetoId, tenantId, rootTitle: project.name }, userId)
    tree = await getTree(projetoId, tenantId)
  }
  const calculada = computarPlanilhaCustos(tree.nodes, tree.rootId, { valorReferencia, horasPorDia }, elaboradoresPorId)
  // Card ligado a cada atividade: descrição atual, sprint e etapa (timer e painel de detalhes).
  const cardIds = cardsDasAtividades(calculada, tree.nodes)
  const cards = cardIds.length
    ? await prisma.card.findMany({
      where: { id: { in: cardIds }, deletedAt: null, OR: [{ projectId: projetoId }, { sprint: { projectId: projetoId } }] },
      select: { id: true, description: true, priority: true, sprintId: true, sprintColumn: { select: { title: true } } },
    })
    : []
  const planilha = aplicarCardsDasAtividades(calculada, tree.nodes, new Map(cards.map(c => [c.id, {
    description: c.description ?? '', priority: c.priority, sprintId: c.sprintId, etapa: c.sprintColumn?.title ?? null,
  }])))

  return (
    <>
    <StatusSincronizacao projectId={projetoId} inicial={statusSync} podeSincronizar={sincroniza} flutuante />
    <PlanilhaCustosView
      projetoId={projetoId}
      nomeProjeto={project.name}
      inicioProjeto={project.startDate ? fmtDataBR(project.startDate.toISOString()) : '—'}
      fimProjeto={project.endDate ? fmtDataBR(project.endDate.toISOString()) : '—'}
      canEdit={canEdit}
      currentUserId={userId}
      canEditOwnActual={permissoes.has('planilha:realizado-proprio')}
      canEditAllActual={permissoes.has('planilha:realizado-todos')}
      // Inserir/excluir linha muda a EAP; excluir exige as mesmas permissões do autosave dela.
      canEditLinhas={canEditLinhas}
      // Timer e descrição gravam no card da sprint: mesma permissão do quadro.
      canUsarCards={permissoes.has('quadro:cards')}
      rootId={tree.rootId}
      planilha={planilha}
      elaboradores={elaboradores}
      exportUrl={`/api/projetos/${projetoId}/planilha-custos/export`}
    />
    </>
  )
}

import 'server-only'
import { sincronizarCardsDaPlanilha } from './planilhaCardSync'
import prisma from '@/lib/prisma'
import { computarPlanilhaCustos, type Elaborador, type PlanilhaDeCustos } from '@/lib/planilhaCustos'
import { round2 } from '@/lib/custosCalc'
import { aplicarResumoDaPlanilha, getTree } from './wbsService'

/** Membros internos ativos do projeto, com salário e jornada (elaboradores da planilha). */
export async function elaboradoresDoProjeto(projectId: string): Promise<Elaborador[]> {
  const userProjects = await prisma.userProject.findMany({
    where: { projectId, active: true },
    include: { user: { select: { id: true, name: true, deletedAt: true, isActive: true } } },
    orderBy: { order: 'asc' },
  })
  return userProjects
    .filter(up => up.user.deletedAt === null && up.user.isActive)
    .map(up => ({ userId: up.userId, name: up.user.name, remuneracao: up.remuneracao ?? null, horasDiarias: up.horasDiarias ?? null }))
}

/** Planilha de custos do projeto, calculada da árvore EAP/WBS atual. */
export async function planilhaDoProjeto(projectId: string, tenantId: string): Promise<PlanilhaDeCustos | null> {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { valorReferencia: true, horasPorDia: true } })
  if (!project) return null
  const [tree, elaboradores] = await Promise.all([getTree(projectId, tenantId), elaboradoresDoProjeto(projectId)])
  return computarPlanilhaCustos(
    tree.nodes, tree.rootId,
    { valorReferencia: project.valorReferencia ?? 4000, horasPorDia: project.horasPorDia ?? 8 },
    new Map(elaboradores.map(e => [e.userId, e])),
  )
}

/**
 * Datas e custos vindos da planilha: data fim de cada fase/sprint (maior data
 * prevista das atividades), data fim do projeto (maior data fim das fases) e
 * custo da fase no cronograma financeiro (valor orçado).
 */
export async function propagarPlanilhaDeCustos(projectId: string, tenantId: string) {
  const planilha = await planilhaDoProjeto(projectId, tenantId)
  if (!planilha) return null
  const fases = planilha.macrofases.map(f => ({
    nodeId: f.nodeId,
    dataFim: f.dataFim,
    // Fase sem nenhuma atividade com valor calculado mantém o custo informado à mão.
    custo: f.atividades.some(a => a.totalOrcado !== null) ? round2(f.totalOrcado) : null,
  }))
  const resumo = await aplicarResumoDaPlanilha(projectId, tenantId, fases, planilha.dataFimProjeto)
  await sincronizarCardsDaPlanilha(projectId, tenantId)
  return resumo
}

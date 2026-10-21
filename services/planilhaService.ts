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

async function planilhaComArvore(projectId: string, tenantId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { valorReferencia: true, horasPorDia: true } })
  if (!project) return null
  const [tree, elaboradores] = await Promise.all([getTree(projectId, tenantId), elaboradoresDoProjeto(projectId)])
  const planilha = computarPlanilhaCustos(
    tree.nodes, tree.rootId,
    { valorReferencia: project.valorReferencia ?? 4000, horasPorDia: project.horasPorDia ?? 8 },
    new Map(elaboradores.map(e => [e.userId, e])),
  )
  return { planilha, tree }
}

/** Planilha de custos do projeto, calculada da árvore EAP/WBS atual. */
export async function planilhaDoProjeto(projectId: string, tenantId: string): Promise<PlanilhaDeCustos | null> {
  return (await planilhaComArvore(projectId, tenantId))?.planilha ?? null
}

/** Dados da linha da planilha exibidos no minicard do card ligado à atividade. */
export interface ResumoCardPlanilha {
  minOrcado: number
  minReal: number
  dataPrevista: string | null
  dataRealizacao: string | null
  /** null sem valor calculado (sem elaborador com salário e sem materiais). */
  totalOrcado: number | null
  totalReal: number | null
}

/**
 * Linha da planilha de cada card (vínculo `WbsNode.properties.cardId`), para o
 * minicard mostrar as mesmas horas, datas e valores da atividade.
 */
export async function resumoDaPlanilhaPorCard(projectId: string, tenantId: string): Promise<Map<string, ResumoCardPlanilha>> {
  const r = await planilhaComArvore(projectId, tenantId)
  const mapa = new Map<string, ResumoCardPlanilha>()
  if (!r) return mapa
  for (const fase of r.planilha.macrofases) {
    for (const a of fase.atividades) {
      const cardId = (r.tree.nodes[a.nodeId]?.properties as { cardId?: unknown } | undefined)?.cardId
      if (typeof cardId !== 'string' || !cardId) continue
      mapa.set(cardId, {
        minOrcado: a.minOrcado, minReal: a.minReal,
        dataPrevista: a.dataPrevista, dataRealizacao: a.dataRealizacao,
        totalOrcado: a.totalOrcado, totalReal: a.totalReal,
      })
    }
  }
  return mapa
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

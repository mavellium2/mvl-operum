'use server'

import { executarOperacaoProjeto } from '@/services/projetoOperacaoService'
import { registrarVersaoProjetoEmTransacao } from '@/services/projetoVersoes'
import { RegistroVersaoSchema } from '@/lib/projetoVersaoSchema'
import { parseMoeda } from '@/lib/dinheiro'
import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import prisma from '@/lib/prisma'
import { requireProjectPermission } from '@/services/projectAccess'
import { deleteNode } from '@/services/wbsService'
import { planilhaDoProjeto } from '@/services/planilhaService'
import { MOTIVO_MINIMO, resumoDaSprint, sprintTemDados } from '@/services/sprintHistoricoService'
import { listarVersoesProjeto, type RegistroVersao, type VersaoProjeto } from '@/services/projetoVersoes'

/** Histórico de versões do Editar projeto (mais recente primeiro). */
export async function listarVersoesProjetoAction(projetoId: string): Promise<{ versoes: VersaoProjeto[] } | { error: string }> {
  try {
    const sessao = await verifySession()
    await requireProjectPermission(sessao, projetoId, 'projeto:editar')
    return { versoes: await listarVersoesProjeto(sessao.tenantId, projetoId) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível carregar o histórico.' }
  }
}

export interface ImpactoExclusaoFase {
  fase: string
  codigo: string
  /** Itens da EAP abaixo da fase (sem contar a própria fase). */
  itensEap: number
  /** Tarefas (cards) ligadas a itens da fase, que serão excluídas. */
  tarefas: number
  sprints: { nome: string; tarefas: number; segundosRegistrados: number; comDados: boolean }[]
  /** Orçamento salvo no cronograma; não deve ser somado ao orçamento da planilha. */
  orcamentoCronograma?: number
  orcado: number
  realizado: number
  exigeMotivo: boolean
}

/** Ids da fase e de tudo abaixo dela. */
async function subarvore(projetoId: string, tenantId: string, nodeId: string): Promise<string[]> {
  const ids = [nodeId]
  for (let i = 0; i < ids.length; i++) {
    const filhos = await prisma.wbsNode.findMany({ where: { parentId: ids[i], projectId: projetoId, tenantId }, select: { id: true } })
    ids.push(...filhos.map(f => f.id))
  }
  return ids
}

/** O que acontece ao excluir uma macro fase: EAP, sprint, tarefas e custos ligados a ela. */
export async function impactoExclusaoFaseAction(projetoId: string, nodeId: string): Promise<{ impacto: ImpactoExclusaoFase } | { error: string }> {
  try {
    const sessao = await verifySession()
    const { tenantId } = sessao
    await requireProjectPermission(sessao, projetoId, 'projeto:editar')
    const no = await prisma.wbsNode.findFirst({ where: { id: nodeId, projectId: projetoId, tenantId }, select: { id: true, title: true, code: true, parentId: true, properties: true } })
    if (!no || !no.parentId) return { error: 'Fase não encontrada na EAP.' }
    const ids = await subarvore(projetoId, tenantId, nodeId)
    const nos = await prisma.wbsNode.findMany({ where: { id: { in: ids }, projectId: projetoId, tenantId }, select: { properties: true } })
    const props = nos.map(n => (n.properties as Record<string, unknown> | null) ?? {})
    const cardIds = props.map(p => p.cardId).filter((v): v is string => typeof v === 'string')
    const sprintIds = props.map(p => p.sprintId).filter((v): v is string => typeof v === 'string')
    const tarefas = cardIds.length
      ? await prisma.card.count({ where: { id: { in: cardIds }, deletedAt: null, OR: [{ projectId: projetoId }, { sprint: { projectId: projetoId } }] } })
      : 0
    const sprints: ImpactoExclusaoFase['sprints'] = []
    for (const sid of sprintIds) {
      const r = await resumoDaSprint(sid, undefined, tenantId)
      if (r && r.projectId === projetoId) sprints.push({ nome: r.nome, tarefas: r.cards, segundosRegistrados: r.segundosRegistrados, comDados: sprintTemDados(r) })
    }
    const planilha = await planilhaDoProjeto(projetoId, tenantId)
    const linha = planilha?.macrofases.find(f => f.nodeId === nodeId)
    const cadastradas = await prisma.projectMacroFase.findMany({ where: { projectId: projetoId, project: { tenantId } }, select: { fase: true, custo: true } })
    const propsFase = (no.properties as Record<string, unknown> | null) ?? {}
    const faseCadastrada = cadastradas.find(f => f.fase.trim().toLowerCase() === no.title.trim().toLowerCase())
    return {
      impacto: {
        fase: no.title, codigo: no.code, itensEap: ids.length - 1, tarefas, sprints,
        orcamentoCronograma: linha?.atividades?.some(a => a.totalOrcado !== null) ? linha.totalOrcado : parseMoeda(typeof propsFase.custo === 'string' || typeof propsFase.custo === 'number' ? propsFase.custo : faseCadastrada?.custo ?? '') || 0,
        orcado: linha?.totalOrcado ?? 0, realizado: linha?.totalReal ?? 0,
        exigeMotivo: sprints.some(s => s.comDados),
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível calcular o impacto da exclusão.' }
  }
}

/**
 * Exclui uma macro fase pelo mesmo caminho da aba EAP/WBS (subárvore, tarefas,
 * sprint com motivo quando tem dados, histórico) e tira a fase do cadastro de
 * macro fases, para a sincronização não a recriar. Grava a versão do projeto.
 */
export async function excluirFaseAction(projetoId: string, nodeId: string, motivo: string, versao?: RegistroVersao): Promise<{ ok: true } | { error: string }> {
  try {
    const sessao = await verifySession()
    const { tenantId, userId } = sessao
    await requireProjectPermission(sessao, projetoId, 'projeto:editar')
    await requireProjectPermission(sessao, projetoId, 'planilha:orcado')
    await requireProjectPermission(sessao, projetoId, 'planilha:realizado-todos')
    if (versao && !RegistroVersaoSchema.safeParse(versao).success) return { error: 'O registro desta exclusão está incompleto ou excede os limites permitidos. Nenhuma fase foi excluída.' }
    await executarOperacaoProjeto(sessao, projetoId, versao?.operacaoId, { tipo: 'excluir', nodeId, motivo, versao }, async tx => {
    const no = await tx.wbsNode.findFirst({ where: { id: nodeId, projectId: projetoId, tenantId }, select: { title: true, parentId: true } })
    if (!no) throw new Error('Fase não encontrada na EAP.')
    const raiz = await tx.wbsNode.findFirst({ where: { projectId: projetoId, tenantId, parentId: null }, select: { id: true } })
    if (!no.parentId || no.parentId !== raiz?.id) throw new Error('Só macro fases (nível 1 da EAP) podem ser excluídas por aqui.')
    const justificativa = motivo.trim()
    if (justificativa && justificativa.length < MOTIVO_MINIMO) throw new Error(`Informe o motivo com pelo menos ${MOTIVO_MINIMO} caracteres.`)

    await deleteNode({ nodeId, projectId: projetoId, tenantId, motivoExclusao: justificativa || undefined }, userId, tx)
    // A fase também sai do cadastro de macro fases (fonte da sincronização), pelo nome.
    const titulo = no.title.trim().toLowerCase()
    const cadastradas = await tx.projectMacroFase.findMany({ where: { projectId: projetoId }, select: { id: true, fase: true } })
    const remover = cadastradas.filter(f => f.fase.trim().toLowerCase() === titulo).map(f => f.id)
    if (remover.length) await tx.projectMacroFase.deleteMany({ where: { id: { in: remover }, projectId: projetoId } })

    if (versao) await registrarVersaoProjetoEmTransacao(tx, { tenantId, projectId: projetoId, userId }, versao)
    return { ok: true as const }
    })
    for (const caminho of ['wbs', 'planilha-custos', 'sprints', 'documentacao', 'configuracoes']) revalidatePath(`/projetos/${projetoId}/${caminho}`)
    return { ok: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Não foi possível excluir a fase.' }
  }
}

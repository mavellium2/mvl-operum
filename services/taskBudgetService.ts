import 'server-only'
import prisma from '@/lib/prisma'
import { exigirPermissao, permissoesNoProjeto, type SessaoAuthz } from './authz'
import { getTree, updateNodeProperties, WbsNotFoundError, WbsValidationError } from './wbsService'
import { TaskBudgetSchema } from '@/lib/validation/taskBudgetSchemas'

/** Resolve sempre pelo card persistido; nunca aceita projeto ou nó escolhido pelo cliente. */
export async function taskBudgetTarget(session: SessaoAuthz, cardId: string, write = false) {
  const card = await prisma.card.findFirst({
    where: { id: cardId, deletedAt: null, OR: [
      { sprint: { deletedAt: null, project: { tenantId: session.tenantId, deletedAt: null } } },
      { sprintId: null, project: { tenantId: session.tenantId, deletedAt: null } },
    ] },
    select: { projectId: true, sprint: { select: { projectId: true } } },
  })
  const projectId = card?.sprint?.projectId ?? card?.projectId
  if (!projectId) throw new WbsNotFoundError('Tarefa não encontrada')
  await exigirPermissao(session, projectId, 'projeto:ver')
  await exigirPermissao(session, projectId, 'planilha:ver')
  if (write) await exigirPermissao(session, projectId, 'planilha:orcado')
  const tree = await getTree(projectId, session.tenantId)
  const matches = Object.values(tree.nodes).filter(n => n.properties?.cardId === cardId)
  if (matches.length !== 1) throw new WbsValidationError(matches.length
    ? 'Mais de uma atividade está vinculada ao card. Revise a EAP antes de orçar.'
    : 'Card sem atividade vinculada na EAP. Sincronize a EAP e as sprints antes de orçar.')
  const node = matches[0]
  if (node.childrenIds.length) throw new WbsValidationError('O orçamento deve ser informado em uma atividade folha da EAP.')
  return { projectId, node }
}

export async function getTaskBudget(session: SessaoAuthz, cardId: string) {
  const { projectId, node } = await taskBudgetTarget(session, cardId)
  return { task_id: cardId, project_id: projectId, node_id: node.id,
    estimated_minutes: node.properties.tempoMinutos ?? 0, source: 'planilha_custos' }
}

export async function setTaskBudget(session: SessaoAuthz, cardId: string, raw: unknown) {
  const { estimated_minutes } = TaskBudgetSchema.parse(raw)
  const { projectId, node } = await taskBudgetTarget(session, cardId, true)
  const permissoes = await permissoesNoProjeto(session.userId, session.tenantId, session.role, projectId)
  const result = await updateNodeProperties({ projectId, tenantId: session.tenantId, nodeId: node.id,
    properties: { tempoMinutos: estimated_minutes } }, { userId: session.userId, permissoes })
  // Os custos são calculados da mesma EAP nas leituras. Não propaga conclusão,
  // datas ou movimentações de cards ao alterar somente uma estimativa de esforço.
  return { task_id: cardId, project_id: projectId, node_id: node.id,
    estimated_minutes, source: 'planilha_custos', server_version: result.serverVersion }
}

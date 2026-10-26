import { dataRealizacaoEfetiva } from '@/lib/dataRealizacao'
import 'server-only'
import { taskBudgetTarget } from './taskBudgetService'
import { permissoesNoProjeto, type SessaoAuthz } from './authz'
import { updateNodeProperties } from './wbsService'
import { TaskCostsSchema } from '@/lib/validation/taskCostsSchemas'
import { propagarPlanilhaDeCustos } from './planilhaService'

export async function getTaskCosts(session: SessaoAuthz, cardId: string) {
  const { projectId, node } = await taskBudgetTarget(session, cardId)
  return { task_id: cardId, project_id: projectId, node_id: node.id, source: 'planilha_custos',
    estimated_materials: node.properties.materiais ?? 0,
    actual_materials: node.properties.materiaisReal ?? 0,
    completed_on: dataRealizacaoEfetiva(node.properties) }
}

export async function setTaskCosts(session: SessaoAuthz, cardId: string, raw: unknown) {
  const patch = TaskCostsSchema.parse(raw)
  const { projectId, node } = await taskBudgetTarget(session, cardId)
  const permissoes = await permissoesNoProjeto(session.userId, session.tenantId, session.role, projectId)
  const properties = {
    ...(patch.estimated_materials !== undefined ? { materiais: patch.estimated_materials } : {}),
    ...(patch.actual_materials !== undefined ? { materiaisReal: patch.actual_materials } : {}),
    ...(patch.completed_on !== undefined ? { dataRealizacao: patch.completed_on } : {}),
  }
  // The panel's canonical service checks each field against persisted elaborators and audits.
  const result = await updateNodeProperties({ projectId, tenantId: session.tenantId, nodeId: node.id, properties }, { userId: session.userId, permissoes })
  const synchronization = patch.completed_on !== undefined ? await propagarPlanilhaDeCustos(projectId, session.tenantId) : null
  return { ...await getTaskCosts(session, cardId), server_version: result.serverVersion, synchronization }
}

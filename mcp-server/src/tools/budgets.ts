import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { TenantRegistry } from '../tenants.js'
import { defineTool, idSchema } from '../tool.js'

export function registerBudgetTools(server: McpServer, registry: TenantRegistry) {
  defineTool(server, registry, 'operum_get_task_budget', {
    title: 'Consultar orçamento de esforço da tarefa',
    description: 'Consulta os minutos orçados da atividade vinculada ao card na EAP/Planilha de Custos. Exige planilha:ver. Não é tempo realizado.',
    inputSchema: { task_id: idSchema }, entity: 'Orçamento da tarefa', annotations: { readOnlyHint: true },
  }, (args, ctx) => ctx.gw.get<Record<string, unknown>>(`/cards/${args.task_id}/budget`))

  defineTool(server, registry, 'operum_set_task_budget', {
    title: 'Definir orçamento de esforço da tarefa',
    description: 'Define estimated_minutes (inteiro em minutos, 0 para zerar) na atividade vinculada ao card na EAP/Planilha de Custos. Exige planilha:ver e planilha:orcado. Usa a origem canônica do painel e registra auditoria. Não altera horas realizadas, responsáveis, datas ou status. Card sem vínculo ou com vínculo ambíguo exige revisão/sincronização da EAP primeiro.',
    inputSchema: { task_id: idSchema, estimated_minutes: z.number().int().min(0).max(2_147_483_647) },
    entity: 'Orçamento da tarefa', annotations: { destructiveHint: false, idempotentHint: true },
  }, (args, ctx) => ctx.gw.patch<Record<string, unknown>>(`/cards/${args.task_id}/budget`, { estimated_minutes: args.estimated_minutes }))
}

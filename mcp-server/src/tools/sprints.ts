import { idSchema } from '../tool'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { TenantRegistry } from '../tenants.js'
import { audit, confirmShape, defineTool, requireConfirm } from '../tool.js'
import { serializeColumn, serializeSprint, serializeTask } from '../serializers.js'
import { dateInput, toIso } from '../dates.js'
import { UserError } from '../errors.js'

export const SPRINT_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const

export function registerSprintTools(server: McpServer, registry: TenantRegistry) {
  defineTool(
    server,
    registry,
    'operum_list_sprints',
    {
      title: 'Listar sprints',
      description:
        'Sprints do projeto com suas colunas (as colunas são as etapas/status do quadro). Tarefas fora de sprint ficam no backlog do projeto.',
      inputSchema: { project_id: idSchema, status: z.enum(SPRINT_STATUSES).optional() },
      entity: 'Projeto',
      annotations: { readOnlyHint: true },
    },
    async ({ project_id, status }, ctx) => {
      let sprints = await ctx.gw.get<Record<string, unknown>[]>('/sprints', { projectId: project_id })
      if (status) sprints = sprints.filter(s => s.status === status)
      return { sprints: sprints.map(s => serializeSprint(s, { includeColumns: true })) }
    },
  )

  defineTool(
    server,
    registry,
    'operum_get_sprint',
    {
      title: 'Detalhar sprint',
      description: 'Sprint com colunas (ordenadas) e, opcionalmente, as tarefas de cada coluna.',
      inputSchema: {
        sprint_id: idSchema,
        include_tasks: z.boolean().optional().describe('Inclui as tarefas agrupadas por coluna (padrão true).'),
      },
      entity: 'Sprint',
      annotations: { readOnlyHint: true },
    },
    async ({ sprint_id, include_tasks }, ctx) => {
      const sprint = await ctx.gw.get<Record<string, unknown>>(`/sprints/${sprint_id}`)
      if (include_tasks === false) return { sprint: serializeSprint(sprint, { includeColumns: true }) }
      const columns = await ctx.gw.get<(Record<string, unknown> & { cards?: Record<string, unknown>[] })[]>(
        `/sprints/${sprint_id}/columns`, { timeEntries: 'summary' },
      )
      return {
        sprint: serializeSprint(sprint),
        columns: columns.map(c => ({ ...serializeColumn(c), tasks: (c.cards ?? []).map(card => serializeTask(card)) })),
      }
    },
  )

  defineTool(
    server,
    registry,
    'operum_create_sprint',
    {
      title: 'Criar sprint',
      description:
        'Cria uma sprint no projeto. O Operum cria automaticamente 4 colunas padrão (A Fazer, Em andamento, Em teste, Concluído) — ajuste com as tools de coluna.',
      inputSchema: {
        project_id: idSchema,
        name: z.string().min(1),
        description: z.string().optional(),
        status: z.enum(SPRINT_STATUSES).optional(),
        start_date: dateInput.optional(),
        end_date: dateInput.optional(),
      },
      entity: 'Projeto',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args, ctx) => {
      const sprint = await ctx.gw.post<Record<string, unknown>>('/sprints', {
        projectId: args.project_id,
        name: args.name,
        description: args.description,
        status: args.status,
        startDate: toIso(args.start_date, 'start_date'),
        endDate: toIso(args.end_date, 'end_date'),
        createdBy: ctx.userId,
      })
      const columns = await ctx.gw.get<Record<string, unknown>[]>(`/sprints/${sprint.id}/columns`, { timeEntries: 'summary' })
      await audit(ctx, 'operum_create_sprint', 'CREATE', 'sprint', String(sprint.id), { projectId: args.project_id })
      return { sprint: { ...serializeSprint(sprint), columns: columns.map(serializeColumn) } }
    },
  )

  defineTool(
    server,
    registry,
    'operum_update_sprint',
    {
      title: 'Atualizar sprint',
      description: 'Altera nome, descrição, status, datas ou avaliação (qualidade/dificuldade) da sprint.',
      inputSchema: {
        sprint_id: idSchema,
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        status: z.enum(SPRINT_STATUSES).optional(),
        start_date: dateInput.optional(),
        end_date: dateInput.optional(),
        qualidade: z.number().optional(),
        dificuldade: z.number().optional(),
      },
      entity: 'Sprint',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ sprint_id, start_date, end_date, ...rest }, ctx) => {
      const body = Object.fromEntries(
        Object.entries({ ...rest, startDate: toIso(start_date, 'start_date'), endDate: toIso(end_date, 'end_date') }).filter(
          ([, v]) => v !== undefined,
        ),
      )
      if (Object.keys(body).length === 0) throw new UserError('Nenhum campo para alterar.')
      const sprint = await ctx.gw.patch<Record<string, unknown>>(`/sprints/${sprint_id}`, body)
      await audit(ctx, 'operum_update_sprint', 'UPDATE', 'sprint', sprint_id, { fields: Object.keys(body) })
      return { sprint: serializeSprint(sprint) }
    },
  )

  defineTool(
    server,
    registry,
    'operum_delete_sprint',
    {
      title: 'Excluir sprint',
      description: 'Exclui a sprint; as tarefas dela voltam para o backlog do projeto. Exige confirm: true.',
      inputSchema: { sprint_id: idSchema, ...confirmShape },
      entity: 'Sprint',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ sprint_id, confirm }, ctx) => {
      requireConfirm(confirm, 'Excluir sprint')
      await ctx.gw.delete(`/sprints/${sprint_id}`)
      await audit(ctx, 'operum_delete_sprint', 'DELETE', 'sprint', sprint_id)
      return { deleted: true, sprint_id }
    },
  )

  defineTool(
    server,
    registry,
    'operum_create_column',
    {
      title: 'Criar coluna',
      description: 'Cria uma coluna (etapa/status) na sprint. position define a ordem (0 = primeira); padrão: ao final.',
      inputSchema: { sprint_id: idSchema, title: z.string().min(1), position: z.number().int().min(0).optional() },
      entity: 'Sprint',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ sprint_id, title, position }, ctx) => {
      let pos = position
      if (pos === undefined) {
        const cols = await ctx.gw.get<Record<string, unknown>[]>(`/sprints/${sprint_id}/columns`, { timeEntries: 'summary' })
        pos = cols.reduce((max, c) => Math.max(max, Number(c.position ?? -1)), -1) + 1
      }
      const column = await ctx.gw.post<Record<string, unknown>>(`/sprints/${sprint_id}/columns`, { title, position: pos })
      await audit(ctx, 'operum_create_column', 'CREATE', 'sprint_column', String(column.id), { sprintId: sprint_id })
      return { column: serializeColumn(column) }
    },
  )

  defineTool(
    server,
    registry,
    'operum_update_column',
    {
      title: 'Atualizar coluna',
      description: 'Renomeia ou reposiciona uma coluna da sprint.',
      inputSchema: {
        sprint_id: idSchema,
        column_id: idSchema,
        title: z.string().min(1).optional(),
        position: z.number().int().min(0).optional(),
      },
      entity: 'Coluna',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ sprint_id, column_id, title, position }, ctx) => {
      if (title === undefined && position === undefined) throw new UserError('Informe title e/ou position.')
      const column = await ctx.gw.patch<Record<string, unknown>>(`/sprints/${sprint_id}/columns/${column_id}`, {
        ...(title !== undefined ? { title } : {}),
        ...(position !== undefined ? { position } : {}),
      })
      await audit(ctx, 'operum_update_column', 'UPDATE', 'sprint_column', column_id, { sprintId: sprint_id })
      return { column: serializeColumn(column) }
    },
  )

  defineTool(
    server,
    registry,
    'operum_delete_column',
    {
      title: 'Excluir coluna',
      description: 'Exclui uma coluna da sprint. Mova as tarefas dela antes (operum_move_task). Exige confirm: true.',
      inputSchema: { sprint_id: idSchema, column_id: idSchema, ...confirmShape },
      entity: 'Coluna',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ sprint_id, column_id, confirm }, ctx) => {
      requireConfirm(confirm, 'Excluir coluna')
      await ctx.gw.delete(`/sprints/${sprint_id}/columns/${column_id}`)
      await audit(ctx, 'operum_delete_column', 'DELETE', 'sprint_column', column_id, { sprintId: sprint_id })
      return { deleted: true, column_id }
    },
  )
}

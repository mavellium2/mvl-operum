import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { TenantContext, TenantRegistry } from '../tenants.js'
import { audit, confirmShape, defineTool, requireConfirm } from '../tool.js'
import { paginate, paginationShape } from '../pagination.js'
import {
  serializeMacroFase,
  serializeMember,
  serializeProject,
  serializeProjectSummary,
  serializeSprint,
  serializeStakeholderLink,
} from '../serializers.js'
import { fetchTenantUsers } from './context.js'
import { UserError } from '../errors.js'
import { dateInput, toIso } from '../dates.js'

export const PROJECT_STATUSES = ['ACTIVE', 'INACTIVE', 'COMPLETED', 'ARCHIVED'] as const

interface UserProjectItem {
  projectId: string
  project: { id: string; name: string; status: string }
}

type RawProject = Record<string, unknown> & {
  members?: Record<string, unknown>[]
  macroFases?: Record<string, unknown>[]
  stakeholders?: Record<string, unknown>[]
}

const projectFieldsShape = {
  description: z.string().optional(),
  slogan: z.string().optional(),
  location: z.string().optional(),
  logo_url: z.string().optional(),
  start_date: dateInput.optional(),
  end_date: dateInput.optional(),
  semestre: z.string().optional(),
  termo: z.string().optional().describe('Termo do curso (ex.: "5"); usado quando o período não é anual.'),
  turno: z.string().optional().describe('Turno (ex.: "Noturno"); usado quando o período não é anual.'),
  ano: z.number().int().optional(),
  departamentos: z.array(z.string()).optional(),
  justificativa: z.string().optional(),
  objetivos: z.string().optional(),
  metodologia: z.string().optional(),
  descricao_produto: z.string().optional(),
  premissas: z.string().optional(),
  restricoes: z.string().optional(),
  limites_autoridade: z.string().optional(),
}

type ProjectFields = { [K in keyof typeof projectFieldsShape]?: z.infer<(typeof projectFieldsShape)[K]> }

/** snake_case da tool → camelCase do project-service, só com os campos informados. */
export function toProjectBody(f: ProjectFields & { name?: string; status?: string }): Record<string, unknown> {
  const map: Record<string, unknown> = {
    name: f.name,
    status: f.status,
    description: f.description,
    slogan: f.slogan,
    location: f.location,
    logoUrl: f.logo_url,
    startDate: toIso(f.start_date, 'start_date'),
    endDate: toIso(f.end_date, 'end_date'),
    semestre: f.semestre,
    termo: f.termo,
    turno: f.turno,
    ano: f.ano,
    departamentos: f.departamentos,
    justificativa: f.justificativa,
    objetivos: f.objetivos,
    metodologia: f.metodologia,
    descricaoProduto: f.descricao_produto,
    premissas: f.premissas,
    restricoes: f.restricoes,
    limitesAutoridade: f.limites_autoridade,
  }
  return Object.fromEntries(Object.entries(map).filter(([, v]) => v !== undefined))
}

/** Todos os projetos do tenant (o endpoint pagina em até 100). */
export async function fetchAllTenantProjects(ctx: TenantContext): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  for (let page = 1; page <= 100; page++) {
    const res = await ctx.gw.get<{ items: Record<string, unknown>[]; total: number }>('/projects', { page, limit: 100 })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length === 0) break
  }
  return all
}

export async function fetchProjectDetail(ctx: TenantContext, projectId: string) {
  const [project, users, sprints] = await Promise.all([
    ctx.gw.get<RawProject>(`/projects/${projectId}`),
    fetchTenantUsers(ctx),
    ctx.gw.get<Record<string, unknown>[]>('/sprints', { projectId }),
  ])
  const usersById = new Map(users.map(u => [u.id, u]))
  const activeMembers = (project.members ?? []).filter(m => m.active !== false)
  return {
    project: serializeProject(project),
    members: activeMembers
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map(m => serializeMember(m, usersById.get(String(m.userId)) as never)),
    macro_fases: (project.macroFases ?? []).map(serializeMacroFase),
    stakeholders: (project.stakeholders ?? []).map(serializeStakeholderLink),
    sprints: sprints.map(s => serializeSprint(s, { includeColumns: true })),
  }
}

export function registerProjectTools(server: McpServer, registry: TenantRegistry) {
  defineTool(
    server,
    registry,
    'operum_list_projects',
    {
      title: 'Listar projetos',
      description:
        'Lista projetos do tenant. scope="mine" (padrão): projetos em que o usuário é membro ativo. scope="all": todos os projetos do tenant.',
      inputSchema: {
        scope: z.enum(['mine', 'all']).optional(),
        status: z.enum(PROJECT_STATUSES).optional(),
        q: z.string().optional().describe('Filtra por trecho do nome.'),
        ...paginationShape,
      },
      entity: 'Projeto',
      annotations: { readOnlyHint: true },
    },
    async ({ scope, status, q, cursor, limit }, ctx) => {
      // O userId nunca vem de input do modelo — é sempre a identidade do token.
      let projects =
        scope === 'all'
          ? (await fetchAllTenantProjects(ctx)).map(serializeProjectSummary)
          : (await ctx.gw.get<UserProjectItem[]>(`/projects/user/${ctx.userId}`)).map(i => serializeProjectSummary(i.project))
      if (status) projects = projects.filter(p => p?.status === status)
      if (q) projects = projects.filter(p => p?.name?.toLowerCase().includes(q.toLowerCase()))
      return paginate(projects, cursor, limit) as unknown as Record<string, unknown>
    },
  )

  defineTool(
    server,
    registry,
    'operum_get_project',
    {
      title: 'Detalhar projeto',
      description:
        'Todos os campos do projeto: dados gerais, termo de abertura (charter), membros ativos (com nome/e-mail), macro-fases, stakeholders e sprints com suas colunas. Para as tarefas use operum_list_tasks.',
      inputSchema: { project_id: z.string() },
      entity: 'Projeto',
      annotations: { readOnlyHint: true },
    },
    async ({ project_id }, ctx) => fetchProjectDetail(ctx, project_id),
  )

  defineTool(
    server,
    registry,
    'operum_create_project',
    {
      title: 'Criar projeto',
      description: 'Cria um projeto no tenant. O nome precisa ser único no tenant.',
      inputSchema: { name: z.string().min(1), ...projectFieldsShape },
      entity: 'Projeto',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args, ctx) => {
      const created = await ctx.gw.post<Record<string, unknown>>('/projects', toProjectBody(args))
      await audit(ctx, 'operum_create_project', 'CREATE', 'project', String(created.id))
      return { project: serializeProject(created) }
    },
  )

  defineTool(
    server,
    registry,
    'operum_update_project',
    {
      title: 'Atualizar projeto',
      description: 'Altera campos do projeto. Só os campos informados são alterados.',
      inputSchema: { project_id: z.string(), name: z.string().min(1).optional(), status: z.enum(PROJECT_STATUSES).optional(), ...projectFieldsShape },
      entity: 'Projeto',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ project_id, ...fields }, ctx) => {
      const body = toProjectBody(fields)
      if (Object.keys(body).length === 0) throw new UserError('Nenhum campo para alterar.')
      const updated = await ctx.gw.patch<Record<string, unknown>>(`/projects/${project_id}`, body)
      await audit(ctx, 'operum_update_project', 'UPDATE', 'project', project_id, { fields: Object.keys(body) })
      return { project: serializeProject(updated) }
    },
  )

  defineTool(
    server,
    registry,
    'operum_archive_project',
    {
      title: 'Arquivar projeto',
      description: 'Muda o status do projeto para ARCHIVED (reversível com operum_update_project).',
      inputSchema: { project_id: z.string() },
      entity: 'Projeto',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ project_id }, ctx) => {
      const updated = await ctx.gw.patch<Record<string, unknown>>(`/projects/${project_id}`, { status: 'ARCHIVED' })
      await audit(ctx, 'operum_archive_project', 'ARCHIVE', 'project', project_id)
      return { project: serializeProject(updated) }
    },
  )

  defineTool(
    server,
    registry,
    'operum_delete_project',
    {
      title: 'Excluir projeto',
      description: 'Exclui o projeto (soft delete no Operum). Exige confirm: true — confirme com o usuário antes.',
      inputSchema: { project_id: z.string(), ...confirmShape },
      entity: 'Projeto',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ project_id, confirm }, ctx) => {
      requireConfirm(confirm, 'Excluir projeto')
      await ctx.gw.delete(`/projects/${project_id}`)
      await audit(ctx, 'operum_delete_project', 'DELETE', 'project', project_id)
      return { deleted: true, project_id }
    },
  )

  defineTool(
    server,
    registry,
    'operum_add_project_member',
    {
      title: 'Adicionar membro ao projeto',
      description: 'Adiciona (ou reativa) um usuário do tenant como membro do projeto. user_id vem de operum_list_users.',
      inputSchema: {
        project_id: z.string(),
        user_id: z.string(),
        role: z.string().optional().describe('Papel/função do membro no projeto (texto livre).'),
        hourly_rate: z.number().nonnegative().optional(),
      },
      entity: 'Projeto ou usuário',
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ project_id, user_id, role, hourly_rate }, ctx) => {
      const member = await ctx.gw.post<Record<string, unknown>>(`/projects/${project_id}/members`, {
        userId: user_id,
        ...(role !== undefined ? { role } : {}),
        ...(hourly_rate !== undefined ? { hourlyRate: hourly_rate } : {}),
      })
      await audit(ctx, 'operum_add_project_member', 'ADD_MEMBER', 'project', project_id, { userId: user_id })
      return { member: serializeMember(member) }
    },
  )

  defineTool(
    server,
    registry,
    'operum_remove_project_member',
    {
      title: 'Remover membro do projeto',
      description: 'Desativa o vínculo do usuário com o projeto. Exige confirm: true.',
      inputSchema: { project_id: z.string(), user_id: z.string(), ...confirmShape },
      entity: 'Projeto ou membro',
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ project_id, user_id, confirm }, ctx) => {
      requireConfirm(confirm, 'Remover membro')
      await ctx.gw.delete(`/projects/${project_id}/members/${user_id}`)
      await audit(ctx, 'operum_remove_project_member', 'REMOVE_MEMBER', 'project', project_id, { userId: user_id })
      return { removed: true, project_id, user_id }
    },
  )
}

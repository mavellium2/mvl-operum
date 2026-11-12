import type { Gateway } from '../gateway.js'
import type { TenantContext } from '../tenants.js'
import { mapLimit } from '../concurrency.js'
import { serializeProject } from '../serializers.js'
import type { ProgressFn } from '../tool.js'
import { fetchAttachments } from '../tools/attachments.js'

export const BUNDLE_FORMAT = 'operum-project/v1'

type Raw = Record<string, unknown>

export interface BundlePerson {
  source_user_id: string
  name: string | null
  email: string | null
}

export interface BundleTask {
  source_id: string
  title: string
  description: string | null
  priority: string | null
  color: string | null
  source_sprint_id: string | null
  source_column_id: string | null
  position: number | null
  sprint_position: number | null
  start_date: string | null
  end_date: string | null
  source_tag_ids: string[]
  responsibles: BundlePerson[]
  attachments: { file_name: string | null; file_type: string | null; file_size: number | null }[]
  comments: { author: BundlePerson; type: string | null; content: string; created_at: string | null }[]
}

export interface ProjectBundle {
  format: typeof BUNDLE_FORMAT
  source: {
    tenant_id: string
    tenant_name: string | null
    project_id: string
    exported_at: string
    exported_by: string
    include_comments: boolean
  }
  project: NonNullable<ReturnType<typeof serializeProject>>
  macro_fases: { fase: string; data_limite: string | null; custo: string | null }[]
  /** funcoes: nomes das funções do cadastro, uma por item. role: só em pacotes antigos (texto). */
  members: (BundlePerson & { funcoes?: string[]; role?: string | null; hourly_rate: number | null; order: number | null })[]
  stakeholders: Record<string, string | null>[]
  tags: { source_id: string; name: string; color: string | null }[]
  sprints: {
    source_id: string
    name: string
    description: string | null
    status: string | null
    start_date: string | null
    end_date: string | null
    qualidade: number | null
    dificuldade: number | null
    columns: { source_id: string; title: string; position: number }[]
  }[]
  tasks: BundleTask[]
  stats: Record<string, number>
}

const STAKEHOLDER_FIELDS = [
  'name', 'logoUrl', 'company', 'competence', 'email', 'phone', 'cep', 'logradouro',
  'numero', 'complemento', 'bairro', 'cidade', 'estado', 'notes',
] as const

const s = (v: unknown): string | null => (v == null ? null : String(v))
const n = (v: unknown): number | null => (v == null || v === '' ? null : Number(v))

/**
 * Exporta o projeto inteiro num JSON autocontido: pessoas vão com e-mail (para
 * mapear no destino) e todas as referências internas usam os ids de origem.
 */
export async function exportProject(
  ctx: TenantContext,
  gw: Gateway,
  projectId: string,
  opts: { includeComments: boolean; progress?: ProgressFn },
): Promise<ProjectBundle> {
  const progress = opts.progress ?? (() => {})
  progress(0, undefined, 'Lendo projeto')

  const [project, users, sprints] = await Promise.all([
    gw.get<Raw & { members?: Raw[]; macroFases?: Raw[]; stakeholders?: Raw[] }>(`/projects/${projectId}`),
    gw.get<Raw[]>('/auth/all-users'),
    gw.get<(Raw & { sprintColumns?: Raw[] })[]>('/sprints', { projectId }),
  ])
  const usersById = new Map(users.map(u => [String(u.id), u]))
  const person = (userId: unknown, fallbackName?: unknown): BundlePerson => {
    const u = usersById.get(String(userId))
    return { source_user_id: String(userId), name: s(u?.name ?? fallbackName), email: s(u?.email) }
  }

  progress(1, undefined, 'Lendo tarefas')
  const orderedSprints = [...sprints].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
  const backlog = await gw.get<Raw[]>('/cards/backlog', { projectId })
  const sprintCards = await mapLimit(orderedSprints, 4, sp => gw.get<Raw[]>(`/sprints/${sp.id}/cards`))
  const cards = [...backlog, ...sprintCards.flat()]
  // Anexos vêm do file-service (o sprint-service não os inclui). Só metadados:
  // o import não copia arquivos, mas o relatório avisa quantos ficaram de fora.
  const attachmentsByCard = await fetchAttachments(gw, cards.map(c => String(c.id))).catch(() => new Map<string, Raw[]>())

  const commentsByCard = new Map<string, Raw[]>()
  if (opts.includeComments) {
    let done = 0
    await mapLimit(cards, 4, async card => {
      commentsByCard.set(String(card.id), await gw.get<Raw[]>(`/cards/${card.id}/comments`))
      done++
      if (done % 25 === 0) progress(2, undefined, `Lendo comentários (${done}/${cards.length})`)
    })
  }

  const tags = new Map<string, { source_id: string; name: string; color: string | null }>()
  const tasks: BundleTask[] = cards.map(card => {
    const cardTags = ((card.tags as Raw[]) ?? []).map(ct => (ct.tag as Raw) ?? ct)
    for (const t of cardTags) tags.set(String(t.id), { source_id: String(t.id), name: String(t.name), color: s(t.color) })
    return {
      source_id: String(card.id),
      title: String(card.title),
      description: s(card.description),
      priority: s(card.priority),
      color: s(card.color),
      source_sprint_id: s(card.sprintId),
      source_column_id: s(card.sprintColumnId),
      position: n(card.position),
      sprint_position: n(card.sprintPosition),
      start_date: s(card.startDate),
      end_date: s(card.endDate),
      source_tag_ids: cardTags.map(t => String(t.id)),
      responsibles: ((card.responsibles as Raw[]) ?? []).map(r => person(r.userId ?? (r.user as Raw)?.id, (r.user as Raw)?.name)),
      attachments: (attachmentsByCard.get(String(card.id)) ?? []).map(a => ({
        file_name: s(a.fileName),
        file_type: s(a.fileType),
        file_size: n(a.fileSize),
      })),
      comments: (commentsByCard.get(String(card.id)) ?? [])
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
        .map(c => ({
          author: person(c.userId ?? (c.user as Raw)?.id, (c.user as Raw)?.name),
          type: s(c.type),
          content: String(c.content ?? ''),
          created_at: s(c.createdAt),
        })),
    }
  })

  const members = (project.members ?? [])
    .filter(m => m.active !== false)
    .map(m => ({
      ...person(m.userId),
      funcoes: Array.isArray(m.funcoes) ? (m.funcoes as Raw[]).map(f => s((f?.role as Raw)?.name)).filter((x): x is string => !!x) : [],
      hourly_rate: n(m.hourlyRate), order: n(m.order),
    }))

  const bundle: ProjectBundle = {
    format: BUNDLE_FORMAT,
    source: {
      tenant_id: ctx.tenantId,
      tenant_name: ctx.tenantName,
      project_id: projectId,
      exported_at: new Date().toISOString(),
      exported_by: ctx.email,
      include_comments: opts.includeComments,
    },
    project: serializeProject(project)!,
    macro_fases: (project.macroFases ?? []).map(f => ({ fase: String(f.fase), data_limite: s(f.dataLimite), custo: s(f.custo) })),
    members,
    stakeholders: (project.stakeholders ?? [])
      .sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0))
      .map(link => {
        const st = (link.stakeholder as Raw) ?? {}
        return Object.fromEntries(STAKEHOLDER_FIELDS.map(f => [f, s(st[f])]))
      }),
    tags: [...tags.values()],
    sprints: orderedSprints.map(sp => ({
      source_id: String(sp.id),
      name: String(sp.name),
      description: s(sp.description),
      status: s(sp.status),
      start_date: s(sp.startDate),
      end_date: s(sp.endDate),
      qualidade: n(sp.qualidade),
      dificuldade: n(sp.dificuldade),
      columns: (sp.sprintColumns ?? [])
        .filter(c => c.deletedAt == null)
        .map(c => ({ source_id: String(c.id), title: String(c.title), position: Number(c.position ?? 0) }))
        .sort((a, b) => a.position - b.position),
    })),
    tasks,
    stats: {},
  }
  bundle.stats = bundleStats(bundle)
  return bundle
}

export function bundleStats(b: ProjectBundle): Record<string, number> {
  return {
    macro_fases: b.macro_fases.length,
    members: b.members.length,
    stakeholders: b.stakeholders.length,
    tags: b.tags.length,
    sprints: b.sprints.length,
    columns: b.sprints.reduce((acc, sp) => acc + sp.columns.length, 0),
    tasks: b.tasks.length,
    backlog_tasks: b.tasks.filter(t => !t.source_sprint_id).length,
    responsibles: b.tasks.reduce((acc, t) => acc + t.responsibles.length, 0),
    tag_links: b.tasks.reduce((acc, t) => acc + t.source_tag_ids.length, 0),
    comments: b.tasks.reduce((acc, t) => acc + t.comments.length, 0),
    attachments: b.tasks.reduce((acc, t) => acc + t.attachments.length, 0),
  }
}

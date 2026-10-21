/**
 * Whitelist explícita de campos por entidade. Nunca repassar objetos crus do
 * backend: além de manter a saída estável e em snake_case, impede que um campo
 * sensível adicionado no futuro a um include do Prisma vaze para o agente.
 */

import { LINK_ATTACHMENT_TYPE } from './attachmentTypes.js'

type Raw = Record<string, unknown> | null | undefined

const str = (v: unknown): string | null => (typeof v === 'string' ? v : v == null ? null : String(v))
const num = (v: unknown): number | null => (typeof v === 'number' ? v : v == null || v === '' ? null : Number(v))
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : [])
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null)

export function serializeUser(u: Raw) {
  if (!u) return null
  return {
    id: str(u.id),
    name: str(u.name),
    email: str(u.email),
    ...(u.role !== undefined ? { role: str(u.role) } : {}),
    ...(u.isActive !== undefined ? { is_active: bool(u.isActive) } : {}),
  }
}

export function serializeProjectSummary(p: Raw) {
  if (!p) return null
  return { id: str(p.id), name: str(p.name), status: str(p.status) }
}

export function serializeMacroFase(f: Raw) {
  return { id: str(f?.id), fase: str(f?.fase), data_limite: str(f?.dataLimite), custo: str(f?.custo) }
}

export function serializeMember(m: Raw, user?: Raw) {
  return {
    user_id: str(m?.userId),
    name: user ? str(user.name) : null,
    email: user ? str(user.email) : null,
    role: str(m?.role),
    department_id: str(m?.departmentId),
    hourly_rate: num(m?.hourlyRate),
    remuneracao: num(m?.remuneracao),
    horas_diarias: num(m?.horasDiarias),
    start_date: str(m?.startDate),
    end_date: str(m?.endDate),
    order: num(m?.order),
  }
}

export function serializeStakeholderLink(link: Raw) {
  const s = obj(link?.stakeholder)
  return {
    id: str(s?.id ?? link?.stakeholderId),
    name: str(s?.name),
    company: str(s?.company),
    competence: str(s?.competence),
    email: str(s?.email),
    phone: str(s?.phone),
    notes: str(s?.notes),
    order: num(link?.order),
  }
}

/** Campos do projeto (inclui o termo de abertura). */
export function serializeProject(p: Raw) {
  if (!p) return null
  return {
    id: str(p.id),
    name: str(p.name),
    status: str(p.status),
    description: str(p.description),
    slogan: str(p.slogan),
    location: str(p.location),
    logo_url: str(p.logoUrl),
    start_date: str(p.startDate),
    end_date: str(p.endDate),
    semestre: str(p.semestre),
    termo: str(p.termo),
    turno: str(p.turno),
    ano: num(p.ano),
    departamentos: Array.isArray(p.departamentos) ? (p.departamentos as unknown[]).map(str) : [],
    charter: {
      justificativa: str(p.justificativa),
      objetivos: str(p.objetivos),
      metodologia: str(p.metodologia),
      descricao_produto: str(p.descricaoProduto),
      premissas: str(p.premissas),
      restricoes: str(p.restricoes),
      limites_autoridade: str(p.limitesAutoridade),
    },
    created_at: str(p.createdAt),
    updated_at: str(p.updatedAt),
  }
}

export function serializeColumn(c: Raw) {
  return { id: str(c?.id), title: str(c?.title), position: num(c?.position) }
}

export function serializeSprint(s: Raw, opts: { includeColumns?: boolean } = {}) {
  if (!s) return null
  // O sprint-service inclui colunas com soft delete no include de sprintColumns.
  const columns = arr(s.sprintColumns).filter(c => c?.deletedAt == null)
  return {
    id: str(s.id),
    name: str(s.name),
    description: str(s.description),
    status: str(s.status),
    project_id: str(s.projectId),
    start_date: str(s.startDate),
    end_date: str(s.endDate),
    qualidade: num(s.qualidade),
    dificuldade: num(s.dificuldade),
    created_by: str(s.createdBy),
    created_at: str(s.createdAt),
    ...(opts.includeColumns ? { columns: columns.map(serializeColumn) } : {}),
  }
}

export function serializeTag(t: Raw) {
  return { id: str(t?.id), name: str(t?.name), color: str(t?.color), owner_user_id: str(t?.userId) }
}

export function serializeComment(c: Raw) {
  const user = obj(c?.user)
  return {
    id: str(c?.id),
    task_id: str(c?.cardId),
    type: str(c?.type),
    content: str(c?.content),
    author: { id: str(user?.id ?? c?.userId), name: str(user?.name) },
    created_at: str(c?.createdAt),
    updated_at: str(c?.updatedAt),
  }
}

export function serializeAttachment(a: Raw) {
  const isLink = a?.fileType === LINK_ATTACHMENT_TYPE
  return {
    id: str(a?.id),
    kind: isLink ? ('link' as const) : ('file' as const),
    file_name: str(a?.fileName),
    file_type: str(a?.fileType),
    file_size: num(a?.fileSize),
    is_cover: bool(a?.isCover),
    uploaded_at: str(a?.uploadedAt ?? a?.createdAt),
    // Link é conteúdo do usuário (a URL do vídeo); de arquivo não expõe o caminho interno no MinIO,
    // só a URL assinada (válida por 1 h) quando o get_task a pede ao file-service.
    ...(isLink ? { url: str(a?.filePath) } : {}),
    ...(!isLink && typeof a?.downloadUrl === 'string' ? { download_url: a.downloadUrl } : {}),
  }
}

export function serializeTimeEntry(e: Raw) {
  const card = obj(e?.card)
  return {
    id: str(e?.id),
    task_id: str(e?.cardId),
    ...(card ? { task_title: str(card.title) } : {}),
    user_id: str(e?.userId),
    started_at: str(e?.startedAt),
    ended_at: str(e?.endedAt),
    duration_seconds: num(e?.duration),
    is_running: bool(e?.isRunning),
    is_manual: bool(e?.isManual),
    description: str(e?.description),
  }
}

/** Tempo da tarefa a partir das timeEntries que o sprint-service inclui no card. */
function serializeTaskTime(entries: Raw[], total?: number | null) {
  return {
    total_seconds: total ?? entries.filter(e => !e?.isRunning).reduce((sum, e) => sum + (num(e?.duration) ?? 0), 0),
    running: entries
      .filter(e => e?.isRunning)
      .map(e => ({ entry_id: str(e?.id), user_id: str(e?.userId), started_at: str(e?.startedAt) })),
  }
}

export function serializeMovement(m: Raw) {
  return {
    id: str(m?.id),
    user_id: str(m?.userId),
    from_column: { id: str(m?.fromColumnId), title: str(m?.fromColumnTitle) },
    to_column: { id: str(m?.toColumnId), title: str(m?.toColumnTitle) },
    reason: str(m?.reason),
    moved_at: str(m?.movedAt),
  }
}

export function serializeAudit(a: Raw) {
  return {
    id: str(a?.id),
    action: str(a?.action),
    entity: str(a?.entity),
    entity_id: str(a?.entityId),
    user_id: str(a?.userId),
    details: obj(a?.details),
    timestamp: str(a?.timestamp),
  }
}

/** Card do Operum = tarefa. `include` controla os blocos pesados (comentários/anexos). */
export function serializeTask(c: Raw, include: { comments?: boolean } = {}) {
  if (!c) return null
  const sprint = obj(c.sprint)
  const column = obj(c.sprintColumn)
  return {
    id: str(c.id),
    title: str(c.title),
    description: str(c.description),
    priority: str(c.priority),
    color: str(c.color),
    project_id: str(c.projectId),
    sprint_id: str(c.sprintId),
    column_id: str(c.sprintColumnId),
    in_backlog: c.sprintId == null,
    position: num(c.position),
    sprint_position: num(c.sprintPosition),
    start_date: str(c.startDate),
    end_date: str(c.endDate),
    created_at: str(c.createdAt),
    updated_at: str(c.updatedAt),
    ...(sprint ? { sprint: { id: str(sprint.id), name: str(sprint.name) } } : {}),
    ...(column ? { column: { id: str(column.id), title: str(column.title) } } : {}),
    tags: arr(c.tags).map(ct => serializeTag(obj(ct?.tag) ?? ct)),
    responsibles: arr(c.responsibles).map(r => serializeUser(obj(r?.user) ?? { id: r?.userId })),
    attachments: arr(c.attachments).map(serializeAttachment),
    ...(Array.isArray(c.timeEntries) ? { time: serializeTaskTime(c.timeEntries as Raw[], num(c.totalDurationSeconds)) } : {}),
    ...(include.comments ? { comments: arr(c.comments).map(serializeComment) } : {}),
  }
}

export type SerializedTask = NonNullable<ReturnType<typeof serializeTask>>

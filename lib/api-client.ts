import { GlobalDashboardSchema, SprintDashboardSchema } from '@/sprint-service/src/dashboard/dashboard-contract'
import 'server-only'
import { cookies, headers } from 'next/headers'
import { requestId, observe } from './operationalTelemetry'
import { redirect } from 'next/navigation' // ← Adicionado o import de redirecionamento

const API_URL = (process.env.API_GATEWAY_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '')

async function getToken(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get('session')?.value
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken()
  let inboundId: string | null = null
  try { inboundId = (await headers()).get('x-request-id') } catch { /* background callers have no request context */ }
  const id = requestId(inboundId)
  const started = performance.now()

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': id,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    cache: 'no-store',
  })

  observe(init.method ?? 'GET', res.status, (performance.now() - started) / 1000)
  console.log(JSON.stringify({ event: 'http', requestId: id, method: init.method ?? 'GET', status: res.status }))
  if (res.status === 204) return undefined as T

  if (!res.ok) {
    // 1. Intercepta o 401 Unauthorized da API e joga pro login
    if (res.status === 401) {
      redirect('/login')
    }

    const body = await res.text().catch(() => '')
    let errorMessage = body

    try {
      // 2. Ajustado para capturar tanto 'message' quanto 'error'
      const parsed = JSON.parse(body) as { message?: string; error?: string }
      errorMessage = parsed.message ?? parsed.error ?? body
    } catch { /* noop */ }

    // 3. Trava extra de segurança: se a mensagem for de sessão expirada, redireciona
    if (errorMessage === 'Sessão expirada') {
      redirect('/login')
    }

    const err = new Error(errorMessage || `${init.method ?? 'GET'} ${path} → ${res.status}`) as Error & { status: number }
    err.status = res.status
    throw err
  }

  // NestJS responde `null` como 200 com corpo vazio (ex.: card sem timer ativo).
  const body = await res.text()
  return (body ? JSON.parse(body) : null) as T
}

// ── Auth ──────────────────────────────────────────────────

export const authApi = {
  me: () => request<{ id: string; name: string; email: string; role: string; tenantId: string; avatarUrl?: string; signatureUrl?: string; cargo?: string; departamento?: string; hourlyRate?: number; isActive: boolean; forcePasswordChange: boolean; phone?: string; cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; estado?: string; notes?: string }>('/auth/me'),

  updateProfile: (data: Record<string, unknown>) =>
    request('/auth/me', { method: 'PATCH', body: JSON.stringify(data) }),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    request('/auth/password/change', { method: 'POST', body: JSON.stringify(data) }),

  alterarSenha: (password: string) =>
    request('/auth/password/alterar', { method: 'POST', body: JSON.stringify({ password }) }),

  getMyTenants: () =>
    request<{ userId: string; tenantId: string; tenantName: string; tenantSubdomain: string; role: string; isCurrent: boolean }[]>('/auth/my-tenants'),

  switchTenant: (targetTenantId: string) => {
    if (!targetTenantId?.trim()) throw new Error('targetTenantId is required')
    return request<{ token: string; user: { id: string; name: string; email: string; role: string; tenantId: string } }>(
      '/auth/switch-tenant',
      { method: 'POST', body: JSON.stringify({ targetTenantId: targetTenantId.trim() }) },
    )
  },

  joinTenant: (tenantId: string, password: string) => {
    if (!tenantId?.trim()) throw new Error('tenantId is required')
    if (!password || password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres')
    return request<{ ok: boolean }>(
      '/auth/join-tenant',
      { method: 'POST', body: JSON.stringify({ tenantId: tenantId.trim(), password }) },
    )
  },

  provisionTenantAdmin: (tenantId: string, callerRole: string) => {
    if (!tenantId?.trim()) throw new Error('tenantId is required')
    // Fail-fast defense-in-depth: AdminGuard on the backend is the authoritative check;
    // this early throw prevents unnecessary network round-trips for non-admin users.
    if (callerRole !== 'admin') throw new Error('Apenas administradores podem provisionar workspaces')
    return request<{ ok: boolean }>(
      '/auth/provision-tenant-admin',
      { method: 'POST', body: JSON.stringify({ tenantId: tenantId.trim() }) },
    )
  },
}

type AdminUser = { id: string; name: string; email: string; role: string; avatarUrl?: string | null; isActive?: boolean; phone?: string; cep?: string; logradouro?: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; estado?: string; notes?: string }

type ApiTokenScope = 'read' | 'write'

type ApiTokenSummary = {
  id: string
  name: string
  prefix: string
  scopes: ApiTokenScope[]
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

type ApiTokenCreated = { id: string; token: string; prefix: string; expiresAt: string | null }

export const apiTokensApi = {
  list: () => request<ApiTokenSummary[]>('/auth/api-tokens'),

  create: (data: { name: string; scopes: ApiTokenScope[]; expiresInDays?: number }) =>
    request<ApiTokenCreated>('/auth/api-tokens', { method: 'POST', body: JSON.stringify(data) }),

  revoke: (id: string) =>
    request(`/auth/api-tokens/${id}`, { method: 'DELETE' }),
}

// ── OAuth (conector do Claude) ─────────────────────────────

export type OAuthAuthorizeRequest = {
  response_type: string
  client_id: string
  redirect_uri: string
  code_challenge: string
  code_challenge_method: string
  state?: string
  scope?: string
  resource?: string
}

export type OAuthAuthorizeCheck =
  | {
      ok: true
      client: { name: string; kind: string; clientId: string; host: string }
      redirectUri: string
      redirectHost: string
      loopback: boolean
      scopes: string[]
      writeRequested: boolean
      tenants: { tenantId: string; tenantName: string; role: string; isCurrent: boolean }[]
    }
  | { ok: false; error: string; description: string; redirect?: string }

export type OAuthDecision = { redirect: string } | { ok: false; error: string; description: string; redirect?: string }

export type OAuthGrantSummary = {
  id: string
  clientName: string
  redirectHost: string
  scopes: string[]
  tenants: string[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
}

export const oauthApi = {
  check: (req: OAuthAuthorizeRequest) =>
    request<OAuthAuthorizeCheck>('/auth/oauth/authorize/check', { method: 'POST', body: JSON.stringify(req) }),

  approve: (req: OAuthAuthorizeRequest, tenantIds: string[], allowWrite: boolean) =>
    request<OAuthDecision>('/auth/oauth/authorize/approve', { method: 'POST', body: JSON.stringify({ request: req, tenantIds, allowWrite }) }),

  deny: (req: OAuthAuthorizeRequest) =>
    request<OAuthDecision>('/auth/oauth/authorize/deny', { method: 'POST', body: JSON.stringify(req) }),

  grants: () => request<OAuthGrantSummary[]>('/auth/oauth/grants'),

  revokeGrant: (id: string) => request(`/auth/oauth/grants/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ── Admin ─────────────────────────────────────────────────

export const adminApi = {
  listUsers: () =>
    request<AdminUser[]>('/auth/users'),

  listAllUsers: () =>
    request<AdminUser[]>('/auth/all-users'),

  createUser: (data: Record<string, unknown>) =>
    request<AdminUser>('/auth/admin/users', { method: 'POST', body: JSON.stringify(data) }),

  updateUser: (userId: string, data: Record<string, unknown>) =>
    request<AdminUser>(`/auth/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  toggleActive: (userId: string, active: boolean) =>
    request(`/auth/admin/users/${userId}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),

  setRole: (userId: string, role: string) =>
    request(`/auth/admin/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
}

type Project = { macroFasesRevision?: number; macroFasesSyncedRevision?: number; macroFasesSyncError?: string | null; id: string; name: string; description?: string | null; tenantId?: string; status?: string; slogan?: string | null; startDate?: string | null; endDate?: string | null; location?: string | null; logoUrl?: string | null; justificativa?: string | null; objetivos?: string | null; metodologia?: string | null; descricaoProduto?: string | null; premissas?: string | null; restricoes?: string | null; limitesAutoridade?: string | null; semestre?: string | null; termo?: string | null; turno?: string | null; ano?: number | null; departamentos?: string[] | null; macroFases?: { fase: string; dataLimite?: string | null; custo?: string | null }[] | null; _count?: { members?: number } }

// ── Projects ──────────────────────────────────────────────

export const projectsApi = {
  list: (page = 1, limit = 50) =>
    request<{ items: Project[]; total: number }>(`/projects?page=${page}&limit=${limit}`),

  get: (id: string) => request<Project>(`/projects/${id}`),

  getUserProjects: (userId: string) => request<unknown[]>(`/projects/user/${userId}`),

  create: (data: Record<string, unknown>) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request(`/projects/${id}`, { method: 'DELETE' }),

  getMembers: (projectId: string) => request<unknown[]>(`/projects/${projectId}/members`),

  addMember: (projectId: string, data: Record<string, unknown>) =>
    request(`/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify(data) }),

  removeMember: (projectId: string, userId: string) =>
    request(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),

  /** Inativa (com motivo) ou reativa o membro no projeto; inativo perde o acesso. */
  setMemberSituacao: (projectId: string, userId: string, ativo: boolean, motivo?: string) =>
    request(`/projects/${projectId}/members/${userId}/situacao`, { method: 'PATCH', body: JSON.stringify({ ativo, motivo }) }),

  reorderMembers: (projectId: string, orderedUserIds: string[]) =>
    request(`/projects/${projectId}/members/reorder`, { method: 'PATCH', body: JSON.stringify({ orderedUserIds }) }),

  listMacroFases: (projectId: string) => request<unknown[]>(`/projects/${projectId}/macro-fases`),

  upsertMacroFases: (projectId: string, fases: unknown[]) =>
    request(`/projects/${projectId}/macro-fases`, { method: 'POST', body: JSON.stringify({ fases }) }),

  getProjectRoles: (projectId: string) => request<unknown[]>(`/projects/${projectId}/roles`),

  assignProjectRole: (projectId: string, userId: string, roleId: string) =>
    request(`/projects/${projectId}/roles`, { method: 'POST', body: JSON.stringify({ userId, roleId }) }),

  removeProjectRole: (projectId: string, userId: string) =>
    request(`/projects/${projectId}/roles/${userId}`, { method: 'DELETE' }),
}

type Department = { id: string; name: string }

// ── Departments ───────────────────────────────────────────

export const departmentsApi = {
  list: () => request<Department[]>('/departments'),

  get: (id: string) => request<Department>(`/departments/${id}`),

  create: (data: Record<string, unknown>) =>
    request<Department>('/departments', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    request<Department>(`/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request(`/departments/${id}`, { method: 'DELETE' }),

  addUser: (departmentId: string, userId: string) =>
    request(`/departments/${departmentId}/users`, { method: 'POST', body: JSON.stringify({ userId }) }),

  removeUser: (departmentId: string, userId: string) =>
    request(`/departments/${departmentId}/users/${userId}`, { method: 'DELETE' }),
}

type Role = { id: string; name: string; scope?: string }

// ── Roles & Permissions ───────────────────────────────────

export const rolesApi = {
  list: () => request<Role[]>('/roles'),

  get: (id: string) => request<Role>(`/roles/${id}`),

  create: (data: Record<string, unknown>) =>
    request<Role>('/roles', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    request<Role>(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request(`/roles/${id}`, { method: 'DELETE' }),

  listPermissions: () => request<unknown[]>('/permissions'),

  createPermission: (data: Record<string, unknown>) =>
    request('/permissions', { method: 'POST', body: JSON.stringify(data) }),

  assignPermission: (roleId: string, permissionId: string) =>
    request(`/roles/${roleId}/permissions/${permissionId}`, { method: 'POST' }),

  removePermission: (roleId: string, permissionId: string) =>
    request(`/roles/${roleId}/permissions/${permissionId}`, { method: 'DELETE' }),
}

// ── Stakeholders ──────────────────────────────────────────

export const stakeholdersApi = {
  list: () => request<unknown[]>('/stakeholders'),

  get: (id: string) => request<Record<string, unknown>>(`/stakeholders/${id}`),

  create: (data: Record<string, unknown>, projectId?: string) =>
    request(`/stakeholders${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>, projectId?: string) =>
    request(`/stakeholders/${id}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request(`/stakeholders/${id}`, { method: 'DELETE' }),

  listByProject: (projectId: string) => request<unknown[]>(`/stakeholders/by-project/${projectId}`),

  linkProject: (stakeholderId: string, projectId: string) =>
    request(`/stakeholders/${stakeholderId}/projects/${projectId}`, { method: 'POST' }),

  unlinkProject: (stakeholderId: string, projectId: string) =>
    request(`/stakeholders/${stakeholderId}/projects/${projectId}`, { method: 'DELETE' }),

  reorderByProject: (projectId: string, orderedIds: string[]) =>
    request(`/stakeholders/by-project/${projectId}/reorder`, { method: 'PATCH', body: JSON.stringify({ orderedIds }) }),
}

// ── Sprints ───────────────────────────────────────────────

export const sprintsApi = {
  list: (projectId?: string) =>
    request<unknown[]>(`/sprints${projectId ? `?projectId=${projectId}` : ''}`),

  get: (id: string) => request<Record<string, unknown>>(`/sprints/${id}`),

  create: (data: Record<string, unknown>) =>
    request<{ id: string; name: string; status: string }>('/sprints', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    request<{ id: string; name: string; status: string; startDate: Date | string | null; endDate: Date | string | null; qualidade?: number | null; dificuldade?: number | null }>(`/sprints/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request(`/sprints/${id}`, { method: 'DELETE' }),

  listColumns: (sprintId: string) => request<unknown[]>(`/sprints/${sprintId}/columns?timeEntries=summary`),

  createColumn: (sprintId: string, data: Record<string, unknown>) =>
    request<{ id: string; title: string; position: number }>(`/sprints/${sprintId}/columns`, { method: 'POST', body: JSON.stringify(data) }),

  updateColumn: (sprintId: string, columnId: string, data: Record<string, unknown>) =>
    request(`/sprints/${sprintId}/columns/${columnId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteColumn: (sprintId: string, columnId: string) =>
    request(`/sprints/${sprintId}/columns/${columnId}`, { method: 'DELETE' }),

  reorderColumns: (sprintId: string, columnIds: string[]) =>
    request(`/sprints/${sprintId}/columns/reorder`, { method: 'POST', body: JSON.stringify({ columnIds }) }),

  listCards: (sprintId: string) => request<unknown[]>(`/sprints/${sprintId}/cards`),

  getMetrics: (sprintId: string) => request<unknown[]>(`/sprints/${sprintId}/metrics`),

  getSprintDashboard: (sprintId: string) => request<unknown>(`/sprints/${encodeURIComponent(sprintId)}/dashboard`).then(data => { const parsed = SprintDashboardSchema.safeParse(data); if (!parsed.success) throw new Error('Resposta inválida do serviço de dashboard'); return parsed.data }),

  getGlobalMetrics: () => request<unknown>('/dashboard/global').then(data => { const parsed = GlobalDashboardSchema.safeParse(data); if (!parsed.success) throw new Error('Resposta inválida do serviço de dashboard'); return parsed.data }),

  getFeedbacks: (sprintId: string) => request<unknown[]>(`/sprints/${sprintId}/feedback`),

  upsertFeedback: (sprintId: string, data: Record<string, unknown>) =>
    request(`/sprints/${sprintId}/feedback`, { method: 'POST', body: JSON.stringify(data) }),
}

// ── Cards ─────────────────────────────────────────────────

export const cardsApi = {
  get: (id: string) => request<Record<string, unknown>>(`/cards/${id}`),

  listBacklog: (projectId: string) =>
    request<{ id: string; title: string; description: string; color: string; priority?: string | null; tags?: unknown[]; attachments?: unknown[]; responsibles?: unknown[] }[]>(
      `/cards/backlog?projectId=${encodeURIComponent(projectId)}`
    ),

  create: (data: Record<string, unknown>) =>
    request<{ id: string; title: string; description: string; color: string; priority?: string | null }>('/cards', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: Record<string, unknown>) =>
    request(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id: string) =>
    request(`/cards/${id}`, { method: 'DELETE' }),

  addTag: (cardId: string, tagId: string) =>
    request(`/cards/${cardId}/tags/${tagId}`, { method: 'POST' }),

  removeTag: (cardId: string, tagId: string) =>
    request(`/cards/${cardId}/tags/${tagId}`, { method: 'DELETE' }),

  addResponsible: (cardId: string, userId: string) =>
    request(`/cards/${cardId}/responsibles/${userId}`, { method: 'POST' }),

  removeResponsible: (cardId: string, userId: string) =>
    request(`/cards/${cardId}/responsibles/${userId}`, { method: 'DELETE' }),

  listComments: (cardId: string) => request<{ id: string; user: { id: string; name: string; avatarUrl?: string | null }; content: string; createdAt: Date }[]>(`/cards/${cardId}/comments`),

  createComment: (cardId: string, content: string, type?: string) =>
    request<{ id: string; user: { id: string; name: string; avatarUrl?: string | null }; content: string; createdAt: Date }>(`/cards/${cardId}/comments`, { method: 'POST', body: JSON.stringify({ content, type }) }),

  updateComment: (cardId: string, commentId: string, content: string) =>
    request(`/cards/${cardId}/comments/${commentId}`, { method: 'PATCH', body: JSON.stringify({ content }) }),

  deleteComment: (cardId: string, commentId: string) =>
    request(`/cards/${cardId}/comments/${commentId}`, { method: 'DELETE' }),

  listTimeEntries: (cardId: string) => request<unknown[]>(`/cards/${cardId}/time-entries`),

  getActiveTimer: (cardId: string) =>
    request<{ id: string; isRunning: boolean; startedAt: string | Date; duration: number | null } | null>(`/cards/${cardId}/time-entries/active`),

  getTimeTotal: (cardId: string) =>
    request<{ seconds: number }>(`/cards/${cardId}/time-entries/total`),

  startTimer: (cardId: string, description?: string) =>
    request(`/cards/${cardId}/time-entries/start`, { method: 'POST', body: JSON.stringify({ description }) }),

  stopTimer: (entryId: string) =>
    request(`/time-entries/${entryId}/stop`, { method: 'POST' }),

  createManualEntry: (cardId: string, data: Record<string, unknown>) =>
    request(`/cards/${cardId}/time-entries/manual`, { method: 'POST', body: JSON.stringify(data) }),

  search: (q: string, opts?: { sprintId?: string; projectId?: string; inProjectId?: string; responsibleUserId?: string }) => {
    const params = new URLSearchParams({ q })
    if (opts?.sprintId) params.set('sprintId', opts.sprintId)
    if (opts?.projectId) params.set('projectId', opts.projectId)
    if (opts?.inProjectId) params.set('inProjectId', opts.inProjectId)
    if (opts?.responsibleUserId) params.set('responsibleUserId', opts.responsibleUserId)
    return request<unknown[]>(`/cards/search?${params.toString()}`)
  },

  listMovements: (cardId: string) =>
    request<{ id: string; cardId: string; userId: string | null; fromColumnId: string | null; fromColumnTitle: string | null; toColumnId: string | null; toColumnTitle: string | null; reason: string | null; movedAt: string }[]>(`/cards/${cardId}/movements`),
}

// ── Tags ──────────────────────────────────────────────────

export const tagsApi = {
  list: () => request<unknown[]>('/tags'),

  create: (name: string, color?: string) =>
    request('/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),

  delete: (id: string) =>
    request(`/tags/${id}`, { method: 'DELETE' }),
}

// ── Time entries ──────────────────────────────────────────

export const timeEntriesApi = {
  listByUser: (userId: string) => request<unknown[]>(`/users/${userId}/time-entries`),

  stop: (entryId: string) =>
    request(`/time-entries/${entryId}/stop`, { method: 'POST' }),

  update: (entryId: string, data: Record<string, unknown>) =>
    request(`/time-entries/${entryId}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (entryId: string) =>
    request(`/time-entries/${entryId}`, { method: 'DELETE' }),
}

// ── Notifications ─────────────────────────────────────────

export const notificationsApi = {
  list: (userId: string, params?: Record<string, string>) => {
    const qs = new URLSearchParams({ userId, limit: '100', ...params }).toString()
    return request<unknown[]>(`/notifications?${qs}`)
  },

  markRead: (id: string) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),

  markAllRead: (userId: string) =>
    request(`/notifications/mark-all-read`, { method: 'PATCH', body: JSON.stringify({ userId }) }),

  archive: (id: string) =>
    request(`/notifications/${id}/archive`, { method: 'PATCH' }),
}

// ── Files ─────────────────────────────────────────────────

/** `?cardId=`: o file-service recusa (404) se o anexo não for desse card (SDD 4.1). */
function cardQuery(cardId?: string): string {
  return cardId ? `?cardId=${encodeURIComponent(cardId)}` : ''
}

export const filesApi = {
  getPresignedUrl: (attachmentId: string, cardId?: string) =>
    request<{ url: string }>(`/files/${attachmentId}/url${cardQuery(cardId)}`),

  listByCards: (cardIds: string[]) => {
    const CUID_RE = /^c[a-z0-9]{20,30}$/
    const safe = cardIds.filter(id => CUID_RE.test(id))
    if (safe.length === 0) return Promise.resolve([] as { id: string; cardId: string; fileName: string; fileType: string; filePath: string; fileSize: number; isCover: boolean; createdAt: string }[])
    const params = new URLSearchParams()
    params.set('cardIds', safe.join(','))
    return request<{ id: string; cardId: string; fileName: string; fileType: string; filePath: string; fileSize: number; isCover: boolean; createdAt: string }[]>(
      `/files/by-cards?${params.toString()}`,
    )
  },

  // O file-service confere que o anexo é desse card e que o card é do tenant (SDD 4.1).
  setCover: (cardId: string, attachmentId: string) =>
    request(`/files/${attachmentId}/cover`, { method: 'PATCH', body: JSON.stringify({ cardId }) }),

  rename: (attachmentId: string, fileName: string, cardId?: string) =>
    request<{ id: string; fileName: string }>(`/files/${attachmentId}${cardQuery(cardId)}`, { method: 'PATCH', body: JSON.stringify({ fileName }) }),

  delete: (attachmentId: string, cardId?: string) =>
    request(`/files/${attachmentId}${cardQuery(cardId)}`, { method: 'DELETE' }),
}

// ── Audit ──────────────────────────────────────────────────

export const auditApi = {
  list: (entity?: string, entityId?: string, page = 1, limit = 50) => {
    const params = new URLSearchParams()
    if (entity) params.set('entity', entity)
    if (entityId) params.set('entityId', entityId)
    params.set('page', String(page))
    params.set('limit', String(limit))
    return request<unknown[]>(`/audit?${params}`)
  },

  log: (action: string, entity: string, entityId?: string, details?: object) =>
    request('/audit', { method: 'POST', body: JSON.stringify({ action, entity, entityId, details }) }),
}

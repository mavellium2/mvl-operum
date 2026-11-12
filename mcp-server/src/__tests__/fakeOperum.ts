import type { Gateway, GatewayError } from '../gateway'

/**
 * Operum falso em memória para testes: vários tenants, escopo por tenant
 * (404 fora do tenant, como os serviços reais após a Fase 0) e as mesmas
 * armadilhas da API real — 4 colunas padrão por sprint, nome de projeto único
 * por tenant, tags únicas por (nome, dono).
 */

type Row = Record<string, unknown> & { id: string }

const STATIC_SEGMENTS = new Set([
  'auth', 'me', 'my-tenants', 'all-users', 'projects', 'user', 'members', 'macro-fases', 'stakeholders',
  'tags', 'sprints', 'columns', 'cards', 'page', 'backlog', 'responsibles', 'comments', 'movements', 'audit',
  'files', 'upload', 'link', 'by-cards', 'url',
  'time-entries', 'running', 'start', 'stop', 'manual',
])

let seq = 0
const newId = (prefix: string) => `${prefix}_${++seq}`

function httpError(status: number, message = `HTTP ${status}`): GatewayError {
  const err = new Error(message) as GatewayError
  err.status = status
  err.publicMessage = message
  return err
}

export interface FakeUser {
  id: string
  tenantId: string
  name: string
  email: string
  role?: string
  isActive?: boolean
}

export class FakeOperum {
  tenants = new Map<string, { id: string; name: string }>()
  users: FakeUser[] = []
  projects: Row[] = []
  members: Row[] = []
  macroFases: Row[] = []
  stakeholders: Row[] = []
  projectStakeholders: Row[] = []
  sprints: Row[] = []
  columns: Row[] = []
  cards: Row[] = []
  cardTags: { cardId: string; tagId: string }[] = []
  cardResponsibles: { cardId: string; userId: string }[] = []
  tags: Row[] = []
  comments: Row[] = []
  /** file-service: como o real, não conhece tenant (quem valida o card é o chamador). */
  attachments: Row[] = []
  attachmentBytes = new Map<string, Buffer>()
  timeEntries: Row[] = []
  audit: Row[] = []
  calls: { tenantId: string; method: string; path: string; body?: unknown; query?: Record<string, string> }[] = []
  /** Permite simular falhas: retorna um erro para interromper a chamada. */
  failWhen: ((method: string, path: string, body: unknown) => GatewayError | null) | null = null

  addTenant(id: string, name: string) {
    this.tenants.set(id, { id, name })
  }

  addUser(u: FakeUser) {
    this.users.push({ role: 'member', isActive: true, ...u })
  }

  /** Gateway autenticado como `userId` (equivale a um PAT desse usuário). */
  gateway(userId: string): Gateway {
    const user = this.users.find(u => u.id === userId)
    if (!user) throw new Error(`usuário ${userId} não existe`)
    const call = async (method: string, path: string, body?: unknown, params?: Record<string, unknown>) => {
      const [pathname, qs] = path.split('?')
      const query: Record<string, string> = Object.fromEntries(new URLSearchParams(qs ?? ''))
      for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) query[k] = String(v)
      this.calls.push({ tenantId: user.tenantId, method, path: pathname, body, query })
      const injected = this.failWhen?.(method, pathname, body)
      if (injected) throw injected
      return structuredClone(this.handle(user, method, pathname, query, (body ?? {}) as Record<string, unknown>))
    }
    return {
      get: (path, params) => call('GET', path, undefined, params) as never,
      post: (path, body) => call('POST', path, body) as never,
      patch: (path, body) => call('PATCH', path, body) as never,
      delete: path => call('DELETE', path) as never,
      upload: async (path, form) => {
        const file = form.get('file') as File
        return call('POST', path, { fileName: file.name, fileType: file.type, bytes: Buffer.from(await file.arrayBuffer()) }) as never
      },
    }
  }

  // ── helpers de escopo ────────────────────────────────────────
  private project(t: string, id: string) {
    const p = this.projects.find(p => p.id === id && p.tenantId === t && !p.deletedAt)
    if (!p) throw httpError(404, 'Projeto não encontrado')
    return p
  }
  private sprint(t: string, id: string) {
    const s = this.sprints.find(s => s.id === id && !s.deletedAt)
    if (!s || !this.projects.some(p => p.id === s.projectId && p.tenantId === t)) throw httpError(404, 'Sprint não encontrada')
    return s
  }
  private cardTenant(c: Row): string | undefined {
    const projectId = c.projectId ?? this.sprints.find(s => s.id === c.sprintId)?.projectId
    return this.projects.find(p => p.id === projectId)?.tenantId as string | undefined
  }
  private card(t: string, id: string) {
    const c = this.cards.find(c => c.id === id && !c.deletedAt)
    if (!c || this.cardTenant(c) !== t) throw httpError(404, 'Card não encontrado')
    return c
  }
  private ownEntry(t: string, id: string, user: FakeUser) {
    const e = this.timeEntries.find(e => e.id === id && !e.deletedAt)
    const c = e && this.cards.find(c => c.id === e.cardId && !c.deletedAt)
    if (!e || !c || this.cardTenant(c) !== t) throw httpError(404, 'Time entry não encontrada')
    if (e.userId !== user.id && user.role !== 'admin') throw httpError(403, 'Não autorizado')
    return e
  }
  private hydrateCard(c: Row, withComments = false) {
    return {
      ...c,
      tags: this.cardTags.filter(ct => ct.cardId === c.id).map(ct => ({ ...ct, tag: this.tags.find(t => t.id === ct.tagId) })),
      responsibles: this.cardResponsibles
        .filter(r => r.cardId === c.id)
        .map(r => {
          const u = this.users.find(u => u.id === r.userId)!
          return { ...r, user: { id: u.id, name: u.name, email: u.email } }
        }),
      timeEntries: this.timeEntries.filter(e => e.cardId === c.id && !e.deletedAt),
      ...(withComments ? { comments: this.commentsOf(c.id) } : {}),
    }
  }
  private commentsOf(cardId: string) {
    return this.comments
      .filter(m => m.cardId === cardId && !m.deletedAt)
      .map(m => ({ ...m, user: { id: m.userId, name: this.users.find(u => u.id === m.userId)?.name } }))
  }
  private sprintWithColumns(s: Row) {
    return { ...s, sprintColumns: this.columns.filter(c => c.sprintId === s.id).sort((a, b) => Number(a.position) - Number(b.position)) }
  }

  // ── rotas ────────────────────────────────────────────────────
  private handle(user: FakeUser, method: string, path: string, q: Record<string, string>, body: Record<string, unknown>): unknown {
    const t = user.tenantId
    const seg = path.split('/').filter(Boolean)
    const now = new Date().toISOString()
    const route = `${method} /${seg.map(s => (STATIC_SEGMENTS.has(s) ? s : ':id')).join('/')}`

    switch (route) {
      case 'GET /auth/me':
        return { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: t }
      case 'GET /auth/my-tenants':
        return this.users
          .filter(u => u.email === user.email)
          .map(u => ({ userId: u.id, tenantId: u.tenantId, tenantName: this.tenants.get(u.tenantId)?.name, tenantSubdomain: u.tenantId, role: u.role, isCurrent: u.id === user.id }))
      case 'GET /auth/all-users':
        return this.users.filter(u => u.tenantId === t).map(({ tenantId: _t, ...u }) => u)

      case 'GET /projects': {
        const all = this.projects.filter(p => p.tenantId === t && !p.deletedAt)
        const page = Number(q.page ?? 1)
        const limit = Number(q.limit ?? 20)
        return { items: all.slice((page - 1) * limit, page * limit), total: all.length, page, limit }
      }
      case 'GET /projects/user/:id':
        return this.members
          .filter(m => m.userId === seg[2] && m.active)
          .map(m => ({ ...m, project: this.projects.find(p => p.id === m.projectId && p.tenantId === t) }))
          .filter(m => m.project)
      case 'GET /projects/:id': {
        const p = this.project(t, seg[1])
        return {
          ...p,
          members: this.members.filter(m => m.projectId === p.id),
          macroFases: this.macroFases.filter(f => f.projectId === p.id),
          stakeholders: this.projectStakeholders
            .filter(l => l.projectId === p.id)
            .map(l => ({ ...l, stakeholder: this.stakeholders.find(s => s.id === l.stakeholderId) })),
        }
      }
      case 'POST /projects': {
        if (this.projects.some(p => p.tenantId === t && p.name === body.name && !p.deletedAt)) throw httpError(409, 'Projeto com esse nome já existe')
        const p = { id: newId('proj'), tenantId: t, status: 'ACTIVE', createdAt: now, updatedAt: now, ...body }
        this.projects.push(p)
        return p
      }
      case 'PATCH /projects/:id':
        return Object.assign(this.project(t, seg[1]), body)
      case 'DELETE /projects/:id':
        this.project(t, seg[1]).deletedAt = now
        return undefined
      case 'POST /projects/:id/members': {
        this.project(t, seg[1])
        if (!this.users.some(u => u.id === body.userId && u.tenantId === t)) throw httpError(404, 'Usuário não encontrado')
        // Como o project-service: funções viram vínculos com o cadastro (lista), nunca texto.
        const { funcoes, role, ...resto } = body as { funcoes?: string[]; role?: string } & Row
        const nomes = funcoes ?? (role ? String(role).split(/\s*[|;,]\s*/).filter(Boolean) : [])
        const m = { id: newId('up'), projectId: seg[1], active: true, ...resto, funcoes: nomes.map((name, ordem) => ({ ordem, role: { name } })) }
        this.members.push(m)
        return m
      }
      case 'POST /projects/:id/macro-fases': {
        this.project(t, seg[1])
        for (const f of (body.fases as Row[]) ?? []) this.macroFases.push({ ...f, id: newId('mf'), projectId: seg[1] })
        return { count: ((body.fases as unknown[]) ?? []).length }
      }

      case 'GET /stakeholders':
        return this.stakeholders.filter(s => s.tenantId === t)
      case 'POST /stakeholders': {
        const s = { id: newId('sh'), tenantId: t, ...body }
        this.stakeholders.push(s)
        return s
      }
      case 'POST /stakeholders/:id/projects/:id': {
        this.project(t, seg[3])
        const l = { id: newId('psh'), stakeholderId: seg[1], projectId: seg[3], order: 0 }
        this.projectStakeholders.push(l)
        return l
      }

      case 'GET /tags':
        return this.tags.filter(g => g.tenantId === t)
      case 'POST /tags': {
        const existing = this.tags.find(g => g.name === body.name && g.userId === user.id)
        if (existing) return Object.assign(existing, { color: body.color ?? existing.color })
        const g = { id: newId('tag'), tenantId: t, userId: user.id, color: '#6b7280', ...body }
        this.tags.push(g)
        return g
      }

      case 'GET /sprints':
        return this.sprints
          .filter(s => !s.deletedAt && s.projectId === q.projectId && this.projects.some(p => p.id === s.projectId && p.tenantId === t))
          .map(s => this.sprintWithColumns(s))
      case 'GET /sprints/:id':
        return this.sprintWithColumns(this.sprint(t, seg[1]))
      case 'POST /sprints': {
        if (!body.projectId) throw httpError(400, 'projectId é obrigatório')
        this.project(t, String(body.projectId))
        const s = { id: newId('spr'), status: 'PLANNED', createdAt: now, ...body }
        this.sprints.push(s)
        ;['A Fazer', 'Em andamento', 'Em teste', 'Concluído'].forEach((title, position) =>
          this.columns.push({ id: newId('col'), sprintId: s.id, title, position }),
        )
        return s
      }
      case 'PATCH /sprints/:id':
        return Object.assign(this.sprint(t, seg[1]), body)
      case 'DELETE /sprints/:id':
        this.sprint(t, seg[1]).deletedAt = now
        return undefined
      case 'GET /sprints/:id/columns':
        this.sprint(t, seg[1])
        return this.columns
          .filter(c => c.sprintId === seg[1] && !c.deletedAt)
          .sort((a, b) => Number(a.position) - Number(b.position))
          .map(c => ({ ...c, cards: this.cards.filter(k => k.sprintColumnId === c.id && !k.deletedAt).map(k => this.hydrateCard(k)) }))
      case 'POST /sprints/:id/columns': {
        this.sprint(t, seg[1])
        const c = { id: newId('col'), sprintId: seg[1], ...body }
        this.columns.push(c)
        return c
      }
      case 'PATCH /sprints/:id/columns/:id': {
        this.sprint(t, seg[1])
        const c = this.columns.find(c => c.id === seg[3] && c.sprintId === seg[1] && !c.deletedAt)
        if (!c) throw httpError(404, 'Coluna não encontrada')
        return Object.assign(c, body)
      }
      case 'DELETE /sprints/:id/columns/:id': {
        this.sprint(t, seg[1])
        const c = this.columns.find(c => c.id === seg[3] && c.sprintId === seg[1])
        if (!c) throw httpError(404, 'Coluna não encontrada')
        c.deletedAt = now
        return undefined
      }
      case 'GET /sprints/:id/cards':
        this.sprint(t, seg[1])
        return this.cards.filter(c => c.sprintId === seg[1] && !c.deletedAt).map(c => this.hydrateCard(c))

      case 'GET /cards/page': {
        const sprint = q.sprintId ? this.sprint(t, q.sprintId) : null
        const projectId = q.projectId ?? sprint?.projectId
        this.project(t, String(projectId))
        if (sprint && sprint.projectId !== projectId) throw httpError(404)
        let cards = this.cards.filter(c => !c.deletedAt && (c.sprintId
          ? this.sprints.some(s => s.id === c.sprintId && s.projectId === projectId && !s.deletedAt)
          : c.projectId === projectId))
        if (q.sprintId) cards = cards.filter(c => c.sprintId === q.sprintId)
        if (q.backlog === 'true') cards = cards.filter(c => !c.sprintId)
        if (q.columnId) cards = cards.filter(c => c.sprintColumnId === q.columnId)
        if (q.priority) cards = cards.filter(c => c.priority === q.priority)
        if (q.responsibleId) cards = cards.filter(c => this.cardResponsibles.some(r => r.cardId === c.id && r.userId === q.responsibleId))
        if (q.dueBefore) cards = cards.filter(c => c.endDate && String(c.endDate) <= q.dueBefore)
        if (q.dueAfter) cards = cards.filter(c => c.endDate && String(c.endDate) >= q.dueAfter)
        if (q.q) cards = cards.filter(c => `${c.title}\n${c.description ?? ''}`.toLowerCase().includes(q.q.toLowerCase()))
        cards.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))
        const total = cards.length
        const offset = q.cursor ? cards.findIndex(c => c.id === Buffer.from(q.cursor, 'base64url').toString()) + 1 : 0
        const limit = Number(q.limit ?? 50)
        const page = cards.slice(offset, offset + limit)
        return { items: page.map(c => ({ ...this.hydrateCard(c),
          sprint: this.sprints.find(s => s.id === c.sprintId), sprintColumn: this.columns.find(col => col.id === c.sprintColumnId),
        })), total, next_cursor: offset + page.length < total ? Buffer.from(page[page.length - 1].id).toString('base64url') : null }
      }
      case 'GET /cards/backlog':
        this.project(t, q.projectId)
        return this.cards.filter(c => c.projectId === q.projectId && !c.sprintId && !c.deletedAt).map(c => this.hydrateCard(c))
      case 'GET /cards/:id':
        return this.hydrateCard(this.card(t, seg[1]), true)
      case 'POST /cards': {
        if (!body.projectId && !body.sprintId) throw httpError(400, 'projectId ou sprintId é obrigatório')
        if (body.projectId) this.project(t, String(body.projectId))
        if (body.sprintId) this.sprint(t, String(body.sprintId))
        const c = { id: newId('card'), priority: 'media', createdAt: now, updatedAt: now, ...body }
        this.cards.push(c)
        return c
      }
      case 'PATCH /cards/:id': {
        const { reason: _reason, ...rest } = body
        return Object.assign(this.card(t, seg[1]), rest, { updatedAt: now })
      }
      case 'DELETE /cards/:id':
        this.card(t, seg[1]).deletedAt = now
        return undefined
      case 'GET /cards/:id/movements':
        this.card(t, seg[1])
        return []
      case 'POST /cards/:id/tags/:id': {
        this.card(t, seg[1])
        if (!this.tags.some(g => g.id === seg[3] && g.tenantId === t)) throw httpError(404, 'Tag não encontrada')
        this.cardTags.push({ cardId: seg[1], tagId: seg[3] })
        return {}
      }
      case 'DELETE /cards/:id/tags/:id':
        this.card(t, seg[1])
        this.cardTags = this.cardTags.filter(ct => !(ct.cardId === seg[1] && ct.tagId === seg[3]))
        return undefined
      case 'POST /cards/:id/responsibles/:id': {
        this.card(t, seg[1])
        if (!this.users.some(u => u.id === seg[3] && u.tenantId === t)) throw httpError(404, 'Usuário não encontrado')
        this.cardResponsibles.push({ cardId: seg[1], userId: seg[3] })
        return {}
      }
      case 'DELETE /cards/:id/responsibles/:id':
        this.card(t, seg[1])
        this.cardResponsibles = this.cardResponsibles.filter(r => !(r.cardId === seg[1] && r.userId === seg[3]))
        return undefined
      case 'GET /cards/:id/comments':
        this.card(t, seg[1])
        return this.commentsOf(seg[1])
      case 'POST /cards/:id/comments': {
        this.card(t, seg[1])
        const m = { id: newId('cmt'), cardId: seg[1], userId: user.id, type: 'COMMENT', createdAt: now, updatedAt: now, ...body }
        this.comments.push(m)
        return { ...m, user: { id: user.id, name: user.name } }
      }

      case 'POST /audit': {
        const a = { id: newId('aud'), tenantId: t, userId: user.id, timestamp: now, ...body }
        this.audit.push(a)
        return a
      }
      case 'GET /audit':
        return this.audit.filter(a => a.tenantId === t && (!q.entity || a.entity === q.entity) && (!q.entityId || a.entityId === q.entityId))

      // sprint-service: um timer rodando por usuário (userId é por tenant).
      case 'GET /time-entries/running': {
        const e = this.timeEntries.find(e => e.userId === user.id && e.isRunning && !e.deletedAt)
        if (!e) return { entry: null }
        const c = this.cards.find(c => c.id === e.cardId)
        return { entry: { ...e, card: c ? { id: c.id, title: c.title, sprintId: c.sprintId ?? null, deletedAt: null } : null } }
      }
      case 'POST /cards/:id/time-entries/start': {
        this.card(t, seg[1])
        if (this.timeEntries.some(e => e.userId === user.id && e.isRunning && !e.deletedAt)) {
          throw httpError(400, 'Já existe um timer em andamento')
        }
        const e = {
          id: newId('te'), cardId: seg[1], userId: user.id, startedAt: now, endedAt: null, duration: 0,
          isRunning: true, isManual: false, description: body.description ?? null, deletedAt: null,
        }
        this.timeEntries.push(e)
        return e
      }
      case 'POST /time-entries/:id/stop': {
        const e = this.timeEntries.find(e => e.id === seg[1] && !e.deletedAt)
        if (!e || e.userId !== user.id) throw httpError(404, 'Time entry não encontrada')
        const ended = new Date()
        Object.assign(e, {
          endedAt: ended.toISOString(),
          duration: Math.floor((ended.getTime() - Date.parse(String(e.startedAt))) / 1000),
          isRunning: false,
        })
        return e
      }
      case 'POST /cards/:id/time-entries/manual': {
        this.card(t, seg[1])
        const e = {
          id: newId('te'), cardId: seg[1], userId: user.id, startedAt: body.startedAt, endedAt: body.endedAt,
          duration: Math.floor((Date.parse(String(body.endedAt)) - Date.parse(String(body.startedAt))) / 1000),
          isRunning: false, isManual: true, description: body.description ?? null, deletedAt: null,
        }
        this.timeEntries.push(e)
        return e
      }
      case 'GET /cards/:id/time-entries':
        this.card(t, seg[1])
        return this.timeEntries
          .filter(e => e.cardId === seg[1] && !e.deletedAt)
          .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
      // Como o gateway (apiAuthorization) e o sprint-service: só o dono ou admin altera; timer rodando não se edita.
      case 'PATCH /time-entries/:id': {
        const e = this.ownEntry(t, seg[1], user)
        if (e.isRunning) throw httpError(409, 'Pare o timer antes de editar este lançamento.')
        const startedAt = String(body.startedAt ?? e.startedAt)
        const endedAt = body.endedAt
          ? String(body.endedAt)
          : body.duration !== undefined ? new Date(Date.parse(startedAt) + Number(body.duration) * 1000).toISOString() : String(e.endedAt)
        Object.assign(e, {
          startedAt, endedAt, duration: Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1000),
          ...(body.description !== undefined ? { description: body.description } : {}),
        })
        return e
      }
      case 'DELETE /time-entries/:id':
        this.ownEntry(t, seg[1], user).deletedAt = now
        return undefined

      case 'POST /files/upload': {
        const bytes = body.bytes as Buffer
        const { bytes: _omit, ...meta } = body
        const a = {
          id: newId('att'), cardId: q.cardId, ...meta, filePath: `https://minio.test/operum/uploads/${q.cardId}/${seq}`,
          fileSize: bytes.length, isCover: false, deletedAt: null, createdAt: now, updatedAt: now,
        }
        this.attachments.push(a)
        this.attachmentBytes.set(a.id, bytes)
        return a
      }
      case 'POST /files/link': {
        const a = {
          id: newId('att'), cardId: q.cardId, fileName: body.title, fileType: 'text/uri-list', filePath: body.url,
          fileSize: 0, isCover: false, deletedAt: null, createdAt: now, updatedAt: now,
        }
        this.attachments.push(a)
        return a
      }
      case 'GET /files/by-cards': {
        const ids = (q.cardIds ?? '').split(',').filter(Boolean)
        return this.attachments.filter(a => ids.includes(a.cardId as string) && !a.deletedAt)
      }
      case 'GET /files/:id/url': {
        // Como o file-service depois da 4.1: com cardId, o anexo precisa ser desse card.
        const a = this.attachments.find(a => a.id === seg[1] && !a.deletedAt && (!q.cardId || a.cardId === q.cardId))
        if (!a) throw httpError(404, 'Anexo não encontrado')
        return { url: a.fileType === 'text/uri-list' ? a.filePath : `https://storage.test/operum/${a.id}?X-Amz-Signature=fake` }
      }
      case 'DELETE /files/:id': {
        const a = this.attachments.find(a => a.id === seg[1] && !a.deletedAt)
        if (!a) throw httpError(404, 'Anexo não encontrado')
        a.deletedAt = now
        return undefined
      }
    }
    throw httpError(404, `rota não implementada no fake: ${route}`)
  }
}

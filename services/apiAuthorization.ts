import 'server-only'
import prisma from '@/lib/prisma'
import { exigirPermissao, can, projetosAutorizados, SemPermissaoError, type SessaoAuthz } from './authz'
import { Prisma } from '@/lib/generated/prisma'
import type { Permissao } from '@/lib/permissoes'

export interface ApiAccess { allowed: boolean; projectIds?: string[]; redactDocuments?: boolean }
export class ApiAccessDenied extends Error {}
const deny = (): never => { throw new ApiAccessDenied('Não autorizado') }
const id = (v: unknown): string => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v) ? v : deny()
const movement = new Set(['sprintId', 'sprintColumnId', 'projectId', 'position', 'sprintPosition', 'movementReason', 'reason'])
const charterFields = ['justificativa','objetivos','metodologia','descricaoProduto','premissas','restricoes','limitesAutoridade']

/** Autoriza a identidade verificada, usando o estado persistido, nunca o papel enviado pelo cliente. */
export async function authorizeApi(s: SessaoAuthz, method: string, path: string, body: Record<string, unknown> = {}): Promise<ApiAccess> {
  const url = new URL(path, 'http://internal')
  let p: string[]
  try { p = url.pathname.split('/').filter(Boolean).map(decodeURIComponent) } catch { return deny() }
  if (p.some(x => x.includes('/') || x.includes('\\'))) deny()
  // Express e Nest roteiam sem diferenciar maiúsculas ("/projects/x/Roles" chega
  // em /roles): segmentos-chave são comparados em minúsculas; ids seguem como vieram.
  const [root, target, child] = [p[0]?.toLowerCase(), p[1], p[2]?.toLowerCase()]
  const targetKey = target?.toLowerCase()
  const read = method === 'GET' || method === 'HEAD'
  const require = async (projectId: unknown, permission: Permissao) => {
    const project = id(projectId)
    await exigirPermissao(s, project, 'projeto:ver')
    if (permission !== 'projeto:ver') await exigirPermissao(s, project, permission)
  }
  const sprintProject = async (sprintId: unknown) => {
    const found = await prisma.sprint.findFirst({ where: { id: id(sprintId), deletedAt: null, project: { tenantId: s.tenantId, deletedAt: null } }, select: { projectId: true } })
    return found?.projectId ?? deny()
  }
  const cardProject = async (cardId: unknown) => {
    const c = await prisma.card.findFirst({ where: { id: id(cardId), deletedAt: null, OR: [{ sprint: { deletedAt: null, project: { tenantId: s.tenantId, deletedAt: null } } }, { sprintId: null, project: { tenantId: s.tenantId, deletedAt: null } }] }, select: { projectId: true, sprint: { select: { projectId: true } } } })
    return c?.sprint?.projectId ?? c?.projectId ?? deny()
  }
  const list = async (permission: Permissao): Promise<ApiAccess> => ({ allowed: true, projectIds: await projetosAutorizados(s, permission) })
  if (root === 'dashboard') {
    if (!read || targetKey !== 'global' || child) deny()
    const boards = await projetosAutorizados(s, 'quadro:ver')
    const costs = new Set(await projetosAutorizados(s, 'planilha:ver'))
    return { allowed: true, projectIds: boards.filter(project => costs.has(project)) }
  } else if (root === 'projects') {
    if (read && (!target || targetKey === 'user')) return list('projeto:ver')
    if (!target) { if (method !== 'POST' || s.role !== 'admin') deny(); return { allowed: true } }
    if (child === 'roles' && !read && s.role !== 'admin') deny()
    if (child === 'members' && !read && s.role !== 'admin') {
      // Cargos e o papel de gerente alimentam o resolvedor: a gestão de equipe não pode concedê-los.
      if (['role','roles','cargos','projectRole','isGerente'].some(k => k in body)) deny()
    }
    await require(target, read ? 'projeto:ver' : child === 'members' ? 'projeto:equipe' : 'projeto:editar')
    if (!read && 'departamentos' in body) await require(target, 'cadastros:gerenciar')
    if (!read && charterFields.some(k => k in body)) {
      await require(target, 'documentos:editar')
      await require(target, 'documentos:aprovar')
      const snapshot = await prisma.documentVersion.findFirst({ where: { projectId: id(target), documentType: 'CHARTER', resourceId: '', status: 'APPROVED', payload: { not: Prisma.DbNull } }, select: { id: true } })
      if (snapshot) throw new ApiAccessDenied('Este Termo usa versões: altere pelo fluxo documental')
    }
    if (read && !child) return { allowed: true, redactDocuments: !(await can(s, id(target), 'documentos:ver')) }
    if (!read && (child === 'macro-fases' || (!child && 'macroFases' in body))) {
      await require(target, 'planilha:orcado')
      await require(target, 'planilha:realizado-todos')
    }
  } else if (root === 'sprints') {
    if (read && !target) return list('quadro:ver')
    const project = target ? await sprintProject(target) : body.projectId
    await require(project, read ? 'quadro:ver' : child === 'metrics' || child === 'feedback' ? 'quadro:cards' : 'quadro:sprints')
    if (child === 'dashboard') { if (!read) deny(); await require(project, 'planilha:ver') }
    if (body.projectId) await require(body.projectId, 'quadro:sprints')
  } else if (root === 'cards') {
    if (read && targetKey === 'page') {
      if (child) deny()
      const project = url.searchParams.get('projectId')
      const sprint = url.searchParams.get('sprintId')
      if (!project && !sprint) deny()
      if (project) await require(project, 'quadro:ver')
      if (sprint) {
        const owner = await sprintProject(sprint)
        if (project && project !== owner) deny()
        await require(owner, 'quadro:ver')
      }
      return { allowed: true }
    }
    if (read && targetKey === 'search') return list('quadro:ver')
    if (read && targetKey === 'backlog') { await require(url.searchParams.get('projectId'), 'quadro:ver'); return { allowed: true } }
    if (targetKey === 'in-tenant' && method === 'POST') {
      if (!Array.isArray(body.ids) || body.ids.length > 500) deny()
      for (const card of body.ids as unknown[]) await require(await cardProject(card), 'quadro:ver')
      return { allowed: true }
    }
    const project = target ? await cardProject(target) : body.sprintId ? await sprintProject(body.sprintId) : body.projectId
    if (child === 'costs') {
      if (p.length !== 3 || !['GET', 'PATCH'].includes(method)) deny()
      await require(project, 'planilha:ver')
      // Field-level financial permissions and persisted ownership are checked by the app.
      return { allowed: true }
    }
    if (child === 'budget') {
      if (p.length !== 3 || !['GET', 'PATCH'].includes(method)) deny()
      await require(project, 'planilha:ver')
      if (!read) await require(project, 'planilha:orcado')
      return { allowed: true }
    }
    const keys = Object.keys(body)
    const moves = !read && !child && !!target && keys.some(k => movement.has(k))
    // userId é metadado de movimento, sem conceder acesso para alterar outros campos.
    const edits = !target || !!child || keys.some(k => !movement.has(k) && k !== 'userId')
    await require(project, read ? 'quadro:ver' : method === 'DELETE' && !child ? 'quadro:excluir' : moves && !edits ? 'quadro:mover' : 'quadro:cards')
    if (moves) await require(project, 'quadro:mover')
    const destinationPermission = moves && !edits ? 'quadro:mover' : 'quadro:cards'
    if (body.projectId) await require(body.projectId, destinationPermission)
    if (body.sprintId) await require(await sprintProject(body.sprintId), destinationPermission)
    if (body.sprintColumnId) {
      const col = await prisma.sprintColumn.findUnique({ where: { id: id(body.sprintColumnId) }, select: { sprintId: true } })
      const destination = await sprintProject(col?.sprintId)
      await require(destination, moves ? 'quadro:mover' : 'quadro:cards')
      if (edits && moves) await require(destination, 'quadro:cards')
    }
  } else if (root === 'time-entries') {
    if (targetKey === 'running' && read) return { allowed: true }
    const entry = await prisma.timeEntry.findFirst({ where: { id: id(target), deletedAt: null }, select: { cardId: true, userId: true } })
    if (!entry) return deny()
    // Encerrar trabalho próprio não exige permissão de edição; continua exigindo leitura e tenant válido.
    if (child === 'stop' && method === 'POST' && entry.userId === s.userId) { await require(await cardProject(entry.cardId), 'projeto:ver'); return { allowed: true } }
    await require(await cardProject(entry.cardId), read ? 'quadro:ver' : 'quadro:cards')
    if (!read && entry.userId !== s.userId && s.role !== 'admin') deny()
  } else if (root === 'files') {
    let cards: unknown[]
    if (targetKey === 'by-cards' && read) cards = (url.searchParams.get('cardIds') ?? '').split(',').filter(Boolean)
    else if ((targetKey === 'upload' || targetKey === 'link') && method === 'POST') cards = [url.searchParams.get('cardId')]
    else {
      const rows = await prisma.$queryRaw<{ cardId: string }[]>`SELECT "cardId" FROM files."Attachment" WHERE id = ${id(target)}`
      if (!rows[0]) return deny()
      cards = [rows[0].cardId]
    }
    if (cards.length > 500) deny()
    for (const card of cards) await require(await cardProject(card), read ? 'quadro:ver' : 'quadro:cards')
  } else if (root === 'stakeholders') {
    const project = targetKey === 'by-project' ? p[2] : child === 'projects' ? p[3] : null
    if (project) await require(project, read ? 'projeto:ver' : 'projeto:equipe')
    else if (!read && s.role !== 'admin') {
      const context = url.searchParams.get('projectId')
      await require(context, 'projeto:equipe')
      if (target) {
        const links = await prisma.projectStakeholder.findMany({ where: { stakeholderId: id(target), project: { tenantId: s.tenantId, deletedAt: null } }, select: { projectId: true } })
        if (!links.some(x => x.projectId === context)) deny()
        // O cadastro é compartilhado: editar exige autorização em todos os projetos afetados.
        for (const link of links) await require(link.projectId, 'projeto:equipe')
      } else if (method !== 'POST') deny()
    }
  } else if (['roles', 'permissions', 'departments'].includes(root)) {
    if (!read && s.role !== 'admin') deny()
  } else if (root === 'tags') {
    if (!read && s.role !== 'admin' && !(await projetosAutorizados(s, 'quadro:cards')).length) deny()
  } else if (root === 'audit') {
    if (read && s.role !== 'admin') deny()
  } else deny()
  return { allowed: true }
}

export function isAccessDenied(error: unknown) {
  return error instanceof ApiAccessDenied || error instanceof SemPermissaoError
}

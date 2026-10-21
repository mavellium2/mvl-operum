'use server'

import { requireProjectPermission } from '@/services/projectAccess'
import { getTree } from '@/services/wbsService'
import { planilhaDoProjeto } from '@/services/planilhaService'
import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { sprintsApi, cardsApi, tagsApi, filesApi } from '@/lib/api-client'
import prisma from '@/lib/prisma'
import { bloqueioDeConclusao } from '@/services/membroInativo'
import { camposDaSprint, diferencasSprint, registrarHistoricoSprint } from '@/services/sprintHistoricoService'
import { z } from 'zod'

/** Card como o board consome (colunas e backlog têm o mesmo formato). */
type BoardCard = {
  id: string
  title: string
  description: string
  color: string
  priority?: string | null
  sprintPosition?: number | null
  tags?: { tagId: string; tag: { id?: string; name: string; color: string } }[]
  attachments?: { id: string; fileName: string; fileType: string; filePath: string; fileSize: number; isCover?: boolean; uploadedAt: string | Date }[]
  timeEntries?: { duration: number }[]
  responsibles?: { user: { id: string; name: string; avatarUrl: string | null } }[]
  startDate?: string | Date | null
  endDate?: string | Date | null
  /** Código do nó vinculado na EAP (ex.: "1.2.3"), exibido antes do título. */
  eapCode?: string
}

type BacklogCard = BoardCard

type SprintBoardData = {
  sprint: { id: string; name: string; status: string; projectId?: string | null; startDate: Date | string | null; endDate: Date | string | null; description?: string | null; qualidade?: number | null; dificuldade?: number | null }
  columns: { id: string; title: string; position: number; cards: BoardCard[] }[]
  backlogCards: BacklogCard[]
  users: { id: string; name: string; email: string; avatarUrl?: string | null }[]
  /** Membros inativados no projeto: os cards só com eles pedem outro responsável. */
  inactiveUserIds: string[]
  tags: { id: string; name: string; color: string }[]
}

type ResponsibleUser = { id: string; name: string; avatarUrl?: string | null }

function buildAvatarMap(users: { id: string; avatarUrl?: string | null }[]): Map<string, string | null> {
  return new Map(users.map(u => [u.id, u.avatarUrl ?? null]))
}

function enrichCardResponsibles<T extends { responsibles?: { user: ResponsibleUser }[] }>(
  card: T,
  avatarByUserId: Map<string, string | null>,
): T & { responsibles: { user: { id: string; name: string; avatarUrl: string | null } }[] } {
  return {
    ...card,
    responsibles: (card.responsibles ?? []).map(r => ({
      ...r,
      user: {
        id: r.user.id,
        name: r.user.name,
        avatarUrl: r.user.avatarUrl ?? avatarByUserId.get(r.user.id) ?? null,
      },
    })),
  }
}

async function codigosEapDosCards(projectId: string, tenantId: string): Promise<Map<string, string>> {
  if (!projectId) return new Map()
  try {
    const nos = await prisma.wbsNode.findMany({ where: { projectId, tenantId }, select: { code: true, properties: true } })
    const mapa = new Map<string, string>()
    for (const no of nos) {
      const cardId = (no.properties as Record<string, unknown> | null)?.cardId
      if (typeof cardId === 'string' && no.code) mapa.set(cardId, no.code)
    }
    return mapa
  } catch {
    return new Map() // sem EAP o quadro carrega sem os códigos
  }
}

export async function getSprintBoardAction(sprintId: string, projectId?: string): Promise<SprintBoardData | { error: string }> {
  try {
    const { tenantId } = await verifySession()
    const sprint = await sprintsApi.get(sprintId)
    const resolvedProjectId = projectId ?? (sprint as { projectId?: string }).projectId ?? ''

    const [columns, tags, backlogCards] = await Promise.all([
      sprintsApi.listColumns(sprintId),
      tagsApi.list(),
      resolvedProjectId ? cardsApi.listBacklog(resolvedProjectId) : Promise.resolve([]),
    ])

    // Responsáveis possíveis: somente membros (stakeholders internos) vinculados ao projeto — nunca usuários externos.
    const projectMembers = resolvedProjectId
      ? await prisma.userProject.findMany({
          where: {
            projectId: resolvedProjectId,
            active: true,
            user: { tenantId, deletedAt: null, isActive: true },
          },
          select: { user: { select: { id: true, name: true, email: true, avatarUrl: true } } },
          orderBy: { order: 'asc' },
        })
      : []
    const users = projectMembers.map(m => m.user).filter((u): u is { id: string; name: string; email: string; avatarUrl: string | null } => u != null)
    // Membros inativados continuam nos cards em que já eram responsáveis.
    const inativos = resolvedProjectId
      ? await prisma.userProject.findMany({
          where: { projectId: resolvedProjectId, active: false, inactiveReason: { not: null } },
          select: { user: { select: { id: true, avatarUrl: true } } },
        })
      : []
    const inactiveUserIds = inativos.map(i => i.user.id)

    const typedColumns = columns as SprintBoardData['columns']
    const typedBacklog = backlogCards as BacklogCard[]

    // Responsáveis vindos do sprint-service não têm avatarUrl (réplica local do
    // User). Enriquecer cruzando com o banco principal (userProject -> User.avatarUrl),
    // mesmo padrão usado para anexos abaixo. Resolve avatar sumindo ao reabrir card.
    const avatarByUserId = buildAvatarMap([...users, ...inativos.map(i => i.user)])

    const baseColumns = typedColumns.map(col => ({
      ...col,
      cards: (col.cards ?? []).map(card => enrichCardResponsibles(card, avatarByUserId)),
    }))
    const baseBacklog = typedBacklog.map(card => enrichCardResponsibles(card, avatarByUserId))

    // Enrich cards with attachments from file-service.
    // Wrapped in its own try/catch so any failure (service down, 5xx, schema mismatch)
    // never breaks the sprint board page load.
    let finalColumns: SprintBoardData['columns'] = baseColumns
    let finalBacklog: BacklogCard[] = baseBacklog

    try {
      const CUID_RE = /^c[a-z0-9]{20,30}$/
      const cardIds = [
        ...typedColumns.flatMap(col => (col.cards ?? []).map(c => c.id)),
        ...typedBacklog.map(c => c.id),
      ]
        .filter(id => CUID_RE.test(id))
        .filter((id, i, arr) => arr.indexOf(id) === i)

      type FileAtt = { id: string; cardId: string; fileName: string; fileType: string; filePath: string; fileSize: number; isCover: boolean; createdAt: string }
      const fileAttachments: FileAtt[] = cardIds.length > 0 ? await filesApi.listByCards(cardIds) : []

      const byCard = new Map<string, FileAtt[]>()
      for (const att of fileAttachments) {
        const list = byCard.get(att.cardId) ?? []
        list.push(att)
        byCard.set(att.cardId, list)
      }

      const enrich = (id: string) =>
        (byCard.get(id) ?? []).map(a => ({
          id: a.id, fileName: a.fileName, fileType: a.fileType,
          filePath: a.filePath, fileSize: a.fileSize, isCover: a.isCover,
          uploadedAt: a.createdAt,
        }))

      finalColumns = baseColumns.map(col => ({
        ...col,
        cards: (col.cards ?? []).map(card => ({ ...card, attachments: enrich(card.id) })),
      }))
      finalBacklog = baseBacklog.map(card => ({ ...card, attachments: enrich(card.id) }))
    } catch { /* file-service indisponível — sprint board carrega sem anexos */ }

    // Código da EAP de cada card (vínculo em WbsNode.properties.cardId).
    const codigoPorCard = await codigosEapDosCards(resolvedProjectId, tenantId)
    if (codigoPorCard.size) {
      const comCodigo = <T extends { id: string }>(card: T) => {
        const eapCode = codigoPorCard.get(card.id)
        return eapCode ? { ...card, eapCode } : card
      }
      finalColumns = finalColumns.map(col => ({ ...col, cards: (col.cards ?? []).map(comCodigo) }))
      finalBacklog = finalBacklog.map(comCodigo)
    }

    return { sprint, columns: finalColumns, backlogCards: finalBacklog, users, tags, inactiveUserIds } as unknown as SprintBoardData
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao carregar sprint board' }
  }
}

export async function addSprintColumnAction(sprintId: string, title: string) {
  try {
    await verifySession()
    const existing = await sprintsApi.listColumns(sprintId) as unknown[]
    const column = await sprintsApi.createColumn(sprintId, { title, position: existing.length })
    revalidatePath(`/sprints/${sprintId}`)
    return { column }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar coluna' }
  }
}

export async function moveCardInSprintAction(
  cardId: string,
  sprintColumnId: string,
  sprintPosition: number,
  reason?: string,
) {
  try {
    await verifySession()
    const bloqueio = await bloqueioDeConclusao(cardId, sprintColumnId)
    if (bloqueio) return { error: bloqueio }
    await cardsApi.update(cardId, { sprintColumnId, sprintPosition, ...(reason ? { reason } : {}) })
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao mover card' }
  }
}

export async function getCardMovementsAction(cardId: string) {
  try {
    await verifySession()
    const movements = await cardsApi.listMovements(cardId)
    return { movements }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao carregar movimentações' }
  }
}

/** Só envia as datas preenchidas (o sprint-service exige ISO válido na criação). */
function datasDoCard(input: { startDate?: string | null; endDate?: string | null }) {
  return {
    ...(input.startDate ? { startDate: input.startDate } : {}),
    ...(input.endDate ? { endDate: input.endDate } : {}),
  }
}

export async function createCardInSprintAction(input: {
  sprintId: string
  sprintColumnId: string
  title: string
  description?: string
  color?: string
  priority?: string
  startDate?: string | null
  endDate?: string | null
}) {
  try {
    await verifySession()
    const card = await cardsApi.create({
      title: input.title,
      description: input.description ?? '',
      color: input.color ?? '#3b82f6',
      priority: input.priority ?? 'media',
      sprintId: input.sprintId,
      sprintColumnId: input.sprintColumnId,
      ...datasDoCard(input),
    })
    revalidatePath(`/sprints/${input.sprintId}`)
    return { card }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar card' }
  }
}

export async function renameSprintColumnAction(sprintId: string, columnId: string, title: string) {
  try {
    await verifySession()
    const column = await sprintsApi.updateColumn(sprintId, columnId, { title })
    revalidatePath(`/sprints/${sprintId}`)
    return { column }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao renomear coluna' }
  }
}

export async function setSprintColumnColorAction(sprintId: string, columnId: string, color: string | null) {
  try {
    await verifySession()
    if (color !== null && !/^#[0-9a-fA-F]{6}$/.test(color)) return { error: 'Cor inválida' }
    const column = await sprintsApi.updateColumn(sprintId, columnId, { color })
    revalidatePath(`/sprints/${sprintId}`)
    return { column }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao alterar a cor da coluna' }
  }
}

export async function deleteSprintColumnAction(sprintId: string, columnId: string) {
  try {
    await verifySession()
    await sprintsApi.deleteColumn(sprintId, columnId)
    revalidatePath(`/sprints/${sprintId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao excluir coluna' }
  }
}

export async function reorderSprintColumnsAction(sprintId: string, columnIds: string[]) {
  try {
    await verifySession()
    await sprintsApi.reorderColumns(sprintId, columnIds)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao reordenar colunas' }
  }
}

export async function updateCardInSprintAction(
  sprintId: string,
  cardId: string,
  data: { title: string; description: string; color: string; priority?: string },
) {
  try {
    await verifySession()
    const card = await cardsApi.update(cardId, data as Record<string, unknown>)
    revalidatePath(`/sprints/${sprintId}`)
    return { card }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar card' }
  }
}

const PatchCardSchema = z
  .object({
    description: z.string().max(20000, 'Descrição muito longa').optional(),
    startDate: z.string().datetime().nullable().optional(),
    endDate: z.string().datetime().nullable().optional(),
  })
  .strict()

export type PatchCardInput = z.infer<typeof PatchCardSchema>

/**
 * Atualização parcial de um card (autosave da descrição e datas). Só envia os
 * campos informados; `null` em uma data remove a data.
 */
export async function patchCardAction(sprintId: string, cardId: string, patch: PatchCardInput) {
  try {
    await verifySession()
    const parsed = PatchCardSchema.safeParse(patch)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' }
    const card = await cardsApi.update(cardId, parsed.data as Record<string, unknown>)
    revalidatePath(`/sprints/${sprintId}`)
    return { card }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar card' }
  }
}

export async function deleteCardInSprintAction(sprintId: string, cardId: string) {
  try {
    await verifySession()
    await cardsApi.delete(cardId)
    revalidatePath(`/sprints/${sprintId}`)
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao excluir card' }
  }
}

export async function getProjectBacklogAction(projectId: string): Promise<BacklogCard[] | { error: string }> {
  try {
    const { tenantId } = await verifySession()
    const cards = await cardsApi.listBacklog(projectId)
    const members = await prisma.userProject.findMany({
      where: {
        projectId,
        active: true,
        user: { tenantId, deletedAt: null, isActive: true },
      },
      select: { user: { select: { id: true, avatarUrl: true } } },
    })
    const avatarByUserId = buildAvatarMap(members.map(m => m.user).filter((u): u is { id: string; avatarUrl: string | null } => u != null))
    return (cards as BacklogCard[]).map(card => enrichCardResponsibles(card, avatarByUserId))
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao carregar backlog' }
  }
}

export async function moveCardToSprintAction(
  cardId: string,
  sprintId: string,
  columnId: string,
  position: number,
) {
  try {
    await verifySession()
    const bloqueio = await bloqueioDeConclusao(cardId, columnId)
    if (bloqueio) return { error: bloqueio }
    await cardsApi.update(cardId, { sprintId, sprintColumnId: columnId, sprintPosition: position })
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao mover card para sprint' }
  }
}

export async function moveCardToBacklogAction(cardId: string) {
  try {
    await verifySession()
    await cardsApi.update(cardId, { sprintId: null, sprintColumnId: null, sprintPosition: null })
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao mover card para backlog' }
  }
}

export async function createBacklogCardAction(
  projectId: string,
  data: { title: string; description?: string; color?: string; priority?: string; startDate?: string | null; endDate?: string | null },
) {
  try {
    await verifySession()
    const card = await cardsApi.create({
      projectId,
      title: data.title,
      description: data.description ?? '',
      color: data.color,
      priority: data.priority,
      ...datasDoCard(data),
    })
    return { card }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar card no backlog' }
  }
}

export async function updateSprintMetaAction(
  sprintId: string,
  data: { qualidade?: number; dificuldade?: number; description?: string; name?: string; startDate?: Date | null; endDate?: Date | null },
) {
  try {
    const { userId, tenantId } = await verifySession()
    const antes = await camposDaSprint(sprintId)
    const sprint = await sprintsApi.update(sprintId, data as Record<string, unknown>)
    // Histórico de alterações da sprint (nome, datas, notas).
    try {
      const depois = await camposDaSprint(sprintId)
      if (depois) await registrarHistoricoSprint({ tenantId, userId, sprintId, acao: 'UPDATE', projectId: depois.projectId, nome: depois.name ?? '', alteracoes: diferencasSprint(antes, depois), origem: 'quadro' })
    } catch (error) { console.error('[sprint] falha ao gravar histórico', error) }
    revalidatePath(`/sprints/${sprintId}`)
    revalidatePath('/sprints')
    return { sprint }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar sprint' }
  }
}

/** Dados da linha vinculada: a mesma origem dos valores da EAP e da planilha. */
export async function getCardPlanilhaAction(cardId: string) {
  try {
    const session = await verifySession()
    const card = await prisma.card.findFirst({ where: { id: cardId, deletedAt: null, OR: [{ project: { tenantId: session.tenantId, deletedAt: null } }, { sprint: { project: { tenantId: session.tenantId, deletedAt: null }, deletedAt: null } }] }, select: { projectId: true, sprint: { select: { projectId: true } } } })
    const projectId = card?.sprint?.projectId ?? card?.projectId
    if (!projectId) return { linha: null }
    await requireProjectPermission(session, projectId, 'quadro:ver')
    await requireProjectPermission(session, projectId, 'planilha:ver')
    const [tree, planilha] = await Promise.all([getTree(projectId, session.tenantId), planilhaDoProjeto(projectId, session.tenantId)])
    const linked = new Set(Object.values(tree.nodes).filter(n => n.properties.cardId === cardId).map(n => n.id))
    const linha = planilha?.macrofases.flatMap(f => f.atividades).find(a => linked.has(a.nodeId)) ?? null
    return { linha }
  } catch { return { error: 'Não foi possível carregar os dados da planilha.' } }
}

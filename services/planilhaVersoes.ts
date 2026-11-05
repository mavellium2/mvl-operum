import prisma from '@/lib/prisma'
import { Prisma } from '@/lib/generated/prisma'

type Tx = Prisma.TransactionClient
export function canonicalSnapshot(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalSnapshot).join(',')}]`
  const object = value as Record<string, unknown>
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${canonicalSnapshot(object[key])}`).join(',')}}`
}
async function transaction<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 60000 }) }
    catch (error) { if (attempt < 2 && (error as { code?: string }).code === 'P2034') continue; throw error }
  }
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

async function temAnexosLegados(tx: Tx): Promise<boolean> {
  const [table] = await tx.$queryRaw<{ present: boolean }[]>`SELECT to_regclass('public."Attachment"') IS NOT NULL AS present`
  return table.present
}

async function snapshot(tx: Tx, tenantId: string, projectId: string) {
  const nodes = await tx.wbsNode.findMany({ where: { tenantId, projectId }, orderBy: { id: 'asc' }, select: {
    id: true, parentId: true, order: true, code: true, title: true, layout: true, collapsed: true, style: true, properties: true,
  } })
  const props = nodes.map(n => n.properties as Record<string, unknown>)
  const ids = props.map(p => p.cardId).filter((id): id is string => typeof id === 'string')
  const sprintIds = props.map(p => p.sprintId).filter((id): id is string => typeof id === 'string')
  const cards = await tx.card.findMany({ where: { id: { in: ids }, deletedAt: null, OR: [{ projectId }, { sprint: { projectId } }] }, orderBy: { id: 'asc' }, select: {
    id: true, title: true, description: true, priority: true, startDate: true, endDate: true, sprintId: true, sprintColumnId: true, sprintPosition: true,
    responsibles: { orderBy: { userId: 'asc' }, select: { userId: true } },
    comments: { where: { deletedAt: null }, orderBy: { id: 'asc' }, select: { id: true, content: true } },
    timeEntries: { where: { deletedAt: null, isRunning: false }, orderBy: { id: 'asc' }, select: { id: true, startedAt: true, endedAt: true, duration: true, description: true } },
  } })
  const sprints = await tx.sprint.findMany({ where: { id: { in: sprintIds }, projectId, deletedAt: null }, orderBy: { id: 'asc' }, select: { id: true, name: true, startDate: true, endDate: true } })
  const validCardIds = cards.map(card => card.id)
  const fileAttachments = validCardIds.length ? await tx.$queryRaw<{ id: string; cardId: string; fileName: string; isCover: boolean }[]>`
    SELECT "id", "cardId", "fileName", "isCover" FROM files."Attachment"
    WHERE "cardId" IN (${Prisma.join(validCardIds)}) AND "deletedAt" IS NULL ORDER BY "id"
  ` : []
  // Older installations retain public.Attachment; production uploads live in files.
  // Check existence before querying: catching a missing table would abort this transaction.
  const legacyAttachments = validCardIds.length && await temAnexosLegados(tx)
    ? await tx.$queryRaw<{ id: string; cardId: string; fileName: string; isCover: boolean }[]>`
      SELECT "id", "cardId", "fileName", "isCover" FROM public."Attachment"
      WHERE "cardId" IN (${Prisma.join(validCardIds)}) AND "deletedAt" IS NULL ORDER BY "id"
    ` : []
  return { nodes, cards: cards.map(card => ({ ...card, attachments: legacyAttachments.filter(file => file.cardId === card.id).map(({ id, fileName, isCover }) => ({ id, fileName, isCover })) })), sprints, fileAttachments }
}
type Snapshot = Awaited<ReturnType<typeof snapshot>>

async function lock(tx: Tx, tenantId: string, projectId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${`planilha-history:${tenantId}:${projectId}`}))`
  const project = await tx.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { id: true } })
  if (!project) throw new Error('Projeto não encontrado.')
}

async function record(tx: Tx, ctx: { tenantId: string; projectId: string; userId: string }, restoredFrom?: number) {
  const { tenantId, projectId } = ctx
  const content = json(await snapshot(tx, tenantId, projectId))
  const latest = await tx.planilhaVersao.findFirst({ where: { tenantId, projectId }, orderBy: { numero: 'desc' } })
  if (!restoredFrom && latest && canonicalSnapshot(latest.conteudo) === canonicalSnapshot(content)) return latest.numero
  const author = await tx.user.findFirst({ where: { id: ctx.userId, tenantId }, select: { name: true } })
  const numero = (latest?.numero ?? 0) + 1
  await tx.planilhaVersao.create({ data: { tenantId, projectId, numero, conteudo: content, autorId: ctx.userId, autorNome: author?.name ?? '', restauradaDe: restoredFrom } })
  return numero
}

export async function registrarVersaoPlanilha(ctx: { tenantId: string; projectId: string; userId: string }) {
  return transaction(async tx => { await lock(tx, ctx.tenantId, ctx.projectId); return record(tx, ctx) })
}

export async function garantirVersaoInicialPlanilha(ctx: { tenantId: string; projectId: string; userId: string }) {
  return transaction(async tx => {
    await lock(tx, ctx.tenantId, ctx.projectId)
    const latest = await tx.planilhaVersao.findFirst({ where: { tenantId: ctx.tenantId, projectId: ctx.projectId }, orderBy: { numero: 'desc' }, select: { numero: true } })
    return latest?.numero ?? record(tx, ctx)
  })
}

export async function listarVersoesPlanilha(tenantId: string, projectId: string, before?: number) {
  return prisma.planilhaVersao.findMany({ where: { tenantId, projectId, ...(before ? { numero: { lt: before } } : {}) }, orderBy: { numero: 'desc' }, take: 50, select: { numero: true, autorNome: true, createdAt: true, restauradaDe: true } })
}

/** Restaura referências existentes; não recria uploads ou registros de autoria. */
export async function restaurarVersaoPlanilha(ctx: { tenantId: string; projectId: string; userId: string }, numero: number, expectedLatest: number) {
  return transaction(async tx => {
    const { tenantId, projectId } = ctx
    await lock(tx, tenantId, projectId)
    const latest = await tx.planilhaVersao.findFirst({ where: { tenantId, projectId }, orderBy: { numero: 'desc' }, select: { numero: true } })
    if (latest?.numero !== expectedLatest) throw new Error('O histórico mudou. Atualize a lista antes de restaurar.')
    const version = await tx.planilhaVersao.findFirst({ where: { tenantId, projectId, numero } })
    if (!version) throw new Error('Versão não encontrada.')
    const target = version.conteudo as unknown as Snapshot
    const current = await snapshot(tx, tenantId, projectId)
    // Uma edição feita em outra tela após o último snapshot não pode desaparecer sem histórico.
    await record(tx, ctx)
    const affectedCards = [...new Set([...current.cards, ...target.cards].map(c => c.id))]
    if (await tx.timeEntry.count({ where: { cardId: { in: affectedCards }, isRunning: true, deletedAt: null } })) throw new Error('Pare os cronômetros das atividades antes de restaurar uma versão.')
    const now = new Date()
    const date = (value: Date | null) => value ? new Date(value) : null
    await tx.card.updateMany({ where: { id: { in: current.cards.map(c => c.id).filter(id => !target.cards.some(c => c.id === id)) } }, data: { deletedAt: now } })
    await tx.sprint.updateMany({ where: { id: { in: current.sprints.map(s => s.id).filter(id => !target.sprints.some(s => s.id === id)) }, projectId }, data: { deletedAt: now } })
    for (const sprint of target.sprints) await tx.sprint.update({ where: { id: sprint.id, projectId }, data: { name: sprint.name, startDate: date(sprint.startDate), endDate: date(sprint.endDate), deletedAt: null } })
    const legacyAvailable = await temAnexosLegados(tx)
    for (const card of target.cards) {
      const owned = await tx.card.findFirst({ where: { id: card.id, OR: [{ projectId }, { sprint: { projectId } }] }, select: { id: true } })
      if (!owned) throw new Error('Uma atividade desta versão não está mais disponível neste projeto.')
      await tx.card.update({ where: { id: card.id }, data: { title: card.title, description: card.description, priority: card.priority, startDate: date(card.startDate), endDate: date(card.endDate), sprintId: card.sprintId, sprintColumnId: card.sprintColumnId, sprintPosition: card.sprintPosition, deletedAt: null } })
      await tx.cardResponsible.deleteMany({ where: { cardId: card.id } })
      if (card.responsibles.length) await tx.cardResponsible.createMany({ data: card.responsibles.map(r => ({ cardId: card.id, userId: r.userId })) })
      if (legacyAvailable) {
        await tx.attachment.updateMany({ where: { cardId: card.id }, data: { deletedAt: now } })
        for (const attachment of card.attachments) await tx.attachment.update({ where: { id: attachment.id, cardId: card.id }, data: { fileName: attachment.fileName, isCover: attachment.isCover, deletedAt: null } })
      }
      await tx.comment.updateMany({ where: { cardId: card.id }, data: { deletedAt: now } })
      for (const comment of card.comments) await tx.comment.update({ where: { id: comment.id, cardId: card.id }, data: { content: comment.content, deletedAt: null } })
      await tx.timeEntry.updateMany({ where: { cardId: card.id, isRunning: false }, data: { deletedAt: now } })
      for (const entry of card.timeEntries) await tx.timeEntry.update({ where: { id: entry.id, cardId: card.id }, data: { duration: entry.duration, description: entry.description, startedAt: new Date(entry.startedAt), endedAt: date(entry.endedAt), deletedAt: null } })
    }
    // Uploads atuais pertencem ao file-service, no schema files. A tabela public é legada.
    if (target.fileAttachments && affectedCards.length) {
      await tx.$executeRaw`UPDATE files."Attachment" SET "deletedAt" = ${now}, "updatedAt" = ${now} WHERE "cardId" IN (${Prisma.join(affectedCards)})`
      for (const file of target.fileAttachments) {
        if (!target.cards.some(card => card.id === file.cardId)) throw new Error('Anexo fora das atividades desta versão.')
        const count = await tx.$executeRaw`UPDATE files."Attachment" SET "fileName" = ${file.fileName}, "isCover" = ${file.isCover}, "deletedAt" = NULL, "updatedAt" = ${now} WHERE "id" = ${file.id} AND "cardId" = ${file.cardId}`
        if (!count) throw new Error('Um anexo desta versão não está mais disponível.')
      }
    }
    const root = await tx.wbsNode.findFirst({ where: { tenantId, projectId, parentId: null }, select: { version: true } })
    await tx.wbsNode.deleteMany({ where: { tenantId, projectId } })
    await tx.wbsNode.createMany({ data: target.nodes.map(n => ({ ...n, tenantId, projectId, style: json(n.style), properties: json(n.properties), version: n.parentId === null ? (root?.version ?? 0) + 1 : 0 })) })
    const result = await record(tx, ctx, numero)
    await tx.auditLog.create({ data: { tenantId, userId: ctx.userId, action: 'UPDATE', entity: 'PlanilhaVersao', entityId: projectId, details: { restauradaDe: numero, novaVersao: result } } })
    return result
  })
}

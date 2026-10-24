import { validarCamposCustos } from '@/lib/permissoesCustos'
import type { Permissao } from '@/lib/permissoes'
import prisma from '@/lib/prisma'
import type { Prisma } from '@/lib/generated/prisma'
import { registrarAcao } from './auditoriaService'
import { MOTIVO_MINIMO, registrarHistoricoSprint, resumoDaSprint, sprintTemDados } from './sprintHistoricoService'
import { recalcCodes } from '@/lib/wbsCode'
import type { WbsNodeClient, WbsNodeStyle, WbsNodeProperties, WbsLayoutOrientation } from '@/types/wbs'
import { WBS_LIMITS } from '@/lib/validation/wbsSchemas'
import { colunaExigeResponsavel, mensagemUltimoResponsavel } from '@/lib/responsavelObrigatorio'
import { elaboradoresDe, propsDosElaboradores, reconciliarElaboradores, diferencaParaCard, type PropsElaboradores } from '@/lib/elaboradores'
import type {
  InsertChildInput,
  InsertSiblingInput,
  DeleteNodeInput,
  MoveNodeInput,
  RenameNodeInput,
  UpdateNodeStyleInput,
  UpdateNodePropertiesInput,
  SetLayoutInput,
  SetCollapsedInput,
  SaveTreeInput,
} from '@/lib/validation/wbsSchemas'

// ── Error types ──────────────────────────────────────────────────────────────

export class WbsConflictError extends Error {
  constructor() { super('A EAP foi modificada por outro usuário'); this.name = 'WbsConflictError' }
}

export class WbsNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = 'WbsNotFoundError' }
}

export class WbsValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'WbsValidationError' }
}

// ── Public result types ──────────────────────────────────────────────────────

export interface GetTreeResult {
  nodes: Record<string, WbsNodeClient>
  rootId: string | null
  serverVersion: number
}

export interface MutationResult {
  serverVersion: number
}

export interface InsertResult extends MutationResult {
  nodeId: string
}

export type SaveResult =
  | ({ ok: true } & MutationResult)
  | { ok: false; reason: 'CONFLICT' }

// ── Internal ─────────────────────────────────────────────────────────────────

const DEFAULT_STYLE: WbsNodeStyle = {
  backgroundColor: '#ffffff',
  borderColor: '#d1d5db',
  textColor: '#111827',
  borderWidth: 1,
  fontSize: 14,
  borderRadius: 6,
}

type Tx = Prisma.TransactionClient

const toJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue

type DbRow = {
  id: string
  parentId: string | null
  order: number
  code: string
  title: string
  layout: string
  collapsed: boolean
  style: unknown
  properties: unknown
  version: number
}

function buildClientMap(rows: DbRow[]): Record<string, WbsNodeClient> {
  const nodes: Record<string, WbsNodeClient> = {}
  for (const row of rows) {
    nodes[row.id] = {
      id: row.id,
      parentId: row.parentId,
      order: row.order,
      code: row.code,
      title: row.title,
      layout: row.layout as WbsLayoutOrientation,
      collapsed: row.collapsed,
      style: row.style as WbsNodeStyle,
      properties: row.properties as WbsNodeProperties,
      childrenIds: [],
    }
  }
  // rows are ORDER BY order ASC from DB — children push in correct order
  for (const row of rows) {
    if (row.parentId && nodes[row.parentId]) {
      nodes[row.parentId].childrenIds.push(row.id)
    }
  }
  return nodes
}

/**
 * Recalculates WBS codes for all project nodes in memory, then batch-updates
 * only the nodes whose code changed.
 */
async function syncCodes(tx: Tx, projectId: string, tenantId: string): Promise<void> {
  const rows = await tx.wbsNode.findMany({
    where: { projectId, tenantId },
    orderBy: { order: 'asc' },
  })
  const nodes = buildClientMap(rows)
  const recalculated = recalcCodes(nodes)
  for (const row of rows) {
    const newCode = recalculated[row.id]?.code
    if (newCode !== undefined && newCode !== row.code) {
      await tx.wbsNode.update({ where: { id: row.id }, data: { code: newCode } })
    }
  }
}

/** Increments the root node's version field and returns the new value. */
async function bumpVersion(tx: Tx, projectId: string, tenantId: string): Promise<number> {
  const root = await tx.wbsNode.findFirst({
    where: { projectId, tenantId, parentId: null },
    select: { id: true, version: true },
  })
  if (!root) return 0
  const updated = await tx.wbsNode.update({
    where: { id: root.id },
    data: { version: root.version + 1 },
    select: { version: true },
  })
  return updated.version
}

/**
 * Shifts siblings at >= startOrder up by 1 to make room for an insert.
 * Processes DESC to avoid (parentId, order) unique-constraint violations.
 */
async function shiftSiblingsUp(
  tx: Tx,
  parentId: string,
  projectId: string,
  tenantId: string,
  startOrder: number,
): Promise<void> {
  const toShift = await tx.wbsNode.findMany({
    where: { parentId, projectId, tenantId, order: { gte: startOrder } },
    orderBy: { order: 'desc' },
    select: { id: true, order: true },
  })
  for (const n of toShift) {
    await tx.wbsNode.update({ where: { id: n.id }, data: { order: n.order + 1 } })
  }
}

/**
 * Recompacts children to 0, 1, 2, … after a deletion or move.
 * Processes ASC to avoid violations when decrementing.
 */
async function recompactChildren(
  tx: Tx,
  parentId: string | null,
  projectId: string,
  tenantId: string,
): Promise<void> {
  const children = await tx.wbsNode.findMany({
    where: { parentId, projectId, tenantId },
    orderBy: { order: 'asc' },
    select: { id: true, order: true },
  })
  for (let i = 0; i < children.length; i++) {
    if (children[i].order !== i) {
      await tx.wbsNode.update({ where: { id: children[i].id }, data: { order: i } })
    }
  }
}

/** Walks parent chain to compute depth of nodeId (root = 1). Max 20 iterations. */
async function calcDepth(tx: Tx, nodeId: string): Promise<number> {
  let depth = 1
  let currentId: string | null = nodeId
  const seen = new Set<string>()
  while (currentId) {
    if (seen.has(currentId)) break
    seen.add(currentId)
    const row: { parentId: string | null } | null = await tx.wbsNode.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    })
    if (!row?.parentId) break
    currentId = row.parentId
    depth++
  }
  return depth
}

/** BFS to collect all descendant IDs of nodeId (inclusive). */
async function collectSubtreeIds(tx: Tx, nodeId: string): Promise<string[]> {
  const ids: string[] = []
  const queue = [nodeId]
  while (queue.length > 0) {
    const id = queue.shift()!
    ids.push(id)
    const children = await tx.wbsNode.findMany({
      where: { parentId: id },
      select: { id: true },
    })
    queue.push(...children.map(c => c.id))
  }
  return ids
}

// ── Public service functions ─────────────────────────────────────────────────

/**
 * Returns the full WBS tree for a project. Single DB query, O(n) in-memory assembly.
 */
export async function getTree(projectId: string, tenantId: string): Promise<GetTreeResult> {
  const rows = await prisma.wbsNode.findMany({
    where: { projectId, tenantId },
    orderBy: { order: 'asc' },
  })
  const nodes = buildClientMap(rows)
  const root = rows.find(r => r.parentId === null) ?? null
  return { nodes, rootId: root?.id ?? null, serverVersion: root?.version ?? 0 }
}

/**
 * Inserts a new child node under parentId. Recalculates all codes.
 */
export async function insertChild(
  input: InsertChildInput,
  userId?: string,
): Promise<InsertResult> {
  return prisma.$transaction(async tx => {
    const { parentId, projectId, tenantId } = input

    const [count, parent] = await Promise.all([
      tx.wbsNode.count({ where: { projectId, tenantId } }),
      tx.wbsNode.findFirst({ where: { id: parentId, projectId, tenantId } }),
    ])
    if (!parent) throw new WbsNotFoundError('Nó pai não encontrado')
    if (count >= WBS_LIMITS.MAX_NODES) {
      throw new WbsValidationError(`Máximo de ${WBS_LIMITS.MAX_NODES} nós por projeto`)
    }
    const depth = await calcDepth(tx, parentId)
    if (depth >= WBS_LIMITS.MAX_DEPTH) {
      throw new WbsValidationError(`Profundidade máxima de ${WBS_LIMITS.MAX_DEPTH} atingida`)
    }

    const childCount = await tx.wbsNode.count({ where: { parentId, projectId, tenantId } })
    const newNode = await tx.wbsNode.create({
      data: {
        tenantId, projectId, parentId,
        order: childCount,
        code: '',
        title: 'Novo elemento',
        layout: 'LADO_A_LADO',
        collapsed: false,
        style: toJson(DEFAULT_STYLE),
        properties: toJson({}),
      },
    })

    await syncCodes(tx, projectId, tenantId)
    const serverVersion = await bumpVersion(tx, projectId, tenantId)

    if (userId) {
      await registrarAcao({
        tenantId, userId, action: 'CREATE', entity: 'WbsNode',
        entityId: newNode.id, details: { parentId },
      })
    }
    return { nodeId: newNode.id, serverVersion }
  })
}

/**
 * Inserts a sibling immediately after siblingId. Root cannot have siblings.
 */
export async function insertSibling(
  input: InsertSiblingInput,
  userId?: string,
): Promise<InsertResult> {
  return prisma.$transaction(async tx => {
    const { siblingId, projectId, tenantId } = input

    const [count, sibling] = await Promise.all([
      tx.wbsNode.count({ where: { projectId, tenantId } }),
      tx.wbsNode.findFirst({ where: { id: siblingId, projectId, tenantId } }),
    ])
    if (!sibling) throw new WbsNotFoundError('Nó irmão não encontrado')
    if (!sibling.parentId) throw new WbsValidationError('A raiz não pode ter irmão')
    if (count >= WBS_LIMITS.MAX_NODES) {
      throw new WbsValidationError(`Máximo de ${WBS_LIMITS.MAX_NODES} nós por projeto`)
    }

    const newOrder = sibling.order + 1
    await shiftSiblingsUp(tx, sibling.parentId, projectId, tenantId, newOrder)

    const newNode = await tx.wbsNode.create({
      data: {
        tenantId, projectId,
        parentId: sibling.parentId,
        order: newOrder,
        code: '',
        title: 'Novo elemento',
        layout: sibling.layout,
        collapsed: false,
        style: toJson(sibling.style),
        properties: toJson({}),
      },
    })

    await syncCodes(tx, projectId, tenantId)
    const serverVersion = await bumpVersion(tx, projectId, tenantId)

    if (userId) {
      await registrarAcao({
        tenantId, userId, action: 'CREATE', entity: 'WbsNode',
        entityId: newNode.id, details: { parentId: sibling.parentId },
      })
    }
    return { nodeId: newNode.id, serverVersion }
  })
}

/**
 * Deletes a node and its entire subtree. Root cannot be deleted here — use resetTree.
 */
/**
 * Excluir na EAP também exclui do outro lado (sincronização EAP ↔ sprint): o card
 * ligado ao nó é excluído e a sprint ligada a uma fase é excluída — os cards que
 * sobrarem nela vão para o fim do backlog, como no sprint-service. Sem isso, a
 * sincronização recriava o nó a partir do card/sprint que continuavam abertos.
 */
async function refletirExclusoesDaEap(
  tx: Tx, projectId: string, removidos: unknown[],
  ctx: { tenantId: string; userId?: string; motivo?: string } = { tenantId: '' },
): Promise<void> {
  const props = removidos.map(p => (p as Record<string, unknown> | null) ?? {})
  const cardIds = props.map(p => p.cardId).filter((v): v is string => typeof v === 'string')
  const sprintIds = props.map(p => p.sprintId).filter((v): v is string => typeof v === 'string')
  const agora = new Date()
  // Sprint com dados só é excluída com motivo; o resumo é tirado antes de excluir os cards.
  const resumos = []
  for (const sid of sprintIds) {
    const resumo = await resumoDaSprint(sid, tx)
    if (resumo && resumo.projectId === projectId) resumos.push(resumo)
  }
  const motivo = ctx.motivo?.trim() ?? ''
  if (resumos.some(sprintTemDados) && motivo.length < MOTIVO_MINIMO) {
    throw new WbsValidationError(`Excluir uma fase com dados exclui a sprint dela: informe o motivo da exclusão (mín. ${MOTIVO_MINIMO} caracteres).`)
  }
  if (cardIds.length) {
    await tx.card.updateMany({
      where: { id: { in: cardIds }, deletedAt: null, OR: [{ projectId }, { sprint: { projectId } }] },
      data: { deletedAt: agora },
    })
  }
  if (!sprintIds.length) return
  const sprints = await tx.sprint.findMany({ where: { id: { in: sprintIds }, projectId, deletedAt: null }, select: { id: true } })
  for (const sp of sprints) {
    const restantes = await tx.card.findMany({
      where: { sprintId: sp.id, deletedAt: null },
      select: { id: true },
      orderBy: [{ sprintPosition: 'asc' }, { createdAt: 'asc' }],
    })
    let posicao = ((await tx.card.aggregate({ where: { projectId, sprintId: null, deletedAt: null }, _max: { position: true } }))._max.position ?? -1) + 1
    for (const c of restantes) {
      await tx.card.update({ where: { id: c.id }, data: { projectId, sprintId: null, sprintColumnId: null, sprintPosition: null, position: posicao++ } })
    }
    await tx.sprint.update({ where: { id: sp.id }, data: { deletedAt: agora } })
    const resumo = resumos.find(r => r.id === sp.id)
    if (resumo && ctx.tenantId) {
      await registrarHistoricoSprint({
        tenantId: ctx.tenantId, userId: ctx.userId, sprintId: sp.id, acao: 'DELETE', projectId, nome: resumo.nome, origem: 'eap',
        motivo: motivo || null, resumo: { cards: resumo.cards, segundosRegistrados: resumo.segundosRegistrados, status: resumo.status },
      }, tx)
    }
  }
}

export async function deleteNode(
  input: DeleteNodeInput,
  userId?: string,
): Promise<MutationResult> {
  return prisma.$transaction(async tx => {
    const { nodeId, projectId, tenantId } = input

    const node = await tx.wbsNode.findFirst({ where: { id: nodeId, projectId, tenantId } })
    if (!node) throw new WbsNotFoundError('Nó não encontrado')
    if (!node.parentId) throw new WbsValidationError('Use resetTree para limpar a EAP inteira')

    const subtreeIds = await collectSubtreeIds(tx, nodeId)
    const removidos = await tx.wbsNode.findMany({ where: { id: { in: subtreeIds }, projectId, tenantId }, select: { properties: true } })
    // delete children-first to satisfy FK order; deleteMany with CASCADE handles it in PG
    await tx.wbsNode.deleteMany({ where: { id: { in: subtreeIds }, projectId, tenantId } })
    await refletirExclusoesDaEap(tx, projectId, removidos.map(n => n.properties), { tenantId, userId, motivo: input.motivoExclusao })
    await recompactChildren(tx, node.parentId, projectId, tenantId)
    await syncCodes(tx, projectId, tenantId)
    const serverVersion = await bumpVersion(tx, projectId, tenantId)

    if (userId) {
      await registrarAcao({
        tenantId, userId, action: 'DELETE', entity: 'WbsNode',
        entityId: nodeId, details: { subtreeSize: subtreeIds.length },
      })
    }
    return { serverVersion }
  })
}

/**
 * Moves a node to a new position with cycle-prevention.
 * INSIDE → becomes last child of target.
 * BEFORE / AFTER → becomes sibling of target at the respective position.
 *
 * Temporarily detaches the node (parentId: null, order: -1) to avoid
 * unique-constraint conflicts during sibling recompaction. This is safe because
 * PostgreSQL treats NULLs as distinct in multi-column unique indexes.
 */
export async function moveNode(
  input: MoveNodeInput,
  userId?: string,
): Promise<MutationResult> {
  return prisma.$transaction(async tx => {
    const { nodeId, targetId, position, projectId, tenantId } = input

    if (nodeId === targetId) throw new WbsValidationError('Nó não pode ser movido para si mesmo')

    const [node, target] = await Promise.all([
      tx.wbsNode.findFirst({ where: { id: nodeId, projectId, tenantId } }),
      tx.wbsNode.findFirst({ where: { id: targetId, projectId, tenantId } }),
    ])
    if (!node) throw new WbsNotFoundError('Nó a mover não encontrado')
    if (!target) throw new WbsNotFoundError('Nó destino não encontrado')
    if (!node.parentId) throw new WbsValidationError('A raiz não pode ser movida')

    // Cycle prevention
    const subtreeIds = await collectSubtreeIds(tx, nodeId)
    if (subtreeIds.includes(targetId)) {
      throw new WbsValidationError('Movimento criaria ciclo na hierarquia')
    }

    // Depth check for INSIDE moves
    if (position === 'INSIDE') {
      const targetDepth = await calcDepth(tx, targetId)
      if (targetDepth + 1 > WBS_LIMITS.MAX_DEPTH) {
        throw new WbsValidationError(`Movimento excederia profundidade máxima de ${WBS_LIMITS.MAX_DEPTH}`)
      }
    }

    const oldParentId = node.parentId

    // Detach temporarily — safe because (null, -1) is always distinct in PG unique index
    await tx.wbsNode.update({ where: { id: nodeId }, data: { parentId: null, order: -1 } })
    await recompactChildren(tx, oldParentId, projectId, tenantId)

    let newParentId: string
    let newOrder: number

    if (position === 'INSIDE') {
      newParentId = targetId
      newOrder = await tx.wbsNode.count({ where: { parentId: targetId, projectId, tenantId } })
    } else {
      if (!target.parentId) throw new WbsValidationError('Não é possível inserir irmão da raiz')
      newParentId = target.parentId
      // Re-read after possible recompaction of the same parent
      const freshTarget = await tx.wbsNode.findUnique({
        where: { id: targetId },
        select: { order: true },
      })
      const baseOrder = freshTarget?.order ?? target.order
      newOrder = position === 'BEFORE' ? baseOrder : baseOrder + 1
      await shiftSiblingsUp(tx, newParentId, projectId, tenantId, newOrder)
    }

    await tx.wbsNode.update({
      where: { id: nodeId },
      data: { parentId: newParentId, order: newOrder },
    })

    await syncCodes(tx, projectId, tenantId)
    const serverVersion = await bumpVersion(tx, projectId, tenantId)

    if (userId) {
      await registrarAcao({
        tenantId, userId, action: 'UPDATE', entity: 'WbsNode',
        entityId: nodeId, details: { action: 'MOVE', targetId, position },
      })
    }
    return { serverVersion }
  })
}

/** Renames a node title. */
export async function renameNode(input: RenameNodeInput): Promise<MutationResult> {
  return prisma.$transaction(async tx => {
    const { nodeId, title, projectId, tenantId } = input
    const node = await tx.wbsNode.findFirst({ where: { id: nodeId, projectId, tenantId } })
    if (!node) throw new WbsNotFoundError('Nó não encontrado')
    await tx.wbsNode.update({ where: { id: nodeId }, data: { title } })
    const serverVersion = await bumpVersion(tx, projectId, tenantId)
    return { serverVersion }
  })
}

/** Merges a partial style update into the node's existing style. */
export async function updateNodeStyle(input: UpdateNodeStyleInput): Promise<MutationResult> {
  return prisma.$transaction(async tx => {
    const { nodeId, style, projectId, tenantId } = input
    const node = await tx.wbsNode.findFirst({ where: { id: nodeId, projectId, tenantId } })
    if (!node) throw new WbsNotFoundError('Nó não encontrado')
    await tx.wbsNode.update({
      where: { id: nodeId },
      data: { style: toJson({ ...(node.style as object), ...style }) },
    })
    const serverVersion = await bumpVersion(tx, projectId, tenantId)
    return { serverVersion }
  })
}

/** Merges properties (cost, durationDays, owner, description) into the node. */
export async function updateNodeProperties(input: UpdateNodePropertiesInput, acesso: { userId: string; permissoes: ReadonlySet<Permissao> }): Promise<MutationResult & { responsaveisAdicionados: string[]; cardId: string | null }> {
  return prisma.$transaction(async tx => {
    const { nodeId, projectId, tenantId } = input
    // O vínculo com card/sprint é do servidor (sincronização, salvar árvore validado):
    // editar propriedades não o troca, senão um cardId forjado guiaria escritas em
    // responsáveis de card de outro projeto.
    const { cardId: _cardIdIgnorado, sprintId: _sprintIdIgnorado, ...propriedadesEditaveis } = input.properties
    let properties: Record<string, unknown> = { ...propriedadesEditaveis }
    // Serializa alterações da mesma linha, inclusive troca do elaborador.
    await tx.$queryRaw`SELECT id FROM "WbsNode" WHERE id = ${nodeId} AND "projectId" = ${projectId} AND "tenantId" = ${tenantId} FOR UPDATE`
    const node = await tx.wbsNode.findFirst({ where: { id: nodeId, projectId, tenantId } })
    if (!node) throw new WbsNotFoundError('Nó não encontrado')
    validarCamposCustos(acesso.permissoes, acesso.userId, (node.properties as Record<string, unknown>) ?? {}, properties)

    // Elaborado por = responsáveis do card (ADR-044): a lista escolhida na planilha
    // vira os responsáveis do card ligado, na mesma transação.
    let responsaveisAdicionados: string[] = []
    const cardId = texto((node.properties as Record<string, unknown> | null)?.cardId) ?? null
    if (Array.isArray(properties.elaboradoPorUserIds)) {
      const escolhidos = [...new Set(properties.elaboradoPorUserIds as string[])]
      const membros = escolhidos.length
        ? await tx.userProject.findMany({ where: { projectId, active: true, userId: { in: escolhidos }, user: { tenantId, deletedAt: null } }, select: { userId: true, user: { select: { name: true } } } })
        : []
      if (membros.length !== escolhidos.length) throw new WbsValidationError('Elaborado por aceita só membros ativos do projeto.')
      const nomes = new Map(membros.map(m => [m.userId, m.user.name]))
      // Nomes e o id antigo saem do cadastro, nunca do que o cliente mandou.
      properties = { ...properties, ...propsDosElaboradores(escolhidos, nomes), elaboradoSincronizado: true }
      if (cardId) {
        if (escolhidos.length === 0) {
          // Elaborado por = responsáveis: o card em "Em andamento" ou depois não fica sem ninguém.
          const card = await tx.card.findUnique({ where: { id: cardId }, select: { sprintId: true, sprintColumnId: true } })
          if (card?.sprintId && card.sprintColumnId) {
            const colunas = await tx.sprintColumn.findMany({ where: { sprintId: card.sprintId, deletedAt: null }, select: { id: true, title: true, position: true } })
            if (colunaExigeResponsavel(colunas, card.sprintColumnId)) {
              throw new WbsValidationError(mensagemUltimoResponsavel(colunas.find(c => c.id === card.sprintColumnId)!.title))
            }
          }
        }
        const atuais = (await tx.cardResponsible.findMany({ where: { cardId }, select: { userId: true } })).map(r => r.userId)
        const { adicionarNoCard, removerDoCard } = diferencaParaCard(escolhidos, atuais)
        if (removerDoCard.length) await tx.cardResponsible.deleteMany({ where: { cardId, userId: { in: removerDoCard } } })
        if (adicionarNoCard.length) await tx.cardResponsible.createMany({ data: adicionarNoCard.map(userId => ({ cardId, userId })), skipDuplicates: true })
        responsaveisAdicionados = adicionarNoCard
      }
    }

    await tx.wbsNode.update({
      where: { id: nodeId },
      data: { properties: toJson({ ...(node.properties as object), ...properties }) },
    })
    const serverVersion = await bumpVersion(tx, projectId, tenantId)
    await tx.auditLog.create({ data: {
      tenantId, userId: acesso.userId, action: 'PLANILHA_EDITAR', entity: 'WbsNode', entityId: nodeId,
      details: { projetoId: projectId, campos: Object.keys(input.properties) },
    } })
    return { serverVersion, responsaveisAdicionados, cardId }
  })
}

/**
 * Responsáveis do card mudaram (modal do card): o nó ligado passa a ter a mesma
 * lista em "Elaborado por" na hora, sem esperar a próxima sincronização.
 * Devolve false quando o card não está ligado a nenhum nó da EAP.
 */
export async function refletirResponsaveisNoNo(cardId: string): Promise<boolean> {
  return prisma.$transaction(async tx => {
    const card = await tx.card.findUnique({ where: { id: cardId }, select: { projectId: true, sprint: { select: { projectId: true } } } })
    const projetoDoCard = card?.sprint?.projectId ?? card?.projectId
    if (!projetoDoCard) return false
    // Só o nó do projeto do card: um nó de outro projeto apontando para este card não recebe os nomes.
    const node = await tx.wbsNode.findFirst({ where: { projectId: projetoDoCard, properties: { path: ['cardId'], equals: cardId } }, select: { id: true, projectId: true, tenantId: true, properties: true } })
    if (!node) return false
    const responsaveis = await tx.cardResponsible.findMany({ where: { cardId }, select: { userId: true, user: { select: { name: true } } } })
    const ids = responsaveis.map(r => r.userId)
    const props = (node.properties as Record<string, unknown>) ?? {}
    const novos = { ...propsDosElaboradores(ids, new Map(responsaveis.map(r => [r.userId, r.user.name]))), elaboradoSincronizado: true }
    if (JSON.stringify(elaboradoresDe(props as PropsElaboradores)) === JSON.stringify(ids) && props.elaboradoSincronizado === true && props.elaboradoPor === novos.elaboradoPor) return true
    await tx.wbsNode.update({ where: { id: node.id }, data: { properties: toJson({ ...props, ...novos }) } })
    await bumpVersion(tx, node.projectId, node.tenantId)
    return true
  })
}

/** Changes the layout orientation of a node. */
export async function setLayout(input: SetLayoutInput): Promise<MutationResult> {
  return prisma.$transaction(async tx => {
    const { nodeId, layout, projectId, tenantId } = input
    const node = await tx.wbsNode.findFirst({ where: { id: nodeId, projectId, tenantId } })
    if (!node) throw new WbsNotFoundError('Nó não encontrado')
    await tx.wbsNode.update({ where: { id: nodeId }, data: { layout } })
    const serverVersion = await bumpVersion(tx, projectId, tenantId)
    return { serverVersion }
  })
}

/** Collapses or expands a node in the tree view. */
export async function setCollapsed(input: SetCollapsedInput): Promise<MutationResult> {
  return prisma.$transaction(async tx => {
    const { nodeId, collapsed, projectId, tenantId } = input
    const node = await tx.wbsNode.findFirst({ where: { id: nodeId, projectId, tenantId } })
    if (!node) throw new WbsNotFoundError('Nó não encontrado')
    await tx.wbsNode.update({ where: { id: nodeId }, data: { collapsed } })
    const serverVersion = await bumpVersion(tx, projectId, tenantId)
    return { serverVersion }
  })
}

/**
 * Full-tree atomic replace (autosave).
 *
 * Checks serverVersion for optimistic concurrency — returns CONFLICT if another
 * session has written since the client loaded the tree.
 * Server always recalculates codes (client-supplied codes are ignored).
 */
export async function saveTree(
  input: SaveTreeInput,
  userId?: string,
  /** Edição do usuário no editor: nós que sumiram excluem card/sprint ligados (não usar em importação). */
  opts: { refletirExclusoes?: boolean; motivoExclusao?: string; preservar?: string[] } = {},
): Promise<SaveResult> {
  return prisma.$transaction(async tx => {
    const { projectId, tenantId, serverVersion, nodes, rootId } = input

    // Optimistic concurrency check via the project's ACTUAL root node's version.
    // Important: for imports, `rootId` is the root id of the IMPORTED file, which
    // may not exist in this project's DB (different project / older export). Looking
    // it up by id would yield null → version 0 → false CONFLICT on every cross-project
    // import. The version is only tracked on the real root (parentId = null), so we
    // always resolve it there.
    const currentRoot = await tx.wbsNode.findFirst({
      where: { projectId, tenantId, parentId: null },
      select: { version: true },
    })
    const currentVersion = currentRoot?.version ?? 0
    if (currentVersion !== serverVersion) {
      return { ok: false, reason: 'CONFLICT' as const }
    }

    const recalculated = rootId ? recalcCodes(nodes) : nodes
    const nodeValues = Object.values(recalculated)
    const newVersion = serverVersion + 1

    // Vínculos com card/sprint chegam do cliente ao salvar a árvore (recortar e colar
    // mantém o nó ligado). Só valem cards e sprints deste projeto; um id de outro
    // projeto/instituição é descartado antes de gravar.
    const idsCard = [...new Set(nodeValues.map(n => n.properties?.cardId).filter((v): v is string => typeof v === 'string'))]
    const idsSprint = [...new Set(nodeValues.map(n => n.properties?.sprintId).filter((v): v is string => typeof v === 'string'))]
    const [cardsDoProjeto, sprintsDoProjeto] = await Promise.all([
      idsCard.length ? tx.card.findMany({ where: { id: { in: idsCard }, OR: [{ projectId }, { sprint: { projectId } }] }, select: { id: true } }) : [],
      idsSprint.length ? tx.sprint.findMany({ where: { id: { in: idsSprint }, projectId }, select: { id: true } }) : [],
    ])
    const cardValido = new Set(cardsDoProjeto.map(c => c.id))
    const sprintValida = new Set(sprintsDoProjeto.map(sp => sp.id))
    for (const n of nodeValues) {
      const props = n.properties
      if (!props) continue
      const cardForaDoProjeto = typeof props.cardId === 'string' && !cardValido.has(props.cardId)
      const sprintForaDoProjeto = typeof props.sprintId === 'string' && !sprintValida.has(props.sprintId)
      if (cardForaDoProjeto || sprintForaDoProjeto) {
        const { cardId, sprintId, ...resto } = props
        n.properties = { ...resto, ...(cardForaDoProjeto ? {} : { cardId }), ...(sprintForaDoProjeto ? {} : { sprintId }) }
      }
    }

    if (opts.refletirExclusoes) {
      const mantidos = new Set(nodeValues.map(n => n.id))
      const anteriores = await tx.wbsNode.findMany({ where: { projectId, tenantId }, select: { id: true, properties: true } })
      // Card/sprint ainda ligados a algum nó salvo (ex.: recortar e colar recria o nó com id novo) não são excluídos.
      const aindaLigados = new Set([
        ...nodeValues.flatMap(n => [n.properties?.cardId, n.properties?.sprintId]).filter((v): v is string => typeof v === 'string'),
        ...(opts.preservar ?? []),
      ])
      const removidos = anteriores.filter(n => !mantidos.has(n.id)).map(n => {
        const { cardId, sprintId, ...resto } = (n.properties as Record<string, unknown> | null) ?? {}
        return {
          ...resto,
          ...(typeof cardId === 'string' && !aindaLigados.has(cardId) ? { cardId } : {}),
          ...(typeof sprintId === 'string' && !aindaLigados.has(sprintId) ? { sprintId } : {}),
        }
      })
      if (removidos.length) await refletirExclusoesDaEap(tx, projectId, removidos, { tenantId, userId, motivo: opts.motivoExclusao })
    }

    await tx.wbsNode.deleteMany({ where: { projectId, tenantId } })
    if (nodeValues.length > 0) {
      await tx.wbsNode.createMany({
        data: nodeValues.map(n => ({
          id: n.id,
          tenantId,
          projectId,
          parentId: n.parentId,
          order: n.order,
          code: n.code,
          title: n.title,
          layout: n.layout,
          collapsed: n.collapsed,
          style: toJson(n.style),
          properties: toJson(n.properties),
          // Version is only tracked on root; rest default to 0
          version: n.parentId === null ? newVersion : 0,
        })),
      })
    }

    if (userId) {
      await registrarAcao({
        tenantId, userId, action: 'UPDATE', entity: 'WbsNode',
        entityId: projectId, details: { action: 'SAVE_TREE', nodeCount: nodeValues.length },
      })
    }
    return { ok: true, serverVersion: newVersion }
  })
}

/**
 * Deletes all nodes for the project and creates a single root node.
 * Audited. Used for "novo projeto" and "redefinir EAP" flows.
 */
export async function resetTree(
  input: { projectId: string; tenantId: string; rootTitle?: string },
  userId: string,
): Promise<InsertResult> {
  return prisma.$transaction(async tx => {
    const { projectId, tenantId, rootTitle = 'Projeto' } = input

    await tx.wbsNode.deleteMany({ where: { projectId, tenantId } })
    const root = await tx.wbsNode.create({
      data: {
        tenantId, projectId,
        parentId: null,
        order: 0,
        code: '1',
        title: rootTitle,
        layout: 'LADO_A_LADO',
        collapsed: false,
        style: toJson(DEFAULT_STYLE),
        properties: toJson({}),
        version: 1,
      },
    })

    await registrarAcao({
      tenantId, userId, action: 'DELETE', entity: 'WbsNode',
      entityId: projectId, details: { action: 'RESET_TREE', rootTitle },
    })
    return { nodeId: root.id, serverVersion: 1 }
  })
}

/**
 * Sincroniza as macrofases do form (Cronograma e Custos) com os nós top-level da árvore WBS/EAP.
 * - Garante a raiz da árvore (cria se não existir).
 * - Para cada macrofase do form: procura nó top-level com título igual (case-insensitive).
 *   - Se existe: atualiza título (se mudou) e properties (dataLimite, custo).
 *   - Se não existe: cria nó filho da raiz com título = fase e properties = { dataLimite, custo }.
 * - NÃO apaga nós existentes (preserva EAP construída, atividades e elaboradores).
 * - Retorna mapa { fase (título normalizado) -> nodeId } para uso posterior.
 */
export async function syncMacrofasesComEap(
  projectId: string, tenantId: string,
  macrofases: Array<{ fase: string; dataLimite?: string; custo?: string }>, userId?: string,
): Promise<Map<string, string>> {
  return prisma.$transaction(tx => syncMacrofasesComEapInTransaction(tx, projectId, tenantId, macrofases, userId), { isolationLevel: 'Serializable' })
}

/** The reconciliation marker and all EAP writes must use the same transaction. */
export async function syncMacrofasesComEapInTransaction(
  tx: Tx, projectId: string, tenantId: string,
  macrofases: Array<{ fase: string; dataLimite?: string; custo?: string }>, userId?: string,
): Promise<Map<string, string>> {
  const project = await tx.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { name: true } })
  if (!project) throw new WbsNotFoundError('Projeto não encontrado')
  const norm = (title: string) => title.trim().toLowerCase()
  const phases = macrofases.filter(f => f.fase.trim())
  if (phases.some(f => f.fase.trim().length > 500) || new Set(phases.map(f => norm(f.fase))).size !== phases.length) throw new WbsValidationError('Lote de macrofases inválido')
  let root = await tx.wbsNode.findFirst({ where: { projectId, tenantId, parentId: null }, select: { id: true } })
  const result = new Map<string, string>()
  if (!root && phases.length === 0) return result
  let changed = false
  if (!root) {
    root = await tx.wbsNode.create({ data: { projectId, tenantId, parentId: null, order: 0, code: '1', title: project.name.slice(0, 500), style: toJson(DEFAULT_STYLE), properties: {}, layout: 'LADO_A_LADO' }, select: { id: true } })
    changed = true
  }
  const existing = await tx.wbsNode.findMany({ where: { projectId, tenantId, parentId: root.id }, orderBy: { order: 'asc' } })
  const byName = new Map(existing.map(node => [norm(node.title), node]))
  if (byName.size !== existing.length) throw new WbsValidationError('A EAP tem macrofases com nomes repetidos; revise antes de sincronizar')
  let nextOrder = existing.reduce((max, node) => Math.max(max, node.order + 1), 0)
  const newCount = phases.filter(f => !byName.has(norm(f.fase))).length
  if (await tx.wbsNode.count({ where: { projectId, tenantId } }) + newCount > WBS_LIMITS.MAX_NODES) throw new WbsValidationError('Limite de nós da EAP excedido')
  for (const phase of phases) {
    const title = phase.fase.trim()
    const key = norm(title)
    const node = byName.get(key)
    const properties = { ...((node?.properties as Record<string, unknown>) ?? {}) }
    if (phase.dataLimite !== undefined) { if (phase.dataLimite) properties.dataLimite = phase.dataLimite; else delete properties.dataLimite }
    if (phase.custo !== undefined) {
      if (phase.custo) {
        const value = Number(phase.custo.includes(',') ? phase.custo.replace(/\./g, '').replace(',', '.') : phase.custo)
        if (!Number.isFinite(value) || value < 0) throw new WbsValidationError('Custo inválido')
        properties.custo = value
      } else delete properties.custo
    }
    if (node) {
      if (node.title !== title || JSON.stringify(node.properties) !== JSON.stringify(properties)) {
        await tx.wbsNode.update({ where: { id: node.id }, data: { title, properties: toJson(properties) } })
        changed = true
      }
      result.set(key, node.id)
    } else {
      const created = await tx.wbsNode.create({ data: { projectId, tenantId, parentId: root.id, order: nextOrder++, code: '', title, style: toJson(DEFAULT_STYLE), properties: toJson(properties), layout: 'LADO_A_LADO' } })
      if (userId) await registrarAcao({ tenantId, userId, action: 'CREATE', entity: 'WbsNode', entityId: created.id, details: { parentId: root.id, source: 'macroFaseSync' } }, tx)
      result.set(key, created.id)
      changed = true
    }
  }
  if (changed) { await syncCodes(tx, projectId, tenantId); await bumpVersion(tx, projectId, tenantId) }
  return result
}

// ── Sincronização EAP ↔ sprint ───────────────────────────────────────────────

export interface SyncEapSprintResult {
  cardsCriados: number
  nosCriados: number
  nosMovidos: number
  nosRemovidos: number
  sprintsCriadas: number
  cardsMovidos: number
  titulosAtualizados: number
  /** Nós cujo "Elaborado por" foi alinhado aos responsáveis do card. */
  elaboradoresSincronizados: number
}

const normalizarTitulo = (t: string) => t.trim().toLowerCase()
/** Nome da sprint sem o código da EAP na frente ("1.2 Fase 2" → "Fase 2"). */
export const tituloDaSprint = (nome: string) => nome.replace(/^\s*\d+(?:\.\d+)+\s*[-–]?\s*/, '').trim() || nome.trim()
/** Nome da sprint criada/mantida pela EAP: "código título" (ex.: "1.1 Fase 1"). */
export const nomeDaSprint = (code: string, title: string) => (code ? `${code} ${title.trim()}` : title.trim()).slice(0, 255)
/** Colunas padrão da sprint — mesmas do sprint-service (`DEFAULT_SPRINT_COLUMNS`). */
const COLUNAS_PADRAO_SPRINT = ['A Fazer', 'Em andamento', 'Em teste', 'Concluído']
const texto = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/**
 * Mantém a EAP/planilha, as sprints e os cards do projeto em sincronia, nos dois sentidos.
 * Estrutura: raiz (projeto) → nível 2 = sprints (`properties.sprintId`) → nível 3+ = cards
 * (`properties.cardId`). Idempotente.
 *  - sprint sem nó → vincula o nó de nível 2 de mesmo nome ou cria um no nível 2;
 *  - folha do nível 3+ sem card → cria o card em "A Fazer" da sprint do seu nó de nível 2
 *    (se o nível 2 não for sprint: sprint ativa, ou planejada; sem sprint, nenhum card é criado);
 *  - card de sprint sem nó → cria o nó dentro do nó da sprint;
 *  - card que mudou de sprint, ou cujo nó ficou no nível 2 (versão anterior) → o nó vai para a sprint do card;
 *  - nó e card/sprint com o mesmo título e sem vínculo → são vinculados, sem duplicar;
 *  - título diferente em par vinculado → vale o lado alterado por último.
 *  - nó do nível 2 sem sprint → cria a sprint (colunas padrão); o nome da sprint é "código título";
 *  - card no backlog não aparece na EAP/planilha: o nó dele no nível 2 ou dentro de uma sprint é
 *    removido; se a fase acabou de virar sprint, o card vai para "A Fazer" dela.
 * Card excluído não é recriado: o nó mantém o vínculo. Card do backlog sem nó não entra na EAP.
 * Sprint confirmada como excluída perde sua fase; códigos e nomes das restantes são recalculados.
 */
export async function sincronizarEapComSprint(projectId: string, tenantId: string): Promise<SyncEapSprintResult> {
  return prisma.$transaction(async tx => {
    const result: SyncEapSprintResult = { cardsCriados: 0, nosCriados: 0, nosMovidos: 0, nosRemovidos: 0, sprintsCriadas: 0, cardsMovidos: 0, titulosAtualizados: 0, elaboradoresSincronizados: 0 }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'eap-sprint:' + projectId}))`

    const project = await tx.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { id: true } })
    if (!project) return result
    const nodes = await tx.wbsNode.findMany({ where: { projectId, tenantId }, orderBy: { order: 'asc' } })
    const root = nodes.find(n => n.parentId === null)
    if (!root) return result

    const propsDe = new Map(nodes.map(n => [n.id, { ...((n.properties as Record<string, unknown>) ?? {}) }]))
    const paiDe = new Map(nodes.map(n => [n.id, n.parentId]))
    const sprintIdDe = (id: string | undefined) => (id ? texto(propsDe.get(id)?.sprintId) : undefined)
    const cardIdDe = (id: string) => texto(propsDe.get(id)?.cardId)
    const comFilhos = () => new Set([...paiDe.values()].filter((p): p is string => !!p))
    const nivelDe = (id: string) => {
      let nivel = 1
      for (let p = paiDe.get(id); p && nivel <= WBS_LIMITS.MAX_DEPTH + 1; p = paiDe.get(p)) nivel++
      return nivel
    }
    /** Nó de nível 2 (filho da raiz) acima de `id`, ou o próprio. */
    const nivel2De = (id: string): string | undefined => {
      let atual = id
      for (let i = 0; i <= WBS_LIMITS.MAX_DEPTH && paiDe.get(atual); i++) {
        if (paiDe.get(atual) === root.id) return atual
        atual = paiDe.get(atual)!
      }
      return undefined
    }
    const proximaOrdem = new Map<string, number>()
    const ordemEm = async (parentId: string) => {
      let ordem = proximaOrdem.get(parentId)
      if (ordem === undefined) {
        ordem = ((await tx.wbsNode.aggregate({ where: { parentId, projectId, tenantId }, _max: { order: true } }))._max.order ?? -1) + 1
      }
      proximaOrdem.set(parentId, ordem + 1)
      return ordem
    }
    const mudou = new Set<string>()
    let total = nodes.length
    const criarNo = async (parentId: string, title: string, properties: Record<string, unknown>) => {
      const criado = await tx.wbsNode.create({
        data: {
          tenantId, projectId, parentId, order: await ordemEm(parentId), code: '',
          title: (title.trim() || 'Sem título').slice(0, 500), layout: 'LADO_A_LADO', collapsed: false,
          style: toJson(DEFAULT_STYLE), properties: toJson(properties),
        },
        select: { id: true },
      })
      propsDe.set(criado.id, properties)
      paiDe.set(criado.id, parentId)
      total++
      result.nosCriados++
      return criado.id
    }

    // 1) sprints ↔ nós do nível 2
    const sprints = await tx.sprint.findMany({
      where: { projectId, deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, updatedAt: true },
    })
    const sprintViva = new Set(sprints.map(s => s.id))
    const nivel2 = nodes.filter(n => n.parentId === root.id)
    const noDaSprint = new Map<string, string>()
    for (const n of nivel2) {
      const sid = sprintIdDe(n.id)
      if (sid && !noDaSprint.has(sid)) noDaSprint.set(sid, n.id)
    }
    for (const s of sprints) {
      const noId = noDaSprint.get(s.id)
      if (noId) {
        const n = nivel2.find(x => x.id === noId)!
        // Sprint renomeada por último muda o título do nó; o nome da sprint ("código título")
        // é regravado a partir do nó no fim da sincronização.
        if (normalizarTitulo(n.title) === normalizarTitulo(tituloDaSprint(s.name))) continue
        if (s.updatedAt > n.updatedAt && tituloDaSprint(s.name)) {
          await tx.wbsNode.update({ where: { id: n.id }, data: { title: tituloDaSprint(s.name).slice(0, 500) } })
          result.titulosAtualizados++
        }
        continue
      }
      const mesmoNome = nivel2.find(n => !sprintIdDe(n.id) && !cardIdDe(n.id) && normalizarTitulo(n.title) === normalizarTitulo(tituloDaSprint(s.name)))
      if (mesmoNome) {
        propsDe.get(mesmoNome.id)!.sprintId = s.id
        mudou.add(mesmoNome.id)
        noDaSprint.set(s.id, mesmoNome.id)
      } else if (total < WBS_LIMITS.MAX_NODES) {
        noDaSprint.set(s.id, await criarNo(root.id, tituloDaSprint(s.name), { sprintId: s.id }))
      }
    }

    /** Coluna "A Fazer" (ou a primeira) da sprint, com a próxima posição livre. */
    const colunaAFazer = new Map<string, { id: string; posicao: number } | null>()
    const colunaDa = async (sprintId: string) => {
      if (!colunaAFazer.has(sprintId)) {
        const coluna =
          (await tx.sprintColumn.findFirst({ where: { sprintId, deletedAt: null, title: { equals: 'A Fazer', mode: 'insensitive' } }, select: { id: true } })) ??
          (await tx.sprintColumn.findFirst({ where: { sprintId, deletedAt: null }, orderBy: { position: 'asc' }, select: { id: true } }))
        const posicao = coluna
          ? ((await tx.card.aggregate({ where: { sprintColumnId: coluna.id, deletedAt: null }, _max: { sprintPosition: true } }))._max.sprintPosition ?? -1) + 1
          : 0
        colunaAFazer.set(sprintId, coluna ? { id: coluna.id, posicao } : null)
      }
      return colunaAFazer.get(sprintId)
    }
    /** Nós do nível 2 que viraram sprint nesta sincronização. */
    const fasesNovas = new Set<string>()

    // 1b) nó do nível 2 sem sprint (ex.: "1.2 Fase 2") → cria a sprint, com as colunas padrão
    for (const n of nivel2) {
      if (sprintIdDe(n.id) || cardIdDe(n.id) || !n.title.trim()) continue
      const sprint = await tx.sprint.create({ data: { name: nomeDaSprint(n.code, n.title), projectId }, select: { id: true } })
      await tx.sprintColumn.createMany({ data: COLUNAS_PADRAO_SPRINT.map((title, position) => ({ title, position, sprintId: sprint.id })) })
      propsDe.get(n.id)!.sprintId = sprint.id
      mudou.add(n.id)
      noDaSprint.set(sprint.id, n.id)
      sprintViva.add(sprint.id)
      fasesNovas.add(n.id)
      result.sprintsCriadas++
      await registrarHistoricoSprint({ tenantId, sprintId: sprint.id, acao: 'CREATE', projectId, nome: nomeDaSprint(n.code, n.title), origem: 'eap' }, tx)
    }

    // cards do projeto
    const linkedIds = nodes.map(n => cardIdDe(n.id)).filter((v): v is string => !!v)
    const [linkedCards, openCards] = await Promise.all([
      // Só cards do próprio projeto: um vínculo forjado para card de outro projeto/instituição é ignorado.
      tx.card.findMany({ where: { id: { in: linkedIds }, OR: [{ projectId }, { sprint: { projectId } }] }, select: { id: true, title: true, deletedAt: true, updatedAt: true, sprintId: true } }),
      tx.card.findMany({
        where: { deletedAt: null, OR: [{ projectId }, { sprint: { projectId, deletedAt: null } }] },
        select: { id: true, title: true, description: true, updatedAt: true, sprintId: true },
        orderBy: { createdAt: 'asc' },
      }),
    ])
    const cardPorId = new Map(linkedCards.map(c => [c.id, c]))
    const vinculados = new Set(linkedIds)
    const ehFolhaDeCard = (id: string, filhos: Set<string>) => id !== root.id && !filhos.has(id) && nivelDe(id) >= 3 && !sprintIdDe(id)

    // 2) vincula por título folhas do nível 3+ e cards ainda sem vínculo (na mesma sprint, se houver)
    const soltos = openCards.filter(c => !vinculados.has(c.id))
    let filhos = comFilhos()
    for (const n of nodes) {
      if (!ehFolhaDeCard(n.id, filhos) || cardIdDe(n.id)) continue
      const sid = sprintIdDe(nivel2De(n.id))
      const i = soltos.findIndex(c => normalizarTitulo(c.title) === normalizarTitulo(n.title) && (!sid || c.sprintId === sid))
      if (i < 0) continue
      const [card] = soltos.splice(i, 1)
      propsDe.get(n.id)!.cardId = card.id
      vinculados.add(card.id)
      cardPorId.set(card.id, { id: card.id, title: card.title, deletedAt: null, updatedAt: card.updatedAt, sprintId: card.sprintId })
      mudou.add(n.id)
    }

    // 3) títulos: nó e card vinculados convergem para o lado alterado por último
    for (const n of nodes) {
      const cardId = cardIdDe(n.id)
      const card = cardId ? cardPorId.get(cardId) : undefined
      if (!card || card.deletedAt || normalizarTitulo(card.title) === normalizarTitulo(n.title)) continue
      if (card.updatedAt > n.updatedAt) {
        if (card.title.trim()) { await tx.wbsNode.update({ where: { id: n.id }, data: { title: card.title.slice(0, 500) } }); result.titulosAtualizados++ }
      } else {
        await tx.card.update({ where: { id: card.id }, data: { title: n.title } }); result.titulosAtualizados++
      }
    }

    // 4) nó de card fora da sprint do card (ou solto no nível 2) → vai para dentro do nó da sprint
    const paisAntigos = new Set<string>()
    for (const n of nodes) {
      const cardId = cardIdDe(n.id)
      const card = cardId ? cardPorId.get(cardId) : undefined
      if (!card || card.deletedAt || !card.sprintId || filhos.has(n.id) || sprintIdDe(n.id)) continue
      const destino = noDaSprint.get(card.sprintId)
      const pai = paiDe.get(n.id)
      if (!destino || !pai || pai === destino) continue
      const sprintAtual = sprintIdDe(nivel2De(n.id))
      if (pai !== root.id && (!sprintAtual || sprintAtual === card.sprintId)) continue
      await tx.wbsNode.update({ where: { id: n.id }, data: { parentId: destino, order: await ordemEm(destino) } })
      paiDe.set(n.id, destino)
      paisAntigos.add(pai)
      result.nosMovidos++
    }

    // 4b) card no backlog não aparece na EAP nem na planilha: remove o nó dele quando está
    //     solto no nível 2 (versões anteriores) ou dentro de uma sprint (card voltou ao backlog).
    //     Folhas sob nível 2 que não é sprint (estrutura do usuário) são preservadas.
    for (const n of nodes) {
      const cardId = cardIdDe(n.id)
      const card = cardId ? cardPorId.get(cardId) : undefined
      if (!card || card.deletedAt || card.sprintId || filhos.has(n.id) || sprintIdDe(n.id)) continue
      const pai = paiDe.get(n.id)
      const fase = nivel2De(n.id)
      if (!pai || (pai !== root.id && !sprintIdDe(fase))) continue
      // Fase que acabou de virar sprint: o card ficou no backlog só porque não havia
      // sprint — vai para "A Fazer" dela em vez de o nó ser apagado.
      if (pai !== root.id && fase && fasesNovas.has(fase)) {
        const sprintId = sprintIdDe(fase)!
        const coluna = await colunaDa(sprintId)
        if (coluna) {
          await tx.card.update({ where: { id: card.id }, data: { sprintId, sprintColumnId: coluna.id, sprintPosition: coluna.posicao++ } })
          card.sprintId = sprintId
          result.cardsMovidos++
          continue
        }
      }
      await tx.wbsNode.delete({ where: { id: n.id } })
      paiDe.delete(n.id)
      propsDe.delete(n.id)
      mudou.delete(n.id)
      paisAntigos.add(pai)
      result.nosRemovidos++
    }
    for (const pai of paisAntigos) await recompactChildren(tx, pai, projectId, tenantId)

    // 4c) excluir sprint devolve seus cards ao backlog, mas a fase não pode continuar
    // na EAP/planilha. Só remover com exclusão confirmada neste projeto; vínculo
    // desconhecido não é prova de exclusão. Cards que mudaram de sprint já tiveram
    // seus nós movidos no passo 4, preservando as propriedades de custo.
    const fasesAusentes = nivel2.filter(n => {
      const sid = sprintIdDe(n.id)
      return sid && !sprintViva.has(sid)
    })
    if (fasesAusentes.length) {
      const excluidas = await tx.sprint.findMany({
        where: { projectId, deletedAt: { not: null }, id: { in: fasesAusentes.map(n => sprintIdDe(n.id)!) } },
        select: { id: true },
      })
      const idsExcluidos = new Set(excluidas.map(s => s.id))
      for (const fase of fasesAusentes) {
        const sprintExcluidaId = sprintIdDe(fase.id)!
        if (!idsExcluidos.has(sprintExcluidaId)) continue
        const remover = new Set([fase.id])
        for (let depth = 0; depth <= WBS_LIMITS.MAX_DEPTH; depth++) {
          const antes = remover.size
          for (const [id, pai] of paiDe) if (pai && remover.has(pai)) remover.add(id)
          if (remover.size === antes) break
        }
        for (const id of remover) {
          const cardId = cardIdDe(id)
          const card = cardId ? cardPorId.get(cardId) : undefined
          if (card && !card.deletedAt && card.sprintId && sprintViva.has(card.sprintId)) {
            throw new WbsValidationError('Há uma atividade de sprint ativa dentro da fase excluída. Confira o vínculo antes de removê-la.')
          }
        }
        await tx.wbsNode.delete({ where: { id: fase.id } }) // filhos removidos pelo FK em cascata
        for (const id of remover) {
          paiDe.delete(id)
          propsDe.delete(id)
          mudou.delete(id)
        }
        noDaSprint.delete(sprintExcluidaId)
        result.nosRemovidos += remover.size
      }
      if (idsExcluidos.size) await recompactChildren(tx, root.id, projectId, tenantId)
    }

    // 5) folhas do nível 3+ sem card → cards em "A Fazer" da sprint do nível 2
    filhos = comFilhos()
    const semCard = nodes.filter(n => paiDe.has(n.id) && ehFolhaDeCard(n.id, filhos) && !cardIdDe(n.id))
    if (semCard.length) {
      let reserva: { id: string } | null | undefined
      const sprintReserva = async () => {
        if (reserva === undefined) {
          reserva =
            (await tx.sprint.findFirst({ where: { projectId, deletedAt: null, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, select: { id: true } })) ??
            (await tx.sprint.findFirst({ where: { projectId, deletedAt: null, status: 'PLANNED' }, orderBy: { createdAt: 'asc' }, select: { id: true } }))
        }
        return reserva?.id
      }
      for (const n of semCard) {
        const sid = sprintIdDe(nivel2De(n.id))
        const sprintId = sid && sprintViva.has(sid) ? sid : await sprintReserva()
        // Sem sprint não há card: a EAP nunca cria card no backlog.
        const coluna = sprintId ? await colunaDa(sprintId) : null
        if (!sprintId || !coluna) continue
        const descricao = texto(propsDe.get(n.id)!.description) ?? ''
        const card = await tx.card.create({
          data: {
            title: n.title, description: descricao, projectId,
            sprintId, sprintColumnId: coluna.id, sprintPosition: coluna.posicao++,
          },
          select: { id: true },
        })
        propsDe.get(n.id)!.cardId = card.id
        vinculados.add(card.id)
        mudou.add(n.id)
        result.cardsCriados++
      }
    }

    // 5b) Elaborado por = responsáveis do card (ADR-044). Na primeira vez junta os
    //     dois lados; depois o card manda e o nó só espelha.
    // Nós removidos nos passos anteriores (ex.: card que voltou ao backlog) já saíram de propsDe.
    const paresCard = nodes
      .filter(n => propsDe.has(n.id))
      .map(n => ({ id: n.id, cardId: texto(propsDe.get(n.id)!.cardId) }))
      .filter((p): p is { id: string; cardId: string } => !!p.cardId && cardPorId.has(p.cardId) && !cardPorId.get(p.cardId)!.deletedAt)
    if (paresCard.length) {
      const resp = await tx.cardResponsible.findMany({ where: { cardId: { in: paresCard.map(p => p.cardId) } }, select: { cardId: true, userId: true } })
      const doCard = new Map<string, string[]>()
      for (const r of resp) doCard.set(r.cardId, [...(doCard.get(r.cardId) ?? []), r.userId])
      const planos = paresCard.map(p => {
        const props = propsDe.get(p.id)! as PropsElaboradores & Record<string, unknown>
        return { ...p, props, plano: reconciliarElaboradores(elaboradoresDe(props), doCard.get(p.cardId) ?? [], props.elaboradoSincronizado === true) }
      })
      const todosIds = [...new Set(planos.flatMap(p => p.plano.ids))]
      const nomes = new Map((todosIds.length ? await tx.user.findMany({ where: { id: { in: todosIds } }, select: { id: true, name: true } }) : []).map(u => [u.id, u.name]))
      for (const { id, cardId, props, plano } of planos) {
        if (plano.adicionarNoCard.length) {
          await tx.cardResponsible.createMany({ data: plano.adicionarNoCard.map(userId => ({ cardId, userId })), skipDuplicates: true })
        }
        const novos = { ...propsDosElaboradores(plano.ids, nomes), elaboradoSincronizado: true }
        // Nada a fazer: mesma lista e nomes, e já marcado (ou ninguém dos dois lados).
        const mesmaLista = JSON.stringify(elaboradoresDe(props)) === JSON.stringify(novos.elaboradoPorUserIds)
        if (mesmaLista && (plano.ids.length === 0 || (props.elaboradoSincronizado === true && (props.elaboradoPor ?? '') === novos.elaboradoPor))) continue
        Object.assign(props, novos)
        mudou.add(id)
        result.elaboradoresSincronizados++
      }
    }

    for (const id of mudou) {
      await tx.wbsNode.update({ where: { id }, data: { properties: toJson(propsDe.get(id)) } })
    }

    // 6) cards de sprint sem nó → nós dentro do nó da sprint
    for (const c of openCards) {
      const destino = c.sprintId ? noDaSprint.get(c.sprintId) : undefined
      if (vinculados.has(c.id) || !destino) continue
      if (total >= WBS_LIMITS.MAX_NODES) break
      await criarNo(destino, c.title, { cardId: c.id, ...(c.description.trim() ? { description: c.description.slice(0, 2000) } : {}) })
    }

    if (result.nosCriados || result.cardsCriados || result.titulosAtualizados || result.nosMovidos || result.nosRemovidos || result.cardsMovidos || mudou.size) {
      await syncCodes(tx, projectId, tenantId)
      await bumpVersion(tx, projectId, tenantId)
    }

    // 7) nome de cada sprint = "código título" do seu nó no nível 2 (acompanha renumeração)
    const fases = await tx.wbsNode.findMany({ where: { projectId, tenantId, parentId: root.id }, select: { code: true, title: true, properties: true } })
    const nomeAtual = new Map(sprints.map(sp => [sp.id, sp.name]))
    for (const f of fases) {
      const sid = texto((f.properties as Record<string, unknown> | null)?.sprintId)
      if (!sid || !sprintViva.has(sid)) continue
      const nome = nomeDaSprint(f.code, f.title)
      if (nomeAtual.get(sid) === nome) continue
      await tx.sprint.update({ where: { id: sid }, data: { name: nome } })
    }
    return result
  })
}

// ── Planilha de custos → fases, sprints e projeto ────────────────────────────

export interface ResumoFasePlanilha {
  nodeId: string
  /** Maior data prevista das atividades da fase (aaaa-mm-dd); null mantém o valor atual. */
  dataFim: string | null
  /** Valor orçado da fase; null mantém o custo atual. */
  custo: number | null
}

/**
 * Leva o resultado da planilha de custos para onde ele é usado:
 *  - nó da fase (nível 2): `dataLimite` e `custo` — a "Data Limite" e o custo do
 *    cronograma financeiro em Editar projeto;
 *  - sprint da fase: data fim;
 *  - projeto: data fim = a maior data fim das fases.
 * Só grava o que mudou; sem data/custo calculado, mantém o valor informado à mão.
 */
export async function aplicarResumoDaPlanilha(
  projectId: string, tenantId: string, fases: ResumoFasePlanilha[], dataFimProjeto: string | null,
): Promise<{ fasesAtualizadas: number; sprintsAtualizadas: number; projetoAtualizado: boolean }> {
  return prisma.$transaction(async tx => {
    const out = { fasesAtualizadas: 0, sprintsAtualizadas: 0, projetoAtualizado: false }
    const project = await tx.project.findFirst({ where: { id: projectId, tenantId, deletedAt: null }, select: { endDate: true } })
    if (!project) return out
    const nos = await tx.wbsNode.findMany({ where: { projectId, tenantId, id: { in: fases.map(f => f.nodeId) } }, select: { id: true, properties: true } })
    const porId = new Map(nos.map(n => [n.id, { ...((n.properties as Record<string, unknown>) ?? {}) }]))
    const sprintIds: string[] = []
    for (const f of fases) {
      const props = porId.get(f.nodeId)
      if (!props) continue
      let mudou = false
      if (f.dataFim && props.dataLimite !== f.dataFim) { props.dataLimite = f.dataFim; mudou = true }
      if (f.custo !== null && props.custo !== f.custo) { props.custo = f.custo; mudou = true }
      if (mudou) {
        await tx.wbsNode.update({ where: { id: f.nodeId }, data: { properties: toJson(props) } })
        out.fasesAtualizadas++
      }
      if (f.dataFim && typeof props.sprintId === 'string') sprintIds.push(props.sprintId)
    }
    if (sprintIds.length) {
      const sprints = await tx.sprint.findMany({ where: { id: { in: sprintIds }, projectId, deletedAt: null }, select: { id: true, endDate: true } })
      const fimDaSprint = new Map(fases.flatMap(f => {
        const sid = porId.get(f.nodeId)?.sprintId
        return typeof sid === 'string' && f.dataFim ? [[sid, f.dataFim] as const] : []
      }))
      for (const sp of sprints) {
        const fim = fimDaSprint.get(sp.id)
        if (!fim || sp.endDate?.toISOString().slice(0, 10) === fim) continue
        await tx.sprint.update({ where: { id: sp.id }, data: { endDate: new Date(fim) } })
        out.sprintsAtualizadas++
      }
    }
    if (dataFimProjeto && project.endDate?.toISOString().slice(0, 10) !== dataFimProjeto) {
      await tx.project.update({ where: { id: projectId }, data: { endDate: new Date(dataFimProjeto) } })
      out.projetoAtualizado = true
    }
    if (out.fasesAtualizadas) await bumpVersion(tx, projectId, tenantId)
    return out
  })
}

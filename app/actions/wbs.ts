'use server'

import type { WbsLayoutOrientation } from '@/types/wbs'
import { notifyAssignedResponsible } from '@/services/responsavelNotificacao'

import { propagarPlanilhaDeCustos } from '@/services/planilhaService'
import { exigirPermissao, permissoesNoProjeto } from '@/services/authz'
import { verifySession } from '@/lib/dal'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import {
  InsertChildSchema,
  InsertSiblingSchema,
  DeleteNodeSchema,
  MoveNodeSchema,
  RenameNodeSchema,
  UpdateNodeStyleSchema,
  UpdateNodePropertiesSchema,
  SetLayoutSchema,
  SetCollapsedSchema,
  SaveTreeSchema,
  WbsImportSchema,
} from '@/lib/validation/wbsSchemas'
import {
  getTree,
  insertChild,
  insertSibling,
  deleteNode,
  moveNode,
  renameNode,
  updateNodeStyle,
  updateNodeProperties,
  setLayout,
  setCollapsed,
  saveTree,
  WbsConflictError,
  WbsValidationError,
} from '@/services/wbsService'
import type { GetTreeResult } from '@/services/wbsService'
import type { WbsImportData } from '@/lib/validation/wbsSchemas'

// ── Helpers ──────────────────────────────────────────────────────────────────

type Ok<T> = { ok: true } & T
type Err = { ok: false; error: string; conflict?: boolean }
type Result<T> = Ok<T> | Err

function err(e: unknown): Err {
  if (e instanceof WbsConflictError) return { ok: false, error: e.message, conflict: true }
  if (e instanceof WbsValidationError) return { ok: false, error: e.message }
  return { ok: false, error: e instanceof Error ? e.message : 'Erro inesperado' }
}

const wbsPath = (projetoId: string) => `/projetos/${projetoId}/wbs`

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getWbsTreeAction(projetoId: string): Promise<Result<GetTreeResult>> {
  try {
    const sessao = await verifySession()
    await exigirPermissao(sessao, projetoId, 'projeto:ver')
    const { tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'planilha:ver')
    const tree = await getTree(projetoId, tenantId)
    return { ok: true, ...tree }
  } catch (e) {
    return err(e)
  }
}

// ── Structural mutations ──────────────────────────────────────────────────────

export async function insertChildAction(
  projetoId: string,
  parentId: string,
): Promise<Result<{ nodeId: string; serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { userId, tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    const parsed = InsertChildSchema.safeParse({ parentId, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await insertChild(parsed.data, userId)
    revalidatePath(wbsPath(projetoId))
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

export async function insertSiblingAction(
  projetoId: string,
  siblingId: string,
): Promise<Result<{ nodeId: string; serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { userId, tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    const parsed = InsertSiblingSchema.safeParse({ siblingId, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await insertSibling(parsed.data, userId)
    revalidatePath(wbsPath(projetoId))
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

export async function deleteNodeAction(
  projetoId: string,
  nodeId: string,
  motivoExclusao?: string,
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { userId, tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    await exigirPermissao(sessao, projetoId, 'planilha:orcado')
    await exigirPermissao(sessao, projetoId, 'planilha:realizado-todos')
    const parsed = DeleteNodeSchema.safeParse({ nodeId, projectId: projetoId, tenantId, motivoExclusao })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await deleteNode(parsed.data, userId)
    revalidatePath(wbsPath(projetoId))
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

export async function moveNodeAction(
  projetoId: string,
  payload: { nodeId: string; targetId: string; position: 'INSIDE' | 'BEFORE' | 'AFTER' },
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { userId, tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    const parsed = MoveNodeSchema.safeParse({ ...payload, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await moveNode(parsed.data, userId)
    revalidatePath(wbsPath(projetoId))
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

// ── Metadata mutations ────────────────────────────────────────────────────────

export async function renameNodeAction(
  projetoId: string,
  nodeId: string,
  title: string,
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    const parsed = RenameNodeSchema.safeParse({ nodeId, title, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await renameNode(parsed.data)
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

export async function updateNodeStyleAction(
  projetoId: string,
  nodeId: string,
  style: Record<string, unknown>,
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    const parsed = UpdateNodeStyleSchema.safeParse({ nodeId, style, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await updateNodeStyle(parsed.data)
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

export async function updateNodePropertiesAction(
  projetoId: string,
  nodeId: string,
  properties: Record<string, unknown>,
  options?: { background?: boolean },
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { tenantId } = sessao
    const parsed = UpdateNodePropertiesSchema.safeParse({ nodeId, properties, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    await exigirPermissao(sessao, projetoId, 'projeto:ver')
    await exigirPermissao(sessao, projetoId, 'planilha:ver')
    const permissoes = await permissoesNoProjeto(sessao.userId, tenantId, sessao.role, projetoId)
    const { responsaveisAdicionados, cardId, ...result } = await updateNodeProperties(parsed.data, { userId: sessao.userId, permissoes })
    // Quem entrou como elaborador virou responsável do card: recebe o mesmo aviso do card.
    if (cardId) await Promise.all(responsaveisAdicionados.map(uid => notifyAssignedResponsible(cardId, uid)))
    // Data prevista / orçado mudaram: atualiza data fim da fase/sprint/projeto e custo da fase.
    if (!options?.background) await propagarPlanilhaDeCustos(projetoId, tenantId).catch(error => console.error('[planilha] falha ao propagar', error))
    if (!options?.background) revalidatePath(`/projetos/${projetoId}/planilha-custos`)
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

export async function setLayoutAction(
  projetoId: string,
  nodeId: string,
  layout: WbsLayoutOrientation,
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    const parsed = SetLayoutSchema.safeParse({ nodeId, layout, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await setLayout(parsed.data)
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

export async function setCollapsedAction(
  projetoId: string,
  nodeId: string,
  collapsed: boolean,
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    const parsed = SetCollapsedSchema.safeParse({ nodeId, collapsed, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await setCollapsed(parsed.data)
    return { ok: true, ...result }
  } catch (e) {
    return err(e)
  }
}

// ── Autosave ─────────────────────────────────────────────────────────────────

export async function saveTreeAction(
  payload: Omit<Parameters<typeof saveTree>[0], 'tenantId' | 'projectId'> & {
    projetoId: string
    /** Motivo informado ao excluir fase(s) cuja sprint tem dados. */
    motivoExclusao?: string
    /** cardId/sprintId de itens recortados ainda não colados: não são excluídos. */
    preservar?: string[]
  },
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { userId, tenantId } = sessao
    const { projetoId, motivoExclusao, preservar, ...rest } = payload
    const extras = z.object({ motivoExclusao: z.string().trim().max(1000).optional(), preservar: z.array(z.string().max(64)).max(5000).optional() })
      .safeParse({ motivoExclusao, preservar })
    if (!extras.success) return { ok: false, error: extras.error.issues[0].message }
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    await exigirPermissao(sessao, projetoId, 'planilha:orcado')
    await exigirPermissao(sessao, projetoId, 'planilha:realizado-todos')
    const parsed = SaveTreeSchema.safeParse({ ...rest, projectId: projetoId, tenantId })
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const result = await saveTree(parsed.data, userId, { refletirExclusoes: true, motivoExclusao: extras.data.motivoExclusao, preservar: extras.data.preservar })
    if (!result.ok) return { ok: false, error: 'Conflito de edição detectado', conflict: true }
    return { ok: true, serverVersion: result.serverVersion }
  } catch (e) {
    return err(e)
  }
}

// ── Reset / Import ────────────────────────────────────────────────────────────

export async function importWbsAction(
  projetoId: string,
  rawData: unknown,
): Promise<Result<{ serverVersion: number }>> {
  try {
    const sessao = await verifySession()
    const { userId, tenantId } = sessao
    await exigirPermissao(sessao, projetoId, 'projeto:editar')
    await exigirPermissao(sessao, projetoId, 'planilha:orcado')
    await exigirPermissao(sessao, projetoId, 'planilha:realizado-todos')

    const parsed = WbsImportSchema.safeParse(rawData)
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

    const importData: WbsImportData = parsed.data
    const { serverVersion: currentVersion } = await getTree(projetoId, tenantId)
    const result = await saveTree(
      {
        projectId: projetoId,
        tenantId,
        serverVersion: currentVersion,
        rootId: importData.rootId,
        nodes: importData.nodes,
      },
      userId,
    )
    if (!result.ok) return { ok: false, error: 'Conflito de edição detectado', conflict: true }
    revalidatePath(wbsPath(projetoId))
    return { ok: true, serverVersion: result.serverVersion }
  } catch (e) {
    return err(e)
  }
}

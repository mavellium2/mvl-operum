'use server'

import { propagarPlanilhaDeCustos } from '@/services/planilhaService'
import { verifySession } from '@/lib/dal'
import { requireProjectPermission } from '@/services/projectAccess'
import { registrarVersaoPlanilha, listarVersoesPlanilha, restaurarVersaoPlanilha } from '@/services/planilhaVersoes'
import { revalidatePath } from 'next/cache'

export async function salvarHistoricoPlanilhaAction(projectId: string, propagate = false) {
  try {
    const session = await verifySession()
    await requireProjectPermission(session, projectId, 'planilha:ver')
    if (propagate) await propagarPlanilhaDeCustos(projectId, session.tenantId)
    const numero = await registrarVersaoPlanilha({ tenantId: session.tenantId, projectId, userId: session.userId })
    return { numero }
  } catch (error) { return { error: error instanceof Error ? error.message : 'Não foi possível registrar a versão.' } }
}
export async function listarHistoricoPlanilhaAction(projectId: string, before?: number) {
  const session = await verifySession()
  await requireProjectPermission(session, projectId, 'planilha:ver')
  if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new Error('Cursor de histórico inválido.')
  return listarVersoesPlanilha(session.tenantId, projectId, before)
}
export async function restaurarHistoricoPlanilhaAction(projectId: string, numero: number, expectedLatest: number) {
  try {
    if (!Number.isSafeInteger(numero) || numero < 1 || !Number.isSafeInteger(expectedLatest)) throw new Error('Versão inválida.')
    const session = await verifySession()
    for (const permission of ['planilha:orcado', 'planilha:realizado-todos', 'projeto:editar', 'quadro:cards'] as const) await requireProjectPermission(session, projectId, permission)
    const result = await restaurarVersaoPlanilha({ tenantId: session.tenantId, projectId, userId: session.userId }, numero, expectedLatest)
    revalidatePath(`/projetos/${projectId}`,'layout')
    return { numero: result }
  } catch (error) { return { error: error instanceof Error ? error.message : 'Não foi possível restaurar a versão.' } }
}

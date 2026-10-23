'use server'

import { revalidatePath } from 'next/cache'
import { verifySession } from '@/lib/dal'
import { podeSincronizar, sincronizarEapSprint } from '@/services/eapSprintSyncService'
import { statusDaSincronizacao, type StatusSincronizacao } from '@/services/sincronizacaoStatus'

/**
 * "Sincronizar agora": repete a sincronização EAP ↔ planilha ↔ sprints com a
 * mesma checagem de permissão da abertura das telas. A sincronização é
 * idempotente e serializada por projeto (advisory lock), então repetir não duplica.
 */
export async function repetirSincronizacaoAction(projectId: string): Promise<{ status: StatusSincronizacao } | { error: string; status?: StatusSincronizacao | null }> {
  const sessao = await verifySession()
  if (!(await podeSincronizar(sessao, projectId))) return { error: 'Você não tem permissão para sincronizar este projeto.' }
  try {
    const { status } = await sincronizarEapSprint(sessao, projectId)
    revalidatePath(`/projetos/${projectId}/wbs`)
    revalidatePath(`/projetos/${projectId}/planilha-custos`)
    return { status }
  } catch {
    return { error: 'A sincronização falhou. Veja o motivo abaixo e tente novamente.', status: await statusDaSincronizacao(projectId, sessao.tenantId) }
  }
}

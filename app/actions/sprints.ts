'use server'

import { verifySession } from '@/lib/dal'
import { revalidatePath } from 'next/cache'
import { sprintsApi } from '@/lib/api-client'
import { sincronizarEapComSprint } from '@/services/wbsService'
import {
  MOTIVO_MINIMO, camposDaSprint, diferencasSprint, registrarHistoricoSprint, resumoDaSprint, sprintTemDados,
} from '@/services/sprintHistoricoService'

/** Grava a alteração no histórico da sprint; falha no histórico não desfaz a alteração. */
async function historicoDeAlteracao(tenantId: string, userId: string, id: string, antes: Awaited<ReturnType<typeof camposDaSprint>>) {
  try {
    const depois = await camposDaSprint(id)
    if (!depois) return
    await registrarHistoricoSprint({
      tenantId, userId, sprintId: id, acao: 'UPDATE', projectId: depois.projectId, nome: depois.name ?? '',
      alteracoes: diferencasSprint(antes, depois), origem: 'quadro',
    })
  } catch (error) { console.error('[sprint] falha ao gravar histórico', error) }
}

export async function createSprintAction(
  _prevState: unknown,
  input: { name: string; startDate?: string; endDate?: string; projectId?: string },
) {
  try {
    const { userId, tenantId } = await verifySession()
    const { startDate, endDate, ...rest } = input
    // <input type="date"> envia "YYYY-MM-DD"; o sprint-service exige datetime ISO completo.
    const toISO = (d?: string) => d ? new Date(d).toISOString() : undefined
    const sprint = await sprintsApi.create({ ...rest, createdBy: userId, startDate: toISO(startDate), endDate: toISO(endDate) })
    const sprintId = (sprint as { id?: string } | null)?.id
    if (sprintId) {
      await registrarHistoricoSprint({
        tenantId, userId, sprintId, acao: 'CREATE', projectId: input.projectId ?? null, nome: input.name, origem: 'quadro',
        alteracoes: diferencasSprint(null, { name: input.name, startDate: toISO(startDate) ?? null, endDate: toISO(endDate) ?? null }),
      }).catch(error => console.error('[sprint] falha ao gravar histórico', error))
    }
    revalidatePath('/sprints')
    if (input.projectId) {
      revalidatePath(`/projetos/${input.projectId}`)
      revalidatePath(`/projetos/${input.projectId}/sprints`)
    }
    return { sprint }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao criar sprint' }
  }
}

export async function updateSprintAction(_prevState: unknown, id: string, data: Record<string, unknown>) {
  try {
    const { userId, tenantId } = await verifySession()
    const antes = await camposDaSprint(id)
    const sprint = await sprintsApi.update(id, data)
    await historicoDeAlteracao(tenantId, userId, id, antes)
    revalidatePath('/sprints')
    revalidatePath(`/sprints/${id}`)
    return { sprint }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar sprint' }
  }
}

/** Dados da sprint antes de excluir: com cards ou tempo registrado, o motivo é obrigatório. */
export async function getSprintExclusaoInfoAction(id: string) {
  try {
    await verifySession()
    const resumo = await resumoDaSprint(id)
    if (!resumo) return { error: 'Sprint não encontrada' }
    return { cards: resumo.cards, segundosRegistrados: resumo.segundosRegistrados, exigeMotivo: sprintTemDados(resumo) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao consultar a sprint' }
  }
}

export async function deleteSprintAction(id: string, _projectId?: string, motivo?: string) {
  try {
    const { userId, tenantId } = await verifySession()
    const resumo = await resumoDaSprint(id)
    const justificativa = motivo?.trim() ?? ''
    if (resumo && sprintTemDados(resumo) && justificativa.length < MOTIVO_MINIMO) {
      return { error: `Esta sprint tem dados (cards ou horas registradas). Informe o motivo da exclusão (mín. ${MOTIVO_MINIMO} caracteres).` }
    }
    await sprintsApi.delete(id)
    if (resumo) {
      await registrarHistoricoSprint({
        tenantId, userId, sprintId: id, acao: 'DELETE', projectId: resumo.projectId, nome: resumo.nome, origem: 'quadro',
        motivo: justificativa || null, resumo: { cards: resumo.cards, segundosRegistrados: resumo.segundosRegistrados, status: resumo.status },
      }).catch(error => console.error('[sprint] falha ao gravar histórico', error))
    }
    // O projeto vem da sprint lida no servidor, não do parâmetro opcional da tela.
    // A exclusão no serviço e a reconciliação no monólito são operações distintas;
    // a leitura das telas também reconcilia fases excluídas se esta etapa falhar.
    const projetoDaSprint = resumo?.projectId
    let falhouSincronizacao = false
    if (projetoDaSprint) {
      try { await sincronizarEapComSprint(projetoDaSprint, tenantId) }
      catch (error) {
        falhouSincronizacao = true
        console.error('[sprint] excluída, mas a reconciliação da EAP falhou', error)
      }
    }
    revalidatePath('/sprints')
    revalidatePath(`/sprints/${id}`)
    if (projetoDaSprint) revalidatePath(`/projetos/${projetoDaSprint}`, 'layout')
    if (falhouSincronizacao) return { error: 'A sprint foi excluída, mas a EAP e a planilha ainda precisam ser atualizadas. Reabra o projeto para tentar a atualização novamente.' }
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao deletar sprint' }
  }
}

export async function completeSprintAction(id: string) {
  try {
    const { userId, tenantId } = await verifySession()
    const antes = await camposDaSprint(id)
    const sprint = await sprintsApi.update(id, { status: 'COMPLETED' })
    await historicoDeAlteracao(tenantId, userId, id, antes)
    revalidatePath('/sprints')
    revalidatePath(`/sprints/${id}`)
    return { sprint }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao completar sprint' }
  }
}

export async function getSprintsAction() {
  try {
    await verifySession()
    return await sprintsApi.list()
  } catch {
    return []
  }
}

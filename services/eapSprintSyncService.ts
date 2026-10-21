import 'server-only'
import { can, type SessaoAuthz } from './authz'
import { sincronizarEapComSprint, type SyncEapSprintResult } from './wbsService'
import { propagarPlanilhaDeCustos } from './planilhaService'
import { registrarFalha, registrarSucesso, type StatusSincronizacao } from './sincronizacaoStatus'

/** Quem pode sincronizar: editar o projeto e mexer nos cards. */
export async function podeSincronizar(sessao: SessaoAuthz, projectId: string): Promise<boolean> {
  return (await can(sessao, projectId, 'projeto:editar')) && (await can(sessao, projectId, 'quadro:cards'))
}

/**
 * Sincroniza EAP/planilha e sprint e leva datas e custos da planilha para fases,
 * sprints e projeto; grava o estado (situação, pendências, erro) para as telas.
 * Lança o erro para quem chamou: a tela decide se mostra ou segue.
 */
export async function sincronizarEapSprint(sessao: SessaoAuthz, projectId: string): Promise<{ result: SyncEapSprintResult; status: StatusSincronizacao }> {
  try {
    const result = await sincronizarEapComSprint(projectId, sessao.tenantId)
    const planilha = await propagarPlanilhaDeCustos(projectId, sessao.tenantId)
    const status = await registrarSucesso(projectId, sessao.tenantId, planilha?.cards, { eap: result, planilha })
    return { result, status }
  } catch (error) {
    console.error('[eap-sprint] falha ao sincronizar', error)
    await registrarFalha(projectId, sessao.tenantId, error).catch(e => console.error('[eap-sprint] falha ao registrar o estado', e))
    throw error
  }
}

/**
 * Sincroniza ao abrir as telas que exibem EAP/planilha/sprint. Só roda para quem
 * pode editar o projeto e os cards; falha nunca derruba a página (fica registrada
 * no estado da sincronização, visível na tela, com opção de tentar de novo).
 */
export async function sincronizarEapSprintSePermitido(sessao: SessaoAuthz, projectId: string): Promise<SyncEapSprintResult | null> {
  try {
    if (!(await podeSincronizar(sessao, projectId))) return null
    return (await sincronizarEapSprint(sessao, projectId)).result
  } catch {
    return null
  }
}

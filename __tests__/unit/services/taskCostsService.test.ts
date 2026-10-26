// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTaskCosts, setTaskCosts } from '@/services/taskCostsService'
import { taskBudgetTarget } from '@/services/taskBudgetService'
import { permissoesNoProjeto } from '@/services/authz'
import { updateNodeProperties } from '@/services/wbsService'
import { propagarPlanilhaDeCustos } from '@/services/planilhaService'
vi.mock('@/services/taskBudgetService', () => ({ taskBudgetTarget: vi.fn() }))
vi.mock('@/services/authz', () => ({ permissoesNoProjeto: vi.fn() }))
vi.mock('@/services/wbsService', () => ({ updateNodeProperties: vi.fn() }))
vi.mock('@/services/planilhaService', () => ({ propagarPlanilhaDeCustos: vi.fn() }))
const session = { userId: 'u1', tenantId: 't1', role: 'member' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(taskBudgetTarget).mockResolvedValue({ projectId: 'p1', node: { id: 'n1', properties: { materiais: 50, materiaisReal: 45, dataRealizacaoCard: '2026-10-26' } } } as never)
  vi.mocked(permissoesNoProjeto).mockResolvedValue(new Set(['planilha:realizado-proprio']))
  vi.mocked(updateNodeProperties).mockResolvedValue({ serverVersion: 3 } as never)
})
describe('custos e conclusão canônicos pelo MCP', () => {
  it('lê materiais e data efetiva inclusive conclusão da sprint', async () => {
    expect(await getTaskCosts(session, 'c1')).toMatchObject({ estimated_materials: 50, actual_materials: 45, completed_on: '2026-10-26' })
  })
  it('grava zero e a data via validação financeira do painel, propagando conclusão ao card', async () => {
    await setTaskCosts(session, 'c1', { actual_materials: 0, completed_on: '2026-10-26' })
    expect(updateNodeProperties).toHaveBeenCalledWith({ projectId: 'p1', tenantId: 't1', nodeId: 'n1', properties: { materiaisReal: 0, dataRealizacao: '2026-10-26' } }, { userId: 'u1', permissoes: new Set(['planilha:realizado-proprio']) })
    expect(propagarPlanilhaDeCustos).toHaveBeenCalledWith('p1', 't1')
  })
  it('valor sem data não conclui', async () => {
    await setTaskCosts(session, 'c1', { actual_materials: 42 })
    expect(propagarPlanilhaDeCustos).not.toHaveBeenCalled()
  })
  it('negativa de permissão não propaga', async () => {
    vi.mocked(updateNodeProperties).mockRejectedValue(new Error('Sem permissão'))
    await expect(setTaskCosts(session, 'c1', { completed_on: '2026-10-26' })).rejects.toThrow('Sem permissão')
    expect(propagarPlanilhaDeCustos).not.toHaveBeenCalled()
  })
  it('permite retirar explicitamente uma data', async () => {
    await setTaskCosts(session, 'c1', { completed_on: null })
    expect(updateNodeProperties).toHaveBeenCalledWith(expect.objectContaining({ properties: { dataRealizacao: null } }), expect.anything())
  })
  it.each([{}, { actual_materials: -1 }, { completed_on: '2026-02-30' }, { completed_on: 'amanhã' }, { actual_minutes: 20 }, { node_id: 'forged' }])('rejeita payload inválido %j', async patch => {
    await expect(setTaskCosts(session, 'c1', patch)).rejects.toThrow()
    expect(updateNodeProperties).not.toHaveBeenCalled()
  })
})

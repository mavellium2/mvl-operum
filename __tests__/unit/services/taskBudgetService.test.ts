// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import prisma from '@/lib/prisma'
import { exigirPermissao, permissoesNoProjeto } from '@/services/authz'
import { getTree, updateNodeProperties } from '@/services/wbsService'
import { getTaskBudget, setTaskBudget } from '@/services/taskBudgetService'

vi.mock('@/lib/prisma', () => ({ default: { card: { findFirst: vi.fn() } } }))
vi.mock('@/services/authz', () => ({ exigirPermissao: vi.fn(), permissoesNoProjeto: vi.fn() }))
vi.mock('@/services/wbsService', () => ({
  getTree: vi.fn(), updateNodeProperties: vi.fn(),
  WbsNotFoundError: class extends Error {}, WbsValidationError: class extends Error {},
}))

const session = { userId: 'u1', tenantId: 't1', role: 'member' }
const node = { id: 'n1', properties: { cardId: 'c1', tempoMinutos: 30 }, childrenIds: [] }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(prisma.card.findFirst).mockResolvedValue({ projectId: 'p1', sprint: null } as never)
  vi.mocked(getTree).mockResolvedValue({ nodes: { n1: node }, rootId: 'root', serverVersion: 2 } as never)
  vi.mocked(permissoesNoProjeto).mockResolvedValue(new Set(['planilha:orcado']))
  vi.mocked(updateNodeProperties).mockResolvedValue({ serverVersion: 3, cardId: 'c1', responsaveisAdicionados: [] })
})

describe('orçamento canônico por card', () => {
  it('lê minutos da EAP no tenant do chamador', async () => {
    expect(await getTaskBudget(session, 'c1')).toMatchObject({ estimated_minutes: 30, source: 'planilha_custos' })
    expect(getTree).toHaveBeenCalledWith('p1', 't1')
    expect(prisma.card.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }))
  })
  it('grava só tempo orçado usando o serviço que valida permissão e audita', async () => {
    expect(await setTaskBudget(session, 'c1', { estimated_minutes: 120 })).toMatchObject({ estimated_minutes: 120, server_version: 3 })
    expect(exigirPermissao).toHaveBeenCalledWith(session, 'p1', 'planilha:orcado')
    expect(updateNodeProperties).toHaveBeenCalledWith({ projectId: 'p1', tenantId: 't1', nodeId: 'n1', properties: { tempoMinutos: 120 } },
      { userId: 'u1', permissoes: new Set(['planilha:orcado']) })
  })
  it('aceita orçamento zero', async () => {
    await expect(setTaskBudget(session, 'c1', { estimated_minutes: 0 })).resolves.toMatchObject({ estimated_minutes: 0 })
  })
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER, '60'])('recusa minutos inválidos %s', async minutes => {
    await expect(setTaskBudget(session, 'c1', { estimated_minutes: minutes })).rejects.toThrow()
    expect(updateNodeProperties).not.toHaveBeenCalled()
  })
  it('não aceita campos realizados ou projeto forjado', async () => {
    await expect(setTaskBudget(session, 'c1', { estimated_minutes: 60, tempoRealMinutos: 60, projectId: 'p2' })).rejects.toThrow()
    expect(updateNodeProperties).not.toHaveBeenCalled()
  })
  it('sem permissão financeira não escreve', async () => {
    vi.mocked(exigirPermissao).mockRejectedValue(new Error('Sem permissão'))
    await expect(setTaskBudget(session, 'c1', { estimated_minutes: 60 })).rejects.toThrow('Sem permissão')
    expect(updateNodeProperties).not.toHaveBeenCalled()
  })
  it('card inexistente ou de outro tenant não acessa a EAP', async () => {
    vi.mocked(prisma.card.findFirst).mockResolvedValue(null)
    await expect(setTaskBudget(session, 'c1', { estimated_minutes: 60 })).rejects.toThrow('Tarefa não encontrada')
    expect(getTree).not.toHaveBeenCalled()
  })
  it.each([{}, { n1: node, n2: { ...node, id: 'n2' } }, { n1: { ...node, childrenIds: ['filho'] } }])('vínculo ausente, ambíguo ou não folha não escreve', async nodes => {
    vi.mocked(getTree).mockResolvedValue({ nodes, rootId: 'root', serverVersion: 2 } as never)
    await expect(setTaskBudget(session, 'c1', { estimated_minutes: 60 })).rejects.toThrow()
    expect(updateNodeProperties).not.toHaveBeenCalled()
  })
})

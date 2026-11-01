// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const tx = vi.hoisted(() => ({
  wbsNode: {
    findFirst: vi.fn().mockResolvedValue({ id: 'raiz' }),
    findMany: vi.fn().mockResolvedValue([{ id: 'n1', title: 'Escopo' }, { id: 'n2', title: 'Tecnologia' }]),
    update: vi.fn(),
  },
}))
vi.mock('@/services/projectAccess', () => ({ requireProjectPermission: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/planilhaService', () => ({ planilhaDoProjeto: vi.fn().mockResolvedValue(null) }))
vi.mock('@/services/documentRevisionService', () => ({ submeterDocumento: vi.fn() }))
vi.mock('@/services/macroFaseSyncService', () => ({ reconcileMacroFases: vi.fn().mockResolvedValue({ pending: false }) }))
vi.mock('@/services/projetoEditorService', () => ({ salvarProjetoEditor: vi.fn() }))
vi.mock('@/services/projetoVersoes', () => ({ registrarVersaoProjeto: vi.fn().mockResolvedValue(2) }))
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u1', tenantId: 't1', role: 'admin' }) }))
vi.mock('@/lib/api-client', () => ({ projectsApi: { update: vi.fn().mockResolvedValue({ id: 'p1' }) }, adminApi: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) } }))

import { projectsApi } from '@/lib/api-client'
import { reconcileMacroFases } from '@/services/macroFaseSyncService'
import { registrarVersaoProjeto } from '@/services/projetoVersoes'
import { salvarProjetoEditor } from '@/services/projetoEditorService'
import { LIMITES_TEXTO_PROJETO } from '@/lib/projetoLimites'
import { updateProjetoAction } from '@/app/actions/projetos'

beforeEach(() => vi.clearAllMocks())

describe('salvar o Editar projeto', () => {
  it('renomeia a fase existente pelo id (sem criar outra na EAP) e envia as fases sem o id', async () => {
    const r = await updateProjetoAction({}, 'p1', {
      name: 'P',
      macroFases: [{ fase: 'Escopo do projeto', dataLimite: '', custo: '', nodeId: 'n1' }, { fase: 'Nova', dataLimite: '', custo: '' }, { fase: 'tecnologia', dataLimite: '', custo: '', nodeId: 'n1' }],
    })
    expect(r).toHaveProperty('projeto')
    expect(projectsApi.update).toHaveBeenCalledWith('p1', expect.objectContaining({
      macroFases: [{ fase: 'Escopo do projeto', dataLimite: '', custo: '' }, { fase: 'Nova', dataLimite: '', custo: '' }, { fase: 'tecnologia', dataLimite: '', custo: '' }],
    }))
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { title: 'Escopo do projeto' } })
    // Nome já usado por outra fase não é aplicado.
    expect(tx.wbsNode.update).not.toHaveBeenCalledWith({ where: { id: 'n1' }, data: { title: 'tecnologia' } })
    expect(tx.wbsNode.update).toHaveBeenCalledWith({ where: { id: 'raiz' }, data: { version: { increment: 1 } } })
    expect(vi.mocked(tx.wbsNode.update).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(reconcileMacroFases).mock.invocationCallOrder[0])
  })

  it('não informa sucesso quando falha a gravação da versão', async () => {
    const versao = { conteudo: { form: { ...Object.fromEntries(Object.keys(LIMITES_TEXTO_PROJETO).map(key => [key, ''])), departamentos: [] } as never, fases: [] }, alteracoes: ['Nome do projeto'], restauradaDe: 1 }
    vi.mocked(salvarProjetoEditor).mockRejectedValueOnce(new Error('banco fora'))
    const r = await updateProjetoAction({}, 'p1', { name: 'P' }, versao as never)
    expect(r).toHaveProperty('error', 'banco fora')
    expect(salvarProjetoEditor).toHaveBeenCalledWith({ tenantId: 't1', userId: 'u1', role: 'admin' }, 'p1', { name: 'P' }, {}, versao)
  })
  it.each([
    { name: ' ' },
    { startDate: '2027-02-31' },
    { startDate: '2027-03-02', endDate: '2027-03-01' },
    { macroFases: [{ fase: 'Escopo', dataLimite: '2027-02-31', custo: '' }] },
    { macroFases: [{ fase: '', dataLimite: '', custo: '100,00' }] },
    { macroFases: [{ fase: 'Escopo', dataLimite: '', custo: '' }, { fase: ' escopo ', dataLimite: '', custo: '' }] },
  ])('recusa dados inválidos antes de alterar EAP, projeto ou versões: %j', async dados => {
    const result = await updateProjetoAction({}, 'p1', dados)
    expect(result).toHaveProperty('error')
    expect(projectsApi.update).not.toHaveBeenCalled()
    expect(tx.wbsNode.update).not.toHaveBeenCalled()
    expect(registrarVersaoProjeto).not.toHaveBeenCalled()
  })

  it('valida o snapshot antes de modificar qualquer dado do projeto', async () => {
    const result = await updateProjetoAction({}, 'p1', { name: 'Novo nome' }, { conteudo: { form: {}, fases: [] }, alteracoes: [] } as never)
    expect(result).toHaveProperty('error', expect.stringContaining('Nenhuma alteração foi gravada'))
    expect(projectsApi.update).not.toHaveBeenCalled()
    expect(tx.wbsNode.update).not.toHaveBeenCalled()
    expect(registrarVersaoProjeto).not.toHaveBeenCalled()
  })

})

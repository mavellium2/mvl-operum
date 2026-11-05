// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/planilhaService', () => ({ propagarPlanilhaDeCustos: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/services/authz', () => ({ exigirPermissao: vi.fn(), permissoesNoProjeto: vi.fn() }))
vi.mock('@/services/wbsService', () => ({ updateNodeProperties: vi.fn(), WbsConflictError: class extends Error {}, WbsValidationError: class extends Error {} }))
import { propagarPlanilhaDeCustos } from '@/services/planilhaService'
import { verifySession } from '@/lib/dal'
import { exigirPermissao, permissoesNoProjeto } from '@/services/authz'
import { updateNodeProperties } from '@/services/wbsService'
import { updateNodePropertiesAction } from '@/app/actions/wbs'
import { revalidatePath } from 'next/cache'

const session = { userId: 'u1', tenantId: 't1', role: 'member' }
const permissoes = new Set(['planilha:realizado-proprio'] as const)
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(propagarPlanilhaDeCustos).mockResolvedValue(null)
  vi.mocked(verifySession).mockResolvedValue(session as never)
  vi.mocked(permissoesNoProjeto).mockResolvedValue(permissoes)
  vi.mocked(updateNodeProperties).mockResolvedValue({ serverVersion: 2 })
})

describe('Action da planilha — autorização no servidor', () => {
  it('usa usuário, tenant e permissões da sessão, sem aceitar contexto do cliente', async () => {
    expect(await updateNodePropertiesAction('p1', 'n1', { tempoRealMinutos: 30 })).toEqual({ ok: true, serverVersion: 2 })
    expect(exigirPermissao).toHaveBeenCalledWith(session, 'p1', 'projeto:ver')
    expect(exigirPermissao).toHaveBeenCalledWith(session, 'p1', 'planilha:ver')
    expect(updateNodeProperties).toHaveBeenCalledWith({ nodeId: 'n1', projectId: 'p1', tenantId: 't1', properties: { tempoRealMinutos: 30 } }, { userId: 'u1', permissoes })
    expect(revalidatePath).toHaveBeenCalledWith('/projetos/p1/planilha-custos')
  })
  it('salva em segundo plano com autorização, sem recarregar nem recalcular o projeto por campo', async () => {
    expect(await updateNodePropertiesAction('p1', 'n1', { tempoRealMinutos: 30 }, { background: true })).toEqual({ ok: true, serverVersion: 2 })
    expect(updateNodeProperties).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1' }), { userId: 'u1', permissoes })
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(propagarPlanilhaDeCustos).not.toHaveBeenCalled()
  })
  it('nega gravação quando leitura foi revogada', async () => {
    vi.mocked(exigirPermissao).mockRejectedValue(new Error('Sem permissão'))
    expect(await updateNodePropertiesAction('p1', 'n1', { tempoRealMinutos: 30 })).toEqual({ ok: false, error: 'Sem permissão' })
    expect(updateNodeProperties).not.toHaveBeenCalled()
  })
  it('nega valor inválido sem chamar o serviço', async () => {
    const result = await updateNodePropertiesAction('p1', 'n1', { tempoRealMinutos: -1 })
    expect(result.ok).toBe(false)
    expect(updateNodeProperties).not.toHaveBeenCalled()
  })
  it('propaga recusa por campo e não confirma cache como salvo', async () => {
    vi.mocked(updateNodeProperties).mockRejectedValue(new Error('Sem permissão para editar o campo materiais.'))
    expect(await updateNodePropertiesAction('p1', 'n1', { materiais: 30 })).toEqual({ ok: false, error: 'Sem permissão para editar o campo materiais.' })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

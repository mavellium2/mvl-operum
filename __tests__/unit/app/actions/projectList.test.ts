import { describe, it, expect, vi, beforeEach } from 'vitest'
const { verify, load, setCookie } = vi.hoisted(() => ({ verify: vi.fn(), load: vi.fn(), setCookie: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: verify }))
vi.mock('@/services/projectList', () => ({ loadProjectList: load }))
vi.mock('next/headers', () => ({ cookies: async () => ({ set: setCookie }) }))
import { loadMoreProjects, salvarFiltrosProjetos } from '@/app/actions/projectList'
import { FILTROS_VAZIOS, lerFiltrosDoCookie } from '@/lib/filtrosProjetos'
beforeEach(() => { vi.clearAllMocks(); verify.mockResolvedValue({ userId: 'u1', tenantId: 't1' }) })
describe('loadMoreProjects', () => {
  it('autentica e encaminha filtros (normalizados) e página para a listagem autorizada', async () => {
    const batch = { projects: [], total: 0, recent: '' }
    load.mockResolvedValue(batch)
    const filtros = { ...FILTROS_VAZIOS, situacoes: ['COMPLETED', 'APAGADO'], anos: [2026] }
    expect(await loadMoreProjects({ page: 2, query: ' Alfa ', filtros, preferred: 'p1' })).toEqual({ batch })
    expect(verify).toHaveBeenCalled()
    expect(load).toHaveBeenCalledWith(2, 'Alfa', { ...FILTROS_VAZIOS, situacoes: ['COMPLETED'], anos: [2026] }, 'p1')
  })
  it('recusa páginas e filtros inválidos sem consultar projetos', async () => {
    for (const input of [{ page: 0, filtros: FILTROS_VAZIOS }, { page: 1.5, filtros: FILTROS_VAZIOS }, { page: 2, filtros: null }]) {
      expect(await loadMoreProjects({ ...input, query: '', preferred: '' } as never)).toHaveProperty('error')
    }
    expect(load).not.toHaveBeenCalled()
  })
  it('não expõe erros internos na falha do serviço', async () => {
    load.mockRejectedValue(new Error('informação interna'))
    const result = await loadMoreProjects({ page: 2, query: '', filtros: FILTROS_VAZIOS, preferred: '' })
    expect(result).toEqual({ error: 'Não foi possível carregar mais projetos. Tente novamente.' })
  })
})
describe('salvarFiltrosProjetos', () => {
  it('guarda os filtros válidos num cookie da conta nesta instituição, por um ano', async () => {
    expect(await salvarFiltrosProjetos({ ...FILTROS_VAZIOS, turnos: ['Vespertino', 'Madrugada'], turmas: ['2'] })).toEqual({ ok: true })
    const [nome, valor, opcoes] = setCookie.mock.calls[0]
    expect(nome).toBe('operum_project_filters_t1_u1')
    expect(lerFiltrosDoCookie(valor)).toEqual({ ...FILTROS_VAZIOS, turnos: ['Vespertino'], turmas: ['2'] })
    expect(opcoes).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 31536000 })
  })
})

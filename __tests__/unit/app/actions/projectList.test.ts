import { describe, it, expect, vi, beforeEach } from 'vitest'
const { verify, load } = vi.hoisted(() => ({ verify: vi.fn(), load: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: verify }))
vi.mock('@/services/projectList', () => ({ loadProjectList: load }))
import { loadMoreProjects } from '@/app/actions/projectList'
beforeEach(() => { vi.clearAllMocks(); verify.mockResolvedValue({ userId: 'u1', tenantId: 't1' }) })
describe('loadMoreProjects', () => {
  it('autentica e encaminha filtros e página para a listagem autorizada', async () => {
    const batch = { projects: [], total: 0, recent: '' }
    load.mockResolvedValue(batch)
    expect(await loadMoreProjects({ page: 2, query: ' Alfa ', status: 'COMPLETED', preferred: 'p1' })).toEqual({ batch })
    expect(verify).toHaveBeenCalled()
    expect(load).toHaveBeenCalledWith(2, 'Alfa', 'COMPLETED', 'p1')
  })
  it('recusa páginas e situações inválidas sem consultar projetos', async () => {
    for (const input of [{ page: 0, status: '' }, { page: 1.5, status: '' }, { page: 2, status: 'INVALID' }]) {
      expect(await loadMoreProjects({ ...input, query: '', preferred: '' })).toHaveProperty('error')
    }
    expect(load).not.toHaveBeenCalled()
  })
  it('não expõe erros internos na falha do serviço', async () => {
    load.mockRejectedValue(new Error('informação interna'))
    const result = await loadMoreProjects({ page: 2, query: '', status: '', preferred: '' })
    expect(result).toEqual({ error: 'Não foi possível carregar mais projetos. Tente novamente.' })
  })
})

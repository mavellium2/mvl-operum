// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ tenantId: 't1', role: 'USER', userId: 'u1' }) }))
vi.mock('@/lib/storageUrl', () => ({ isSafeStorageUrl: () => true }))
vi.mock('@/services/arquivosProjetoService', () => ({
  svgParaExibir: vi.fn(),
  urlDeAcesso: vi.fn().mockResolvedValue('https://minio.operum.adm.br/obj'),
  excluirArquivo: vi.fn(), renomearArquivo: vi.fn(),
  ArquivoProjetoError: class extends Error {},
}))

import { GET } from '@/app/api/projects/[projetoId]/arquivos/[arquivoId]/route'
import { svgParaExibir, urlDeAcesso } from '@/services/arquivosProjetoService'

const ctx = { params: Promise.resolve({ projetoId: 'p1', arquivoId: 'a1' }) }
beforeEach(() => vi.mocked(svgParaExibir).mockReset())

describe('GET arquivo do projeto', () => {
  it('SVG sai pela origem do app com CSP sandbox e nosniff', async () => {
    vi.mocked(svgParaExibir).mockResolvedValue('<svg/>')
    const res = await GET(new Request('http://app/api/projects/p1/arquivos/a1'), ctx)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
  })
  it('outros tipos redirecionam para a URL assinada; baixar nem consulta o SVG', async () => {
    vi.mocked(svgParaExibir).mockResolvedValue(null)
    expect((await GET(new Request('http://app/api/projects/p1/arquivos/a1'), ctx)).status).toBe(302)
    const baixar = await GET(new Request('http://app/api/projects/p1/arquivos/a1?baixar=1'), ctx)
    expect(baixar.status).toBe(302)
    expect(svgParaExibir).toHaveBeenCalledTimes(1)
    expect(urlDeAcesso).toHaveBeenLastCalledWith(expect.anything(), 'p1', 'a1', true)
  })
})

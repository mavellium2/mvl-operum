// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/dal', () => ({ verifySession: vi.fn() }))
vi.mock('@/services/documentRevisionService', () => ({ adicionarRodadaAvaliacaoRh: vi.fn(), removerRodadaAvaliacaoRh: vi.fn() }))
import { verifySession } from '@/lib/dal'
import { DocumentRevisionError } from '@/lib/documentRevisionError'
import { adicionarRodadaAvaliacaoRh, removerRodadaAvaliacaoRh } from '@/services/documentRevisionService'
import { DELETE, POST } from '@/app/api/projects/[projetoId]/avaliacao-rh/rodadas/route'

const session = { tenantId: 't1', userId: 'u1', role: 'member' }
const ctx = { params: Promise.resolve({ projetoId: 'p1' }) }

describe('API de rodadas da Avaliação de R.H.', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(verifySession).mockResolvedValue(session as never)
  })

  it('abre a próxima rodada e devolve o total', async () => {
    vi.mocked(adicionarRodadaAvaliacaoRh).mockResolvedValue({ rodadas: 3 })
    const resposta = await POST(new Request('http://localhost/x', { method: 'POST' }), ctx)
    expect(resposta.status).toBe(201)
    expect(await resposta.json()).toEqual({ rodadas: 3 })
    expect(adicionarRodadaAvaliacaoRh).toHaveBeenCalledWith(session, 'p1')
  })

  it('propaga a recusa do serviço (não gerente ou limite de rodadas)', async () => {
    vi.mocked(adicionarRodadaAvaliacaoRh).mockRejectedValue(new DocumentRevisionError('Somente o gerente', 403))
    expect((await POST(new Request('http://localhost/x', { method: 'POST' }), ctx)).status).toBe(403)
  })

  it('exclui a última rodada pelo número informado', async () => {
    vi.mocked(removerRodadaAvaliacaoRh).mockResolvedValue({ rodadas: 2, versoesArquivadas: 3 })
    const resposta = await DELETE(new Request('http://localhost/x', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rodada: 3 }) }), ctx)
    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ rodadas: 2, versoesArquivadas: 3 })
    expect(removerRodadaAvaliacaoRh).toHaveBeenCalledWith(session, 'p1', 3)
  })

  it.each([{ rodada: 0 }, { rodada: 11 }, { rodada: '3' }, { rodada: 3, extra: 1 }, {}])('recusa corpo inválido: %j', async corpo => {
    const resposta = await DELETE(new Request('http://localhost/x', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }), ctx)
    expect(resposta.status).toBeGreaterThanOrEqual(400)
    expect(removerRodadaAvaliacaoRh).not.toHaveBeenCalled()
  })

  it('propaga a recusa do serviço ao excluir (ex.: não é gerente)', async () => {
    vi.mocked(removerRodadaAvaliacaoRh).mockRejectedValue(new DocumentRevisionError('Somente o gerente', 403))
    const resposta = await DELETE(new Request('http://localhost/x', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rodada: 3 }) }), ctx)
    expect(resposta.status).toBe(403)
  })
})

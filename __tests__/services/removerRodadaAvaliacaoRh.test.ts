// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
const tx = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  project: { findFirst: vi.fn(), update: vi.fn() },
  documentVersion: { findMany: vi.fn(), update: vi.fn() },
  documentDraft: { deleteMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ default: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } }))
vi.mock('@/services/authz', () => ({ exigirPermissao: vi.fn(), can: vi.fn() }))
vi.mock('@/services/gerenteProjeto', () => ({ gerenteDoProjeto: vi.fn(), podeAvaliarRh: vi.fn() }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: vi.fn() }))
vi.mock('@/services/eapService', () => ({ getOrCreateDocument: vi.fn() }))
import { exigirPermissao } from '@/services/authz'
import { podeAvaliarRh } from '@/services/gerenteProjeto'
import { registrarAcao } from '@/services/auditoriaService'
import { removerRodadaAvaliacaoRh } from '@/services/documentRevisionService'

const s = { tenantId: 't1', userId: 'u1', role: 'member' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(podeAvaliarRh).mockResolvedValue(true)
  tx.$queryRaw.mockResolvedValue([{ id: 'p1' }])
  tx.project.findFirst.mockResolvedValue({ avaliacaoRhRodadas: 4 })
  tx.documentVersion.findMany.mockResolvedValue([
    { id: 'v1', resourceId: 'rh:4:u1', status: 'APPROVED' },
    { id: 'v2', resourceId: 'rh:4:u2', status: 'PENDING' },
  ])
})

describe('removerRodadaAvaliacaoRh', () => {
  it('arquiva os documentos da última rodada (nada é apagado), recusa as pendentes, descarta rascunhos e reduz o total', async () => {
    const r = await removerRodadaAvaliacaoRh(s, 'p1', 4)
    expect(r).toEqual({ rodadas: 3, versoesArquivadas: 2 })
    expect(tx.documentVersion.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', documentType: 'AVALIACAO_RH', resourceId: { startsWith: 'rh:4:' } } }))
    expect(tx.documentVersion.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { resourceId: 'excl:rh:4:u1' } })
    expect(tx.documentVersion.update).toHaveBeenCalledWith({ where: { id: 'v2' }, data: { resourceId: 'excl:rh:4:u2', status: 'REJECTED', approvedById: 'u1' } })
    expect(tx.documentDraft.deleteMany).toHaveBeenCalledWith({ where: { projectId: 'p1', tenantId: 't1', documentType: 'AVALIACAO_RH', resourceId: { startsWith: 'rh:4:' } } })
    expect(tx.project.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { avaliacaoRhRodadas: 3, avaliacaoRhTitulos: expect.anything() } })
    expect(registrarAcao).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOCUMENTO_EXCLUIR', details: expect.objectContaining({ documentType: 'AVALIACAO_RH' }) }), tx)
  })

  it.each([1, 2])('a %iª avaliação (AC/AF) não pode ser excluída', async rodada => {
    await expect(removerRodadaAvaliacaoRh(s, 'p1', rodada)).rejects.toMatchObject({ status: 400 })
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it('só a última rodada pode ser excluída', async () => {
    await expect(removerRodadaAvaliacaoRh(s, 'p1', 3)).rejects.toMatchObject({ status: 409 })
    expect(tx.documentVersion.update).not.toHaveBeenCalled()
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it('quem não é gerente nem administrador não exclui', async () => {
    vi.mocked(podeAvaliarRh).mockResolvedValue(false)
    await expect(removerRodadaAvaliacaoRh(s, 'p1', 4)).rejects.toMatchObject({ status: 403 })
    expect(tx.project.update).not.toHaveBeenCalled()
  })

  it('exige a permissão de excluir documentos', async () => {
    await removerRodadaAvaliacaoRh(s, 'p1', 4)
    expect(exigirPermissao).toHaveBeenCalledWith(s, 'p1', 'documentos:excluir')
  })

  it('sem documentos na rodada, só reduz o total', async () => {
    tx.documentVersion.findMany.mockResolvedValue([])
    expect(await removerRodadaAvaliacaoRh(s, 'p1', 4)).toEqual({ rodadas: 3, versoesArquivadas: 0 })
    expect(tx.documentVersion.update).not.toHaveBeenCalled()
  })
})

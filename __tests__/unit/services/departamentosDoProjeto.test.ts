// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  default: { projetoDepartamento: { findMany: vi.fn() } },
}))

import prisma from '@/lib/prisma'
import { departamentosDoProjeto } from '@/services/departamentosDoProjeto'

const assoc = (...nomes: string[]) => nomes.map(name => ({ department: { name } })) as never

beforeEach(() => vi.clearAllMocks())

describe('departamentosDoProjeto', () => {
  it('usa o nome atual do cadastro em vez do nome gravado no projeto', async () => {
    vi.mocked(prisma.projetoDepartamento.findMany).mockResolvedValue(assoc('ADS'))
    expect(await departamentosDoProjeto('p1', 't1', ['ADS - AMS'])).toEqual(['ADS'])
    expect(prisma.projetoDepartamento.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projetoId: 'p1', department: { tenantId: 't1', deletedAt: null } },
    }))
  })

  it('mantém a ordem escolhida no projeto, com o renomeado na posição do antigo', async () => {
    vi.mocked(prisma.projetoDepartamento.findMany).mockResolvedValue(assoc('Gestão', 'Sistemas'))
    expect(await departamentosDoProjeto('p1', 't1', ['ADS', 'Gestão'])).toEqual(['Sistemas', 'Gestão'])
  })

  it('projeto antigo sem associação usa a lista gravada', async () => {
    vi.mocked(prisma.projetoDepartamento.findMany).mockResolvedValue([])
    expect(await departamentosDoProjeto('p1', 't1', [' ADS ', ''])).toEqual(['ADS'])
  })

  it('falha ao ler a associação não quebra o documento', async () => {
    vi.mocked(prisma.projetoDepartamento.findMany).mockRejectedValue(new Error('db'))
    expect(await departamentosDoProjeto('p1', 't1', ['ADS'])).toEqual(['ADS'])
  })
})

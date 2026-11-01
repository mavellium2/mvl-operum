import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn(), autor: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: { user: { findFirst: mock.autor }, $transaction: (fn: (tx: unknown) => unknown) => fn({ projetoVersao: mock, user: { findFirst: mock.autor } }) } }))
import { registrarVersaoProjeto, ConteudoVersaoSchema } from '@/services/projetoVersoes'
const form = Object.fromEntries(Object.keys(ConteudoVersaoSchema.shape.form.shape).map(key => [key, key === 'departamentos' ? [] : '']))
const conteudo = ConteudoVersaoSchema.parse({ form, fases: [] })
const ctx = { tenantId: 't', projectId: 'p', userId: 'u' }
beforeEach(() => { vi.resetAllMocks(); mock.autor.mockResolvedValue({ name: 'Autor' }) })
it('ativa v1 sem criar ou excluir versões, com isolamento de tenant', async () => {
  mock.findFirst.mockResolvedValue({ id: 'v1', numero: 1 })
  expect(await registrarVersaoProjeto(ctx, { conteudo, alteracoes: [], ativarVersao: 1 })).toBe(1)
  expect(mock.findFirst).toHaveBeenCalledWith({ where: { tenantId: 't', projectId: 'p', numero: 1 } })
  expect(mock.create).not.toHaveBeenCalled()
  expect(mock.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { ativa: true } })
})
it('salvamento seguinte usa maior número do histórico e cria v5 ativa', async () => {
  mock.findFirst.mockResolvedValue({ numero: 4 })
  expect(await registrarVersaoProjeto(ctx, { conteudo, alteracoes: ['Nome'], restauradaDe: 1 })).toBe(5)
  expect(mock.create).toHaveBeenCalledWith({ data: expect.objectContaining({ numero: 5, ativa: true, restauradaDe: 1 }) })
})
it('não altera o marcador se a versão não pertence ao projeto', async () => {
  mock.findFirst.mockResolvedValue(null)
  await expect(registrarVersaoProjeto(ctx, { conteudo, alteracoes: [], ativarVersao: 1 })).rejects.toThrow('Versão não encontrada')
  expect(mock.updateMany).not.toHaveBeenCalled()
})

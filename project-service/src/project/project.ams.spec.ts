import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('../prisma', () => ({ prisma: { $transaction: vi.fn() } }))
import { prisma } from '../prisma'
import { ProjectService, CreateProjectSchema, UpdateProjectSchema } from './project.service'
const tx = { project: { findFirst: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn() } }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async operation => (operation as (db: unknown) => Promise<unknown>)(tx) as never)
  tx.project.findFirst.mockResolvedValue({ id: 'p1', semestre: 'ano' })
  tx.project.findUniqueOrThrow.mockResolvedValue({ id: 'p1' })
})
describe('Ano do AMS', () => {
  it('aceita apenas 1º/2º ou vazio, sem reutilizar termo nem ano calendário', () => {
    expect(CreateProjectSchema.parse({ tenantId: 't1', name: 'Turma', semestre: 'ano', anoAms: '1', ano: 2026 })).toMatchObject({ anoAms: '1', ano: 2026 })
    expect(UpdateProjectSchema.safeParse({ anoAms: '3' }).success).toBe(false)
    expect(UpdateProjectSchema.parse({ anoAms: null })).toEqual({ anoAms: null })
  })
  it('salva ano AMS sem mudar o calendário e preserva escopo de instituição', async () => {
    await new ProjectService().update('p1', 't1', { anoAms: '2' })
    expect(tx.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'p1', tenantId: 't1', deletedAt: null } }))
    expect(tx.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ anoAms: '2' }) }))
    expect(tx.project.update.mock.calls[0][0].data).not.toHaveProperty('ano')
    expect(tx.project.update.mock.calls[0][0].data).not.toHaveProperty('termo')
  })
  it('trocar para semestre limpa o ano AMS', async () => {
    await new ProjectService().update('p1', 't1', { semestre: '1' })
    expect(tx.project.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ semestre: '1', anoAms: null }) }))
  })
  it('rejeita ano AMS em projeto semestral mesmo fora do formulário', async () => {
    tx.project.findFirst.mockResolvedValue({ id: 'p1', semestre: '2' })
    await expect(new ProjectService().update('p1', 't1', { anoAms: '1' })).rejects.toThrow('Ano do AMS só pode ser informado no período Ano')
    expect(tx.project.update).not.toHaveBeenCalled()
  })
})

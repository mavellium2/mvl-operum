// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const db = vi.hoisted(() => ({ role: { findMany: vi.fn(), update: vi.fn(), upsert: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ default: db }))

import { garantirFuncao } from '@/services/funcoesCatalogo'

beforeEach(() => { vi.clearAllMocks(); db.role.upsert.mockImplementation(({ create }: { create: unknown }) => create) })

describe('função do catálogo para um nome', () => {
  it('reaproveita a equivalente ativa (acento, caixa, plural)', async () => {
    db.role.findMany.mockResolvedValue([{ id: 'r1', name: 'Redatora', deletedAt: null }])
    expect(await garantirFuncao('t1', 'redatoras')).toMatchObject({ id: 'r1' })
    expect(db.role.upsert).not.toHaveBeenCalled()
  })
  it('restaura a equivalente excluída em vez de criar outra', async () => {
    db.role.findMany.mockResolvedValue([{ id: 'r2', name: 'Tech Lead', deletedAt: new Date() }])
    await garantirFuncao('t1', 'Tech Lead')
    expect(db.role.update).toHaveBeenCalledWith({ where: { id: 'r2' }, data: { deletedAt: null } })
  })
  it('"Gerente de Projetos" usa o papel de gerente do sistema, sem criar outro', async () => {
    await garantirFuncao('t1', 'Gerente de Projetos')
    expect(db.role.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { nameKey_tenantId_scope: { nameKey: 'gerente', tenantId: 't1', scope: 'PROJETO' } },
    }))
    expect(db.role.findMany).not.toHaveBeenCalled()
  })
  it('sem equivalente, cria uma função só', async () => {
    db.role.findMany.mockResolvedValue([])
    await garantirFuncao('t1', 'Full-stack')
    expect(db.role.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { tenantId: 't1', name: 'Full-stack', nameKey: 'full-stack', scope: 'TENANT' } }))
  })
})

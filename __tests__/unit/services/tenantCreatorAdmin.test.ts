// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ tenant: { findUnique: vi.fn(), create: vi.fn() }, user: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() }, $transaction: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ default: db }))
vi.mock('@/services/auditoriaService', () => ({ registrarAcao: vi.fn() }))
import { createTenant } from '@/services/tenantService'
import { registrarAcao } from '@/services/auditoriaService'
beforeEach(() => {
  vi.resetAllMocks()
  db.$transaction.mockImplementation(async callback => callback(db))
  db.user.findUnique.mockResolvedValue({ id: 'creator', tenantId: 'origin', name: 'Nome', email: 'email@example.com', passwordHash: 'hash', identityId: null, platformOperator: true, isActive: true, deletedAt: null })
  db.tenant.create.mockResolvedValue({ id: 'new', name: 'Nova', subdomain: 'nova' })
})
it('cria o administrador e vincula a identidade na mesma transação da instituição', async () => {
  await createTenant({ name: 'Nova', subdomain: 'nova' }, 'creator')
  expect(db.$transaction).toHaveBeenCalledTimes(1)
  expect(db.user.create).toHaveBeenCalledWith({ data: { tenantId: 'new', name: 'Nome', email: 'email@example.com', passwordHash: 'hash', identityId: 'creator', role: 'admin' } })
  expect(db.user.update).toHaveBeenCalledWith({ where: { id: 'creator' }, data: { identityId: 'creator' } })
  expect(registrarAcao).toHaveBeenCalledTimes(2)
})
it('propaga falha ao criar vínculo para abortar a transação, sem sucesso parcial', async () => {
  db.user.create.mockRejectedValue(new Error('falha de vínculo'))
  await expect(createTenant({ name: 'Nova', subdomain: 'nova' }, 'creator')).rejects.toThrow('falha de vínculo')
  expect(registrarAcao).not.toHaveBeenCalled()
})
it('confere novamente o privilégio do criador antes de criar o ambiente', async () => {
  db.user.findUnique.mockResolvedValue({ platformOperator: false, isActive: true })
  await expect(createTenant({ name: 'Nova', subdomain: 'nova' }, 'creator')).rejects.toThrow('Acesso restrito')
  expect(db.tenant.create).not.toHaveBeenCalled()
})

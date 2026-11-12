// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockProjectStakeholder = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('../prisma', () => ({
  prisma: {
    stakeholder: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    projectStakeholder: mockProjectStakeholder,
    userProject: { findFirst: vi.fn() },
  },
}))

vi.mock('../common/tenant-scope', () => ({ assertProjectInTenant: vi.fn() }))

import { ConflictException, NotFoundException } from '@nestjs/common'
import { assertProjectInTenant } from '../common/tenant-scope'
import { StakeholderService, UpdateStakeholderSchema } from './stakeholder.service'

const assertProjectMock = assertProjectInTenant as unknown as ReturnType<typeof vi.fn>

describe('StakeholderService', () => {
  let service: StakeholderService

  beforeEach(() => {
    vi.clearAllMocks()
    assertProjectMock.mockResolvedValue(undefined)
    service = new StakeholderService()
  })

  describe('listByProject', () => {
    it('busca ProjectStakeholders ordenados pelo campo order (asc)', async () => {
      mockProjectStakeholder.findMany.mockResolvedValue([])

      await service.listByProject('p1', 't1')

      expect(mockProjectStakeholder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'p1' },
          orderBy: { order: 'asc' },
        }),
      )
    })
  })

  describe('reorderStakeholders', () => {
    it('atualiza o campo order de cada stakeholder conforme posição no array', async () => {
      mockProjectStakeholder.updateMany.mockResolvedValue({ count: 1 })

      await service.reorderStakeholders('p1', 't1', ['sk2', 'sk1'])

      expect(mockProjectStakeholder.updateMany).toHaveBeenCalledTimes(2)
      expect(mockProjectStakeholder.updateMany).toHaveBeenNthCalledWith(1,
        { where: { projectId: 'p1', stakeholderId: 'sk2' }, data: { order: 0 } },
      )
      expect(mockProjectStakeholder.updateMany).toHaveBeenNthCalledWith(2,
        { where: { projectId: 'p1', stakeholderId: 'sk1' }, data: { order: 1 } },
      )
    })

    it('não faz nenhuma chamada ao banco quando orderedIds está vazio', async () => {
      await service.reorderStakeholders('p1', 't1', [])

      expect(mockProjectStakeholder.updateMany).not.toHaveBeenCalled()
    })
  })

  describe('escopo por tenant', () => {
    it('listByProject/reorder/linkProject respondem 404 para projeto de outro tenant', async () => {
      assertProjectMock.mockRejectedValue(new NotFoundException())
      const db = (await import('../prisma')).prisma as unknown as { stakeholder: { findFirst: ReturnType<typeof vi.fn> } }
      db.stakeholder.findFirst.mockResolvedValue({ id: 'sk1', tenantId: 't1' })

      await expect(service.listByProject('p-outro', 't1')).rejects.toThrow(NotFoundException)
      await expect(service.reorderStakeholders('p-outro', 't1', ['sk1'])).rejects.toThrow(NotFoundException)
      await expect(service.linkProject('sk1', 'p-outro', 't1')).rejects.toThrow(NotFoundException)

      expect(mockProjectStakeholder.findMany).not.toHaveBeenCalled()
      expect(mockProjectStakeholder.updateMany).not.toHaveBeenCalled()
      expect(mockProjectStakeholder.upsert).not.toHaveBeenCalled()
    })
  })

  describe('uma pessoa: interna ou externa em cada projeto', () => {
    it('não vincula como externo o contato de quem já é membro ativo do projeto', async () => {
      const db = (await import('../prisma')).prisma as unknown as { stakeholder: { findFirst: ReturnType<typeof vi.fn> }; userProject: { findFirst: ReturnType<typeof vi.fn> } }
      db.stakeholder.findFirst.mockResolvedValue({ id: 'sk1', tenantId: 't1', userId: 'u1' })
      db.userProject.findFirst.mockResolvedValue({ id: 'up1' })
      await expect(service.linkProject('sk1', 'p1', 't1')).rejects.toThrow(ConflictException)
      expect(db.userProject.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', userId: 'u1', active: true } }))
      expect(mockProjectStakeholder.upsert).not.toHaveBeenCalled()
    })
    it('contato sem conta, ou conta fora da equipe, vincula normalmente', async () => {
      const db = (await import('../prisma')).prisma as unknown as { stakeholder: { findFirst: ReturnType<typeof vi.fn> }; userProject: { findFirst: ReturnType<typeof vi.fn> } }
      db.stakeholder.findFirst.mockResolvedValue({ id: 'sk1', tenantId: 't1', userId: 'u1' })
      db.userProject.findFirst.mockResolvedValue(null)
      mockProjectStakeholder.upsert.mockResolvedValue({ id: 'ps1' })
      await service.linkProject('sk1', 'p1', 't1')
      expect(mockProjectStakeholder.upsert).toHaveBeenCalled()
    })
  })

  describe('inativação com motivo', () => {
    it('inativar exige o motivo (schema)', () => {
      expect(UpdateStakeholderSchema.safeParse({ isActive: false }).success).toBe(false)
      expect(UpdateStakeholderSchema.safeParse({ isActive: false, inactiveReason: '  ' }).success).toBe(false)
      expect(UpdateStakeholderSchema.safeParse({ isActive: false, inactiveReason: 'Saiu do projeto' }).success).toBe(true)
      expect(UpdateStakeholderSchema.safeParse({ isActive: true }).success).toBe(true)
      expect(UpdateStakeholderSchema.safeParse({ name: 'Ana' }).success).toBe(true)
    })

    it('inativa gravando motivo e data', async () => {
      const { prisma } = await import('../prisma')
      const p = prisma as unknown as { stakeholder: Record<string, ReturnType<typeof vi.fn>> }
      p.stakeholder.findFirst.mockResolvedValue({ id: 'sk1' })
      p.stakeholder.update.mockResolvedValue({})
      await service.update('sk1', 't1', { isActive: false, inactiveReason: 'Saiu do projeto' })
      expect(p.stakeholder.update).toHaveBeenCalledWith({
        where: { id: 'sk1' },
        data: { isActive: false, inactiveReason: 'Saiu do projeto', inactivatedAt: expect.any(Date) },
      })
    })

    it('reativar limpa motivo e data', async () => {
      const { prisma } = await import('../prisma')
      const p = prisma as unknown as { stakeholder: Record<string, ReturnType<typeof vi.fn>> }
      p.stakeholder.findFirst.mockResolvedValue({ id: 'sk1' })
      p.stakeholder.update.mockResolvedValue({})
      await service.update('sk1', 't1', { isActive: true })
      expect(p.stakeholder.update).toHaveBeenCalledWith({
        where: { id: 'sk1' },
        data: { isActive: true, inactiveReason: null, inactivatedAt: null },
      })
    })

    it('editar dados sem mexer em isActive não altera o estado de ativação', async () => {
      const { prisma } = await import('../prisma')
      const p = prisma as unknown as { stakeholder: Record<string, ReturnType<typeof vi.fn>> }
      p.stakeholder.findFirst.mockResolvedValue({ id: 'sk1' })
      p.stakeholder.update.mockResolvedValue({})
      await service.update('sk1', 't1', { name: 'Novo nome' })
      expect(p.stakeholder.update).toHaveBeenCalledWith({ where: { id: 'sk1' }, data: { name: 'Novo nome' } })
    })
  })
})

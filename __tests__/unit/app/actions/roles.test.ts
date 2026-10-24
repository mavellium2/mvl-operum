// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  rolesApi: {
    create: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    assignPermission: vi.fn(),
    removePermission: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  default: {
    projetoFuncao: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    role: { findFirst: vi.fn().mockResolvedValue({ id: 'r1' }) },
  },
}))

import { verifySession } from '@/lib/dal'
import { rolesApi } from '@/lib/api-client'
import {
  createRoleAction,
  getRolesAction,
  updateRoleAction,
  assignPermissionAction,
  removePermissionAction,
  getOrCreateRoleAction,
  updateRoleNameAction,
  deleteRoleAction,
} from '@/app/actions/roles'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Role Actions', () => {
  describe('createRoleAction', () => {
    it('should create role and return success', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.create).mockResolvedValue({ id: 'r1', name: 'Admin', scope: 'TENANT' })

      const result = await createRoleAction({}, { name: 'Admin', scope: 'TENANT' })
      expect(result).toHaveProperty('role')
      expect(result.role?.name).toBe('Admin')
    })

    it('should return error on validation failure', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.create).mockRejectedValue(new Error('Validation error'))

      const result = await createRoleAction({}, { name: '', scope: 'TENANT' })
      expect(result).toHaveProperty('error')
    })
  })

  describe('getRolesAction', () => {
    it('should return list of roles for tenant', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'member' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.list).mockResolvedValue([
        { id: 'r1', name: 'Admin' },
        { id: 'r2', name: 'Member' },
      ])

      const result = await getRolesAction()
      expect(Array.isArray(result)).toBe(true)
      expect(result).toHaveLength(2)
    })

    it('should return empty array on error', async () => {
      vi.mocked(verifySession).mockRejectedValue(new Error('Auth error'))

      const result = await getRolesAction()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('updateRoleAction', () => {
    it('should update role and return success', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.update).mockResolvedValue({ id: 'r1', name: 'Super Admin' })

      const result = await updateRoleAction({}, 'r1', { name: 'Super Admin' })
      expect(result).toHaveProperty('role')
    })

    it('should return error on update failure', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.update).mockRejectedValue(new Error('Not found'))

      const result = await updateRoleAction({}, 'nonexistent', { name: 'Test' })
      expect(result).toHaveProperty('error')
    })
  })

  describe('assignPermissionAction', () => {
    it('should assign permission and return success', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.assignPermission).mockResolvedValue(undefined)

      const result = await assignPermissionAction('r1', 'p1')
      expect(result).toHaveProperty('success')
      expect(result.success).toBe(true)
    })

    it('should return error if already assigned', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.assignPermission).mockRejectedValue(new Error('Already assigned'))

      const result = await assignPermissionAction('r1', 'p1')
      expect(result).toHaveProperty('error')
    })
  })

  describe('removePermissionAction', () => {
    it('should remove permission and return success', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.removePermission).mockResolvedValue(undefined)

      const result = await removePermissionAction('r1', 'p1')
      expect(result).toHaveProperty('success')
      expect(result.success).toBe(true)
    })

    it('should return error if not found', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.removePermission).mockRejectedValue(new Error('Not found'))

      const result = await removePermissionAction('r1', 'p1')
      expect(result).toHaveProperty('error')
    })
  })

  describe('getOrCreateRoleAction', () => {
    it('should return role on success', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.list).mockResolvedValue([])
      vi.mocked(rolesApi.create).mockResolvedValue({ id: 'r1', name: 'TI' })

      const result = await getOrCreateRoleAction('TI')
      expect(result).toHaveProperty('role')
      expect((result as { role?: { name: string } }).role?.name).toBe('TI')
    })

    it('should return error on failure', async () => {
      vi.mocked(verifySession).mockRejectedValue(new Error('Auth error'))

      const result = await getOrCreateRoleAction('TI')
      expect(result).toHaveProperty('error')
    })

    it('devolve a função equivalente em vez de criar duplicata (plural/acento)', async () => {
      vi.mocked(verifySession).mockResolvedValue({ userId: 'u1', tenantId: 't1', role: 'admin' } as never)
      vi.mocked(rolesApi.list).mockResolvedValue([{ id: 'g', name: 'Gerente de Projeto' }])

      const result = await getOrCreateRoleAction('Gerente de Projetos')
      expect((result as { role?: { id: string } }).role?.id).toBe('g')
      expect(rolesApi.create).not.toHaveBeenCalled()
    })
  })

  describe('updateRoleNameAction', () => {
    it('should update role name and return role', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.list).mockResolvedValue([])
      vi.mocked(rolesApi.update).mockResolvedValue({ id: 'r1', name: 'Technology' })

      const result = await updateRoleNameAction('r1', 'Technology')
      expect(result).toHaveProperty('role')
      expect((result as { role?: { name: string } }).role?.name).toBe('Technology')
    })

    it('should return error on failure', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.update).mockRejectedValue(new Error('Not found'))

      const result = await updateRoleNameAction('nonexistent', 'X')
      expect(result).toHaveProperty('error')
    })

    it('recusa renomear para um nome equivalente a outra função', async () => {
      vi.mocked(verifySession).mockResolvedValue({ userId: 'u1', tenantId: 't1', role: 'admin' } as never)
      vi.mocked(rolesApi.list).mockResolvedValue([
        { id: 'g', name: 'Gerente de Projeto' },
        { id: 'a', name: 'Analista' },
      ])

      const result = await updateRoleNameAction('a', 'gerente de projetos')
      expect((result as { error?: string }).error).toMatch(/Já existe a função "Gerente de Projeto"/)
      expect(rolesApi.update).not.toHaveBeenCalled()
    })
  })

  describe('deleteRoleAction', () => {
    it('should soft-delete role and return success', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.delete).mockResolvedValue(undefined)

      const result = await deleteRoleAction('r1')
      expect(result).toHaveProperty('success')
      expect((result as { success?: boolean }).success).toBe(true)
    })

    it('membro ou função de outra instituição não apaga vínculos (auditoria 24/10)', async () => {
      const prisma = (await import('@/lib/prisma')).default as unknown as { role: { findFirst: ReturnType<typeof vi.fn> }; projetoFuncao: { deleteMany: ReturnType<typeof vi.fn> } }
      vi.mocked(verifySession).mockResolvedValue({ userId: 'u1', tenantId: 't1', role: 'member' })
      expect(await deleteRoleAction('r1')).toEqual({ error: 'Acesso restrito a administradores' })
      vi.mocked(verifySession).mockResolvedValue({ userId: 'u1', tenantId: 't1', role: 'admin' })
      prisma.role.findFirst.mockResolvedValueOnce(null)
      expect(await deleteRoleAction('r-outra')).toEqual({ error: 'Função não encontrada' })
      expect(prisma.projetoFuncao.deleteMany).not.toHaveBeenCalled()
    })

    it('should return error on failure', async () => {
      const mockSession = { userId: 'u1', tenantId: 't1', role: 'admin' }
      vi.mocked(verifySession).mockResolvedValue(mockSession)
      vi.mocked(rolesApi.delete).mockRejectedValue(new Error('Not found'))

      const result = await deleteRoleAction('nonexistent')
      expect(result).toHaveProperty('error')
    })
  })
})

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundException } from '@nestjs/common'

vi.mock('../prisma', () => ({
  prisma: {
    project: { findFirst: vi.fn() },
    userProject: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    department: { findFirst: vi.fn() },
  },
}))

vi.mock('../common/tenant-scope', () => ({ assertUserInTenant: vi.fn() }))

import { prisma } from '../prisma'
import { assertUserInTenant } from '../common/tenant-scope'
import { ProjectService, UpdateProjectSchema, AddMemberSchema } from './project.service'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const assertUser = assertUserInTenant as unknown as ReturnType<typeof vi.fn>

describe('ProjectService.addMember', () => {
  let service: ProjectService

  beforeEach(() => {
    vi.clearAllMocks()
    db.project.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' })
    assertUser.mockResolvedValue(undefined)
    service = new ProjectService()
  })

  it('rejeita (404) usuário de outro tenant como membro', async () => {
    assertUser.mockRejectedValue(new NotFoundException())
    await expect(service.addMember('p1', 't1', 'u-outro', {})).rejects.toThrow(NotFoundException)
    expect(db.userProject.upsert).not.toHaveBeenCalled()
  })

  it('adiciona usuário do mesmo tenant', async () => {
    db.userProject.upsert.mockResolvedValue({})
    await service.addMember('p1', 't1', 'u1', { role: 'dev' })
    expect(assertUser).toHaveBeenCalledWith('u1', 't1')
    expect(db.userProject.upsert).toHaveBeenCalled()
  })

  it('corpo não troca o projeto nem o estado do vínculo (atribuição em massa)', async () => {
    db.userProject.upsert.mockResolvedValue({})
    const { userId, ...data } = AddMemberSchema.parse({ userId: 'u1', role: 'dev', projectId: 'p-outro', active: false, order: 99, tenantId: 't2' })
    await service.addMember('p1', 't1', userId, data)
    const args = db.userProject.upsert.mock.calls[0][0]
    expect(args.create).toEqual({ role: 'dev', userId: 'u1', projectId: 'p1' })
    expect(args.update).toEqual({ role: 'dev', active: true, inactiveReason: null, inactivatedAt: null })
  })

  it('departamento de outra instituição é recusado', async () => {
    db.department.findFirst.mockResolvedValue(null)
    await expect(service.addMember('p1', 't1', 'u1', { departmentId: 'd-outro' })).rejects.toThrow()
    expect(db.department.findFirst).toHaveBeenCalledWith({ where: { id: 'd-outro', tenantId: 't1' }, select: { id: true } })
    expect(db.userProject.upsert).not.toHaveBeenCalled()
  })
})

describe('ProjectService.setMemberSituacao', () => {
  let service: ProjectService

  beforeEach(() => {
    vi.clearAllMocks()
    db.project.findFirst.mockResolvedValue({ id: 'p1', tenantId: 't1' })
    db.userProject.findUnique.mockResolvedValue({ id: 'up1', active: true })
    db.userProject.update.mockResolvedValue({})
    service = new ProjectService()
  })

  it('inativa com motivo: perde o acesso (active false) e guarda motivo e data', async () => {
    await service.setMemberSituacao('p1', 't1', 'u1', false, '  Saiu da equipe  ')
    const data = db.userProject.update.mock.calls[0][0].data
    expect(data).toMatchObject({ active: false, inactiveReason: 'Saiu da equipe' })
    expect(data.inactivatedAt).toBeInstanceOf(Date)
    expect(data.endDate).toBeInstanceOf(Date)
  })

  it('recusa inativar sem motivo ou membro que já não está ativo', async () => {
    await expect(service.setMemberSituacao('p1', 't1', 'u1', false, ' a ')).rejects.toThrow('Informe o motivo')
    db.userProject.findUnique.mockResolvedValue({ id: 'up1', active: false })
    await expect(service.setMemberSituacao('p1', 't1', 'u1', false, 'Saiu da equipe')).rejects.toThrow('não está ativo')
    expect(db.userProject.update).not.toHaveBeenCalled()
  })

  it('reativa limpando motivo, data e fim do vínculo', async () => {
    db.userProject.findUnique.mockResolvedValue({ id: 'up1', active: false, inactiveReason: 'x' })
    await service.setMemberSituacao('p1', 't1', 'u1', true)
    expect(db.userProject.update.mock.calls[0][0].data).toEqual({ active: true, endDate: null, inactiveReason: null, inactivatedAt: null })
  })

  it('404 para quem nunca foi membro e para projeto de outro tenant', async () => {
    db.userProject.findUnique.mockResolvedValue(null)
    await expect(service.setMemberSituacao('p1', 't1', 'u9', false, 'motivo')).rejects.toThrow(NotFoundException)
    db.project.findFirst.mockResolvedValue(null)
    await expect(service.setMemberSituacao('p1', 't2', 'u1', true)).rejects.toThrow(NotFoundException)
  })

  it('desvincular limpa o motivo, para o membro sair também de Stakeholders', async () => {
    await service.removeMember('p1', 't1', 'u1')
    expect(db.userProject.update.mock.calls[0][0].data).toEqual({ active: false, inactiveReason: null, inactivatedAt: null })
  })
})

describe('UpdateProjectSchema', () => {
  it('aceita mudança de status (usado para arquivar projeto)', () => {
    expect(UpdateProjectSchema.parse({ status: 'ARCHIVED' })).toEqual({ status: 'ARCHIVED' })
    expect(UpdateProjectSchema.safeParse({ status: 'APAGADO' }).success).toBe(false)
  })
})

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConflictException, NotFoundException } from '@nestjs/common'

vi.mock('../prisma', () => ({
  prisma: {
    project: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    userProject: { upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    department: { findFirst: vi.fn() },
    projectStakeholder: { findFirst: vi.fn() },
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
    db.projectStakeholder.findFirst.mockResolvedValue(null)
    assertUser.mockResolvedValue(undefined)
    service = new ProjectService()
  })

  it('recusa (409) quem já é externo neste projeto: a troca é por "Mudar para interno"', async () => {
    db.projectStakeholder.findFirst.mockResolvedValue({ id: 'ps1' })
    await expect(service.addMember('p1', 't1', 'u1', {})).rejects.toThrow(ConflictException)
    expect(db.projectStakeholder.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { projectId: 'p1', stakeholder: { userId: 'u1' } } }))
    expect(db.userProject.upsert).not.toHaveBeenCalled()
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


describe('ProjectService.list — situações e recentes do usuário', () => {
  beforeEach(() => { vi.clearAllMocks(); db.project.findMany.mockResolvedValue([]); db.project.findFirst.mockResolvedValue(null); db.project.count.mockResolvedValue(0) })
  it('recentes ativos vêm primeiro, na ordem em que o usuário os abriu, dentro do tenant e das permissões', async () => {
    db.project.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    // Ordem de criação: Janus, Operum, Fechai. O usuário abriu Fechai, depois Janus, depois Operum.
    db.project.findMany.mockResolvedValueOnce([{ id: 'janus' }, { id: 'fechai' }, { id: 'operum' }])
    const result = await new ProjectService().list('t1', 1, 9, ['janus', 'operum', 'fechai'], ['operum', 'janus', 'fechai'])
    expect(result.items.map(p => p.id)).toEqual(['operum', 'janus', 'fechai'])
    expect(db.project.findMany.mock.calls[0][0]).toMatchObject({ where: { AND: [{ tenantId: 't1', deletedAt: null, id: { in: ['janus', 'operum', 'fechai'] }, status: 'ACTIVE' }, { id: { in: ['operum', 'janus', 'fechai'] } }] } })
  })
  it('os nunca abertos vêm depois dos recentes, sem repetir', async () => {
    db.project.count.mockResolvedValueOnce(3).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    db.project.findMany.mockResolvedValueOnce([{ id: 'fechai' }]).mockResolvedValueOnce([{ id: 'janus' }, { id: 'operum' }])
    const result = await new ProjectService().list('t1', 1, 9, undefined, ['fechai', 'excluido'])
    expect(result.items.map(p => p.id)).toEqual(['fechai', 'janus', 'operum'])
    expect(db.project.findMany.mock.calls[1][0]).toMatchObject({ where: { AND: [{ status: 'ACTIVE' }, { id: { notIn: ['fechai'] } }] }, skip: 0, take: 2 })
  })
  it('pagina dentro dos recentes e continua no resto do grupo', async () => {
    db.project.count.mockResolvedValueOnce(5).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
    db.project.findMany.mockResolvedValueOnce([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]).mockResolvedValueOnce([{ id: 'x1' }])
    const result = await new ProjectService().list('t1', 2, 2, undefined, ['r1', 'r2', 'r3'])
    expect(result.items.map(p => p.id)).toEqual(['r3', 'x1'])
    expect(db.project.findMany.mock.calls[1][0]).toMatchObject({ skip: 0, take: 1 })
  })
  it('pagina cruzando situações, sem repetir o ativo fixado', async () => {
    db.project.count.mockResolvedValueOnce(2).mockResolvedValueOnce(2).mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    db.project.findMany.mockResolvedValueOnce([{ id: 'a2' }]).mockResolvedValueOnce([{ id: 'c2' }]).mockResolvedValueOnce([{ id: 'i1' }])
    const result = await new ProjectService().list('t1', 2, 3, undefined, ['a2'])
    expect(result.items.map(p => p.id)).toEqual(['c2', 'i1'])
    expect(db.project.findMany.mock.calls[1][0]).toMatchObject({ where: { status: 'COMPLETED' }, skip: 1, take: 1 })
    expect(db.project.findMany.mock.calls[2][0]).toMatchObject({ where: { status: 'INACTIVE' }, skip: 0, take: 1 })
  })
  it('combina pesquisa e situação em todos os resultados', async () => {
    db.project.count.mockResolvedValueOnce(1)
    db.project.findMany.mockResolvedValueOnce([{ id: 'c1' }])
    const result = await new ProjectService().list('t1', 1, 9, undefined, ['a2'], 'concl', 'COMPLETED')
    expect(result.items.map(p => p.id)).toEqual(['c1'])
    // Filtro de situação sem "ativos": os recentes não são buscados.
    expect(db.project.findMany).toHaveBeenCalledTimes(1)
    expect(db.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 't1', status: 'COMPLETED', OR: [{ name: { contains: 'concl', mode: 'insensitive' } }, { slogan: { contains: 'concl', mode: 'insensitive' } }] }) }))
  })
  it('não coloca concluídos ou inativos antes dos ativos', async () => {
    db.project.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(1)
    // 1ª consulta: recentes ativos (o inativo aberto por último não entra).
    db.project.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'a1' }]).mockResolvedValueOnce([{ id: 'c1' }]).mockResolvedValueOnce([{ id: 'i1' }])
    const result = await new ProjectService().list('t1', 1, 9, undefined, ['i1'])
    expect(result.items.map(p => p.id)).toEqual(['a1', 'c1', 'i1'])
  })
})

// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'

vi.mock('../prisma', () => ({
  prisma: {
    card: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    sprint: { findUnique: vi.fn(), findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    sprintColumn: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    cardMovement: { create: vi.fn(), findMany: vi.fn() },
    cardTag: { upsert: vi.fn(), delete: vi.fn() },
    cardResponsible: { upsert: vi.fn(), delete: vi.fn(), count: vi.fn() },
    tag: { delete: vi.fn(), findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('../common/tenant-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../common/tenant-scope')>()
  return {
    ...actual,
    assertProject: vi.fn(),
    assertSprint: vi.fn(),
    assertColumn: vi.fn(),
    assertCard: vi.fn(),
    assertTag: vi.fn(),
    assertUserInTenant: vi.fn(),
  }
})

import { prisma } from '../prisma'
import * as scope from '../common/tenant-scope'
import { CardService, CardsInTenantSchema, UpdateCardSchema } from './card.service'

const db = prisma as unknown as {
  $transaction: ReturnType<typeof vi.fn>
  card: Record<string, ReturnType<typeof vi.fn>>
  project: Record<string, ReturnType<typeof vi.fn>>
  user: Record<string, ReturnType<typeof vi.fn>>
  sprint: Record<string, ReturnType<typeof vi.fn>>
  sprintColumn: Record<string, ReturnType<typeof vi.fn>>
  cardResponsible: Record<string, ReturnType<typeof vi.fn>>
  cardTag: Record<string, ReturnType<typeof vi.fn>>
  tag: Record<string, ReturnType<typeof vi.fn>>
  cardMovement: Record<string, ReturnType<typeof vi.fn>>
}
const assert = scope as unknown as Record<string, ReturnType<typeof vi.fn>>

const notFound = () => Promise.reject(new NotFoundException())

let service: CardService

beforeEach(() => {
  vi.resetAllMocks()
  db.$transaction.mockImplementation(async callback => callback(prisma))
  db.project.findFirst.mockResolvedValue({ id: 'p1' })
  db.user.findFirst.mockResolvedValue({ id: 'u1' })
  db.sprint.findFirst.mockResolvedValue({ id: 's1', projectId: 'p1', name: 'Sprint' })
  db.sprintColumn.findFirst.mockResolvedValue({ id: 'col', title: 'Coluna' })
  db.card.findMany.mockResolvedValue([])
  db.card.findUniqueOrThrow.mockResolvedValue({})
  db.sprintColumn.findMany.mockResolvedValue([])
  db.cardResponsible.count.mockResolvedValue(1)
  for (const fn of ['assertProject', 'assertSprint', 'assertColumn', 'assertCard', 'assertTag', 'assertUserInTenant']) {
    assert[fn].mockResolvedValue(undefined)
  }
  service = new CardService()
})

describe('CardService — leitura escopada por tenant', () => {
  it('findOne filtra pelo tenant (backlog ou sprint) e responde 404 fora dele', async () => {
    db.card.findFirst.mockResolvedValue(null)
    await expect(service.findOne('t1', 'card-b')).rejects.toThrow(NotFoundException)
    expect(db.card.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'card-b', ...scope.cardInTenant('t1') })
  })

  it('não expõe a linha User inteira dos responsáveis', async () => {
    db.card.findFirst.mockResolvedValue({ id: 'c1' })
    await service.findOne('t1', 'c1')
    expect(db.card.findFirst.mock.calls[0][0].include.responsibles).toEqual({
      include: { user: { select: { id: true, name: true, email: true } } },
    })
  })

  it('listBySprint e listBacklog validam sprint/projeto antes de listar', async () => {
    assert.assertSprint.mockImplementation(notFound)
    await expect(service.listBySprint('t1', 's-outro')).rejects.toThrow(NotFoundException)
    assert.assertProject.mockImplementation(notFound)
    await expect(service.listBacklog('t1', 'p-outro')).rejects.toThrow(NotFoundException)
    expect(db.card.findMany).not.toHaveBeenCalled()
  })

  it('search sempre inclui o filtro de tenant (primeiro item do AND)', async () => {
    db.card.findMany.mockResolvedValue([])
    await service.search('t1', 'bug')
    expect(db.card.findMany.mock.calls[0][0].where.AND[0]).toEqual(scope.cardInTenant('t1'))
  })

  it('search por projeto acha cards do backlog e de sprints do projeto', async () => {
    db.card.findMany.mockResolvedValue([])
    await service.search('t1', 'bug', { inProjectId: 'p1' })
    expect(db.card.findMany.mock.calls[0][0].where.AND).toContainEqual({
      OR: [{ projectId: 'p1' }, { sprint: { projectId: 'p1' } }],
    })
  })

  it('search sem texto (cards de uma pessoa) não filtra por título', async () => {
    db.card.findMany.mockResolvedValue([])
    await service.search('t1', '', { inProjectId: 'p1', responsibleUserId: 'u1' })
    const where = db.card.findMany.mock.calls[0][0].where
    expect(where.AND).toHaveLength(2)
    expect(where.responsibles).toEqual({ some: { userId: 'u1' } })
  })
})

describe('CardService — escrita escopada por tenant', () => {
  it('create exige projectId ou sprintId', async () => {
    await expect(service.create('t1', { title: 'x' })).rejects.toThrow(BadRequestException)
    expect(db.card.create).not.toHaveBeenCalled()
  })

  it('create rejeita projeto de outro tenant', async () => {
    assert.assertProject.mockImplementation(notFound)
    await expect(service.create('t1', { title: 'x', projectId: 'p-outro' })).rejects.toThrow(NotFoundException)
    expect(db.card.create).not.toHaveBeenCalled()
  })

  it('create exige que a coluna pertença à sprint informada', async () => {
    await expect(service.create('t1', { title: 'x', projectId: 'p1', sprintColumnId: 'c1' })).rejects.toThrow(
      BadRequestException,
    )
    assert.assertColumn.mockImplementation(notFound)
    await expect(service.create('t1', { title: 'x', sprintId: 's1', sprintColumnId: 'c-outra' })).rejects.toThrow(
      NotFoundException,
    )
    expect(db.card.create).not.toHaveBeenCalled()
  })

  it('update não altera card de outro tenant', async () => {
    db.card.findFirst.mockResolvedValue(null)
    await expect(service.update('t1', 'card-b', { title: 'hack' })).rejects.toThrow(NotFoundException)
    expect(db.card.update).not.toHaveBeenCalled()
  })

  it('update impede mover o card para sprint de outro tenant', async () => {
    db.card.findFirst.mockResolvedValue({ id: 'c1', projectId: 'p1', sprintId: null, sprintColumnId: null })
    db.sprint.findFirst.mockResolvedValue(null)
    await expect(service.update('t1', 'c1', { sprintId: 's-outra' })).rejects.toThrow(NotFoundException)
    expect(db.card.update).not.toHaveBeenCalled()
  })

  it('update valida a coluna nova contra a sprint atual do card', async () => {
    db.card.findFirst.mockResolvedValue({ id: 'c1', projectId: 'p1', sprintId: 's1', sprintColumnId: 'c-a' })
    db.card.update.mockResolvedValue({})
    await service.update('t1', 'c1', { sprintColumnId: 'c-b' })
    expect(db.sprintColumn.findFirst.mock.calls[0][0].where).toMatchObject({ id: 'c-b', sprintId: 's1', sprint: { project: { tenantId: 't1' } } })
  })

  it('ao voltar ao backlog, card sem projectId herda o projeto da sprint', async () => {
    db.card.findFirst.mockResolvedValue({ id: 'c1', projectId: null, sprintId: 's1', sprintColumnId: 'c-a' })
    db.sprint.findUnique.mockResolvedValue({ projectId: 'p1' })
    db.card.update.mockResolvedValue({})
    await service.update('t1', 'c1', { sprintId: null, sprintColumnId: null, sprintPosition: null })
    expect(db.card.update.mock.calls[0][0].data).toMatchObject({ projectId: 'p1', sprintId: null })
  })

  it('update com endDate null remove o prazo; sem endDate não mexe', async () => {
    db.card.findFirst.mockResolvedValue({ id: 'c1', projectId: 'p1', sprintId: null, sprintColumnId: null })
    db.card.update.mockResolvedValue({})
    await service.update('t1', 'c1', { endDate: null })
    expect(db.card.update.mock.calls[0][0].data.endDate).toBeNull()
    expect(db.card.update.mock.calls[0][0].data.startDate).toBeUndefined()

    await service.update('t1', 'c1', { endDate: '2026-09-30T23:59:00.000Z' })
    expect(db.card.update.mock.calls[1][0].data.endDate).toEqual(new Date('2026-09-30T23:59:00.000Z'))
  })

  it('mover para o topo renumera a coluna inteira (sem posições repetidas)', async () => {
    db.card.findFirst.mockResolvedValue({ id: 'C', projectId: 'p1', sprintId: 's1', sprintColumnId: 'col' })
    db.card.update.mockImplementation(async (args: { where: { id: string }; data: object }) => ({ id: args.where.id, ...args.data }))
    db.card.findMany.mockResolvedValue([
      { id: 'A', sprintPosition: 0 },
      { id: 'B', sprintPosition: 1 },
    ])

    await service.update('t1', 'C', { sprintColumnId: 'col', sprintPosition: 0 })

    const renumber = db.card.update.mock.calls.slice(1).map(([a]) => [a.where.id, a.data.sprintPosition])
    // C já foi gravado na posição 0 pelo update principal; A e B descem uma posição.
    expect(renumber).toEqual([['C', 0], ['A', 1], ['B', 2]])
    expect(db.card.findMany.mock.calls[0][0].where).toMatchObject({ sprintColumnId: 'col', id: { not: 'C' } })
  })

  it('mudar de coluna renumera também a coluna de origem', async () => {
    db.card.findFirst.mockResolvedValue({ id: 'X', projectId: 'p1', sprintId: 's1', sprintColumnId: 'origem' })
    db.sprintColumn.findUnique.mockResolvedValue({ title: 'col' })
    db.card.update.mockResolvedValue({})
    db.card.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'Y', sprintPosition: 1 }])

    await service.update('t1', 'X', { sprintColumnId: 'destino', sprintPosition: 0 })

    expect(db.card.findMany.mock.calls.map(([a]) => a.where.sprintColumnId)).toEqual(['destino', 'origem'])
    expect(db.card.update).toHaveBeenCalledWith({ where: { id: 'Y' }, data: { sprintPosition: 0 } })
  })

  it('addResponsible rejeita usuário de outro tenant', async () => {
    assert.assertUserInTenant.mockImplementation(notFound)
    await expect(service.addResponsible('t1', 'c1', 'u-outro')).rejects.toThrow(NotFoundException)
    expect(db.cardResponsible.upsert).not.toHaveBeenCalled()
  })

  it('addTag rejeita tag de outro tenant', async () => {
    assert.assertTag.mockImplementation(notFound)
    await expect(service.addTag('t1', 'c1', 'g-outra')).rejects.toThrow(NotFoundException)
    expect(db.cardTag.upsert).not.toHaveBeenCalled()
  })

  it('remove/removeTag/removeResponsible/listMovements validam o card', async () => {
    assert.assertCard.mockImplementation(notFound)
    await expect(service.remove('t1', 'c')).rejects.toThrow(NotFoundException)
    await expect(service.removeTag('t1', 'c', 'g')).rejects.toThrow(NotFoundException)
    await expect(service.removeResponsible('t1', 'c', 'u')).rejects.toThrow(NotFoundException)
    await expect(service.listMovements('t1', 'c')).rejects.toThrow(NotFoundException)
    expect(db.card.update).not.toHaveBeenCalled()
    expect(db.cardTag.delete).not.toHaveBeenCalled()
    expect(db.cardResponsible.delete).not.toHaveBeenCalled()
    expect(db.cardMovement.findMany).not.toHaveBeenCalled()
  })

  it('deleteTag rejeita tag de outro tenant', async () => {
    assert.assertTag.mockImplementation(notFound)
    await expect(service.deleteTag('t1', 'g-outra', { userId: 'u1', isAdmin: false })).rejects.toThrow(NotFoundException)
    expect(db.tag.delete).not.toHaveBeenCalled()
  })

  it('deleteTag: só a dona da etiqueta (ou admin) apaga', async () => {
    assert.assertTag.mockResolvedValue(undefined)
    db.tag.findFirst.mockResolvedValue(null)
    await expect(service.deleteTag('t1', 'g1', { userId: 'u-outra', isAdmin: false })).rejects.toThrow(ForbiddenException)
    expect(db.tag.delete).not.toHaveBeenCalled()
    await service.deleteTag('t1', 'g1', { userId: 'u-admin', isAdmin: true })
    expect(db.tag.delete).toHaveBeenCalledWith({ where: { id: 'g1' } })
  })
})

describe('idsInTenant (conferência do file-service)', () => {
  it('filtra pelo tenant, ignora excluídos e não repete ids na consulta', async () => {
    db.card.findMany.mockResolvedValue([{ id: 'c1' }])
    const r = await new CardService().idsInTenant('t1', ['c1', 'c-outro', 'c1'])
    expect(r).toEqual({ ids: ['c1'] })
    expect(db.card.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c-outro'] }, deletedAt: null, ...scope.cardInTenant('t1') },
      select: { id: true },
    })
  })

  it('lista vazia não consulta o banco', async () => {
    await expect(new CardService().idsInTenant('t1', [])).resolves.toEqual({ ids: [] })
    expect(db.card.findMany).not.toHaveBeenCalled()
  })

  it('o schema recusa campo extra e mais de 500 ids', () => {
    expect(CardsInTenantSchema.safeParse({ ids: ['c1'], tenantId: 'outro' }).success).toBe(false)
    expect(CardsInTenantSchema.safeParse({ ids: Array.from({ length: 501 }, (_, i) => `c${i}`) }).success).toBe(false)
    expect(CardsInTenantSchema.safeParse({ ids: ['c1', 'c2'] }).success).toBe(true)
  })
})


describe('CardService — retry transacional', () => {
  it('repete toda a operação em P2034', async () => {
    db.$transaction.mockRejectedValueOnce({ code: 'P2034' }).mockResolvedValueOnce({ id: 'c1', sprintPosition: 0 })
    expect(await service.update('t1', 'c1', { sprintPosition: 0 })).toMatchObject({ sprintPosition: 0 })
    expect(db.$transaction).toHaveBeenCalledTimes(2)
    expect(db.$transaction.mock.calls.every(call => call[1].isolationLevel === 'Serializable')).toBe(true)
  })
  it('conflito esgotado retorna 409 com retry acionável', async () => {
    db.$transaction.mockRejectedValue({ code: 'P2034' })
    await expect(service.update('t1', 'c1', { sprintPosition: 0 })).rejects.toMatchObject({ status: 409, message: expect.stringContaining('Tente novamente') })
    expect(db.$transaction).toHaveBeenCalledTimes(3)
  })
  it('não repete falha de escrita/validação', async () => {
    const error = new Error('write failed')
    db.$transaction.mockRejectedValue(error)
    await expect(service.update('t1', 'c1', { sprintPosition: 0 })).rejects.toBe(error)
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })
})


it('ids vazios de posicionamento são recusados antes de chegar ao banco', () => {
  for (const field of ['projectId', 'sprintId', 'sprintColumnId']) {
    expect(UpdateCardSchema.safeParse({ [field]: '' }).success).toBe(false)
  }
})

describe('responsável obrigatório a partir de "Em andamento"', () => {
  const colunas = [
    { id: 'todo', title: 'A Fazer', position: 0 },
    { id: 'doing', title: 'Em andamento', position: 1 },
    { id: 'test', title: 'Em teste', position: 2 },
  ]
  beforeEach(() => {
    db.card.findFirst.mockResolvedValue({ id: 'c1', projectId: 'p1', sprintId: 's1', sprintColumnId: 'todo', sprintPosition: 0 })
    db.sprintColumn.findMany.mockResolvedValue(colunas)
  })

  it('recusa mover card sem responsável para "Em andamento" ou depois', async () => {
    db.cardResponsible.count.mockResolvedValue(0)
    db.sprintColumn.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => colunas.find(c => c.id === where.id) ?? null)
    await expect(service.update('t1', 'c1', { sprintColumnId: 'doing' })).rejects.toThrow('Defina um responsável antes de mover o card para "Em andamento".')
    await expect(service.update('t1', 'c1', { sprintColumnId: 'test' })).rejects.toThrow(BadRequestException)
    expect(db.card.update).not.toHaveBeenCalled()
  })

  it('com responsável, move normalmente; sem responsável ainda pode ficar em "A Fazer"', async () => {
    db.sprintColumn.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => colunas.find(c => c.id === where.id) ?? null)
    db.cardResponsible.count.mockResolvedValue(1)
    await service.update('t1', 'c1', { sprintColumnId: 'doing' })
    expect(db.card.update).toHaveBeenCalled()

    db.card.findFirst.mockResolvedValue({ id: 'c1', projectId: 'p1', sprintId: 's1', sprintColumnId: 'doing', sprintPosition: 0 })
    db.cardResponsible.count.mockResolvedValue(0)
    await expect(service.update('t1', 'c1', { sprintColumnId: 'todo' })).resolves.toBeDefined()
  })

  it('não deixa remover o último responsável de card em "Em andamento" ou depois', async () => {
    db.card.findUnique.mockResolvedValue({ sprintId: 's1', sprintColumnId: 'test' })
    db.cardResponsible.count.mockResolvedValue(0)
    await expect(service.removeResponsible('t1', 'c1', 'u1')).rejects.toThrow('precisa de pelo menos um responsável')
    expect(db.cardResponsible.delete).not.toHaveBeenCalled()
  })

  it('remove quando sobra outro responsável, ou quando o card está em "A Fazer"', async () => {
    db.card.findUnique.mockResolvedValue({ sprintId: 's1', sprintColumnId: 'test' })
    db.cardResponsible.count.mockResolvedValue(1)
    await service.removeResponsible('t1', 'c1', 'u1')
    db.card.findUnique.mockResolvedValue({ sprintId: 's1', sprintColumnId: 'todo' })
    db.cardResponsible.count.mockResolvedValue(0)
    await service.removeResponsible('t1', 'c1', 'u1')
    expect(db.cardResponsible.delete).toHaveBeenCalledTimes(2)
  })
})


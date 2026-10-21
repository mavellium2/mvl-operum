// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'

vi.mock('../prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    sprint: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    sprintColumn: { createMany: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    card: { updateMany: vi.fn() },
  },
}))

vi.mock('../common/tenant-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../common/tenant-scope')>()
  return { ...actual, assertProject: vi.fn(), assertColumn: vi.fn() }
})

import { prisma } from '../prisma'
import * as scope from '../common/tenant-scope'
import { SprintService } from './sprint.service'

const db = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>
const assert = scope as unknown as Record<string, ReturnType<typeof vi.fn>>
const notFound = () => Promise.reject(new NotFoundException())

let service: SprintService

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => (callback as (tx: typeof prisma) => Promise<void>)(prisma))
  assert.assertProject.mockResolvedValue(undefined)
  assert.assertColumn.mockResolvedValue(undefined)
  service = new SprintService()
})

describe('SprintService — escopo por tenant', () => {
  it('list filtra pelo tenant do projeto', async () => {
    db.sprint.findMany.mockResolvedValue([])
    await service.list('t1', 'p1')
    expect(db.sprint.findMany.mock.calls[0][0].where).toMatchObject({ projectId: 'p1', project: { tenantId: 't1' } })
  })

  it('findOne responde 404 para sprint de outro tenant', async () => {
    db.sprint.findFirst.mockResolvedValue(null)
    await expect(service.findOne('t1', 's-outra')).rejects.toThrow(NotFoundException)
    expect(db.sprint.findFirst.mock.calls[0][0].where).toMatchObject({ id: 's-outra', project: { tenantId: 't1' } })
  })

  it('create exige projectId do próprio tenant', async () => {
    await expect(service.create('t1', { name: 'S1' })).rejects.toThrow(BadRequestException)
    assert.assertProject.mockImplementation(notFound)
    await expect(service.create('t1', { name: 'S1', projectId: 'p-outro' })).rejects.toThrow(NotFoundException)
    expect(db.sprint.create).not.toHaveBeenCalled()
  })

  it('update/remove/listColumns/createColumn não tocam sprint de outro tenant', async () => {
    db.sprint.findFirst.mockResolvedValue(null)
    await expect(service.update('t1', 's', { name: 'x' })).rejects.toThrow(NotFoundException)
    await expect(service.remove('t1', 's')).rejects.toThrow(NotFoundException)
    await expect(service.listColumns('t1', 's')).rejects.toThrow(NotFoundException)
    await expect(service.createColumn('t1', 's', { title: 'x', position: 0 })).rejects.toThrow(NotFoundException)
    expect(db.sprint.update).not.toHaveBeenCalled()
    expect(db.card.updateMany).not.toHaveBeenCalled()
    expect(db.sprintColumn.create).not.toHaveBeenCalled()
  })

  it('update impede mover a sprint para projeto de outro tenant', async () => {
    db.sprint.findFirst.mockResolvedValue({ id: 's1' })
    assert.assertProject.mockImplementation(notFound)
    await expect(service.update('t1', 's1', { projectId: 'p-outro' })).rejects.toThrow(NotFoundException)
    expect(db.sprint.update).not.toHaveBeenCalled()
  })

  it('updateColumn/deleteColumn validam coluna dentro da sprint do tenant', async () => {
    assert.assertColumn.mockImplementation(notFound)
    await expect(service.updateColumn('t1', 's1', 'c-outra', { title: 'x' })).rejects.toThrow(NotFoundException)
    await expect(service.deleteColumn('t1', 's1', 'c-outra')).rejects.toThrow(NotFoundException)
    expect(db.sprintColumn.update).not.toHaveBeenCalled()
  })
})

describe('SprintService — conflitos da exclusão', () => {
  it('repete somente a transação inteira quando PostgreSQL informa P2034', async () => {
    const transaction = vi.mocked(prisma.$transaction)
    transaction.mockRejectedValueOnce({ code: 'P2034' }).mockResolvedValueOnce(undefined)
    await service.remove('t1', 's1')
    expect(transaction).toHaveBeenCalledTimes(2)
    expect(transaction.mock.calls.every(call => call[1]?.isolationLevel === 'Serializable')).toBe(true)
  })

  it('limita tentativas e devolve conflito acionável', async () => {
    const transaction = vi.mocked(prisma.$transaction)
    transaction.mockRejectedValue({ code: 'P2034' })
    await expect(service.remove('t1', 's1')).rejects.toThrow('Tente novamente')
    expect(transaction).toHaveBeenCalledTimes(3)
  })

  it('não repete falha de escrita ou validação', async () => {
    const failure = new Error('write failed')
    const transaction = vi.mocked(prisma.$transaction)
    transaction.mockRejectedValue(failure)
    await expect(service.remove('t1', 's1')).rejects.toBe(failure)
    expect(transaction).toHaveBeenCalledTimes(1)
  })
})

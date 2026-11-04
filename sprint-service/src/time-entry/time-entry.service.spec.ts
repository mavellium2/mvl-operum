// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BadRequestException, ConflictException } from '@nestjs/common'

vi.mock('../prisma', () => ({
  prisma: {
    timeEntry: { findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))

vi.mock('../common/tenant-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../common/tenant-scope')>()
  return { ...actual, assertCard: vi.fn(), assertTimeEntry: vi.fn(), assertUserInTenant: vi.fn() }
})

vi.mock('./aviso-timer', () => ({ avisarTimerEncerrado: vi.fn() }))

import { prisma } from '../prisma'
import { TimeEntryService } from './time-entry.service'
import { avisarTimerEncerrado } from './aviso-timer'

const db = prisma as unknown as { timeEntry: Record<string, ReturnType<typeof vi.fn>> }
const service = new TimeEntryService()

beforeEach(() => {
  vi.resetAllMocks()
  db.timeEntry.findMany.mockResolvedValue([])
  db.timeEntry.updateMany.mockResolvedValue({ count: 1 })
})

describe('getRunning', () => {
  it('busca o timer rodando do usuário dentro do tenant e embrulha em { entry }', async () => {
    const entry = { id: 't1', cardId: 'c1', isRunning: true, card: { id: 'c1', title: 'EAP' } }
    db.timeEntry.findFirst.mockResolvedValue(entry)

    await expect(service.getRunning('ten1', 'u1')).resolves.toEqual({ entry })
    expect(db.timeEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1', isRunning: true, deletedAt: null, user: { tenantId: 'ten1' } },
    }))
  })

  it('sem timer rodando devolve { entry: null } (nunca corpo vazio)', async () => {
    db.timeEntry.findFirst.mockResolvedValue(null)
    await expect(service.getRunning('ten1', 'u1')).resolves.toEqual({ entry: null })
  })
})

describe('createManual', () => {
  it('grava com a duração em segundos', async () => {
    db.timeEntry.create.mockImplementation(async ({ data }) => data)
    const r = await service.createManual('ten1', 'c1', 'u1', {
      startedAt: '2026-09-29T10:00:00.000Z',
      endedAt: '2026-09-29T11:30:00.000Z',
    })
    expect(r).toMatchObject({ duration: 5400, isManual: true, cardId: 'c1', userId: 'u1' })
  })

  it.each([
    ['fim antes do início', '2026-09-29T11:00:00.000Z', '2026-09-29T10:00:00.000Z', /depois do início/],
    ['fim igual ao início', '2026-09-29T10:00:00.000Z', '2026-09-29T10:00:00.000Z', /depois do início/],
    ['data inválida', 'ontem', '2026-09-29T10:00:00.000Z', /datas válidas/],
  ])('recusa %s (antes gravava duração negativa ou NaN)', async (_caso, startedAt, endedAt, erro) => {
    await expect(service.createManual('ten1', 'c1', 'u1', { startedAt, endedAt })).rejects.toThrow(BadRequestException)
    await expect(service.createManual('ten1', 'c1', 'u1', { startedAt, endedAt })).rejects.toThrow(erro)
    expect(db.timeEntry.create).not.toHaveBeenCalled()
  })
})

describe('start — unicidade do timer', () => {
  it('timer já ativo responde conflito sem inserir outro', async () => {
    db.timeEntry.findFirst.mockResolvedValue({ id: 'existing' })
    await expect(service.start('ten1', 'c1', 'u1')).rejects.toMatchObject({ status: 409 })
    expect(db.timeEntry.create).not.toHaveBeenCalled()
  })

  it.each([
    { code: 'P2002', meta: { target: ['userId'] } },
    { code: 'P2002', meta: { target: 'TimeEntry_one_running_per_user' } },
    { code: 'P2002', meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['userId'] } } } } },
    { code: 'P2002', meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['"userId"'] } } } } },
    { code: 'P2002', meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { index: 'TimeEntry_one_running_per_user' } } } } },
  ])('colisão do índice ativo retorna 409 no formato do Prisma/adapter', async error => {
    db.timeEntry.findFirst.mockResolvedValue(null)
    db.timeEntry.create.mockRejectedValue(error)
    await expect(service.start('ten1', 'c1', 'u1')).rejects.toMatchObject({ status: 409, message: 'Já existe um timer em andamento' })
  })

  it.each([
    { code: 'P2002', meta: { target: ['id'] } },
    { code: 'P2002', meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { fields: ['"id"'] } } } } },
    { code: 'P2002', meta: { driverAdapterError: { cause: { kind: 'UniqueConstraintViolation', constraint: { index: 'TimeEntry_pkey' } } } } },
    { code: 'P2002' },
    new Error('write failed'),
  ])('não disfarça outro erro de escrita como timer ativo', async error => {
    db.timeEntry.findFirst.mockResolvedValue(null)
    db.timeEntry.create.mockRejectedValue(error)
    await expect(service.start('ten1', 'c1', 'u1')).rejects.toBe(error)
  })

  it('recusa usuário não identificado antes de consultar/inserir', async () => {
    await expect(service.start('ten1', 'c1', '')).rejects.toThrow('Usuário não identificado')
    expect(db.timeEntry.findFirst).not.toHaveBeenCalled()
    expect(db.timeEntry.create).not.toHaveBeenCalled()
  })
})

describe('stop — idempotência', () => {
  it('registro parado retorna valores existentes sem escrita', async () => {
    const stopped = { id: 'e1', userId: 'u1', isRunning: false, duration: 15, endedAt: new Date('2026-10-04T10:00:00Z') }
    db.timeEntry.findFirst.mockResolvedValue(stopped)
    expect(await service.stop('ten1', 'e1', 'u1')).toBe(stopped)
    expect(db.timeEntry.updateMany).not.toHaveBeenCalled()
  })

  it('concorrente que perde a escrita retorna a parada já persistida', async () => {
    const stopped = { id: 'e1', userId: 'u1', isRunning: false, duration: 15, endedAt: new Date('2026-10-04T10:00:00Z') }
    db.timeEntry.findFirst.mockResolvedValueOnce({ ...stopped, isRunning: true, startedAt: new Date() }).mockResolvedValueOnce(stopped)
    db.timeEntry.updateMany.mockResolvedValue({ count: 0 })
    expect(await service.stop('ten1', 'e1', 'u1')).toBe(stopped)
    expect(db.timeEntry.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'e1', userId: 'u1', deletedAt: null, isRunning: true, user: { tenantId: 'ten1' } })
  })

  it('início no futuro não produz duração negativa por diferença de relógio', async () => {
    db.timeEntry.findFirst.mockResolvedValueOnce({ id: 'e1', userId: 'u1', isRunning: true, startedAt: new Date(Date.now() + 60000) }).mockResolvedValueOnce({ id: 'e1', isRunning: false, duration: 0 })
    db.timeEntry.updateMany.mockResolvedValue({ count: 1 })
    await service.stop('ten1', 'e1', 'u1')
    expect(db.timeEntry.updateMany.mock.calls[0][0].data.duration).toBe(0)
  })

  it('não recria registro removido durante a parada', async () => {
    db.timeEntry.findFirst.mockResolvedValueOnce({ id: 'e1', userId: 'u1', isRunning: true, startedAt: new Date() }).mockResolvedValueOnce(null)
    db.timeEntry.updateMany.mockResolvedValue({ count: 0 })
    await expect(service.stop('ten1', 'e1', 'u1')).rejects.toThrow('Time entry não encontrada')
    expect(db.timeEntry.create).not.toHaveBeenCalled()
  })
})

const H = 3600_000
const atras = (h: number) => new Date(Date.now() - h * H)

describe('lançamento manual: validação (ADR-046)', () => {
  it('recusa sobreposição com outro lançamento do mesmo usuário e diz qual é', async () => {
    db.timeEntry.findMany.mockResolvedValue([{ id: 'e9', startedAt: atras(3.5), endedAt: atras(3.25), isRunning: false, description: 'Revisão do orçamento', card: { title: 'EAP' } }])
    await expect(service.createManual('ten1', 'c1', 'u1', { startedAt: atras(4).toISOString(), endedAt: atras(3).toISOString() }))
      .rejects.toThrow(ConflictException)
    await expect(service.createManual('ten1', 'c1', 'u1', { startedAt: atras(4).toISOString(), endedAt: atras(3).toISOString() }))
      .rejects.toThrow(/Já existe um lançamento seu .* em "EAP"/)
    await expect(service.createManual('ten1', 'c1', 'u1', { startedAt: atras(4).toISOString(), endedAt: atras(3).toISOString() }))
      .rejects.toThrow(/de 15 min .*"Revisão do orçamento".*Edite ou exclua o lançamento existente/)
    expect(db.timeEntry.create).not.toHaveBeenCalled()
  })

  it('timer rodando conta até agora na sobreposição', async () => {
    db.timeEntry.findMany.mockResolvedValue([{ id: 'r', startedAt: atras(1), endedAt: null, isRunning: true, card: { title: 'X' } }])
    await expect(service.createManual('ten1', 'c1', 'u1', { startedAt: atras(0.5).toISOString(), endedAt: atras(0.25).toISOString() }))
      .rejects.toThrow('timer rodando')
  })

  it.each([
    ['no futuro', 1, 2, 'futuro'],
    ['acima de 12 h', 14, 1, 'no máximo 12 h'],
  ])('recusa lançamento %s', async (_, iniH, fimH, msg) => {
    const ini = new Date(Date.now() + (iniH === 1 ? 1 : -iniH) * H)
    const fim = new Date(Date.now() + (iniH === 1 ? fimH : -fimH) * H)
    await expect(service.createManual('ten1', 'c1', 'u1', { startedAt: ini.toISOString(), endedAt: fim.toISOString() })).rejects.toThrow(msg)
  })
})

describe('editar lançamento (PATCH)', () => {
  it('nova duração recalcula o fim a partir do início e troca a descrição', async () => {
    const ini = atras(5)
    db.timeEntry.findUniqueOrThrow.mockResolvedValue({ id: 'e1', userId: 'u1', isRunning: false, startedAt: ini, endedAt: atras(1), duration: 4 * 3600 })
    db.timeEntry.update.mockImplementation(async ({ data }) => data)
    const r = await service.update('ten1', 'e1', { duration: 1800, description: 'corrigido' })
    expect(r).toMatchObject({ startedAt: ini, duration: 1800, description: 'corrigido' })
    expect((r as { endedAt: Date }).endedAt.getTime()).toBe(ini.getTime() + 1800_000)
  })

  it('não edita timer rodando nem aceita duração inválida', async () => {
    db.timeEntry.findUniqueOrThrow.mockResolvedValue({ id: 'e1', userId: 'u1', isRunning: true, startedAt: atras(1) })
    await expect(service.update('ten1', 'e1', { duration: 60 })).rejects.toThrow('Pare o timer')
    db.timeEntry.findUniqueOrThrow.mockResolvedValue({ id: 'e1', userId: 'u1', isRunning: false, startedAt: atras(2), endedAt: atras(1), duration: 3600 })
    await expect(service.update('ten1', 'e1', { duration: -5 })).rejects.toThrow('maior que zero')
    expect(db.timeEntry.update).not.toHaveBeenCalled()
  })

  it('a própria entrada não conta como conflito; outra conta', async () => {
    const ini = atras(5)
    db.timeEntry.findUniqueOrThrow.mockResolvedValue({ id: 'e1', userId: 'u1', isRunning: false, startedAt: ini, endedAt: atras(4), duration: 3600 })
    db.timeEntry.findMany.mockResolvedValue([{ id: 'e1', startedAt: ini, endedAt: atras(4), isRunning: false }])
    db.timeEntry.update.mockResolvedValue({})
    await service.update('ten1', 'e1', { duration: 1800 })
    db.timeEntry.findMany.mockResolvedValue([{ id: 'e2', startedAt: atras(4.5), endedAt: atras(4.2), isRunning: false }])
    await expect(service.update('ten1', 'e1', { duration: 3600 })).rejects.toThrow(ConflictException)
  })
})

describe('limite do timer (12 h)', () => {
  it('stop de timer vencido grava 12 h, marca para revisão e mantém a descrição', async () => {
    const ini = atras(30)
    const entry = { id: 't1', userId: 'u1', isRunning: true, startedAt: ini, description: 'SDD 5.1' }
    db.timeEntry.findFirst.mockResolvedValueOnce(entry).mockResolvedValueOnce({ ...entry, isRunning: false })
    await service.stop('ten1', 't1', 'u1')
    const data = db.timeEntry.updateMany.mock.calls[0][0].data
    expect(data.duration).toBe(12 * 3600)
    expect(data.endedAt.getTime()).toBe(ini.getTime() + 12 * H)
    expect(data.description).toBe('[Revisar] Timer encerrado no limite de 12 h. SDD 5.1')
  })

  it('timer esquecido é encerrado no limite ao ler e o dono é avisado', async () => {
    const card = { id: 'c1', title: 'Definir acessos', sprintId: 's1' }
    db.timeEntry.findMany.mockResolvedValueOnce([{ id: 't1', userId: 'u1', isRunning: true, startedAt: atras(312), description: null, card }])
    db.timeEntry.findFirst.mockResolvedValue(null)
    await service.getRunning('ten1', 'u1')
    expect(db.timeEntry.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 't1', isRunning: true }, data: { isRunning: false, duration: 12 * 3600 } })
    expect(avisarTimerEncerrado).toHaveBeenCalledWith('u1', card)
  })

  it('timer dentro do limite não é tocado', async () => {
    db.timeEntry.findMany.mockResolvedValueOnce([{ id: 't1', userId: 'u1', isRunning: true, startedAt: atras(2), card: { id: 'c1', title: 'x', sprintId: null } }])
    db.timeEntry.findFirst.mockResolvedValue(null)
    await service.getRunning('ten1', 'u1')
    expect(db.timeEntry.updateMany).not.toHaveBeenCalled()
    expect(avisarTimerEncerrado).not.toHaveBeenCalled()
  })
})


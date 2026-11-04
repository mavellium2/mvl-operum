// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/dal', () => ({
  verifySession: vi.fn(),
}))

vi.mock('@/lib/api-client', () => ({
  cardsApi: {
    createManualEntry: vi.fn(),
    listTimeEntries: vi.fn(),
  },
  timeEntriesApi: {
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

import { verifySession } from '@/lib/dal'
import { cardsApi, timeEntriesApi } from '@/lib/api-client'
import {
  addManualTimeAction,
  getTimeEntriesAction,
  updateTimeEntryAction,
  deleteTimeEntryAction,
} from '@/app/actions/time'

const mockVerify = verifySession as ReturnType<typeof vi.fn>

// IDs em formato CUID válido (c + 20-30 chars alfanuméricos minúsculos)
const CARD_ID  = 'clh3v0v7z0000356wf5g95e3'
const ENTRY_ID = 'clh3v0v7z0001356wf5g95e4'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('addManualTimeAction', () => {
  it('converts hours and minutes to startedAt/endedAt and calls service', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(cardsApi.createManualEntry).mockResolvedValue({ id: ENTRY_ID, duration: 5400, isManual: true })
    const result = await addManualTimeAction(CARD_ID, 1, 30)
    expect(cardsApi.createManualEntry).toHaveBeenCalledWith(
      CARD_ID,
      expect.objectContaining({ description: undefined })
    )
    expect(result).toMatchObject({ entry: { id: ENTRY_ID } })
  })

  it('includes seconds in total duration', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(cardsApi.createManualEntry).mockResolvedValue({ id: ENTRY_ID, duration: 3661, isManual: true })
    await addManualTimeAction(CARD_ID, 1, 0, 61)
    // 61 segundos inválido (>59), deve retornar erro
    expect(cardsApi.createManualEntry).not.toHaveBeenCalled()
  })

  it('divide dias em lançamentos de até 12 h, do mais antigo ao mais recente', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(cardsApi.createManualEntry).mockResolvedValue({ id: ENTRY_ID, duration: 43200, isManual: true })
    const result = await addManualTimeAction(CARD_ID, 0, 0, 0, undefined, 2)
    expect(cardsApi.createManualEntry).toHaveBeenCalledTimes(4)
    const chamadas = vi.mocked(cardsApi.createManualEntry).mock.calls
    const duracoes = chamadas.map(([, payload]) =>
      (new Date(payload.endedAt).getTime() - new Date(payload.startedAt).getTime()) / 1000)
    expect(duracoes).toEqual([12 * 3600, 12 * 3600, 12 * 3600, 12 * 3600])
    for (let i = 1; i < chamadas.length; i++) {
      expect(chamadas[i][1].startedAt).toBe(chamadas[i - 1][1].endedAt)
    }
    expect(result).toMatchObject({ entries: expect.any(Array) })
  })

  it('completa o limite e lança o restante em outro registro', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(cardsApi.createManualEntry).mockResolvedValue({ id: ENTRY_ID, duration: 43200, isManual: true })
    await addManualTimeAction(CARD_ID, 13, 0)
    expect(cardsApi.createManualEntry).toHaveBeenCalledTimes(2)
    const duracoes = vi.mocked(cardsApi.createManualEntry).mock.calls.map(([, payload]) =>
      (new Date(payload.endedAt).getTime() - new Date(payload.startedAt).getTime()) / 1000)
    expect(duracoes).toEqual([12 * 3600, 3600])
  })

  it('mantém um único lançamento quando o total cabe no limite', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(cardsApi.createManualEntry).mockResolvedValue({ id: ENTRY_ID, duration: 43200, isManual: true })
    await addManualTimeAction(CARD_ID, 12, 0)
    expect(cardsApi.createManualEntry).toHaveBeenCalledTimes(1)
  })

  it('desfaz os lançamentos já gravados se um deles falhar', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(cardsApi.createManualEntry)
      .mockResolvedValueOnce({ id: ENTRY_ID, isManual: true })
      .mockRejectedValueOnce(new Error('Já existe um lançamento seu nesse horário'))
    const result = await addManualTimeAction(CARD_ID, 13, 0)
    expect(result).toMatchObject({ error: 'Já existe um lançamento seu nesse horário' })
    expect(timeEntriesApi.delete).toHaveBeenCalledWith(ENTRY_ID)
  })

  it('passes description to service when provided', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(cardsApi.createManualEntry).mockResolvedValue({ id: ENTRY_ID, duration: 3600, description: 'Revisão' })
    await addManualTimeAction(CARD_ID, 1, 0, 0, 'Revisão')
    expect(cardsApi.createManualEntry).toHaveBeenCalledWith(
      CARD_ID,
      expect.objectContaining({ description: 'Revisão' })
    )
  })

  it('returns error when total seconds is 0', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    const result = await addManualTimeAction(CARD_ID, 0, 0)
    expect(result).toMatchObject({ error: expect.any(String) })
    expect(cardsApi.createManualEntry).not.toHaveBeenCalled()
  })

  it('returns error when hours is negative', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    const result = await addManualTimeAction(CARD_ID, -1, 0)
    expect(result).toMatchObject({ error: expect.any(String) })
    expect(cardsApi.createManualEntry).not.toHaveBeenCalled()
  })

  it('recusa dias acima do teto de 31', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    const result = await addManualTimeAction(CARD_ID, 0, 0, 0, undefined, 32)
    expect(result).toMatchObject({ error: expect.stringContaining('31') })
    expect(cardsApi.createManualEntry).not.toHaveBeenCalled()
  })

  it('recusa total acima de 31 dias mesmo com horas extras', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    const result = await addManualTimeAction(CARD_ID, 168, 0, 0, undefined, 31)
    expect(result).toMatchObject({ error: expect.stringContaining('31 dias') })
    expect(cardsApi.createManualEntry).not.toHaveBeenCalled()
  })

  it('returns error when not authenticated', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized'))
    const result = await addManualTimeAction(CARD_ID, 1, 0)
    expect(result).toMatchObject({ error: expect.any(String) })
  })
})

describe('getTimeEntriesAction', () => {
  it('returns entries from service for authenticated user', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    const entries = [{ id: ENTRY_ID, duration: 3600, description: null, createdAt: new Date() }]
    vi.mocked(cardsApi.listTimeEntries).mockResolvedValue(entries)
    const result = await getTimeEntriesAction(CARD_ID)
    expect(cardsApi.listTimeEntries).toHaveBeenCalledWith(CARD_ID)
    expect(result).toMatchObject({ entries })
  })

  it('returns error when not authenticated', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized'))
    const result = await getTimeEntriesAction(CARD_ID)
    expect(result).toMatchObject({ error: expect.any(String) })
  })
})

describe('updateTimeEntryAction', () => {
  it('converts hours+minutes to seconds and calls service', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(timeEntriesApi.update).mockResolvedValue({ id: ENTRY_ID, duration: 7200, description: 'Atualizado' })
    const result = await updateTimeEntryAction(ENTRY_ID, 2, 0, 'Atualizado')
    expect(timeEntriesApi.update).toHaveBeenCalledWith(ENTRY_ID, { duration: 7200, description: 'Atualizado' })
    expect(result).toMatchObject({ entry: { id: ENTRY_ID } })
  })

  it('returns error when time is zero', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    const result = await updateTimeEntryAction(ENTRY_ID, 0, 0)
    expect(result).toMatchObject({ error: expect.any(String) })
    expect(timeEntriesApi.update).not.toHaveBeenCalled()
  })

  it('returns error when not authenticated', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized'))
    const result = await updateTimeEntryAction(ENTRY_ID, 1, 0)
    expect(result).toMatchObject({ error: expect.any(String) })
  })
})

describe('deleteTimeEntryAction', () => {
  it('calls service with entryId', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(timeEntriesApi.delete).mockResolvedValue(undefined)
    const result = await deleteTimeEntryAction(ENTRY_ID)
    expect(timeEntriesApi.delete).toHaveBeenCalledWith(ENTRY_ID)
    expect(result).toMatchObject({ success: true })
  })

  it('returns error when not authenticated', async () => {
    mockVerify.mockRejectedValue(new Error('Unauthorized'))
    const result = await deleteTimeEntryAction(ENTRY_ID)
    expect(result).toMatchObject({ error: expect.any(String) })
  })

  it('returns error when service throws (e.g. not owner)', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1', role: 'member' })
    vi.mocked(timeEntriesApi.delete).mockRejectedValue(new Error('Sem permissão'))
    const result = await deleteTimeEntryAction(ENTRY_ID)
    expect(result).toMatchObject({ error: expect.any(String) })
  })
})

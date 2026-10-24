// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { revalidatePath } from 'next/cache'
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/dal', () => ({ verifySession: vi.fn() }))
vi.mock('@/lib/api-client', () => ({
  cardsApi: {
    startTimer: vi.fn(),
    stopTimer: vi.fn(),
    getActiveTimer: vi.fn(),
    getTimeTotal: vi.fn(),
    get: vi.fn(),
    addResponsible: vi.fn(),
  },
}))
vi.mock('@/services/wbsService', () => ({ refletirResponsaveisNoNo: vi.fn().mockResolvedValue(true) }))

import { verifySession } from '@/lib/dal'
import { cardsApi } from '@/lib/api-client'
import {
  startTimerAction,
  pauseTimerAction,
  getCardTimeAction,
  getActiveTimerAction,
  getCardsTimerAction,
} from '@/app/actions/time'

const mockVerify = verifySession as ReturnType<typeof vi.fn>

beforeEach(() => vi.clearAllMocks())

describe('startTimerAction', () => {
  it('calls startTimer with cardId from session', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.startTimer).mockResolvedValue({ id: 't1', isRunning: true })
    const result = await startTimerAction('clh3v0v7z0000356wf5g95e3')
    expect(cardsApi.startTimer).toHaveBeenCalledWith('clh3v0v7z0000356wf5g95e3')
    expect(result).toHaveProperty('entry')
  })

  it('returns error if not authenticated', async () => {
    mockVerify.mockRejectedValue(new Error('Não autenticado'))
    const result = await startTimerAction('clh3v0v7z0000356wf5g95e3')
    expect(result).toHaveProperty('error')
  })

  it('card sem responsável: quem iniciou o timer vira responsável (ADR-045)', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.startTimer).mockResolvedValue({ id: 't1', isRunning: true })
    vi.mocked(cardsApi.get).mockResolvedValue({ responsibles: [] } as never)
    const result = await startTimerAction('clh3v0v7z0000356wf5g95e3')
    expect(cardsApi.addResponsible).toHaveBeenCalledWith('clh3v0v7z0000356wf5g95e3', 'u1')
    expect(result).toMatchObject({ responsavelAdicionado: true })
  })

  it('card com responsável: não adiciona ninguém', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.startTimer).mockResolvedValue({ id: 't1', isRunning: true })
    vi.mocked(cardsApi.get).mockResolvedValue({ responsibles: [{ userId: 'u2' }] } as never)
    const result = await startTimerAction('clh3v0v7z0000356wf5g95e3')
    expect(cardsApi.addResponsible).not.toHaveBeenCalled()
    expect(result).toMatchObject({ responsavelAdicionado: false })
  })
})

describe('pauseTimerAction', () => {
  it('calls stopTimer with cardId', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.stopTimer).mockResolvedValue({ id: 't1', isRunning: false })
    const result = await pauseTimerAction('clh3v0v7z0000356wf5g95e3')
    expect(cardsApi.stopTimer).toHaveBeenCalledWith('clh3v0v7z0000356wf5g95e3')
    expect(revalidatePath).toHaveBeenCalledWith('/projetos/[projetoId]/planilha-custos', 'page')
    expect(result).toHaveProperty('entry')
  })
})

describe('getCardTimeAction', () => {
  it('returns total seconds for card', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.getTimeTotal).mockResolvedValue({ seconds: 360 })
    const result = await getCardTimeAction('clh3v0v7z0000356wf5g95e3')
    expect(result).toHaveProperty('seconds', 360)
  })
})

describe('getActiveTimerAction', () => {
  it('returns active timer if running', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.getActiveTimer).mockResolvedValue({ id: 't1', isRunning: true, startedAt: new Date(), duration: 0 })
    const result = await getActiveTimerAction('clh3v0v7z0000356wf5g95e3')
    expect(result).toHaveProperty('entry')
  })

  it('returns null entry if no active timer', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.getActiveTimer).mockResolvedValue(null)
    const result = await getActiveTimerAction('clh3v0v7z0000356wf5g95e3')
    expect(result.entry).toBeNull()
  })
})

describe('getCardsTimerAction (leitura em lote do quadro)', () => {
  const A = 'c' + 'a'.repeat(24)
  const B = 'c' + 'b'.repeat(24)
  it('lê total e timer ativo de cada card numa chamada, isolando o erro de um card', async () => {
    mockVerify.mockResolvedValue({ userId: 'u1' })
    vi.mocked(cardsApi.getTimeTotal).mockImplementation(async (id: string) => {
      if (id === B) throw new Error('falhou')
      return { seconds: 30 }
    })
    vi.mocked(cardsApi.getActiveTimer).mockResolvedValue(null)
    const r = await getCardsTimerAction([A, B, A, 'invalido'])
    expect(r[A]).toEqual({ seconds: 30, entry: null })
    expect(r[B]).toEqual({ error: 'falhou' })
    expect(r.invalido).toEqual({ error: 'cardId inválido' })
    expect(cardsApi.getTimeTotal).toHaveBeenCalledTimes(2)
  })
})

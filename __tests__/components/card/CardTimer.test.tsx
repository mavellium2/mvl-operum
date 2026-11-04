import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CardTimer from '@/components/card/CardTimer'
import Modal from '@/components/ui/Modal'

vi.mock('@/app/actions/time', () => ({
  startTimerAction: vi.fn(),
  pauseTimerAction: vi.fn(),
  getCardTimeAction: vi.fn(),
  getActiveTimerAction: vi.fn(),
  getCardsTimerAction: vi.fn(),
  addManualTimeAction: vi.fn(),
  getTimeEntriesAction: vi.fn().mockResolvedValue({ entries: [] }),
}))

import { startTimerAction, pauseTimerAction, getCardTimeAction, getActiveTimerAction, getCardsTimerAction, addManualTimeAction } from '@/app/actions/time'
import { timerEmLote } from '../../helpers/timerEmLote'

const mockStart = startTimerAction as ReturnType<typeof vi.fn>
const mockPause = pauseTimerAction as ReturnType<typeof vi.fn>
const mockGetTime = getCardTimeAction as ReturnType<typeof vi.fn>
const mockGetActive = getActiveTimerAction as ReturnType<typeof vi.fn>
const mockAddManual = addManualTimeAction as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  mockGetTime.mockResolvedValue({ seconds: 0 })
  mockGetActive.mockResolvedValue({ entry: null })
  vi.mocked(getCardsTimerAction).mockImplementation(timerEmLote(mockGetTime, mockGetActive) as never)
  mockAddManual.mockResolvedValue({ entry: { id: 'm1' } })
})

describe('CardTimer', () => {
  it('renders iniciar button when no active timer', async () => {
    render(<CardTimer cardId="c1" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /iniciar timer/i })).toBeInTheDocument())
  })

  it('renders pausar button when timer is running', async () => {
    mockGetActive.mockResolvedValue({
      entry: { id: 't1', isRunning: true, startedAt: new Date().toISOString(), duration: 0 },
    })
    mockGetTime.mockResolvedValue({ seconds: 120 })
    render(<CardTimer cardId="c1" />)
    await waitFor(() => expect(screen.getByRole('button', { name: /pausar timer/i })).toBeInTheDocument())
  })

  it('shows accumulated time', async () => {
    mockGetTime.mockResolvedValue({ seconds: 90 })
    render(<CardTimer cardId="c1" />)
    await waitFor(() => {
      expect(screen.getByLabelText('Tempo acumulado')).toHaveTextContent('01:30')
    })
  })

  it('calls startTimerAction when iniciar clicked', async () => {
    const user = userEvent.setup()
    mockStart.mockResolvedValue({ entry: { id: 't1', isRunning: true } })
    render(<CardTimer cardId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /iniciar/i }))
    await user.click(screen.getByRole('button', { name: /iniciar timer/i }))
    expect(mockStart).toHaveBeenCalledWith('c1')
  })

  it('calls pauseTimerAction when pausar clicked', async () => {
    const user = userEvent.setup()
    mockGetActive.mockResolvedValue({
      entry: { id: 't1', isRunning: true, startedAt: new Date().toISOString(), duration: 0 },
    })
    mockPause.mockResolvedValue({ entry: { id: 't1', isRunning: false } })
    mockGetTime.mockResolvedValue({ seconds: 60 })
    render(<CardTimer cardId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /pausar timer/i }))
    await user.click(screen.getByRole('button', { name: /pausar timer/i }))
    expect(mockPause).toHaveBeenCalledWith('t1')
  })

  it('clicking "Adicionar manualmente" shows hour and minute inputs', async () => {
    const user = userEvent.setup()
    render(<CardTimer cardId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /iniciar timer/i }))
    expect(screen.queryByLabelText(/horas/i)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /adicionar manualmente/i }))
    expect(screen.getByLabelText(/horas/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/minutos/i)).toBeInTheDocument()
  })

  it('clicking "Adicionar manualmente" inside Modal does not trigger onClose', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} title="Timer">
        <CardTimer cardId="c1" />
      </Modal>
    )
    await waitFor(() => screen.getByRole('button', { name: /iniciar timer/i }))
    await user.click(screen.getByRole('button', { name: /adicionar manualmente/i }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clicking Cancelar hides the manual time form', async () => {
    const user = userEvent.setup()
    render(<CardTimer cardId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /iniciar timer/i }))
    await user.click(screen.getByRole('button', { name: /adicionar manualmente/i }))
    expect(screen.getByLabelText(/horas/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /cancelar/i }))
    expect(screen.queryByLabelText(/horas/i)).not.toBeInTheDocument()
  })

  it('clicking Salvar with valid hours and minutes calls addManualTimeAction', async () => {
    const user = userEvent.setup()
    render(<CardTimer cardId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /iniciar timer/i }))
    await user.click(screen.getByRole('button', { name: /adicionar manualmente/i }))
    await user.clear(screen.getByLabelText(/horas/i))
    await user.type(screen.getByLabelText(/horas/i), '1')
    await user.clear(screen.getByLabelText(/minutos/i))
    await user.type(screen.getByLabelText(/minutos/i), '30')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    expect(mockAddManual).toHaveBeenCalledWith('c1', 1, 30, 0, undefined, 0)
  })

  it('aceita dias no lançamento manual e não deixa zero preso no campo', async () => {
    const user = userEvent.setup()
    render(<CardTimer cardId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /iniciar timer/i }))
    await user.click(screen.getByRole('button', { name: /adicionar manualmente/i }))

    const dias = screen.getByLabelText(/dias/i)
    expect(dias).toHaveValue(null)
    await user.type(dias, '2')
    await user.type(screen.getByLabelText(/horas/i), '3')
    await user.click(screen.getByRole('button', { name: /salvar/i }))

    expect(mockAddManual).toHaveBeenCalledWith('c1', 3, 0, 0, undefined, 2)
  })

  it('shows error when hours and minutes are both 0', async () => {
    const user = userEvent.setup()
    render(<CardTimer cardId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /iniciar timer/i }))
    await user.click(screen.getByRole('button', { name: /adicionar manualmente/i }))
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    expect(screen.getByText(/tempo válido/i)).toBeInTheDocument()
    expect(mockAddManual).not.toHaveBeenCalled()
  })

  it('hides manual form and refreshes elapsed time after successful save', async () => {
    const user = userEvent.setup()
    mockGetTime.mockResolvedValueOnce({ seconds: 0 }).mockResolvedValue({ seconds: 5400 })
    render(<CardTimer cardId="c1" />)
    await waitFor(() => screen.getByRole('button', { name: /iniciar timer/i }))
    await user.click(screen.getByRole('button', { name: /adicionar manualmente/i }))
    await user.clear(screen.getByLabelText(/horas/i))
    await user.type(screen.getByLabelText(/horas/i), '1')
    await user.clear(screen.getByLabelText(/minutos/i))
    await user.type(screen.getByLabelText(/minutos/i), '30')
    await user.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => expect(screen.queryByLabelText(/horas/i)).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Tempo acumulado')).toHaveTextContent('1h 30m'))
  })
})

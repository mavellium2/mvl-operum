import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MultiUserSelector from '@/components/card/MultiUserSelector'

vi.mock('@/app/actions/cardResponsible', () => ({
  addResponsibleAction: vi.fn(),
  removeResponsibleAction: vi.fn(),
  getResponsiblesAction: vi.fn(),
}))

import { addResponsibleAction, removeResponsibleAction, getResponsiblesAction } from '@/app/actions/cardResponsible'
import { escolherOpcao, opcoesDo } from '../../helpers/select'

const mockGetResponsibles = getResponsiblesAction as ReturnType<typeof vi.fn>
const mockAdd = addResponsibleAction as ReturnType<typeof vi.fn>
const mockRemove = removeResponsibleAction as ReturnType<typeof vi.fn>

const users = [
  { id: 'u1', name: 'Ana', email: 'ana@x.com', cargo: 'Dev', avatarUrl: null },
  { id: 'u2', name: 'Bruno', email: 'b@x.com', cargo: 'QA', avatarUrl: null },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetResponsibles.mockResolvedValue({ responsibles: [] })
  mockAdd.mockResolvedValue({ entry: {} })
  mockRemove.mockResolvedValue({ success: true })
})

describe('MultiUserSelector', () => {
  it('renders user options in dropdown', async () => {
    render(<MultiUserSelector cardId="c1" users={users} />)
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument())
    const opcoes = opcoesDo(screen.getByRole('combobox', { name: /adicionar responsável/i }))
    expect(opcoes.some(o => /Ana/.test(o))).toBe(true)
    expect(opcoes.some(o => /Bruno/.test(o))).toBe(true)
  })

  it('shows existing responsibles as chips', async () => {
    mockGetResponsibles.mockResolvedValue({
      responsibles: [{ userId: 'u1', user: { id: 'u1', name: 'Ana', cargo: 'Dev', avatarUrl: null } }],
    })
    render(<MultiUserSelector cardId="c1" users={users} />)
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument())
  })

  it('calls addResponsibleAction when user selected', async () => {
    render(<MultiUserSelector cardId="c1" users={users} />)
    await waitFor(() => screen.getByRole('combobox', { name: /adicionar responsável/i }))
    escolherOpcao(screen.getByRole('combobox', { name: /adicionar responsável/i }), /Ana/)
    await waitFor(() => expect(mockAdd).toHaveBeenCalledWith('c1', 'u1'))
  })

  it('calls removeResponsibleAction when chip × clicked', async () => {
    const user = userEvent.setup()
    mockGetResponsibles.mockResolvedValue({
      responsibles: [{ userId: 'u1', user: { id: 'u1', name: 'Ana', cargo: 'Dev', avatarUrl: null } }],
    })
    render(<MultiUserSelector cardId="c1" users={users} />)
    await waitFor(() => screen.getByRole('button', { name: /remover Ana/i }))
    await user.click(screen.getByRole('button', { name: /remover Ana/i }))
    expect(mockRemove).toHaveBeenCalledWith('c1', 'u1')
  })

  it('renders selector immediately in pending mode (no infinite loading)', () => {
    render(<MultiUserSelector cardId="" pending users={users} />)
    expect(screen.queryByText('Carregando...')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /adicionar responsável/i })).toBeInTheDocument()
  })

  it('does not crash when responsible has no user object (defensive)', async () => {
    mockGetResponsibles.mockResolvedValue({
      responsibles: [{ userId: 'u1', user: null }],
    })
    expect(() => render(<MultiUserSelector cardId="c1" users={users} />)).not.toThrow()
    await waitFor(() => expect(screen.queryByText('Carregando...')).not.toBeInTheDocument())
  })

  it('calls onResponsiblesChange callback after adding a member', async () => {
    const onResponsiblesChange = vi.fn()
    render(<MultiUserSelector cardId="c1" users={users} onResponsiblesChange={onResponsiblesChange} />)
    await waitFor(() => screen.getByRole('combobox', { name: /adicionar responsável/i }))
    escolherOpcao(screen.getByRole('combobox', { name: /adicionar responsável/i }), /Ana/)
    await waitFor(() => expect(onResponsiblesChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ userId: 'u1' })])
    ))
  })

  it('calls onResponsiblesChange callback after removing a member', async () => {
    const user = userEvent.setup()
    const onResponsiblesChange = vi.fn()
    mockGetResponsibles.mockResolvedValue({
      responsibles: [{ userId: 'u1', user: { id: 'u1', name: 'Ana', cargo: 'Dev', avatarUrl: null } }],
    })
    render(<MultiUserSelector cardId="c1" users={users} onResponsiblesChange={onResponsiblesChange} />)
    await waitFor(() => screen.getByRole('button', { name: /remover Ana/i }))
    await user.click(screen.getByRole('button', { name: /remover Ana/i }))
    expect(onResponsiblesChange).toHaveBeenCalledWith([])
  })

  it('recusa do servidor (ex.: último responsável em "Em andamento") aparece como mensagem e mantém o chip', async () => {
    const user = userEvent.setup()
    mockGetResponsibles.mockResolvedValue({
      responsibles: [{ userId: 'u1', user: { id: 'u1', name: 'Ana', cargo: 'Dev', avatarUrl: null } }],
    })
    mockRemove.mockResolvedValue({ error: 'O card está em "Em teste" e precisa de pelo menos um responsável.' })
    render(<MultiUserSelector cardId="c1" users={users} />)
    await user.click(await screen.findByRole('button', { name: /remover Ana/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('precisa de pelo menos um responsável')
    expect(screen.getByText('Ana')).toBeInTheDocument()
  })
})


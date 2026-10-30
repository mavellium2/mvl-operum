import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UserSelector from '@/components/user/UserSelector'

const users = [
  { id: 'u1', name: 'Ana Silva', email: 'ana@x.com' },
  { id: 'u2', name: 'Carlos Souza', email: 'carlos@x.com' },
]

describe('UserSelector', () => {
  it('opens the shared Select with a clear option and one option per user', async () => {
    render(<UserSelector users={users} value={null} onChange={vi.fn()} />)
    const select = screen.getByRole('combobox')
    expect(select).toHaveTextContent('Nenhum responsável')
    await userEvent.click(select)
    const options = screen.getAllByRole('option')
    // empty option + 2 users
    expect(options).toHaveLength(3)
  })

  it('calls onChange with userId when selection changes', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<UserSelector users={users} value={null} onChange={onChange} />)
    await user.click(screen.getByRole('combobox', { name: 'Responsável' }))
    await user.click(screen.getByRole('option', { name: /^Ana Silva/ }))
    expect(screen.getByRole('combobox', { name: 'Responsável' })).toHaveFocus()
    expect(onChange).toHaveBeenCalledWith('u1')
  })

  it('shows selected user when value prop provided', () => {
    render(<UserSelector users={users} value="u2" onChange={vi.fn()} label="Responsável pela tarefa" />)
    expect(screen.getByRole('combobox', { name: 'Responsável pela tarefa' })).toHaveTextContent('Carlos Souza')
  })

  it('calls onChange with null when empty option selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<UserSelector users={users} value="u1" onChange={onChange} />)
    await user.click(screen.getByRole('combobox', { name: 'Responsável' }))
    await user.click(screen.getByRole('option', { name: 'Nenhum responsável' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})


it('finds users by email and supports keyboard selection through the shared search', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()
  render(<UserSelector users={users} value={null} onChange={onChange} />)
  await user.click(screen.getByRole('combobox', { name: 'Responsável' }))
  await user.type(screen.getByRole('combobox', { name: 'Buscar Responsável' }), 'carlos@x.com')
  expect(screen.getAllByRole('option')).toHaveLength(1)
  await user.keyboard('{ArrowDown}{Enter}')
  expect(onChange).toHaveBeenCalledExactlyOnceWith('u2')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

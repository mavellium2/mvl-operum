import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Select, { type SelectOption } from '@/components/ui/Select'

const options: SelectOption[] = [
  { value: '', label: 'Limpar seleção' },
  { value: 'ana', label: 'Ana', description: 'Gerente de projetos' },
  { value: 'blocked', label: 'Indisponível', disabled: true },
  { value: 'bia', label: 'Bia', description: 'Desenvolvimento' },
]

describe('Select', () => {
  it('associates an external label, submits its value, and renders compact inline text', () => {
    render(<><label htmlFor="author">Elaborado por</label><Select id="author" name="author" compact options={options} value="ana" /></>)
    const trigger = screen.getByRole('combobox', { name: 'Elaborado por' })
    expect(trigger).toHaveTextContent('Ana')
    expect(trigger).toHaveClass('h-7')
    expect(document.querySelector('input[name="author"]')).toHaveValue('ana')
  })

  it('opens its list in a body portal and closes on an outside click', async () => {
    const user = userEvent.setup()
    const { container } = render(<Select options={options} ariaLabel="Pessoa" />)
    await user.click(screen.getByRole('combobox', { name: 'Pessoa' }))
    const list = screen.getByRole('listbox')
    expect(container).not.toContainElement(list)
    expect(document.body).toContainElement(list)
    expect(list.parentElement).toHaveStyle({ position: 'fixed' })
    await user.click(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('searches labels and descriptions and selects with Enter, returning focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={options} onChange={onChange} ariaLabel="Pessoa" />)
    const trigger = screen.getByRole('combobox', { name: 'Pessoa' })
    await user.click(trigger)
    const search = screen.getByRole('combobox', { name: 'Buscar Pessoa' })
    expect(search).toHaveFocus()
    await user.type(search, 'desenvolvimento')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('bia')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('skips disabled options with arrows and uses Escape without changing value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={options} value="ana" onChange={onChange} ariaLabel="Pessoa" />)
    const trigger = screen.getByRole('combobox', { name: 'Pessoa' })
    trigger.focus()
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('bia')
    await user.click(trigger)
    await user.keyboard('{ArrowUp}{Enter}')
    expect(onChange).toHaveBeenLastCalledWith('')
    onChange.mockClear()
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a clear option selectable while empty values display the placeholder', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={options} value="" placeholder="Escolha alguém" onChange={onChange} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Escolha alguém')
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Limpar seleção' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('shows an empty state, and never selects a disabled option', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Select options={options} onChange={onChange} />)
    await user.click(screen.getByRole('combobox'))
    await user.click(screen.getByRole('option', { name: 'Indisponível' }))
    expect(onChange).not.toHaveBeenCalled()
    await user.type(screen.getByRole('combobox', { name: 'Buscar opções' }), 'inexistente')
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma opção encontrada')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('exposes create separately from options and supports keyboard focus and activation', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    const onChange = vi.fn()
    render(<Select options={[options[1]]} onChange={onChange} onCreate={onCreate} createLabel="Criar membro" />)
    const trigger = screen.getByRole('combobox')
    await user.click(trigger)
    const footer = screen.getByRole('button', { name: 'Criar membro' })
    expect(within(screen.getByRole('listbox')).queryByRole('button')).not.toBeInTheDocument()
    await user.keyboard('{ArrowDown}')
    expect(footer).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('combobox', { name: 'Buscar opções' })).toHaveFocus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
    expect(trigger).toHaveFocus()
  })

  it('works without search and without a creation action; Tab leaves the menu', async () => {
    const user = userEvent.setup()
    render(<><Select options={options} searchable={false} /><button>Depois</button></>)
    const trigger = screen.getByRole('combobox')
    trigger.focus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('listbox')).toHaveFocus()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Criar novo' })).not.toBeInTheDocument()
    await user.keyboard('{Tab}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('disables opening and form submission', async () => {
    const user = userEvent.setup()
    render(<Select options={options} disabled name="member" value="ana" />)
    expect(screen.getByRole('combobox')).toBeDisabled()
    await user.click(screen.getByRole('combobox'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(document.querySelector('input[name="member"]')).toBeDisabled()
  })

  it('clamps the portal to the viewport, responds to scroll/resize, and cleans up listeners', async () => {
    const user = userEvent.setup()
    const removeWindow = vi.spyOn(window, 'removeEventListener')
    const removeDocument = vi.spyOn(document, 'removeEventListener')
    const { unmount } = render(<Select options={options} />)
    const trigger = screen.getByRole('combobox')
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 740, left: 1000, right: 1200, width: 200, height: 40, x: 1000, y: 700, toJSON() {} })
    await user.click(trigger)
    fireEvent.resize(window)
    fireEvent.scroll(window)
    const panel = screen.getByRole('listbox').parentElement!
    expect(parseFloat(panel.style.left) + parseFloat(panel.style.width)).toBeLessThanOrEqual(window.innerWidth - 8)
    expect(parseFloat(panel.style.top)).toBeLessThan(700)
    unmount()
    expect(removeWindow).toHaveBeenCalledWith('resize', expect.any(Function))
    expect(removeWindow).toHaveBeenCalledWith('scroll', expect.any(Function), true)
    expect(removeDocument).toHaveBeenCalledWith('mousedown', expect.any(Function))
    expect(removeDocument).toHaveBeenCalledWith('focusin', expect.any(Function))
    removeWindow.mockRestore()
    removeDocument.mockRestore()
  })
})

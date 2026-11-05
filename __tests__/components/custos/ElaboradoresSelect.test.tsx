import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ElaboradoresSelect from '@/components/custos/ElaboradoresSelect'

describe('teclado no seletor de elaboradores', () => {
  it('abre pelas setas, percorre pessoas, marca com Enter e retorna com Escape', () => {
    const onChange = vi.fn()
    render(<ElaboradoresSelect tarefa="Tarefa" value={[]} options={[{ userId: 'a', name: 'Ana' }, { userId: 'b', name: 'Bia' }]} onChange={onChange} />)
    const trigger = screen.getByRole('button')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const ana = screen.getByRole('checkbox', { name: 'Ana' })
    const bia = screen.getByRole('checkbox', { name: 'Bia' })
    expect(ana).toHaveFocus()
    fireEvent.keyDown(ana, { key: 'ArrowUp' })
    expect(bia).toHaveFocus()
    fireEvent.keyDown(bia, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['b'])
    fireEvent.keyDown(bia, { key: 'Home' })
    expect(ana).toHaveFocus()
    fireEvent.keyDown(ana, { key: 'End' })
    expect(bia).toHaveFocus()
    fireEvent.scroll(screen.getByRole('dialog'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(bia, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

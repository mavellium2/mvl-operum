import { expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'

it('compartilha seleção por clique e teclado entre as opções', () => {
  const onChange = vi.fn()
  render(<GlassSegmentedControl variant="compact" label="Período" value="1" onChange={onChange} options={[{ value: '1', label: '1º Sem.' }, { value: '2', label: '2º Sem.' }, { value: 'ano', label: 'Ano' }]} />)
  expect(screen.getByRole('radio', { name: '1º Sem.' })).toHaveAttribute('aria-checked', 'true')
  fireEvent.keyDown(screen.getByRole('radio', { name: '1º Sem.' }), { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledWith('2')
  expect(screen.getByRole('radio', { name: '2º Sem.' })).toHaveFocus()
  fireEvent.click(screen.getByRole('radio', { name: 'Ano' }))
  expect(onChange).toHaveBeenCalledWith('ano')
})

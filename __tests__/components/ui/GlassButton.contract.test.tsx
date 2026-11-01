import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Button from '@/components/ui/Button'
import GlassButton from '@/components/ui/GlassButton'
import GlassCloseButton from '@/components/ui/GlassCloseButton'

it('mantém o submit da API legada e o botão comum não envia o formulário', () => {
  const submit = vi.fn((event: React.FormEvent) => event.preventDefault())
  render(<form onSubmit={submit}><Button>Salvar</Button><GlassButton>Visualizar</GlassButton></form>)
  fireEvent.click(screen.getByRole('button', { name: 'Visualizar' }))
  expect(submit).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  expect(submit).toHaveBeenCalledOnce()
})
it('preserva foco por referência e estado desabilitado do fechar', () => {
  const ref = createRef<HTMLButtonElement>()
  const close = vi.fn()
  const { rerender } = render(<GlassCloseButton ref={ref} label="Fechar painel" onClick={close} />)
  ref.current?.focus()
  expect(screen.getByRole('button', { name: 'Fechar painel' })).toHaveFocus()
  rerender(<GlassCloseButton ref={ref} label="Fechar painel" disabled onClick={close} />)
  fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }))
  expect(close).not.toHaveBeenCalled()
})

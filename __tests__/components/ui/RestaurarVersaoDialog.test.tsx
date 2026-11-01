import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RestaurarVersaoDialog from '@/components/projetos/RestaurarVersaoDialog'

it('explica preservação de fases e aguarda confirmação antes de restaurar', async () => {
  const user = userEvent.setup()
  const onConfirm = vi.fn()
  render(<RestaurarVersaoDialog numero={1} fasesMantidas={['Fase atual']} alteracoesPendentes onClose={vi.fn()} onConfirm={onConfirm} />)
  expect(await screen.findByRole('dialog', { name: 'Restaurar versão 1?' })).toBeInTheDocument()
  expect(screen.getByText('Fase atual')).toBeInTheDocument()
  expect(screen.getByText(/edições ainda não salvas/)).toBeInTheDocument()
  expect(onConfirm).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Ativar esta versão' }))
  expect(onConfirm).toHaveBeenCalledOnce()
})

it('bloqueia ações durante a restauração e mostra a falha para nova tentativa', async () => {
  const onConfirm = vi.fn()
  const onClose = vi.fn()
  const { rerender } = render(<RestaurarVersaoDialog numero={1} fasesMantidas={[]} alteracoesPendentes={false} ocupado onClose={onClose} onConfirm={onConfirm} />)
  expect(await screen.findByRole('button', { name: 'Restaurando…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  rerender(<RestaurarVersaoDialog numero={1} fasesMantidas={[]} alteracoesPendentes={false} erro="Não foi possível salvar" onClose={onClose} onConfirm={onConfirm} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar')
  expect(screen.getByRole('button', { name: 'Ativar esta versão' })).toBeEnabled()
  expect(onConfirm).not.toHaveBeenCalled()
})

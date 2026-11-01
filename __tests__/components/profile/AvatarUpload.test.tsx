import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AvatarUpload from '@/components/profile/AvatarUpload'

vi.mock('@/app/actions/profile', () => ({ uploadAvatarAction: vi.fn() }))

it('abre a foto no modal compartilhado, sem abrir outra aba nem o seletor de arquivos', async () => {
  const user = userEvent.setup()
  const open = vi.spyOn(window, 'open').mockImplementation(() => null)
  render(<AvatarUpload name="Pessoa" avatarUrl="/foto.png" />)
  await user.click(screen.getByRole('button', { name: 'Visualizar foto de perfil' }))
  expect(screen.getByRole('dialog', { name: 'Foto de perfil' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Foto de Pessoa' })).toHaveAttribute('src', '/foto.png')
  expect(screen.getByRole('button', { name: 'Alterar imagem' })).toBeInTheDocument()
  expect(open).not.toHaveBeenCalled()
  open.mockRestore()
})

it('permite visualizar sem permitir alteração quando desabilitado', async () => {
  const user = userEvent.setup()
  render(<AvatarUpload name="Pessoa" disabled />)
  await user.click(screen.getByRole('button', { name: 'Visualizar foto de perfil' }))
  expect(screen.getByText('Você ainda não tem uma foto de perfil.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Adicionar imagem' })).not.toBeInTheDocument()
})

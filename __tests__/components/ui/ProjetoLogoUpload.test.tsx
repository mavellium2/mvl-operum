import { expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProjetoLogoUpload from '@/components/projetos/ProjetoLogoUpload'
vi.mock('@/app/actions/profile', () => ({ uploadAvatarAction: vi.fn() }))
it('abre a logo ampliada ao clicar, inclusive com edição desabilitada', async () => {
  const user = userEvent.setup()
  render(<ProjetoLogoUpload nome="Projeto" url="/logo.png" onChange={vi.fn()} disabled />)
  await user.click(screen.getByRole('button', { name: 'Visualizar logo do projeto' }))
  expect(await screen.findByRole('dialog', { name: 'Logo do projeto' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Logo de Projeto' })).toHaveAttribute('src', '/logo.png')
})

it('abre visualização sem logo em vez de disparar o seletor de arquivos', async () => {
  const user = userEvent.setup()
  render(<ProjetoLogoUpload nome="Projeto" url="" onChange={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Visualizar logo do projeto' }))
  expect(await screen.findByRole('dialog', { name: 'Logo do projeto' })).toBeInTheDocument()
  expect(screen.getByText('Este projeto ainda não tem uma logo salva.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Adicionar imagem' })).toBeInTheDocument()
})

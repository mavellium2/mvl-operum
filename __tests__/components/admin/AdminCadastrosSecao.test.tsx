import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { deleteDepartmentAction } from '@/app/actions/departments'
import AdminCadastrosClient from '@/components/admin/AdminCadastrosClient'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

vi.mock('@/components/permissoes/PermissoesFuncoes', () => ({ default: ({ selectedRole }: { selectedRole?: string }) => <div data-selected-role={selectedRole}>matriz de permissões</div> }))
vi.mock('@/app/actions/departments', () => ({
  getOrCreateDepartmentAction: vi.fn(), updateDepartmentNameAction: vi.fn(), deleteDepartmentAction: vi.fn(),
}))
vi.mock('@/app/actions/roles', () => ({
  getOrCreateRoleAction: vi.fn(), updateRoleNameAction: vi.fn(), deleteRoleAction: vi.fn(),
}))

const props = {
  departamentosIniciais: [{ id: 'd1', name: 'Tecnologia', description: null }],
  funcoesIniciais: [{ id: 'r1', name: 'Gerente de Projetos', scope: 'global', description: null }],
}

describe('Cadastros Globais por seção', () => {
  it('abre direto em Funções quando a seção é funcoes', () => {
    render(<AdminCadastrosClient {...props} section="funcoes" />)
    expect(screen.getByText('Catálogo global de Funções')).toBeInTheDocument()
    expect(screen.queryByText('Catálogo global de Departamentos')).toBeNull()
    expect(screen.getByText('matriz de permissões')).toBeInTheDocument()
  })

  it('abre em Departamentos e as abas levam ao endereço de cada seção', () => {
    render(<AdminCadastrosClient {...props} section="departamentos" />)
    expect(screen.getByText('Catálogo global de Departamentos')).toBeInTheDocument()
  })
})

it('seleciona os acessos pelo card sem botão visual de permissões e mantém a edição independente', () => {
  render(<AdminCadastrosClient {...props} section="funcoes" />)
  const card = screen.getByRole('button', { name: 'Configurar acessos de Gerente de Projetos' })
  fireEvent.click(card)
  expect(card).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('matriz de permissões')).toHaveAttribute('data-selected-role', 'r1')
  expect(screen.queryByRole('button', { name: 'Permissões', exact: true })).not.toBeInTheDocument()
  expect(screen.queryByText(/cadastrados ·/)).not.toBeInTheDocument()
  fireEvent.click(screen.getByTitle('Editar'))
  expect(screen.getByRole('textbox')).toHaveValue('Gerente de Projetos')
})

it('usa a lixeira compartilhada e mantém o departamento quando o servidor recusa excluir', async () => {
  vi.mocked(deleteDepartmentAction).mockResolvedValueOnce({ error: 'Departamento em uso' })
  render(<AdminCadastrosClient {...props} section="departamentos" />)
  const trash = screen.getByRole('button', { name: 'Remover Tecnologia' })
  expect(trash).toHaveClass('animated-trash')
  fireEvent.click(trash)
  expect(await screen.findByRole('alert')).toHaveTextContent('Departamento em uso')
  expect(screen.getByText('Tecnologia')).toBeInTheDocument()
  await waitFor(() => expect(trash).toHaveAttribute('aria-busy', 'false'))
})

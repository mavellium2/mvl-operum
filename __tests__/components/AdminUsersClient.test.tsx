import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
const { toggle, toast } = vi.hoisted(() => ({ toggle: vi.fn(), toast: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ toggleUserActiveAction: toggle }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('@/components/admin/AdminCreateUserModal', () => ({ default: () => null }))
vi.mock('@/components/admin/AdminEditUserModal', () => ({ default: () => null }))
vi.mock('@/components/permissoes/PermissoesUsuario', () => ({ default: () => null }))
import AdminUsersClient from '@/components/admin/AdminUsersClient'
const base = { cargo: null, departamento: null, hourlyRate: 0, avatarUrl: null, role: 'member' }
const users = [{ ...base, id: 'u1', name: 'Álvaro', email: 'alvaro@test.com', isActive: true, departamento: 'Pesquisa' }, { ...base, id: 'u2', name: 'Ana', email: 'ana@test.com', isActive: false }]
describe('usuários administrativos', () => {
  it('pesquisa sem diferenciar acentos e inclui departamento', () => {
    render(<AdminUsersClient initialUsers={users} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar usuários' }), { target: { value: 'alvaro' } })
    expect(screen.getByText('Álvaro')).toBeInTheDocument()
    expect(screen.queryByText('Ana')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar usuários' }), { target: { value: 'Pesquisa' } })
    expect(screen.getByText('Álvaro')).toBeInTheDocument()
  })
  it('abre edição e permissões no painel ao lado, sem modal, e permite alternar', () => {
    render(<AdminUsersClient initialUsers={users} />)
    fireEvent.click(screen.getByRole('button', { name: 'Editar Álvaro' }))
    expect(screen.getByRole('region', { name: 'Editar Álvaro' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Permissões de Ana' }))
    expect(screen.getByRole('region', { name: 'Permissões de Ana' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Editar Álvaro' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar painel' }))
    expect(screen.queryByRole('region', { name: 'Permissões de Ana' })).not.toBeInTheDocument()
  })
  it('mantém o estado e mostra a falha de ativação', async () => {
    toggle.mockResolvedValue({ error: 'Não permitido' })
    render(<AdminUsersClient initialUsers={users} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ativar Ana' }))
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith('Não permitido', 'error'))
    expect(screen.getByRole('button', { name: 'Ativar Ana' })).toBeEnabled()
  })
})

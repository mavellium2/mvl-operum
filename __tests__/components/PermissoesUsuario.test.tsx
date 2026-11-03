import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
const { list, save } = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }))
vi.mock('@/app/actions/permissoes', () => ({ listarAjustesUsuarioAction: list, salvarAjusteUsuarioAction: save }))
import PermissoesUsuario from '@/components/permissoes/PermissoesUsuario'
beforeEach(() => { vi.clearAllMocks(); list.mockResolvedValue({ herdadas: ['projeto:ver'], ajustes: {} }) })
describe('permissões individuais', () => {
  it('salva uma exceção no escopo correto e mostra seu resultado', async () => {
    save.mockResolvedValue({ success: true })
    render(<PermissoesUsuario userId="u1" projectId={null} />)
    const group = await screen.findByRole('radiogroup', { name: 'Ver o projeto' })
    fireEvent.click(group.querySelectorAll('button')[1])
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith({ userId: 'u1', projectId: null, permissao: 'projeto:ver', efeito: 'GRANT' }))
    expect(await screen.findByText('Exceção: acesso permitido')).toBeInTheDocument()
  })
  it('preserva a seleção anterior se o salvamento falhar', async () => {
    save.mockResolvedValue({ error: 'Sem permissão para alterar' })
    render(<PermissoesUsuario userId="u1" projectId="p1" />)
    const group = await screen.findByRole('radiogroup', { name: 'Ver o projeto' })
    fireEvent.click(group.querySelectorAll('button')[2])
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem permissão para alterar')
    expect(group.querySelectorAll('button')[0]).toHaveAttribute('aria-checked', 'true')
  })
  it('pesquisa por acesso e encontra grupos recolhidos', async () => {
    render(<PermissoesUsuario userId="u1" projectId={null} />)
    await screen.findByRole('radiogroup', { name: 'Ver o projeto' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar permissões do usuário' }), { target: { value: 'Excluir documentos' } })
    expect(screen.getByRole('radiogroup', { name: 'Excluir documentos' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Ver o projeto' })).not.toBeInTheDocument()
  })
})

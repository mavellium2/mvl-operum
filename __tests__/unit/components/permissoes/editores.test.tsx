import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PermissoesFuncoes from '@/components/permissoes/PermissoesFuncoes'
import PermissoesUsuario from '@/components/permissoes/PermissoesUsuario'
import { listarPermissoesFuncoesAction, salvarPermissoesFuncaoAction, restaurarPadraoFuncaoAction, listarAjustesUsuarioAction, salvarAjusteUsuarioAction } from '@/app/actions/permissoes'
import { escolherOpcao } from '../../../helpers/select'

vi.mock('@/app/actions/permissoes', () => ({
  listarPermissoesFuncoesAction: vi.fn(), salvarPermissoesFuncaoAction: vi.fn(), restaurarPadraoFuncaoAction: vi.fn(),
  listarAjustesUsuarioAction: vi.fn(), salvarAjusteUsuarioAction: vi.fn(),
}))
const base = { id: 'base', nome: 'Membro do projeto', tipo: 'base' as const, definidasEm: null, permissoes: ['projeto:ver' as const] }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listarPermissoesFuncoesAction).mockResolvedValue({ funcoes: [base] })
  vi.mocked(listarAjustesUsuarioAction).mockResolvedValue({ herdadas: ['projeto:ver'], ajustes: {} })
})

describe('editores de permissões', () => {
  it('preserva escolhas quando a gravação falha e permite salvar depois', async () => {
    vi.mocked(salvarPermissoesFuncaoAction).mockRejectedValueOnce(new Error('offline'))
    render(<PermissoesFuncoes />)
    fireEvent.click(await screen.findByText(/Membro do projeto —/))
    const check = screen.getByLabelText('Ver o projeto')
    fireEvent.click(check)
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar permissões' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Suas escolhas foram preservadas')
    expect(check).not.toBeChecked()
    vi.mocked(salvarPermissoesFuncaoAction).mockResolvedValue({ success: true, roleId: 'base', funcoes: [{ ...base, definidasEm: '2026-09-30T12:00:00Z', permissoes: [] }] })
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar permissões' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Permissões salvas')
    expect(salvarPermissoesFuncaoAction).toHaveBeenLastCalledWith({ roleId: 'base', permissoes: [] })
    expect(screen.getByRole('button', { name: 'Restaurar padrão' })).toBeVisible()
  })
  it('restaura a matriz e mantém o editor aberto com feedback', async () => {
    vi.mocked(listarPermissoesFuncoesAction).mockResolvedValue({ funcoes: [{ ...base, definidasEm: '2026-09-30', permissoes: [] }] })
    vi.mocked(restaurarPadraoFuncaoAction).mockResolvedValue({ success: true, funcoes: [base] })
    render(<PermissoesFuncoes />)
    fireEvent.click(await screen.findByText(/Membro do projeto —/))
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Permissões salvas')
    expect(screen.getByLabelText('Ver o projeto')).toBeChecked()
    expect(await screen.findByRole('button', { name: 'Salvar permissões' })).toBeVisible()
  })
  it('envia o escopo do projeto e só confirma ajuste após sucesso; herdar remove o ajuste', async () => {
    vi.mocked(salvarAjusteUsuarioAction).mockResolvedValue({ success: true })
    render(<PermissoesUsuario userId="u1" projectId="p1" />)
    const select = await screen.findByRole('combobox', { name: 'Ver o projeto' })
    escolherOpcao(select, 'Negar')
    await waitFor(() => expect(select).toHaveTextContent('Negar'))
    // Enquanto salva, o seletor fica desabilitado; espera liberar antes da próxima escolha.
    await waitFor(() => expect(select).toBeEnabled())
    expect(salvarAjusteUsuarioAction).toHaveBeenLastCalledWith({ userId: 'u1', projectId: 'p1', permissao: 'projeto:ver', efeito: 'DENY' })
    escolherOpcao(select, 'Herdar')
    await waitFor(() => expect(select).toHaveTextContent('Herdar'))
    expect(salvarAjusteUsuarioAction).toHaveBeenLastCalledWith(expect.objectContaining({ efeito: null }))
  })
  it('ajuste global falho preserva valor confirmado', async () => {
    vi.mocked(salvarAjusteUsuarioAction).mockResolvedValue({ error: 'Sem acesso' })
    render(<PermissoesUsuario userId="u1" projectId={null} />)
    const select = await screen.findByRole('combobox', { name: 'Ver o projeto' })
    escolherOpcao(select, 'Conceder')
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem acesso')
    expect(select).toHaveTextContent('Herdar')
    expect(salvarAjusteUsuarioAction).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }))
  })
})

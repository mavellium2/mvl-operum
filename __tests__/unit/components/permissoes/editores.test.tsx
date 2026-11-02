import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PermissoesFuncoes from '@/components/permissoes/PermissoesFuncoes'
import PermissoesUsuario from '@/components/permissoes/PermissoesUsuario'
import { listarPermissoesFuncoesAction, salvarPermissoesFuncaoAction, restaurarPadraoFuncaoAction, listarAjustesUsuarioAction, salvarAjusteUsuarioAction } from '@/app/actions/permissoes'

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
    await screen.findByRole('combobox', { name: 'Função ou acesso base' })
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
    await screen.findByRole('combobox', { name: 'Função ou acesso base' })
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Permissões salvas')
    expect(screen.getByLabelText('Ver o projeto')).toBeChecked()
    expect(await screen.findByRole('button', { name: 'Salvar permissões' })).toBeVisible()
  })
  it('envia o escopo do projeto e só confirma ajuste após sucesso; herdar remove o ajuste', async () => {
    vi.mocked(salvarAjusteUsuarioAction).mockResolvedValue({ success: true })
    render(<PermissoesUsuario userId="u1" projectId="p1" />)
    const group = await screen.findByRole('radiogroup', { name: 'Ver o projeto' })
    fireEvent.click(within(group).getByRole('radio', { name: 'Negar' }))
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Negar' })).toHaveAttribute('aria-checked', 'true'))
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Herdar' })).toBeEnabled())
    expect(salvarAjusteUsuarioAction).toHaveBeenLastCalledWith({ userId: 'u1', projectId: 'p1', permissao: 'projeto:ver', efeito: 'DENY' })
    fireEvent.click(within(group).getByRole('radio', { name: 'Herdar' }))
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Herdar' })).toHaveAttribute('aria-checked', 'true'))
    expect(salvarAjusteUsuarioAction).toHaveBeenLastCalledWith(expect.objectContaining({ efeito: null }))
  })
  it('ajuste global falho preserva valor confirmado', async () => {
    vi.mocked(salvarAjusteUsuarioAction).mockResolvedValue({ error: 'Sem acesso' })
    render(<PermissoesUsuario userId="u1" projectId={null} />)
    const group = await screen.findByRole('radiogroup', { name: 'Ver o projeto' })
    fireEvent.click(within(group).getByRole('radio', { name: 'Permitir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem acesso')
    expect(within(group).getByRole('radio', { name: 'Herdar' })).toHaveAttribute('aria-checked', 'true')
    expect(salvarAjusteUsuarioAction).toHaveBeenCalledWith(expect.objectContaining({ projectId: null }))
  })
})

it('interruptor do grupo altera somente os acessos daquele grupo e não salva automaticamente', async () => {
  render(<PermissoesFuncoes />)
  const group = await screen.findByRole('switch', { name: 'Todos de Projeto' })
  expect(group).not.toBeChecked()
  fireEvent.click(group)
  expect(group).toBeChecked()
  expect(screen.getByRole('switch', { name: 'Editar dados do projeto e macrofases' })).toBeChecked()
  expect(screen.getByRole('switch', { name: 'Gerenciar membros e stakeholders' })).toBeChecked()
  expect(screen.getByRole('switch', { name: 'Todos de Quadro' })).not.toBeChecked()
  expect(salvarPermissoesFuncaoAction).not.toHaveBeenCalled()
  fireEvent.click(group)
  expect(screen.getByRole('switch', { name: 'Ver o projeto' })).not.toBeChecked()
})

it('mostra o que mudou e descarta apenas as alterações locais da função', async () => {
  render(<PermissoesFuncoes />)
  const toggle = await screen.findByRole('switch', { name: 'Ver o projeto' })
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: /1 alteração não salva/ }))
  expect(screen.getByRole('dialog', { name: 'Alterações não salvas' })).toHaveTextContent(/Ativado.*Desativado/)
  fireEvent.click(screen.getByRole('button', { name: 'Fechar', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Descartar' }))
  expect(toggle).toBeChecked()
  expect(screen.queryByRole('dialog', { name: 'Alterações não salvas' })).not.toBeInTheDocument()
  expect(salvarPermissoesFuncaoAction).not.toHaveBeenCalled()
})

it('não anima nem abre o painel ao alterar uma permissão sem clicar no indicador', async () => {
  render(<PermissoesFuncoes />)
  const toggle = await screen.findByRole('switch', { name: 'Ver o projeto' })
  fireEvent.click(toggle)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const hidden = document.querySelector('[data-context="permissions"][role="dialog"]')
  expect(hidden).toHaveAttribute('data-open', 'false')
  expect(hidden).toHaveAttribute('data-visited', 'false')
  fireEvent.click(screen.getByRole('button', { name: /1 alteração não salva/ }))
  expect(screen.getByRole('dialog')).toHaveAttribute('data-open', 'true')
})

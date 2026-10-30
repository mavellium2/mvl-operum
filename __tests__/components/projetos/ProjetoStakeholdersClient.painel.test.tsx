import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('@/app/actions/stakeholders', () => ({
  createStakeholderAction: vi.fn(),
  updateStakeholderAction: vi.fn(),
  bindStakeholderAction: vi.fn(),
  unbindStakeholderAction: vi.fn(),
  reorderStakeholdersAction: vi.fn().mockResolvedValue({ success: true }),
  reorderMembersAction: vi.fn().mockResolvedValue({ success: true }),
  uploadMemberSignatureAction: vi.fn().mockResolvedValue({ error: 'noop' }),
}))
vi.mock('@/app/actions/projects', () => ({ addMemberAction: vi.fn(), removeMemberAction: vi.fn() }))
vi.mock('@/app/actions/projetos', () => ({ updateProjetoMemberAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ adminCreateUserAction: vi.fn() }))
vi.mock('@/components/profile/AvatarUpload', () => ({ default: () => null }))
vi.mock('@/components/ui/AddressFields', () => ({
  default: () => null,
  emptyAddress: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
}))
vi.mock('@/components/permissoes/ProjectPermissions', () => ({ useProjectPermissions: () => new Set(['projeto:equipe']) }))

import ProjetoStakeholdersClient from '@/components/projetos/ProjetoStakeholdersClient'
import { bindStakeholderAction, createStakeholderAction, updateStakeholderAction } from '@/app/actions/stakeholders'
import { adminCreateUserAction } from '@/app/actions/admin'
import { addMemberAction } from '@/app/actions/projects'

const externo = {
  id: 's1', tenantId: 't', name: 'Prefeitura', logoUrl: null, company: 'Prefeitura', competence: null, email: null, phone: null,
  cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null, isActive: true,
}

function renderPainel(onFechar = vi.fn(), onAlterado = vi.fn(), onSelecionado = vi.fn()) {
  render(
    <ToastProvider>
      <ProjetoStakeholdersClient projetoId="p1" stakeholders={[]} stakeholdersDisponiveis={[externo]} usuariosDisponiveis={[]} userRole="admin" painel={{ modo: 'externo', onFechar, onAlterado, onSelecionado }} />
    </ToastProvider>,
  )
  return { onFechar, onAlterado, onSelecionado }
}

beforeEach(() => vi.clearAllMocks())

describe('cadastro de Stakeholders em painel (documento Partes Interessadas)', () => {
  it('vincular, salvar: mostra sucesso e fecha o painel', async () => {
    vi.mocked(bindStakeholderAction).mockResolvedValue({ success: true } as never)
    vi.mocked(updateStakeholderAction).mockResolvedValue({ success: true } as never)
    const { onFechar, onAlterado } = renderPainel()
    expect(screen.getByRole('dialog', { name: 'Adicionar stakeholder externo' })).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('Vincular ao projeto'))
    // Depois de vincular, o formulário abre para completar os dados; o painel continua aberto.
    expect(await screen.findByRole('button', { name: /Salvar Dados/ })).toBeInTheDocument()
    expect(onFechar).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Salvar Dados/ }))
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1))
    expect(onAlterado).toHaveBeenCalled()
    expect(await screen.findByText('Dados de "Prefeitura" salvos!')).toBeInTheDocument()
  })

  it('criar um stakeholder novo: mostra sucesso e fecha o painel', async () => {
    vi.mocked(createStakeholderAction).mockResolvedValue({ stakeholder: { ...externo, id: 's2', name: 'Câmara' } } as never)
    const { onFechar, onSelecionado } = renderPainel()
    fireEvent.click(screen.getByTitle('Novo stakeholder'))
    fireEvent.change(screen.getByPlaceholderText(/Nome completo/), { target: { value: 'Câmara' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar Stakeholder/ }))
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Stakeholder "Câmara" criado e adicionado ao projeto!')).toBeInTheDocument()
    expect(onSelecionado).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 's2', stakeholderId: 's2', tipo: 'externo', name: 'Câmara' }))
  })
})


describe('cadastro interno em painel — seleção para o campo de origem', () => {
  it('inicia criação interna e devolve a pessoa recém-criada e vinculada antes de fechar', async () => {
    const onSelecionado = vi.fn(), onFechar = vi.fn(), onAlterado = vi.fn()
    vi.mocked(adminCreateUserAction).mockResolvedValue({ user: {
      id: 'u-novo', name: 'Nova pessoa', email: 'nova@example.com', avatarUrl: null, role: 'user',
    } } as never)
    vi.mocked(addMemberAction).mockResolvedValue({ success: true } as never)
    render(<ToastProvider><ProjetoStakeholdersClient projetoId="p1" stakeholders={[]} stakeholdersDisponiveis={[]} usuariosDisponiveis={[]}
      userRole="admin" painel={{ modo: 'interno', iniciarCriacao: true, onSelecionado, onFechar, onAlterado }} /></ToastProvider>)
    expect(screen.getByRole('dialog', { name: 'Adicionar membro da equipe' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Nome completo ou razão social'), { target: { value: 'Nova pessoa' } })
    fireEvent.change(screen.getByPlaceholderText('usuario@empresa.com.br'), { target: { value: 'nova@example.com' } })
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'Senha1234!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Stakeholder' }))
    await waitFor(() => expect(onFechar).toHaveBeenCalledOnce())
    expect(adminCreateUserAction).toHaveBeenCalledWith(expect.objectContaining({ name: 'Nova pessoa', email: 'nova@example.com', forcePasswordChange: true }))
    expect(addMemberAction).toHaveBeenCalledWith('p1', 'u-novo')
    expect(onSelecionado).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'u-novo', userId: 'u-novo', tipo: 'interno', name: 'Nova pessoa', forcePasswordChange: true }))
    expect(onAlterado).toHaveBeenCalledOnce()
    expect(onSelecionado.mock.invocationCallOrder[0]).toBeLessThan(onFechar.mock.invocationCallOrder[0])
  })
})

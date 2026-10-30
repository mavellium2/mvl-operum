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

const externo = {
  id: 's1', tenantId: 't', name: 'Prefeitura', logoUrl: null, company: 'Prefeitura', competence: null, email: null, phone: null,
  cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null, isActive: true,
}

function renderPainel(onFechar = vi.fn(), onAlterado = vi.fn()) {
  render(
    <ToastProvider>
      <ProjetoStakeholdersClient projetoId="p1" stakeholders={[]} stakeholdersDisponiveis={[externo]} usuariosDisponiveis={[]} userRole="admin" painel={{ modo: 'externo', onFechar, onAlterado }} />
    </ToastProvider>,
  )
  return { onFechar, onAlterado }
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
    vi.mocked(createStakeholderAction).mockResolvedValue({ stakeholder: { id: 's2', tenantId: 't' } } as never)
    const { onFechar } = renderPainel()
    fireEvent.click(screen.getByTitle('Novo stakeholder'))
    fireEvent.change(screen.getByPlaceholderText(/Nome completo/), { target: { value: 'Câmara' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar Stakeholder/ }))
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Stakeholder "Câmara" criado e adicionado ao projeto!')).toBeInTheDocument()
  })
})

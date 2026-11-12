import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('@/app/actions/cadastroStakeholders', () => ({ carregarCadastroStakeholdersAction: vi.fn().mockResolvedValue({ error: 'sem servidor no teste' }) }))
vi.mock('@/app/actions/stakeholders', () => ({
  salvarDadosDoExternoAction: vi.fn().mockResolvedValue({ success: true }),
  salvarEmpresaDoMembroAction: vi.fn().mockResolvedValue({ success: true }),
  adicionarUsuarioComoExternoAction: vi.fn(),
  tornarExternoAction: vi.fn(),
  tornarInternoAction: vi.fn(),
  createStakeholderAction: vi.fn(),
  updateStakeholderAction: vi.fn(),
  bindStakeholderAction: vi.fn().mockResolvedValue({ success: true }),
  unbindStakeholderAction: vi.fn(),
  reorderStakeholdersAction: vi.fn().mockResolvedValue({ success: true }),
  reorderMembersAction: vi.fn().mockResolvedValue({ success: true }),
  uploadMemberSignatureAction: vi.fn().mockResolvedValue({ error: 'noop' }),
}))
vi.mock('@/app/actions/projects', () => ({
  addMemberAction: vi.fn().mockResolvedValue({ success: true }),
  removeMemberAction: vi.fn(),
}))
vi.mock('@/app/actions/projetos', () => ({ updateProjetoMemberAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ adminCreateUserAction: vi.fn() }))
vi.mock('@/components/profile/AvatarUpload', () => ({ default: () => null }))
vi.mock('@/components/ui/AddressFields', () => ({
  default: () => null,
  emptyAddress: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
}))

import ProjetoStakeholdersClient from '@/components/projetos/ProjetoStakeholdersClient'
import { bindStakeholderAction } from '@/app/actions/stakeholders'

const externo = {
  id: 'sk1', tenantId: 't1', name: 'Empresa Beta', logoUrl: null, company: 'Beta S.A.', competence: null,
  email: null, phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null,
  cidade: null, estado: null, notes: null, isActive: true,
}
const usuario = { id: 'u7', name: 'Beatriz Souza', email: 'bia@x.com', avatarUrl: null, role: 'member' }

function renderComponent(userRole: 'admin' | 'gerente' = 'admin') {
  return render(
    <ToastProvider>
      <ProjetoStakeholdersClient
        projetoId="p1"
        stakeholders={[]}
        stakeholdersDisponiveis={[externo] as never}
        usuariosDisponiveis={[usuario] as never}
        funcoesExistentes={[]}
        departamentosExistentes={[]}
        userRole={userRole}
      />
    </ToastProvider>,
  )
}

const busca = () => screen.getByPlaceholderText('Buscar por nome, e-mail ou empresa…')

beforeEach(() => vi.clearAllMocks())

describe('Stakeholders — adicionar pela barra de pesquisa', () => {
  it('ao digitar parte do nome, sugere stakeholder global e usuário da instituição, além de criar', () => {
    renderComponent()
    fireEvent.change(busca(), { target: { value: 'be' } })

    expect(screen.getByRole('button', { name: 'Vincular "Empresa Beta" ao projeto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar "Beatriz Souza" ao projeto' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Criar "be" como externo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Criar "be" como membro da equipe/ })).toBeInTheDocument()
  })

  it('busca pela empresa também encontra o stakeholder global', () => {
    renderComponent()
    fireEvent.change(busca(), { target: { value: 's.a.' } })
    expect(screen.getByRole('button', { name: 'Vincular "Empresa Beta" ao projeto' })).toBeInTheDocument()
  })

  it('vincular pela sugestão chama o bind e limpa a busca', async () => {
    renderComponent()
    fireEvent.change(busca(), { target: { value: 'beta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Vincular "Empresa Beta" ao projeto' }))
    await waitFor(() => expect(bindStakeholderAction).toHaveBeenCalled())
    expect(busca()).toHaveValue('')
  })

  it('sem texto na busca, o painel não aparece', () => {
    renderComponent()
    expect(screen.queryByLabelText('Adicionar ao projeto')).not.toBeInTheDocument()
  })

  it('não-admin não vê o painel', () => {
    renderComponent('gerente')
    fireEvent.change(busca(), { target: { value: 'be' } })
    expect(screen.queryByRole('button', { name: /Vincular "Empresa Beta"/ })).not.toBeInTheDocument()
  })
})

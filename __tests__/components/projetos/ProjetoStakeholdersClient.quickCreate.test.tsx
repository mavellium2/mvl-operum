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
  bindStakeholderAction: vi.fn(),
  unbindStakeholderAction: vi.fn(),
  reorderStakeholdersAction: vi.fn().mockResolvedValue({ success: true }),
  reorderMembersAction: vi.fn().mockResolvedValue({ success: true }),
  uploadMemberSignatureAction: vi.fn().mockResolvedValue({ error: 'noop' }),
}))

vi.mock('@/app/actions/projects', () => ({
  addMemberAction: vi.fn(),
  removeMemberAction: vi.fn(),
}))

vi.mock('@/app/actions/projetos', () => ({
  updateProjetoMemberAction: vi.fn(),
}))

vi.mock('@/app/actions/admin', () => ({
  adminCreateUserAction: vi.fn(),
}))

vi.mock('@/components/profile/AvatarUpload', () => ({
  default: ({ name }: { name: string }) => <div data-testid="avatar-upload">{name}</div>,
}))

vi.mock('@/components/ui/AddressFields', () => ({
  default: () => <div data-testid="address-fields" />,
  emptyAddress: {
    cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '',
  },
}))

import ProjetoStakeholdersClient, { type StakeholderUnificado } from '@/components/projetos/ProjetoStakeholdersClient'
import { createStakeholderAction } from '@/app/actions/stakeholders'

const PROJ_ID = 'p1'

const makeSk = (id: string, name: string): StakeholderUnificado => ({
  id,
  tipo: 'externo',
  stakeholderId: id,
  tenantId: 't1',
  name,
  email: null,
  avatarUrl: null,
  phone: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  estado: null,
  notes: null,
  company: null,
  competence: null,
  isActive: true,
})

function renderComponent(
  stakeholders: StakeholderUnificado[] = [],
  stakeholdersDisponiveis: unknown[] = [],
  userRole: 'admin' | 'gerente' = 'admin',
) {
  return render(
    <ToastProvider>
      <ProjetoStakeholdersClient
        projetoId={PROJ_ID}
        stakeholders={stakeholders}
        stakeholdersDisponiveis={stakeholdersDisponiveis as never}
        usuariosDisponiveis={[]}
        funcoesExistentes={[]}
        departamentosExistentes={[]}
        userRole={userRole}
      />
    </ToastProvider>,
  )
}

const CRIADO = {
  success: true,
  stakeholder: { id: 'sk-novo', tenantId: 't1', name: 'Nova Empresa' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

const campo = () => screen.getByRole('combobox', { name: 'Adicionar integrante' })
const digitar = (v: string) => fireEvent.change(campo(), { target: { value: v } })

describe('ProjetoStakeholdersClient — criação rápida pelo campo Adicionar integrante', () => {
  it('"Criar como externo" com nome digitado cria o externo e vincula ao projeto', async () => {
    vi.mocked(createStakeholderAction).mockResolvedValue(CRIADO as never)
    renderComponent()

    digitar('Nova Empresa')
    fireEvent.click(screen.getByRole('option', { name: 'Criar «Nova Empresa» como externo' }))

    await waitFor(() => {
      expect(createStakeholderAction).toHaveBeenCalledWith({ name: 'Nova Empresa' }, PROJ_ID)
    })
    await waitFor(() => expect(screen.getAllByText('Nova Empresa').length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByText(/criado e adicionado ao projeto/i)).toBeInTheDocument())
    // SDD 4.4: criado só com o nome, já abre o cadastro para completar os dados.
    expect(screen.getByText('Editar Stakeholder')).toBeInTheDocument()
  })

  it('nome inexistente: a mesma lista oferece criar na equipe ou como externo; na equipe abre o cadastro com o nome', () => {
    renderComponent()

    digitar('Luan')
    fireEvent.click(screen.getByRole('option', { name: /Criar «Luan» na equipe/i }))

    expect(screen.getByText('Novo Membro da Equipe')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nome completo ou razão social')).toHaveValue('Luan')
    expect(screen.getByPlaceholderText('usuario@empresa.com.br')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toBeInTheDocument()
  })

  it('nome que já existe no diretório: só oferece vincular, sem criar duplicata', async () => {
    const { bindStakeholderAction } = await import('@/app/actions/stakeholders')
    vi.mocked(bindStakeholderAction).mockResolvedValue({ success: true })
    renderComponent([], [makeSk('sk-existing', 'Empresa Beta')] as never)

    digitar('empresa beta')
    expect(screen.queryByRole('option', { name: /Criar «/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Adicionar Empresa Beta como externo/i }))

    await waitFor(() => {
      expect(bindStakeholderAction).toHaveBeenCalledWith(PROJ_ID, 'sk-existing')
    })
    await waitFor(() => expect(screen.getByText(/vinculado ao projeto/i)).toBeInTheDocument())
    await waitFor(() => expect(screen.getAllByText('Empresa Beta').length).toBeGreaterThan(0))
  })

  it('exibe toast de erro quando a criação rápida falha', async () => {
    vi.mocked(createStakeholderAction).mockResolvedValue({ error: 'Falha ao criar.' } as never)
    renderComponent()

    digitar('Xyz')
    fireEvent.click(screen.getByRole('option', { name: 'Criar «Xyz» como externo' }))

    await waitFor(() => expect(screen.getByText('Falha ao criar.')).toBeInTheDocument())
  })

  it('gerente não vê as opções de criar', () => {
    renderComponent([], [], 'gerente')

    digitar('Xyz')

    expect(screen.queryByRole('option', { name: /Criar «/i })).not.toBeInTheDocument()
  })
})

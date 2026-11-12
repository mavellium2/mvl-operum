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

describe('ProjetoStakeholdersClient — criação rápida a partir das buscas', () => {
  it('Col 1: oferta criar como externo quando a busca do projeto não encontra ninguém', async () => {
    vi.mocked(createStakeholderAction).mockResolvedValue(CRIADO as never)
    renderComponent()

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, e-mail ou empresa…'), {
      target: { value: 'Nova Empresa' },
    })

    const btn = screen.getByRole('button', { name: /Criar "Nova Empresa" como externo/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(createStakeholderAction).toHaveBeenCalledWith({ name: 'Nova Empresa' }, PROJ_ID)
    })
    await waitFor(() => expect(screen.getAllByText('Nova Empresa').length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.getByText(/criado e adicionado ao projeto/i)).toBeInTheDocument())
    // SDD 4.4: criado só com o nome, já abre o cadastro para completar os dados.
    expect(screen.getByText('Editar Stakeholder')).toBeInTheDocument()
  })

  it('Col 1: oferta criar como membro da equipe (usuário interno) quando a busca não encontra', () => {
    renderComponent()

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, e-mail ou empresa…'), {
      target: { value: 'Luan' },
    })

    const btn = screen.getByRole('button', { name: /Criar "Luan" como membro da equipe/i })
    fireEvent.click(btn)

    // Abre o formulário de criação de usuário interno com o nome preenchido
    expect(screen.getByText('Novo Membro da Equipe')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nome completo ou razão social')).toHaveValue('Luan')
    // Campos exclusivos de usuário interno (e-mail/senha na criação)
    expect(screen.getByPlaceholderText('usuario@empresa.com.br')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Mínimo 8 caracteres')).toBeInTheDocument()
  })

  it('Col 2 externo: oferta criar no diretório quando a busca externa não encontra', async () => {
    vi.mocked(createStakeholderAction).mockResolvedValue(CRIADO as never)
    renderComponent()

    fireEvent.click(screen.getByTitle('Adicionar'))
    fireEvent.click(screen.getByText('Stakeholder Externo'))

    fireEvent.change(screen.getByPlaceholderText('Buscar no diretório…'), {
      target: { value: 'Nova Empresa' },
    })

    const btn = screen.getByRole('button', { name: /Criar "Nova Empresa" no diretório/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(createStakeholderAction).toHaveBeenCalledWith({ name: 'Nova Empresa' })
    })
    await waitFor(() => expect(screen.getByText('Nova Empresa')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText(/criado no diretório/i)).toBeInTheDocument())
  })

  it('Col 2 externo: oferta criar como membro da equipe a partir do diretório', () => {
    renderComponent()

    fireEvent.click(screen.getByTitle('Adicionar'))
    fireEvent.click(screen.getByText('Stakeholder Externo'))

    fireEvent.change(screen.getByPlaceholderText('Buscar no diretório…'), {
      target: { value: 'Luan' },
    })

    const btn = screen.getByRole('button', { name: /Criar "Luan" como membro da equipe/i })
    fireEvent.click(btn)

    expect(screen.getByText('Novo Membro da Equipe')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Nome completo ou razão social')).toHaveValue('Luan')
  })

  it('Col 1: oferta vincular quando o nome já existe no diretório (evita duplicata)', async () => {
    const { bindStakeholderAction } = await import('@/app/actions/stakeholders')
    vi.mocked(bindStakeholderAction).mockResolvedValue({ success: true })
    renderComponent([], [makeSk('sk-existing', 'Empresa Beta')] as never)

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, e-mail ou empresa…'), {
      target: { value: 'empresa beta' },
    })

    // Texto muda para "Vincular ao projeto" em vez de "Criar"
    const btn = screen.getByRole('button', { name: /Vincular "Empresa Beta" ao projeto/i })
    fireEvent.click(btn)

    await waitFor(() => {
      expect(bindStakeholderAction).toHaveBeenCalledWith(PROJ_ID, 'sk-existing')
    })
    await waitFor(() => expect(screen.getByText(/vinculado ao projeto/i)).toBeInTheDocument())
    // Continua aparecendo na lista do projeto agora (e no painel de edição que abre)
    await waitFor(() => expect(screen.getAllByText('Empresa Beta').length).toBeGreaterThan(0))
  })

  it('exibe toast de erro quando a criação rápida falha', async () => {
    vi.mocked(createStakeholderAction).mockResolvedValue({ error: 'Falha ao criar.' } as never)
    renderComponent()

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, e-mail ou empresa…'), {
      target: { value: 'Xyz' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Criar "Xyz" como externo/i }))

    await waitFor(() => expect(screen.getByText('Falha ao criar.')).toBeInTheDocument())
  })

  it('não oferta criação para usuário não-admin', () => {
    renderComponent([], [], 'gerente')

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, e-mail ou empresa…'), {
      target: { value: 'Xyz' },
    })

    expect(screen.queryByRole('button', { name: /Criar .* como externo/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Criar .* como membro da equipe/i })).not.toBeInTheDocument()
  })

  it('Col 2 externo: cria apenas quando a busca tem conteúdo', () => {
    vi.mocked(createStakeholderAction).mockResolvedValue(CRIADO as never)
    renderComponent([], [makeSk('sk1', 'Empresa Existente')] as never)

    fireEvent.click(screen.getByTitle('Adicionar'))
    fireEvent.click(screen.getByText('Stakeholder Externo'))

    // Sem termo de busca: não mostra o botão de criar
    expect(screen.queryByRole('button', { name: /Criar .* no diretório/i })).not.toBeInTheDocument()
    expect(screen.getByText('Empresa Existente')).toBeInTheDocument()
  })
})
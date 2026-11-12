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
  uploadMemberSignatureAction: vi.fn(),
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

const PROJ_ID = 'p1'

function makeInterno(overrides: Partial<StakeholderUnificado> = {}): StakeholderUnificado {
  return {
    id: 'u1',
    tipo: 'interno',
    userId: 'u1',
    name: 'João Silva',
    email: 'joao@test.com',
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
    cargos: [],
    departamento: [],
    isGerente: false,
    hourlyRate: null,
    startDate: new Date().toISOString(),
    userRole: 'member',
    signatureUrl: null,
    ...overrides,
  }
}

function renderComponent(stakeholders: StakeholderUnificado[]) {
  return render(
    <ToastProvider>
      <ProjetoStakeholdersClient
        projetoId={PROJ_ID}
        stakeholders={stakeholders}
        stakeholdersDisponiveis={[]}
        usuariosDisponiveis={[]}
        funcoesExistentes={[]}
        departamentosExistentes={[]}
        userRole="admin"
      />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProjetoStakeholdersClient — campo de assinatura digital', () => {
  it('exibe campo de upload de assinatura quando membro interno é gerente', async () => {
    const gerente = makeInterno({ isGerente: true, cargos: ['Gerente de Projeto'] })
    renderComponent([gerente])

    fireEvent.click(screen.getByTitle('Editar'))

    await waitFor(() => {
      expect(screen.getByTestId('member-signature-upload')).toBeInTheDocument()
    })
  })

  it('não exibe campo de upload de assinatura quando membro interno não é gerente', async () => {
    const membro = makeInterno({ isGerente: false, cargos: ['Desenvolvedor'] })
    renderComponent([membro])

    fireEvent.click(screen.getByTitle('Editar'))

    await waitFor(() => {
      expect(screen.queryByTestId('member-signature-upload')).not.toBeInTheDocument()
    })
  })
})

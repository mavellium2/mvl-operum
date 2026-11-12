import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

const makeInterno = (id: string, name: string): StakeholderUnificado => ({
  id,
  tipo: 'interno',
  userId: `u-${id}`,
  name,
  email: `${id}@test.com`,
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
  remuneracao: null,
  horasDiarias: null,
})

function renderWithInterno(member = makeInterno('m1', 'Joao Silva')) {
  const { container } = render(
    <ToastProvider>
      <ProjetoStakeholdersClient
        projetoId={PROJ_ID}
        stakeholders={[member]}
        stakeholdersDisponiveis={[]}
        usuariosDisponiveis={[]}
        funcoesExistentes={[]}
        departamentosExistentes={[]}
        userRole="admin"
      />
    </ToastProvider>,
  )
  // click pencil edit button to open detail panel
  fireEvent.click(screen.getByTitle('Editar'))
  return { container }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProjetoStakeholdersClient — calculo de custo por remuneracao', () => {
  it('exibe inputs de Remuneracao mensal e Horas por dia', () => {
    renderWithInterno()
    expect(screen.getByLabelText(/Remunera/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Horas por dia/i)).toBeInTheDocument()
  })

  it('calcula corretamente dia, hora e minuto a partir de remuneracao e horas/dia', () => {
    renderWithInterno()

    // Currency handler treats raw digits as cents (divide by 100), so '100000' -> R$ 1.000,00
    fireEvent.change(screen.getByLabelText(/Remunera/i), { target: { value: '100000' } })
    fireEvent.change(screen.getByLabelText(/Horas por dia/i), { target: { value: '4' } })

    // valor_dia = 1000 / 30 ≈ 33,33
    // valor_hora = 33,33 / 4 ≈ 8,33
    // valor_minuto = 8,33 / 60 ≈ 0,14
    // Use regex to handle non-breaking space in pt-BR currency format
    expect(screen.getByTestId('valor-dia')).toHaveTextContent(/33,3[23]/)
    expect(screen.getByTestId('valor-hora')).toHaveTextContent(/8,3[23]/)
    expect(screen.getByTestId('valor-minuto')).toHaveTextContent(/0,1[34]/)
  })

  it('exibe tracos quando horas/dia e zero', () => {
    renderWithInterno()

    fireEvent.change(screen.getByLabelText(/Remunera/i), { target: { value: '100000' } })
    fireEvent.change(screen.getByLabelText(/Horas por dia/i), { target: { value: '0' } })

    expect(screen.getByTestId('valor-dia')).toHaveTextContent('—')
    expect(screen.getByTestId('valor-hora')).toHaveTextContent('—')
    expect(screen.getByTestId('valor-minuto')).toHaveTextContent('—')
  })

  it('exibe tracos quando horas/dia esta vazio', () => {
    renderWithInterno()

    fireEvent.change(screen.getByLabelText(/Remunera/i), { target: { value: '100000' } })
    fireEvent.change(screen.getByLabelText(/Horas por dia/i), { target: { value: '' } })

    expect(screen.getByTestId('valor-dia')).toHaveTextContent('—')
    expect(screen.getByTestId('valor-hora')).toHaveTextContent('—')
    expect(screen.getByTestId('valor-minuto')).toHaveTextContent('—')
  })

  it('nao exibe o campo antigo Valor/hora como input editavel', () => {
    renderWithInterno()
    expect(screen.queryByLabelText('Valor/hora')).not.toBeInTheDocument()
  })
})

describe('ProjetoStakeholdersClient — externo com os mesmos dados do interno', () => {
  const externo: StakeholderUnificado = {
    id: 'sk1', tipo: 'externo', stakeholderId: 'sk1', tenantId: 't1', name: 'Paulo Cliente', email: null, avatarUrl: null,
    phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null,
    company: 'Prefeitura', competence: 'Gestão', isActive: true, remuneracao: 3000, horasDiarias: 6, cargos: ['Cliente'], departamento: [],
  }
  function renderExterno() {
    render(
      <ToastProvider>
        <ProjetoStakeholdersClient projetoId={PROJ_ID} stakeholders={[externo]} stakeholdersDisponiveis={[]} usuariosDisponiveis={[]}
          funcoesExistentes={[]} departamentosExistentes={[]} userRole="admin" />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByTitle('Editar'))
  }

  it('mostra remuneração, horas por dia e calcula dia, hora e minuto também para externo', () => {
    renderExterno()
    expect(screen.getByLabelText(/Remunera/i)).toHaveValue('3.000,00')
    expect(screen.getByLabelText(/Horas por dia/i)).toHaveValue('6')
    expect(screen.getByTestId('valor-dia')).toHaveTextContent(/100,00/)
    expect(screen.getByTestId('valor-hora')).toHaveTextContent(/16,67/)
    expect(screen.getByTestId('valor-minuto')).toHaveTextContent(/0,28/)
    // Gerente é só do interno (depende de acesso ao sistema).
    expect(screen.queryByText('Gerente do Projeto')).not.toBeInTheDocument()
  })

  it('interno pode mudar para externo, com confirmação', async () => {
    const { tornarExternoAction } = await import('@/app/actions/stakeholders')
    vi.mocked(tornarExternoAction).mockResolvedValue({ success: true, cadastro: null } as never)
    renderWithInterno()
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para externo' }))
    expect(screen.getByText(/sai da equipe deste projeto e perde o acesso/)).toBeInTheDocument()
    const botoes = screen.getAllByRole('button', { name: 'Mudar para externo' })
    fireEvent.click(botoes[botoes.length - 1])
    await vi.waitFor(() => expect(tornarExternoAction).toHaveBeenCalledWith(PROJ_ID, 'u-m1'))
  })
})

describe('ProjetoStakeholdersClient — excluir do projeto', () => {
  it('pede confirmação e mostra por que não pode excluir quando há tarefas', async () => {
    const { removeMemberAction } = await import('@/app/actions/projects')
    vi.mocked(removeMemberAction).mockResolvedValue({ error: 'Não é possível excluir: a pessoa tem tarefas neste projeto (responsável por 2 card(s)). Inative com um motivo para tirar o acesso e manter o histórico.' } as never)
    render(
      <ToastProvider>
        <ProjetoStakeholdersClient projetoId={PROJ_ID} stakeholders={[makeInterno('m1', 'Joao Silva')]} stakeholdersDisponiveis={[]} usuariosDisponiveis={[]}
          funcoesExistentes={[]} departamentosExistentes={[]} userRole="admin" />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Joao Silva do projeto' }))
    expect(screen.getByText(/Só é possível sem tarefas aqui/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir do projeto' }))
    await vi.waitFor(() => expect(removeMemberAction).toHaveBeenCalledWith(PROJ_ID, 'u-m1'))
    expect(await screen.findByRole('alert')).toHaveTextContent('responsável por 2 card(s)')
    // Continua na lista: nada foi excluído.
    expect(screen.getAllByText('Joao Silva').length).toBeGreaterThan(0)
  })
})

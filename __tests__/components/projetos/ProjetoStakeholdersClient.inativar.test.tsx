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
  setStakeholderAtivoAction: vi.fn(),
}))
vi.mock('@/app/actions/projects', () => ({ addMemberAction: vi.fn(), removeMemberAction: vi.fn() }))
vi.mock('@/app/actions/projetos', () => ({ updateProjetoMemberAction: vi.fn(), setMembroAtivoAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ adminCreateUserAction: vi.fn() }))
vi.mock('@/components/profile/AvatarUpload', () => ({ default: () => <div /> }))
vi.mock('@/components/ui/AddressFields', () => ({
  default: () => <div />,
  emptyAddress: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
}))

import ProjetoStakeholdersClient, { type StakeholderUnificado } from '@/components/projetos/ProjetoStakeholdersClient'
import { setStakeholderAtivoAction } from '@/app/actions/stakeholders'
import { setMembroAtivoAction } from '@/app/actions/projetos'

const externo = (over: Partial<StakeholderUnificado> = {}): StakeholderUnificado => ({
  id: 'sk1', tipo: 'externo', stakeholderId: 'sk1', tenantId: 't1', name: 'Girassol', email: null, avatarUrl: null,
  phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null,
  notes: null, company: null, competence: null, isActive: true, ...over,
})

function renderComponent(stakeholders: StakeholderUnificado[]) {
  return render(
    <ToastProvider>
      <ProjetoStakeholdersClient
        projetoId="p1"
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

beforeEach(() => vi.clearAllMocks())

describe('inativar stakeholder com motivo', () => {
  it('pede o motivo, não envia vazio e grava com o motivo informado', async () => {
    vi.mocked(setStakeholderAtivoAction).mockResolvedValue({ success: true, stakeholder: {} } as never)
    renderComponent([externo()])

    fireEvent.click(screen.getByRole('button', { name: 'Inativar Girassol' }))
    fireEvent.click(screen.getByRole('button', { name: 'Inativar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Informe o motivo da inativação.')
    expect(setStakeholderAtivoAction).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Motivo da inativação'), { target: { value: 'Contrato encerrado' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inativar' }))

    await waitFor(() => expect(setStakeholderAtivoAction).toHaveBeenCalledWith('p1', 'sk1', false, 'Contrato encerrado'))
    await waitFor(() => expect(screen.getByText('Motivo: Contrato encerrado')).toBeInTheDocument())
    expect(screen.getByText('Inativo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reativar Girassol' })).toBeInTheDocument()
  })

  it('stakeholder inativo aparece em vermelho com o motivo, e reativar volta ao normal', async () => {
    vi.mocked(setStakeholderAtivoAction).mockResolvedValue({ success: true, stakeholder: {} } as never)
    renderComponent([externo({ isActive: false, inactiveReason: 'Saiu do projeto' })])

    expect(screen.getByText('Girassol').className).toContain('text-red-700')
    expect(screen.getByText('Motivo: Saiu do projeto')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reativar Girassol' }))
    await waitFor(() => expect(setStakeholderAtivoAction).toHaveBeenCalledWith('p1', 'sk1', true))
    await waitFor(() => expect(screen.queryByText('Inativo')).not.toBeInTheDocument())
    expect(screen.queryByText(/Motivo:/)).not.toBeInTheDocument()
  })

  it('erro do servidor aparece no diálogo e o stakeholder continua ativo', async () => {
    vi.mocked(setStakeholderAtivoAction).mockResolvedValue({ error: 'Sem permissão' } as never)
    renderComponent([externo()])
    fireEvent.click(screen.getByRole('button', { name: 'Inativar Girassol' }))
    fireEvent.change(screen.getByLabelText('Motivo da inativação'), { target: { value: 'Não participa mais' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inativar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sem permissão'))
    expect(screen.queryByText('Inativo')).not.toBeInTheDocument()
  })
})

describe('lista dividida em equipe e externos', () => {
  const membro = (id: string, name: string): StakeholderUnificado => ({
    id, tipo: 'interno', userId: id, name, email: `${id}@x.com`, avatarUrl: null, phone: null, cep: null, logradouro: null,
    numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null, cargos: [], departamento: [],
    isGerente: false, hourlyRate: null, startDate: '2026-09-01T00:00:00.000Z', userRole: 'member',
  })

  it('membros da equipe primeiro, externos depois, cada grupo com cabeçalho e contagem', () => {
    // Externo vem antes na entrada: a tela agrupa mesmo assim.
    renderComponent([externo({ id: 'sk1', name: 'Girassol' }), membro('u1', 'Ana'), membro('u2', 'Bia')])
    const cabecalhos = screen.getAllByTestId(/^grupo-/)
    expect(cabecalhos.map(c => c.dataset.testid)).toEqual(['grupo-interno', 'grupo-externo'])
    expect(cabecalhos[0]).toHaveTextContent('Membros da equipe')
    expect(cabecalhos[0]).toHaveTextContent('2')
    expect(cabecalhos[1]).toHaveTextContent('Stakeholders externos')
    expect(cabecalhos[1]).toHaveTextContent('1')
    const nomes = screen.getAllByText(/^(Ana|Bia|Girassol)$/).map(n => n.textContent)
    expect(nomes).toEqual(['Ana', 'Bia', 'Girassol'])
  })

  it('sem externos, só o cabeçalho da equipe', () => {
    renderComponent([membro('u1', 'Ana')])
    expect(screen.queryByTestId('grupo-externo')).not.toBeInTheDocument()
    expect(screen.getByTestId('grupo-interno')).toBeInTheDocument()
  })
})

describe('inativar membro da equipe', () => {
  const membro = (over: Partial<StakeholderUnificado> = {}): StakeholderUnificado => ({
    id: 'u1', tipo: 'interno', userId: 'u1', name: 'Ana', email: 'ana@x.com', avatarUrl: null, phone: null, cep: null,
    logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null, cargos: [],
    departamento: [], isGerente: false, hourlyRate: null, startDate: '2026-09-01T00:00:00.000Z', userRole: 'member',
    isActive: true, ...over,
  })

  it('o botão tem texto e aparece também para membros; avisa que perde o acesso', async () => {
    vi.mocked(setMembroAtivoAction).mockResolvedValue({ success: true, pendentes: 2 } as never)
    renderComponent([membro()])

    const botao = screen.getByRole('button', { name: 'Inativar Ana' })
    expect(botao).toHaveTextContent('Inativar')
    fireEvent.click(botao)
    expect(screen.getByText(/perde o acesso ao projeto/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Motivo da inativação'), { target: { value: 'Saiu da equipe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inativar' }))

    await waitFor(() => expect(setMembroAtivoAction).toHaveBeenCalledWith('p1', 'u1', false, 'Saiu da equipe'))
    expect(setStakeholderAtivoAction).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText('Motivo: Saiu da equipe')).toBeInTheDocument())
    expect(screen.getByText('Ana').className).toContain('text-red-700')
    expect(await screen.findByText(/2 card\(s\) precisam de outro responsável/)).toBeInTheDocument()
  })

  it('membro inativo reativa pelo próprio botão', async () => {
    vi.mocked(setMembroAtivoAction).mockResolvedValue({ success: true, pendentes: 0 } as never)
    renderComponent([membro({ isActive: false, inactiveReason: 'Licença' })])
    fireEvent.click(screen.getByRole('button', { name: 'Reativar Ana' }))
    await waitFor(() => expect(setMembroAtivoAction).toHaveBeenCalledWith('p1', 'u1', true))
    await waitFor(() => expect(screen.queryByText('Motivo: Licença')).not.toBeInTheDocument())
  })

  it('erro do servidor (ex.: gerente) aparece no diálogo', async () => {
    vi.mocked(setMembroAtivoAction).mockResolvedValue({ error: 'Este membro é gerente do projeto.' } as never)
    renderComponent([membro()])
    fireEvent.click(screen.getByRole('button', { name: 'Inativar Ana' }))
    fireEvent.change(screen.getByLabelText('Motivo da inativação'), { target: { value: 'Saiu da equipe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inativar' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('gerente do projeto'))
  })
})

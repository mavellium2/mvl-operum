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
vi.mock('@/app/actions/admin', () => ({ gerenteCreateUserAction: vi.fn() }))
vi.mock('@/components/profile/AvatarUpload', () => ({ default: () => <div /> }))
vi.mock('@/components/ui/AddressFields', () => ({
  default: () => <div />,
  emptyAddress: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
}))

import ProjetoStakeholdersClient, { type StakeholderUnificado } from '@/components/projetos/ProjetoStakeholdersClient'
import { updateProjetoMemberAction } from '@/app/actions/projetos'

const membro = (over: Partial<StakeholderUnificado> = {}): StakeholderUnificado => ({
  id: 'u2', tipo: 'interno', userId: 'u2', name: 'Aluno Silva', email: 'aluno@fatec.br', avatarUrl: null,
  phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null,
  notes: null, cargos: [], departamento: [], isGerente: false, userRole: 'member', ...over,
})

function renderComo(userRole: 'admin' | 'gerente', pessoas: StakeholderUnificado[]) {
  return render(
    <ToastProvider>
      <ProjetoStakeholdersClient projetoId="p1" stakeholders={pessoas} stakeholdersDisponiveis={[]} usuariosDisponiveis={[]}
        funcoesExistentes={[]} departamentosExistentes={[]} userRole={userRole} />
    </ToastProvider>,
  )
}

beforeEach(() => vi.clearAllMocks())

describe('gerente edita os dados da equipe (pedido 22/11, item 2.2)', () => {
  it('libera nome, contato e observações; e-mail de login, remuneração e cargos seguem só do admin', async () => {
    vi.mocked(updateProjetoMemberAction).mockResolvedValue({ success: true })
    renderComo('gerente', [membro()])
    fireEvent.click(screen.getByRole('button', { name: 'Editar Aluno Silva' }))

    const nome = screen.getByPlaceholderText('Nome completo ou razão social')
    expect(nome).toBeEnabled()
    expect(screen.getByPlaceholderText('Anotações internas…')).toBeEnabled()
    expect(screen.getByPlaceholderText('contato@empresa.com.br')).toBeDisabled()
    expect(screen.getByLabelText('Remuneração mensal')).toBeDisabled()
    expect(screen.getByLabelText('Horas por dia')).toBeDisabled()

    fireEvent.change(nome, { target: { value: 'Aluno Souza' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Dados' }))
    await waitFor(() => expect(updateProjetoMemberAction).toHaveBeenCalled())
    const dados = vi.mocked(updateProjetoMemberAction).mock.calls[0][2]
    expect(dados.name).toBe('Aluno Souza')
    expect(dados.email).toBeUndefined()
    expect(dados.cargos).toBeUndefined()
    expect(dados.isGerente).toBeUndefined()
    expect(dados.remuneracao).toBeUndefined()
  })

  it('a conta de um administrador fica somente leitura para o gerente', () => {
    renderComo('gerente', [membro({ userRole: 'admin', name: 'Professor' })])
    fireEvent.click(screen.getByRole('button', { name: 'Editar Professor' }))
    expect(screen.getByPlaceholderText('Nome completo ou razão social')).toBeDisabled()
    expect(screen.getByText(/modo somente leitura/)).toBeInTheDocument()
  })
})

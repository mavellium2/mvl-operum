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
vi.mock('@/app/actions/projects', () => ({ addMemberAction: vi.fn(), removeMemberAction: vi.fn() }))
vi.mock('@/app/actions/projetos', () => ({ updateProjetoMemberAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ adminCreateUserAction: vi.fn() }))
vi.mock('@/components/profile/AvatarUpload', () => ({
  default: ({ name }: { name: string }) => <div data-testid="avatar-upload">{name}</div>,
}))
vi.mock('@/components/ui/AddressFields', () => ({
  default: () => <div data-testid="address-fields" />,
  emptyAddress: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' },
}))

import ProjetoStakeholdersClient, { type StakeholderUnificado } from '@/components/projetos/ProjetoStakeholdersClient'
import { createStakeholderAction } from '@/app/actions/stakeholders'
import { addMemberAction } from '@/app/actions/projects'
import { updateProjetoMemberAction } from '@/app/actions/projetos'
import { adminCreateUserAction } from '@/app/actions/admin'

const PROJ = 'p1'

function renderComponent() {
  return render(
    <ToastProvider>
      <ProjetoStakeholdersClient
        projetoId={PROJ}
        stakeholders={[]}
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

describe('SDD 4.4 — stakeholder novo já na tela certa', () => {
  it('membro da equipe: grava remuneração e horas junto com a criação e abre o cadastro em edição', async () => {
    vi.mocked(adminCreateUserAction).mockResolvedValue({
      user: { id: 'u-novo', name: 'Luan', email: 'luan@x.com', avatarUrl: null, role: 'member' },
    } as never)
    vi.mocked(addMemberAction).mockResolvedValue({ success: true } as never)
    vi.mocked(updateProjetoMemberAction).mockResolvedValue({ success: true } as never)
    renderComponent()

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, e-mail ou empresa…'), { target: { value: 'Luan' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar "Luan" como membro da equipe/i }))
    fireEvent.change(screen.getByPlaceholderText('usuario@empresa.com.br'), { target: { value: 'luan@x.com' } })
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'senha-forte-1' } })
    fireEvent.change(screen.getByLabelText('Remuneração mensal'), { target: { value: '300000' } })
    fireEvent.change(screen.getByLabelText('Horas por dia'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Stakeholder' }))

    await waitFor(() => expect(updateProjetoMemberAction).toHaveBeenCalled())
    // Antes esses dados eram descartados e era preciso editar de novo.
    expect(updateProjetoMemberAction).toHaveBeenCalledWith('u-novo', PROJ, expect.objectContaining({
      remuneracao: 3000,
      horasDiarias: 8,
    }))
    await waitFor(() => expect(screen.getByText('Editar Membro')).toBeInTheDocument())
    expect(screen.getByLabelText('Horas por dia')).toHaveValue('8')
  })

  it('membro sem dados do projeto preenchidos: não chama a atualização à toa, mas abre em edição', async () => {
    vi.mocked(adminCreateUserAction).mockResolvedValue({
      user: { id: 'u-novo', name: 'Ana', email: 'ana@x.com', avatarUrl: null, role: 'member' },
    } as never)
    vi.mocked(addMemberAction).mockResolvedValue({ success: true } as never)
    renderComponent()

    fireEvent.change(screen.getByPlaceholderText('Buscar por nome, e-mail ou empresa…'), { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('button', { name: /Criar "Ana" como membro da equipe/i }))
    fireEvent.change(screen.getByPlaceholderText('usuario@empresa.com.br'), { target: { value: 'ana@x.com' } })
    fireEvent.change(screen.getByPlaceholderText('Mínimo 8 caracteres'), { target: { value: 'senha-forte-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Stakeholder' }))

    await waitFor(() => expect(screen.getByText('Editar Membro')).toBeInTheDocument())
    expect(updateProjetoMemberAction).not.toHaveBeenCalled()
  })

  it('externo pelo "Adicionar ao projeto": cria já vinculado e abre o cadastro em edição', async () => {
    vi.mocked(createStakeholderAction).mockResolvedValue({
      success: true,
      stakeholder: { id: 'sk-novo', tenantId: 't1', name: 'Girassol' },
    } as never)
    renderComponent()

    fireEvent.click(screen.getByTitle('Adicionar'))
    fireEvent.click(screen.getByRole('button', { name: 'Stakeholder Externo' }))
    fireEvent.click(screen.getByTitle('Novo stakeholder'))
    const nome = screen.getAllByRole('textbox').find(el => (el as HTMLInputElement).value === '' && el.getAttribute('type') !== 'email')!
    fireEvent.change(nome, { target: { value: 'Girassol' } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar Stakeholder' }))

    await waitFor(() => expect(createStakeholderAction).toHaveBeenCalled())
    expect(vi.mocked(createStakeholderAction).mock.calls[0][1]).toBe(PROJ)
    await waitFor(() => expect(screen.getByText('Editar Stakeholder')).toBeInTheDocument())
  })
})

describe('SDD 4.5 — horas por dia fracionadas e validadas', () => {
  const membro: StakeholderUnificado = {
    id: 'u1', tipo: 'interno', userId: 'u1', name: 'Bia', email: 'bia@x.com', avatarUrl: null,
    phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null,
    cidade: null, estado: null, notes: null, cargos: [], departamento: [], isGerente: false,
    hourlyRate: null, horasDiarias: 7.5, startDate: '2026-09-01T00:00:00.000Z', userRole: 'member',
  }

  function editarBia() {
    render(
      <ToastProvider>
        <ProjetoStakeholdersClient
          projetoId={PROJ}
          stakeholders={[membro]}
          stakeholdersDisponiveis={[]}
          usuariosDisponiveis={[]}
          funcoesExistentes={[]}
          departamentosExistentes={[]}
          userRole="admin"
        />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByTitle('Editar'))
    return screen.getByLabelText('Horas por dia')
  }

  it('mostra o valor salvo com vírgula', () => {
    expect(editarBia()).toHaveValue('7,5')
  })

  it('"8,5" (vírgula, que o Firefox perdia) é salvo como 8,5', async () => {
    vi.mocked(updateProjetoMemberAction).mockResolvedValue({ success: true } as never)
    fireEvent.change(editarBia(), { target: { value: '8,5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Dados' }))
    await waitFor(() => expect(updateProjetoMemberAction).toHaveBeenCalled())
    expect(vi.mocked(updateProjetoMemberAction).mock.calls[0][2]).toMatchObject({ horasDiarias: 8.5 })
  })

  it('"8:30" mostra a conversão e salva 8,5', async () => {
    vi.mocked(updateProjetoMemberAction).mockResolvedValue({ success: true } as never)
    fireEvent.change(editarBia(), { target: { value: '8:30' } })
    expect(screen.getByText('= 8,5 h')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Dados' }))
    await waitFor(() => expect(updateProjetoMemberAction).toHaveBeenCalled())
    expect(vi.mocked(updateProjetoMemberAction).mock.calls[0][2]).toMatchObject({ horasDiarias: 8.5 })
  })

  it('"30" mostra o erro e bloqueia o Salvar, sem gravar nada', () => {
    const campo = editarBia()
    fireEvent.change(campo, { target: { value: '30' } })
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/entre 0 e 24/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar Dados' })).toBeDisabled()
    expect(updateProjetoMemberAction).not.toHaveBeenCalled()
  })
})

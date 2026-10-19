import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('@/app/actions/stakeholders', () => ({
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
import { reorderStakeholdersAction } from '@/app/actions/stakeholders'

const PROJ_ID = 'p1'

const makeSk = (id: string, name: string): StakeholderUnificado => ({
  id,
  tipo: 'externo',
  stakeholderId: id,
  tenantId: 't1',
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
  company: 'Empresa Teste',
  competence: null,
  isActive: true,
})

const DEFAULT_STAKEHOLDERS: StakeholderUnificado[] = [
  makeSk('sk1', 'Empresa Beta'),
  makeSk('sk2', 'Empresa Alpha'),
]

function renderComponent(stakeholders = DEFAULT_STAKEHOLDERS) {
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
  vi.mocked(reorderStakeholdersAction).mockResolvedValue({ success: true })
})

describe('ProjetoStakeholdersClient — reordenação por drag and drop', () => {
  it('renderiza os dois stakeholders na lista', () => {
    renderComponent()
    expect(screen.getByText('Empresa Beta')).toBeInTheDocument()
    expect(screen.getByText('Empresa Alpha')).toBeInTheDocument()
  })

  it('chama reorderStakeholdersAction com IDs na nova ordem ao fazer drop', async () => {
    renderComponent()

    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }))
    const items = screen.getAllByRole('listitem')
    // item[0] = Empresa Beta (sk1), item[1] = Empresa Alpha (sk2)
    // drag sk1 → drop na posição de sk2 → nova ordem: [sk2, sk1]
    fireEvent.dragStart(items[0])
    fireEvent.dragOver(items[1])
    fireEvent.drop(items[1])

    await waitFor(() => {
      expect(reorderStakeholdersAction).toHaveBeenCalledWith(PROJ_ID, ['sk2', 'sk1'])
    })
  })

  it('exibe mensagem de erro inline quando reorderStakeholdersAction falha', async () => {
    vi.mocked(reorderStakeholdersAction).mockResolvedValue({ error: 'Erro de rede' })

    renderComponent()

    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }))
    const items = screen.getAllByRole('listitem')
    fireEvent.dragStart(items[0])
    fireEvent.dragOver(items[1])
    fireEvent.drop(items[1])

    await waitFor(() => {
      expect(screen.getByText(/Falha ao salvar a nova ordem/i)).toBeInTheDocument()
    })
  })

  it('reverte a ordem localmente quando a API falha', async () => {
    vi.mocked(reorderStakeholdersAction).mockResolvedValue({ error: 'Erro de rede' })

    renderComponent()

    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }))
    const items = screen.getAllByRole('listitem')
    fireEvent.dragStart(items[0])
    fireEvent.dragOver(items[1])
    fireEvent.drop(items[1])

    await waitFor(() => {
      const names = screen.getAllByRole('listitem').map(li => li.textContent)
      // Após reversão, Beta deve voltar a ser o primeiro
      expect(names[0]).toContain('Empresa Beta')
    })
  })
})


describe('Stakeholders — filtros e ordenação acessível', () => {
  it('não permite arrastar fora do modo de ordenação e move por botão quando ativado', async () => {
    renderComponent()
    const [first, second] = screen.getAllByRole('listitem')
    expect(first).toHaveAttribute('draggable', 'false')
    fireEvent.dragStart(first)
    fireEvent.drop(second)
    expect(reorderStakeholdersAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mover Empresa Beta para baixo' }))
    await waitFor(() => expect(reorderStakeholdersAction).toHaveBeenCalledWith(PROJ_ID, ['sk2', 'sk1']))
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Empresa Alpha')
  })

  it('combina busca sem acento, vínculo e empresa e recupera a lista ao limpar', () => {
    renderComponent([makeSk('sk1', 'Márcio'), { ...makeSk('sk2', 'Ana'), company: 'Outra empresa' }])
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pessoa' }), { target: { value: 'marcio' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Vínculo' }), { target: { value: 'externo' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Área ou empresa' }), { target: { value: 'Empresa Teste' } })
    expect(screen.getByRole('status')).toHaveTextContent('1 de 2 pessoas')
    expect(screen.getByRole('button', { name: 'Reordenar' })).toBeDisabled()
    expect(within(screen.getByRole('list', { name: 'Pessoas do projeto' })).queryByText('Ana')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.getByRole('status')).toHaveTextContent('2 de 2 pessoas')
  })

  it('reverte uma falha de rede lançada e permite tentar novamente', async () => {
    vi.mocked(reorderStakeholdersAction).mockRejectedValueOnce(new Error('network'))
    renderComponent()
    fireEvent.click(screen.getByRole('button', { name: 'Reordenar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mover Empresa Beta para baixo' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('A ordenação foi revertida'))
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Empresa Beta')
    fireEvent.click(screen.getByRole('button', { name: 'Mover Empresa Beta para baixo' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('Empresa Alpha')
  })
})

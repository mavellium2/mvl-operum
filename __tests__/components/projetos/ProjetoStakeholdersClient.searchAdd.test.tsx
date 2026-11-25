import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
import { addMemberAction } from '@/app/actions/projects'

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

const campo = () => screen.getByRole('combobox', { name: 'Adicionar integrante' })
const digitar = (v: string) => fireEvent.change(campo(), { target: { value: v } })

beforeEach(() => vi.clearAllMocks())

describe('Stakeholders — campo único "Adicionar integrante"', () => {
  it('não expõe mais o menu "Adicionar pessoa" nem "Usuários do Sistema"', () => {
    renderComponent()
    expect(screen.queryByText(/Adicionar pessoa/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Vincular Membro/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Usuários do Sistema/i)).not.toBeInTheDocument()
  })

  it('ao digitar, lista usuários existentes e o diretório, e oferece criar quando não há nome exato', () => {
    renderComponent()
    digitar('be')

    expect(screen.getByRole('option', { name: /Adicionar Beatriz Souza à equipe/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Adicionar Empresa Beta como externo/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Criar «be» na equipe/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Criar «be» como externo/ })).toBeInTheDocument()
  })

  it('busca pela empresa também encontra o stakeholder do diretório', () => {
    renderComponent()
    digitar('s.a.')
    expect(screen.getByRole('option', { name: /Adicionar Empresa Beta como externo/ })).toBeInTheDocument()
  })

  it('nome exato de usuário existente: vincula com um clique, sem oferecer criar, e o campo segue focado', async () => {
    renderComponent()
    campo().focus()
    digitar('beatriz souza')
    expect(screen.queryByRole('option', { name: /Criar «/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: /Adicionar Beatriz Souza à equipe/ }))

    await waitFor(() => expect(addMemberAction).toHaveBeenCalledWith('p1', 'u7'))
    await waitFor(() => expect(screen.getByText(/"Beatriz Souza" adicionado ao projeto/)).toBeInTheDocument())
    expect(campo()).toHaveValue('')
    expect(campo()).toHaveFocus()
    // Não abre o cadastro: pronto para a próxima pessoa.
    expect(screen.queryByText('Editar Membro')).not.toBeInTheDocument()
  })

  it('teclado: Enter escolhe a opção ativa e as setas mudam a opção ativa', async () => {
    renderComponent()
    digitar('be')
    expect(campo()).toHaveAttribute('aria-activedescendant', 'adicionar-opcao-0')
    fireEvent.keyDown(campo(), { key: 'ArrowDown' })
    expect(campo()).toHaveAttribute('aria-activedescendant', 'adicionar-opcao-1')
    fireEvent.keyDown(campo(), { key: 'Enter' })

    await waitFor(() => expect(bindStakeholderAction).toHaveBeenCalledWith('p1', 'sk1'))
    expect(campo()).toHaveValue('')
    expect(campo()).toHaveFocus()
  })

  it('Escape limpa o texto', () => {
    renderComponent()
    digitar('be')
    fireEvent.keyDown(campo(), { key: 'Escape' })
    expect(campo()).toHaveValue('')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('sem texto, a lista não aparece', () => {
    renderComponent()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('gerente adiciona quem existe e só cria como externo', () => {
    renderComponent('gerente')
    digitar('be')
    expect(screen.getByRole('option', { name: /Adicionar Beatriz Souza à equipe/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Criar «be» na equipe/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Criar «be» como externo/ })).toBeInTheDocument()
  })

  it('ao focar o campo vazio, lista todos; sobrenome e termos fora de ordem também acham', () => {
    renderComponent()
    fireEvent.focus(campo())
    expect(screen.getByRole('option', { name: /Adicionar Beatriz Souza à equipe/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /Adicionar Empresa Beta como externo/ })).toBeInTheDocument()
    digitar('souza beatriz')
    expect(screen.getByRole('option', { name: /Adicionar Beatriz Souza à equipe/ })).toBeInTheDocument()
    digitar('souza')
    expect(screen.getByRole('option', { name: /Adicionar Beatriz Souza à equipe/ })).toBeInTheDocument()
  })

  it('a mesma pessoa que é usuário e contato aparece uma vez, com as duas escolhas: Equipe e Externo', async () => {
    const { adicionarUsuarioComoExternoAction } = await import('@/app/actions/stakeholders')
    vi.mocked(adicionarUsuarioComoExternoAction).mockResolvedValue({ success: true, cadastro: null } as never)
    render(
      <ToastProvider>
        <ProjetoStakeholdersClient projetoId="p1" stakeholders={[]} usuariosDisponiveis={[usuario] as never}
          stakeholdersDisponiveis={[{ ...externo, id: 'usuario:u7', name: 'Beatriz Souza', company: null, userId: 'u7' }] as never}
          funcoesExistentes={[]} departamentosExistentes={[]} userRole="admin" />
      </ToastProvider>,
    )
    digitar('beatriz')
    // Uma só pessoa (a outra linha do grupo é a oferta de criar um nome novo, já que "beatriz" não é o nome inteiro).
    expect(within(screen.getByRole('listbox')).getAllByRole('group', { name: 'Beatriz Souza' })).toHaveLength(1)
    expect(screen.getByRole('option', { name: 'Adicionar Beatriz Souza à equipe' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Adicionar Beatriz Souza como externo' }))
    await waitFor(() => expect(adicionarUsuarioComoExternoAction).toHaveBeenCalledWith('p1', 'u7'))
    expect(addMemberAction).not.toHaveBeenCalled()
  })

  it('quem só existe como externo só oferece Externo; quem só é usuário só oferece Equipe', () => {
    renderComponent()
    digitar('be')
    expect(screen.queryByRole('option', { name: 'Adicionar Beatriz Souza como externo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Adicionar Empresa Beta à equipe' })).not.toBeInTheDocument()
  })

  it('nome novo oferece criar na equipe ou como externo (e nada disso para o gerente)', () => {
    renderComponent()
    digitar('Xyz')
    expect(screen.getByRole('option', { name: 'Criar «Xyz» na equipe' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Criar «Xyz» como externo' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Parte interessada externa/i })).not.toBeInTheDocument()
  })
})

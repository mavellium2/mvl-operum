import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('@/app/actions/cadastroStakeholders', () => ({ carregarCadastroStakeholdersAction: vi.fn().mockResolvedValue({ error: 'x' }) }))
vi.mock('@/app/actions/stakeholders', () => {
  const ok = () => vi.fn().mockResolvedValue({ success: true, cadastro: null })
  return {
    createStakeholderAction: ok(), updateStakeholderAction: ok(), bindStakeholderAction: ok(), unbindStakeholderAction: ok(),
    reorderStakeholdersAction: ok(), reorderMembersAction: ok(), uploadMemberSignatureAction: ok(), setStakeholderAtivoAction: ok(),
    adicionarUsuarioComoExternoAction: ok(), tornarExternoAction: ok(), tornarInternoAction: ok(), salvarDadosDoExternoAction: ok(), salvarEmpresaDoMembroAction: ok(),
  }
})
vi.mock('@/app/actions/projects', () => ({ addMemberAction: vi.fn(), removeMemberAction: vi.fn() }))
vi.mock('@/app/actions/projetos', () => ({ updateProjetoMemberAction: vi.fn(), setMembroAtivoAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ gerenteCreateUserAction: vi.fn() }))
vi.mock('@/components/profile/AvatarUpload', () => ({ default: () => null }))
vi.mock('@/components/ui/AddressFields', () => ({ default: () => null, emptyAddress: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' } }))
import ProjetoStakeholdersClient, { type StakeholderUnificado } from '@/components/projetos/ProjetoStakeholdersClient'
import { tornarExternoAction, tornarInternoAction } from '@/app/actions/stakeholders'

const base = { email: null, avatarUrl: null, phone: null, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, notes: null }
const pessoas: StakeholderUnificado[] = [
  { ...base, id: 'i1', tipo: 'interno', name: 'Émerson', email: 'e@x.com', userId: 'u1', cargos: ['Gerente de projeto'], departamento: ['Gestão'], isGerente: true, remuneracao: 1200, isActive: true },
  { ...base, id: 'i2', tipo: 'interno', name: 'Beatriz', userId: 'u2', cargos: ['Dev', 'QA', 'Tech Lead'], departamento: ['TI'], isActive: true },
  { ...base, id: 'i3', tipo: 'interno', name: 'Claudia', userId: 'u3', isActive: false, inactiveReason: 'Saiu do projeto' },
  { ...base, id: 'e1', tipo: 'externo', name: 'Fábio', stakeholderId: 's1', tenantId: 't1', company: 'Fatec', competence: 'Cliente', isActive: true },
]
const montar = (userRole: 'admin' | 'gerente' = 'admin', lista = pessoas) => render(
  <ToastProvider><ProjetoStakeholdersClient projetoId="p1" stakeholders={lista} stakeholdersDisponiveis={[]} usuariosDisponiveis={[]} funcoesExistentes={[]} departamentosExistentes={[]} userRole={userRole} /></ToastProvider>,
)
const linhas = () => screen.getAllByRole('row').filter(r => r.querySelector('td'))
const abrirFiltros = () => { fireEvent.click(screen.getByRole('button', { name: /^Filtros/ })); return screen.getByRole('dialog', { name: 'Filtrar pessoas' }) }

describe('Stakeholders — lista de pessoas', () => {
  it('tabela com um cabeçalho de colunas, grupos e etiquetas (gerente, inativo, função com +N)', () => {
    montar()
    const tabela = screen.getByRole('table', { name: 'Pessoas do projeto' })
    expect(within(tabela).getAllByRole('columnheader').map(h => h.textContent)).toEqual(expect.arrayContaining(['Pessoa', 'Função', 'Área / empresa', 'Remuneração']))
    expect(screen.getByTestId('grupo-interno')).toHaveTextContent('Membros da equipe3')
    expect(screen.getByTestId('grupo-externo')).toHaveTextContent('Stakeholders externos1')
    expect(linhas()).toHaveLength(4)
    expect(within(linhas()[0]).getByText('Gerente')).toBeInTheDocument()
    expect(within(linhas()[1]).getByText('+1')).toBeInTheDocument()
    expect(within(linhas()[2]).getByText('Inativo')).toBeInTheDocument()
    expect(linhas()[2]).toHaveAttribute('data-inativo')
    expect(within(linhas()[2]).getByText('Motivo: Saiu do projeto')).toBeInTheDocument()
    // Cada linha tem as ações com nome acessível, sem texto repetido por linha.
    expect(within(linhas()[0]).getByRole('button', { name: 'Editar Émerson' })).toBeInTheDocument()
    expect(within(linhas()[0]).getByRole('button', { name: 'Inativar Émerson' })).toBeInTheDocument()
    expect(within(linhas()[2]).getByRole('button', { name: 'Reativar Claudia' })).toBeInTheDocument()
  })

  it('o botão Filtros combina Vínculo, Situação e Área; mostra quantos estão ativos e etiquetas removíveis', () => {
    montar()
    const painel = abrirFiltros()
    fireEvent.click(within(painel).getByRole('button', { name: 'Inativos' }))
    expect(linhas().map(r => r.textContent)).toEqual([expect.stringContaining('Claudia')])
    expect(screen.getByRole('button', { name: 'Filtros (1 ativo)' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('1 pessoa de 4 (filtrado)')
    // Marcar também "Ativos" soma as duas situações: volta a aparecer todo mundo (e continua sendo um filtro só).
    fireEvent.click(within(painel).getByRole('button', { name: 'Ativos' }))
    expect(linhas()).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Filtros (1 ativo)' })).toBeInTheDocument()
    fireEvent.click(within(painel).getByRole('button', { name: 'Inativos' }))
    expect(linhas()).toHaveLength(3)
    fireEvent.click(within(painel).getByRole('button', { name: 'Externos' }))
    fireEvent.click(within(painel).getByRole('button', { name: 'Fatec' }))
    expect(linhas()).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Filtros (3 ativos)' })).toBeInTheDocument()
    const etiquetas = screen.getByRole('list', { name: 'Filtros ativos' })
    fireEvent.click(within(etiquetas).getByRole('button', { name: 'Remover filtro: Fatec' }))
    expect(screen.getByRole('button', { name: 'Filtros (2 ativos)' })).toBeInTheDocument()
    expect(linhas()).toHaveLength(1)
    fireEvent.click(within(painel).getByRole('button', { name: 'Limpar' }))
    expect(linhas()).toHaveLength(4)
    expect(screen.queryByRole('list', { name: 'Filtros ativos' })).toBeNull()
  })

  it('várias opções do mesmo filtro somam (equipe ou externos)', () => {
    montar()
    const painel = abrirFiltros()
    fireEvent.click(within(painel).getByRole('button', { name: 'Gestão' }))
    expect(linhas()).toHaveLength(1)
    fireEvent.click(within(painel).getByRole('button', { name: 'TI' }))
    expect(linhas()).toHaveLength(2)
  })

  it('sem pessoas: estado vazio com a orientação certa para quem gerencia e para quem não', () => {
    const { unmount } = montar('admin', [])
    expect(screen.getByText('Este projeto ainda não tem pessoas')).toBeInTheDocument()
    expect(screen.getByText(/Use o campo Adicionar integrante/)).toBeInTheDocument()
    unmount()
  })

  it('busca sem resultado oferece limpar os filtros', () => {
    montar()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pessoa' }), { target: { value: 'zzzz' } })
    expect(screen.getByText('Nenhuma pessoa encontrada')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0])
    expect(linhas()).toHaveLength(4)
  })

  it('a página não tem cabeçalho visível repetido: só o título para leitores de tela', () => {
    montar()
    expect(screen.getByRole('heading', { level: 1, name: 'Stakeholders do projeto' })).toHaveClass('sr-only')
  })

  it('trocar de vínculo é um ícone na linha: interno vira externo com confirmação, sem cadastrar de novo', async () => {
    montar()
    fireEvent.click(within(linhas()[1]).getByRole('button', { name: 'Mudar Beatriz para externo' }))
    expect(await screen.findByText(/sai da equipe deste projeto e perde o acesso/)).toBeInTheDocument()
    expect(tornarExternoAction).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para externo' }))
    await waitFor(() => expect(tornarExternoAction).toHaveBeenCalledWith('p1', 'u2'))
  })

  it('externo com login vira interno pela mesma ação; sem permissão de gerenciar, o ícone não aparece', async () => {
    const comConta = [{ ...base, id: 'e1', tipo: 'externo', name: 'Fábio', stakeholderId: 's1', tenantId: 't1', contaId: 'u9', isActive: true } as StakeholderUnificado]
    const { unmount } = montar('admin', comConta)
    fireEvent.click(within(linhas()[0]).getByRole('button', { name: 'Mudar Fábio para interno' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Mudar para interno' }))
    await waitFor(() => expect(tornarInternoAction).toHaveBeenCalledWith('p1', 's1'))
    unmount()
  })

  it('externo sem login: o administrador é avisado de que vai criar o login (e-mail e senha), não recadastrar a pessoa', async () => {
    montar('admin', [{ ...base, id: 'e1', tipo: 'externo', name: 'Fábio', stakeholderId: 's1', tenantId: 't1', isActive: true } as StakeholderUnificado])
    fireEvent.click(within(linhas()[0]).getByRole('button', { name: 'Mudar Fábio para interno' }))
    expect(await screen.findByText(/ainda não tem login\. Você vai criar o login/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar login e mudar' })).toBeInTheDocument()
  })
})

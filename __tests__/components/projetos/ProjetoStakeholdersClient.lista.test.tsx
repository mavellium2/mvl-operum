import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { ToastProvider } from '@/components/ui/Toast'

vi.mock('@/app/actions/cadastroStakeholders', () => ({ carregarCadastroStakeholdersAction: vi.fn().mockResolvedValue({ error: 'x' }) }))
vi.mock('@/app/actions/stakeholders', () => new Proxy({}, { get: () => vi.fn().mockResolvedValue({ success: true }) }))
vi.mock('@/app/actions/projects', () => ({ addMemberAction: vi.fn(), removeMemberAction: vi.fn() }))
vi.mock('@/app/actions/projetos', () => ({ updateProjetoMemberAction: vi.fn(), setMembroAtivoAction: vi.fn() }))
vi.mock('@/app/actions/admin', () => ({ adminCreateUserAction: vi.fn() }))
vi.mock('@/components/profile/AvatarUpload', () => ({ default: () => null }))
vi.mock('@/components/ui/AddressFields', () => ({ default: () => null, emptyAddress: { cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '' } }))
import ProjetoStakeholdersClient, { type StakeholderUnificado } from '@/components/projetos/ProjetoStakeholdersClient'

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
})

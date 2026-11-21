import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
const { push, replace, refresh, salvar } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), salvar: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace, refresh }) }))
vi.mock('@/app/actions/projectList', () => ({ salvarFiltrosProjetos: salvar }))
import ProjectListFilters from '@/components/projetos/ProjectListFilters'
import { FILTROS_VAZIOS } from '@/lib/filtrosProjetos'
const opcoes = { anos: [2026, 2025], departamentos: ['Gestão', 'Agronegócio'], termos: ['5', '6'] }
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('filtros de Meus projetos', () => {
  it('a pesquisa fica na URL; os filtros guardados não', () => {
    vi.useFakeTimers()
    render(<ProjectListFilters query="" filtros={{ ...FILTROS_VAZIOS, situacoes: ['COMPLETED'] }} opcoes={opcoes} />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar projetos' }), { target: { value: 'Janus' } })
    act(() => vi.advanceTimersByTime(350))
    expect(replace).toHaveBeenCalledWith('/projetos?q=Janus', { scroll: false })
  })
  it('limpa a pesquisa', () => {
    render(<ProjectListFilters query="Janus" filtros={FILTROS_VAZIOS} opcoes={opcoes} />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }))
    expect(push).toHaveBeenCalledWith('/projetos')
  })
  it('marca várias opções em cada filtro, guarda e atualiza a lista', async () => {
    salvar.mockResolvedValue({ ok: true })
    render(<ProjectListFilters query="" filtros={FILTROS_VAZIOS} opcoes={opcoes} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros dos projetos' }))
    const painel = screen.getByRole('dialog', { name: 'Filtrar projetos' })
    for (const nome of ['2026', 'Gestão', '2° Semestre', '5° termo', 'Vespertino', 'Em andamento', 'Concluídos']) fireEvent.click(within(painel).getByRole('button', { name: nome }))
    expect(within(painel).getByRole('button', { name: 'Vespertino' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(painel).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(salvar).toHaveBeenCalledWith({ anos: [2026], departamentos: ['Gestão'], turmas: ['2'], termos: ['5'], turnos: ['Vespertino'], situacoes: ['ACTIVE', 'COMPLETED'] })
  })
  it('mostra quantos filtros estão ativos e "Limpar" guarda todos vazios', async () => {
    salvar.mockResolvedValue({ ok: true })
    render(<ProjectListFilters query="" filtros={{ ...FILTROS_VAZIOS, anos: [2026], turnos: ['Noturno'] }} opcoes={opcoes} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros dos projetos (2 ativos)' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar', exact: true }))
    await waitFor(() => expect(salvar).toHaveBeenCalledWith(FILTROS_VAZIOS))
  })
  it('mantém o painel aberto com o motivo quando não consegue guardar', async () => {
    salvar.mockResolvedValue({ error: 'Filtros demais. Desmarque algumas opções.' })
    render(<ProjectListFilters query="" filtros={FILTROS_VAZIOS} opcoes={opcoes} />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros dos projetos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Filtros demais')
    expect(refresh).not.toHaveBeenCalled()
  })
})

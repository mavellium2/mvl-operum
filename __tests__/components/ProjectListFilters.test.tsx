import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))
import ProjectListFilters from '@/components/projetos/ProjectListFilters'
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })
describe('filtros de Meus projetos', () => {
  it('pesquisa sem manter a página anterior e preserva situação', () => {
    vi.useFakeTimers()
    render(<ProjectListFilters query="" status="COMPLETED" />)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar projetos' }), { target: { value: 'Janus' } })
    act(() => vi.advanceTimersByTime(350))
    expect(replace).toHaveBeenCalledWith('/projetos?q=Janus&status=COMPLETED', { scroll: false })
  })
  it('limpa pesquisa preservando o filtro de situação', () => {
    render(<ProjectListFilters query="Janus" status="INACTIVE" />)
    fireEvent.click(screen.getByRole('button', { name: 'Limpar pesquisa' }))
    expect(push).toHaveBeenCalledWith('/projetos?status=INACTIVE')
  })
  it('limpa filtro preservando a pesquisa', () => {
    render(<ProjectListFilters query="Janus" status="COMPLETED" />)
    fireEvent.click(screen.getByRole('button', { name: 'Filtros dos projetos' }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar', exact: true }))
    expect(push).toHaveBeenCalledWith('/projetos?q=Janus')
  })
})

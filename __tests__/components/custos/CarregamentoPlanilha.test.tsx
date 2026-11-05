import { render, screen, fireEvent, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SobDemandaPlanilha, MaisAtividadesPlanilha, useAnimacaoGraficoVisivel } from '@/components/custos/CarregamentoPlanilha'

afterEach(() => vi.unstubAllGlobals())

describe('carregamento sob demanda da planilha', () => {
  it('só monta o conteúdo próximo da tela e preserva depois de sair', () => {
    let notify: IntersectionObserverCallback = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback }
      observe = vi.fn()
      disconnect = disconnect
    })
    const { unmount } = render(<SobDemandaPlanilha label="gráfico"><p>Dados do gráfico</p></SobDemandaPlanilha>)
    expect(screen.queryByText('Dados do gráfico')).not.toBeInTheDocument()
    act(() => notify([{ isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(screen.getByText('Dados do gráfico')).toBeInTheDocument()
    act(() => notify([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(screen.getByText('Dados do gráfico')).toBeInTheDocument()
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
  it('antecipa o carregamento do gráfico sem esperar metade entrar na tela', () => {
    let notify: IntersectionObserverCallback = () => {}
    let options: IntersectionObserverInit | undefined
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback, config: IntersectionObserverInit) { notify = callback; options = config }
      observe = vi.fn()
      disconnect = vi.fn()
    })
    render(<SobDemandaPlanilha preloadDistance={600} label="gráfico"><p>Gráfico animado</p></SobDemandaPlanilha>)
    expect(options).toMatchObject({ rootMargin: '600px', threshold: 0 })
    expect(screen.getByRole('status', { name: 'Carregando gráfico' })).toBeInTheDocument()
    act(() => notify([{ isIntersecting: true, intersectionRatio: 0.1 }] as IntersectionObserverEntry[], {} as IntersectionObserver))

    expect(screen.getByText('Gráfico animado')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Carregando gráfico' })).not.toBeInTheDocument()
  })
  it('mantém a animação aguardando apenas até o gráfico aparecer, mesmo parcialmente', () => {
    let notify: IntersectionObserverCallback = () => {}
    let options: IntersectionObserverInit | undefined
    const disconnect = vi.fn()
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback, config: IntersectionObserverInit) { notify = callback; options = config }
      observe = vi.fn()
      disconnect = disconnect
    })
    function Graph() {
      const { ref, entered } = useAnimacaoGraficoVisivel()
      return <svg ref={ref} data-testid="graph" data-entered={entered} />
    }
    render(<Graph />)
    expect(options).toMatchObject({ rootMargin: '0px', threshold: 0 })
    expect(screen.getByTestId('graph')).toHaveAttribute('data-entered', 'false')
    act(() => notify([{ isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(screen.getByTestId('graph')).toHaveAttribute('data-entered', 'false')
    act(() => notify([{ isIntersecting: true, intersectionRatio: 0.01 }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(screen.getByTestId('graph')).toHaveAttribute('data-entered', 'true')
    expect(disconnect).toHaveBeenCalled()
  })
  it('permite carregar conteúdo e próximas atividades sem observer pelo teclado', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const load = vi.fn()
    render(<><SobDemandaPlanilha label="resumo"><p>Totais completos</p></SobDemandaPlanilha><table><tbody><MaisAtividadesPlanilha remaining={40} onLoad={load} /></tbody></table></>)
    fireEvent.click(screen.getByRole('button', { name: 'Carregar resumo' }))
    expect(screen.getByText('Totais completos')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Carregar mais atividades/ }))
    expect(load).toHaveBeenCalledOnce()
  })
})

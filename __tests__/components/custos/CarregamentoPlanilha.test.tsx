import { render, screen, fireEvent, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SobDemandaPlanilha, MaisAtividadesPlanilha } from '@/components/custos/CarregamentoPlanilha'

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
  it('aguarda metade do gráfico entrar na tela antes de montar e animar', () => {
    let notify: IntersectionObserverCallback = () => {}
    let options: IntersectionObserverInit | undefined
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback, config: IntersectionObserverInit) { notify = callback; options = config }
      observe = vi.fn()
      disconnect = vi.fn()
    })
    render(<SobDemandaPlanilha whenVisible label="gráfico"><p>Gráfico animado</p></SobDemandaPlanilha>)
    expect(options).toMatchObject({ rootMargin: '0px', threshold: 0.5 })
    expect(screen.getByRole('status', { name: 'Carregando gráfico' })).toBeInTheDocument()
    act(() => notify([{ isIntersecting: true, intersectionRatio: 0.1 }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(screen.queryByText('Gráfico animado')).not.toBeInTheDocument()
    act(() => notify([{ isIntersecting: true, intersectionRatio: 0.5 }] as IntersectionObserverEntry[], {} as IntersectionObserver))
    expect(screen.getByText('Gráfico animado')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Carregando gráfico' })).not.toBeInTheDocument()
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

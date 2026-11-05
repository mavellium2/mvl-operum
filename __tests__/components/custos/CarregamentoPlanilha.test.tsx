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

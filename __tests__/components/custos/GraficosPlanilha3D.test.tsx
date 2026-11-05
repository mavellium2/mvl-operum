import type { ReactNode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import Graficos, { escalaExcel } from '@/components/custos/GraficosPlanilha3D'
import type { PlanilhaDeCustos } from '@/lib/planilhaCustos'
const phases = ['1.1 Planejamento inicial e definição de objetivos', '1.2 Estruturação da logística de coleta', '1.3 Captação de recursos e parcerias', '1.4 Comunicação e divulgação', '1.5 Voluntariado e capacitação', '1.6 Entrega e prestação de contas']
const budget = [11.26, 9.01, 0.56, 28.44, 6.75, 2.81], actual = [11.26, 2.25, 0.56, 8.44, 0, 0]
const time = [100, 80, 5, 75, 60, 25], actualTime = [100, 20, 5, 75, 0, 0]
const planilha = { qtdeAtividades: 11, quadros: {
  valor: phases.map((fase, i) => ({ fase, orcado: budget[i], realizado: actual[i] })),
  tempo: phases.map((fase, i) => ({ fase, minOrcado: time[i], minReal: actualTime[i] })),
  elaboradores: ['Maria Júlia', 'Ana Beatriz', 'Lisley'].map((elaborador, i) => ({ elaborador, qtdeAtividades: [5, 3, 3][i], percentual: [45.45, 27.27, 27.27][i] })),
} } as PlanilhaDeCustos

describe('gráficos 3D da referência Excel', () => {
  it('hidrata o HTML do servidor sem regenerar os gráficos no cliente', async () => {
    const container = document.createElement('div')
    container.innerHTML = renderToString(<Graficos planilha={planilha} />)
    document.body.append(container)
    const recoverable = vi.fn()
    let root: ReturnType<typeof hydrateRoot> | undefined
    try {
      await act(async () => { root = hydrateRoot(container, <Graficos planilha={planilha} />, { onRecoverableError: recoverable }) })
      expect(recoverable).not.toHaveBeenCalled()
    } finally {
      await act(async () => { root?.unmount() })
      container.remove()
    }
  })

  it('usa os três tipos, títulos, cores e perspectivas da referência', () => {
    const { container } = render(<Graficos planilha={planilha} />)
    expect(screen.getByRole('group', { name: 'Valores: Orçado e Real (R$)' })).toHaveAttribute('data-rotation-y', '20')
    expect(screen.getByRole('group', { name: 'Tempo: Orçado e Real (Minutos)' })).toHaveAttribute('data-chart-type', 'clustered-column-3d')
    expect(screen.getByRole('group', { name: 'Elaboração das Atividades (%)' })).toHaveAttribute('data-rotation-x', '50')
    expect(container.querySelectorAll('svg')).toHaveLength(3)
    expect(container.querySelectorAll('svg')[0].lastElementChild).toHaveAttribute('data-chart-labels', 'foreground')
    expect(container.querySelectorAll('[data-value-label]')).toHaveLength(24)
    const zeroLabel = Array.from(container.querySelectorAll('[data-value-label] text')).find(label => label.textContent === 'R$ 0,00')
    expect(zeroLabel).toHaveAttribute('fill', '#fff')
    expect(container.querySelectorAll('[data-value-label] rect, [data-value-label] path')).toHaveLength(0)
    expect(container.querySelectorAll('svg')[0].style.minWidth).toBe('720px')
    expect(container.querySelectorAll('path[fill="#4F81BD"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('path[fill="#C0504D"]').length).toBeGreaterThan(0)
    expect(screen.getByText('45.45')).toBeInTheDocument()
    const pie = screen.getByRole('group', { name: 'Elaboração das Atividades (%)' })
    const masks = pie.querySelectorAll('defs path')
    expect(masks).toHaveLength(2)
    expect(masks[0].getAttribute('d')).toContain('M330 250')
    expect(masks[1].getAttribute('d')).toContain('M330 278')
    expect(screen.getByText('45.45').closest('[clip-path]')).toBeNull()
    expect(container.querySelectorAll('svg')[0].textContent).toMatch(/R\$\s28,44/)
    if (process.env.OPERUM_CHART_PREVIEW === '1') {
      const markup = renderToStaticMarkup(<Graficos planilha={planilha} />)
      const svgs = markup.match(/<svg[\s\S]*?<\/svg>/g) ?? []
      svgs.forEach((svg, index) => writeFileSync(`/tmp/operum-chart-reference/app-chart-${index + 1}.svg`, svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')))
    }
  })
  it('permite ocultar séries, selecionar colunas e destacar elaboradores pelo teclado', () => {
    const { container } = render(<Graficos planilha={planilha} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Orçado', exact: true })[0])
    expect(container.querySelector('[data-series="Orçado"]')).toHaveStyle({ visibility: 'hidden' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Orçado', exact: true })[0])
    const bar = screen.getByRole('button', { name: /1.1 Planejamento.*Orçado: R/ })
    fireEvent.focus(bar)
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Diferença (Real − Orçado)')
    fireEvent.keyDown(bar, { key: 'Enter' })
    fireEvent.blur(bar)
    expect(bar).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelectorAll('[data-series]')[2]).toHaveStyle({ opacity: '1' })
    fireEvent.keyDown(bar, { key: 'Escape' })
    expect(bar).toHaveAttribute('aria-pressed', 'false')
    const slice = screen.getByRole('button', { name: /Maria Júlia:.*atividades/ })
    fireEvent.focus(slice)
    fireEvent.keyDown(slice, { key: ' ' })
    expect(slice).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByRole('status')[2]).toHaveTextContent('Maria Júlia: 5 atividades')
    fireEvent.blur(slice)
    expect(slice).toHaveAttribute('opacity', '1')
    expect(screen.getAllByRole('status')[2]).not.toHaveTextContent('Maria Júlia: 5 atividades')
  })
  it('anima o reenquadramento da série visível e restaura a comparação', async () => {
    const { container } = render(<Graficos planilha={planilha} />)
    const bar = container.querySelector('[data-series="Orçado"] path')!
    const before = bar.getAttribute('d')
    fireEvent.click(screen.getAllByRole('button', { name: 'Real', exact: true })[0])
    await waitFor(() => expect(bar.getAttribute('d')).not.toBe(before))
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    fireEvent.click(screen.getAllByRole('button', { name: 'Real', exact: true })[0])
    await waitFor(() => expect(bar.getAttribute('d')).toBe(before))
  })
  it('atualiza os valores com a planilha e não exibe NaN em dados vazios', () => {
    const { rerender, container } = render(<Graficos planilha={planilha} />)
    const changed = structuredClone(planilha)
    changed.quadros.valor[0].realizado = 20
    rerender(<Graficos planilha={changed} />)
    expect(screen.getByRole('group', { name: 'Valores: Orçado e Real (R$)' }).textContent).toMatch(/Real R\$\s20,00/)
    rerender(<Graficos planilha={{ ...planilha, quadros: { valor: [], tempo: [], elaboradores: [] } }} />)
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    expect(escalaExcel([28.44]).max).toBe(30)
    expect(escalaExcel([100]).max).toBe(100)
  })
})

vi.mock('@/components/custos/CarregamentoPlanilha', async importOriginal => { const original = await importOriginal<typeof import('@/components/custos/CarregamentoPlanilha')>(); return { ...original, SobDemandaPlanilha: ({ children }: { children: ReactNode }) => children } })

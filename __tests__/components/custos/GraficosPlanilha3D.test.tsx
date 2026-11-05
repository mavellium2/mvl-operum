import type { ReactNode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { render, screen, within, act, fireEvent, waitFor } from '@testing-library/react'
import { renderToStaticMarkup, renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import Graficos, { corUnica, escalaExcel } from '@/components/custos/GraficosPlanilha3D'
import type { PlanilhaDeCustos } from '@/lib/planilhaCustos'
const phases = ['1.1 Planejamento inicial e definição de objetivos', '1.2 Estruturação da logística de coleta', '1.3 Captação de recursos e parcerias', '1.4 Comunicação e divulgação', '1.5 Voluntariado e capacitação', '1.6 Entrega e prestação de contas']
const budget = [11.26, 9.01, 0.56, 28.44, 6.75, 2.81], actual = [11.26, 2.25, 0.56, 8.44, 0, 0]
const time = [100, 80, 5, 75, 60, 25], actualTime = [100, 20, 5, 75, 0, 0]
const planilha = { qtdeAtividades: 11, quadros: {
  valor: phases.map((fase, i) => ({ fase, orcado: budget[i], realizado: actual[i] })),
  tempo: phases.map((fase, i) => ({ fase, minOrcado: time[i], minReal: actualTime[i] })),
  elaboradores: ['Maria Júlia', 'Ana Beatriz', 'Lisley'].map((elaborador, i) => ({ userId: `user-${i}`, elaborador, qtdeAtividades: [5, 3, 3][i], percentual: [45.45, 27.27, 27.27][i] })),
} } as PlanilhaDeCustos

planilha.macrofases = phases.map((title, phaseIndex) => ({
  nodeId: `phase-${phaseIndex}`, codigo: `1.${phaseIndex + 1}`, titulo: title.split(' ').slice(1).join(' '),
  atividades: Array.from({ length: phaseIndex === 5 ? 1 : 2 }, (_, index) => {
    const n = phaseIndex * 2 + index
    const owner = n < 5 ? 0 : n < 8 ? 1 : 2
    return { nodeId: `task-${n}`, codigo: `1.${phaseIndex + 1}.${index + 1}`, titulo: `Tarefa ${n + 1}`, elaboradoPor: ['Maria Júlia', 'Ana Beatriz', 'Lisley'][owner], elaboradoPorUserId: `user-${owner}`, elaboradoPorUserIds: [`user-${owner}`], card: { id: `card-${n}`, sprintId: `sprint-${phaseIndex}`, sprintNome: `Sprint ${phaseIndex + 1}`, etapa: 'A fazer' } }
  }),
})) as PlanilhaDeCustos['macrofases']

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
    // Fora da coluna, o valor usa a cor do texto para continuar legível.
    expect(zeroLabel).toHaveAttribute('fill', 'var(--ap-text)')
    expect(container.querySelectorAll('[data-value-label] rect, [data-value-label] path')).toHaveLength(0)
    const colunas = container.querySelectorAll('svg')[0]
    expect(colunas.style.minWidth).toBe(`${colunas.viewBox.baseVal?.width ?? colunas.getAttribute('viewBox')!.split(' ')[2]}px`)
    expect(container.querySelectorAll('path[fill="#4F81BD"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('path[fill="#C0504D"]').length).toBeGreaterThan(0)
    expect(screen.getByText('45,5%')).toBeInTheDocument()
    const pie = screen.getByRole('group', { name: 'Elaboração das Atividades (%)' })
    const masks = pie.querySelectorAll('defs path')
    expect(masks).toHaveLength(2)
    expect(masks[0].getAttribute('d')).toContain('M330 250')
    // O recorte da lateral parte do centro do topo e alcança a base (raio vertical + espessura).
    expect(masks[1].getAttribute('d')).toMatch(/^M330 250 L330 1\.67.* A287 248\.32/)
    expect(screen.getByText('45,5%').closest('[clip-path]')).toBeNull()
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
    expect(screen.getByRole('heading', { name: 'Atividades de Maria Júlia' })).toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'Atividades atribuídas a Maria Júlia' })
    expect(within(list).getByText('1.1.1 Tarefa 1')).toBeInTheDocument()
    expect(within(list).getByText('1.3.1 Tarefa 5')).toBeInTheDocument()
    expect(within(list).queryByText('1.3.2 Tarefa 6')).not.toBeInTheDocument()
    expect(within(list).getByText('Sprint 1 · 2 atividades')).toBeInTheDocument()
    const pie = screen.getByRole('group', { name: 'Atividades de Maria Júlia' })
    expect(pie.querySelector('desc')).toHaveTextContent('1.1.1 Tarefa 1')
    expect(pie.querySelector('desc')).not.toHaveTextContent('Ana Beatriz')
    // Uma fatia por atividade da pessoa, todas do mesmo tamanho.
    const fatias = within(pie).getAllByRole('button')
    expect(fatias).toHaveLength(list.querySelectorAll('tr[data-atividade]').length)
    const fatia = within(pie).getByRole('button', { name: /^1\.3\.1 Tarefa 5 · / })
    fireEvent.click(fatia)
    expect(fatia).toHaveAttribute('aria-pressed', 'true')
    expect(within(list).getByText('1.3.1 Tarefa 5').closest('tr')).toHaveAttribute('data-active', 'true')
    expect(within(list).getByText('1.1.1 Tarefa 1').closest('tr')).not.toHaveAttribute('data-active')
    fireEvent.click(screen.getByRole('button', { name: /^Ana Beatriz/ }))
    expect(screen.getByRole('heading', { name: 'Atividades de Ana Beatriz' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Atividades atribuídas a Maria Júlia' })).not.toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('heading', { name: 'Atividades de Ana Beatriz' })).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Elaboração das Atividades (%)' })).toBeInTheDocument()
  })
  it('dá a maior fatia à atividade com mais tempo planejado', () => {
    const comTempo = structuredClone(planilha)
    const minutos: Record<string, number> = { 'task-0': 300, 'task-1': 100, 'task-2': 100 }
    for (const fase of comTempo.macrofases) for (const atividade of fase.atividades) atividade.minOrcado = minutos[atividade.nodeId] ?? 0
    comTempo.macrofases[0].atividades[0].minReal = 360
    Object.assign(comTempo.macrofases[0].atividades[0], { materiaisOrcado: 50, materiaisReal: 80, totalOrcado: 350, totalReal: 440, dataPrevista: '2026-11-06', dataRealizacao: '2026-11-05', situacao: 'Antecipada' })
    for (const atividade of comTempo.macrofases[0].atividades) atividade.card!.sprintNome = '1.1 Planejamento inicial e definição de objetivos'
    const { container } = render(<Graficos planilha={comTempo} />)
    fireEvent.click(within(container.querySelector('.planilha-3d-legend') as HTMLElement).getByRole('button', { name: /^Maria Júlia/ }))
    const pie = screen.getByRole('group', { name: 'Atividades de Maria Júlia' })
    expect(within(pie).getAllByRole('button')).toHaveLength(3)
    const rotulos = Array.from(pie.querySelectorAll('.planilha-pie-value')).map(label => label.textContent)
    expect(rotulos).toContain('1.1.160%')
    expect(rotulos).toContain('1.1.220%')
    // Passar pela lateral 3D mantém o destaque da mesma fatia; sair do gráfico limpa.
    const laterais = pie.querySelectorAll('.planilha-pie-depth')
    // Só as fatias com borda na frente têm lateral visível.
    expect(laterais).toHaveLength(2)
    laterais.forEach(lateral => expect(lateral.getAttribute('d')).toMatch(/^M.* A.* L.* A.* Z$/))
    fireEvent.mouseEnter(laterais[0])
    expect(screen.getAllByRole('status').at(-1)).toHaveTextContent('1.1.1 Tarefa 1')
    // A fatia em destaque sobe; as outras mantêm a cor (sem esmaecer).
    expect(pie.querySelector('[data-elevada]')).toHaveAttribute('data-elevada', 'task-0')
    // Nenhuma face da fatia levantada desce abaixo do topo original (não cobre a lateral das vizinhas).
    pie.querySelectorAll('[data-face-elevada]').forEach(face => expect(Number(face.getAttribute('d')!.match(/^M[\d.]+ ([\d.-]+)/)![1])).toBeLessThanOrEqual(250))
    expect(pie.querySelector('[data-parede-elevada]')).not.toBeNull()
    expect(laterais[1]).not.toHaveAttribute('opacity')
    // A fatia de trás levanta, mas as da frente continuam por cima dela.
    fireEvent.mouseEnter(within(pie).getByRole('button', { name: /^1\.2\.1 Tarefa 3 · / }))
    expect(pie.querySelector('[data-elevada]')).toHaveAttribute('data-elevada', 'task-2')
    const frente = pie.querySelector('[data-frente-da-elevada]')!
    expect(frente.querySelectorAll('[data-frente-topo]')).toHaveLength(2)
    // Laterais antes dos topos: nenhuma lateral escura cobre o topo de outra fatia.
    expect(Array.from(frente.children).map(path => path.hasAttribute('data-frente-topo'))).toEqual([false, false, true, true])
    expect(pie.querySelector('[data-elevada]')!.compareDocumentPosition(pie.querySelector('[data-frente-da-elevada]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.mouseLeave(pie)
    expect(pie.querySelector('[data-elevada]')).toBeNull()
    expect(within(pie).getByRole('button', { name: /^1\.1\.1 Tarefa 1 · .*60% do tempo planejado \(300 min\)/ })).toBeInTheDocument()
    expect(within(pie).getByRole('button', { name: /^1\.1\.2 Tarefa 2 · .*20% do tempo planejado/ })).toBeInTheDocument()
    const list = screen.getByRole('region', { name: 'Atividades atribuídas a Maria Júlia' })
    expect(within(within(list).getByText('1.2.2 Tarefa 4').closest('tr')!).getByLabelText('Sem tempo planejado')).toHaveTextContent('sem tempo planejado')
    expect(within(within(list).getByText('1.1.1 Tarefa 1').closest('tr')!).getByLabelText('Orçado: 300 min')).toBeInTheDocument()
    const total = within(list).getByLabelText('Tempo total de Maria Júlia')
    expect(total).toHaveTextContent('Total de Maria Júlia5008:201,04')
    expect(total).toHaveTextContent('3606:000,75')
    expect(within(list).getByRole('columnheader', { name: 'Valor realizado' })).toBeInTheDocument()
    expect(within(list).getByRole('columnheader', { name: 'Elaborada por' })).toBeInTheDocument()
    const linha = within(list).getByText('1.1.1 Tarefa 1').closest('tr')!
    expect(within(linha).getByLabelText('Materiais orçados: R$ 50,00')).toBeInTheDocument()
    expect(within(linha).getByLabelText('Materiais realizados: R$ 80,00')).toHaveAttribute('data-acima', 'true')
    expect(within(linha).getByLabelText('Valor orçado: R$ 350,00')).toBeInTheDocument()
    expect(within(linha).getByLabelText('Valor realizado: R$ 440,00')).toHaveAttribute('data-acima', 'true')
    expect(within(total).getByLabelText('Total de Maria Júlia realizado: R$ 440,00')).toBeInTheDocument()
    // Coluna Macrofase agrupa as atividades e cada fase tem subtotal.
    expect(within(list).getByRole('columnheader', { name: 'Macrofases' })).toBeInTheDocument()
    const subtotal = within(list).getByLabelText('Subtotal de 1.1 Planejamento inicial e definição de objetivos')
    expect(subtotal).toHaveTextContent('Sub-total4006:40')
    expect(within(subtotal).getByLabelText('Sub-total realizado: R$ 440,00')).toHaveAttribute('data-acima', 'true')
    expect(within(linha).getByLabelText('Data prevista: 06/11/2026')).toHaveTextContent('06/11/2026')
    expect(within(linha).getByLabelText('Data realizada: 05/11/2026')).toHaveTextContent('05/11/2026')
    expect(within(linha).getByText('Antecipada')).toBeInTheDocument()
    expect(within(list).getByRole('columnheader', { name: 'Situação' })).toBeInTheDocument()
    const real = within(within(list).getByText('1.1.1 Tarefa 1').closest('tr')!).getByLabelText('Realizado: 360 min')
    expect(real).toHaveAttribute('data-acima', 'true')
    expect(real).toHaveTextContent('360')
    expect(real).toHaveAttribute('title', '+20% em relação ao orçado')
    // Sprint com o mesmo nome da macrofase não aparece repetida.
    expect(within(list).getByText('2 atividades')).toBeInTheDocument()
  })
  it('com muitas fases, mantém o tamanho real com rolagem e rótulos na diagonal', () => {
    const muitas = structuredClone(planilha)
    const nome = (i: number) => `1.${i + 1} Etapa ${i + 1} — ${'Descrição longa de planejamento. '.repeat(6).trim()}`
    muitas.quadros.valor = Array.from({ length: 31 }, (_, i) => ({ fase: nome(i), orcado: i + 1, realizado: i }))
    const { container } = render(<Graficos planilha={muitas} />)
    const colunas = screen.getByRole('group', { name: 'Valores: Orçado e Real (R$)' }) as unknown as SVGSVGElement
    expect(parseFloat(colunas.style.minWidth)).toBeGreaterThan(31 * 120)
    const rotulos = colunas.querySelectorAll('[data-rotulo-fase]')
    expect(rotulos).toHaveLength(31)
    expect(rotulos[13].getAttribute('transform')).toMatch(/^rotate\(-35 /)
    const visivel = rotulos[13].lastChild!.textContent!
    expect(visivel).toMatch(/^1\.14 Etapa 14 — .*…$/)
    expect(visivel.length).toBeLessThanOrEqual(24)
    expect(rotulos[13].querySelector('title')).toHaveTextContent(nome(13))
    expect(container.querySelector('.planilha-3d-scroll')).toContainElement(colunas as unknown as HTMLElement)
  })
  it('destaca o nome da pessoa ao passar sobre a fatia dela', () => {
    const { container } = render(<Graficos planilha={planilha} />)
    const legenda = container.querySelector('.planilha-3d-legend') as HTMLElement
    const nome = within(legenda).getByRole('button', { name: /^Ana Beatriz/ })
    expect(nome).not.toHaveAttribute('data-destaque')
    const pie = screen.getByRole('group', { name: 'Elaboração das Atividades (%)' })
    fireEvent.mouseEnter(within(pie).getByRole('button', { name: /^Ana Beatriz:/ }))
    expect(nome).toHaveAttribute('data-destaque', 'true')
    expect(within(legenda).getByRole('button', { name: /^Maria Júlia/ })).not.toHaveAttribute('data-destaque')
    fireEvent.mouseLeave(pie)
    expect(nome).not.toHaveAttribute('data-destaque')
  })
  it('divide a legenda em colunas quando há muitas pessoas', () => {
    const { container, unmount } = render(<Graficos planilha={planilha} />)
    expect(container.querySelector('.planilha-3d-legend')).toHaveAttribute('data-colunas', '1')
    unmount()
    const muitas = structuredClone(planilha)
    muitas.quadros.elaboradores = Array.from({ length: 14 }, (_, i) => ({ userId: `p${i}`, elaborador: `Pessoa ${i + 1}`, qtdeAtividades: 1, percentual: 100 / 14 }))
    const outra = render(<Graficos planilha={muitas} />)
    expect(outra.container.querySelector('.planilha-3d-legend')).toHaveAttribute('data-colunas', '3')
  })
  it('não repete cor entre pessoas ou atividades', () => {
    const cores = Array.from({ length: 40 }, (_, index) => corUnica(index))
    expect(new Set(cores).size).toBe(40)
    cores.forEach(cor => expect(cor).toMatch(/^#[0-9a-f]{6}$/i))
    expect(cores.slice(0, 6)).toEqual(['#4F81BD', '#C0504D', '#9BBB59', '#8064A2', '#4BACC6', '#F79646'])
  })
  it('separa usuários com nomes iguais pelo ID e fecha pelo teclado', () => {
    const sameName = structuredClone(planilha)
    sameName.quadros.elaboradores[1].elaborador = 'Maria Júlia'
    const { container } = render(<Graficos planilha={sameName} />)
    const legend = container.querySelector('.planilha-3d-legend')!
    const people = within(legend as HTMLElement).getAllByRole('button', { name: /^Maria Júlia/ })
    fireEvent.click(people[1])
    const tasks = screen.getByRole('region', { name: 'Atividades atribuídas a Maria Júlia' })
    expect(within(tasks).getByText('1.3.2 Tarefa 6')).toBeInTheDocument()
    expect(within(tasks).queryByText('1.1.1 Tarefa 1')).not.toBeInTheDocument()
    fireEvent.keyDown(people[1], { key: 'Escape' })
    expect(screen.queryByRole('region', { name: 'Atividades atribuídas a Maria Júlia' })).not.toBeInTheDocument()
    expect(people[1]).toHaveFocus()
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

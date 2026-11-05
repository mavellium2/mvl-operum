import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import QuadroResumo from '@/components/custos/QuadroResumo'

describe('QuadroResumo', () => {
  const nomeLongo = `1.14 Etapa 14 — ${'Descrição longa de planejamento. '.repeat(8).trim()}`
  const linhas = Array.from({ length: 31 }, (_, i) => ({ key: String(i), nome: i === 13 ? nomeLongo : `1.${i + 1} Etapa ${i + 1}`, valores: [`R$ ${i},00`, `R$ ${i},50`] as [string, string] }))

  it('rola dentro do quadro, mostra o nome completo no title e mantém o total no rodapé', () => {
    render(<QuadroResumo titulo="Resumo — Valor por Fase do Projeto" colunas={['Fases do Projeto', 'Valor Orçado', 'Valor Real']} linhas={linhas} total={['R$ 465,00', 'R$ 480,50']} />)
    const area = screen.getByRole('region', { name: 'Resumo — Valor por Fase do Projeto' })
    expect(area).toHaveClass('planilha-resumo-rolagem')
    expect(area).toHaveAttribute('tabIndex', '0')
    expect(within(area).getAllByRole('row')).toHaveLength(33)
    const nome = screen.getByText(nomeLongo)
    expect(nome.closest('td')).toHaveClass('planilha-resumo-nome')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.mouseEnter(nome.closest('td')!.firstElementChild!)
    expect(screen.getByRole('tooltip')).toHaveTextContent(nomeLongo)
    fireEvent.mouseLeave(nome.closest('td')!.firstElementChild!)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    const rodape = area.querySelector('tfoot')!
    expect(within(rodape).getByText('Total')).toBeInTheDocument()
    expect(within(rodape).getByText('R$ 480,50')).toBeInTheDocument()
  })
})

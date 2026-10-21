import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import PaginasDaPrevia, { contarPaginas } from '@/components/projetos/documentacao/PaginasDaPrevia'
import { alturaUtilDaPaginaMm } from '@/lib/printPageStyle'

const PX_POR_MM = 96 / 25.4

/** jsdom não faz layout: a régua mede 100mm e a caixa mede `alturaMm`. */
function simularAltura(alturaMm: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const h = this.style.height === '100mm' ? 100 * PX_POR_MM : alturaMm * PX_POR_MM
    return { height: h, width: 0, top: 0, left: 0, right: 0, bottom: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect
  })
}

afterEach(() => vi.restoreAllMocks())

describe('contarPaginas', () => {
  it('folha exatamente com a altura útil é 1 página (tolerância de arredondamento)', () => {
    expect(contarPaginas(202, 202)).toBe(1)
    expect(contarPaginas(202.3, 202)).toBe(1)
    expect(contarPaginas(203, 202)).toBe(2)
    expect(contarPaginas(0, 202)).toBe(1)
  })
})

describe('PaginasDaPrevia', () => {
  it('uma folha: "Página 1 de 1", sem linha de quebra', () => {
    simularAltura(alturaUtilDaPaginaMm({ landscape: true }))
    render(<PaginasDaPrevia landscape><div data-print-sheet>conteúdo</div></PaginasDaPrevia>)
    expect(screen.getAllByTestId('numero-da-pagina').map(e => e.textContent)).toEqual(['Página 1 de 1'])
    expect(screen.queryByTestId('quebra-de-pagina')).not.toBeInTheDocument()
  })

  it('conteúdo maior: separa as folhas e numera cada uma, como no PDF', () => {
    const util = alturaUtilDaPaginaMm()
    simularAltura(util * 2.4)
    render(<PaginasDaPrevia><div data-print-sheet>conteúdo</div></PaginasDaPrevia>)
    expect(screen.getAllByTestId('numero-da-pagina').map(e => e.textContent)).toEqual(['Página 1 de 3', 'Página 2 de 3', 'Página 3 de 3'])
    const quebras = screen.getAllByTestId('quebra-de-pagina')
    expect(quebras.map(q => q.style.top)).toEqual([`${util}mm`, `${util * 2}mm`])
  })

  it('não cobre o conteúdo: marcas são decorativas e não recebem clique', () => {
    simularAltura(500)
    render(<PaginasDaPrevia><div data-print-sheet>conteúdo</div></PaginasDaPrevia>)
    for (const marca of screen.getAllByTestId('numero-da-pagina')) {
      expect(marca.closest('[aria-hidden="true"]')).toHaveClass('pointer-events-none')
    }
    expect(screen.getByText('conteúdo')).toBeVisible()
  })

  it('a folha usa na tela a mesma altura mínima da impressão', () => {
    simularAltura(100)
    const { container } = render(<PaginasDaPrevia marginTopMm={15}><div data-print-sheet /></PaginasDaPrevia>)
    expect(container.querySelector('style')!.textContent).toContain(`min-height: ${alturaUtilDaPaginaMm({ marginTopMm: 15 })}mm`)
  })
})

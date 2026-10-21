import { describe, it, expect } from 'vitest'
import { printPageStyle, alturaUtilDaPaginaMm, PAGE_NUMBER_MARGIN_MM } from '@/lib/printPageStyle'

describe('printPageStyle', () => {
  it('numera as páginas no rodapé e reserva a faixa na margem inferior', () => {
    const css = printPageStyle()
    expect(css).toContain('counter(page)')
    expect(css).toContain('counter(pages)')
    expect(css).toContain(`margin: 0mm 0mm ${PAGE_NUMBER_MARGIN_MM}mm`)
    expect(css).toContain('size: A4;')
  })

  it('paisagem desconta a faixa da altura de 210mm', () => {
    const css = printPageStyle({ landscape: true })
    expect(css).toContain('A4 landscape')
    expect(css).toContain(`min-height: ${210 - PAGE_NUMBER_MARGIN_MM}mm`)
  })

  it('tira o padding inferior da folha e não corta linhas de tabela', () => {
    const css = printPageStyle({ landscape: true })
    expect(css).toMatch(/\[data-print-sheet\] \{[^}]*padding-bottom: 0 !important/)
    expect(css).toContain('[data-print-sheet] tr { break-inside: avoid; }')
  })

  it('a prévia usa a mesma altura útil da impressão', () => {
    expect(alturaUtilDaPaginaMm({ landscape: true })).toBe(210 - PAGE_NUMBER_MARGIN_MM)
    expect(alturaUtilDaPaginaMm({ marginTopMm: 15 })).toBe(297 - 15 - PAGE_NUMBER_MARGIN_MM)
  })

  it('desconta margem superior e mantém laterais', () => {
    const css = printPageStyle({ marginMm: { top: 15, x: 20 } })
    expect(css).toContain(`margin: 15mm 20mm ${PAGE_NUMBER_MARGIN_MM}mm`)
    expect(css).toContain(`min-height: ${297 - 15 - PAGE_NUMBER_MARGIN_MM}mm`)
  })
})

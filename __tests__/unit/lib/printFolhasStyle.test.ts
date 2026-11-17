import { describe, it, expect } from 'vitest'
import { BORDA_IMPRESSAO, printFolhasStyle } from '@/lib/printPageStyle'

describe('printFolhasStyle — bordas no PDF', () => {
  it('na impressão, as bordas das tabelas das folhas têm 2px (o PDFium descarta linhas abaixo de 1 pixel na pré-visualização)', () => {
    expect(BORDA_IMPRESSAO).toBe('2px')
    const css = printFolhasStyle()
    const impressao = css.slice(css.indexOf('@media print'))
    expect(impressao).toContain(`[data-pagina] :is(td, th) { border-width: ${BORDA_IMPRESSAO} !important; }`)
  })
})

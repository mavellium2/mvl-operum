/**
 * Estilo de impressão (react-to-print) comum aos documentos: A4 com numeração
 * "Página X de Y" no rodapé. A numeração usa a caixa de margem do @page, que só
 * existe com margem inferior > 0; por isso as folhas marcadas com
 * `data-print-sheet` perdem essa faixa da altura mínima na impressão e não
 * criam uma página extra. O padding inferior da folha também sai na impressão:
 * a página já tem a margem da numeração, e esse espaço em branco sozinho
 * empurrava uma segunda página vazia (PDF de stakeholders com a folha cheia).
 * Linhas de tabela não são cortadas entre páginas.
 */
export const PAGE_NUMBER_MARGIN_MM = 8

interface PrintPageStyleOptions {
  landscape?: boolean
  /** Margens laterais/superior do papel, em mm. Padrão: 0 (a folha já tem o próprio padding). */
  marginMm?: { top: number; x: number }
  /** CSS adicional, ex.: páginas nomeadas com orientação própria. */
  extraCss?: string
  /** Texto do canto inferior esquerdo de todas as páginas (rodapeDocumento). */
  rodape?: string
}

/** "Operum · Termo de Abertura do Projeto · versão 1.2" (rodapé dos documentos). */
export function rodapeDocumento(documento: string, versao?: string | null): string {
  return ['Operum', documento, versao?.trim() ? `versão ${versao.trim()}` : null].filter(Boolean).join(' · ')
}

/** Texto seguro dentro de `content: "..."` do CSS. */
function textoCss(texto: string): string {
  return texto.replace(/[\\"]/g, m => `\\${m}`).replace(/[\r\n]+/g, ' ')
}

/**
 * Altura útil de cada página impressa (mm): o que cabe entre a margem superior e
 * a faixa da numeração. A prévia usa o mesmo valor para mostrar onde cada folha
 * termina (PaginasDaPrevia).
 */
export function alturaUtilDaPaginaMm({ landscape = false, marginTopMm = 0 }: { landscape?: boolean; marginTopMm?: number } = {}): number {
  return (landscape ? 210 : 297) - marginTopMm - PAGE_NUMBER_MARGIN_MM
}

export function printPageStyle({ landscape = false, marginMm = { top: 0, x: 0 }, extraCss = '', rodape }: PrintPageStyleOptions = {}): string {
  const usable = alturaUtilDaPaginaMm({ landscape, marginTopMm: marginMm.top })
  const esquerda = rodape ? `
      @bottom-left {
        content: "${textoCss(rodape)}";
        font: 8pt Arial, Arimo, Helvetica, sans-serif;
        color: #555;
      }` : ''
  return `
    @page {
      size: A4${landscape ? ' landscape' : ''};
      margin: ${marginMm.top}mm ${marginMm.x}mm ${PAGE_NUMBER_MARGIN_MM}mm;${esquerda}
      @bottom-right {
        content: "Página " counter(page) " de " counter(pages);
        font: 8pt Arial, Arimo, Helvetica, sans-serif;
        color: #555;
      }
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      [data-folha] { width: auto !important; padding: 0 !important; }
      [data-tela-apenas] { display: none !important; }
      [data-print-sheet] { min-height: ${usable}mm !important; padding-bottom: 0 !important; }
      [data-print-sheet] tr { break-inside: avoid; }
      [data-print-sheet-fixed] { height: ${usable}mm !important; }
    }
    ${extraCss}
  `
}

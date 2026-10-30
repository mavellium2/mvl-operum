import { AlignmentType, Document, Footer, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
export function paragraphs(text: string, bold = false): Paragraph[] {
  return (text || '—').split('\n').map(line => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line, bold, size: 18 })] }))
}
/** Parágrafos em vermelho (itens inativos nos formulários). */
export function redParagraphs(text: string): Paragraph[] {
  return (text || '—').split('\n').map(line => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: line, size: 18, color: 'B91C1C' })] }))
}
export function modelTable(widths: number[], rows: (string | Paragraph[])[][], header = false, mergeEmpty = false): Table {
  return new Table({ width: { size: widths.reduce((a,b) => a+b,0), type: WidthType.DXA }, columnWidths: widths, rows: rows.map((row,i) => new TableRow({ tableHeader: header && i === 0, children: (mergeEmpty && row.length === 2 && row[1] === '' ? [new TableCell({ columnSpan: 2, width: { size: widths.reduce((a,b) => a+b,0), type: WidthType.DXA }, shading: i === 0 ? { type: ShadingType.CLEAR, fill: 'DDDDDD' } : undefined, children: typeof row[0] === 'string' ? paragraphs(row[0]) : row[0] })] : row.map((value,j) => new TableCell({ width: { size: widths[j], type: WidthType.DXA }, shading: header && i === 0 ? { type: ShadingType.CLEAR, fill: 'DDDDDD' } : undefined, children: typeof value === 'string' ? paragraphs(value, header && i === 0) : value }))) })) })
}
export function heading(text: string): Paragraph { return new Paragraph({ keepNext: true, spacing: { before: 180, after: 80 }, children: [new TextRun({ text, bold: true, size: 20 })] }) }
export function modelDocument(title: string, children: (Paragraph | Table)[], footer: string, landscape = false): Document {
  return new Document({ creator: 'Operum', title, styles: { default: { document: { run: { font: 'Arial', size: 18 } } } }, sections: [{ properties: { page: { size: { width: 11906, height: 16838, orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT }, margin: { top: 850, right: 850, bottom: 850, left: 850 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [...(footer ? [new TextRun({ text: `${footer} · `, size: 16 })] : []), new TextRun({ children: [PageNumber.CURRENT], size: 16 })] })] }) }, children }] })
}

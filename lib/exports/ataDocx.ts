import { textoSimples } from '@/lib/textoFormatado'
import {
  AlignmentType, BorderStyle, Document, HeightRule, ImageRun, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType,
} from 'docx'
import { linhaOuAviso } from '@/lib/linhaInstitucional'

export * from '@/lib/ataModelo'
import { ATA_ASSINATURAS_POR_LINHA, ataAssinantes, ataComUmaLinhaVazia, ataCopias, ataData, ataNumero, ataPessoa, type AtaExportData } from '@/lib/ataModelo'

const ATA_ESPACO_TWIPS = 170

// ── Word ─────────────────────────────────────────────────────────────────────

const LARGURA = 10206 // A4 retrato com margens de 850
const CINZA = 'BFBFBF'
const CINZA_CLARO = 'E7E6E6'
const linha = { style: BorderStyle.SINGLE, size: 6, color: '000000' }
const bordas = { top: linha, bottom: linha, left: linha, right: linha }
const semBorda = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const semBordas = { top: semBorda, bottom: semBorda, left: semBorda, right: semBorda }

function texto(partes: Array<{ t: string; b?: boolean }>, size = 18): Paragraph[] {
  const linhas: Array<Array<{ t: string; b?: boolean }>> = [[]]
  for (const p of partes) {
    p.t.split('\n').forEach((pedaco, i) => {
      if (i > 0) linhas.push([])
      linhas[linhas.length - 1].push({ t: pedaco, b: p.b })
    })
  }
  return linhas.map(l => new Paragraph({ children: l.map(p => new TextRun({ text: p.t, bold: p.b, size })) }))
}

function celula(
  conteudo: Paragraph[], largura: number,
  opts: { span?: number; cinza?: string; semBorda?: boolean } = {},
): TableCell {
  return new TableCell({
    columnSpan: opts.span,
    width: { size: largura, type: WidthType.DXA },
    borders: opts.semBorda ? semBordas : bordas,
    shading: opts.cinza ? { type: ShadingType.CLEAR, fill: opts.cinza, color: 'auto' } : undefined,
    margins: { left: 80, right: 80, top: 20, bottom: 20 },
    verticalAlign: VerticalAlign.TOP,
    children: conteudo,
  })
}

const rotulo = (r: string, valor?: string | null) => texto([{ t: r, b: true }, { t: valor ? ` ${valor}` : '' }])
const titulo = (r: string, extra = '') => texto([{ t: r, b: true }, { t: extra }])

function tabela(larguras: number[], linhas: Array<{ cells: TableCell[]; altura?: number }>): Table {
  return new Table({
    width: { size: LARGURA, type: WidthType.DXA },
    columnWidths: larguras,
    rows: linhas.map(l => new TableRow({ children: l.cells, height: l.altura ? { value: l.altura, rule: HeightRule.ATLEAST } : undefined })),
  })
}

const espaco = () => new Paragraph({ spacing: { before: 0, after: 0, line: ATA_ESPACO_TWIPS, lineRule: 'exact' }, children: [] })

/**
 * Ata no layout do modelo "01_Form Ata de Reunião" (sem o "© 01_Form…" do rodapé). `logo`: parágrafo com a imagem;
 * `assinaturas`: imagem da assinatura de cada assinante (mesma ordem de `ataAssinantes`).
 * `assinaturaGerente`: imagem inline do gerente, independente dos presentes.
 * As imagens são carregadas por quem chama (navegador ou servidor).
 */
export function buildAtaDocx(d: AtaExportData, logo: Paragraph[] = [], assinaturas: Paragraph[][] = [], assinaturaGerente?: ImageRun): Document {
  const W1 = 7654, W2 = LARGURA - W1
  const A1 = 4592, A2 = 1531, A3 = LARGURA - A1 - A2
  const presentes = ataComUmaLinhaVazia(d.presentes, p => !!p.nome?.trim(), { nome: '', setorEmpresa: null })
  const acoes = ataComUmaLinhaVazia(d.acoes, a => !!a.acao?.trim(), { acao: '', prazo: null, responsavel: null })
  const caixas = ataCopias(d.copiasPara)
  const C = LARGURA / 4

  // Logo | título | coluna vazia da mesma largura da logo: o nº fica no centro da página.
  const LOGO = 1871 // 33 mm
  const cabecalho = new Table({
    width: { size: LARGURA, type: WidthType.DXA },
    columnWidths: [LOGO, LARGURA - 2 * LOGO, LOGO],
    rows: [new TableRow({ children: [
      celula(logo.length ? logo : texto([{ t: 'Logo do Projeto' }], 20), LOGO, { semBorda: true }),
      new TableCell({
        width: { size: LARGURA - 2 * LOGO, type: WidthType.DXA }, borders: semBordas, verticalAlign: VerticalAlign.CENTER,
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Ata de Reunião Nº ${ataNumero(d.numero)}`, bold: true, size: 28 })] })],
      }),
      celula([new Paragraph({ children: [] })], LOGO, { semBorda: true }),
    ] })],
  })

  const quadro = tabela([W1, W2], [
    { cells: [celula(titulo(linhaOuAviso(d.instituicao)), LARGURA, { span: 2, cinza: CINZA })] },
    { cells: [celula(rotulo('Nome do projeto:', d.nomeProjeto), LARGURA, { span: 2 })] },
    { cells: [celula(rotulo('Local:', d.local), W1), celula(titulo(`Data: ${ataData(d.data)}`), W2)] },
    { cells: [celula(rotulo('Elaborado por:', ataPessoa(d.elaboradoPor, d.elaboradoPorFuncao)), LARGURA, { span: 2 })] },
    { cells: [celula(rotulo('Aprovado por:', ataPessoa(d.aprovadoPor, d.aprovadoPorFuncao)), LARGURA, { span: 2 })] },
    ...(d.gerenteProjeto || d.assinaturaGerenteUrl ? [{ cells: [celula([new Paragraph({ children: [
      new TextRun({ text: 'Assinatura do gerente: ', bold: true, size: 18 }),
      ...(assinaturaGerente ? [assinaturaGerente] : []),
    ] })], LARGURA, { span: 2 })] }] : []),
    { cells: [celula(titulo('I. Relação dos presentes'), LARGURA, { span: 2, cinza: CINZA })] },
    { cells: [celula(titulo('Nome:'), W1), celula(titulo('Setor/Empresa:'), W2)] },
    ...presentes.map(p => ({ cells: [celula(texto([{ t: p.nome }]), W1), celula(texto([{ t: p.setorEmpresa ?? '' }]), W2)] })),
    { cells: [celula(titulo('II. Assuntos tratados'), LARGURA, { span: 2, cinza: CINZA })] },
    { cells: [celula(texto([{ t: textoSimples(d.assuntosTratados) }]), LARGURA, { span: 2 })], altura: 1300 },
    { cells: [celula(titulo('III. Decisões tomadas'), LARGURA, { span: 2, cinza: CINZA })] },
    { cells: [celula(texto([{ t: textoSimples(d.decisoesTomadas) }]), LARGURA, { span: 2 })], altura: 1300 },
  ])

  const tabelaAcoes = tabela([A1, A2, A3], [
    { cells: [celula(titulo('IV. Ações a serem empreendidas'), A1, { cinza: CINZA }), celula(titulo('Prazo'), A2, { cinza: CINZA }), celula(titulo('Responsável'), A3, { cinza: CINZA })] },
    ...acoes.map(a => ({ cells: [celula(texto([{ t: a.acao }]), A1), celula(texto([{ t: a.prazo ? ataData(a.prazo) : '' }]), A2), celula(texto([{ t: a.responsavel ?? '' }]), A3)] })),
  ])

  const anexos = tabela([LARGURA], [
    { cells: [celula([...titulo('Documentos anexos:'), ...texto([{ t: d.anexos.map(a => `${a.nome}${a.url ? ` — ${a.url}` : ''}`).join('\n') }])], LARGURA, { cinza: CINZA_CLARO })], altura: 600 },
  ])

  // Grade de 4 colunas: 1ª célula é o rótulo, depois as caixas (como no modelo).
  const celulasCopias = [
    titulo('Enviar cópias para:'),
    ...caixas.map(c => texto([{ t: `${c.marcado ? '☒' : '☐'} ${c.texto}` }])),
  ]
  const linhasCopias: TableRow[] = []
  for (let i = 0; i < celulasCopias.length; i += 4) {
    linhasCopias.push(new TableRow({ children: celulasCopias.slice(i, i + 4).map(conteudo => celula(conteudo, C, { semBorda: true })) }))
  }
  const copias = tabela([LARGURA], [{ cells: [new TableCell({
    width: { size: LARGURA, type: WidthType.DXA }, borders: bordas,
    shading: { type: ShadingType.CLEAR, fill: CINZA_CLARO, color: 'auto' },
    children: [new Table({ width: { size: LARGURA - 200, type: WidthType.DXA }, columnWidths: [C, C, C, C].map(w => w - 50), rows: linhasCopias }), new Paragraph({ children: [] })],
  })] }])

  // Grade de assinaturas: imagem cadastrada (ou espaço para assinar), linha e nome.
  const assinantes = ataAssinantes(d.presentes)
  const A = Math.floor((LARGURA - 200) / ATA_ASSINATURAS_POR_LINHA)
  const centro = (t: string) => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, size: 18 })] })
  const celulaAssinatura = (i: number) => {
    const p = assinantes[i]
    if (!p) return celula([new Paragraph({ children: [] })], A, { semBorda: true })
    const imagem = assinaturas[i]?.length ? assinaturas[i].map(par => par) : [new Paragraph({ spacing: { before: 480 }, children: [] })]
    return new TableCell({
      width: { size: A, type: WidthType.DXA }, borders: semBordas, verticalAlign: VerticalAlign.BOTTOM,
      margins: { left: 80, right: 80, top: 60, bottom: 60 },
      children: [...imagem, centro('_______________________________'), centro(p.nome)],
    })
  }
  const linhasAssinatura: TableRow[] = []
  for (let i = 0; i < Math.max(1, assinantes.length); i += ATA_ASSINATURAS_POR_LINHA) {
    linhasAssinatura.push(new TableRow({ children: Array.from({ length: ATA_ASSINATURAS_POR_LINHA }, (_, k) => celulaAssinatura(i + k)) }))
  }
  // Como no modelo: título e assinaturas na mesma caixa cinza; Obs em negrito.
  const assinaturasTabela = tabela([LARGURA], [
    { cells: [new TableCell({
      width: { size: LARGURA, type: WidthType.DXA }, borders: bordas,
      shading: { type: ShadingType.CLEAR, fill: CINZA, color: 'auto' },
      margins: { left: 80, right: 80, top: 20, bottom: 20 },
      children: [...titulo('Assinaturas'), new Table({ width: { size: LARGURA - 200, type: WidthType.DXA }, columnWidths: Array.from({ length: ATA_ASSINATURAS_POR_LINHA }, () => A), rows: linhasAssinatura }), new Paragraph({ children: [] })],
    })], altura: 1200 },
    { cells: [celula([...titulo('Obs:'), ...texto([{ t: textoSimples(d.observacoes), b: true }])], LARGURA)], altura: 900 },
  ])

  return new Document({
    creator: 'Operum',
    title: `Ata de Reunião Nº ${ataNumero(d.numero)}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 18 } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 850, right: 850, bottom: 850, left: 850 } } },
      children: [cabecalho, espaco(), quadro, tabelaAcoes, espaco(), anexos, espaco(), copias, espaco(), assinaturasTabela],
    }],
  })
}


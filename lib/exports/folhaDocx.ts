import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, HeightRule, HorizontalPositionRelativeFrom, ImageRun,
  LineRuleType, PageNumber, PageOrientation, Paragraph, ShadingType, Table, TableCell, TableLayoutType,
  TableRow, TabStopType, TextRun, TextWrappingType, VerticalPositionRelativeFrom, WidthType,
  type IBorderOptions,
} from 'docx'
import { baixarImagem, infoDaImagem } from './imagemDocx'

/**
 * Word idêntico a um documento paginado do editor (<Folha>), montado a partir das
 * folhas já desenhadas no navegador: mesma divisão em páginas, mesmas posições,
 * tabelas com as mesmas colunas e alturas de linha, texto quebrado nos mesmos
 * pontos (cada linha da tela vira uma linha no Word), imagens no mesmo lugar e o
 * rodapé "Página X de Y".
 *
 * Só funciona no navegador (usa o layout real). Serve para qualquer documento
 * desenhado com <Folha>; hoje é usado em Partes interessadas.
 */

const TWIP = 15 // twips por px (96 dpi)
const tw = (px: number) => Math.max(0, Math.round(px * TWIP))
const emu = (px: number) => Math.round(px * 9525)
const meioPt = (px: number) => Math.max(2, Math.round(px * 0.75 * 2))
/** Parágrafo mínimo (1 pt): início de página e separadores. */
const MINIMO_PX = 4 / 3

type Alinhamento = (typeof AlignmentType)[keyof typeof AlignmentType]
type Filho = Paragraph | Table

/** `quebraAntes`: o texto tinha uma quebra de linha digitada (Enter) antes desta palavra. */
interface Token { texto: string; espacoAntes: boolean; quebraAntes?: boolean; rect: DOMRect; estilo: EstiloRun; bloco: HTMLElement; ascendente: number }
interface EstiloRun { fonte: string; tamanho: number; negrito: boolean; italico: boolean; sublinhado: boolean; cor: string }
/** `base`: linha de base do texto na tela. */
interface Linha { tokens: Token[]; bloco: HTMLElement; centro: number; base: number; quebraAntes: boolean }
interface Caixa { left: number; right: number }
interface Flutuante { el: HTMLImageElement | SVGSVGElement; x: number; y: number; w: number; h: number }

const visivel = (el: Element) => {
  if ((el as HTMLElement).closest('[data-tela-apenas],[data-rodape-pagina],[data-medicao]')) return false
  const cs = getComputedStyle(el)
  return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.visibility !== 'collapse'
}

function corHex(cor: string): string | undefined {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(cor)
  if (!m || (m[4] !== undefined && Number(m[4]) === 0)) return undefined
  return [m[1], m[2], m[3]].map(n => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
}

const GENERICAS: Record<string, string> = { 'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Courier New', 'system-ui': 'Arial' }
const fontesTestadas = new Map<string, boolean>()
/** A fonte instalada é usada pelo navegador? (compara a largura com a de uma fonte genérica). */
function fonteDisponivel(nome: string): boolean {
  if (fontesTestadas.has(nome)) return fontesTestadas.get(nome)!
  const ctx = document.createElement('canvas').getContext('2d')
  let ok = true
  if (ctx) {
    const amostra = 'mmmmmmmmmmlliWWQ@#0123456789abcdefghij'
    ok = ['monospace', 'serif', 'sans-serif'].some(g => {
      ctx.font = `40px ${g}`; const base = ctx.measureText(amostra).width
      ctx.font = `40px "${nome}", ${g}`; return ctx.measureText(amostra).width !== base
    })
  }
  fontesTestadas.set(nome, ok)
  return ok
}
/** Primeira fonte da lista que o navegador tem de fato (a que aparece na tela). */
function fonteUsada(familia: string): string {
  for (const f of familia.split(',').map(x => x.trim().replace(/^["']|["']$/g, ''))) {
    if (GENERICAS[f]) return GENERICAS[f]
    if (fonteDisponivel(f)) return f
  }
  return 'Arial'
}
const px = (v: string) => Number.parseFloat(v) || 0

/** Bloco que contém a linha (o texto alinha e quebra dentro dele). */
function blocoDe(no: Node, limite: HTMLElement): HTMLElement {
  let el = no.parentElement
  while (el && el !== limite) {
    if (!getComputedStyle(el).display.startsWith('inline')) return el
    el = el.parentElement
  }
  return limite
}

function estiloDe(el: HTMLElement, bloco: HTMLElement): EstiloRun {
  const cs = getComputedStyle(el)
  // Sublinhado não é herdado no estilo calculado: procura até o bloco.
  let sublinhado = false
  for (let a: HTMLElement | null = el; a; a = a === bloco ? null : a.parentElement) {
    if (getComputedStyle(a).textDecorationLine.includes('underline')) { sublinhado = true; break }
  }
  return {
    fonte: fonteUsada(cs.fontFamily), tamanho: px(cs.fontSize),
    negrito: Number(cs.fontWeight) >= 600 || cs.fontWeight === 'bold', italico: cs.fontStyle === 'italic',
    sublinhado, cor: corHex(cs.color) ?? '000000',
  }
}

/** Palavras (ou pedaços de palavra quebrada) do texto visível, com a posição na tela. */
function tokensDe(raiz: HTMLElement, pular: (el: Element) => boolean): Token[] {
  const tokens: Token[] = []
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, {
    acceptNode: n => {
      const pai = n.parentElement
      if (!pai || !n.textContent) return NodeFilter.FILTER_REJECT
      for (let a: Element | null = pai; a && a !== raiz; a = a.parentElement) if (pular(a) || !visivel(a)) return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const range = document.createRange()
  let espacoPendente = false
  let quebraPendente = false
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const texto = n.textContent ?? ''
    const pai = n.parentElement!
    // Quebras digitadas só contam onde a tela as mostra (white-space pre/pre-wrap/pre-line).
    const preserva = /^pre|break-spaces/.test(getComputedStyle(pai).whiteSpace)
    // Só espaço (ex.: entre "<b>Rótulo:</b>" e o valor): vale como separador.
    if (!texto.trim()) { espacoPendente = true; if (preserva && texto.includes('\n')) quebraPendente = true; continue }
    const bloco = blocoDe(n, raiz)
    const estilo = estiloDe(pai, bloco)
    const asc = ascendente(pai)
    const re = /\S+/g
    let m: RegExpExecArray | null
    let fim = 0
    while ((m = re.exec(texto))) {
      const espacoAntes = espacoPendente || m.index > fim || (tokens.length > 0 && /\s/.test(texto[m.index - 1] ?? ''))
      const quebraAntes = quebraPendente || (preserva && texto.slice(fim, m.index).includes('\n'))
      espacoPendente = false; quebraPendente = false
      range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length)
      const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0)
      if (rects.length <= 1) {
        const rect = rects[0] ?? range.getBoundingClientRect()
        tokens.push({ texto: m[0], espacoAntes: espacoAntes && tokens.length > 0, quebraAntes, rect, estilo, bloco, ascendente: asc })
      } else {
        // Palavra quebrada no meio (ex.: e-mail longo): divide por linha, letra a letra.
        let atual = '', rectAtual: DOMRect | null = null, primeiro = true
        for (let k = 0; k < m[0].length; k++) {
          range.setStart(n, m.index + k); range.setEnd(n, m.index + k + 1)
          const r = range.getBoundingClientRect()
          if (rectAtual && Math.abs(r.top - rectAtual.top) > r.height / 2) {
            tokens.push({ texto: atual, espacoAntes: primeiro ? espacoAntes && tokens.length > 0 : false, quebraAntes: primeiro && quebraAntes, rect: rectAtual, estilo, bloco, ascendente: asc })
            atual = ''; rectAtual = null; primeiro = false
          }
          atual += m[0][k]
          rectAtual = rectAtual ? new DOMRect(rectAtual.left, Math.min(rectAtual.top, r.top), r.right - rectAtual.left, Math.max(rectAtual.bottom, r.bottom) - Math.min(rectAtual.top, r.top)) : r
        }
        if (atual && rectAtual) tokens.push({ texto: atual, espacoAntes: primeiro ? espacoAntes && tokens.length > 0 : false, quebraAntes: primeiro && quebraAntes, rect: rectAtual, estilo, bloco, ascendente: asc })
      }
      fim = m.index + m[0].length
    }
    if (fim < texto.length && /\s/.test(texto.slice(fim))) espacoPendente = true
    if (preserva && texto.slice(fim).includes('\n')) quebraPendente = true
  }
  range.detach?.()
  return tokens
}

const ascendentes = new Map<string, number>()
/** Distância do topo da caixa do texto até a linha de base, para a fonte do elemento. */
function ascendente(el: HTMLElement): number {
  const cs = getComputedStyle(el)
  const chave = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  if (ascendentes.has(chave)) return ascendentes.get(chave)!
  const caixa = document.createElement('div')
  caixa.style.cssText = `position:fixed;left:-30000px;top:0;white-space:nowrap;line-height:normal;font:${chave}`
  const texto = document.createElement('span'); texto.textContent = 'Hx'
  const sonda = document.createElement('span'); sonda.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
  caixa.append(texto, sonda); document.body.append(caixa)
  const r = document.createRange(); r.selectNodeContents(texto)
  const valor = sonda.getBoundingClientRect().bottom - r.getBoundingClientRect().top
  caixa.remove()
  ascendentes.set(chave, valor)
  return valor
}

/** Agrupa as palavras nas linhas que a tela desenhou. */
function linhasDe(tokens: Token[]): Linha[] {
  const linhas: Linha[] = []
  for (const t of tokens) {
    const centro = (t.rect.top + t.rect.bottom) / 2
    const base = t.rect.top + t.ascendente
    const ultima = linhas[linhas.length - 1]
    const ultimo = ultima?.tokens[ultima.tokens.length - 1]
    const mesma = ultima && !t.quebraAntes && ultima.bloco === t.bloco && ultimo && t.rect.left >= ultimo.rect.left - 0.5
      && centro > Math.min(...ultima.tokens.map(x => x.rect.top)) && centro < Math.max(...ultima.tokens.map(x => x.rect.bottom))
    if (mesma) { ultima.tokens.push(t); ultima.base = Math.max(ultima.base, base) }
    else linhas.push({ tokens: [t], bloco: t.bloco, centro, base, quebraAntes: !!t.quebraAntes })
  }
  return linhas
}

function alinhamento(bloco: HTMLElement): Alinhamento {
  const a = getComputedStyle(bloco).textAlign
  if (a === 'center' || a === '-webkit-center') return AlignmentType.CENTER
  // Justificado: as linhas com quebra automática (w:br) também esticam no Word, como na tela.
  if (a === 'justify') return AlignmentType.JUSTIFIED
  if (a === 'right' || a === 'end' || a === '-webkit-right') return AlignmentType.RIGHT
  return AlignmentType.LEFT
}

function alturaLinha(bloco: HTMLElement): number {
  const cs = getComputedStyle(bloco)
  return cs.lineHeight === 'normal' ? px(cs.fontSize) * 1.2 : px(cs.lineHeight)
}

/**
 * Nível do título no Word: o título do documento (h1…h6) e os títulos de seção
 * ([data-secao-titulo], faixa da tabela) viram "Título 1/2", para o Word mostrar a
 * hierarquia (painel de navegação, sumário) sem mudar a aparência.
 */
const NIVEIS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6]
function nivelTitulo(bloco: HTMLElement) {
  const h = bloco.closest('h1,h2,h3,h4,h5,h6')
  if (h) return NIVEIS[Number(h.tagName[1]) - 1]
  if (bloco.closest('[data-secao-titulo],tr[data-faixa]')) return HeadingLevel.HEADING_2
  return undefined
}

/** Estilos de título neutros: só a hierarquia; fonte, cor e espaços vêm de cada parágrafo. */
const estilosTitulo = [1, 2, 3, 4, 5, 6].map(n => ({
  id: `Heading${n}`, name: `heading ${n}`, basedOn: 'Normal', next: 'Normal', quickFormat: true,
  run: { bold: false, italics: false, color: '000000' },
  paragraph: { spacing: { before: 0, after: 0 }, outlineLevel: n - 1 },
}))

/** Caixa de conteúdo (sem borda e padding) do bloco. */
function conteudo(el: HTMLElement): Caixa {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
  return { left: r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft), right: r.right - px(cs.borderRightWidth) - px(cs.paddingRight) }
}

/**
 * Parágrafos de um recipiente (página ou célula). Cada linha da tela vira uma
 * linha no Word (quebra explícita), alinhada na mesma caixa do bloco; a caixa
 * ganha 1 mm de folga do lado livre para o Word não quebrar de novo.
 */
/** Alinhamento do segmento numa linha de colunas: tabulação do mesmo tipo, no ponto da tela. */
function tabDoSegmento(l: Linha, caixa: Caixa) {
  const al = alinhamento(l.bloco), cb = conteudo(l.bloco)
  if (al === AlignmentType.CENTER) return { type: TabStopType.CENTER, position: tw((cb.left + cb.right) / 2 - caixa.left) }
  if (al === AlignmentType.RIGHT) return { type: TabStopType.RIGHT, position: tw(cb.right - caixa.left) }
  return { type: TabStopType.LEFT, position: tw(l.tokens[0].rect.left - caixa.left) }
}

function paragrafos(linhas: Linha[], caixa: Caixa, topoInicial: number) {
  const saida: { p: Paragraph; topo: number; fim: number }[] = []
  let cursor = topoInicial
  const grupos: Linha[][] = []
  for (const l of linhas) {
    const g = grupos[grupos.length - 1]
    // Enter digitado começa outro parágrafo: no texto justificado, a última linha não estica.
    if (g && g[0].bloco === l.bloco && !l.quebraAntes) g.push(l)
    else grupos.push([l])
  }
  // Blocos lado a lado (colunas: "1.1" e o nome da fase, nomes nas assinaturas, grade de
  // cópias): blocos de uma linha na mesma linha de base viram uma linha do Word, com uma
  // tabulação por bloco (esquerda, centro ou direita, como o bloco na tela).
  const colunas = new Map<Linha[], Linha[]>()
  const usados = new Set<Linha[]>()
  const simples = grupos.filter(g => g.length === 1)
  for (const g of simples) {
    if (usados.has(g)) continue
    const mesmos = simples.filter(o => !usados.has(o) && Math.abs(o[0].base - g[0].base) < 2)
      .sort((x, y) => x[0].tokens[0].rect.left - y[0].tokens[0].rect.left)
    const disjuntos = mesmos.every((o, i) => i === 0 || o[0].tokens[0].rect.left > mesmos[i - 1][0].tokens[mesmos[i - 1][0].tokens.length - 1].rect.right)
    if (mesmos.length > 1 && disjuntos) {
      colunas.set(mesmos[0], mesmos.map(o => o[0]))
      mesmos.forEach(o => usados.add(o))
    }
  }
  const ordem = grupos.filter(g => !usados.has(g) || colunas.has(g)).sort((x, y) => x[0].base - y[0].base)
  const folga = 96 / 25.4
  ordem.forEach(g => {
    const linha = colunas.get(g)
    const bloco = g[0].bloco
    const lh = linha ? Math.max(...linha.map(l => alturaLinha(l.bloco))) : alturaLinha(bloco)
    const passo = g.length > 1 ? (g[g.length - 1].base - g[0].base) / (g.length - 1) : lh
    // Com altura exata, o Word põe a linha de base a 80% da linha (o navegador centraliza
    // pela fonte): a linha do Word começa onde a base da tela fica a 80% dela.
    const desejado = (linha ? Math.max(...linha.map(l => l.base)) : g[0].base) - 0.8 * passo
    const topo = Math.max(desejado, cursor)
    // Acima do recipiente (célula/página) não há espaço negativo: eleva o texto na linha.
    const elevar = (topo - desejado) * 0.75
    const al = linha ? AlignmentType.LEFT : alinhamento(bloco)
    const cb = conteudo(bloco)
    // Folga só do lado livre; justificado usa a largura exata (as linhas vão de ponta a ponta).
    const livreEsq = al === AlignmentType.CENTER || al === AlignmentType.RIGHT
    const livreDir = al === AlignmentType.CENTER || al === AlignmentType.LEFT
    const esq = linha ? 0 : Math.max(0, cb.left - caixa.left - (livreEsq ? folga : 0))
    const dir = linha ? 0 : Math.max(0, caixa.right - cb.right - (livreDir ? folga : 0))
    const filhos: TextRun[] = []
    // Palavras seguidas com o mesmo estilo formam um só trecho (fica fácil editar no Word).
    const posicao = Math.round(elevar * 2)
    const sequencia: { l: Linha; tab: boolean; quebra: boolean }[] = linha
      ? linha.map(l => ({ l, tab: true, quebra: false }))
      : g.map((l, i) => ({ l, tab: false, quebra: i > 0 }))
    sequencia.forEach(({ l, tab, quebra }) => {
      let atual: { texto: string; e: EstiloRun; quebra: boolean } | null = null
      const fechar = () => {
        if (!atual) return
        const e = atual.e
        filhos.push(new TextRun({
          text: atual.texto, font: e.fonte, size: meioPt(e.tamanho), bold: e.negrito, italics: e.italico,
          underline: e.sublinhado ? {} : undefined, color: e.cor, ...(atual.quebra ? { break: 1 } : {}),
          // w:position é em meios-pontos inteiros (o Word ignora frações).
          ...(posicao > 0 ? { position: String(posicao) as unknown as `${number}pt` } : {}),
        }))
        atual = null
      }
      l.tokens.forEach((t, k) => {
        const texto = (tab && k === 0 ? '\t' : '') + (k > 0 && t.espacoAntes ? ' ' : '') + t.texto
        if (atual && JSON.stringify(atual.e) === JSON.stringify(t.estilo)) atual.texto += texto
        else { fechar(); atual = { texto, e: t.estilo, quebra: quebra && k === 0 } }
      })
      fechar()
    })
    saida.push({
      topo, fim: topo + passo * g.length,
      p: new Paragraph({
        heading: nivelTitulo(bloco), alignment: al, indent: { left: tw(esq), right: tw(dir) }, keepLines: true,
        ...(linha ? { tabStops: linha.map(l => tabDoSegmento(l, caixa)) } : {}),
        spacing: { before: tw(topo - cursor), after: 0, line: tw(passo), lineRule: LineRuleType.EXACT },
        children: filhos,
      }),
    })
    cursor = topo + passo * g.length
  })
  return saida
}

const minimo = (opcoes: Partial<ConstructorParameters<typeof Paragraph>[0] & object> = {}) =>
  new Paragraph({ ...opcoes, spacing: { before: 0, after: 0, line: tw(MINIMO_PX), lineRule: LineRuleType.EXACT }, children: [...((opcoes as { children?: (TextRun | ImageRun)[] }).children ?? []), new TextRun({ text: '', size: 2 })] })

function espacador(altura: number): Paragraph {
  return new Paragraph({ spacing: { before: 0, after: 0, line: tw(Math.max(altura, MINIMO_PX)), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: '', size: 2 })] })
}

function borda(cs: CSSStyleDeclaration, lado: 'Top' | 'Right' | 'Bottom' | 'Left'): IBorderOptions {
  const largura = px(cs.getPropertyValue(`border-${lado.toLowerCase()}-width`))
  const estilo = cs.getPropertyValue(`border-${lado.toLowerCase()}-style`)
  if (!largura || estilo === 'none' || estilo === 'hidden') return { style: BorderStyle.NONE, size: 0, color: 'auto' }
  return { style: BorderStyle.SINGLE, size: Math.max(2, Math.round(largura * 6)), color: corHex(cs.getPropertyValue(`border-${lado.toLowerCase()}-color`)) ?? '000000' }
}

/** Tabela com as mesmas colunas e alturas de linha da tela. */
/** Tabelas encostadas na tela (seções "coladas") viram uma tabela só, com a grade unida. */
function tabela(els: HTMLTableElement[], caixaPagina: Caixa, imagens: Flutuante[]): Table {
  const el = els[els.length - 1]
  const linhas = els.flatMap(t => [...t.rows].filter(visivel))
  const celulas = linhas.map(r => [...r.cells].filter(visivel))
  // Grade de colunas: todas as bordas verticais das células.
  const xs: number[] = []
  const marcar = (x: number) => { if (!xs.some(v => Math.abs(v - x) < 1)) xs.push(x) }
  celulas.flat().forEach(c => { const r = c.getBoundingClientRect(); marcar(r.left); marcar(r.right) })
  xs.sort((a, b) => a - b)
  const indice = (x: number) => xs.findIndex(v => Math.abs(v - x) < 1)
  const larguras = xs.slice(1).map((x, i) => tw(x - xs[i]))
  const fimTabela = el.getBoundingClientRect().bottom
  const topos = linhas.map(r => r.getBoundingClientRect().top)

  const rows = linhas.map((r, i) => {
    const topo = topos[i]
    const altura = (i + 1 < linhas.length ? topos[i + 1] : fimTabela) - topo
    return new TableRow({
      height: { value: tw(altura), rule: HeightRule.EXACT }, cantSplit: true,
      children: celulas[i].map(c => {
        const rc = c.getBoundingClientRect(), cs = getComputedStyle(c)
        const span = Math.max(1, indice(rc.right) - indice(rc.left))
        c.querySelectorAll('img').forEach(img => { if (visivel(img)) imagens.push(posicaoImagem(img as HTMLImageElement)) })
        const fundo = corHex(cs.backgroundColor) ?? corHex(getComputedStyle(r).backgroundColor)
        // O Word começa o texto da célula abaixo da borda de cima dela.
        const inicio = topo + px(cs.borderTopWidth)
        const ps = paragrafos(linhasDe(tokensDe(c, () => false)), { left: rc.left, right: rc.right }, inicio).map(x => x.p)
        return new TableCell({
          columnSpan: span > 1 ? span : undefined,
          width: { size: larguras.slice(indice(rc.left), indice(rc.left) + span).reduce((a, b) => a + b, 0), type: WidthType.DXA },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          shading: fundo ? { type: ShadingType.CLEAR, fill: fundo, color: 'auto' } : undefined,
          borders: { top: borda(cs, 'Top'), right: borda(cs, 'Right'), bottom: borda(cs, 'Bottom'), left: borda(cs, 'Left') },
          children: ps.length ? ps : [minimo()],
        })
      }),
    })
  })
  return new Table({
    rows, columnWidths: larguras, layout: TableLayoutType.FIXED,
    width: { size: larguras.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    indent: { size: tw(xs[0] - caixaPagina.left), type: WidthType.DXA },
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'auto' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' }, left: { style: BorderStyle.NONE, size: 0, color: 'auto' }, right: { style: BorderStyle.NONE, size: 0, color: 'auto' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' } },
  })
}

/** Elemento com borda nos quatro lados (fora de tabela): no Word vira uma tabela de uma célula. */
function ehCaixa(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase()
  if (['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'img', 'svg'].includes(tag) || el.closest('table,svg') || !visivel(el)) return false
  const cs = getComputedStyle(el)
  return (['top', 'right', 'bottom', 'left'] as const).every(l => px(cs.getPropertyValue(`border-${l}-width`)) > 0 && !['none', 'hidden'].includes(cs.getPropertyValue(`border-${l}-style`)))
}

function caixaComoTabela(el: HTMLElement, caixaPagina: Caixa, imagens: Flutuante[]): Table {
  const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
  el.querySelectorAll('img').forEach(img => { if (visivel(img)) imagens.push(posicaoImagem(img as HTMLImageElement)) })
  const fundo = corHex(cs.backgroundColor)
  const ps = paragrafos(linhasDe(tokensDe(el, () => false)), { left: r.left, right: r.right }, r.top + px(cs.borderTopWidth)).map(x => x.p)
  const largura = tw(r.width)
  return new Table({
    columnWidths: [largura], layout: TableLayoutType.FIXED, width: { size: largura, type: WidthType.DXA },
    indent: { size: tw(r.left - caixaPagina.left), type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 },
    rows: [new TableRow({
      height: { value: tw(r.height), rule: HeightRule.EXACT }, cantSplit: true,
      children: [new TableCell({
        width: { size: largura, type: WidthType.DXA }, margins: { top: 0, bottom: 0, left: 0, right: 0 },
        shading: fundo ? { type: ShadingType.CLEAR, fill: fundo, color: 'auto' } : undefined,
        borders: { top: borda(cs, 'Top'), right: borda(cs, 'Right'), bottom: borda(cs, 'Bottom'), left: borda(cs, 'Left') },
        children: ps.length ? ps : [minimo()],
      })],
    })],
  })
}

/** Onde a imagem aparece de fato (object-fit: contain e object-position). */
function posicaoImagem(img: HTMLImageElement): Flutuante {
  const r = img.getBoundingClientRect(), cs = getComputedStyle(img)
  let w = r.width, h = r.height
  if (cs.objectFit === 'contain' && img.naturalWidth && img.naturalHeight) {
    const e = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight)
    w = img.naturalWidth * e; h = img.naturalHeight * e
  }
  const [px0, py0] = cs.objectPosition.split(' ').map(v => (v.endsWith('%') ? Number.parseFloat(v) / 100 : 0.5))
  return { el: img, x: r.left + (r.width - w) * (px0 ?? 0.5), y: r.top + (r.height - h) * (py0 ?? 0.5), w, h }
}

/** Desenho em SVG (ex.: EAP gráfica) na posição e tamanho da tela. */
function posicaoSvg(svg: SVGSVGElement): Flutuante {
  const r = svg.getBoundingClientRect()
  return { el: svg, x: r.left, y: r.top, w: r.width, h: r.height }
}

/**
 * SVG como arquivo independente: largura/altura fixas, namespace e as fontes
 * calculadas em cada <text> (o arquivo não herda o CSS da página).
 */
function svgSozinho(svg: SVGSVGElement, w: number, h: number): string {
  const copia = svg.cloneNode(true) as SVGSVGElement
  copia.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  copia.setAttribute('width', String(w)); copia.setAttribute('height', String(h))
  copia.removeAttribute('style')
  const originais = svg.querySelectorAll('text'), copias = copia.querySelectorAll('text')
  originais.forEach((t, i) => {
    const cs = getComputedStyle(t)
    copias[i]?.setAttribute('font-family', fonteUsada(cs.fontFamily))
  })
  return new XMLSerializer().serializeToString(copia)
}

/** PNG do SVG em alta resolução: reserva para quem abre em Word sem suporte a SVG. */
async function pngDoSvg(texto: string, w: number, h: number, escala = 4): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml' }))
  try {
    const img = new Image()
    await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error('Imagem indisponível: desenho')); img.src = url })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(w * escala); canvas.height = Math.ceil(h * escala)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Imagem indisponível: desenho')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(ok => canvas.toBlob(ok, 'image/png'))
    if (!blob) throw new Error('Imagem indisponível: desenho')
    return new Uint8Array(await blob.arrayBuffer())
  } finally { URL.revokeObjectURL(url) }
}

async function imagemFlutuante(f: Flutuante, pagina: DOMRect): Promise<ImageRun> {
  const posicao = {
    horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(f.x - pagina.left) },
    verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(f.y - pagina.top) },
    wrap: { type: TextWrappingType.NONE }, allowOverlap: true, lockAnchor: true,
  }
  if (f.el instanceof SVGSVGElement) {
    const nome = f.el.getAttribute('aria-label') || 'Desenho'
    const texto = svgSozinho(f.el, f.w, f.h)
    const png = await pngDoSvg(texto, f.w, f.h)
    return new ImageRun({
      type: 'svg', data: new TextEncoder().encode(texto), fallback: { type: 'png', data: png },
      altText: { name: nome, description: nome, title: nome }, transformation: { width: f.w, height: f.h }, floating: posicao,
    })
  }
  const bytes = await baixarImagem(f.el.currentSrc || f.el.src, { credentials: 'same-origin' })
  const info = bytes ? infoDaImagem(bytes) : null
  if (!bytes || !info) throw new Error(`Imagem indisponível: ${f.el.alt || 'imagem'}`)
  return new ImageRun({
    type: info.tipo, data: bytes, altText: { name: f.el.alt || 'Imagem', description: f.el.alt || 'Imagem', title: f.el.alt || 'Imagem' },
    transformation: { width: f.w, height: f.h }, floating: posicao,
  })
}

interface Decoracao { x: number; y: number; w: number; h: number; cor: string; atras: boolean }

/**
 * Fundos e bordas de elementos que não são células de tabela (caixas cinza, linha de
 * assinatura): retângulos na mesma posição da tela. Fundos ficam atrás do texto; linhas,
 * na frente (para aparecerem também sobre células com fundo).
 */
function decoracoes(pagina: HTMLElement, caixas: HTMLElement[]): Decoracao[] {
  const saida: Decoracao[] = []
  pagina.querySelectorAll<HTMLElement>('*').forEach(el => {
    const tag = el.tagName.toLowerCase()
    if (['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'colgroup', 'col', 'img'].includes(tag) || el.closest('svg') || !visivel(el)) return
    // Caixas com borda nos 4 lados viram tabela de uma célula (borda e fundo de verdade no Word).
    if (caixas.includes(el)) return
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    const cs = getComputedStyle(el)
    const fundo = corHex(cs.backgroundColor)
    if (fundo && fundo !== 'FFFFFF') saida.push({ x: r.left, y: r.top, w: r.width, h: r.height, cor: fundo, atras: true })
    const lados = [
      ['top', r.left, r.top, r.width, null], ['bottom', r.left, null, r.width, null],
      ['left', r.left, r.top, null, r.height], ['right', null, r.top, null, r.height],
    ] as const
    for (const [lado, x, y, w, h] of lados) {
      const largura = px(cs.getPropertyValue(`border-${lado}-width`))
      const estilo = cs.getPropertyValue(`border-${lado}-style`)
      const cor = corHex(cs.getPropertyValue(`border-${lado}-color`))
      if (!largura || estilo === 'none' || estilo === 'hidden' || !cor) continue
      saida.push({
        x: x ?? r.right - largura, y: y ?? r.bottom - largura,
        w: w ?? largura, h: h ?? largura, cor, atras: false,
      })
    }
  })
  return saida
}

const pngs = new Map<string, Promise<Uint8Array>>()
/** PNG de 1 × 1 na cor pedida (esticado no Word até o tamanho do retângulo). */
function pngDaCor(cor: string): Promise<Uint8Array> {
  if (!pngs.has(cor)) {
    pngs.set(cor, (async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Imagem indisponível: fundo')
      ctx.fillStyle = `#${cor}`; ctx.fillRect(0, 0, 1, 1)
      const blob = await new Promise<Blob | null>(ok => canvas.toBlob(ok, 'image/png'))
      if (!blob) throw new Error('Imagem indisponível: fundo')
      return new Uint8Array(await blob.arrayBuffer())
    })())
  }
  return pngs.get(cor)!
}

/** Retângulo vetorial (nítido em qualquer zoom, como a borda da tela), com PNG de reserva. */
async function retangulo(d: Decoracao, pagina: DOMRect): Promise<ImageRun> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}" preserveAspectRatio="none"><rect width="${d.w}" height="${d.h}" fill="#${d.cor}" shape-rendering="crispEdges"/></svg>`
  return new ImageRun({
    type: 'svg', data: new TextEncoder().encode(svg), fallback: { type: 'png', data: await pngDaCor(d.cor) },
    altText: { name: 'Fundo', description: 'Fundo', title: 'Fundo' },
    transformation: { width: d.w, height: d.h },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(d.x - pagina.left) },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(d.y - pagina.top) },
      wrap: { type: TextWrappingType.NONE }, allowOverlap: true, lockAnchor: true, behindDocument: d.atras,
    },
  })
}

function rodapeDe(pagina: HTMLElement, caixa: Caixa): { footer: Footer; distancia: number; estilo: EstiloRun } | null {
  const rod = pagina.querySelector<HTMLElement>('[data-rodape-pagina]')
  if (!rod) return null
  const pr = pagina.getBoundingClientRect(), rr = rod.getBoundingClientRect()
  const spans = [...rod.children] as HTMLElement[]
  const esquerda = spans[0]?.textContent?.trim() ?? ''
  const numero = spans.find(s => /P[aá]gina\s+\d+\s+de\s+\d+/.test(s.textContent ?? ''))
  const e = estiloDe(rod, rod)
  const base = { font: e.fonte, size: meioPt(e.tamanho), color: e.cor }
  return {
    estilo: e, distancia: pr.bottom - rr.bottom,
    footer: new Footer({
      children: [new Paragraph({
        spacing: { before: 0, after: 0, line: tw(rr.height), lineRule: LineRuleType.EXACT },
        indent: { left: tw(rr.left - caixa.left), right: tw(caixa.right - rr.right) },
        tabStops: [{ type: TabStopType.RIGHT, position: tw(rr.right - caixa.left) }],
        children: [
          new TextRun({ ...base, text: esquerda }),
          ...(numero ? [new TextRun({ ...base, children: ['\tPágina ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES] })] : []),
        ],
      })],
    }),
  }
}

/**
 * Espera a folha ficar pronta para medir: fontes carregadas, imagens carregadas e
 * paginação estável (mesmo número de folhas e mesma altura por alguns quadros).
 */
export async function esperarFolhaPronta(raiz: HTMLElement, limiteMs = 4000): Promise<void> {
  const inicio = performance.now()
  await document.fonts?.ready
  await Promise.all([...raiz.querySelectorAll('img')].filter(i => !i.complete).map(i => new Promise<void>(ok => {
    i.addEventListener('load', () => ok(), { once: true }); i.addEventListener('error', () => ok(), { once: true })
  })))
  const quadro = () => new Promise<void>(ok => requestAnimationFrame(() => ok()))
  let anterior = '', iguais = 0
  while (iguais < 3 && performance.now() - inicio < limiteMs) {
    await quadro()
    const atual = `${raiz.querySelectorAll('[data-folha]').length}:${raiz.getBoundingClientRect().height}`
    iguais = atual === anterior ? iguais + 1 : 0
    anterior = atual
  }
}

/** Monta o Word a partir das folhas desenhadas em `raiz` (o elemento do <Folha>). */
export async function folhaParaDocx(raiz: HTMLElement, titulo: string): Promise<Document> {
  const paginas = [...raiz.querySelectorAll<HTMLElement>('[data-folha]')]
  if (!paginas.length) throw new Error('Documento sem folhas')
  const p0 = paginas[0], pr0 = p0.getBoundingClientRect(), cs0 = getComputedStyle(p0)
  const margem = { topo: px(cs0.paddingTop), esq: px(cs0.paddingLeft), dir: px(cs0.paddingRight), base: px(cs0.paddingBottom) }
  const caixaPagina = (p: HTMLElement): Caixa => { const r = p.getBoundingClientRect(); return { left: r.left + margem.esq, right: r.right - margem.dir } }
  const rodape = rodapeDe(p0, caixaPagina(p0))

  const filhos: Filho[] = []
  for (const [n, pagina] of paginas.entries()) {
    const pr = pagina.getBoundingClientRect()
    const caixa = caixaPagina(pagina)
    const imagens: Flutuante[] = []
    const corpo: Filho[] = []
    // Topo da área útil; o parágrafo mínimo do início da página já ocupa 1 pt.
    let cursor = pr.top + margem.topo

    // Itens de primeiro nível: tabelas, imagens soltas e linhas de texto fora das tabelas.
    const tabelas = [...pagina.querySelectorAll<HTMLTableElement>('table')].filter(t => visivel(t) && !t.parentElement?.closest('table'))
    // Desenhos (SVG de primeiro nível) entram inteiros como imagem; o texto deles não vai para o fluxo.
    pagina.querySelectorAll<SVGSVGElement>('svg').forEach(svg => {
      if (visivel(svg) && !svg.parentElement?.closest('svg') && !svg.closest('table') && svg.getBoundingClientRect().width > 0) imagens.push(posicaoSvg(svg))
    })
    const caixas = [...pagina.querySelectorAll<HTMLElement>('*')].filter(ehCaixa).filter((c, _, todas) => !todas.some(o => o !== c && o.contains(c)))
    const linhasSoltas = linhasDe(tokensDe(pagina, el => el.tagName === 'TABLE' || el.tagName.toLowerCase() === 'svg' || caixas.includes(el as HTMLElement)))
    type Item = { topo: number; tipo: 'tabela'; els: HTMLTableElement[] } | { topo: number; tipo: 'linhas'; linhas: Linha[] } | { topo: number; tipo: 'caixa'; el: HTMLElement }
    // Tabelas encostadas (até 2 px entre uma e outra) formam um bloco só.
    const blocosTabela: HTMLTableElement[][] = []
    for (const t of [...tabelas].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)) {
      const ultimo = blocosTabela[blocosTabela.length - 1]
      if (ultimo && t.getBoundingClientRect().top - ultimo[ultimo.length - 1].getBoundingClientRect().bottom <= 2) ultimo.push(t)
      else blocosTabela.push([t])
    }
    const itens: Item[] = blocosTabela.map(b => ({ topo: b[0].getBoundingClientRect().top, tipo: 'tabela' as const, els: b }))
    itens.push(...caixas.map(c => ({ topo: c.getBoundingClientRect().top, tipo: 'caixa' as const, el: c })))
    pagina.querySelectorAll('img').forEach(img => { if (visivel(img) && !img.closest('table') && !caixas.some(c => c.contains(img))) imagens.push(posicaoImagem(img as HTMLImageElement)) })
    // Linhas consecutivas entre duas tabelas formam um grupo.
    for (const l of linhasSoltas) {
      const topo = l.centro
      const grupo = itens.find(i => i.tipo === 'linhas' && ![...tabelas, ...caixas].some(t => { const r = t.getBoundingClientRect(); return r.top > Math.min(i.topo, topo) && r.top < Math.max(i.topo, topo) }))
      if (grupo && grupo.tipo === 'linhas') grupo.linhas.push(l)
      else itens.push({ topo, tipo: 'linhas', linhas: [l] })
    }
    itens.sort((a, b) => a.topo - b.topo)

    for (const item of itens) {
      if (item.tipo === 'linhas') {
        const ps = paragrafos(item.linhas, caixa, cursor)
        ps.forEach(x => corpo.push(x.p))
        cursor = ps[ps.length - 1]?.fim ?? cursor
      } else if (item.tipo === 'caixa') {
        const r = item.el.getBoundingClientRect()
        if (r.top - cursor > 0.5 || corpo[corpo.length - 1] instanceof Table) corpo.push(espacador(r.top - cursor))
        corpo.push(caixaComoTabela(item.el, caixa, imagens))
        cursor = r.bottom + px(getComputedStyle(item.el).borderBottomWidth) / 2
      } else {
        const r = item.els[0].getBoundingClientRect()
        const fim = item.els[item.els.length - 1].getBoundingClientRect().bottom
        // Entre dois blocos o Word precisa de um parágrafo; ele tem a altura do espaço da tela.
        if (r.top - cursor > 0.5 || corpo[corpo.length - 1] instanceof Table) corpo.push(espacador(r.top - cursor))
        corpo.push(tabela(item.els, caixa, imagens))
        // O Word soma metade da borda de baixo da última linha à altura da tabela.
        const ultima = [...item.els[item.els.length - 1].rows].filter(visivel).pop()
        const bordaBaixo = ultima ? Math.max(0, ...[...ultima.cells].map(c => px(getComputedStyle(c).borderBottomWidth))) : 0
        cursor = fim + bordaBaixo / 2
      }
    }

    const flutuantes = [
      ...await Promise.all(decoracoes(pagina, caixas).map(d => retangulo(d, pr))),
      ...await Promise.all(imagens.map(f => imagemFlutuante(f, pr))),
    ]
    // Início da página: parágrafo de 1 pt (quebra de página e âncora das imagens da folha).
    filhos.push(minimo({ pageBreakBefore: n > 0, children: flutuantes }))
    filhos.push(...corpo)
  }
  filhos.push(minimo())

  const paisagem = pr0.width > pr0.height
  const larguraTw = tw(Math.min(pr0.width, pr0.height)), alturaTw = tw(Math.max(pr0.width, pr0.height))
  return new Document({
    creator: 'Operum', title: titulo,
    // Kerning ligado, como no navegador.
    // Fonte padrão = a do rodapé: os números de página (campos) usam a fonte padrão.
    styles: { paragraphStyles: estilosTitulo, default: { document: { run: { kern: 2, ...(rodape ? { font: rodape.estilo.fonte, size: meioPt(rodape.estilo.tamanho), color: rodape.estilo.cor } : {}) } } } },
    sections: [{
      properties: {
        page: {
          size: { width: larguraTw, height: alturaTw, orientation: paisagem ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: {
            top: tw(margem.topo - MINIMO_PX), left: tw(margem.esq), right: tw(margem.dir),
            // 2 mm de folga embaixo: arredondamentos não empurram linhas para outra página.
            bottom: tw(Math.max(margem.base - 2 * 96 / 25.4, 0)),
            header: 0, footer: tw(rodape?.distancia ?? 0),
          },
        },
      },
      footers: rodape ? { default: rodape.footer } : undefined,
      children: filhos,
    }],
  })
}

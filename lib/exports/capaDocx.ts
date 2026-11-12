import {
  AlignmentType, Document, HorizontalPositionRelativeFrom, ImageRun, LineRuleType, Paragraph,
  TabStopType, TextRun, TextWrappingType, VerticalPositionRelativeFrom,
} from 'docx'
import type { CapaConteudo } from '@/lib/validation/documentRevisionSchemas'
import {
  CAPA, CAPA_LINHA_TOPO, ESTILO_CAPA, PREFIXO_EMAIL, SEM_INTEGRANTES, TITULO_INTEGRANTES,
  layoutCapa, linhaEmail, linhaMm, type ItemCapa, type LinhasCapa,
} from '@/lib/capaLayout'
import { infoDaImagem } from './imagemDocx'

/**
 * Capa em Word idêntica à folha do sistema: as mesmas posições de lib/capaLayout.
 * Banner, linha e logo ficam ancorados na página; os textos usam altura de linha
 * exata, com o espaço acima de cada bloco calculado para cair no mesmo ponto.
 */

export interface CapaExportData {
  capa: Required<CapaConteudo>
  nomeProjeto: string
  integrantes: string[]
  /** Linhas de cada campo medidas na folha do sistema (ver medirLinhasCapa). */
  linhas?: LinhasCapa
}
export interface CapaImagens { cabecalho: Uint8Array | null; logo: Uint8Array | null }

const twip = (mm: number) => Math.max(0, Math.round(mm * 1440 / 25.4))
const px = (mm: number) => mm * 96 / 25.4
const emu = (mm: number) => Math.round(mm * 36000)
const hex = (cor: string) => cor.replace('#', '').toUpperCase()

/** PNG 1×1 na cor da linha do banner (a linha é uma imagem fina, posicionada como no sistema). */
function pngLinha(): Uint8Array {
  const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGMIDQ0FAAICAQAgdqf7AAAAAElFTkSuQmCC'
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

function flutuante(data: Uint8Array, tipo: 'png' | 'jpg' | 'gif', x: number, y: number, largura: number, altura: number, nome: string) {
  return new ImageRun({
    type: tipo, data, altText: { name: nome, description: nome, title: nome },
    transformation: { width: px(largura), height: px(altura) },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: emu(x) },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: emu(y) },
      wrap: { type: TextWrappingType.NONE }, allowOverlap: true, lockAnchor: true,
    },
  })
}

function linhasDoTexto(texto: string, base: { size: number; bold?: boolean; color?: string; underline?: boolean }) {
  return texto.split('\n').map((t, i) => new TextRun({ ...base, text: t, underline: base.underline ? {} : undefined, ...(i > 0 ? { break: 1 } : {}) }))
}

export function buildCapaDocx(d: CapaExportData, img: CapaImagens): Document {
  const itens = layoutCapa(d.capa, d.integrantes.length, d.linhas)
  type Opcoes = Exclude<ConstructorParameters<typeof Paragraph>[0], string> & { children: (TextRun | ImageRun)[] }
  const paragrafos: Opcoes[] = []
  let cursor: number = CAPA.margem.topo
  const flutuantes: ImageRun[] = []

  // Banner centralizado e linha abaixo dele.
  const infoCab = img.cabecalho ? infoDaImagem(img.cabecalho) : null
  if (img.cabecalho && infoCab) {
    const largura = CAPA.cabecalho.altura * infoCab.largura / infoCab.altura
    flutuantes.push(flutuante(img.cabecalho, infoCab.tipo, (CAPA.pagina.largura - largura) / 2, CAPA.margem.topo, largura, CAPA.cabecalho.altura, 'Fatec Garça, Centro Paula Souza e Governo do Estado de São Paulo'))
  }
  flutuantes.push(flutuante(pngLinha(), 'png', CAPA.margem.x, CAPA_LINHA_TOPO, CAPA.pagina.largura - 2 * CAPA.margem.x, CAPA.linha.espessura, 'Linha'))

  const paragrafo = (topo: number, alturaLinha: number, opcoes: Opcoes, padY = 0) => {
    paragrafos.push({
      ...opcoes,
      // Só "antes": Word e LibreOffice não somam o "depois" de um parágrafo ao "antes" do seguinte.
      spacing: { before: twip(topo - cursor + padY), after: 0, line: twip(alturaLinha), lineRule: LineRuleType.EXACT },
    })
  }

  for (const item of itens) {
    if (item.tipo === 'campo' && item.campo) {
      campo(item)
    } else if (item.tipo === 'logo') {
      logo(item)
    } else if (item.tipo === 'integrantes') {
      const linha = linhaMm(11)
      const nomes = d.integrantes.length ? d.integrantes : [SEM_INTEGRANTES]
      paragrafo(item.topo, linha, { alignment: AlignmentType.RIGHT, keepNext: true, children: [new TextRun({ text: TITULO_INTEGRANTES, bold: true, size: 22 })] })
      cursor = item.topo + linha
      for (const nome of nomes) {
        paragrafo(cursor, linha, { alignment: AlignmentType.RIGHT, keepNext: true, children: [new TextRun({ text: nome, size: 22, color: d.integrantes.length ? undefined : hex(CAPA.cor.vazio) })] })
        cursor += linha
      }
    }
  }

  function campo(item: ItemCapa) {
    const c = item.campo!
    const e = ESTILO_CAPA[c]
    const valor = e.maiusculas ? d.capa[c].toLocaleUpperCase('pt-BR') : d.capa[c]
    const base = { size: e.pt * 2, bold: e.negrito, color: e.cor ? hex(e.cor) : undefined, underline: e.sublinhado }
    if (c === 'email') {
      const pos = linhaEmail(valor)
      paragrafo(item.topo, linhaMm(e.pt), {
        tabStops: [{ type: TabStopType.LEFT, position: twip(pos.prefixo - CAPA.margem.x) }, { type: TabStopType.LEFT, position: twip(pos.texto - CAPA.margem.x) }],
        children: [new TextRun({ text: `\t${PREFIXO_EMAIL}\t`, size: e.pt * 2 }), new TextRun({ ...base, text: valor, underline: {} })],
      }, CAPA.padding.y)
    } else {
      paragrafo(item.topo, linhaMm(e.pt), {
        alignment: e.alinhamento === 'right' ? AlignmentType.RIGHT : e.alinhamento === 'left' ? AlignmentType.LEFT : AlignmentType.CENTER,
        indent: { left: twip(CAPA.padding.x), right: twip(CAPA.padding.x) },
        children: linhasDoTexto(valor, base),
      }, CAPA.padding.y)
    }
    // O espaço interno de baixo entra no "antes" do próximo bloco.
    cursor = item.topo + item.altura - CAPA.padding.y
  }

  function logo(item: ItemCapa) {
    const info = img.logo ? infoDaImagem(img.logo) : null
    if (img.logo && info && info.largura && info.altura) {
      const caixa = CAPA.logo.caixa
      const escala = Math.min(caixa / info.largura, caixa / info.altura)
      const w = info.largura * escala, h = info.altura * escala
      const topoCaixa = item.topo + (item.altura - caixa) / 2
      flutuantes.push(flutuante(img.logo, info.tipo, (CAPA.pagina.largura - caixa) / 2 + (caixa - w) / 2, topoCaixa + (caixa - h) / 2, w, h, `Logo do projeto ${d.nomeProjeto}`))
      return
    }
    // Sem logo: o nome do projeto, centralizado na região.
    const linha = linhaMm(CAPA.logo.nomeFonte)
    const topo = item.topo + (item.altura - linha) / 2
    paragrafo(topo, linha, { alignment: AlignmentType.CENTER, children: [new TextRun({ text: d.nomeProjeto, bold: true, size: CAPA.logo.nomeFonte * 2 })] })
    cursor = topo + linha
  }

  // Imagens ancoradas no primeiro parágrafo (posição absoluta na página).
  paragrafos[0] = { ...paragrafos[0], children: [...flutuantes, ...paragrafos[0].children] }

  return new Document({
    creator: 'Operum', title: `Capa - ${d.nomeProjeto}`,
    // Kerning ligado: o navegador aplica os pares de kerning da fonte e quebra as linhas nos mesmos pontos.
    styles: { default: { document: { run: { font: CAPA.fonte, size: 24, kern: 2 } } } },
    sections: [{
      properties: {
        page: {
          size: { width: twip(CAPA.pagina.largura), height: twip(CAPA.pagina.altura) },
          // Base 0: as posições já reservam os 9 mm do sistema; evita uma 2ª página por arredondamento.
          margin: { top: twip(CAPA.margem.topo), right: twip(CAPA.margem.x), bottom: 0, left: twip(CAPA.margem.x), header: 0, footer: 0 },
        },
      },
      children: paragrafos.map(o => new Paragraph(o)),
    }],
  })
}

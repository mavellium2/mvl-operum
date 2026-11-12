import type { CapaConteudo } from '@/lib/validation/documentRevisionSchemas'

/**
 * Geometria da Capa (mm, folha A4 em pé). Fonte única para a folha do sistema
 * (CapaFolha) e para o Word (capaDocx): o Word reproduz as mesmas posições.
 */
export const CAPA = {
  pagina: { largura: 210, altura: 297 },
  margem: { topo: 12, x: 25, base: 9 },
  /** Banner Fatec / CPS / Governo SP (558 × 74 px). */
  cabecalho: { src: '/documentos/cabecalho-fatec-cps-sp.png', altura: 19, proporcao: 558 / 74 },
  /** Linha abaixo do banner: espaço acima, espessura e espaço abaixo. */
  linha: { antes: 3, espessura: 0.26, depois: 6, cor: '#555555' },
  espacoBloco: 8,
  espacoPeriodo: 6,
  espacoIntegrantes: 22,
  logo: { caixa: 75, regiaoMin: 60, nomeFonte: 20 },
  /** Espaço interno dos campos (2px × 6px). */
  padding: { y: 2 * 25.4 / 96, x: 6 * 25.4 / 96 },
  alturaLinha: 1.25,
  fonte: 'Arial',
  cor: { instituicao: '#c00000', email: '#1155cc', vazio: '#666666' },
} as const

export const PT_MM = 25.4 / 72
/** Altura de uma linha de texto (mm) no corpo `pt`. */
export const linhaMm = (pt: number) => pt * CAPA.alturaLinha * PT_MM
/** Fim da linha do banner: imagem + descendente da linha (medido no navegador: 35,31 mm). */
export const CAPA_LINHA_TOPO = 35.31

export type EstiloCampo = { pt: number; negrito?: boolean; maiusculas?: boolean; sublinhado?: boolean; cor?: string; alinhamento: 'center' | 'right' | 'left' }
export const ESTILO_CAPA: Record<keyof Required<CapaConteudo>, EstiloCampo> = {
  instituicao: { pt: 11, negrito: true, cor: CAPA.cor.instituicao, alinhamento: 'center' },
  curso: { pt: 12, negrito: true, maiusculas: true, sublinhado: true, alinhamento: 'center' },
  disciplina: { pt: 12, negrito: true, alinhamento: 'center' },
  professor: { pt: 12, alinhamento: 'center' },
  endereco: { pt: 11, alinhamento: 'center' },
  email: { pt: 11, cor: CAPA.cor.email, sublinhado: true, alinhamento: 'center' },
  periodo: { pt: 12, negrito: true, alinhamento: 'center' },
}
export const PREFIXO_EMAIL = 'E-mails:'
export const TITULO_INTEGRANTES = 'Integrantes (Membro da Equipe)'
export const SEM_INTEGRANTES = 'Nenhum membro ativo no projeto.'

// ── Larguras de Arial (unidades de 1/1000 em), para quebrar as linhas como o navegador ──
const REGULAR = '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584'.split(',').map(Number)
const NEGRITO = '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584'.split(',').map(Number)
const ESPECIAIS: Record<string, number> = { '–': 556, '—': 1000, '“': 333, '”': 333, '‘': 222, '’': 222, '…': 1000, 'º': 365, 'ª': 370, '°': 400 }

/** Largura do texto (mm) em Arial no corpo `pt`. */
export function larguraTexto(texto: string, pt: number, negrito = false): number {
  const tabela = negrito ? NEGRITO : REGULAR
  let soma = 0
  for (const c of texto) {
    const base = c.normalize('NFD')[0]
    const cod = base.charCodeAt(0)
    soma += ESPECIAIS[c] ?? (cod >= 32 && cod <= 126 ? tabela[cod - 32] : 556)
  }
  return soma / 1000 * pt * PT_MM
}

/** Quantas linhas o texto ocupa na largura (quebra por palavra, como `pre-wrap`). */
export function contarLinhas(texto: string, largura: number, pt: number, negrito = false): number {
  let total = 0
  for (const paragrafo of texto.split('\n')) {
    let linhas = 1, atual = ''
    for (const palavra of paragrafo.split(' ')) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra
      if (atual && larguraTexto(tentativa, pt, negrito) > largura + 0.01) { linhas++; atual = palavra } else atual = tentativa
    }
    total += linhas
  }
  return total
}

export interface ItemCapa {
  tipo: 'campo' | 'integrantes' | 'logo'
  campo?: keyof Required<CapaConteudo>
  topo: number
  altura: number
  linhas?: number
}

/**
 * Posições (mm, a partir do topo da página) de cada bloco da Capa como a folha
 * do sistema os desenha (coluna flex: a logo ocupa o espaço que sobra, centralizada).
 */
export type LinhasCapa = Partial<Record<keyof Required<CapaConteudo>, number>>

/**
 * `linhas`: quantas linhas cada campo ocupa na folha renderizada (medido no navegador).
 * Sem a medida, estima pela largura da fonte.
 */
export function layoutCapa(capa: Required<CapaConteudo>, integrantes: number, linhasMedidas: LinhasCapa = {}) {
  const larguraUtil = CAPA.pagina.largura - 2 * CAPA.margem.x
  const larguraCampo = larguraUtil - 2 * CAPA.padding.x
  const campo = (c: keyof Required<CapaConteudo>, topo: number): ItemCapa | null => {
    const valor = capa[c]
    if (!valor.trim()) return null
    const e = ESTILO_CAPA[c]
    const texto = e.maiusculas ? valor.toLocaleUpperCase('pt-BR') : valor
    const linhas = linhasMedidas[c] ?? (c === 'email' ? 1 : contarLinhas(texto, larguraCampo, e.pt, e.negrito))
    return { tipo: 'campo', campo: c, topo, altura: linhas * linhaMm(e.pt) + 2 * CAPA.padding.y, linhas }
  }
  const itens: ItemCapa[] = []
  let y = CAPA_LINHA_TOPO + CAPA.linha.espessura + CAPA.linha.depois
  const empilhar = (c: keyof Required<CapaConteudo>) => { const i = campo(c, y); if (i) { itens.push(i); y += i.altura } }
  empilhar('instituicao'); y += CAPA.espacoBloco
  empilhar('curso'); y += CAPA.espacoBloco
  empilhar('disciplina'); empilhar('professor')
  const fimTopo = y

  // De baixo para cima: período, espaço, e-mail, endereço, 22 mm e integrantes.
  const base = CAPA.pagina.altura - CAPA.margem.base
  const rodape: ItemCapa[] = []
  let b = base
  const subir = (c: keyof Required<CapaConteudo>) => { const i = campo(c, 0); if (i) { b -= i.altura; i.topo = b; rodape.unshift(i) } }
  subir('periodo'); b -= CAPA.espacoPeriodo; subir('email'); subir('endereco')
  b -= CAPA.espacoIntegrantes
  const alturaIntegrantes = (1 + Math.max(integrantes, 1)) * linhaMm(11)
  b -= alturaIntegrantes
  const regiao = Math.max(b - fimTopo, CAPA.logo.regiaoMin)
  itens.push({ tipo: 'logo', topo: fimTopo, altura: regiao })
  itens.push({ tipo: 'integrantes', topo: fimTopo + regiao, altura: alturaIntegrantes, linhas: 1 + Math.max(integrantes, 1) })
  // Se o topo empurrar a região além do mínimo, o rodapé desce junto (como no flex).
  const deslocamento = fimTopo + regiao - b
  for (const i of rodape) itens.push({ ...i, topo: i.topo + deslocamento })
  return itens
}

/** Posição do "E-mails:" e do e-mail: os dois centralizados juntos, campo com largura do texto. */
export function linhaEmail(email: string) {
  const { pt } = ESTILO_CAPA.email
  const prefixo = larguraTexto(PREFIXO_EMAIL, pt)
  const espaco = 0.2 * pt * PT_MM
  const ch = larguraTexto('0', pt)
  const larguraUtil = CAPA.pagina.largura - 2 * CAPA.margem.x
  const caixa = Math.min(larguraUtil, Math.max(email.length + 3, 16) * ch)
  const inicio = CAPA.margem.x + (larguraUtil - (prefixo + espaco + caixa)) / 2
  return { prefixo: inicio, texto: inicio + prefixo + espaco + CAPA.padding.x, caixaEm: Math.max(email.length + 3, 16) }
}

/** Linhas de cada campo na folha da Capa já desenhada (mesma conta da altura usada no layout). */
export function medirLinhasCapa(folha: HTMLElement): LinhasCapa {
  const linhas: LinhasCapa = {}
  folha.querySelectorAll<HTMLElement>('[data-capa-campo]').forEach(el => {
    const campo = el.dataset.capaCampo as keyof Required<CapaConteudo>
    const estilo = ESTILO_CAPA[campo]
    const alturaMm = el.getBoundingClientRect().height * 25.4 / 96
    if (!estilo || !alturaMm) return
    linhas[campo] = Math.max(1, Math.round((alturaMm - 2 * CAPA.padding.y) / linhaMm(estilo.pt)))
  })
  return linhas
}

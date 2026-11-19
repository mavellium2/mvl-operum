/**
 * Texto com formatação dos documentos (ajustes de 18/11/2026, itens 1.1 e 1.2):
 * negrito, itálico, sublinhado e alinhamento por parágrafo, como no Word.
 *
 * Fica na mesma string do campo. Sem formatação, é texto simples (parágrafos
 * separados por "\n"), igual aos documentos antigos. Com formatação, usa um
 * formato restrito: `<p a="center">texto <b>negrito</b> <i>itálico</i> <u>sub</u></p>`.
 * O formato é lido por este parser (nunca vira HTML do navegador): tags fora
 * da lista viram texto. As posições usadas pela paginação são as do texto
 * simples (cada quebra de parágrafo conta 1).
 */

export type Alinhamento = 'left' | 'center' | 'right' | 'justify'
export interface Trecho { s: string; b?: boolean; i?: boolean; u?: boolean }
export interface Paragrafo { a?: Alinhamento; t: Trecho[] }
export type DocTexto = Paragrafo[]

const ALINHAMENTOS: Alinhamento[] = ['left', 'center', 'right', 'justify']

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const desescapar = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export const ehFormatado = (valor: string) => valor.startsWith('<p')

const textoDoParagrafo = (p: Paragrafo) => p.t.map(x => x.s).join('')

/** Lê o valor do campo (texto simples ou formatado). */
export function lerTexto(valor: string): DocTexto {
  if (!ehFormatado(valor)) return valor.split('\n').map(linha => ({ t: linha ? [{ s: linha }] : [] }))
  const doc: DocTexto = []
  const marcas = { b: 0, i: 0, u: 0 }
  let atual: Paragrafo | null = null
  const adicionar = (s: string) => {
    if (!s) return
    if (!atual) { atual = { t: [] }; doc.push(atual) }
    const t: Trecho = { s }
    if (marcas.b) t.b = true
    if (marcas.i) t.i = true
    if (marcas.u) t.u = true
    atual.t.push(t)
  }
  const re = /<(\/?)(p|b|i|u)(?:\s+a="(left|center|right|justify)")?>|([^<]+)|</g
  for (const m of valor.matchAll(re)) {
    const [bruto, fecha, tag, alinhamento, texto] = m
    if (texto !== undefined) { adicionar(desescapar(texto)); continue }
    if (!tag) { adicionar(bruto); continue }
    if (tag === 'p') {
      if (fecha) { atual = null; continue }
      atual = alinhamento ? { a: alinhamento as Alinhamento, t: [] } : { t: [] }
      doc.push(atual)
      continue
    }
    const k = tag as 'b' | 'i' | 'u'
    marcas[k] = Math.max(0, marcas[k] + (fecha ? -1 : 1))
  }
  return doc.length ? doc.map(normalizarParagrafo) : [{ t: [] }]
}

/** Junta trechos vizinhos com as mesmas marcas e tira os vazios. */
function normalizarParagrafo(p: Paragrafo): Paragrafo {
  const t: Trecho[] = []
  for (const x of p.t) {
    if (!x.s) continue
    const ult = t[t.length - 1]
    if (ult && !!ult.b === !!x.b && !!ult.i === !!x.i && !!ult.u === !!x.u) ult.s += x.s
    else t.push({ ...x })
  }
  return p.a && ALINHAMENTOS.includes(p.a) ? { a: p.a, t } : { t }
}

/** Grava o documento: texto simples se não houver formatação. */
export function escreverTexto(doc: DocTexto): string {
  const ps = doc.map(normalizarParagrafo)
  const temFormatacao = ps.some(p => p.a || p.t.some(x => x.b || x.i || x.u))
  if (!temFormatacao) return ps.map(textoDoParagrafo).join('\n')
  return ps.map(p => {
    const corpo = p.t.map(x => {
      let s = escapar(x.s)
      if (x.u) s = `<u>${s}</u>`
      if (x.i) s = `<i>${s}</i>`
      if (x.b) s = `<b>${s}</b>`
      return s
    }).join('')
    return `<p${p.a ? ` a="${p.a}"` : ''}>${corpo}</p>`
  }).join('')
}

/** Texto simples do valor (listas, resumos, cadastro do projeto, paginação). */
export const textoSimples = (valor: string | null | undefined) =>
  !valor ? '' : ehFormatado(valor) ? lerTexto(valor).map(textoDoParagrafo).join('\n') : valor

// ── Posições no texto simples ───────────────────────────────────────────────
// Sequência de itens: início de parágrafo (com o alinhamento) ou caractere. O
// início de cada parágrafo depois do primeiro conta como o "\n" do texto simples.

type Item = { p: true; a?: Alinhamento } | { p?: false; c: string; b?: boolean; i?: boolean; u?: boolean }

function itens(doc: DocTexto): Item[] {
  const out: Item[] = []
  for (const par of doc) {
    out.push(par.a ? { p: true, a: par.a } : { p: true })
    for (const t of par.t) for (const c of t.s) out.push({ c, b: t.b, i: t.i, u: t.u })
  }
  return out.length ? out : [{ p: true }]
}

function deItens(lista: Item[]): DocTexto {
  const doc: DocTexto = []
  for (const it of lista) {
    if (it.p) { doc.push(it.a ? { a: it.a, t: [] } : { t: [] }); continue }
    if (!doc.length) doc.push({ t: [] })
    doc[doc.length - 1].t.push({ s: it.c, ...(it.b ? { b: true } : {}), ...(it.i ? { i: true } : {}), ...(it.u ? { u: true } : {}) })
  }
  return (doc.length ? doc : [{ t: [] }]).map(normalizarParagrafo)
}

/** Índice na lista de itens logo depois de `pos` caracteres do texto simples. */
function indice(lista: Item[], pos: number): number {
  let contados = 0
  for (let k = 1; k < lista.length; k++) {
    if (contados >= pos) return k
    contados++
  }
  return lista.length
}

/** Alinhamento do parágrafo que contém o item `k`. */
function alinhamentoEm(lista: Item[], k: number): Alinhamento | undefined {
  for (let j = Math.min(k, lista.length - 1); j >= 0; j--) { const it = lista[j]; if (it.p) return it.a }
  return undefined
}

/** Pedaço [de, ate) do texto simples, com a formatação (o 1º parágrafo herda o alinhamento). */
export function fatiarTexto(doc: DocTexto, de: number, ate: number): DocTexto {
  const lista = itens(doc)
  const i0 = indice(lista, de), i1 = indice(lista, ate)
  const a = alinhamentoEm(lista, i0 - 1)
  return deItens([a ? { p: true, a } : { p: true }, ...lista.slice(i0, i1)])
}

/**
 * Troca o pedaço [de, ate) do texto simples por `novo` (já formatado). O
 * alinhamento do 1º parágrafo de `novo` passa ao parágrafo onde o pedaço começa.
 */
export function substituirTexto(doc: DocTexto, de: number, ate: number, novo: DocTexto): DocTexto {
  const lista = itens(doc)
  const i0 = indice(lista, de), i1 = indice(lista, ate)
  const [primeiro, ...resto] = itens(novo)
  const antes = lista.slice(0, i0)
  // Parágrafo onde o pedaço começa recebe o alinhamento do 1º parágrafo do pedaço novo.
  for (let j = antes.length - 1; j >= 0; j--) {
    const it = antes[j]
    if (it.p) { antes[j] = primeiro.p && primeiro.a ? { p: true, a: primeiro.a } : { p: true }; break }
  }
  return deItens([...antes, ...resto, ...lista.slice(i1)])
}

/** Comprimento do texto simples. */
export const tamanhoSimples = (doc: DocTexto) => Math.max(0, itens(doc).length - 1)

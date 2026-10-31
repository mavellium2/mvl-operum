'use client'

import { Children, Fragment, cloneElement, createContext, forwardRef, isValidElement, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { ChevronDown, Plus, X } from 'lucide-react'
import DateInput from '@/components/ui/DateInput'
import MembroEquipeSelect, { type MembroEquipeOption } from '@/components/projetos/documentacao/MembroEquipeSelect'
import { formatDateBR } from '@/lib/date'

/**
 * Folha dos documentos e kit de campos (Penpot, "Tela — Edição de documento").
 * Todo documento é montado com 5 tipos de campo: Automático, Texto, Pessoa,
 * Data e Lista/tabela. Dentro de um <EditorDocumento> os campos são editados
 * direto na folha; fora dele (impressão/PDF) a mesma folha sai só com o texto.
 */

// ── Contexto do editor ──────────────────────────────────────────────────────

export interface CampoEmFoco {
  id: string
  rotulo: string
  ajuda?: string
  max?: number
  tamanho?: number
  el: HTMLElement
}

interface EditorCtx {
  editavel: boolean
  focar: (campo: CampoEmFoco | null) => void
  registrarLimpar: (id: string, limpar: (() => void) | null) => void
}

const Ctx = createContext<EditorCtx>({ editavel: false, focar: () => {}, registrarLimpar: () => {} })
export const EditorFolhaProvider = Ctx.Provider
export const useEditorFolha = () => useContext(Ctx)

/**
 * Paginação: `medindo` marca a cópia invisível usada para medir os blocos
 * (não registra campos nem recebe foco); `marcarCursor` guarda onde o cursor
 * deve ficar quando um texto muda de folha enquanto a pessoa digita.
 */
interface PaginacaoCtx { medindo: boolean; marcarCursor: (id: string, pos: number) => void }
const PagCtx = createContext<PaginacaoCtx>({ medindo: false, marcarCursor: () => {} })

// ── Medidas e estilos da folha ──────────────────────────────────────────────

/** Margens do papel (mm): laterais estreitas para aproveitar a folha, como no Word com margem estreita. */
export const FOLHA_MARGEM_MM = { top: 10, x: 10 } as const
/** Faixa inferior da folha reservada ao rodapé ("Página X de Y"). */
export const FOLHA_RODAPE_MM = 9
export const FONTE_DOC = 'Calibri, Carlito, Arial, Helvetica, sans-serif'
const FONTE_TITULO = 'Arial, Arimo, Helvetica, sans-serif'
const BORDA = '1px solid #000'
export const CINZA = '#bfbfbf'
export const CINZA_CLARO = '#e7e6e6'

// Tamanho da fonte vem da folha (9pt por padrão; o Termo usa 10pt, como no modelo).
export const celula: CSSProperties = { border: BORDA, padding: '2px 6px', verticalAlign: 'top', textAlign: 'left', fontSize: 'inherit', fontWeight: 'normal', lineHeight: 1.3 }
/** Célula que contém um campo: o padding fica no campo, para o foco cobrir a célula inteira. */
export const celulaCampo: CSSProperties = { ...celula, padding: 0 }
export const faixa: CSSProperties = { ...celula, background: CINZA, fontWeight: 'bold' }
const cabecalhoColuna: CSSProperties = { ...celula, fontWeight: 'bold' }
const tabela: CSSProperties = { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }
const PAD = '2px 6px'

const ROMANOS: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
export function romano(n: number): string {
  let resto = Math.max(0, Math.floor(n)), s = ''
  for (const [v, r] of ROMANOS) while (resto >= v) { s += r; resto -= v }
  return s
}
/** "I. Justificativa do projeto" */
export const secao = (n: number, titulo: string) => `${romano(n)}. ${titulo}`

// ── Folha ───────────────────────────────────────────────────────────────────

interface FolhaProps {
  children: ReactNode
  paisagem?: boolean
  /** Uma página de altura fixa (ex.: EAP gráfica), sem paginação. */
  fixa?: boolean
  style?: CSSProperties
  'data-testid'?: string
  margemMm?: { top: number; x: number }
  /** Texto à esquerda no rodapé de cada folha; à direita sempre sai "Página X de Y". */
  rodape?: ReactNode
  /** Mostra "Página X de Y" no rodapé (padrão: sim). */
  numerar?: boolean
  /** Número da primeira folha (ex.: 2 quando outra folha vem antes, como a EAP gráfica). */
  paginaInicial?: number
  /** Avisa quantas folhas o conteúdo ocupou. */
  onPaginas?: (total: number) => void
}

const estiloTexto: CSSProperties = { fontFamily: FONTE_DOC, fontSize: '9pt', lineHeight: 1.3, color: '#000' }

/**
 * Folha A4 (210×297 mm; paisagem 297×210 mm). Sem `fixa`, o conteúdo é
 * distribuído em quantas folhas forem necessárias, como no Word: blocos
 * inteiros não se partem, tabelas quebram entre linhas (cabeçalho das colunas
 * repetido) e textos longos continuam na folha seguinte a partir de uma linha
 * inteira. A tela e o PDF usam as mesmas folhas.
 */
export const Folha = forwardRef<HTMLDivElement, FolhaProps>(function Folha(props, ref) {
  const { children, paisagem = false, fixa = false, style, margemMm = FOLHA_MARGEM_MM, rodape, numerar = true } = props
  const altura = paisagem ? 210 : 297
  const largura = paisagem ? 297 : 210
  if (fixa) {
    return (
      <div
        ref={ref}
        data-folha=""
        data-pagina="1"
        data-print-sheet-fixed=""
        data-testid={props['data-testid']}
        style={{
          width: `${largura}mm`, height: `${altura}mm`, overflow: 'hidden',
          padding: `${margemMm.top}mm ${margemMm.x}mm ${FOLHA_RODAPE_MM}mm`,
          boxSizing: 'border-box', background: '#fff', ...estiloTexto,
          position: 'relative', display: 'flex', flexDirection: 'column', gap: '13px',
          boxShadow: '0 1px 3px rgba(15,23,42,0.14)',
          ...style,
        }}
      >
        {children}
      </div>
    )
  }
  return <FolhasPaginadas {...props} ref={ref} paisagem={paisagem} margemMm={margemMm} rodape={rodape} numerar={numerar} />
})

type Pedaco =
  | { i: number; tipo: 'inteiro' }
  | { i: number; tipo: 'linhas' | 'texto'; de: number; ate: number; primeiro: boolean; ultimo: boolean }

/** Expande fragmentos e listas: cada elemento de primeiro nível é um bloco da folha. */
function blocosDe(children: ReactNode): ReactElement[] {
  const lista: ReactElement[] = []
  Children.forEach(children, filho => {
    if (!isValidElement(filho)) return
    if (filho.type === Fragment) lista.push(...blocosDe((filho.props as { children?: ReactNode }).children))
    else lista.push(filho)
  })
  return lista
}

function linhasDe(children: ReactNode): ReactElement[] {
  return blocosDe(children)
}

/** O bloco é uma seção de texto com um único campo de texto que pode continuar na folha seguinte. */
function textoDividivel(bloco: ReactElement): boolean {
  if (bloco.type !== SecaoTexto) return false
  const filhos = blocosDe((bloco.props as { children?: ReactNode }).children)
  return filhos.length === 1 && filhos[0].type === CampoTexto && (filhos[0].props as { preencher?: boolean }).preencher !== false
}

const FolhasPaginadas = forwardRef<HTMLDivElement, Required<Pick<FolhaProps, 'paisagem' | 'margemMm' | 'numerar'>> & FolhaProps>(function FolhasPaginadas(
  { children, paisagem, style, margemMm, rodape, numerar, paginaInicial = 1, onPaginas, ...rest }, ref,
) {
  const blocos = blocosDe(children)
  const altura = paisagem ? 210 : 297
  const largura = paisagem ? 297 : 210
  const alturaUtil = altura - margemMm.top - FOLHA_RODAPE_MM
  const gap = typeof style?.gap === 'string' || typeof style?.gap === 'number' ? style.gap : '13px'
  const raiz = useRef<HTMLDivElement | null>(null)
  const [paginas, setPaginas] = useState<Pedaco[][]>(() => [blocos.map((_, i) => ({ i, tipo: 'inteiro' as const }))])
  const cursor = useRef<{ id: string; pos: number } | null>(null)
  const [, setVersaoMedida] = useState(0)
  const ctx = useMemo<PaginacaoCtx>(() => ({ medindo: false, marcarCursor: (id, pos) => { cursor.current = { id, pos } } }), [])
  const definirRef = (el: HTMLDivElement | null) => {
    raiz.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  // Fontes e imagens (logo, assinaturas) mudam a altura depois de carregar: mede de novo.
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const remedir = () => setVersaoMedida(v => v + 1)
    void document.fonts?.ready.then(remedir)
    const imagens = [...el.querySelectorAll('img')].filter(i => !i.complete)
    imagens.forEach(i => i.addEventListener('load', remedir, { once: true }))
    return () => imagens.forEach(i => i.removeEventListener('load', remedir))
  })

  // Sem dependências de propósito: o conteúdo muda a cada digitação, então mede depois de todo render.
  // Não entra em laço: só atualiza quando a distribuição em folhas muda de fato.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = raiz.current
    if (!el) return
    const novas = paginar(el, blocos, paginas)
    if (JSON.stringify(novas) !== JSON.stringify(paginas)) { setPaginas(novas); return }
    // Layout estável: devolve o cursor ao pedaço certo do texto (pode ter mudado de folha).
    const c = cursor.current
    if (c) { cursor.current = null; focarFragmento(c.id, c.pos) }
  })

  const total = paginas.length
  const onPaginasRef = useRef(onPaginas)
  useEffect(() => { onPaginasRef.current = onPaginas })
  useEffect(() => { onPaginasRef.current?.(total) }, [total])
  const totalGeral = paginaInicial - 1 + total
  const pagina: CSSProperties = {
    width: `${largura}mm`, height: `${altura}mm`,
    padding: `${margemMm.top}mm ${margemMm.x}mm ${FOLHA_RODAPE_MM}mm`,
    boxSizing: 'border-box', background: '#fff', ...estiloTexto,
    position: 'relative', display: 'flex', flexDirection: 'column', gap,
    breakAfter: 'page', pageBreakAfter: 'always',
    boxShadow: '0 1px 3px rgba(15,23,42,0.14)',
    ...style,
  }
  return (
    <div ref={definirRef} data-testid={rest['data-testid']} data-paginas={total} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Sondas de medida (altura útil e espaço entre blocos), sem conteúdo. */}
      <div data-medicao="" aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: 0, overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none' }}>
        <div data-sonda="util" style={{ height: `${alturaUtil}mm` }} />
        <div data-sonda="gap" style={{ height: gap }} />
      </div>
      <PagCtx.Provider value={ctx}>
        {paginas.map((pedacos, n) => (
          <div key={n} data-folha="" data-pagina={n + 1} data-print-sheet="" style={pagina}>
            {pedacos.map(p => {
              const b = blocos[p.i]
              if (!b) return null
              const fatia = p.tipo === 'inteiro' ? undefined : { de: p.de, ate: p.ate, primeiro: p.primeiro, ultimo: p.ultimo }
              return (
                <div key={p.tipo === 'inteiro' ? `${p.i}` : `${p.i}-${p.de}`} data-peca={p.i} data-de={fatia?.de} data-primeiro={fatia ? String(fatia.primeiro) : undefined} data-ultimo={fatia ? String(fatia.ultimo) : undefined}>
                  {fatia ? cloneElement(b as ReactElement<{ _fatia?: unknown }>, { _fatia: fatia }) : b}
                </div>
              )
            })}
            {(rodape || numerar) && (
              <div data-rodape-pagina="" style={{ position: 'absolute', left: `${margemMm.x}mm`, right: `${margemMm.x}mm`, bottom: '3.5mm', display: 'flex', justifyContent: 'space-between', gap: 12, font: '8pt Arial, Arimo, Helvetica, sans-serif', color: '#555' }}>
                <span>{rodape}</span>
                {numerar && <span>Página {paginaInicial + n} de {totalGeral}</span>}
              </div>
            )}
          </div>
        ))}
      </PagCtx.Provider>
    </div>
  )
})

const espelhosCriados: HTMLElement[] = []

/**
 * Distribui os blocos em folhas medindo os pedaços já desenhados (não há
 * cópia escondida do documento). Os tamanhos de um bloco não dependem da folha
 * em que ele está, então a distribuição converge em uma ou duas passadas.
 */
function paginar(raiz: HTMLElement, blocos: ReactElement[], atual: Pedaco[][]): Pedaco[][] {
  try { return distribuir(raiz, blocos, atual) } finally { espelhosCriados.splice(0).forEach(e => e.remove()) }
}

function distribuir(raiz: HTMLElement, blocos: ReactElement[], atual: Pedaco[][]): Pedaco[][] {
  const cap = (raiz.querySelector('[data-sonda="util"]') as HTMLElement | null)?.offsetHeight ?? 0
  const gap = (raiz.querySelector('[data-sonda="gap"]') as HTMLElement | null)?.offsetHeight ?? 0
  // Sem layout (ex.: testes em jsdom): uma folha só, com tudo.
  if (!(cap > 0)) return [blocos.map((_, i) => ({ i, tipo: 'inteiro' as const }))]
  // Bloco que ainda não está na tela (acabou de surgir): mede inteiro na próxima passada.
  const naTela = new Set(atual.flat().map(p => p.i))
  if (blocos.some((_, i) => !naTela.has(i)) || atual.flat().some(p => p.i >= blocos.length)) {
    return [blocos.map((_, i) => ({ i, tipo: 'inteiro' as const }))]
  }

  const paginas: Pedaco[][] = [[]]
  let y = 0
  const espaco = () => (y > 0 ? gap : 0)
  const nova = () => { paginas.push([]); y = 0 }
  const por = (p: Pedaco, h: number) => { paginas[paginas.length - 1].push(p); y += h }
  const folga = 1

  blocos.forEach((bloco, i) => {
    const pecas = [...raiz.querySelectorAll<HTMLElement>(`[data-peca="${i}"]`)]
    if (pecas.length === 0) return
    // Altura real do bloco quando ele está inteiro numa folha (sem pedaço ou com um pedaço do começo ao fim).
    const inteiro = pecas.length === 1 && (pecas[0].dataset.de === undefined || (pecas[0].dataset.primeiro === 'true' && pecas[0].dataset.ultimo === 'true'))
    const alturaTotal = inteiro ? pecas[0].offsetHeight : -1

    const divisivelEmLinhas = bloco.type === SecaoTabela || bloco.type === ListaPaginada
    const medidasLinhas = divisivelEmLinhas ? medirLinhas(pecas) : null
    if (medidasLinhas && medidasLinhas.linhas.length > 0) {
      const { titulo, colunas, linhas, rodape, extra, repetir } = medidasLinhas
      let k = 0, primeiro = true
      while (k < linhas.length) {
        const cabeca = (primeiro ? titulo : 0) + (primeiro || repetir ? colunas : 0)
        const disponivel = cap - y - espaco() - folga
        let soma = 0, m = 0
        while (k + m < linhas.length) {
          const fim = k + m + 1 === linhas.length ? rodape + extra : 0
          if (cabeca + soma + linhas[k + m] + fim > disponivel) break
          soma += linhas[k + m]; m++
        }
        if (m === 0) {
          if (y > 0) { nova(); continue }
          m = 1; soma = linhas[k]
        }
        const ultimo = k + m === linhas.length
        por({ i, tipo: 'linhas', de: k, ate: k + m, primeiro, ultimo }, espaco() + cabeca + soma + (ultimo ? rodape + extra : 0))
        k += m; primeiro = false
        if (!ultimo) nova()
      }
      return
    }

    const medidasTexto = textoDividivel(bloco) ? medirTexto(pecas, bloco) : null
    if (medidasTexto) {
      const { titulo, sobra, minimo, medir, valor } = medidasTexto
      const linhaMin = medir('x')
      let pos = 0, primeiro = true
      for (let guarda = 0; guarda < 400; guarda++) {
        const cabeca = primeiro ? titulo : 0
        const disponivel = cap - y - espaco() - folga
        const resto = valor.slice(pos)
        const alturaResto = primeiro && alturaTotal > 0 ? alturaTotal - titulo : Math.max(minimo, sobra + medir(resto))
        if (cabeca + alturaResto <= disponivel) { por({ i, tipo: 'texto', de: pos, ate: valor.length, primeiro, ultimo: true }, espaco() + cabeca + alturaResto); return }
        const cabe = disponivel - cabeca - sobra
        if (cabe < linhaMin * 2 && y > 0) { nova(); continue }
        const fim = maiorPrefixo(valor, pos, Math.max(cabe, linhaMin), medir)
        if (fim <= pos && y > 0) { nova(); continue }
        const corte = Math.max(fim, pos + 1)
        // Quebras de parágrafo no corte ficam entre os pedaços (não aparecem como linha em branco
        // no fim de uma folha nem no começo da seguinte), como no Word.
        let ate = corte
        while (ate > pos + 1 && valor[ate - 1] === '\n') ate--
        let proximo = corte
        while (proximo < valor.length && valor[proximo] === '\n') proximo++
        por({ i, tipo: 'texto', de: pos, ate, primeiro, ultimo: false }, espaco() + cabeca + sobra + medir(valor.slice(pos, ate)))
        pos = proximo; primeiro = false
        nova()
      }
      return
    }

    const h = alturaTotal > 0 ? alturaTotal : pecas.reduce((s, p) => s + p.offsetHeight, 0)
    if (y > 0 && y + gap + h > cap) nova()
    por({ i, tipo: 'inteiro' }, espaco() + h)
  })
  return paginas.filter((p, n) => p.length > 0 || n === 0)
}

/** Maior posição `fim` tal que valor[pos, fim) cabe em `altura`, cortando em fim de palavra ou de parágrafo. */
function maiorPrefixo(valor: string, pos: number, altura: number, medir: (t: string) => number): number {
  let lo = pos, hi = valor.length
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2)
    if (medir(valor.slice(pos, meio)) <= altura) lo = meio
    else hi = meio - 1
  }
  if (lo >= valor.length) return lo
  // Volta até o último espaço/quebra para não partir palavra.
  const trecho = valor.slice(pos, lo)
  const ultimoEspaco = Math.max(trecho.lastIndexOf(' '), trecho.lastIndexOf('\n'))
  return ultimoEspaco > 0 ? pos + ultimoEspaco + 1 : lo
}

const secaoDa = (peca: HTMLElement) => peca.querySelector<HTMLElement>(':scope > [data-secao]')

/** Alturas de uma seção em linhas (tabela ou lista), somando os pedaços espalhados pelas folhas. */
function medirLinhas(pecas: HTMLElement[]) {
  let titulo = 0, colunas = 0, rodape = 0, extra = 0, repetir = true
  const linhas: number[] = []
  pecas.forEach((peca, n) => {
    const secao = secaoDa(peca)
    if (!secao || secao.dataset.secao !== 'linhas') return
    repetir = secao.dataset.repetir !== 'nao'
    const tituloAcima = secao.querySelector<HTMLElement>(':scope > [data-secao-titulo]')?.offsetHeight ?? 0
    const corpo = secao.querySelector<HTMLElement>(':scope > table, :scope > [data-lista]')
    if (!corpo) return
    if (corpo instanceof HTMLTableElement) {
      const cab = [...(corpo.tHead?.rows ?? [])]
      const faixaH = cab.filter(r => r.dataset.faixa !== undefined).reduce((s, r) => s + r.offsetHeight, 0)
      const colH = cab.filter(r => r.dataset.faixa === undefined).reduce((s, r) => s + r.offsetHeight, 0)
      if (n === 0) { titulo = tituloAcima + faixaH; colunas = colH } else if (!colunas) colunas = colH
      linhas.push(...[...(corpo.tBodies[0]?.rows ?? [])].map(r => r.offsetHeight))
      if (n === pecas.length - 1) {
        rodape = corpo.tFoot?.offsetHeight ?? 0
        extra = Math.max(0, secao.offsetHeight - tituloAcima - corpo.offsetHeight)
      }
    } else {
      if (n === 0) titulo = tituloAcima
      linhas.push(...[...corpo.children].map(c => {
        const e = c as HTMLElement, m = getComputedStyle(e)
        return e.offsetHeight + parseFloat(m.marginTop || '0') + parseFloat(m.marginBottom || '0')
      }))
    }
  })
  return { titulo, colunas, linhas, rodape, extra, repetir }
}

/** Medidas de uma seção de texto: título, sobra da caixa, altura mínima e um medidor de texto na largura do campo. */
function medirTexto(pecas: HTMLElement[], bloco: ReactElement) {
  const primeira = secaoDa(pecas[0])
  if (!primeira) return null
  const tituloAcima = primeira.querySelector<HTMLElement>(':scope > [data-secao-titulo]')?.offsetHeight ?? 0
  const tabela = primeira.querySelector<HTMLTableElement>(':scope > table')
  const titulo = tituloAcima + (tabela?.tHead?.offsetHeight ?? 0)
  const corpo = tabela?.tBodies[0]?.rows[0]?.cells[0] as HTMLElement | undefined
  const texto = corpo?.querySelector<HTMLElement>('textarea, [data-texto-campo]')
  if (!corpo || !texto) return null
  const cs = getComputedStyle(texto)
  const espelho = document.createElement('div')
  Object.assign(espelho.style, {
    position: 'absolute', visibility: 'hidden', left: '0', top: '0',
    width: `${texto.clientWidth || texto.offsetWidth}px`, font: cs.font, lineHeight: cs.lineHeight,
    letterSpacing: cs.letterSpacing, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: cs.wordBreak, padding: '0', border: '0',
  } satisfies Partial<CSSStyleDeclaration>)
  primeira.appendChild(espelho)
  espelhosCriados.push(espelho)
  const cache = new Map<string, number>()
  const medir = (t: string) => {
    const salvo = cache.get(t)
    if (salvo !== undefined) return salvo
    espelho.textContent = t.endsWith('\n') || t === '' ? t + '​' : t
    const h = espelho.offsetHeight
    cache.set(t, h)
    return h
  }
  const campo = blocosDe((bloco.props as { children?: ReactNode }).children)[0]
  const valor = String((campo.props as { valor?: string }).valor ?? '')
  const alturaMinima = (bloco.props as { alturaMinima?: string }).alturaMinima ?? '22mm'
  const minimo = sondaAltura(primeira, alturaMinima)
  // Espaço da caixa além do texto (padding do campo e bordas), calibrado pelos pedaços na tela.
  let sobra = 0
  pecas.forEach((peca, n) => {
    const t = secaoDa(peca)?.querySelector<HTMLElement>('textarea, [data-texto-campo]')
    if (!t) return
    const trecho = t instanceof HTMLTextAreaElement ? t.value : (t.textContent ?? '')
    const h = (secaoDa(peca)?.offsetHeight ?? 0) - (n === 0 ? titulo : 0)
    // Pedaço esticado pela altura mínima da caixa não serve para calibrar.
    if (h <= minimo + 1) return
    const candidato = h - medir(trecho)
    if (candidato > sobra) sobra = candidato
  })
  if (!(sobra > 0)) {
    const comPadding = texto instanceof HTMLTextAreaElement ? (texto.parentElement ?? texto) : texto
    const pcs = getComputedStyle(comPadding)
    sobra = parseFloat(pcs.paddingTop || '0') + parseFloat(pcs.paddingBottom || '0') + 2
  }
  return { titulo, sobra, minimo, medir, valor }
}

function sondaAltura(dentro: HTMLElement, valorCss: string): number {
  const sonda = document.createElement('div')
  sonda.style.height = valorCss
  sonda.style.position = 'absolute'
  sonda.style.visibility = 'hidden'
  dentro.appendChild(sonda)
  const h = sonda.offsetHeight
  sonda.remove()
  return h
}

/**
 * Cópia do documento só para imprimir/gerar PDF: fica fora da área visível,
 * mas é desenhada de verdade (não `hidden`), para paginar igual à tela.
 */
export function CopiaParaImpressao({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden="true" inert style={{ position: 'fixed', left: '-20000px', top: 0, pointerEvents: 'none' }}>
      {children}
    </div>
  )
}

/** Logo do projeto (33×19 mm) e título centralizado. */
export function Cabecalho({ titulo, logoUrl }: { titulo: ReactNode; logoUrl?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', minHeight: '19mm' }}>
      <div style={{ width: '33mm', height: '19mm', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', border: logoUrl ? 'none' : '1px solid #4a6fa5', background: logoUrl ? 'transparent' : '#9db7e0' }}>
        {logoUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={logoUrl} alt="Logo do projeto" style={{ maxHeight: '19mm', maxWidth: '33mm', objectFit: 'contain' }} />
          : <span style={{ fontSize: '11pt', textAlign: 'center', lineHeight: 1.15 }}>Logo do<br />Projeto</span>}
      </div>
      <h1 style={{ flex: 1, margin: 0, textAlign: 'center', fontFamily: FONTE_TITULO, fontSize: '14pt', fontWeight: 'bold', lineHeight: 1.2 }}>{titulo}</h1>
      <div aria-hidden="true" style={{ width: '33mm', flexShrink: 0 }} />
    </div>
  )
}

/** Tabela com bordas pretas (quadro de identificação, seções). */
export function Quadro({ children, colunas = ['75%', '25%'], testId }: { children: ReactNode; colunas?: string[]; testId?: string }) {
  return (
    <table style={tabela} data-testid={testId}>
      <colgroup>{colunas.map((c, i) => <col key={i} style={{ width: c }} />)}</colgroup>
      <tbody>{children}</tbody>
    </table>
  )
}

/** Pedaço de uma seção mostrado numa folha (definido pela paginação). */
interface Fatia { de: number; ate: number; primeiro: boolean; ultimo: boolean }

/**
 * Como o título da seção aparece: `faixa` (faixa cinza dentro da caixa) ou
 * `titulo` (negrito acima da caixa, recuado — modelo do Termo de Abertura).
 */
export type EstiloSecao = 'faixa' | 'titulo'

const tituloAcima: CSSProperties = { fontWeight: 'bold', fontSize: '10pt', padding: '0 0 1px 10mm', lineHeight: 1.3 }

/** Seção de texto: título + caixa com o campo de texto (o texto pode continuar na folha seguinte). */
export function SecaoTexto({ titulo, children, alturaMinima = '22mm', estilo = 'faixa', _fatia }: { titulo: ReactNode; children: ReactNode; alturaMinima?: string; estilo?: EstiloSecao; _fatia?: Fatia }) {
  const primeiro = !_fatia || _fatia.primeiro
  const ultimo = !_fatia || _fatia.ultimo
  const conteudo = _fatia
    ? blocosDe(children).map((c, i) => (c.type === CampoTexto ? cloneElement(c as ReactElement<{ fragmento?: Fragmento }>, { key: i, fragmento: _fatia }) : c))
    : children
  return (
    <div data-secao="texto">
      {estilo === 'titulo' && primeiro && <div data-secao-titulo="" style={tituloAcima}>{titulo}</div>}
      <table style={tabela}>
        {estilo === 'faixa' && primeiro && <thead><tr data-faixa=""><th style={faixa}>{titulo}</th></tr></thead>}
        <tbody><tr><td style={{ ...celulaCampo, height: ultimo ? alturaMinima : undefined }}>{conteudo}</td></tr></tbody>
      </table>
    </div>
  )
}

export interface Coluna { rotulo?: ReactNode; largura?: string; alinhamento?: CSSProperties['textAlign'] }

/**
 * Seção em tabela. Na folha seguinte a tabela continua sem o título da
 * seção; o cabeçalho das colunas se repete (`repetirCabecalho`). Com
 * `onAdicionar`, o editor mostra "+ Adicionar …" no fim da tabela.
 */
export function SecaoTabela({ titulo, colunas, children, rodape, faixaNasColunas = false, onAdicionar, rotuloAdicionar = 'Adicionar linha', extrasAdicionar, menuAdicionar, semFaixa = false, estiloCabecalho, testId, estilo = 'faixa', repetirCabecalho = true, _fatia }: {
  titulo: ReactNode
  colunas: Coluna[]
  children: ReactNode
  rodape?: ReactNode
  faixaNasColunas?: boolean
  onAdicionar?: () => void
  rotuloAdicionar?: string
  /** Outras ações ao lado do "+ Adicionar" (ex.: "Incluir toda a equipe"). */
  extrasAdicionar?: ReactNode
  /** Opções do "+ Adicionar" (o botão vira um menu; ex.: interno ou externo). */
  menuAdicionar?: { opcoes: { rotulo: string; descricao?: string; onClick: () => void }[]; aberto: boolean; onAbrir: (aberto: boolean) => void }
  /** Sem a faixa de título (tabela direto com o cabeçalho das colunas, como no formulário de stakeholders). */
  semFaixa?: boolean
  /** Estilo das células do cabeçalho das colunas. */
  estiloCabecalho?: CSSProperties
  testId?: string
  estilo?: EstiloSecao
  /** Repete o cabeçalho das colunas quando a tabela continua na folha seguinte. */
  repetirCabecalho?: boolean
  _fatia?: Fatia
}) {
  const { editavel } = useEditorFolha()
  const primeiro = !_fatia || _fatia.primeiro
  const ultimo = !_fatia || _fatia.ultimo
  const linhas = linhasDe(children)
  const visiveis = _fatia ? linhas.slice(_fatia.de, _fatia.ate) : linhas
  const mostrarColunas = colunas.some(c => c.rotulo) && (primeiro || repetirCabecalho)
  const faixaDentro = estilo === 'faixa' && !semFaixa
  return (
    <div style={{ position: 'relative' }} data-testid={primeiro ? testId : undefined} data-secao="linhas" data-repetir={repetirCabecalho ? undefined : 'nao'}>
      {estilo === 'titulo' && primeiro && <div data-secao-titulo="" style={tituloAcima}>{titulo}</div>}
      <table style={tabela}>
        <colgroup>{colunas.map((c, i) => <col key={i} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>
        {(faixaDentro && primeiro) || mostrarColunas || (faixaNasColunas && (primeiro || repetirCabecalho)) ? (
          <thead>
            {faixaNasColunas ? (
              <tr>{colunas.map((c, i) => <th key={i} style={{ ...faixa, textAlign: c.alinhamento ?? 'left' }}>{i === 0 ? titulo : c.rotulo}</th>)}</tr>
            ) : (
              <>
                {faixaDentro && primeiro && <tr data-faixa=""><th colSpan={colunas.length} style={faixa}>{titulo}</th></tr>}
                {mostrarColunas && <tr>{colunas.map((c, i) => <th key={i} style={{ ...cabecalhoColuna, textAlign: c.alinhamento ?? 'left', ...estiloCabecalho }}>{c.rotulo}</th>)}</tr>}
              </>
            )}
          </thead>
        ) : null}
        <tbody>{visiveis}</tbody>
        {rodape && ultimo && <tfoot style={{ display: 'table-row-group' }}>{rodape}</tfoot>}
      </table>
      {editavel && ultimo && (onAdicionar || menuAdicionar) && (
        // Com linha de total (ex.: Custo total) o botão fica sobre a borda dela, como no desenho; sem ela, logo abaixo da tabela.
        <div data-tela-apenas="" className="flex justify-center gap-2" style={{ marginTop: rodape ? -14 : 4, marginBottom: rodape ? -4 : 0, position: 'relative', zIndex: 1 }}>
          <span className="relative">
            <button
              type="button"
              onClick={menuAdicionar ? () => menuAdicionar.onAbrir(!menuAdicionar.aberto) : onAdicionar}
              aria-haspopup={menuAdicionar ? 'menu' : undefined}
              aria-expanded={menuAdicionar ? menuAdicionar.aberto : undefined}
              data-adicionar-linha=""
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 font-sans text-[13px] font-medium text-blue-600 shadow-sm hover:border-blue-300 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4" /> {rotuloAdicionar}
              {menuAdicionar && <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
            {menuAdicionar?.aberto && (
              <span role="menu" className="absolute left-1/2 top-full z-30 mt-1 flex w-64 -translate-x-1/2 flex-col rounded-xl border border-slate-100 bg-white py-1 font-sans text-left shadow-xl" onKeyDown={e => { if (e.key === 'Escape') menuAdicionar.onAbrir(false) }}>
                {menuAdicionar.opcoes.map(o => (
                  <button key={o.rotulo} type="button" role="menuitem" onClick={() => { menuAdicionar.onAbrir(false); o.onClick() }} className="flex flex-col px-4 py-2 text-left text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700">
                    <span className="font-medium">{o.rotulo}</span>
                    {o.descricao && <span className="text-xs text-slate-500">{o.descricao}</span>}
                  </button>
                ))}
              </span>
            )}
          </span>
          {extrasAdicionar}
        </div>
      )}
    </div>
  )
}

/** Lista de linhas sem tabela (ex.: EAP em texto): quebra entre linhas na folha seguinte. */
export function ListaPaginada({ children, style, _fatia }: { children: ReactNode; style?: CSSProperties; _fatia?: Fatia }) {
  const linhas = linhasDe(children)
  const visiveis = _fatia ? linhas.slice(_fatia.de, _fatia.ate) : linhas
  return (
    <div data-secao="linhas">
      <div data-lista="" style={style}>{visiveis}</div>
    </div>
  )
}

// ── Assinaturas ─────────────────────────────────────────────────────────────

export interface Assinante { nome: string; funcao?: string | null; assinaturaUrl?: string | null }

/** Sempre o último bloco; não se separa do conteúdo final na impressão. */
export function Assinaturas({ assinantes, porLinha = 2, titulo = 'Assinaturas', obs }: { assinantes: Assinante[]; porLinha?: number; titulo?: ReactNode; obs?: ReactNode }) {
  const lista = assinantes.length > 0 ? assinantes : [{ nome: '' }]
  return (
    <table style={{ ...tabela, breakInside: 'avoid' }} data-testid="bloco-assinaturas">
      <tbody>
        <tr><td style={faixa}>{titulo}</td></tr>
        <tr>
          <td style={{ ...celula, background: CINZA_CLARO, padding: '2mm 8mm 3mm' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${porLinha}, 1fr)`, gap: '3mm 10mm' }}>
              {lista.map((p, i) => (
                <div key={i} data-testid="assinatura" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ height: '12mm', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {p.assinaturaUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.assinaturaUrl} alt={`Assinatura de ${p.nome}`} style={{ maxHeight: '12mm', maxWidth: '45mm', objectFit: 'contain' }} />
                      : null}
                  </div>
                  <div style={{ borderTop: BORDA, width: '85%', maxWidth: '64mm', paddingTop: 2, textAlign: 'center', fontWeight: 'bold', minHeight: '1.3em' }}>{p.nome}</div>
                  {p.funcao && <div style={{ textAlign: 'center', fontSize: '8pt', color: '#555' }}>{p.funcao}</div>}
                </div>
              ))}
            </div>
          </td>
        </tr>
        {obs !== undefined && <tr><td style={{ ...celulaCampo, height: '16mm' }}>{obs}</td></tr>}
      </tbody>
    </table>
  )
}

// ── Kit de campos ───────────────────────────────────────────────────────────

const FOCO = 'focus-within:outline-solid focus-within:outline-2 focus-within:-outline-offset-1 focus-within:outline-blue-500 focus-within:bg-[#f5f8ff]'

function useRegistrarLimpar(id: string, limpar: (() => void) | null) {
  const { registrarLimpar: registrar } = useEditorFolha()
  const { medindo } = useContext(PagCtx)
  const registrarLimpar = medindo ? semRegistro : registrar
  const ref = useRef(limpar)
  useEffect(() => { ref.current = limpar })
  useEffect(() => {
    registrarLimpar(id, () => ref.current?.())
    return () => registrarLimpar(id, null)
  }, [id, registrarLimpar])
}

/** Dado compartilhado do cadastro. A alteração é feita por "Editar dados do projeto" na barra. */
export function CampoAutomatico({ children, inline = false, padding = PAD }: {
  children: ReactNode
  /** Mantido para compatibilidade com modelos existentes; não é exibido na folha. */
  origem?: string
  link?: { rotulo: string; href: string }
  inline?: boolean
  padding?: string
}) {
  return inline ? <>{children}</> : <div style={{ padding }}>{children}</div>
}

const semRegistro = () => {}

interface CampoBase { id: string; rotulo: string; ajuda?: string }

/** Pedaço de um texto que continua em outra folha: [de, ate) do valor completo. */
export interface Fragmento { de: number; ate: number; primeiro: boolean; ultimo: boolean }

/**
 * 2. TEXTO — clica e digita direto na folha. Vazio mostra a pergunta que
 * orienta o preenchimento. Um texto longo continua na folha seguinte
 * (`fragmento`): cada folha edita o seu pedaço e o valor completo é um só.
 */
export function CampoTexto({ id, rotulo, ajuda, pergunta, valor, onChange, max = 2000, linha = false, alinhamento, preencher = true, celulaDeTabela = false, compacto = false, fragmento }: CampoBase & {
  pergunta?: string
  valor: string
  onChange: (valor: string) => void
  max?: number
  /** Uma linha só (células de tabela, versão…). */
  linha?: boolean
  alinhamento?: CSSProperties['textAlign']
  /** Ocupa a célula inteira (padrão). Falso quando há outro conteúdo na mesma célula. */
  preencher?: boolean
  /** Célula de tabela estreita: a dica vazia é só a palavra-guia, sem "Clique para escrever:". */
  celulaDeTabela?: boolean
  /** Menos espaço interno (tabelas densas, como a das partes interessadas). */
  compacto?: boolean
  /** Pedaço do texto mostrado nesta folha (definido pela paginação). */
  fragmento?: Fragmento
}) {
  const { editavel, focar } = useEditorFolha()
  const { medindo, marcarCursor } = useContext(PagCtx)
  const ref = useRef<HTMLTextAreaElement>(null)
  const de = fragmento?.de ?? 0
  const ate = !fragmento || fragmento.ultimo ? valor.length : Math.min(fragmento.ate, valor.length)
  const primeiro = !fragmento || fragmento.primeiro
  const ultimo = !fragmento || fragmento.ultimo
  const parte = valor.slice(de, ate)
  // Só o primeiro pedaço registra o campo ("Limpar campo"), para não haver dois registros do mesmo id.
  useRegistrarLimpar(id, editavel && primeiro ? () => onChange('') : null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [parte, editavel])
  const pad = compacto ? '0 3px' : PAD
  if (!editavel) return <div data-texto-campo="" style={{ padding: pad, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', textAlign: alinhamento, minHeight: '1.25em' }}>{parte}</div>
  const info = { id, rotulo, ajuda, max }
  const mudar = (novoTrecho: string, cursor: number) => {
    const limpo = linha ? novoTrecho.replace(/\n/g, ' ') : novoTrecho
    marcarCursor(id, de + cursor)
    onChange(valor.slice(0, de) + limpo + valor.slice(ate))
  }
  return (
    <div {...(primeiro ? { 'data-campo': id, 'data-vazio': valor.trim() ? undefined : 'true' } : { 'data-campo-continuacao': id })} className={`${preencher ? 'h-full min-h-full' : ''} ${FOCO}`} style={{ padding: pad }}>
      <textarea
        ref={ref}
        {...(primeiro ? { 'data-campo-foco': '' } : {})}
        data-fragmento-de={id}
        data-de={de}
        data-ate={ate}
        aria-label={primeiro ? rotulo : `${rotulo} (continuação)`}
        rows={1}
        value={parte}
        maxLength={max ? Math.max(0, max - (valor.length - parte.length)) : undefined}
        placeholder={primeiro ? (pergunta ? (linha || celulaDeTabela ? pergunta : `Clique para escrever: ${pergunta}`) : 'Clique para escrever') : undefined}
        tabIndex={medindo ? -1 : undefined}
        onChange={e => mudar(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        onKeyDown={e => {
          if (linha && e.key === 'Enter') { e.preventDefault(); return }
          const t = e.currentTarget
          const semSelecao = t.selectionStart === t.selectionEnd
          if (!semSelecao) return
          if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && !ultimo && t.selectionStart === t.value.length) {
            e.preventDefault(); focarVizinho(id, de, 1)
          } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && !primeiro && t.selectionStart === 0) {
            e.preventDefault(); focarVizinho(id, de, -1)
          } else if (e.key === 'Backspace' && !primeiro && t.selectionStart === 0) {
            // Apaga o caractere que fica antes da quebra de folha (junta com o pedaço anterior).
            e.preventDefault(); marcarCursor(id, de - 1); onChange(valor.slice(0, de - 1) + valor.slice(de))
          } else if (e.key === 'Delete' && !ultimo && t.selectionStart === t.value.length) {
            e.preventDefault(); marcarCursor(id, ate); onChange(valor.slice(0, ate) + valor.slice(ate + 1))
          }
        }}
        onFocus={e => { if (!medindo) focar({ ...info, tamanho: valor.length, el: e.currentTarget.closest('td') ?? e.currentTarget }) }}
        onInput={e => { if (!medindo) focar({ ...info, tamanho: valor.length - parte.length + e.currentTarget.value.length, el: e.currentTarget.closest('td') ?? e.currentTarget }) }}
        onBlur={() => focar(null)}
        className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-slate-400"
        style={{ font: 'inherit', lineHeight: 'inherit', color: 'inherit', textAlign: alinhamento, overflowWrap: 'break-word' }}
      />
    </div>
  )
}

/** Vai para o pedaço anterior (fim) ou seguinte (começo) do mesmo texto, em outra folha. */
function focarVizinho(id: string, de: number, direcao: 1 | -1) {
  const lista = [...document.querySelectorAll<HTMLTextAreaElement>(`textarea[data-fragmento-de="${CSS.escape(id)}"]`)].filter(t => !t.closest('[data-medicao]'))
  const i = lista.findIndex(t => Number(t.dataset.de) === de)
  const alvo = lista[i + direcao]
  if (!alvo) return
  alvo.focus()
  const local = direcao === 1 ? 0 : alvo.value.length
  alvo.setSelectionRange(local, local)
}

/** Coloca o foco no pedaço do texto `id` que contém a posição `pos` (folhas visíveis, não a cópia de medição). */
function focarFragmento(id: string, pos: number): boolean {
  const lista = [...document.querySelectorAll<HTMLTextAreaElement>(`textarea[data-fragmento-de="${CSS.escape(id)}"]`)].filter(t => !t.closest('[data-medicao]'))
  if (lista.length === 0) return false
  const alvo = lista.find((t, i) => {
    const de = Number(t.dataset.de), ate = Number(t.dataset.ate)
    return pos >= de && (pos < ate || (pos === ate && (i === lista.length - 1 || Number(lista[i + 1].dataset.de) > pos)))
  })
    // Posição entre dois pedaços (quebra de parágrafo escondida na virada da folha): começo do seguinte.
    ?? lista.find(t => Number(t.dataset.de) > pos)
    ?? lista[lista.length - 1]
  const local = Math.max(0, Math.min(alvo.value.length, pos - Number(alvo.dataset.de)))
  if (document.activeElement !== alvo) alvo.focus({ preventScroll: false })
  if (alvo.selectionStart !== local || alvo.selectionEnd !== local) alvo.setSelectionRange(local, local)
  return true
}

/**
 * 3. PESSOA — escolhe entre os membros da equipe. O aprovador é sempre o
 * gerente (travado: use CampoAutomatico).
 */
export function CampoPessoa({ id, rotulo, ajuda, projetoId, membros, valorId, nome, onChange, onCriarMembro }: CampoBase & {
  projetoId: string
  membros: MembroEquipeOption[]
  valorId: string | null | undefined
  /** Nome exibido quando não está editando (ou quando o id não está na lista). */
  nome: string
  onChange: (membro: MembroEquipeOption | null) => void
  onCriarMembro?: (membro: MembroEquipeOption) => void
}) {
  const { editavel, focar } = useEditorFolha()
  useRegistrarLimpar(id, editavel ? () => onChange(null) : null)
  if (!editavel) return <>{nome}</>
  return (
    <span data-campo={id} data-vazio={valorId ? undefined : 'true'} className="relative inline-flex min-w-[45%] max-w-full items-baseline align-baseline" onFocus={e => focar({ id, rotulo, ajuda, el: (e.target as HTMLElement).closest('td') ?? e.currentTarget })} onBlur={() => focar(null)}>
      <MembroEquipeSelect
        membros={membros}
        projetoId={projetoId}
        value={valorId}
        onChange={onChange}
        onCriarMembro={onCriarMembro}
        semBotaoCriar
        naFolha
        ariaLabel={rotulo}
        placeholder="Selecionar membro da equipe"
        className="w-full"
      />
    </span>
  )
}

/** 4. DATA — abre calendário; formato dd/mm/aaaa sempre igual no PDF. */
export function CampoData({ id, rotulo, ajuda, valor, onChange }: CampoBase & { valor: string; onChange: (valor: string) => void }) {
  const { editavel, focar } = useEditorFolha()
  useRegistrarLimpar(id, editavel ? () => onChange('') : null)
  if (!editavel) return <>{formatDateBR(valor, '—')}</>
  return (
    <span data-campo={id} data-vazio={valor ? undefined : 'true'} className="inline-block w-[8.2em] align-top [&_button]:opacity-0 hover:[&_button]:opacity-100 focus-within:[&_button]:opacity-100" onFocus={e => focar({ id, rotulo, ajuda, el: (e.target as HTMLElement).closest('td') ?? e.currentTarget })} onBlur={() => focar(null)}>
      <DateInput
        value={valor}
        onChange={onChange}
        ariaLabel={rotulo}
        placeholder="—"
        className="w-full border-0 bg-transparent p-0 pr-5! outline-none placeholder:text-slate-400 focus:bg-[#f5f8ff] focus:outline focus:outline-2 focus:outline-blue-500 [&+button]:px-0.5!"
      />
    </span>
  )
}

/** Marca o input de data/pessoa como foco navegável (Tab do editor). */
export const SELETOR_FOCO = '[data-campo-foco], [data-campo] input:not([type="hidden"]):not([tabindex="-1"]), [data-campo] select, [data-campo] button[role="combobox"]'

/**
 * 5. LISTA / TABELA — linhas repetíveis; o "+ Adicionar" fica no fim da
 * tabela (SecaoTabela) e cada linha tem o "x" para remover, fora da folha.
 */
export function LinhaLista({ children, onRemover, rotuloRemover = 'Remover linha', style, ...dados }: { children: ReactNode; onRemover?: () => void; rotuloRemover?: string; style?: CSSProperties; 'data-inativo'?: string }) {
  const { editavel } = useEditorFolha()
  return (
    <tr {...dados} className={editavel && onRemover ? 'group/linha' : undefined} style={{ breakInside: 'avoid', ...style }}>
      {children}
      {editavel && onRemover && (
        <td style={{ border: 0, padding: 0, width: 0, position: 'relative' }}>
          <button
            type="button"
            onClick={onRemover}
            aria-label={rotuloRemover}
            title={rotuloRemover}
            className="absolute left-1 top-0.5 hidden h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 group-hover/linha:flex group-focus-within/linha:flex"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  )
}

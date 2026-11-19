'use client'

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-react'
import { escreverTexto, fatiarTexto, substituirTexto, tamanhoSimples, type Alinhamento, type DocTexto } from '@/lib/textoFormatado'

/**
 * Edição com formatação nos campos de texto dos documentos (negrito, itálico,
 * sublinhado e alinhamento, ajustes de 18/11/2026). O campo é um contenteditable
 * montado por este código a partir do formato restrito de `lib/textoFormatado`
 * (nunca HTML vindo do valor) e lido de volta para ele a cada alteração.
 */

const ZERO = /\u200b/g

/** Comandos de edição do navegador; sem suporte (navegador antigo, testes), não fazem nada. */
function comando(nome: string, valor?: string): boolean {
  try { return typeof document.execCommand === 'function' ? document.execCommand(nome, false, valor) : false } catch { return false }
}
function estadoDoComando(nome: string): boolean {
  try { return typeof document.queryCommandState === 'function' ? document.queryCommandState(nome) : false } catch { return false }
}
const ALINHAMENTOS: Alinhamento[] = ['left', 'center', 'right', 'justify']

function alinhamentoDe(el: HTMLElement): Alinhamento | undefined {
  const a = el.style.textAlign
  return ALINHAMENTOS.includes(a as Alinhamento) ? (a as Alinhamento) : undefined
}

interface Mapa { doc: DocTexto; textos: { no: Text; inicio: number }[]; pars: { el: HTMLElement | null; inicio: number }[]; total: number }

/** Lê o conteúdo do campo: parágrafos (blocos), marcas pelas tags ou pelo estilo, e as posições de cada texto. */
function mapear(raiz: HTMLElement): Mapa {
  const doc: DocTexto = []
  const textos: Mapa['textos'] = []
  const pars: Mapa['pars'] = []
  let atual: DocTexto[number] | null = null
  let pos = 0
  const novo = (a: Alinhamento | undefined, el: HTMLElement | null) => {
    if (doc.length) pos++
    atual = a ? { a, t: [] } : { t: [] }
    doc.push(atual)
    pars.push({ el, inicio: pos })
  }
  const percorrer = (no: Node, m: { b?: boolean; i?: boolean; u?: boolean }, a: Alinhamento | undefined) => {
    if (no.nodeType === Node.TEXT_NODE) {
      const s = (no as Text).data.replace(ZERO, '')
      if (!atual) novo(a, null)
      textos.push({ no: no as Text, inicio: pos })
      if (s) atual!.t.push({ s, ...(m.b ? { b: true } : {}), ...(m.i ? { i: true } : {}), ...(m.u ? { u: true } : {}) })
      pos += s.length
      return
    }
    if (!(no instanceof HTMLElement)) return
    const tag = no.tagName
    if (tag === 'BR') {
      // <br> no fim do bloco só segura a altura da linha vazia; no meio, quebra o parágrafo.
      const resto = [...(no.parentNode?.childNodes ?? [])].slice([...(no.parentNode?.childNodes ?? [])].indexOf(no) + 1)
      if (resto.some(n => (n.textContent ?? '').replace(ZERO, '') !== '' || n.nodeName === 'BR')) novo(a, null)
      return
    }
    if (tag === 'DIV' || tag === 'P') {
      const proprio = alinhamentoDe(no) ?? a
      novo(proprio, no)
      no.childNodes.forEach(f => percorrer(f, m, proprio))
      atual = null
      return
    }
    const cs = no.style
    const marcas = {
      b: m.b || tag === 'B' || tag === 'STRONG' || cs.fontWeight === 'bold' || Number(cs.fontWeight) >= 600,
      i: m.i || tag === 'I' || tag === 'EM' || cs.fontStyle === 'italic',
      u: m.u || tag === 'U' || cs.textDecoration.includes('underline') || cs.textDecorationLine.includes('underline'),
    }
    no.childNodes.forEach(f => percorrer(f, marcas, a))
  }
  raiz.childNodes.forEach(f => percorrer(f, {}, undefined))
  if (!doc.length) { doc.push({ t: [] }); pars.push({ el: null, inicio: 0 }) }
  return { doc, textos, pars, total: pos }
}

export const lerDom = (raiz: HTMLElement): DocTexto => mapear(raiz).doc

/** Monta o conteúdo do campo a partir do documento (só elementos e textos criados aqui). */
export function montarDom(raiz: HTMLElement, doc: DocTexto) {
  raiz.replaceChildren(...doc.map(p => {
    const div = document.createElement('div')
    if (p.a) div.style.textAlign = p.a
    if (!p.t.length) div.appendChild(document.createElement('br'))
    for (const t of p.t) {
      let n: Node = document.createTextNode(t.s)
      if (t.u) { const e = document.createElement('u'); e.appendChild(n); n = e }
      if (t.i) { const e = document.createElement('em'); e.appendChild(n); n = e }
      if (t.b) { const e = document.createElement('strong'); e.appendChild(n); n = e }
      div.appendChild(n)
    }
    return div
  }))
}

/** Posição do cursor no texto simples do campo (null se a seleção estiver fora). */
export function cursorNoTexto(raiz: HTMLElement): number | null {
  const sel = window.getSelection()
  if (!sel || !sel.focusNode || !raiz.contains(sel.focusNode)) return null
  const { textos, pars, total } = mapear(raiz)
  const no = sel.focusNode, off = sel.focusOffset
  const texto = textos.find(t => t.no === no)
  if (texto) return texto.inicio + Math.min(off, texto.no.data.replace(ZERO, '').length)
  // Cursor num elemento: primeira posição de texto ou parágrafo que vem depois do ponto.
  const ponto = document.createRange()
  ponto.setStart(no, off)
  const candidatos = [...textos.map(t => ({ n: t.no as Node, inicio: t.inicio })), ...pars.filter(p => p.el).map(p => ({ n: p.el as Node, inicio: p.inicio }))]
    .filter(c => ponto.comparePoint(c.n, 0) >= 0)
    .sort((a, b) => a.inicio - b.inicio)
  return candidatos[0]?.inicio ?? total
}

/** Põe o cursor na posição `pos` do texto simples do campo. */
export function posicionarCursor(raiz: HTMLElement, pos: number) {
  const { textos, pars } = mapear(raiz)
  const sel = window.getSelection()
  if (!sel) return
  const r = document.createRange()
  const texto = textos.find(t => pos >= t.inicio && pos <= t.inicio + t.no.data.length)
  if (texto) r.setStart(texto.no, Math.min(pos - texto.inicio, texto.no.data.length))
  else {
    const par = [...pars].reverse().find(p => p.el && p.inicio <= pos)
    if (par?.el) r.setStart(par.el, 0)
    else { r.selectNodeContents(raiz); r.collapse(false) }
  }
  r.collapse(true)
  sel.removeAllRanges()
  sel.addRange(r)
}

/** Texto com formatação, só leitura (folha, PDF e Word leem estes estilos). */
export function TextoLeitura({ doc, alinhamento, padding, plano }: { doc: DocTexto; alinhamento?: CSSProperties['textAlign']; padding: string; plano: string }) {
  // Espaçamento fora do elemento do texto: a paginação mede a largura útil pelo clientWidth dele.
  return (
    <div style={{ padding }}>
    <div data-texto-campo="" data-texto-plano={plano} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'break-word', textAlign: alinhamento, minHeight: '1.25em' }}>
      {doc.map((p, k) => (
        <div key={k} style={p.a ? { textAlign: p.a } : undefined}>
          {p.t.length === 0 ? <br /> : p.t.map((t, j) => {
            let n: ReactNode = t.s
            if (t.u) n = <u>{n}</u>
            if (t.i) n = <em>{n}</em>
            if (t.b) n = <strong>{n}</strong>
            return <span key={j}>{n}</span>
          })}
        </div>
      ))}
    </div>
    </div>
  )
}

/**
 * Campo editável com formatação (um pedaço [de, ate) do texto, quando ele
 * continua em outra folha). Recebe o valor completo e devolve o completo.
 */
export function EditorRico({ id, rotulo, doc, de, ate, primeiro, ultimo, max, pergunta, alinhamento, padding, foco, onChange, onCursor, onVizinho }: {
  id: string
  rotulo: string
  doc: DocTexto
  de: number
  ate: number
  primeiro: boolean
  ultimo: boolean
  max?: number
  pergunta?: string
  alinhamento?: CSSProperties['textAlign']
  padding: string
  foco: { onFocus: (el: HTMLElement, tamanho: number) => void; onBlur: () => void; tabIndex?: number }
  onChange: (valorCompleto: string) => void
  /** Posição do cursor no texto simples completo (restaurada depois da repaginação). */
  onCursor: (pos: number) => void
  onVizinho: (direcao: 1 | -1) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const emitido = useRef<string | null>(null)
  const compondo = useRef(false)
  const parte = fatiarTexto(doc, de, ate)
  const parteSerial = escreverTexto(parte)
  const vazio = tamanhoSimples(parte) === 0

  // Só remonta quando o pedaço mudou por fora (desfazer, voltar versão, repaginação), não pela própria digitação.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || emitido.current === parteSerial) return
    const focado = document.activeElement === el
    const cursor = focado ? cursorNoTexto(el) : null
    montarDom(el, parte)
    emitido.current = parteSerial
    if (focado && cursor !== null) posicionarCursor(el, Math.min(cursor, tamanhoSimples(parte)))
  })

  function aplicar(novoDoc: DocTexto, deTroca = de, ateTroca = ate) {
    const completo = escreverTexto(substituirTexto(doc, deTroca, ateTroca, novoDoc))
    if (max && completo.length > max) {
      // Passou do limite: volta ao conteúdo anterior.
      emitido.current = null
      const el = ref.current
      if (el) { montarDom(el, parte); emitido.current = parteSerial }
      return
    }
    onChange(completo)
  }

  function aoEditar() {
    const el = ref.current
    if (!el || compondo.current) return
    const novo = lerDom(el)
    emitido.current = escreverTexto(novo)
    const cursor = cursorNoTexto(el)
    if (cursor !== null) onCursor(de + cursor)
    aplicar(novo)
  }

  return (
    <div className="relative" style={{ padding }}>
      {vazio && primeiro && pergunta && (
        <span aria-hidden="true" data-tela-apenas="" className="pointer-events-none absolute text-slate-400" style={{ left: 0, right: 0, top: 0, padding, textAlign: alinhamento }}>
          {pergunta}
        </span>
      )}
      <div
        ref={ref}
        data-campo-foco={primeiro ? '' : undefined}
        data-fragmento-de={id}
        data-de={de}
        data-ate={ate}
        data-formatavel=""
        data-texto-campo=""
        role="textbox"
        aria-multiline="true"
        aria-label={primeiro ? rotulo : `${rotulo} (continuação)`}
        aria-placeholder={vazio && primeiro ? pergunta : undefined}
        contentEditable
        suppressContentEditableWarning
        tabIndex={foco.tabIndex}
        className="relative block w-full outline-none"
        style={{ font: 'inherit', lineHeight: 'inherit', color: 'inherit', textAlign: alinhamento, whiteSpace: 'pre-wrap', overflowWrap: 'break-word', minHeight: '1.25em' }}
        onFocus={e => {
          // Enter cria <div> (um parágrafo por bloco) e as marcas saem em tags, não em estilo.
          comando('defaultParagraphSeparator', 'div')
          comando('styleWithCSS', 'false')
          foco.onFocus(e.currentTarget, tamanhoSimples(doc))
        }}
        onBlur={foco.onBlur}
        onInput={aoEditar}
        onCompositionStart={() => { compondo.current = true }}
        onCompositionEnd={() => { compondo.current = false; aoEditar() }}
        onPaste={e => {
          // Colar só o texto: nada de HTML, imagens ou estilos de fora.
          e.preventDefault()
          comando('insertText', e.clipboardData.getData('text/plain'))
        }}
        onDrop={e => e.preventDefault()}
        onKeyDown={e => {
          const el = ref.current
          if (!el) return
          const sel = window.getSelection()
          if (!sel || !sel.isCollapsed) return
          const cursor = cursorNoTexto(el)
          if (cursor === null) return
          const tamanho = tamanhoSimples(parte)
          if ((e.key === 'ArrowRight' || e.key === 'ArrowDown') && !ultimo && cursor === tamanho) { e.preventDefault(); onVizinho(1) }
          else if ((e.key === 'ArrowLeft' || e.key === 'ArrowUp') && !primeiro && cursor === 0) { e.preventDefault(); onVizinho(-1) }
          else if (e.key === 'Backspace' && !primeiro && cursor === 0) {
            // Apaga o caractere antes da quebra de folha (junta com o pedaço anterior).
            e.preventDefault(); onCursor(de - 1); aplicar(fatiarTexto(doc, de - 1, de - 1), de - 1, de)
          } else if (e.key === 'Delete' && !ultimo && cursor === tamanho) {
            e.preventDefault(); onCursor(ate); aplicar(fatiarTexto(doc, ate, ate), ate, ate + 1)
          }
        }}
      />
    </div>
  )
}

// ── Barra de formatação ──────────────────────────────────────────────────────

interface EstadoFormatacao { ativo: boolean; b: boolean; i: boolean; u: boolean; a: Alinhamento | null }

const campoFormatavelAtivo = (): HTMLElement | null => {
  const el = document.activeElement
  return el instanceof HTMLElement && el.dataset.formatavel !== undefined && !el.closest('[data-medicao]') ? el : null
}

/** Estado da barra (campo com formatação em foco e marcas na seleção), atualizado pela seleção. */
export function useEstadoFormatacao(): EstadoFormatacao {
  const [estado, setEstado] = useState<EstadoFormatacao>({ ativo: false, b: false, i: false, u: false, a: null })
  useEffect(() => {
    const atualizar = () => {
      const campo = campoFormatavelAtivo()
      if (!campo) { setEstado(e => (e.ativo ? { ativo: false, b: false, i: false, u: false, a: null } : e)); return }
      const a = (['justify', 'center', 'right', 'left'] as Alinhamento[]).find(x => estadoDoComando(`justify${x === 'justify' ? 'Full' : x[0].toUpperCase() + x.slice(1)}`)) ?? null
      setEstado({ ativo: true, b: estadoDoComando('bold'), i: estadoDoComando('italic'), u: estadoDoComando('underline'), a })
    }
    document.addEventListener('selectionchange', atualizar)
    document.addEventListener('focusin', atualizar)
    document.addEventListener('focusout', atualizar)
    return () => {
      document.removeEventListener('selectionchange', atualizar)
      document.removeEventListener('focusin', atualizar)
      document.removeEventListener('focusout', atualizar)
    }
  }, [])
  return estado
}

const COMANDO: Record<Alinhamento, string> = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' }

/** Aplica o comando no campo em foco; o próprio campo lê o resultado no evento de entrada. */
export function formatar(nome: 'bold' | 'italic' | 'underline' | Alinhamento) {
  if (!campoFormatavelAtivo()) return
  comando(nome in COMANDO ? COMANDO[nome as Alinhamento] : nome)
}

export const BOTOES_FORMATACAO: { comando: 'bold' | 'italic' | 'underline' | Alinhamento; rotulo: string; atalho?: string; Icone: typeof Bold }[] = [
  { comando: 'bold', rotulo: 'Negrito', atalho: 'Ctrl+B', Icone: Bold },
  { comando: 'italic', rotulo: 'Itálico', atalho: 'Ctrl+I', Icone: Italic },
  { comando: 'underline', rotulo: 'Sublinhado', atalho: 'Ctrl+U', Icone: Underline },
  { comando: 'left', rotulo: 'Alinhar à esquerda', Icone: AlignLeft },
  { comando: 'center', rotulo: 'Centralizar', Icone: AlignCenter },
  { comando: 'right', rotulo: 'Alinhar à direita', Icone: AlignRight },
  { comando: 'justify', rotulo: 'Justificar', Icone: AlignJustify },
]

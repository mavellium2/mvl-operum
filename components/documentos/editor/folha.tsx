'use client'

import { createContext, forwardRef, useContext, useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, ExternalLink, Lock, Plus, X } from 'lucide-react'
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

// ── Medidas e estilos da folha ──────────────────────────────────────────────

export const FOLHA_MARGEM_MM = { top: 12, x: 15 } as const
export const FONTE_DOC = 'Calibri, Carlito, Arial, Helvetica, sans-serif'
const FONTE_TITULO = 'Arial, Arimo, Helvetica, sans-serif'
const BORDA = '1px solid #000'
export const CINZA = '#bfbfbf'
export const CINZA_CLARO = '#e7e6e6'

export const celula: CSSProperties = { border: BORDA, padding: '2px 6px', verticalAlign: 'top', textAlign: 'left', fontSize: '9pt', fontWeight: 'normal', lineHeight: 1.3 }
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

/**
 * Folha A4. Na tela as margens são padding; na impressão o padding sai
 * (printPageStyle) e as margens vêm do @page, valendo para todas as páginas.
 */
export const Folha = forwardRef<HTMLDivElement, { children: ReactNode; paisagem?: boolean; fixa?: boolean; style?: CSSProperties; 'data-testid'?: string; margemMm?: { top: number; x: number } }>(
  function Folha({ children, paisagem = false, fixa = false, style, margemMm = FOLHA_MARGEM_MM, ...rest }, ref) {
    const altura = paisagem ? 210 : 297
    return (
      <div
        ref={ref}
        data-folha=""
        {...(fixa ? { 'data-print-sheet-fixed': '' } : { 'data-print-sheet': '' })}
        data-testid={rest['data-testid']}
        style={{
          width: `${paisagem ? 297 : 210}mm`,
          ...(fixa ? { height: `${altura}mm`, overflow: 'hidden' } : { minHeight: `${altura}mm` }),
          padding: `${margemMm.top}mm ${margemMm.x}mm 8mm`,
          boxSizing: 'border-box', background: '#fff', color: '#000',
          fontFamily: FONTE_DOC, fontSize: '9pt', lineHeight: 1.3,
          position: 'relative', display: 'flex', flexDirection: 'column', gap: '13px',
          ...style,
        }}
      >
        {children}
      </div>
    )
  },
)

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

/** Seção de texto: faixa cinza numerada + caixa com o campo de texto. */
export function SecaoTexto({ titulo, children, alturaMinima = '22mm' }: { titulo: ReactNode; children: ReactNode; alturaMinima?: string }) {
  return (
    <table style={tabela}>
      <thead><tr><th style={faixa}>{titulo}</th></tr></thead>
      <tbody><tr><td style={{ ...celulaCampo, height: alturaMinima }}>{children}</td></tr></tbody>
    </table>
  )
}

export interface Coluna { rotulo?: ReactNode; largura?: string; alinhamento?: CSSProperties['textAlign'] }

/**
 * Seção em tabela. Faixa e cabeçalho das colunas ficam no <thead> e se
 * repetem quando a tabela continua na página seguinte. Com `onAdicionar`, o
 * editor mostra "+ Adicionar …" abaixo da tabela.
 */
export function SecaoTabela({ titulo, colunas, children, rodape, faixaNasColunas = false, onAdicionar, rotuloAdicionar = 'Adicionar linha', extrasAdicionar, menuAdicionar, semFaixa = false, estiloCabecalho, testId }: {
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
}) {
  const { editavel } = useEditorFolha()
  return (
    <div style={{ position: 'relative' }} data-testid={testId}>
      <table style={tabela}>
        <colgroup>{colunas.map((c, i) => <col key={i} style={c.largura ? { width: c.largura } : undefined} />)}</colgroup>
        <thead>
          {faixaNasColunas ? (
            <tr>{colunas.map((c, i) => <th key={i} style={{ ...faixa, textAlign: c.alinhamento ?? 'left' }}>{i === 0 ? titulo : c.rotulo}</th>)}</tr>
          ) : (
            <>
              {!semFaixa && <tr><th colSpan={colunas.length} style={faixa}>{titulo}</th></tr>}
              {colunas.some(c => c.rotulo) && <tr>{colunas.map((c, i) => <th key={i} style={{ ...cabecalhoColuna, textAlign: c.alinhamento ?? 'left', ...estiloCabecalho }}>{c.rotulo}</th>)}</tr>}
            </>
          )}
        </thead>
        <tbody>{children}</tbody>
        {rodape && <tfoot style={{ display: 'table-row-group' }}>{rodape}</tfoot>}
      </table>
      {editavel && (onAdicionar || menuAdicionar) && (
        // Com linha de total (ex.: Custo total) o botão fica sobre a borda dela, como no desenho; sem ela, logo abaixo da tabela.
        <div className="flex justify-center gap-2" style={{ marginTop: rodape ? -14 : 4, marginBottom: rodape ? -4 : 0, position: 'relative', zIndex: 1 }}>
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
  const { registrarLimpar } = useEditorFolha()
  const ref = useRef(limpar)
  useEffect(() => { ref.current = limpar })
  useEffect(() => {
    registrarLimpar(id, () => ref.current?.())
    return () => registrarLimpar(id, null)
  }, [id, registrarLimpar])
}

/**
 * 1. AUTOMÁTICO — vem do cadastro do projeto; não edita aqui. Ao passar o
 * mouse mostra o cadeado e de onde vem.
 */
export function CampoAutomatico({ children, origem = 'Automático: vem do cadastro do projeto', link, inline = false, padding = PAD }: {
  children: ReactNode
  origem?: string
  /** Atalho para editar na origem (ex.: "Editar na EAP/WBS"). */
  link?: { rotulo: string; href: string }
  inline?: boolean
  /** Espaço interno (tabelas densas usam menos). */
  padding?: string
}) {
  const { editavel } = useEditorFolha()
  if (!editavel) return inline ? <>{children}</> : <div style={{ padding }}>{children}</div>
  const Tag = inline ? 'span' : 'div'
  return (
    <Tag data-automatico="" className={`group/auto relative hover:bg-slate-100/70 ${inline ? 'inline-block rounded px-0.5' : 'block'}`} style={{ padding: inline ? undefined : padding }}>
      {children}
      <Lock aria-hidden="true" className={`absolute top-1/2 hidden h-3 w-3 -translate-y-1/2 text-slate-500 group-hover/auto:block ${inline ? 'left-full ml-1' : 'right-1.5'}`} />
      <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-1 hidden items-center gap-3 whitespace-nowrap rounded-md bg-slate-900 px-3 py-1.5 font-sans text-xs text-white shadow-lg group-hover/auto:flex">
        <Lock className="h-3 w-3" aria-hidden="true" /> {origem}
        {link && (
          <a href={link.href} className="pointer-events-auto inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 font-medium hover:bg-white/20">
            {link.rotulo} <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </span>
    </Tag>
  )
}

interface CampoBase { id: string; rotulo: string; ajuda?: string }

/**
 * 2. TEXTO — clica e digita direto na folha. Vazio mostra a pergunta que
 * orienta o preenchimento.
 */
export function CampoTexto({ id, rotulo, ajuda, pergunta, valor, onChange, max = 2000, linha = false, alinhamento, preencher = true, celulaDeTabela = false, compacto = false }: CampoBase & {
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
}) {
  const { editavel, focar } = useEditorFolha()
  const ref = useRef<HTMLTextAreaElement>(null)
  useRegistrarLimpar(id, editavel ? () => onChange('') : null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [valor, editavel])
  const pad = compacto ? '0 3px' : PAD
  if (!editavel) return <div style={{ padding: pad, whiteSpace: 'pre-wrap', textAlign: alinhamento, minHeight: '1.25em' }}>{valor}</div>
  const info = { id, rotulo, ajuda, max }
  return (
    <div data-campo={id} data-vazio={valor.trim() ? undefined : 'true'} className={`${preencher ? 'h-full min-h-full' : ''} ${FOCO}`} style={{ padding: pad }}>
      <textarea
        ref={ref}
        data-campo-foco=""
        aria-label={rotulo}
        rows={1}
        value={valor}
        maxLength={max}
        placeholder={pergunta ? (linha || celulaDeTabela ? pergunta : `Clique para escrever: ${pergunta}`) : 'Clique para escrever'}
        onChange={e => onChange(linha ? e.target.value.replace(/\n/g, ' ') : e.target.value)}
        onKeyDown={e => { if (linha && e.key === 'Enter') e.preventDefault() }}
        onFocus={e => focar({ ...info, tamanho: e.currentTarget.value.length, el: e.currentTarget.closest('td') ?? e.currentTarget })}
        onInput={e => focar({ ...info, tamanho: e.currentTarget.value.length, el: e.currentTarget.closest('td') ?? e.currentTarget })}
        onBlur={() => focar(null)}
        className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none placeholder:text-slate-400"
        style={{ font: 'inherit', lineHeight: 'inherit', color: 'inherit', textAlign: alinhamento }}
      />
    </div>
  )
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
    <span data-campo={id} data-vazio={valorId ? undefined : 'true'} className="relative inline-flex min-w-[45%] max-w-full items-center align-top" onFocus={e => focar({ id, rotulo, ajuda, el: (e.target as HTMLElement).closest('td') ?? e.currentTarget })} onBlur={() => focar(null)}>
      <MembroEquipeSelect
        membros={membros}
        projetoId={projetoId}
        value={valorId}
        onChange={onChange}
        onCriarMembro={onCriarMembro}
        semBotaoCriar
        ariaLabel={rotulo}
        placeholder="Selecionar membro da equipe"
        className="campo-pessoa w-full cursor-pointer appearance-none border-0 bg-transparent p-0 pr-5 outline-none focus:bg-[#f5f8ff] focus:outline focus:outline-2 focus:outline-blue-500"
      />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500" />
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
export const SELETOR_FOCO = '[data-campo-foco], [data-campo] input:not([type="hidden"]):not([tabindex="-1"]), [data-campo] select'

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

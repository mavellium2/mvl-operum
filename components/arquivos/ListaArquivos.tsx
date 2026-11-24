'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, Grid2x2, LayoutGrid, List, Star } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import Select from '@/components/ui/Select'
import GlassButton from '@/components/ui/GlassButton'
import UserAvatar from '@/components/user/UserAvatar'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GradeArquivos from './GradeArquivos'
import './ListaArquivos.css'

/** Categoria usada no ícone e no filtro "Tipo". */
export type CategoriaVisual = 'imagem' | 'video' | 'pdf' | 'apresentacao' | 'documento' | 'planilha' | 'desenho' | 'link' | 'outro'

export interface ItemArquivo {
  id: string
  nome: string
  /** Coluna "Tipo" (ex.: "Vídeo MP4", host do link…). */
  subtitulo: string
  categoria: CategoriaVisual
  tamanho: string
  /** Tamanho em bytes, para ordenar pela coluna (sem ele, ordena pelo texto). */
  tamanhoBytes?: number
  enviadoPor: string | null
  /** Foto de quem enviou (sem ela, o avatar mostra as iniciais). */
  enviadoPorAvatar?: string | null
  /** ISO. */
  data: string
  /** Conteúdo da coluna extra (ex.: card e sprint no admin). */
  extra?: ReactNode
  /** Texto a mais que entra na busca (ex.: título do card). */
  busca?: string
  /** Ações do arquivo: na coluna "Ações"; com `selecao`, aparecem ao passar o mouse ou focar a linha (como no Drive). */
  acoes?: ReactNode
  /** Estrela pessoal, mostrada ao lado do nome. */
  favorito?: boolean
  /** URL da arte (imagem ou vídeo) para a miniatura dos blocos e da lista. */
  previa?: string
  /** Link aberto ao clicar na miniatura do bloco. */
  abrir?: string
}

type Modo = 'lista' | 'blocos'
type ColunaOrdem = 'nome' | 'tipo' | 'enviadoPor' | 'data' | 'tamanho'
interface Ordem { coluna: ColunaOrdem; direcao: 'asc' | 'desc' }

const comparar = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }).compare
const VALOR_ORDEM: Record<ColunaOrdem, (a: ItemArquivo) => string | number> = {
  nome: a => a.nome,
  tipo: a => a.subtitulo,
  enviadoPor: a => a.enviadoPor ?? '',
  data: a => Date.parse(a.data) || 0,
  tamanho: a => a.tamanhoBytes ?? a.tamanho,
}

/** Ordena uma cópia; empates mantêm a ordem recebida. */
export function ordenarArquivos(itens: ItemArquivo[], ordem: Ordem | null): ItemArquivo[] {
  if (!ordem) return itens
  const valor = VALOR_ORDEM[ordem.coluna]
  const sinal = ordem.direcao === 'asc' ? 1 : -1
  return itens.map((a, i) => ({ a, i })).sort((x, y) => {
    const vx = valor(x.a), vy = valor(y.a)
    const r = typeof vx === 'number' && typeof vy === 'number' ? vx - vy : comparar(String(vx), String(vy))
    return r * sinal || x.i - y.i
  }).map(({ a }) => a)
}

/** Título de coluna que ordena ao clicar (crescente, depois decrescente), com a seta da direção. */
function TituloOrdenavel({ coluna, rotulo, ordem, onOrdenar, alinhar = 'left' }: {
  coluna: ColunaOrdem; rotulo: string; ordem: Ordem | null; onOrdenar: (c: ColunaOrdem) => void; alinhar?: 'left' | 'right'
}) {
  const ativa = ordem?.coluna === coluna
  const Seta = ativa && ordem.direcao === 'desc' ? ArrowDown : ArrowUp
  return (
    <GlassButton variant="custom" type="button" onClick={() => onOrdenar(coluna)}
      aria-label={`Ordenar por ${rotulo}${ativa ? (ordem.direcao === 'asc' ? ', em ordem crescente' : ', em ordem decrescente') : ''}`}
      className={`arq-titulo-ordem pressionavel inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 ${alinhar === 'right' ? 'flex-row-reverse' : ''}`}
      data-ativa={ativa || undefined}>
      <span className="truncate">{rotulo}</span>
      <Seta className={`h-3.5 w-3.5 shrink-0 ${ativa ? '' : 'arq-seta-inativa'}`} aria-hidden="true" />
    </GlassButton>
  )
}

/**
 * Círculo de seleção no estilo Apple: anel fino e vazio; azul com ✓ desenhado quando marcado; traço quando parcial
 * (cabeçalho). Nas linhas e blocos fica fora da ordem do Tab (`tabIndex={-1}`): o teclado usa Espaço na própria linha.
 */
export function CirculoSelecao({ marcado, parcial = false, rotulo, onAlternar, className = '', tabIndex }: {
  marcado: boolean; parcial?: boolean; rotulo: string; onAlternar: () => void; className?: string; tabIndex?: number
}) {
  return (
    <GlassButton variant="custom" type="button" role="checkbox" aria-checked={parcial ? 'mixed' : marcado} aria-label={rotulo} title={rotulo}
      tabIndex={tabIndex}
      onClick={e => { e.stopPropagation(); onAlternar() }}
      onDoubleClick={e => e.stopPropagation()}
      data-marcado={marcado || parcial || undefined}
      className={`arq-circulo pressionavel ${className}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path pathLength={1} d={parcial ? 'M3.1 6h5.8' : 'M2.9 6.4l2.1 2.2 4.1-4.9'} />
      </svg>
    </GlassButton>
  )
}

/** Seleção de arquivos com as ações em lote numa barra acima da lista. */
export interface SelecaoArquivos {
  selecionados: string[]
  onChange: (ids: string[]) => void
  /** Ações para os arquivos selecionados que estão visíveis (respeitando busca e filtros). */
  acoes: (ids: string[]) => ReactNode
  /** Atalhos Delete/Backspace: pede para excluir (o chamador confirma). Sem ele, a tecla não faz nada. */
  onExcluir?: (ids: string[]) => void
  /** Atalho F2: renomear o arquivo da linha. Sem ele, a tecla não faz nada. */
  onRenomear?: (id: string) => void
}

const TAMANHO_MIN = 120
const TAMANHO_MAX = 360
const TAMANHO_PADRAO = 180

function lerVisualizacao(chave: string): { modo?: Modo; tamanho?: number } {
  try {
    const salvo = JSON.parse(window.localStorage.getItem(`operum:arquivos:${chave}`) ?? 'null') as { modo?: string; tamanho?: number } | null
    return {
      modo: salvo?.modo === 'lista' || salvo?.modo === 'blocos' ? salvo.modo : undefined,
      tamanho: typeof salvo?.tamanho === 'number' ? Math.min(TAMANHO_MAX, Math.max(TAMANHO_MIN, salvo.tamanho)) : undefined,
    }
  } catch { return {} /* sem armazenamento */ }
}

/** Alternador Lista/Blocos em ícones, como o do Drive: o modo ativo ganha o ✓ e o fundo de destaque. */
function AlternadorModo({ modo, onChange }: { modo: Modo; onChange: (m: Modo) => void }) {
  const opcoes = [{ valor: 'lista', rotulo: 'Lista', Icone: List }, { valor: 'blocos', rotulo: 'Blocos', Icone: LayoutGrid }] as const
  const grupo = useRef<HTMLDivElement>(null)
  return (
    <div ref={grupo} role="radiogroup" aria-label="Modo de visualização" className="arq-alternador flex h-9 shrink-0 items-stretch overflow-hidden rounded-full">
      {opcoes.map(({ valor, rotulo, Icone }, i) => {
        const ativo = modo === valor
        return (
          <GlassButton key={valor} variant="custom" role="radio" aria-checked={ativo} aria-label={rotulo} title={rotulo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => onChange(valor)}
            onKeyDown={e => {
              if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
              e.preventDefault()
              const prox = opcoes[(i + 1) % opcoes.length]
              onChange(prox.valor)
              grupo.current?.querySelectorAll<HTMLButtonElement>('[role=radio]')[(i + 1) % opcoes.length]?.focus()
            }}
            className="arq-alternador-opcao pressionavel flex items-center justify-center gap-1 px-3.5">
            {ativo && <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />}
            <Icone className="h-4 w-4" aria-hidden="true" />
          </GlassButton>
        )
      })}
    </div>
  )
}

/** Modo e tamanho do bloco guardados neste navegador (lidos depois de montar, para não divergir da hidratação). */
function useVisualizacao(chave: string | undefined) {
  const [modo, setModo] = useState<Modo>('lista')
  const [tamanho, setTamanho] = useState(TAMANHO_PADRAO)
  const [lido, setLido] = useState(false)
  useEffect(() => {
    if (!chave) return
    const salvo = lerVisualizacao(chave)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lê o armazenamento só no navegador, depois de hidratar
    setModo(m => salvo.modo ?? m); setTamanho(t => salvo.tamanho ?? t); setLido(true)
  }, [chave])
  useEffect(() => {
    if (!chave || !lido) return
    try { window.localStorage.setItem(`operum:arquivos:${chave}`, JSON.stringify({ modo, tamanho })) } catch { /* sem armazenamento */ }
  }, [chave, lido, modo, tamanho])
  return { modo, setModo, tamanho, setTamanho }
}

const ROTULO_TIPO: Record<CategoriaVisual, string> = { imagem: 'Imagens', video: 'Vídeos', pdf: 'PDFs', apresentacao: 'Apresentações', documento: 'Documentos', planilha: 'Planilhas', desenho: 'Desenhos (CAD)', link: 'Links', outro: 'Outros' }

export function IconeArquivo({ categoria }: { categoria: CategoriaVisual }) {
  const caminho: Record<CategoriaVisual, { cor: string; d: string }> = {
    link: { cor: 'text-blue-500', d: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
    imagem: { cor: 'text-green-500', d: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    video: { cor: 'text-purple-500', d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    pdf: { cor: 'text-red-500', d: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    apresentacao: { cor: 'text-orange-500', d: 'M9 17v-2m3 2v-4m3 4v-6M4 4h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm8 12v4m-4 0h8' },
    documento: { cor: 'text-blue-600', d: 'M9 13h6m-6 4h6M7 3h7l5 5v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm7 0v5h5' },
    planilha: { cor: 'text-emerald-600', d: 'M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm0 5h16M4 15h16M10 3v18' },
    desenho: { cor: 'text-cyan-600', d: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v18m8-13.5l-8 4.5-8-4.5' },
    outro: { cor: 'text-gray-400', d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  }
  const { cor, d } = caminho[categoria]
  return (
    <svg className={`h-5 w-5 shrink-0 ${cor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
    </svg>
  )
}

/**
 * Lista de arquivos com busca, filtro por tipo, contador e tabela. Base comum
 * do menu Arquivos (admin) e das seções de arquivos do projeto.
 */
export default function ListaArquivos({ itens, tipos, colunaExtra, filtroExtra, placeholderBusca = 'Buscar por nome…', vazio = 'Nenhum arquivo encontrado', visualizacao, selecao, acoesTopo, onAbrir }: {
  itens: ItemArquivo[]
  /** Opções do filtro "Tipo", na ordem. */
  tipos: CategoriaVisual[]
  /** Título da coluna extra (sem ele, a coluna não aparece). */
  colunaExtra?: string
  /** Filtro a mais ao lado do tipo (ex.: sprint no admin). */
  filtroExtra?: { elemento: ReactNode; ativo: boolean; aceita: (item: ItemArquivo) => boolean }
  placeholderBusca?: string
  vazio?: string
  /** Chave para guardar a escolha; com ela aparecem os modos Lista/Blocos e o tamanho do bloco (como no Finder). */
  visualizacao?: string
  selecao?: SelecaoArquivos
  /** Ações gerais no fim da barra de ferramentas (ex.: enviar arquivos). */
  acoesTopo?: ReactNode
  /** Abrir no próprio Operum (duplo clique/Enter), recebendo a lista na ordem exibida; sem ele, abre `abrir` em nova aba. */
  onAbrir?: (item: ItemArquivo, lista: ItemArquivo[]) => void
}) {
  const { modo, setModo, tamanho, setTamanho } = useVisualizacao(visualizacao)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const [ordem, setOrdem] = useState<Ordem | null>(null)
  const ordenar = (coluna: ColunaOrdem) => setOrdem(o => (o?.coluna === coluna ? { coluna, direcao: o.direcao === 'asc' ? 'desc' : 'asc' } : { coluna, direcao: 'asc' }))
  const ariaSort = (coluna: ColunaOrdem) => (ordem?.coluna === coluna ? (ordem.direcao === 'asc' ? 'ascending' : 'descending') : undefined)
  const filtrados = useMemo(() => itens.filter(a => {
    const q = busca.trim().toLowerCase()
    if (q && !a.nome.toLowerCase().includes(q) && !(a.busca ?? '').toLowerCase().includes(q)) return false
    if (tipo && a.categoria !== tipo) return false
    if (filtroExtra && !filtroExtra.aceita(a)) return false
    return true
  }), [itens, busca, tipo, filtroExtra])
  const visiveis = useMemo(() => ordenarArquivos(filtrados, ordem), [filtrados, ordem])
  const colunas = 6 + (colunaExtra ? 1 : 0) + (selecao ? 1 : 0)
  const idsVisiveis = new Set(visiveis.map(a => a.id))
  const escolhidos = (selecao?.selecionados ?? []).filter(id => idsVisiveis.has(id))
  const marcar = (id: string, v: boolean) => selecao?.onChange(v ? [...selecao.selecionados, id] : selecao.selecionados.filter(x => x !== id))
  const todosMarcados = visiveis.length > 0 && escolhidos.length === visiveis.length
  const alternarTodos = () => selecao?.onChange(todosMarcados
    ? selecao.selecionados.filter(id => !idsVisiveis.has(id))
    : [...selecao.selecionados.filter(id => !idsVisiveis.has(id)), ...visiveis.map(a => a.id)])
  const abrirArquivo = (a: ItemArquivo) => {
    if (onAbrir) onAbrir(a, visiveis)
    else if (a.abrir) window.open(a.abrir, '_blank', 'noopener,noreferrer')
  }
  const ancora = useRef<string | null>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const emBlocos = !!visualizacao && modo === 'blocos'
  /** Item com o foco do teclado (um só ponto de parada do Tab na lista, como no Finder). */
  const [focoId, setFocoId] = useState<string | null>(null)
  const ativoId = focoId && idsVisiveis.has(focoId) ? focoId : (visiveis[0]?.id ?? null)
  const digitado = useRef({ texto: '', em: 0 })

  const itemDom = (id: string) => [...(raiz.current?.querySelectorAll<HTMLElement>('[data-arq-id]') ?? [])].find(el => el.dataset.arqId === id)
  const focarItem = (id: string) => { setFocoId(id); itemDom(id)?.focus() }
  /** Quantos blocos cabem por linha (para as setas ↑ ↓ na grade). */
  const colunasDaGrade = () => {
    const itensDom = [...(raiz.current?.querySelectorAll<HTMLElement>('[data-arq-id]') ?? [])]
    if (!itensDom.length) return 1
    const topo = itensDom[0].getBoundingClientRect().top
    const n = itensDom.findIndex(el => Math.abs(el.getBoundingClientRect().top - topo) > 4)
    return Math.max(1, n === -1 ? itensDom.length : n)
  }
  /** Seleciona do item-âncora até `ate`, na ordem exibida. Devolve falso sem âncora. */
  const intervalo = (ate: string) => {
    if (!selecao || !ancora.current) return false
    const ids = visiveis.map(a => a.id)
    const [de, fim] = [ids.indexOf(ancora.current), ids.indexOf(ate)].sort((x, y) => x - y)
    if (de < 0) return false
    selecao.onChange(ids.slice(de, fim + 1))
    return true
  }
  const selecionarTodos = () => { if (selecao) selecao.onChange([...new Set([...selecao.selecionados, ...visiveis.map(a => a.id)])]) }
  const limparSelecao = () => { if (selecao) selecao.onChange(selecao.selecionados.filter(id => !idsVisiveis.has(id))) }

  /**
   * Teclado da lista (como no Finder e no Drive): ↑ ↓ (e ← → nos blocos) movem e selecionam; Shift estende; Ctrl/⌘ só move;
   * Home/End/PageUp/PageDown; Espaço marca/desmarca; Enter abre; F2 renomeia; Delete exclui; Ctrl/⌘+A seleciona tudo;
   * Esc limpa; digitar o começo do nome vai até o arquivo.
   */
  function teclado(e: KeyboardEvent<HTMLDivElement>) {
    if (!selecao || e.defaultPrevented) return
    const alvo = e.target as HTMLElement
    if (alvo.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"], [data-glass-select-panel]')) return
    const mod = e.ctrlKey || e.metaKey
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') { e.preventDefault(); selecionarTodos(); return }
    if (e.key === 'Escape') { if (escolhidos.length) { e.preventDefault(); limparSelecao() } return }
    // Teclas de navegação só valem com o foco na própria linha ou bloco (botões e links dentro dele usam Enter/Espaço).
    const linha = alvo.closest<HTMLElement>('[data-arq-id]')
    if (!linha || alvo !== linha) return
    const id = linha.dataset.arqId as string
    const n = visiveis.length
    const i = visiveis.findIndex(a => a.id === id)
    if (i < 0) return
    const colunas = emBlocos ? colunasDaGrade() : 1
    let destino = -1
    switch (e.key) {
      case 'ArrowDown': destino = i + colunas <= n - 1 ? i + colunas : (i >= Math.floor((n - 1) / colunas) * colunas ? i : n - 1); break
      case 'ArrowUp': destino = Math.max(0, i - colunas); break
      case 'ArrowRight': if (emBlocos) destino = Math.min(n - 1, i + 1); break
      case 'ArrowLeft': if (emBlocos) destino = Math.max(0, i - 1); break
      case 'Home': destino = 0; break
      case 'End': destino = n - 1; break
      case 'PageDown': destino = Math.min(n - 1, i + 10); break
      case 'PageUp': destino = Math.max(0, i - 10); break
    }
    if (destino >= 0) {
      e.preventDefault()
      const novo = visiveis[destino].id
      if (e.shiftKey) { if (!ancora.current) ancora.current = id; intervalo(novo) }
      else if (!mod) { ancora.current = novo; selecao.onChange([novo]) }
      focarItem(novo)
      return
    }
    switch (e.key) {
      case 'Enter': e.preventDefault(); abrirArquivo(visiveis[i]); return
      case ' ': e.preventDefault(); ancora.current = id; marcar(id, !selecao.selecionados.includes(id)); return
      case 'Delete': case 'Backspace':
        if (selecao.onExcluir) { e.preventDefault(); selecao.onExcluir(escolhidos.includes(id) ? escolhidos : [id]) }
        return
      case 'F2': if (selecao.onRenomear) { e.preventDefault(); selecao.onRenomear(id) } return
    }
    // Digitar o começo do nome leva ao arquivo (como no Finder); letras seguidas dentro de 0,7 s formam a busca.
    if (e.key.length === 1 && !mod && !e.altKey) {
      const agora = e.timeStamp
      const d = digitado.current
      d.texto = agora - d.em > 700 ? e.key.toLowerCase() : d.texto + e.key.toLowerCase()
      d.em = agora
      const depois = [...visiveis.slice(i + 1), ...visiveis.slice(0, i + 1)]
      const achado = (d.texto.length > 1 ? [visiveis[i], ...depois] : depois).find(a => a.nome.toLowerCase().startsWith(d.texto))
      if (achado) { e.preventDefault(); ancora.current = achado.id; selecao.onChange([achado.id]); focarItem(achado.id) }
    }
  }

  // Ctrl/⌘+A com o foco solto na página (nenhum campo, nenhum diálogo aberto) também seleciona tudo.
  const todosRef = useRef(selecionarTodos)
  useEffect(() => { todosRef.current = selecionarTodos })
  const temSelecao = !!selecao
  useEffect(() => {
    if (!temSelecao) return
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.shiftKey || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return
      if (e.target !== document.body || document.querySelector('[role="dialog"], [aria-modal="true"]')) return
      e.preventDefault(); todosRef.current()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [temSelecao])

  // Ordem do Tab: só o item ativo (e as ações dele) entra na sequência; as demais linhas ficam a uma seta de distância.
  useEffect(() => {
    if (!temSelecao) return
    raiz.current?.querySelectorAll<HTMLElement>('[data-arq-id]').forEach(item => {
      const ativo = item.dataset.arqId === ativoId
      item.querySelectorAll<HTMLElement>('button:not(.arq-circulo), a[href], input').forEach(el => { el.tabIndex = ativo ? 0 : -1 })
    })
  })

  /** Clique na linha ou no bloco, como no Drive: seleciona só ela; Ctrl/⌘ alterna; Shift seleciona o intervalo. */
  function clicarLinha(e: MouseEvent, id: string) {
    // Com seleção, nome e miniatura não são links: um clique seleciona, o duplo clique abre (como no Drive).
    if (!selecao || (e.target as HTMLElement).closest('button, input, label')) return
    setFocoId(id)
    if (e.shiftKey && intervalo(id)) return
    ancora.current = id
    if (e.ctrlKey || e.metaKey) marcar(id, !selecao.selecionados.includes(id))
    else selecao.onChange([id])
  }

  const filtrado = !!(busca || tipo || filtroExtra?.ativo)
  const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div ref={raiz} className="arq" onKeyDown={teclado}>
      {/* Barra de ferramentas única: busca e filtros à esquerda; visualização e ações gerais à direita. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1">
          <SearchInput label="Buscar arquivos" placeholder={placeholderBusca} value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select
          ariaLabel="Filtrar por tipo"
          className="w-full sm:w-40"
          searchable={false}
          value={tipo}
          onChange={setTipo}
          placeholder="Todos os tipos"
          options={[{ value: '', label: 'Todos os tipos' }, ...tipos.map(t => ({ value: t, label: ROTULO_TIPO[t] }))]}
        />
        {filtroExtra?.elemento}
        {visualizacao && (
          <div className="flex items-center gap-3">
            {modo === 'blocos' && (
              <label className="arq-meta hidden items-center gap-2 sm:flex">
                <Grid2x2 className="h-3 w-3" aria-hidden="true" />
                {/* Controle deslizante nativo (range): permitido fora da base dos campos de texto. */}
                <input type="range" min={TAMANHO_MIN} max={TAMANHO_MAX} step={10} value={tamanho}
                  onChange={e => setTamanho(Number(e.target.value))}
                  aria-label="Tamanho dos blocos" aria-valuetext={`${tamanho} pixels`} className="arq-range h-1 w-24 cursor-pointer lg:w-32" />
                <Grid2x2 className="h-4 w-4" aria-hidden="true" />
              </label>
            )}
            <AlternadorModo modo={modo} onChange={setModo} />
          </div>
        )}
        {acoesTopo}
      </div>

      {/* Linha de estado: contador ou, com seleção, a barra de ações (como no Drive). Altura fixa para a lista não pular. */}
      <div className="mb-2 flex min-h-10 items-center">
        {selecao && escolhidos.length > 0
          ? <div className="arq-barra-selecao anim-surgir flex min-h-10 flex-1 flex-wrap items-center gap-2 rounded-full py-0.5 pl-1 pr-3">
              <GlassCloseButton label="Limpar seleção" onClick={() => selecao.onChange(selecao.selecionados.filter(id => !idsVisiveis.has(id)))} />
              <p className="mr-1 text-sm font-medium" aria-live="polite">
                {escolhidos.length} {escolhidos.length === 1 ? 'item selecionado' : 'itens selecionados'}
              </p>
              <div role="toolbar" aria-label="Ações dos arquivos selecionados" className="flex items-center gap-0.5">{selecao.acoes(escolhidos)}</div>
            </div>
          : <p className="arq-meta px-1 text-sm" aria-live="polite">
              {visiveis.length} arquivo{visiveis.length !== 1 ? 's' : ''}{filtrado ? ' (filtrado)' : ''}
            </p>}
      </div>

      {visualizacao && modo === 'blocos' ? <GradeArquivos itens={visiveis} tamanho={tamanho} vazio={vazio} selecionados={selecao ? escolhidos : undefined} onClicar={selecao ? clicarLinha : undefined} onMarcar={selecao ? id => { ancora.current = id; setFocoId(id); marcar(id, !selecao.selecionados.includes(id)) } : undefined} algumMarcado={escolhidos.length > 0} onAbrir={selecao ? abrirArquivo : undefined} ativoId={selecao ? ativoId : undefined} onFoco={selecao ? setFocoId : undefined} /> : <div className="arq-quadro overflow-hidden rounded-2xl">
        <table className="w-full table-fixed text-sm">
          <thead className="arq-cabecalho">
            <tr>
              {selecao && (
                <th className="w-8 pl-3 pr-0 py-2 text-left">
                  <CirculoSelecao marcado={todosMarcados} parcial={escolhidos.length > 0 && !todosMarcados}
                    rotulo={todosMarcados ? 'Desmarcar todos os arquivos' : 'Selecionar todos os arquivos'} onAlternar={alternarTodos}
                    className="arq-circulo-cabecalho" />
                </th>
              )}
              <th className="px-3 py-2 text-left" aria-sort={ariaSort('nome')}><TituloOrdenavel coluna="nome" rotulo="Nome" ordem={ordem} onOrdenar={ordenar} /></th>
              {colunaExtra && <th className="hidden w-48 px-3 py-2 text-left md:table-cell">{colunaExtra}</th>}
              <th className="hidden w-32 px-2 py-2 text-left md:table-cell" aria-sort={ariaSort('tipo')}><TituloOrdenavel coluna="tipo" rotulo="Tipo" ordem={ordem} onOrdenar={ordenar} /></th>
              <th className="hidden w-40 px-2 py-2 text-left xl:table-cell" aria-sort={ariaSort('enviadoPor')}><TituloOrdenavel coluna="enviadoPor" rotulo="Enviado por" ordem={ordem} onOrdenar={ordenar} /></th>
              <th className="hidden w-32 px-2 py-2 text-left sm:table-cell" aria-sort={ariaSort('data')}><TituloOrdenavel coluna="data" rotulo="Data" ordem={ordem} onOrdenar={ordenar} /></th>
              <th className="hidden w-28 px-2 py-2 text-right sm:table-cell" aria-sort={ariaSort('tamanho')}><TituloOrdenavel coluna="tamanho" rotulo="Tamanho" ordem={ordem} onOrdenar={ordenar} alinhar="right" /></th>
              <th className={`px-3 py-2.5 text-right ${selecao ? 'w-40' : 'w-36'}`}><span className={selecao ? 'sr-only' : ''}>Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={colunas} className="arq-meta px-4 py-10 text-center">{vazio}</td></tr>
            )}
            {visiveis.map(a => (
              <tr key={a.id} aria-selected={selecao ? escolhidos.includes(a.id) : undefined}
                onClick={selecao ? e => clicarLinha(e, a.id) : undefined}
                onDoubleClick={selecao && a.abrir ? e => { if (!(e.target as HTMLElement).closest('button, input')) abrirArquivo(a) } : undefined}
                data-arq-id={selecao ? a.id : undefined}
                tabIndex={selecao ? (a.id === ativoId ? 0 : -1) : undefined}
                onFocus={selecao ? e => { if (e.target === e.currentTarget) setFocoId(a.id) } : undefined}
                aria-label={selecao ? `${a.nome}${a.abrir ? ' (Enter abre)' : ''}` : undefined}
                className={`arq-linha ${selecao ? 'cursor-default select-none' : ''}`}>
                {selecao && (
                  <td className="w-8 pl-3 pr-0 py-1.5">
                    <CirculoSelecao marcado={escolhidos.includes(a.id)} rotulo={`Selecionar ${a.nome}`} tabIndex={-1}
                      onAlternar={() => { ancora.current = a.id; setFocoId(a.id); marcar(a.id, !selecao.selecionados.includes(a.id)) }}
                      className={escolhidos.length > 0 ? 'arq-circulo-visivel' : ''} />
                  </td>
                )}
                <td className={selecao ? 'px-3 py-1.5' : 'px-4 py-1.5'}>
                  <div className="flex min-w-0 items-center gap-3">
                    {visualizacao && a.previa && a.categoria === 'imagem'
                      // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, servida por redirecionamento.
                      ? <img src={a.previa} alt="" loading="lazy" decoding="async" draggable={false} className="arq-miniatura h-8 w-8 shrink-0 rounded-md object-cover" />
                      : <span className="flex h-8 w-8 shrink-0 items-center justify-center"><IconeArquivo categoria={a.categoria} /></span>}
                    {a.abrir && !selecao
                      ? <a href={a.abrir} target="_blank" rel="noopener noreferrer" className="arq-nome min-w-0 truncate font-medium" title={a.nome}>{a.nome}</a>
                      : <span className="arq-nome min-w-0 truncate font-medium" title={a.nome}>{a.nome}</span>}
                    {a.favorito && <Star className="arq-estrela h-3.5 w-3.5 shrink-0" aria-label="Com estrela" />}
                  </div>
                </td>
                {colunaExtra && <td className="hidden truncate px-3 py-1.5 md:table-cell">{a.extra}</td>}
                <td className="arq-meta hidden truncate px-3 py-1.5 md:table-cell" title={a.subtitulo}>{a.subtitulo}</td>
                <td className="arq-meta hidden px-3 py-1.5 xl:table-cell">
                  {a.enviadoPor
                    ? <span className="flex min-w-0 items-center gap-2" title={a.enviadoPor}>
                        <span aria-hidden="true" className="contents"><UserAvatar name={a.enviadoPor} avatarUrl={a.enviadoPorAvatar} size="xs" /></span>
                        <span className="truncate">{a.enviadoPor}</span>
                      </span>
                    : '—'}
                </td>
                <td className="arq-meta hidden whitespace-nowrap px-3 py-1.5 sm:table-cell">{data(a.data)}</td>
                <td className="arq-meta hidden whitespace-nowrap px-3 py-1.5 text-right tabular-nums sm:table-cell">{a.tamanho}</td>
                <td className="px-3 py-1">
                  {/* Com seleção, as ações da linha aparecem no hover ou no foco (e sempre em telas de toque). */}
                  <div className={`flex items-center justify-end gap-0.5 ${selecao ? 'acoes-linha-arquivo' : ''}`}>{a.acoes}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  )
}

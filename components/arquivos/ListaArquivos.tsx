'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Grid2x2, Star } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import Select from '@/components/ui/Select'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'
import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GradeArquivos from './GradeArquivos'
import './ListaArquivos.css'

/** Categoria usada no ícone e no filtro "Tipo". */
export type CategoriaVisual = 'imagem' | 'video' | 'pdf' | 'apresentacao' | 'link' | 'outro'

export interface ItemArquivo {
  id: string
  nome: string
  /** Coluna "Tipo" (ex.: "Vídeo MP4", host do link…). */
  subtitulo: string
  categoria: CategoriaVisual
  tamanho: string
  enviadoPor: string | null
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

/** Seleção de arquivos com as ações em lote numa barra acima da lista. */
export interface SelecaoArquivos {
  selecionados: string[]
  onChange: (ids: string[]) => void
  /** Ações para os arquivos selecionados que estão visíveis (respeitando busca e filtros). */
  acoes: (ids: string[]) => ReactNode
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

const ROTULO_TIPO: Record<CategoriaVisual, string> = { imagem: 'Imagens', video: 'Vídeos', pdf: 'PDFs', apresentacao: 'Apresentações', link: 'Links', outro: 'Outros' }

export function IconeArquivo({ categoria }: { categoria: CategoriaVisual }) {
  const caminho: Record<CategoriaVisual, { cor: string; d: string }> = {
    link: { cor: 'text-blue-500', d: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1' },
    imagem: { cor: 'text-green-500', d: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
    video: { cor: 'text-purple-500', d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
    pdf: { cor: 'text-red-500', d: 'M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
    apresentacao: { cor: 'text-orange-500', d: 'M9 17v-2m3 2v-4m3 4v-6M4 4h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1V4zm8 12v4m-4 0h8' },
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
export default function ListaArquivos({ itens, tipos, colunaExtra, filtroExtra, placeholderBusca = 'Buscar por nome…', vazio = 'Nenhum arquivo encontrado', visualizacao, selecao, acoesTopo }: {
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
}) {
  const { modo, setModo, tamanho, setTamanho } = useVisualizacao(visualizacao)
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const visiveis = useMemo(() => itens.filter(a => {
    const q = busca.trim().toLowerCase()
    if (q && !a.nome.toLowerCase().includes(q) && !(a.busca ?? '').toLowerCase().includes(q)) return false
    if (tipo && a.categoria !== tipo) return false
    if (filtroExtra && !filtroExtra.aceita(a)) return false
    return true
  }), [itens, busca, tipo, filtroExtra])
  const colunas = 6 + (colunaExtra ? 1 : 0)
  const idsVisiveis = new Set(visiveis.map(a => a.id))
  const escolhidos = (selecao?.selecionados ?? []).filter(id => idsVisiveis.has(id))
  const marcar = (id: string, v: boolean) => selecao?.onChange(v ? [...selecao.selecionados, id] : selecao.selecionados.filter(x => x !== id))
  const ancora = useRef<string | null>(null)
  /** Clique na linha ou no bloco, como no Drive: seleciona só ela; Ctrl/⌘ alterna; Shift seleciona o intervalo. */
  function clicarLinha(e: MouseEvent, id: string) {
    if (!selecao || (e.target as HTMLElement).closest('a, button, input, label')) return
    if (e.shiftKey && ancora.current) {
      const ids = visiveis.map(a => a.id)
      const [de, ate] = [ids.indexOf(ancora.current), ids.indexOf(id)].sort((x, y) => x - y)
      if (de >= 0) { selecao.onChange(ids.slice(de, ate + 1)); return }
    }
    ancora.current = id
    if (e.ctrlKey || e.metaKey) marcar(id, !selecao.selecionados.includes(id))
    else selecao.onChange([id])
  }

  const filtrado = !!(busca || tipo || filtroExtra?.ativo)
  const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="arq">
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
            <GlassSegmentedControl<Modo>
              variant="compact"
              label="Modo de visualização"
              className="!mb-0 w-40"
              value={modo}
              onChange={setModo}
              options={[{ value: 'lista', label: 'Lista' }, { value: 'blocos', label: 'Blocos' }]}
            />
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

      {visualizacao && modo === 'blocos' ? <GradeArquivos itens={visiveis} tamanho={tamanho} vazio={vazio} selecionados={selecao ? escolhidos : undefined} onClicar={clicarLinha} /> : <div className="arq-quadro overflow-hidden rounded-2xl"
        onKeyDown={e => { if (selecao && e.key === 'Escape' && escolhidos.length) selecao.onChange([]) }}>
        <table className="w-full table-fixed text-sm">
          <thead className="arq-cabecalho">
            <tr>
              <th className="px-4 py-2.5 text-left">Nome</th>
              {colunaExtra && <th className="hidden w-48 px-3 py-2.5 text-left md:table-cell">{colunaExtra}</th>}
              <th className="hidden w-32 px-3 py-2.5 text-left md:table-cell">Tipo</th>
              <th className="hidden w-40 px-3 py-2.5 text-left xl:table-cell">Enviado por</th>
              <th className="hidden w-32 px-3 py-2.5 text-left sm:table-cell">Data</th>
              <th className="hidden w-24 px-3 py-2.5 text-right sm:table-cell">Tamanho</th>
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
                onDoubleClick={selecao && a.abrir ? e => { if (!(e.target as HTMLElement).closest('a, button, input')) window.open(a.abrir, '_blank', 'noopener,noreferrer') } : undefined}
                className={`arq-linha ${selecao ? 'cursor-default select-none' : ''}`}>
                <td className="px-4 py-1.5">
                  <div className="flex min-w-0 items-center gap-3">
                    {visualizacao && a.previa && a.categoria === 'imagem'
                      // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, servida por redirecionamento.
                      ? <a href={a.abrir ?? a.previa} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="shrink-0"><img src={a.previa} alt="" loading="lazy" decoding="async" className="arq-miniatura h-8 w-8 rounded-md object-cover" /></a>
                      : <span className="flex h-8 w-8 shrink-0 items-center justify-center"><IconeArquivo categoria={a.categoria} /></span>}
                    {a.abrir
                      ? <a href={a.abrir} target="_blank" rel="noopener noreferrer" className="arq-nome min-w-0 truncate font-medium" title={a.nome}>{a.nome}</a>
                      : <span className="arq-nome min-w-0 truncate font-medium" title={a.nome}>{a.nome}</span>}
                    {a.favorito && <Star className="arq-estrela h-3.5 w-3.5 shrink-0" aria-label="Com estrela" />}
                  </div>
                </td>
                {colunaExtra && <td className="hidden truncate px-3 py-1.5 md:table-cell">{a.extra}</td>}
                <td className="arq-meta hidden truncate px-3 py-1.5 md:table-cell" title={a.subtitulo}>{a.subtitulo}</td>
                <td className="arq-meta hidden truncate px-3 py-1.5 xl:table-cell">{a.enviadoPor ?? '—'}</td>
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

'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Grid2x2 } from 'lucide-react'
import { Input as OperumInput } from '@/components/ui/Field'
import Select from '@/components/ui/Select'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'
import GradeArquivos from './GradeArquivos'

/** Categoria usada no ícone e no filtro "Tipo". */
export type CategoriaVisual = 'imagem' | 'video' | 'pdf' | 'apresentacao' | 'link' | 'outro'

export interface ItemArquivo {
  id: string
  nome: string
  /** Linha cinza abaixo do nome (tipo MIME, host do link…). */
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
  /** Ações na linha (sem `selecao`). Com seleção, as ações ficam na barra acima. */
  acoes?: ReactNode
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

/** Caixa de seleção nativa (controle permitido fora da base dos campos de texto), com estado parcial. */
export function CaixaSelecao({ marcado, parcial = false, onChange, rotulo, className = '' }: { marcado: boolean; parcial?: boolean; onChange: (v: boolean) => void; rotulo: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = parcial && !marcado }, [parcial, marcado])
  return <input ref={ref} type="checkbox" checked={marcado} onChange={e => onChange(e.target.checked)} aria-label={rotulo}
    className={`h-4 w-4 shrink-0 cursor-pointer rounded accent-blue-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${className}`} />
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
export default function ListaArquivos({ itens, tipos, colunaExtra, filtroExtra, placeholderBusca = 'Buscar por nome…', vazio = 'Nenhum arquivo encontrado', visualizacao, selecao }: {
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
  // Com seleção, a coluna da caixa substitui a de ações: o total não muda.
  const colunas = 5 + (colunaExtra ? 1 : 0)
  const idsVisiveis = new Set(visiveis.map(a => a.id))
  const escolhidos = (selecao?.selecionados ?? []).filter(id => idsVisiveis.has(id))
  const todos = visiveis.length > 0 && escolhidos.length === visiveis.length
  const marcarTodos = (v: boolean) => selecao?.onChange(v
    ? [...new Set([...selecao.selecionados, ...visiveis.map(a => a.id)])]
    : selecao.selecionados.filter(id => !idsVisiveis.has(id)))
  const marcar = (id: string, v: boolean) => selecao?.onChange(v ? [...selecao.selecionados, id] : selecao.selecionados.filter(x => x !== id))
  const selecionarTodos = <CaixaSelecao marcado={todos} parcial={escolhidos.length > 0} onChange={marcarTodos} rotulo="Selecionar todos" />

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <OperumInput
          type="search"
          placeholder={placeholderBusca}
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Select
          ariaLabel="Filtrar por tipo"
          className="sm:w-44"
          searchable={false}
          value={tipo}
          onChange={setTipo}
          placeholder="Todos os tipos"
          options={[{ value: '', label: 'Todos os tipos' }, ...tipos.map(t => ({ value: t, label: ROTULO_TIPO[t] }))]}
        />
        {filtroExtra?.elemento}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {selecao && modo === 'blocos' && visiveis.length > 0 && selecionarTodos}
          <p className="text-sm text-gray-500" aria-live="polite">
            {selecao && escolhidos.length > 0
              ? `${escolhidos.length} de ${visiveis.length} selecionado${escolhidos.length !== 1 ? 's' : ''}`
              : <>{visiveis.length} arquivo{visiveis.length !== 1 ? 's' : ''}{busca || tipo || filtroExtra?.ativo ? ' (filtrado)' : ''}</>}
          </p>
          {selecao && <div role="toolbar" aria-label="Ações dos arquivos selecionados" className="flex items-center gap-1">{selecao.acoes(escolhidos)}</div>}
        </div>
        {visualizacao && (
          <div className="flex flex-wrap items-center gap-3">
            {modo === 'blocos' && (
              <label className="flex items-center gap-2 text-slate-500">
                <Grid2x2 className="h-3 w-3" aria-hidden="true" />
                {/* Controle deslizante nativo (range): permitido fora da base dos campos de texto. */}
                <input type="range" min={TAMANHO_MIN} max={TAMANHO_MAX} step={10} value={tamanho}
                  onChange={e => setTamanho(Number(e.target.value))}
                  aria-label="Tamanho dos blocos" aria-valuetext={`${tamanho} pixels`} className="h-1 w-28 cursor-pointer accent-blue-600 sm:w-36" />
                <Grid2x2 className="h-4 w-4" aria-hidden="true" />
              </label>
            )}
            <GlassSegmentedControl<Modo>
              variant="compact"
              label="Modo de visualização"
              className="!mb-0 w-48"
              value={modo}
              onChange={setModo}
              options={[{ value: 'lista', label: 'Lista' }, { value: 'blocos', label: 'Blocos' }]}
            />
          </div>
        )}
      </div>

      {visualizacao && modo === 'blocos' ? <GradeArquivos itens={visiveis} tamanho={tamanho} vazio={vazio} selecionados={selecao ? escolhidos : undefined} onMarcar={marcar} /> : <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              {selecao && <th className="w-10 py-3 pl-4">{visiveis.length > 0 && selecionarTodos}</th>}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Arquivo</th>
              {colunaExtra && <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 md:table-cell">{colunaExtra}</th>}
              <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 lg:table-cell">Enviado por</th>
              <th className="hidden px-4 py-3 text-right text-xs font-medium text-gray-500 sm:table-cell">Tamanho</th>
              <th className="hidden px-4 py-3 text-right text-xs font-medium text-gray-500 lg:table-cell">Data</th>
              {!selecao && <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={colunas} className="px-4 py-8 text-center text-sm text-gray-400">{vazio}</td></tr>
            )}
            {visiveis.map(a => (
              <tr key={a.id} aria-selected={selecao ? escolhidos.includes(a.id) : undefined}
                className={`border-b border-gray-50 transition-colors last:border-0 ${selecao && escolhidos.includes(a.id) ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}>
                {selecao && <td className="w-10 py-3 pl-4"><CaixaSelecao marcado={escolhidos.includes(a.id)} onChange={v => marcar(a.id, v)} rotulo={`Selecionar ${a.nome}`} /></td>}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {visualizacao && a.previa && a.categoria === 'imagem'
                      // eslint-disable-next-line @next/next/no-img-element -- URL assinada do storage, servida por redirecionamento.
                      ? <a href={a.abrir ?? a.previa} target="_blank" rel="noopener noreferrer" tabIndex={-1} aria-hidden="true" className="shrink-0"><img src={a.previa} alt="" loading="lazy" decoding="async" className="h-8 w-8 rounded-md bg-slate-100 object-cover" /></a>
                      : <IconeArquivo categoria={a.categoria} />}
                    <div className="min-w-0">
                      {a.abrir
                        ? <a href={a.abrir} target="_blank" rel="noopener noreferrer" className="block max-w-[260px] truncate font-medium text-gray-900 hover:text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500" title={a.nome}>{a.nome}</a>
                        : <p className="max-w-[260px] truncate font-medium text-gray-900" title={a.nome}>{a.nome}</p>}
                      <p className="text-xs text-gray-400">{a.subtitulo}</p>
                    </div>
                  </div>
                </td>
                {colunaExtra && <td className="hidden px-4 py-3 md:table-cell">{a.extra}</td>}
                <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">{a.enviadoPor ?? '—'}</td>
                <td className="hidden px-4 py-3 text-right text-gray-600 sm:table-cell">{a.tamanho}</td>
                <td className="hidden px-4 py-3 text-right text-xs text-gray-400 lg:table-cell">{new Date(a.data).toLocaleDateString('pt-BR')}</td>
                {!selecao && <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{a.acoes}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </div>
  )
}

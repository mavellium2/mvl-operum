'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Input as OperumInput } from '@/components/ui/Field'
import Select from '@/components/ui/Select'

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
  acoes: ReactNode
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
export default function ListaArquivos({ itens, tipos, colunaExtra, filtroExtra, placeholderBusca = 'Buscar por nome…', vazio = 'Nenhum arquivo encontrado' }: {
  itens: ItemArquivo[]
  /** Opções do filtro "Tipo", na ordem. */
  tipos: CategoriaVisual[]
  /** Título da coluna extra (sem ele, a coluna não aparece). */
  colunaExtra?: string
  /** Filtro a mais ao lado do tipo (ex.: sprint no admin). */
  filtroExtra?: { elemento: ReactNode; ativo: boolean; aceita: (item: ItemArquivo) => boolean }
  placeholderBusca?: string
  vazio?: string
}) {
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const visiveis = useMemo(() => itens.filter(a => {
    const q = busca.trim().toLowerCase()
    if (q && !a.nome.toLowerCase().includes(q) && !(a.busca ?? '').toLowerCase().includes(q)) return false
    if (tipo && a.categoria !== tipo) return false
    if (filtroExtra && !filtroExtra.aceita(a)) return false
    return true
  }), [itens, busca, tipo, filtroExtra])
  const colunas = 5 + (colunaExtra ? 1 : 0)

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

      <p className="mb-3 text-sm text-gray-500">
        {visiveis.length} arquivo{visiveis.length !== 1 ? 's' : ''}
        {busca || tipo || filtroExtra?.ativo ? ' (filtrado)' : ''}
      </p>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Arquivo</th>
              {colunaExtra && <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 md:table-cell">{colunaExtra}</th>}
              <th className="hidden px-4 py-3 text-left text-xs font-medium text-gray-500 lg:table-cell">Enviado por</th>
              <th className="hidden px-4 py-3 text-right text-xs font-medium text-gray-500 sm:table-cell">Tamanho</th>
              <th className="hidden px-4 py-3 text-right text-xs font-medium text-gray-500 lg:table-cell">Data</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={colunas} className="px-4 py-8 text-center text-sm text-gray-400">{vazio}</td></tr>
            )}
            {visiveis.map(a => (
              <tr key={a.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <IconeArquivo categoria={a.categoria} />
                    <div className="min-w-0">
                      <p className="max-w-[260px] truncate font-medium text-gray-900" title={a.nome}>{a.nome}</p>
                      <p className="text-xs text-gray-400">{a.subtitulo}</p>
                    </div>
                  </div>
                </td>
                {colunaExtra && <td className="hidden px-4 py-3 md:table-cell">{a.extra}</td>}
                <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">{a.enviadoPor ?? '—'}</td>
                <td className="hidden px-4 py-3 text-right text-gray-600 sm:table-cell">{a.tamanho}</td>
                <td className="hidden px-4 py-3 text-right text-xs text-gray-400 lg:table-cell">{new Date(a.data).toLocaleDateString('pt-BR')}</td>
                <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{a.acoes}</div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

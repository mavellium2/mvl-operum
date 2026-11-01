'use client'

import { Input as OperumInput } from '@/components/ui/Field'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import UserAvatar from '@/components/user/UserAvatar' // Adicionado para renderizar a foto do usuário
import { fetchWithSession } from '@/lib/clientFetch'
import { sprintPath } from '@/lib/sprintPath'
import { SEARCH_GROUP_LABEL, formatTempoBusca, type SearchGroup } from '@/lib/searchGroups'

// Tipagem atualizada para suportar 'member' e seus dados específicos
interface SearchResult {
  id: string
  title: string
  type: 'project' | 'card' | 'member'
  description?: string
  color?: string
  sprintId?: string
  projectId?: string // Útil para saber de qual projeto o membro é
  sprint?: string | null
  sprintColumn?: string | null
  tags?: { name: string; color: string }[]
  avatarUrl?: string | null // Específico para o tipo 'member'
  /** Grupo da busca unificada do projeto (ausente nos contextos antigos). */
  group?: SearchGroup
  sprintStatus?: string | null
  priority?: string | null
  responsibles?: string[]
  tempoSegundos?: number
  personName?: string
}

const SPRINT_STATUS_LABEL: Record<string, string> = {
  PLANNED: 'planejada',
  ACTIVE: 'ativa',
  COMPLETED: 'concluída',
}

const PRIORITY_LABEL: Record<string, { label: string; cls: string }> = {
  alta: { label: 'Alta', cls: 'text-red-600' },
  media: { label: 'Média', cls: 'text-amber-700' },
  baixa: { label: 'Baixa', cls: 'text-emerald-700' },
}

type Section = { key: string; label: string; items: SearchResult[] }

/** Agrupa na ordem que veio da API; "cards da pessoa" vira uma seção por pessoa. */
function buildSections(results: SearchResult[]): Section[] {
  if (!results.some(r => r.group)) {
    return [
      { key: 'card', label: 'Cards e tarefas', items: results.filter(r => (r.type ?? 'card') === 'card') },
      { key: 'project', label: 'Projetos', items: results.filter(r => r.type === 'project') },
      { key: 'member', label: 'Pessoas', items: results.filter(r => r.type === 'member') },
    ].filter(s => s.items.length > 0)
  }
  const sections: Section[] = []
  for (const r of results) {
    const group = r.group ?? 'outras_sprints'
    const key = group === 'cards_pessoa' ? `${group}:${r.personName ?? ''}` : group
    const label = group === 'cards_pessoa' && r.personName ? `Cards de ${r.personName}` : SEARCH_GROUP_LABEL[group]
    const last = sections[sections.length - 1]
    if (last?.key === key) last.items.push(r)
    else sections.push({ key, label, items: [r] })
  }
  return sections
}

interface GlobalSearchProps {
  placeholder?: string
  searchContext?: 'global_projects' | 'project_items' | 'sprint_items' | 'project_members' | 'default'
  contextId?: string
  currentSprintId?: string
}

export default function GlobalSearch({
  placeholder = 'Buscar...',
  searchContext = 'default',
  contextId,
  currentSprintId,
}: GlobalSearchProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Posição (fixed/viewport) para o dropdown — renderizado via portal em <body>
  // para não ser recortado por containers com overflow-hidden (ex.: sidebar).
  const [dropRect, setDropRect] = useState<{ left: number; top: number; width: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const r = containerRef.current?.getBoundingClientRect()
      if (r) {
        setDropRect({
          left: r.left,
          top: r.bottom + 4,
          width: Math.min(384, Math.max(320, window.innerWidth - r.left - 8)),
        })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [open, results, query])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const queryParams = new URLSearchParams({
        q,
        context: searchContext,
        ...(contextId && { contextId }),
        ...(currentSprintId && { sprintId: currentSprintId }),
      })

      const res = await fetchWithSession(`/api/search?${queryParams.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setResults(data.results ?? [])
        setOpen(true)
      }
    } finally {
      setLoading(false)
    }
  }, [searchContext, contextId, currentSprintId])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(query), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, search])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (containerRef.current?.contains(t)) return
      if (dropRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }

  // Lógica de Redirecionamento Atualizada
  const handleResultClick = (result: SearchResult) => {
    setOpen(false)
    setQuery('')
    
    if (result.type === 'project') {
      router.push(`/projetos/${result.id}`)
    } else if (result.type === 'card' && result.sprintId) {
      router.push(sprintPath(result.sprintId, result.projectId, result.id))
    } else if (result.type === 'card' && result.projectId) {
      // Card do backlog: abre no board da sprint aberta (que mostra o backlog)
      // ou na lista de sprints do projeto.
      router.push(currentSprintId
        ? sprintPath(currentSprintId, result.projectId, result.id)
        : `/projetos/${result.projectId}/sprints`)
    } else if (result.type === 'member' && contextId) {
      // Se for membro, leva o usuário para a página de membros do projeto
      // Dica: Você pode usar '?user=id' na URL para dar um highlight na página depois!
      router.push(`/projetos/${contextId}/membros?highlight=${result.id}`)
    }
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <OperumInput
          ref={inputRef}
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Busca global"
          className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white transition-shadow"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {open && results.length > 0 && dropRect && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[60] bg-white rounded-xl shadow-xl border border-gray-100 py-1 max-h-80 overflow-y-auto"
          style={{ left: dropRect.left, top: dropRect.top, width: dropRect.width }}
          role="listbox"
          aria-label="Resultados da busca"
        >
          {(() => {
            const sections = buildSections(results)

            return sections.map(section => (
              <div key={section.key}>
                <div className="px-4 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {section.label}
                </div>
                {section.items.map(result => (
                  <div
                    key={`${section.key}-${result.id}`}
                    className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0"
                    role="option"
                    aria-selected={false}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex items-center gap-3">

                      {/* Ícones Dinâmicos com base no tipo de resultado */}
                      {result.type === 'card' && (
                        <div className="w-1.5 h-8 rounded-full shrink-0" style={{ backgroundColor: result.color || '#3b82f6' }} />
                      )}

                      {result.type === 'project' && (
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                        </div>
                      )}

                      {result.type === 'member' && (
                        <div className="shrink-0">
                          <UserAvatar name={result.title} avatarUrl={result.avatarUrl} size="sm" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{result.title}</p>

                        {/* Descrição para Cards */}
                        {result.type === 'card' && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {result.sprint
                              ? <span className="text-blue-600">{result.sprint}{result.sprintStatus && SPRINT_STATUS_LABEL[result.sprintStatus] ? ` (${SPRINT_STATUS_LABEL[result.sprintStatus]})` : ''}</span>
                              : <span className="text-slate-500">Backlog</span>}
                            {result.sprintColumn && <span> · {result.sprintColumn}</span>}
                          </p>
                        )}
                        {result.type === 'card' && (result.priority || result.responsibles?.length || formatTempoBusca(result.tempoSegundos ?? 0)) ? (
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                            {result.priority && PRIORITY_LABEL[result.priority] && (
                              <span className={`font-semibold ${PRIORITY_LABEL[result.priority].cls}`}>{PRIORITY_LABEL[result.priority].label}</span>
                            )}
                            {result.responsibles && result.responsibles.length > 0 && <span> · {result.responsibles.join(', ')}</span>}
                            {formatTempoBusca(result.tempoSegundos ?? 0) && <span> · ⏱ {formatTempoBusca(result.tempoSegundos ?? 0)}</span>}
                          </p>
                        ) : null}

                        {/* Descrição para Projetos ou Membros (ex: Email ou Cargo) */}
                        {(result.type === 'project' || result.type === 'member') && result.description && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            {result.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))
          })()}
        </div>,
        document.body,
      )}

      {open && results.length === 0 && query.length >= 2 && !loading && dropRect && createPortal(
        <div
          className="fixed z-[60] bg-white rounded-xl shadow-lg border border-gray-100 py-4 text-center"
          style={{ left: dropRect.left, top: dropRect.top, width: dropRect.width }}
        >
          <p className="text-sm text-gray-500">Nenhum resultado para &ldquo;{query}&rdquo;</p>
        </div>,
        document.body,
      )}
    </div>
  )
}
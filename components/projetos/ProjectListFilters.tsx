'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import GlassButton from '@/components/ui/GlassButton'
import GlassPopover from '@/components/ui/GlassPopover'
import Select from '@/components/ui/Select'
import FormActions from '@/components/ui/FormActions'

export default function ProjectListFilters({ query, status }: { query: string; status: string }) {
  const router = useRouter()
  const [search, setSearch] = useState(query)
  const [draft, setDraft] = useState(status)
  const [open, setOpen] = useState(false)
  const [pending, transition] = useTransition()
  const anchor = useRef<HTMLButtonElement>(null)
  const [previous, setPrevious] = useState({ query, status })
  if (previous.query !== query || previous.status !== status) {
    setPrevious({ query, status }); setSearch(query); setDraft(status)
  }
  useEffect(() => {
    if (search.trim() === query) return
    const timer = setTimeout(() => {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (status) params.set('status', status)
      transition(() => router.replace(`/projetos${params.size ? `?${params}` : ''}`, { scroll: false }))
    }, 350)
    return () => clearTimeout(timer)
  }, [search, query, status, router])
  function apply(q: string, value: string) {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (value) params.set('status', value)
    transition(() => router.push(`/projetos${params.size ? `?${params}` : ''}`))
    setOpen(false)
  }
  return <div className="projects-toolbar" aria-busy={pending}>
    <form role="search" onSubmit={event => { event.preventDefault(); apply(search, status) }} className="projects-search"><SearchInput label="Pesquisar projetos" placeholder="Pesquisar por nome ou descrição…" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} />{search && <GlassButton variant="icon" aria-label="Limpar pesquisa" className="projects-search-clear" onClick={() => { setSearch(''); apply('', status) }}><X size={14} /></GlassButton>}</form>
    <GlassButton ref={anchor} variant="default" aria-label="Filtros dos projetos" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setDraft(status); setOpen(value => !value) }}><SlidersHorizontal size={17} aria-hidden="true" />{status && <span className="projects-filter-dot" />}</GlassButton>
    <GlassPopover open={open} anchor={anchor} onClose={() => setOpen(false)} label="Filtrar projetos"><form onSubmit={event => { event.preventDefault(); apply(search, draft) }}><h2 className="mb-4 text-sm font-semibold">Filtrar projetos</h2><label className="mb-2 block text-xs" id="project-status-label">Situação</label><Select placeholder="Todas as situações" ariaLabel="Situação dos projetos" value={draft} searchable={false} onChange={setDraft} options={[{ value: '', label: 'Todas as situações' }, { value: 'ACTIVE', label: 'Em andamento' }, { value: 'COMPLETED', label: 'Concluídos' }, { value: 'ARCHIVED', label: 'Arquivados' }, { value: 'INACTIVE', label: 'Inativos' }]} /><FormActions surface="none" className="mt-5 flex justify-end gap-2"><GlassButton onClick={() => { setDraft(''); apply(search, '') }}>Limpar</GlassButton><GlassButton variant="primary" type="submit">Aplicar</GlassButton></FormActions></form></GlassPopover>
    {pending && <span role="status" className="sr-only">Atualizando projetos…</span>}
  </div>
}

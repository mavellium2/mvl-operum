'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { SlidersHorizontal, X } from 'lucide-react'
import SearchInput from '@/components/ui/SearchInput'
import GlassButton from '@/components/ui/GlassButton'
import GlassPopover from '@/components/ui/GlassPopover'
import FormActions, { FormBody } from '@/components/ui/FormActions'
import OpcoesMultiplas from '@/components/ui/OpcoesMultiplas'
import { salvarFiltrosProjetos } from '@/app/actions/projectList'
import {
  FILTROS_VAZIOS, filtrosAtivos, rotuloTermo, SITUACOES_PROJETO, TURMAS_PROJETO, TURNOS_PROJETO,
  type FiltrosProjetos, type OpcoesFiltrosProjetos,
} from '@/lib/filtrosProjetos'

/** Valores guardados que sumiram dos projetos continuam na lista, para poder desmarcar. */
const comGuardados = <T,>(opcoes: T[], guardados: T[]) => [...opcoes, ...guardados.filter(v => !opcoes.includes(v))]

export default function ProjectListFilters({ query, filtros, opcoes }: { query: string; filtros: FiltrosProjetos; opcoes: OpcoesFiltrosProjetos }) {
  const router = useRouter()
  const [search, setSearch] = useState(query)
  const [draft, setDraft] = useState(filtros)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [pending, transition] = useTransition()
  const [saving, startSaving] = useTransition()
  const anchor = useRef<HTMLButtonElement>(null)
  const [previous, setPrevious] = useState(query)
  if (previous !== query) { setPrevious(query); setSearch(query) }
  useEffect(() => {
    if (search.trim() === query) return
    const timer = setTimeout(() => {
      const q = search.trim()
      transition(() => router.replace(`/projetos${q ? `?q=${encodeURIComponent(q)}` : ''}`, { scroll: false }))
    }, 350)
    return () => clearTimeout(timer)
  }, [search, query, router])
  function pesquisar(q: string) {
    transition(() => router.push(`/projetos${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`))
  }
  function aplicar(valores: FiltrosProjetos) {
    setError('')
    startSaving(async () => {
      const result = await salvarFiltrosProjetos(valores).catch(() => ({ error: 'Não foi possível guardar os filtros. Tente novamente.' }))
      if ('error' in result) { setError(result.error ?? 'Não foi possível guardar os filtros. Tente novamente.'); return }
      setOpen(false)
      router.refresh()
    })
  }
  const ativos = filtrosAtivos(filtros)
  const muda = <K extends keyof FiltrosProjetos>(chave: K) => (valores: FiltrosProjetos[K]) => setDraft(d => ({ ...d, [chave]: valores }))
  return <div className="projects-toolbar" aria-busy={pending || saving}>
    <form role="search" onSubmit={event => { event.preventDefault(); pesquisar(search) }} className="projects-search"><SearchInput label="Pesquisar projetos" placeholder="Pesquisar por nome ou descrição…" value={search} maxLength={200} onChange={event => setSearch(event.target.value)} />{search && <GlassButton variant="icon" aria-label="Limpar pesquisa" className="projects-search-clear" onClick={() => { setSearch(''); pesquisar('') }}><X size={14} /></GlassButton>}</form>
    <GlassButton ref={anchor} variant="default" aria-label={ativos ? `Filtros dos projetos (${ativos} ativo${ativos > 1 ? 's' : ''})` : 'Filtros dos projetos'} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setDraft(filtros); setError(''); setOpen(value => !value) }}><SlidersHorizontal size={17} aria-hidden="true" />{ativos > 0 && <span className="projects-filter-count" aria-hidden="true">{ativos}</span>}</GlassButton>
    <GlassPopover open={open} anchor={anchor} onClose={() => { if (!saving) setOpen(false) }} label="Filtrar projetos" layout="form">
      <form className="form-layout min-h-0 flex-1" onSubmit={event => { event.preventDefault(); aplicar(draft) }}>
        <FormBody>
          <h2 className="mb-1 text-sm font-semibold">Filtrar projetos</h2>
          <p className="mb-4 text-xs opacity-70">O filtro fica guardado e a lista já abre assim. Sem nada marcado, vale para todas as opções.</p>
          <OpcoesMultiplas legenda="Ano" vazio="Todos" valores={draft.anos} onChange={muda('anos')} opcoes={comGuardados(opcoes.anos, filtros.anos).map(a => ({ value: a, label: String(a) }))} semOpcoes="Nenhum projeto com ano cadastrado." />
          <OpcoesMultiplas legenda="Departamento" vazio="Todos" valores={draft.departamentos} onChange={muda('departamentos')} opcoes={comGuardados(opcoes.departamentos, filtros.departamentos).map(d => ({ value: d, label: d }))} semOpcoes="Nenhum projeto com departamento cadastrado." />
          <OpcoesMultiplas legenda="Turma" vazio="Todas" valores={draft.turmas} onChange={muda('turmas')} opcoes={TURMAS_PROJETO} />
          <OpcoesMultiplas legenda="Termo" vazio="Todos" valores={draft.termos} onChange={muda('termos')} opcoes={comGuardados(opcoes.termos, filtros.termos).map(t => ({ value: t, label: rotuloTermo(t) }))} semOpcoes="Nenhum projeto com termo cadastrado." />
          <OpcoesMultiplas legenda="Turno" vazio="Todos" valores={draft.turnos} onChange={muda('turnos')} opcoes={TURNOS_PROJETO.map(t => ({ value: t, label: t }))} />
          <OpcoesMultiplas legenda="Situação" vazio="Todas" valores={draft.situacoes} onChange={muda('situacoes')} opcoes={SITUACOES_PROJETO} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </FormBody>
        <FormActions surface="none" className="flex justify-end gap-2 pt-3">
          <GlassButton disabled={saving} onClick={() => { setDraft(FILTROS_VAZIOS); aplicar(FILTROS_VAZIOS) }}>Limpar</GlassButton>
          <GlassButton variant="primary" type="submit" disabled={saving}>{saving ? 'Aplicando…' : 'Aplicar'}</GlassButton>
        </FormActions>
      </form>
    </GlassPopover>
    {(pending || saving) && <span role="status" className="sr-only">Atualizando projetos…</span>}
  </div>
}

'use client'

import { useId, useState, useRef, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import GlassPopover from '@/components/ui/GlassPopover'
import FormActions from '@/components/ui/FormActions'
import SearchInput from '@/components/ui/SearchInput'
import DateInput from '@/components/ui/DateInput'
import Select from '@/components/ui/Select'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import EmptyState from '@/components/ui/EmptyState'
import { matchesSearch } from '@/lib/search'
import { compareVersions } from '@/lib/release-notes'

export interface ReleaseEntry { version: string; start: string; end: string; search: string; content: ReactNode; current: boolean }
export default function ReleaseHistoryBrowser({ entries }: { entries: ReleaseEntry[] }) {
  const filterButton = useRef<HTMLButtonElement>(null)
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [order, setOrder] = useState('desc')
  const [open, setOpen] = useState(false)
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [draftOrder, setDraftOrder] = useState('desc')
  const uid = useId()
  const invalid = !!draftFrom && !!draftTo && draftFrom > draftTo
  const visible = entries.filter(entry => matchesSearch(entry.search, query) && (!from || entry.end >= from) && (!to || entry.start <= to)).toSorted((a, b) => order === 'asc' ? compareVersions(a.version, b.version) : compareVersions(b.version, a.version))
  const filtered = !!from || !!to || order !== 'desc'
  const clear = () => { setQuery(''); setFrom(''); setTo(''); setOrder('desc'); setDraftFrom(''); setDraftTo(''); setDraftOrder('desc') }
  return <section aria-labelledby="release-history-title" className="space-y-4">
    <div><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="release-history-title" className="text-lg font-semibold tracking-tight text-gray-900">Novidades e atualizações</h2><p role="status" className="text-xs text-gray-500">{visible.length} {visible.length === 1 ? 'versão' : 'versões'}{filtered ? ' · filtros aplicados' : ''}</p></div><p className="mt-1 text-sm text-gray-500">Confira o que mudou em cada versão do Operum.</p></div>
    <GlassCard className="about-card p-3">
      <div className="flex items-center gap-2"><div className="min-w-0 flex-1"><SearchInput label="Pesquisar versões" placeholder="Buscar versão, recurso ou mudança…" value={query} onChange={e => setQuery(e.target.value)} /></div><GlassButton ref={filterButton} variant="icon" aria-haspopup="dialog" aria-controls={`${uid}-filters`} aria-label="Filtros das versões" aria-expanded={open} onClick={() => { setDraftFrom(from); setDraftTo(to); setDraftOrder(order); setOpen(value => !value) }} className="relative shrink-0"><SlidersHorizontal size={18} aria-hidden="true" />{filtered && <span aria-hidden="true" className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-blue-500" />}</GlassButton></div>
    </GlassCard>
    <GlassPopover id={`${uid}-filters`} open={open} anchor={filterButton} onClose={() => setOpen(false)} label="Filtrar versões">
      <form onSubmit={e => { e.preventDefault(); if (invalid) return; setFrom(draftFrom); setTo(draftTo); setOrder(draftOrder); setOpen(false) }}>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor={`${uid}-from`} className="mb-1.5 block text-xs text-gray-500">De</label><DateInput id={`${uid}-from`} ariaLabel="Data inicial das versões" value={draftFrom} onChange={setDraftFrom} /></div>
          <div><label htmlFor={`${uid}-to`} className="mb-1.5 block text-xs text-gray-500">Até</label><DateInput id={`${uid}-to`} ariaLabel="Data final das versões" value={draftTo} onChange={setDraftTo} /></div>
        </div>
        <div className="mt-4"><span className="mb-1.5 block text-xs text-gray-500">Ordenação</span><Select ariaLabel="Ordenar versões" searchable={false} value={draftOrder} onChange={setDraftOrder} options={[{ value: 'desc', label: 'Decrescente · mais recentes' }, { value: 'asc', label: 'Crescente · mais antigas' }]} /></div>
        {invalid && <p role="alert" className="mt-3 text-xs text-red-600">A data final deve ser igual ou posterior à data inicial.</p>}
        <FormActions surface="none" className="mt-5 flex justify-end gap-2"><GlassButton onClick={clear}>Limpar</GlassButton><GlassButton variant="primary" type="submit" disabled={invalid}>Aplicar</GlassButton></FormActions>
      </form>
    </GlassPopover>
    {!visible.length && <EmptyState heading="Nenhuma versão encontrada" subtext="Tente outro termo ou período." action={{ label: 'Limpar filtros', onClick: clear }} />}
    <div className="space-y-3">{visible.map(entry => <div key={entry.version} data-release-version={entry.version}>{entry.content}</div>)}</div>
    <p className="text-xs text-gray-500">O histórico até a versão 1.6.0 foi reconstruído a partir dos registros do projeto.</p>
  </section>
}

'use client'

import { useEffect, useRef, useState, useTransition, useId } from 'react'
import { Building2, ChevronDown, Check, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import GlassButton from '@/components/ui/GlassButton'
import SearchInput from '@/components/ui/SearchInput'
import PasswordInput from '@/components/ui/PasswordInput'
import FormActions from '@/components/ui/FormActions'
import GlassPopover from '@/components/ui/GlassPopover'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'
import { navegarComGuarda } from '@/components/documentos/editor/GuardaSaida'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { matchesSearch } from '@/lib/search'

type TenantEntry = Awaited<ReturnType<typeof getMyTenantsAction>>[number]
const roles: Record<string, string> = { admin: 'Administrador', gerente: 'Gerente', member: 'Membro' }
export default function TenantSwitcher({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname()
  const mobile = useMediaQuery('(max-width: 767px)')
  const [tenants, setTenants] = useState<TenantEntry[]>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<TenantEntry | null>(null)
  const [pending, startTransition] = useTransition()
  const trigger = useRef<HTMLButtonElement>(null)
  const uid = useId()
  useEffect(() => {
    let active = true
    const reload = () => { getMyTenantsAction().then(items => { if (active) { setTenants(items); setLoading(false) } }).catch(() => { if (active) { setLoading(false); setError('Não foi possível carregar as instituições.') } }) }
    reload(); window.addEventListener('operum:instituicao-atualizada', reload)
    return () => { active = false; window.removeEventListener('operum:instituicao-atualizada', reload) }
  }, [pathname])
  const current = tenants.find(t => t.isCurrent)
  function access(tenant: TenantEntry, password?: string) {
    navegarComGuarda(() => startTransition(async () => {
      setError('')
      try {
        const result = await switchTenantAction(tenant.tenantId, password)
        if (result?.needsPassword) setTarget(tenant)
        if (result?.error) setError(result.error)
        if (!result) { window.dispatchEvent(new Event('operum:tenant-changed')); setOpen(false) }
      } catch (error) {
        if (typeof error === 'object' && error && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT')) { window.dispatchEvent(new Event('operum:tenant-changed')); setOpen(false); throw error }
        setError('Não foi possível trocar de instituição. Sua conta atual continua ativa; tente novamente.')
      } finally { window.dispatchEvent(new Event('operum:instituicao-atualizada')) }
    }))
  }
  return <>
    <GlassButton variant="custom" ref={trigger} aria-label={`Trocar de instituição${current ? `: ${current.tenantName}` : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={uid} disabled={pending} title={current?.tenantName ?? 'Instituições'} onClick={() => { setOpen(value => !value); setTarget(null); setError(''); setQuery('') }} className={`sidebar-institution ${compact ? 'sidebar-institution--compact' : ''}`}>
      <span className="sidebar-institution-icon"><Building2 size={19} strokeWidth={1.6} aria-hidden="true" /></span>
      {!compact && <span className="min-w-0 flex-1 text-left"><span className="block truncate text-sm font-semibold">{current?.tenantName ?? (loading ? 'Carregando…' : 'Instituições')}</span><span className="block truncate text-[11px] opacity-70">{current?.tenantSubdomain ?? 'Seu espaço de trabalho'}</span></span>}
      {!compact && (pending ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />)}
    </GlassButton>
    <GlassPopover inline={mobile} id={uid} open={open} onClose={() => { if (!pending) setOpen(false) }} anchor={trigger} label="Trocar de instituição">
      {target ? <form onSubmit={event => { event.preventDefault(); const password = new FormData(event.currentTarget).get('password'); if (typeof password === 'string') access(target, password) }}>
        <h3 className="mb-1 text-sm font-semibold">Acessar {target.tenantName}</h3><label htmlFor={`${uid}-password`} className="mb-3 block text-xs opacity-75">{target.passwordScope === 'current' ? 'Senha da conta que está ativa' : 'Senha da sua conta nesta instituição'}</label>
        <PasswordInput id={`${uid}-password`} name="password" autoComplete="current-password" autoFocus required disabled={pending} className="w-full rounded-xl border px-3 py-2" />
        <FormActions surface="none" className="mt-3"><GlassButton disabled={pending} onClick={() => { setTarget(null); setError('') }}>Voltar</GlassButton><GlassButton variant="primary" type="submit" disabled={pending}>{pending ? 'Acessando…' : 'Confirmar acesso'}</GlassButton></FormActions>
      </form> : <>
        <h3 className="mb-3 text-sm font-semibold">Suas instituições</h3>
        <SearchInput label="Pesquisar instituições no menu" placeholder="Buscar instituição…" value={query} onChange={event => setQuery(event.target.value)} />
        <div className="sidebar-institution-list mt-2">{tenants.filter(t => matchesSearch(`${t.tenantName} ${t.tenantSubdomain}`, query)).map(t => <GlassButton variant="custom" key={t.tenantId} disabled={pending || t.isCurrent} className="sidebar-institution-option" onClick={() => { if (t.requiresPassword) navegarComGuarda(() => { setTarget(t); setError('') }); else access(t) }}>
          <Building2 size={16} className="shrink-0" aria-hidden="true" /><span className="min-w-0 flex-1 text-left"><span className="block break-words text-sm font-medium">{t.tenantName}</span><span className="block text-[11px] opacity-70">{t.tenantSubdomain} · {roles[t.role] ?? t.role}</span></span>{t.isCurrent && <Check size={15} aria-label="Você está aqui" />}
        </GlassButton>)}{!loading && !tenants.some(t => matchesSearch(`${t.tenantName} ${t.tenantSubdomain}`, query)) && <p className="py-4 text-xs opacity-70">Nenhuma instituição encontrada.</p>}</div>
        <Link href="/configuracoes/instituicoes" className="sidebar-popover-link mt-3">Minhas instituições</Link>
      </>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </GlassPopover>
  </>
}

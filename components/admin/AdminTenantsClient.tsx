'use client'


import GlassCloseButton from '@/components/ui/GlassCloseButton'
import GlassCard from '@/components/ui/GlassCard'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import { institutionIdentifier } from '@/lib/institutionIdentifier'
import { matchesSearch } from '@/lib/search'
import Link from 'next/link'
import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import InstitutionAccess from '@/components/instituicoes/InstitutionAccess'
import InstitutionCard, { InstitutionIcon } from '@/components/instituicoes/InstitutionCard'
import GlassSegmentedControl from '@/components/ui/GlassSegmentedControl'
import Modal from '@/components/ui/Modal'
import { Plus, Pencil, Power, Trash2, Users, FolderKanban, CheckCircle2, ArrowRight } from 'lucide-react'
import { useState, useTransition, useEffect } from 'react'
import {
  createTenantAction,
  checkInstitutionIdentifierAction,
  updateTenantStatusAction,
  updateTenantNameAction,
  joinAsTenantAdminAction,
} from '@/app/actions/admin'

type Tenant = {
  id: string
  name: string
  subdomain: string
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'REMOVED'
  createdAt: Date
  _count: { users: number; projects?: number }
}

const statusBadge: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
  SUSPENDED: 'bg-yellow-100 text-yellow-700',
  REMOVED: 'bg-red-100 text-red-600',
}

const statusLabel: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  SUSPENDED: 'Suspenso',
  REMOVED: 'Excluída',
}

function InlineNameEdit({ id, currentName, currentSubdomain, onSave, onCancel, disabled }: {
  id: string; currentName: string; currentSubdomain: string; onSave: (id: string, name: string, subdomain: string) => void; onCancel: () => void; disabled: boolean
}) {
  const [value, setValue] = useState(currentName)
  const [identifier, setIdentifier] = useState(currentSubdomain)
  return <form onSubmit={e => { e.preventDefault(); onSave(id, value, identifier) }}>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Nome da instituição<OperumInput aria-label="Nome da instituição" autoFocus required maxLength={120} disabled={disabled} value={value} onChange={e => setValue(e.target.value)} className="mt-2 w-full rounded-xl border px-3 py-2" /></label>
      <label className="text-sm">Identificador<OperumInput aria-label="Identificador" required minLength={3} maxLength={63} pattern="[a-z0-9-]+" autoCapitalize="none" spellCheck={false} disabled={disabled} value={identifier} onChange={e => setIdentifier(e.target.value.toLowerCase())} className="mt-2 w-full rounded-xl border px-3 py-2" /></label>
    </div>
    <p className="mt-3 text-xs leading-5 text-gray-500">Ao alterar o identificador, todos devem usar o novo valor para entrar nesta instituição.</p>
    <FormActions surface="none" className="mt-4 flex justify-end gap-2"><GlassCloseButton disabled={disabled} onClick={onCancel} label="Cancelar edição" /><OperumButton variant="primary" type="submit" title="Salvar" disabled={disabled}>{disabled ? 'Salvando…' : 'Salvar alterações'}</OperumButton></FormActions>
  </form>
}

export default function AdminTenantsClient({
  initialTenants,
  myTenantIds,
  currentTenantId,
}: {
  initialTenants: Tenant[]
  myTenantIds: string[]
  currentTenantId?: string
}) {
  const [filter, setFilter] = useState('ALL')
  const [confirmation, setConfirmation] = useState<{ tenant: Tenant; status: Tenant['status'] } | null>(null)
  const [query, setQuery] = useState('')
  const [actionError, setActionError] = useState('')
  const [tenants, setTenants] = useState(initialTenants)
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set(myTenantIds))
  const [joinErrors, setJoinErrors] = useState<Record<string, string>>({})
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [identifierEdited, setIdentifierEdited] = useState(false)
  const [identifierStatus, setIdentifierStatus] = useState<'checking' | 'available' | 'error' | 'idle'>('idle')
  const [identifierMessage, setIdentifierMessage] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [formError, setFormError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const filteredTenants = tenants.filter(t => t.status !== 'REMOVED' && (filter === 'ALL' || t.status === filter) && matchesSearch(`${t.name} ${t.subdomain} ${statusLabel[t.status]}`, query)).toSorted((a, b) => Number(a.status === 'SUSPENDED') - Number(b.status === 'SUSPENDED'))

  useEffect(() => {
    if (!showForm || !subdomain) return
    let active = true
    const timer = setTimeout(async () => {
      const result = await checkInstitutionIdentifierAction(subdomain)
      if (!active) return
      if (result.error) { setIdentifierStatus('error'); setIdentifierMessage(result.error); return }
      if (!result.available && !identifierEdited && result.suggestion) { setSubdomain(result.suggestion); return }
      setIdentifierStatus(result.available ? 'available' : 'error')
      setIdentifierMessage(result.available ? 'Identificador disponível. Você pode editá-lo.' : `Este identificador já existe. Sugestão: ${result.suggestion}`)
    }, 350)
    return () => { active = false; clearTimeout(timer) }
  }, [subdomain, showForm, identifierEdited])

  function handleNameInput(value: string) {
    setName(value)
    if (!identifierEdited) { setSubdomain(value.trim() ? institutionIdentifier(value) : ''); setIdentifierStatus(value.trim() ? 'checking' : 'idle'); setIdentifierMessage('') }
  }
  function handleSubdomainInput(value: string) {
    setIdentifierEdited(true)
    setSubdomain(value.toLowerCase().slice(0, 63))
    setIdentifierStatus(value ? 'checking' : 'idle')
    setIdentifierMessage('')
  }

  function handleCreate() {
    setFormError('')
    if (isPending || identifierStatus !== 'available') return
    if (!name.trim() || !subdomain.trim()) { setFormError('Preencha nome e subdomínio.'); return }
    startTransition(async () => {
      const result = await createTenantAction({ name: name.trim(), subdomain: subdomain.trim() })
      if ('error' in result) {
        setFormError(result.error ?? 'Erro desconhecido')
      } else {
        setTenants(prev => [{ ...(result.tenant as unknown as Tenant), _count: { users: 1, projects: 0 } }, ...prev])
        setJoinedIds(prev => new Set([...prev, (result.tenant as { id: string }).id]))
        setName('')
        setSubdomain('')
        setIdentifierEdited(false)
        setIdentifierStatus('idle')
        setShowForm(false)
      }
    })
  }

  function handleStatusChange(id: string, status: Tenant['status']) {
    setActionError('')
    startTransition(async () => {
      const result = await updateTenantStatusAction(id, status)
      if ('error' in result) setActionError(result.error ?? 'Não foi possível alterar a situação.')
      else { setTenants(prev => status === 'REMOVED' ? prev.filter(t => t.id !== id) : prev.map(t => t.id === id ? { ...t, status } : t)); setConfirmation(null) }
    })
  }

  function handleNameSave(id: string, newName: string, newSubdomain: string) {
    if (isPending || !newName.trim()) return
    startTransition(async () => {
      const result = await updateTenantNameAction(id, newName, newSubdomain)
      if ('error' in result) { setActionError(result.error ?? 'Não foi possível salvar o nome.'); return }
      setTenants(prev => prev.map(t => t.id === id ? { ...t, name: newName.trim(), subdomain: newSubdomain.trim().toLowerCase() } : t))
      setActionError('')
      setEditingId(null)
    })
  }

  function handleJoin(tenantId: string) {
    setJoinErrors(prev => ({ ...prev, [tenantId]: '' }))
    startTransition(async () => {
      const result = await joinAsTenantAdminAction(tenantId)
      if ('error' in result && result.error) {
        setJoinErrors(prev => ({ ...prev, [tenantId]: result.error! }))
      } else {
        setJoinedIds(prev => new Set([...prev, tenantId]))
        setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, _count: { ...t._count, users: t._count.users + 1 } } : t))
      }
    })
  }

  return <div className="platform-workspace">
    <GlassCard className="platform-toolbar p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold">Gerenciar instituições</h2><p role="status" className="mt-1 text-xs text-gray-500">{filteredTenants.length} de {tenants.length} instituições · {tenants.filter(t => t.status === 'ACTIVE').length} ativas</p></div>
        <div className="flex flex-wrap items-center gap-2"><Link href="/configuracoes/instituicoes" className="glass-button glass-button--default text-sm">Minhas instituições</Link><OperumButton variant="primary" onClick={() => { setShowForm(v => !v); setFormError('') }}><Plus size={16} aria-hidden="true" />Nova instituição</OperumButton></div>
      </div>
      <SearchInput label="Pesquisar instituições da plataforma" placeholder="Buscar por nome, identificador ou situação…" value={query} onChange={e => setQuery(e.target.value)} />
      <GlassSegmentedControl variant="compact" className="mt-4" label="Filtrar instituições por situação" value={filter} onChange={setFilter} options={[{ value: 'ALL', label: 'Todas' }, ...Object.entries(statusLabel).filter(([value]) => value !== 'REMOVED').map(([value, label]) => ({ value, label }))]} />
    </GlassCard>
    <div className="platform-list space-y-3">
      {actionError && !confirmation && <p role="alert" className="text-sm text-red-600">{actionError}</p>}
      {showForm && <GlassCard className="p-5">
        <form onSubmit={e => { e.preventDefault(); handleCreate() }}>
          <h3 className="mb-2 text-base font-semibold">Nova instituição</h3><p className="mb-4 text-sm text-gray-500">Você será administrador desta instituição e poderá acessá-la com sua conta.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label htmlFor="new-tenant-name" className="mb-2 block text-sm">Nome da instituição</label><OperumInput id="new-tenant-name" required maxLength={120} autoFocus disabled={isPending} value={name} onChange={e => handleNameInput(e.target.value)} className="w-full rounded-xl border px-3 py-2" /></div>
            <div><label htmlFor="new-tenant-identifier" className="mb-2 block text-sm">Identificador de acesso</label><OperumInput id="new-tenant-identifier" aria-invalid={identifierStatus === 'error'} aria-describedby="identifier-availability" required minLength={3} maxLength={63} pattern="[a-z0-9-]+" disabled={isPending} value={subdomain} onChange={e => handleSubdomainInput(e.target.value)} className="w-full rounded-xl border px-3 py-2" /><p className="mt-2 text-xs text-gray-500">Usado para entrar na instituição. Letras minúsculas, números e hífens.</p><p id="identifier-availability" role="status" className={`mt-2 text-xs ${identifierStatus === 'error' ? 'text-red-600' : 'text-gray-500'}`}>{identifierStatus === 'checking' ? 'Verificando disponibilidade…' : identifierMessage}</p></div>
          </div>
          {formError && <p role="alert" className="mt-3 text-sm text-red-600">{formError}</p>}
          <FormActions surface="none" className="mt-4 flex justify-end gap-2"><OperumButton disabled={isPending} onClick={() => setShowForm(false)}>Cancelar</OperumButton><OperumButton type="submit" variant="primary" disabled={isPending || identifierStatus !== 'available'}>{isPending ? 'Criando…' : 'Criar instituição'}</OperumButton></FormActions>
        </form>
      </GlassCard>}
      {!filteredTenants.length && <EmptyState heading={tenants.length ? 'Nenhuma instituição encontrada' : 'Nenhuma instituição cadastrada'} action={query || filter !== 'ALL' ? { label: 'Limpar pesquisa', onClick: () => { setQuery(''); setFilter('ALL') } } : undefined} />}
      {filteredTenants.map(t => <InstitutionCard key={t.id} suspended={t.status === 'SUSPENDED'}>
        <div className="flex flex-wrap items-start gap-4">
          <InstitutionIcon />
          <div className="min-w-0 flex-1 basis-48">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold text-gray-900">{t.name}</h3><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${statusBadge[t.status]}`}>{statusLabel[t.status]}</span></div>
            <p className="mt-1 break-all text-xs text-gray-500">Identificador: {t.subdomain}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500"><span className="inline-flex items-center gap-1.5"><Users size={14} aria-hidden="true" />{t._count.users} {t._count.users === 1 ? 'usuário' : 'usuários'}</span><span className="inline-flex items-center gap-1.5"><FolderKanban size={14} aria-hidden="true" />{t._count.projects ?? 0} {(t._count.projects ?? 0) === 1 ? 'projeto' : 'projetos'}</span>{joinedIds.has(t.id) && <span className="institution-current-badge inline-flex items-center gap-1.5"><CheckCircle2 size={12} aria-hidden="true" />{currentTenantId === t.id ? 'Você está aqui' : 'Acesso autorizado'}</span>}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            {joinedIds.has(t.id) && currentTenantId !== t.id && t.status === 'ACTIVE' && <InstitutionAccess tenantId={t.id} name={t.name} />}
            <OperumButton title="Editar nome" disabled={isPending || t.status === 'REMOVED'} onClick={() => { setEditingId(editingId === t.id ? null : t.id); setActionError('') }}><Pencil size={14} aria-hidden="true" />Editar</OperumButton>
            {t.status === 'REMOVED' && <OperumButton disabled={isPending} onClick={() => { setActionError(''); setConfirmation({ tenant: t, status: 'ACTIVE' }) }}>Reativar</OperumButton>}
            {t.status !== 'REMOVED' && <><OperumButton disabled={isPending} onClick={() => { setActionError(''); setConfirmation({ tenant: t, status: t.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }) }}><Power size={14} aria-hidden="true" />{t.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</OperumButton><OperumButton variant="danger" disabled={isPending} onClick={() => { setActionError(''); setConfirmation({ tenant: t, status: 'REMOVED' }) }}><Trash2 size={14} aria-hidden="true" />Excluir</OperumButton>{t.status === 'ACTIVE' && <OperumButton variant="danger" disabled={isPending} onClick={() => { setActionError(''); setConfirmation({ tenant: t, status: 'SUSPENDED' }) }}>Suspender</OperumButton>}</>}
            {!joinedIds.has(t.id) && t.status === 'ACTIVE' && <OperumButton disabled={isPending} onClick={() => handleJoin(t.id)}>Obter acesso<ArrowRight size={14} aria-hidden="true" /></OperumButton>}
          </div>
        </div>
        {editingId === t.id && <div className="mt-4 border-t border-gray-200/60 pt-4"><p className="mb-2 text-xs text-gray-500">Nome e identificador são compartilhados com todos os participantes.</p><InlineNameEdit id={t.id} currentName={t.name} currentSubdomain={t.subdomain} onSave={handleNameSave} onCancel={() => setEditingId(null)} disabled={isPending} /></div>}
        {joinErrors[t.id] && <p role="alert" className="mt-2 text-sm text-red-600">{joinErrors[t.id]}</p>}
      </InstitutionCard>)}
    </div>
    <Modal isOpen={!!confirmation} onClose={() => { if (!isPending) { setConfirmation(null); setActionError('') } }} title={confirmation?.status === 'REMOVED' ? 'Excluir instituição?' : confirmation?.status === 'SUSPENDED' ? 'Suspender instituição?' : confirmation?.status === 'INACTIVE' ? 'Inativar instituição?' : 'Ativar instituição?'} className="vidro text-gray-900">
      {confirmation && <><p className="text-base font-semibold">{confirmation.tenant.name}</p><p className="mt-3 text-sm leading-6 text-gray-500">{confirmation.status === 'REMOVED' ? 'A instituição será excluída da listagem e seus usuários perderão o acesso a este ambiente. Registros conservados para histórico e auditoria não ficam disponíveis para uso.' : confirmation.status === 'SUSPENDED' ? 'O acesso dos usuários será suspenso. Os dados serão mantidos até uma eventual reativação.' : confirmation.status === 'INACTIVE' ? 'Os usuários deixarão de acessar este ambiente enquanto a instituição estiver inativa. Os dados serão mantidos.' : 'A instituição voltará a permitir o acesso de seus usuários autorizados.'}</p>{actionError && <p role="alert" className="mt-3 text-sm text-red-600">{actionError}</p>}<FormActions surface="none" className="mt-5 flex justify-end gap-2"><OperumButton autoFocus variant="primary" disabled={isPending} onClick={() => setConfirmation(null)}>Cancelar</OperumButton><OperumButton variant={confirmation.status === 'ACTIVE' ? 'default' : 'danger'} disabled={isPending} onClick={() => handleStatusChange(confirmation.tenant.id, confirmation.status)}>{isPending ? 'Aplicando…' : confirmation.status === 'REMOVED' ? 'Excluir instituição' : confirmation.status === 'SUSPENDED' ? 'Suspender instituição' : confirmation.status === 'INACTIVE' ? 'Inativar instituição' : 'Ativar instituição'}</OperumButton></FormActions></>}
    </Modal>
  </div>
}

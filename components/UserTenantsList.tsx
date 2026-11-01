'use client'

import FormActions from '@/components/ui/FormActions'
import SearchInput from '@/components/ui/SearchInput'
import EmptyState from '@/components/ui/EmptyState'
import { matchesSearch } from '@/lib/search'
import { Input } from '@/components/ui/Field'
import GlassButton from '@/components/ui/GlassButton'
import GlassCard from '@/components/ui/GlassCard'
import { Landmark, Pencil, ArrowRight, Loader2, Check } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'
import { updateMyInstitutionAction } from '@/app/actions/instituicoes'

type TenantEntry = {
  userId: string; tenantId: string; tenantName: string; tenantSubdomain: string
  role: string; isCurrent: boolean; requiresPassword?: boolean; passwordScope?: 'current' | 'target'
}
const roleLabel: Record<string, string> = { admin: 'Administrador', gerente: 'Gerente', member: 'Membro' }

export default function UserTenantsList({ canEditCurrent = false }: { canEditCurrent?: boolean }) {
  const [query, setQuery] = useState('')
  const [tenants, setTenants] = useState<TenantEntry[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [senhaPara, setSenhaPara] = useState<string | null>(null)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [editField, setEditField] = useState<'name' | 'subdomain'>('name')
  const [editError, setEditError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, startSave] = useTransition()

  function acessar(tenantId: string, password?: string) {
    setSwitchingId(tenantId); setErro(null)
    startTransition(async () => {
      const result = await switchTenantAction(tenantId, password)
      if (!result) return
      if (result.needsPassword) setSenhaPara(tenantId)
      if (result.error) setErro(result.error)
    })
  }
  useEffect(() => {
    if (!saving && editError) document.getElementById(editField === 'subdomain' ? 'institution-subdomain' : 'institution-name')?.focus()
  }, [saving, editError, editField])
  useEffect(() => { getMyTenantsAction().then(setTenants).catch(() => setTenants([])) }, [])

  if (tenants === null) return <div role="status" className="space-y-3 animate-pulse"><span className="sr-only">Carregando instituições</span>{[0, 1].map(i => <div key={i} className="h-24 rounded-2xl border border-gray-200 bg-gray-100/40" />)}</div>
  if (tenants.length === 0) return <p className="text-sm text-gray-500">Nenhuma instituição encontrada.</p>

  const visible = tenants.filter(tenant => matchesSearch(`${tenant.tenantName} ${tenant.tenantSubdomain}`, query))
  return <div className="space-y-4">
    <SearchInput label="Pesquisar instituições" placeholder="Buscar por nome ou identificador…" value={query} onChange={event => setQuery(event.target.value)} />
    {query.trim() && <p role="status" className="text-xs text-gray-500">{visible.length} {visible.length === 1 ? 'instituição encontrada' : 'instituições encontradas'}</p>}
    {!visible.length && <EmptyState heading="Nenhuma instituição corresponde à pesquisa" subtext="Tente outro nome ou identificador." action={{ label: 'Limpar pesquisa', onClick: () => setQuery('') }} />}
    {message && <p role="status" className="flex items-center gap-2 text-sm text-green-700"><Check size={16} aria-hidden="true" />{message}</p>}
    <ul className="space-y-3">
      {visible.map(t => <li key={t.tenantId}>
        <GlassCard interactive as="div" className="institution-item p-4 sm:p-5" data-current={t.isCurrent}>
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <span className="institution-item-icon" aria-hidden="true"><Landmark size={23} strokeWidth={1.5} /></span>
            <div className="min-w-0 flex-1 basis-36">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words text-base font-semibold text-gray-900">{t.tenantName}</h3>
                {t.isCurrent && <span className="institution-current-badge">Instituição ativa</span>}
              </div>
              <p className="mt-1 break-all text-xs text-gray-500">Identificador: {t.tenantSubdomain}</p>
              <p className="mt-1 text-xs text-gray-500">{roleLabel[t.role] ?? t.role}</p>
            </div>
            {t.isCurrent && canEditCurrent && !editing && <GlassButton disabled={isPending} onClick={() => { setName(t.tenantName); setSubdomain(t.tenantSubdomain); setEditError(''); setMessage(''); setEditing(true) }}><Pencil size={14} aria-hidden="true" />Editar instituição</GlassButton>}
            {!t.isCurrent && senhaPara !== t.tenantId && <GlassButton variant="primary" disabled={isPending || saving} onClick={() => {
              if (t.requiresPassword) { setSenha(''); setMostrarSenha(false); setErro(null); setSenhaPara(t.tenantId); return }
              acessar(t.tenantId)
            }}>{isPending && switchingId === t.tenantId ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />Acessando…</> : <>Acessar<ArrowRight size={14} aria-hidden="true" /></>}</GlassButton>}
          </div>
          {t.isCurrent && canEditCurrent && editing && <form className="institution-edit-form mt-4 border-t border-gray-200/60 pt-4" onSubmit={event => {
            event.preventDefault(); setEditError('')
            startSave(async () => {
              try {
                const result = await updateMyInstitutionAction({ name, subdomain })
                if (result.error) { setEditError(result.error); setEditField(result.field ?? 'name'); return }
                if (!result.name) { setEditError('Não foi possível salvar. Tente novamente.'); return }
                setTenants(current => current?.map(item => item.isCurrent ? { ...item, tenantName: result.name!, tenantSubdomain: result.subdomain ?? item.tenantSubdomain } : item) ?? [])
                setEditing(false); setMessage('Instituição atualizada.')
                window.dispatchEvent(new Event('operum:instituicao-atualizada'))
              } catch { setEditError('Não foi possível salvar. Tente novamente.') }
            })
          }}>
            <label htmlFor="institution-name" className="mb-1.5 block text-sm font-medium text-gray-700">Nome da instituição</label>
            <Input id="institution-name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} autoFocus disabled={saving} aria-invalid={!!editError && editField === 'name'} aria-describedby={editError ? 'institution-name-error' : 'institution-name-help'} className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            <p id="institution-name-help" className="mt-2 text-xs leading-5 text-gray-500">Este nome é compartilhado com todos da instituição.</p>
            <label htmlFor="institution-subdomain" className="mb-1.5 mt-4 block text-sm font-medium text-gray-700">Identificador</label>
            <Input id="institution-subdomain" value={subdomain} onChange={e => setSubdomain(e.target.value.toLowerCase())} required minLength={3} maxLength={63} pattern="[a-z0-9-]+" autoCapitalize="none" spellCheck={false} disabled={saving} aria-invalid={!!editError && editField === 'subdomain'} aria-describedby="institution-subdomain-help institution-name-error" className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" />
            <p id="institution-subdomain-help" className="mt-2 text-xs leading-5 text-gray-500">De 3 a 63 caracteres: letras minúsculas, números e hífens. Após salvar, todos devem usar o novo identificador para entrar nesta instituição.</p>
            {editError && <p id="institution-name-error" role="alert" className="mt-2 text-sm text-red-600">{editError}</p>}
            <FormActions className="mt-4 flex flex-wrap justify-end gap-2"><GlassButton disabled={saving} onClick={() => { setEditing(false); setEditError('') }}>Cancelar</GlassButton><GlassButton variant="primary" type="submit" disabled={saving || !name.trim() || (name.trim() === t.tenantName && subdomain.trim().toLowerCase() === t.tenantSubdomain)}>{saving ? 'Salvando…' : 'Salvar alterações'}</GlassButton></FormActions>
          </form>}
          {!t.isCurrent && senhaPara === t.tenantId && <form className="mt-4 border-t border-gray-200/60 pt-4" onSubmit={e => {
            e.preventDefault(); const password = new FormData(e.currentTarget).get('password')
            if (typeof password === 'string' && password) acessar(t.tenantId, password)
          }}>
            <label className="mb-2 block text-xs text-gray-500" htmlFor={`senha-${t.tenantId}`}>{t.passwordScope === 'current' ? 'Senha da conta que está ativa' : `Senha da sua conta em ${t.tenantName}`}</label>
            <div className="flex flex-wrap gap-2"><Input id={`senha-${t.tenantId}`} name="password" type={mostrarSenha ? 'text' : 'password'} autoComplete="current-password" autoFocus value={senha} onChange={e => setSenha(e.target.value)} required className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm" /><GlassButton variant="primary" type="submit" disabled={isPending}>{isPending && switchingId === t.tenantId ? 'Confirmando…' : 'Confirmar'}</GlassButton></div>
            <GlassButton className="mt-2" onClick={() => setMostrarSenha(v => !v)} aria-pressed={mostrarSenha}>{mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}</GlassButton>
            {t.passwordScope !== 'current' && <p className="mt-2 text-xs text-gray-500">Esta conta pode ter uma senha diferente da instituição ativa.</p>}
            {erro && <p role="alert" className="mt-2 text-sm text-red-600">{erro}</p>}
          </form>}
          {!t.isCurrent && senhaPara !== t.tenantId && switchingId === t.tenantId && erro && <p role="alert" className="mt-3 text-sm text-red-600">{erro}</p>}
        </GlassCard>
      </li>)}
    </ul>
  </div>
}

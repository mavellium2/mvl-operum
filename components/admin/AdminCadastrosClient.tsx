'use client'

import GlassCard from '@/components/ui/GlassCard'
import SearchInput from '@/components/ui/SearchInput'
import { matchesSearch } from '@/lib/search'
import AnimatedEditButton from '@/components/ui/AnimatedEditButton'
import AnimatedTrashButton from '@/components/ui/AnimatedTrashButton'
import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import PermissoesFuncoes from '@/components/permissoes/PermissoesFuncoes'

import { useState, useTransition } from 'react'
import { type SecaoCadastros } from '@/lib/cadastrosSecoes'
import {
  getOrCreateDepartmentAction,
  updateDepartmentNameAction,
  deleteDepartmentAction,
} from '@/app/actions/departments'
import {
  getOrCreateRoleAction,
  updateRoleNameAction,
  deleteRoleAction,
} from '@/app/actions/roles'

interface DeptItem { id: string; name: string; description: string | null }
interface RoleItem { id: string; name: string; scope: string; description: string | null }

interface Props {
  departamentosIniciais: DeptItem[]
  funcoesIniciais: RoleItem[]
  section: SecaoCadastros
}

export default function AdminCadastrosClient({ departamentosIniciais, funcoesIniciais, section }: Props) {
  const [departamentos, setDepartamentos] = useState<DeptItem[]>(departamentosIniciais)
  const [funcoes, setFuncoes] = useState<RoleItem[]>(funcoesIniciais)

  const [selectedRole, setSelectedRole] = useState('base')
  const [error] = useState<string | null>(null)

  return (
    <div className="catalog-workspace">

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

      <div className={`catalog-columns ${section === 'funcoes' ? 'catalog-columns--roles' : ''}`}>
      {section === 'departamentos' ? (
        <CatalogCrud
          title="Catálogo global de Departamentos"
          items={departamentos.map(d => ({ id: d.id, name: d.name }))}
          placeholder="Ex: Tecnologia, Produto, Marketing..."
          onCreate={async name => {
            const r = await getOrCreateDepartmentAction(name)
            if ('error' in r) throw new Error(r.error)
            return r.department as DeptItem
          }}
          onRename={async (id, name) => {
            const r = await updateDepartmentNameAction(id, name)
            if ('error' in r) throw new Error(r.error)
            return r.department as DeptItem
          }}
          onDelete={async id => {
            const r = await deleteDepartmentAction(id)
            if ('error' in r) throw new Error(r.error)
          }}
          onItems={setDepartamentos as unknown as (items: { id: string; name: string }[]) => void}
        />
      ) : (
        <CatalogCrud
          title="Catálogo global de Funções"
          onSelect={setSelectedRole}
          selectedId={selectedRole}
          items={funcoes.map(f => ({ id: f.id, name: f.name }))}
          placeholder="Ex: Arquiteto de Software"
          onCreate={async name => {
            const r = await getOrCreateRoleAction(name)
            if ('error' in r) throw new Error(r.error)
            return r.role as RoleItem
          }}
          onRename={async (id, name) => {
            const r = await updateRoleNameAction(id, name)
            if ('error' in r) throw new Error(r.error)
            return r.role as RoleItem
          }}
          onDelete={async id => {
            const r = await deleteRoleAction(id)
            if ('error' in r) throw new Error(r.error)
          }}
          onItems={setFuncoes as unknown as (items: { id: string; name: string }[]) => void}
        />
      )}
      {section === 'funcoes' && <PermissoesFuncoes selectedRole={selectedRole} onRoleChange={setSelectedRole} key={funcoes.map(f => f.id + f.name).join(',')} />}
      </div>
    </div>
  )
}

interface Item { id: string; name: string }

function CatalogCrud({
  title, items, placeholder, onCreate, onRename, onDelete, onItems, onSelect, selectedId,
}: {
  title: string
  onSelect?: (id: string) => void
  selectedId?: string
  items: Item[]
  placeholder: string
  onCreate: (name: string) => Promise<Item>
  onRename: (id: string, name: string) => Promise<Item>
  onDelete: (id: string) => Promise<void>
  onItems: (items: Item[]) => void
}) {
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const term = search.trim()
  const normalized = term.toLowerCase()
  const filtered = items.filter(i => matchesSearch(i.name, search))
  const exactMatch = filtered.some(i => i.name.toLowerCase() === normalized)
  // Se não existir exatamente o que foi digitado, oferece criar ali mesmo.
  const canCreate = term !== '' && !exactMatch

  async function run(fn: () => Promise<void>, id: string | null) {
    setError(null)
    setLoadingId(id)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro na operação')
    } finally {
      setLoadingId(null)
    }
  }

  function handleAdd() {
    if (isPending || !novoNome.trim()) return
    startTransition(() => run(async () => {
      const created = await onCreate(novoNome)
      onItems(items.some(i => i.id === created.id) ? items : [...items, created])
      setNovoNome('')
      setShowAdd(false)
    }, 'new'))
  }

  function handleCreateFromSearch() {
    if (isPending || !canCreate) return
    startTransition(() => run(async () => {
      const created = await onCreate(term)
      onItems(items.some(i => i.id === created.id) ? items : [...items, created])
      setSearch('')
    }, 'new'))
  }

  function handleSaveEdit(id: string) {
    const newName = editNome.trim()
    if (isPending || !newName) return
    startTransition(() => run(async () => {
      const updated = await onRename(id, newName)
      onItems(items.map(i => (i.id === id ? updated : i)))
      setEditingId(null)
      setEditNome('')
    }, id))
  }

  async function handleDelete(id: string) {
    if (isPending) return
    const operation = run(async () => {
      await onDelete(id)
      onItems(items.filter(i => i.id !== id))
    }, id)
    startTransition(async () => { await operation })
    await operation
  }

  return (
    <GlassCard className="catalog-card overflow-hidden">
      <h2 className="sr-only">{title}</h2>
      <div className="flex items-center gap-3 border-b border-gray-200/40 px-4 py-3">
        <div className="min-w-0 flex-1"><SearchInput label="Pesquisar no catálogo" placeholder="Buscar por nome…" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && canCreate && handleCreateFromSearch()} /></div>
        <OperumButton variant="primary" disabled={isPending} onClick={() => setShowAdd(true)} className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium"><span aria-hidden="true">+</span>Novo</OperumButton>
      </div>

      {error && (
        <div role="alert" className="px-4 py-3 text-red-700 text-sm">{error}</div>
      )}

      {showAdd && (
        <div className="px-4 py-3 bg-blue-50/50 border-b border-blue-100 flex items-center gap-3">
          <OperumInput
            type="text"
            autoFocus
            placeholder={placeholder}
            value={novoNome}
            onChange={e => setNovoNome(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <OperumButton variant="default" type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-600 bg-white hover:bg-gray-50">
            Cancelar
          </OperumButton>
          <FormActions as="span" compact><OperumButton variant="primary" type="button" onClick={handleAdd} disabled={!novoNome.trim() || isPending} className="px-4 py-2 text-sm font-medium rounded-xl disabled:opacity-50">
            {loadingId === 'new' ? 'Salvando...' : 'Salvar'}
          </OperumButton></FormActions>
        </div>
      )}

      <div className="catalog-scroll">
      {filtered.length === 0 && !canCreate ? (
        <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhum item encontrado.</div>
      ) : (
        <div className="catalog-items">
          {canCreate && (
            <div className="px-4 py-3 flex items-center justify-between gap-4 bg-blue-50/40">
              <p className="text-sm text-gray-600">
                <span className="text-gray-500">“{term}” não existe ainda.</span>
              </p>
              <OperumButton variant="primary" type="button"
                onClick={handleCreateFromSearch}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {loadingId === 'new' ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Criar “{term}”
                  </>
                )}
              </OperumButton>
            </div>
          )}

          {filtered.map(item => (
            <GlassCard interactive key={item.id} data-selected={selectedId === item.id || undefined} className="catalog-row relative px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              {onSelect && editingId !== item.id && <OperumButton variant="custom" className="catalog-select absolute inset-0 z-0 rounded-[inherit]" aria-label={`Configurar acessos de ${item.name}`} aria-pressed={selectedId === item.id} disabled={isPending} onClick={() => onSelect(item.id)}><span className="sr-only">Configurar acessos de {item.name}</span></OperumButton>}
              {editingId === item.id ? (
                <div className="flex-1 flex items-center gap-3">
                  <OperumInput
                    type="text"
                    autoFocus
                    value={editNome}
                    onChange={e => setEditNome(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSaveEdit(item.id)}
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <OperumButton variant="default" type="button" onClick={() => { setEditingId(null); setEditNome('') }} className="text-xs font-medium text-gray-500 hover:text-gray-700">Cancelar</OperumButton>
                  <FormActions as="span" compact><OperumButton variant="primary" type="button" onClick={() => handleSaveEdit(item.id)} className="px-3 py-1.5 text-xs font-medium rounded-lg">
                    Salvar
                  </OperumButton></FormActions>
                </div>
              ) : (
                <>
                  <div className="pointer-events-none relative min-w-0 flex-1"><p className="font-medium text-sm text-gray-900">{item.name}</p></div>
                  <div className="relative z-10 flex items-center gap-2">
                    <AnimatedEditButton disabled={isPending} onClick={() => { setEditingId(item.id); setEditNome(item.name) }} />
                    <AnimatedTrashButton effect="button" label={`Remover ${item.name}`} onDelete={() => handleDelete(item.id)} disabled={loadingId === item.id || isPending} />
                  </div>
                </>
              )}
            </GlassCard>
          ))}
        </div>
      )}
      </div>
    </GlassCard>
  )
}

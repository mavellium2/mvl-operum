'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import PermissoesFuncoes from '@/components/permissoes/PermissoesFuncoes'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { SECOES_CADASTROS, hrefCadastros, type SecaoCadastros } from '@/lib/cadastrosSecoes'
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

  const [error] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {SECOES_CADASTROS.map(s => (
          <Link
            key={s}
            href={hrefCadastros(s)}
            aria-current={section === s ? 'page' : undefined}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              section === s
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {s === 'departamentos' ? 'Departamentos' : 'Funções'}
          </Link>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
      )}

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
      {section === 'funcoes' && <PermissoesFuncoes key={funcoes.map(f => f.id + f.name).join(',')} />}
    </div>
  )
}

interface Item { id: string; name: string }

function CatalogCrud({
  title, items, placeholder, onCreate, onRename, onDelete, onItems,
}: {
  title: string
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
  const filtered = items.filter(i => i.name.toLowerCase().includes(normalized))
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
    if (!novoNome.trim()) return
    startTransition(() => run(async () => {
      const created = await onCreate(novoNome)
      onItems(items.some(i => i.id === created.id) ? items : [...items, created])
      setNovoNome('')
      setShowAdd(false)
    }, 'new'))
  }

  function handleCreateFromSearch() {
    if (!canCreate) return
    startTransition(() => run(async () => {
      const created = await onCreate(term)
      onItems(items.some(i => i.id === created.id) ? items : [...items, created])
      setSearch('')
    }, 'new'))
  }

  function handleSaveEdit(id: string) {
    const newName = editNome.trim()
    if (!newName) return
    startTransition(() => run(async () => {
      const updated = await onRename(id, newName)
      onItems(items.map(i => (i.id === id ? updated : i)))
      setEditingId(null)
      setEditNome('')
    }, id))
  }

  function handleDelete(id: string) {
    startTransition(() => run(async () => {
      await onDelete(id)
      onItems(items.filter(i => i.id !== id))
    }, id))
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{items.length} cadastrados · só o admin edita; projetos apenas associam</p>
        </div>
        <OperumButton variant="primary" type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center justify-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Novo
        </OperumButton>
      </div>

      <div className="px-6 py-3 border-b border-gray-100">
        <OperumInput
          type="search"
          placeholder="Buscar... (enter cria se não existir)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && canCreate && handleCreateFromSearch()}
          className="w-full max-w-md px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 text-red-700 text-sm">{error}</div>
      )}

      {showAdd && (
        <div className="px-6 py-3 bg-blue-50/50 border-b border-blue-100 flex items-center gap-3">
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
          <FormActions as="span" compact><OperumButton variant="primary" type="button" onClick={handleAdd} disabled={!novoNome.trim() || isPending} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50">
            {loadingId === 'new' ? 'Salvando...' : 'Salvar'}
          </OperumButton></FormActions>
        </div>
      )}

      {filtered.length === 0 && !canCreate ? (
        <div className="px-6 py-12 text-center text-sm text-gray-500">Nenhum item encontrado.</div>
      ) : (
        <div className="divide-y divide-gray-100">
          {canCreate && (
            <div className="px-6 py-3 flex items-center justify-between gap-4 bg-blue-50/40">
              <p className="text-sm text-gray-600">
                <span className="text-gray-500">“{term}” não existe ainda.</span>
              </p>
              <OperumButton variant="primary" type="button"
                onClick={handleCreateFromSearch}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 whitespace-nowrap"
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
            <div key={item.id} className="px-6 py-3 flex items-center justify-between gap-4 hover:bg-gray-50/50">
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
                  <FormActions as="span" compact><OperumButton variant="primary" type="button" onClick={() => handleSaveEdit(item.id)} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Salvar
                  </OperumButton></FormActions>
                </div>
              ) : (
                <>
                  <p className="font-medium text-sm text-gray-900">{item.name}</p>
                  <div className="flex items-center gap-2">
                    <OperumButton variant="custom" type="button"
                      onClick={() => { setEditingId(item.id); setEditNome(item.name) }}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </OperumButton>
                    <OperumButton variant="danger" type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={loadingId === item.id || isPending}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                      title="Remover"
                    >
                      {loadingId === item.id ? (
                        <div className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      )}
                    </OperumButton>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

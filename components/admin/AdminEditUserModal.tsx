'use client'

import Select from '@/components/ui/Select'
import MoedaInput from '@/components/ui/MoedaInput'
import { erroMoeda, formatReais, moedaParaCampo, parseMoeda } from '@/lib/dinheiro'
import { useState, useEffect, useTransition } from 'react'
import { adminUpdateUserAction, setUserRoleAction } from '@/app/actions/admin'
import { getUserProjetosAction, addMemberAction, updateUsuarioProjetoAction } from '@/app/actions/projetos'
import { getProjetosAction } from '@/app/actions/projetos'
import { EmailInput } from '@/components/ui/ContatoInputs'
import { erroEmail } from '@/lib/contato'
import AddressFields, { type AddressValues } from '@/components/ui/AddressFields'
import type { AdminUser } from './AdminCreateUserModal'
import PasswordInput from '@/components/ui/PasswordInput'

interface Props {
  user: AdminUser
  onClose: () => void
  onUpdated: (user: AdminUser) => void
}

interface UserProjeto {
  id: string
  userId: string
  projectId: string
  active: boolean
  cargo: string | null
  departamento: string | null
  hourlyRate: number | null
  startDate: string
  project: { id: string; name: string; status: string }
}

interface Projeto {
  id: string
  name: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  COMPLETED: 'Concluído',
  ARCHIVED: 'Arquivado',
}

export default function AdminEditUserModal({ user, onClose, onUpdated }: Props) {
  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    password: '',
    role: user.role,
  })
  const [address, setAddress] = useState<AddressValues>({
    cep: user.cep ?? '',
    logradouro: user.logradouro ?? '',
    numero: user.numero ?? '',
    complemento: user.complemento ?? '',
    bairro: user.bairro ?? '',
    cidade: user.cidade ?? '',
    estado: user.estado ?? '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Projects
  const [userProjetos, setUserProjetos] = useState<UserProjeto[]>([])
  const [allProjetos, setAllProjetos] = useState<Projeto[]>([])
  const [showAddProject, setShowAddProject] = useState(false)
  const [selectedProjetoId, setSelectedProjetoId] = useState('')
  const [editingProjetoId, setEditingProjetoId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ cargo: '', departamento: '', hourlyRate: '' })

  useEffect(() => {
    getUserProjetosAction(user.id).then(result => {
      setUserProjetos(result as UserProjeto[])
    })
    getProjetosAction().then(result => {
      if (Array.isArray(result)) {
        setAllProjetos(result.map(p => ({ id: p.id, name: p.name })))
      }
    })
  }, [user.id])

  const projetosNaoMembro = allProjetos.filter(p => !userProjetos.some(up => up.projectId === p.id))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim()) {
      setError('Nome e e-mail são obrigatórios.')
      return
    }
    const erroDoEmail = erroEmail(form.email, true)
    if (erroDoEmail) {
      setError(erroDoEmail)
      return
    }
    setLoading(true)

    const updateResult = await adminUpdateUserAction(user.id, {
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password || undefined,
      ...address,
    })

    if ('error' in updateResult) {
      setLoading(false)
      setError(updateResult.error ?? 'Erro desconhecido')
      return
    }

    if (form.role !== user.role) {
      const roleResult = await setUserRoleAction(user.id, form.role)
      if ('error' in roleResult) {
        setLoading(false)
        setError(roleResult.error ?? 'Erro ao alterar role')
        return
      }
    }

    setLoading(false)
    onUpdated({ ...updateResult.user, role: form.role } as AdminUser)
  }

  function handleToggleAtivo(up: UserProjeto) {
    startTransition(async () => {
      const result = await updateUsuarioProjetoAction(user.id, up.projectId, { active: !up.active })
      if (!('error' in result)) {
        setUserProjetos(prev => prev.map(p => p.projectId === up.projectId ? { ...p, active: !up.active } : p))
      }
    })
  }

  function handleStartEdit(up: UserProjeto) {
    setEditingProjetoId(up.projectId)
    setEditForm({
      cargo: up.cargo ?? '',
      departamento: up.departamento ?? '',
      hourlyRate: moedaParaCampo(up.hourlyRate),
    })
  }

  function handleSaveEdit(up: UserProjeto) {
    const erroValor = erroMoeda(editForm.hourlyRate, { rotulo: 'Valor/hora' })
    if (erroValor) {
      setError(erroValor)
      return
    }
    const hourlyRate = parseMoeda(editForm.hourlyRate)
    startTransition(async () => {
      const result = await updateUsuarioProjetoAction(user.id, up.projectId, {
        cargos: editForm.cargo ? [editForm.cargo] : [],
        departamentos: editForm.departamento ? [editForm.departamento] : [],
        hourlyRate,
      })
      if (!('error' in result)) {
        setUserProjetos(prev => prev.map(p => p.projectId === up.projectId ? {
          ...p,
          cargo: editForm.cargo || null,
          departamento: editForm.departamento || null,
          hourlyRate,
        } : p))
        setEditingProjetoId(null)
      }
    })
  }

  function handleAddProject() {
    if (!selectedProjetoId) return
    startTransition(async () => {
      const result = await addMemberAction(selectedProjetoId, user.id)
      if (!('error' in result)) {
        const novoProjeto = allProjetos.find(p => p.id === selectedProjetoId)
        if (novoProjeto) {
          const newUp: UserProjeto = {
            id: '',
            userId: user.id,
            projectId: selectedProjetoId,
            active: true,
            cargo: null,
            departamento: null,
            hourlyRate: null,
            startDate: new Date().toISOString(),
            project: { id: novoProjeto.id, name: novoProjeto.name, status: 'ACTIVE' },
          }
          setUserProjetos(prev => [...prev, newUp])
        }
        setSelectedProjetoId('')
        setShowAddProject(false)
      }
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <h2 className="text-lg font-bold text-gray-900 px-6 pt-6 pb-2 shrink-0">Editar Usuário</h2>
        <div className="overflow-y-auto flex-1 min-h-0 px-6">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Field label="Nome *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">E-mail *</label>
              <EmailInput
                value={form.email}
                onValueChange={v => setForm(f => ({ ...f, email: v }))}
                required
                aria-label="E-mail"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Field label="Nova senha (deixe em branco para manter)" type="password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} />
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Role global</label>
              <Select
                ariaLabel="Role global"
                searchable={false}
                value={form.role}
                onChange={v => setForm(f => ({ ...f, role: v }))}
                options={[{ value: 'member', label: 'Membro' }, { value: 'admin', label: 'Administrador' }]}
              />
            </div>

            <div className="pt-1 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide my-2">Endereço</p>
              <AddressFields
                values={address}
                onChange={(field, value) => setAddress(a => ({ ...a, [field]: value }))}
              />
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm">
                Cancelar
              </button>
              <button type="submit" disabled={loading} className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
                {loading ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>

          {/* Projects section */}
          <div className="border-t border-gray-100 -mx-6 px-6 pb-6">
          <div className="flex items-center justify-between py-4">
            <h3 className="text-sm font-semibold text-gray-900">
              Projetos ({userProjetos.filter(p => p.active).length} active{userProjetos.filter(p => p.active).length !== 1 ? 's' : ''})
            </h3>
            <button
              onClick={() => setShowAddProject(v => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              + Adicionar a projeto
            </button>
          </div>

          {showAddProject && (
            <div className="mb-3 flex gap-2">
              <Select
                ariaLabel="Projeto"
                className="flex-1"
                value={selectedProjetoId}
                onChange={setSelectedProjetoId}
                placeholder="Selecionar projeto…"
                options={projetosNaoMembro.map(p => ({ value: p.id, label: p.name }))}
              />
              <button
                onClick={handleAddProject}
                disabled={!selectedProjetoId || isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Adicionar
              </button>
            </div>
          )}

          {userProjetos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">Não está em nenhum projeto</p>
          ) : (
            <div className="space-y-2">
              {userProjetos.map(up => (
                <div key={up.projectId} className={`rounded-xl border p-3 ${up.active ? 'border-gray-100' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${up.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                        {up.active ? 'Ativo' : 'Inactive'}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">{up.project.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {up.active && editingProjetoId !== up.projectId && (
                        <button
                          onClick={() => handleStartEdit(up)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Editar
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleAtivo(up)}
                        disabled={isPending}
                        className={`text-xs px-2 py-1 rounded-lg border disabled:opacity-50 ${up.active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                      >
                        {up.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingProjetoId === up.projectId && (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Cargo</label>
                          <input
                            type="text"
                            value={editForm.cargo}
                            onChange={e => setEditForm(f => ({ ...f, cargo: e.target.value }))}
                            placeholder="Ex: Dev Backend"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Departamento</label>
                          <input
                            type="text"
                            value={editForm.departamento}
                            onChange={e => setEditForm(f => ({ ...f, departamento: e.target.value }))}
                            placeholder="Ex: Tecnologia"
                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Valor/hora (R$)</label>
                        <MoedaInput
                          comSimbolo
                          rotulo="Valor/hora"
                          value={editForm.hourlyRate}
                          onValueChange={texto => setEditForm(f => ({ ...f, hourlyRate: texto }))}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingProjetoId(null)}
                          className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(up)}
                          disabled={isPending}
                          className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isPending ? '…' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Show current values when not editing */}
                  {editingProjetoId !== up.projectId && (up.cargo || up.departamento || up.hourlyRate) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {up.cargo && <span className="text-xs text-gray-500">{up.cargo}</span>}
                      {up.departamento && <span className="text-xs text-gray-400">{up.departamento}</span>}
                      {up.hourlyRate && <span className="text-xs text-gray-400">{formatReais(up.hourlyRate)}/h</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {type === 'password' ? (
        <PasswordInput
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label={label}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  )
}

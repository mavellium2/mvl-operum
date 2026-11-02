'use client'

import FormActions from '@/components/ui/FormActions'
import GlassCard from '@/components/ui/GlassCard'
import AnimatedEditButton from '@/components/ui/AnimatedEditButton'
import { Save, FolderKanban, Plus, X } from 'lucide-react'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import Select from '@/components/ui/Select'
import MoedaInput from '@/components/ui/MoedaInput'
import { erroMoeda, formatReais, moedaParaCampo, parseMoeda } from '@/lib/dinheiro'
import { useState, useEffect, useTransition, useId } from 'react'
import { adminUpdateUserAction, setUserRoleAction } from '@/app/actions/admin'
import { getUserProjetosAction, addMemberAction, updateUsuarioProjetoAction } from '@/app/actions/projetos'
import { getDepartmentsAction } from '@/app/actions/departments'
import { getRolesAction } from '@/app/actions/roles'
import { parseHoras, formatHoras } from '@/lib/validation/horas'
import { updateProjetoMemberAction } from '@/app/actions/projetos'
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
  remuneracao?: number | null
  horasDiarias?: number | null
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
  const formId = useId()
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
  const [editForm, setEditForm] = useState({ cargo: '', departamento: '', remuneracao: '', horasDiarias: '' })

  const [cargos, setCargos] = useState<string[]>([])
  const [departamentos, setDepartamentos] = useState<string[]>([])
  useEffect(() => {
    getRolesAction('TENANT').then(items => setCargos(items.map(item => String(item.name))))
    getDepartmentsAction().then(items => { if (Array.isArray(items)) setDepartamentos(items.map(item => item.name)) })
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
      remuneracao: moedaParaCampo(up.remuneracao),
      horasDiarias: up.horasDiarias ? formatHoras(up.horasDiarias) : '',
    })
  }

  function handleSaveEdit(up: UserProjeto) {
    const horas = parseHoras(editForm.horasDiarias)
    const erroValor = erroMoeda(editForm.remuneracao, { rotulo: 'Salário mensal' })
    if (erroValor || horas.erro || !editForm.remuneracao.trim() || !horas.valor) { setError(erroValor ?? horas.erro ?? 'Informe o salário mensal e as horas trabalhadas por dia.'); return }
    const remuneracao = parseMoeda(editForm.remuneracao) ?? 0
    const horasDiarias = horas.valor
    const hourlyRate = remuneracao / 30 / horasDiarias
    startTransition(async () => {
      const result = await updateProjetoMemberAction(user.id, up.projectId, {
        cargos: editForm.cargo ? [editForm.cargo] : [],
        departamento: editForm.departamento ? [editForm.departamento] : [],
        remuneracao, horasDiarias,
      })
      if (!('error' in result)) {
        setUserProjetos(prev => prev.map(p => p.projectId === up.projectId ? {
          ...p,
          cargo: editForm.cargo || null,
          departamento: editForm.departamento || null,
          hourlyRate, remuneracao, horasDiarias,
        } : p))
        setEditingProjetoId(null)
        setError('')
      } else setError(result.error ?? 'Não foi possível salvar o vínculo.')
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
    <div className="admin-user-editor">
        <div className="admin-user-editor-body px-6">
          <form id={formId} onSubmit={handleSubmit} className="space-y-3">
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
            <details className="admin-user-disclosure"><summary>Alterar senha</summary><div className="pt-3"><Field label="Nova senha" type="password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} /></div></details>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Acesso à instituição</label>
              <Select
                ariaLabel="Acesso à instituição"
                searchable={false}
                value={form.role}
                onChange={v => setForm(f => ({ ...f, role: v }))}
                options={[{ value: 'member', label: 'Membro' }, { value: 'admin', label: 'Administrador' }]}
              />
            </div>

            <details className="admin-user-disclosure">
              <summary>Endereço</summary><div className="pt-3">
              <AddressFields
                values={address}
                onChange={(field, value) => setAddress(a => ({ ...a, [field]: value }))}
              /></div>
            </details>

            {error && <p className="text-sm text-red-500">{error}</p>}

          </form>

          {/* Projects section */}
          <div className="admin-user-projects">
          <div className="user-projects-heading">
            <h3><FolderKanban size={16} aria-hidden="true" />Projetos <span className="user-projects-count" aria-label={`${userProjetos.filter(p => p.active).length} vínculos ativos`}>{userProjetos.filter(p => p.active).length}</span></h3>
            <OperumButton variant="default" type="button"
              onClick={() => setShowAddProject(v => !v)}
              className="user-project-link-button" aria-expanded={showAddProject}
            >
              {showAddProject ? <X size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}{showAddProject ? 'Fechar' : 'Vincular'}
            </OperumButton>
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
              <OperumButton variant="primary" type="button"
                onClick={handleAddProject}
                disabled={!selectedProjetoId || isPending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Adicionar
              </OperumButton>
            </div>
          )}

          {userProjetos.length === 0 ? (
            <p className="user-projects-empty">Nenhum projeto vinculado</p>
          ) : (
            <div className="space-y-2">
              {userProjetos.map(up => (
                <GlassCard as="article" key={up.projectId} data-inactive={!up.active || undefined} className="user-project-membership">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${up.active ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>
                        {up.active ? 'Ativo' : 'Inativo'}
                      </span>
                      <span className="text-sm font-medium text-gray-900 truncate">{up.project.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {up.active && editingProjetoId !== up.projectId && (
                        <AnimatedEditButton label={`Editar vínculo com ${up.project.name}`} onClick={() => handleStartEdit(up)} />
                      )}
                      <OperumButton variant="danger" type="button"
                        onClick={() => handleToggleAtivo(up)}
                        disabled={isPending}
                        className={`text-xs px-2 py-1 rounded-lg border disabled:opacity-50 ${up.active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                      >
                        {up.active ? 'Desativar' : 'Ativar'}
                      </OperumButton>
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingProjetoId === up.projectId && (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Cargo</label>
                          <Select ariaLabel="Cargo no projeto" value={editForm.cargo} onChange={cargo => setEditForm(form => ({ ...form, cargo }))} options={[...new Set([...cargos, editForm.cargo].filter(Boolean))].map(name => ({ value: name, label: name }))} placeholder="Selecionar cargo" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Departamento</label>
                          <Select ariaLabel="Departamento no projeto" value={editForm.departamento} onChange={departamento => setEditForm(form => ({ ...form, departamento }))} options={[...new Set([...departamentos, editForm.departamento].filter(Boolean))].map(name => ({ value: name, label: name }))} placeholder="Selecionar departamento" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2"><div><label className="mb-1 block text-xs text-gray-500">Salário mensal</label><MoedaInput comSimbolo rotulo="Salário mensal" value={editForm.remuneracao} onValueChange={remuneracao => setEditForm(form => ({ ...form, remuneracao }))} /></div><div><label className="mb-1 block text-xs text-gray-500" htmlFor={`${formId}-horas`}>Horas por dia</label><OperumInput id={`${formId}-horas`} value={editForm.horasDiarias} placeholder="Ex.: 8 ou 8:30" onChange={event => setEditForm(form => ({ ...form, horasDiarias: event.target.value }))} className="w-full rounded-xl px-3 py-2 text-sm" /></div></div>
                      {(() => {
                        const salario = parseMoeda(editForm.remuneracao)
                        const horas = parseHoras(editForm.horasDiarias)
                        const valid = salario != null && !erroMoeda(editForm.remuneracao) && horas.valor && !horas.erro
                        const dia = valid ? salario! / 30 : null
                        const hora = dia != null ? dia / horas.valor! : null
                        return <div><div className="user-salary-preview">{[['Por dia', dia], ['Por hora', hora], ['Por minuto', hora != null ? hora / 60 : null]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{value != null ? formatReais(Number(value)) : '—'}</strong></div>)}</div><p className="mt-2 text-[10px] text-gray-500">Base de cálculo: salário mensal ÷ 30 dias; hora conforme a jornada informada.</p></div>
                      })()}
                      <FormActions className="flex gap-2 pt-1">
                        <OperumButton variant="default"
                          type="button"
                          onClick={() => setEditingProjetoId(null)}
                          className="flex-1 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
                        >
                          Cancelar
                        </OperumButton>
                        <OperumButton variant="primary"
                          type="button"
                          onClick={() => handleSaveEdit(up)}
                          disabled={isPending}
                          className="flex-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {isPending ? '…' : 'Salvar'}
                        </OperumButton>
                      </FormActions>
                    </div>
                  )}

                  {/* Show current values when not editing */}
                  {editingProjetoId !== up.projectId && (up.cargo || up.departamento || up.hourlyRate) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                      {up.cargo && <span className="text-xs text-gray-500">{up.cargo}</span>}
                      {up.departamento && <span className="text-xs text-gray-400">{up.departamento}</span>}
                      {up.remuneracao != null && <span className="text-xs text-gray-400">Salário: {formatReais(up.remuneracao)}/mês</span>}
                    </div>
                  )}
                </GlassCard>
              ))}
            </div>
          )}
          </div>
        </div>
            <FormActions className="admin-user-editor-actions flex gap-2">
              <OperumButton variant="default" type="button" onClick={onClose} className="admin-user-cancel">
                Cancelar
              </OperumButton>
              <OperumButton variant="primary" type="submit" form={formId} disabled={loading} className="admin-user-save">
                <Save size={16} aria-hidden="true" />{loading ? 'Salvando…' : 'Salvar alterações'}
              </OperumButton>
            </FormActions>
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
        <OperumInput
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
    </div>
  )
}

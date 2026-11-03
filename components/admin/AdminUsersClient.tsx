'use client'

import OperumButton from '@/components/ui/GlassButton'
import SearchInput from '@/components/ui/SearchInput'
import GlassCard from '@/components/ui/GlassCard'
import GlassPopover from '@/components/ui/GlassPopover'
import FormActions from '@/components/ui/FormActions'
import AnimatedEditButton from '@/components/ui/AnimatedEditButton'
import { Plus, SlidersHorizontal, ShieldCheck, Power } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { matchesSearch } from '@/lib/search'
import Select from '@/components/ui/Select'
import { formatReais } from '@/lib/dinheiro'
import DetailPanel from '@/components/ui/DetailPanel'
import PermissoesUsuario from '@/components/permissoes/PermissoesUsuario'

import { useMemo, useRef, useState } from 'react'
import UserAvatar from '@/components/user/UserAvatar'
import AdminCreateUserModal, { type AdminUser } from './AdminCreateUserModal'
import AdminEditUserModal from './AdminEditUserModal'
import { toggleUserActiveAction } from '@/app/actions/admin'


interface Props {
  initialUsers: AdminUser[]
}

const ROLE_LABELS: Record<string, { label: string; cls: string }> = {
  admin:   { label: 'Admin',   cls: 'bg-purple-100 text-purple-700' },
  gerente: { label: 'Gerente', cls: 'bg-blue-100 text-blue-700' },
  member:  { label: 'Membro',  cls: 'bg-gray-100 text-gray-600' },
}

export default function AdminUsersClient({ initialUsers }: Props) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers)
  const [permissoesUser, setPermissoesUser] = useState<AdminUser | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const { toast } = useToast()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterAnchor = useRef<HTMLButtonElement>(null)
  const [draftRole, setDraftRole] = useState('')
  const [draftStatus, setDraftStatus] = useState('')
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (search) {
        if (!matchesSearch(`${u.name} ${u.email} ${u.cargo ?? ''} ${u.departamento ?? ''}`, search)) return false
      }
      if (filterRole && u.role !== filterRole) return false
      if (filterStatus === 'active' && !u.isActive) return false
      if (filterStatus === 'inactive' && u.isActive) return false
      return true
    }).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'pt-BR'))
  }, [users, search, filterRole, filterStatus])

  function handleCreated(user: AdminUser) {
    setUsers(prev => [...prev, user])
    setShowCreate(false)
  }

  function handleUpdated(user: AdminUser) {
    setUsers(prev => prev.map(u => (u.id === user.id ? user : u)))
    setEditUser(null)
  }

  async function handleToggleActive(user: AdminUser) {
    if (loading) return
    setLoading(user.id + '-active')
    try {
      const result = await toggleUserActiveAction(user.id, !user.isActive)
      if ('error' in result) { toast(result.error || 'Não foi possível alterar o usuário', 'error'); return }
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)))
      toast(user.isActive ? 'Usuário inativado' : 'Usuário ativado', 'success')
    } catch { toast('Não foi possível alterar o usuário. Tente novamente.', 'error') }
    finally { setLoading(null) }
  }

  const roleInfo = (role: string) => ROLE_LABELS[role] ?? ROLE_LABELS.member


  return (
    <>
      <div className="admin-users-top">
      <div className="admin-users-heading"><div><h1>Usuários <span>{filtered.length}</span></h1></div><OperumButton variant="primary" onClick={() => setShowCreate(true)}><Plus size={16} aria-hidden="true" />Novo usuário</OperumButton></div>
      <div className="admin-users-toolbar"><div className="min-w-0 flex-1"><SearchInput label="Pesquisar usuários" placeholder="Pesquisar por nome, e-mail ou departamento…" value={search} onChange={event => setSearch(event.target.value)} /></div><OperumButton ref={filterAnchor} variant="default" aria-label="Filtros dos usuários" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => { setDraftRole(filterRole); setDraftStatus(filterStatus); setFiltersOpen(value => !value) }}><SlidersHorizontal size={17} aria-hidden="true" />{(filterRole || filterStatus) && <span className="admin-users-filter-dot" />}</OperumButton></div>
      </div>
      <GlassPopover open={filtersOpen} onClose={() => setFiltersOpen(false)} anchor={filterAnchor} label="Filtrar usuários"><form onSubmit={event => { event.preventDefault(); setFilterRole(draftRole); setFilterStatus(draftStatus); setFiltersOpen(false) }}><h2 className="mb-4 text-sm font-semibold">Filtrar usuários</h2><div className="space-y-4"><Select ariaLabel="Filtrar por papel" searchable={false} value={draftRole} onChange={setDraftRole} placeholder="Todos os papéis" options={[{ value: '', label: 'Todos os papéis' }, { value: 'admin', label: 'Administrador' }, { value: 'gerente', label: 'Gerente' }, { value: 'member', label: 'Membro' }]} /><Select ariaLabel="Filtrar por status" searchable={false} value={draftStatus} onChange={setDraftStatus} placeholder="Todas as situações" options={[{ value: '', label: 'Todas as situações' }, { value: 'active', label: 'Ativos' }, { value: 'inactive', label: 'Inativos' }]} /></div><FormActions surface="none" className="mt-5 flex justify-end gap-2"><OperumButton onClick={() => { setFilterRole(''); setFilterStatus(''); setDraftRole(''); setDraftStatus(''); setFiltersOpen(false) }}>Limpar</OperumButton><OperumButton variant="primary" type="submit">Aplicar</OperumButton></FormActions></form></GlassPopover>

      <div className="admin-users-workspace" data-panel={Boolean(editUser || permissoesUser) || undefined}>
      <GlassCard className="admin-users-table-surface">
        <table className="admin-users-table w-full text-sm">
          <thead>
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3">Usuário</th>
              <th className="text-left text-xs font-medium text-gray-500 px-4 py-3 hidden md:table-cell">Cargo / Depto</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3 hidden lg:table-cell">R$/h</th>
              <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Status</th>
              <th className="text-center text-xs font-medium text-gray-500 px-4 py-3">Papel</th>
              <th className="text-right text-xs font-medium text-gray-500 px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum usuário encontrado. Tente outro nome ou ajuste os filtros.
                </td>
              </tr>
            )}
            {filtered.map(user => {
              const ri = roleInfo(user.role)
              return (
                <tr key={user.id} data-selected={editUser?.id === user.id || permissoesUser?.id === user.id || undefined} data-inactive={!user.isActive || undefined} className="admin-user-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
                      <div>
                        <p className="font-medium text-gray-900 leading-tight">{user.name}</p>
                        <p className="text-xs text-gray-400">{user.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-gray-700">{user.cargo ?? '—'}</p>
                    {user.departamento && <p className="text-xs text-gray-400">{user.departamento}</p>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600 hidden lg:table-cell">
                    {user.hourlyRate > 0 ? formatReais(user.hourlyRate) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {user.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ri.cls}`}>
                      {ri.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <OperumButton variant="icon" title="Permissões" aria-label={`Permissões de ${user.name}`} onClick={() => { setEditUser(null); setPermissoesUser(user) }}><ShieldCheck size={16} aria-hidden="true" /></OperumButton>
                      <AnimatedEditButton label={`Editar ${user.name}`} onClick={() => { setPermissoesUser(null); setEditUser(user) }} />
                      <OperumButton variant={user.isActive ? 'ghost' : 'primary'} aria-label={`${user.isActive ? 'Inativar' : 'Ativar'} ${user.name}`} title={user.isActive ? 'Inativar usuário' : 'Ativar usuário'} onClick={() => handleToggleActive(user)} disabled={loading !== null} className="admin-user-toggle"><Power size={15} aria-hidden="true" /><span>{loading === user.id + '-active' ? 'Aguarde…' : user.isActive ? 'Inativar' : 'Ativar'}</span></OperumButton>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </GlassCard>

      {(permissoesUser || editUser) && <DetailPanel key={`${editUser ? 'edit' : 'permissions'}:${(editUser ?? permissoesUser)!.id}`} title={`${editUser ? 'Editar' : 'Permissões de'} ${(editUser ?? permissoesUser)!.name}`} onClose={() => { setEditUser(null); setPermissoesUser(null) }} className={`admin-user-detail ${editUser ? 'admin-user-detail--editing' : ''}`}>
        {editUser ? <AdminEditUserModal user={editUser} onClose={() => setEditUser(null)} onUpdated={handleUpdated} /> : <div className="admin-user-permissions"><PermissoesUsuario userId={permissoesUser!.id} projectId={null} /></div>}
      </DetailPanel>}
      </div>
      {showCreate && <AdminCreateUserModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </>
  )
}

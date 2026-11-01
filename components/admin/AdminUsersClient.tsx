'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import Select from '@/components/ui/Select'
import { formatReais } from '@/lib/dinheiro'
import Modal from '@/components/ui/Modal'
import PermissoesUsuario from '@/components/permissoes/PermissoesUsuario'

import { useMemo, useState } from 'react'
import UserAvatar from '@/components/user/UserAvatar'
import AdminCreateUserModal, { type AdminUser } from './AdminCreateUserModal'
import AdminEditUserModal from './AdminEditUserModal'
import { toggleUserActiveAction } from '@/app/actions/admin'
import { useFocusOnMount } from '@/hooks/useFocusOnMount'

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
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (search) {
        const q = search.toLowerCase()
        if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
      }
      if (filterRole && u.role !== filterRole) return false
      if (filterStatus === 'active' && !u.isActive) return false
      if (filterStatus === 'inactive' && u.isActive) return false
      return true
    })
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
    setLoading(user.id + '-active')
    const result = await toggleUserActiveAction(user.id, !user.isActive)
    setLoading(null)
    if ('error' in result) return
    setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, isActive: !u.isActive } : u)))
  }

  const roleInfo = (role: string) => ROLE_LABELS[role] ?? ROLE_LABELS.member
  const searchRef = useFocusOnMount<HTMLInputElement>()

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <OperumInput
          ref={searchRef}
          type="search"
          placeholder="Buscar por nome ou email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Select
          ariaLabel="Filtrar por papel"
          className="sm:w-48"
          searchable={false}
          value={filterRole}
          onChange={setFilterRole}
          placeholder="Todos os papéis"
          options={[{ value: '', label: 'Todos os papéis' }, { value: 'admin', label: 'Admin' }, { value: 'member', label: 'Membro' }]}
        />
        <Select
          ariaLabel="Filtrar por status"
          className="sm:w-48"
          searchable={false}
          value={filterStatus}
          onChange={setFilterStatus}
          placeholder="Todos os status"
          options={[{ value: '', label: 'Todos os status' }, { value: 'active', label: 'Ativo' }, { value: 'inactive', label: 'Inativo' }]}
        />
        <OperumButton variant="primary" type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 whitespace-nowrap"
        >
          + Novo usuário
        </OperumButton>
      </div>

      <p className="text-sm text-gray-500 mb-3">
        {filtered.length} usuário{filtered.length !== 1 ? 's' : ''}
        {search || filterRole || filterStatus ? ' (filtrado)' : ''}
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
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
                  Nenhum usuário encontrado
                </td>
              </tr>
            )}
            {filtered.map(user => {
              const ri = roleInfo(user.role)
              return (
                <tr key={user.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
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
                      {user.isActive ? 'Ativo' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ri.cls}`}>
                      {ri.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <OperumButton variant="default" type="button" onClick={() => setPermissoesUser(user)} className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-blue-700">Permissões</OperumButton>
                      <OperumButton variant="default" type="button"
                        onClick={() => setEditUser(user)}
                        className="px-2.5 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                      >
                        Editar
                      </OperumButton>
                      <OperumButton variant="default" type="button"
                        onClick={() => handleToggleActive(user)}
                        disabled={loading === user.id + '-active'}
                        className={`px-2.5 py-1 text-xs rounded-lg border text-gray-600 hover:bg-gray-50 disabled:opacity-50 ${user.isActive ? 'border-gray-200' : 'border-green-200 text-green-700 hover:bg-green-50'}`}
                      >
                        {user.isActive ? 'Inativar' : 'Ativar'}
                      </OperumButton>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {permissoesUser && <Modal isOpen onClose={() => setPermissoesUser(null)} title={`Permissões — ${permissoesUser.name}`} maxWidth="max-w-3xl"><PermissoesUsuario key={permissoesUser.id} userId={permissoesUser.id} projectId={null} /></Modal>}
      {showCreate && (
        <AdminCreateUserModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
      {editUser && (
        <AdminEditUserModal user={editUser} onClose={() => setEditUser(null)} onUpdated={handleUpdated} />
      )}
    </>
  )
}

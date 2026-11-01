'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useState } from 'react'
import { adminCreateUserAction } from '@/app/actions/admin'
import { EmailInput } from '@/components/ui/ContatoInputs'
import { erroEmail } from '@/lib/contato'
import AddressFields, { type AddressValues, emptyAddress } from '@/components/ui/AddressFields'
import PasswordInput from '@/components/ui/PasswordInput'

interface Props {
  onClose: () => void
  onCreated: (user: AdminUser) => void
}

export interface AdminUser {
  id: string
  name: string
  email: string
  cargo: string | null
  departamento: string | null
  hourlyRate: number
  role: string
  isActive: boolean
  avatarUrl: string | null
  phone?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  notes?: string | null
}

export default function AdminCreateUserModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    isAdmin: false,
    forcePasswordChange: false,
  })
  const [address, setAddress] = useState<AddressValues>(emptyAddress)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Nome, e-mail e senha são obrigatórios.')
      return
    }
    const erroDoEmail = erroEmail(form.email, true)
    if (erroDoEmail) {
      setError(erroDoEmail)
      return
    }
    if (form.password.length < 8) {
      setError('A senha deve ter no mínimo 8 caracteres.')
      return
    }
    setLoading(true)
    const result = await adminCreateUserAction({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      isAdmin: form.isAdmin,
      forcePasswordChange: form.forcePasswordChange,
      ...address,
    })
    setLoading(false)
    if ('error' in result) {
      setError(result.error ?? 'Erro desconhecido')
      return
    }
    // Não mantém a senha em memória além do necessário para o submit.
    setForm(f => ({ ...f, password: '' }))
    onCreated(result.user as AdminUser)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Novo Usuário</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <OperumInput
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">E-mail *</label>
            <EmailInput
              value={form.email}
              onValueChange={v => setForm(f => ({ ...f, email: v }))}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Senha *</label>
            <PasswordInput
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide my-2">Endereço</p>
            <AddressFields
              values={address}
              onChange={(field, value) => setAddress(a => ({ ...a, [field]: value }))}
            />
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.isAdmin}
                onChange={e => setForm(f => ({ ...f, isAdmin: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                Administrador global
              </span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={form.forcePasswordChange}
                onChange={e => setForm(f => ({ ...f, forcePasswordChange: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                Obrigar troca de senha no próximo login
              </span>
            </label>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-2 pt-2">
            <OperumButton variant="default" type="button" onClick={onClose} className="flex-1 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm">
              Cancelar
            </OperumButton>
            <OperumButton variant="primary" type="submit" disabled={loading} className="flex-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60">
              {loading ? 'Criando…' : 'Criar'}
            </OperumButton>
          </div>
        </form>
      </div>
    </div>
  )
}

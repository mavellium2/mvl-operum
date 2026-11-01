'use client'

import FormActions, { FormBody } from '@/components/ui/FormActions'
import { Input as OperumInput, Textarea as OperumTextarea } from '@/components/ui/Field'
import { useState, useActionState } from 'react'
import { updateProfileAction, type ProfileActionState } from '@/app/actions/profile'
import AvatarUpload from '@/components/profile/AvatarUpload'
import AddressFields, { type AddressValues } from '@/components/ui/AddressFields'
import GlassButton from '@/components/ui/GlassButton'
import { EmailInput, TelefoneInput } from '@/components/ui/ContatoInputs'

interface ProfileFormProps {
  name: string
  email: string
  phone?: string | null
  cep?: string | null
  logradouro?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  notes?: string | null
  avatarUrl?: string | null
}

export default function ProfileForm({ name, email, phone, cep, logradouro, numero, complemento, bairro, cidade, estado, notes, avatarUrl: initialAvatarUrl }: ProfileFormProps) {
  const [state, action, isPending] = useActionState(updateProfileAction, {} as ProfileActionState)
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '')
  const [address, setAddress] = useState<AddressValues>({
    cep: cep ?? '',
    logradouro: logradouro ?? '',
    numero: numero ?? '',
    complemento: complemento ?? '',
    bairro: bairro ?? '',
    cidade: cidade ?? '',
    estado: estado ?? '',
  })

  return (
    <form action={action} className="settings-profile-form settings-profile-compact form-layout">
      <FormBody className="space-y-5">
      <div className="flex items-center gap-5 border-b border-gray-200/60 pb-5">
        <AvatarUpload name={name} avatarUrl={avatarUrl} onChange={setAvatarUrl} disabled={isPending} />
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold tracking-tight text-gray-900">{name}</h2>
          <p className="mt-1 break-all text-sm text-gray-500">{email}</p>
          <p className="mt-2 text-xs text-gray-500">Clique na foto para visualizar ou alterar.</p>
        </div>
      </div>
      <input type="hidden" name="avatarUrl" value={avatarUrl} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
          <OperumInput
            id="name"
            name="name"
            defaultValue={name}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <EmailInput
            id="email"
            name="email"
            defaultValue={email}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
          <TelefoneInput
            id="phone"
            name="phone"
            defaultValue={phone ?? ''}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Endereço — campos hidden sincronizados com AddressFields controlado */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Endereço</h3>
          {/* Inputs ocultos que carregam o estado para o FormData ao submeter */}
          {(Object.keys(address) as (keyof AddressValues)[]).map(field => (
            <input key={field} type="hidden" name={field} value={address[field]} />
          ))}
          <AddressFields compact
            values={address}
            onChange={(field, value) => setAddress(prev => ({ ...prev, [field]: value }))}
          />
        </div>

        <div>
          <label htmlFor="notes" className="mb-3 block text-sm font-semibold text-gray-700">Observações</label>
          <OperumTextarea
            id="notes"
            name="notes"
            defaultValue={notes ?? ''}
            rows={5}
            placeholder="Informações adicionais..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

      </div>

      </FormBody>
      <FormActions surface="none" className="flex flex-wrap items-center justify-end gap-3">
        {'error' in state && state.error && (
          <p className="text-sm text-red-600">{state.error as string}</p>
        )}
        {'message' in state && state.message && (
          <p className="text-sm text-green-600">{state.message as string}</p>
        )}

        <GlassButton type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Salvar alterações'}
        </GlassButton>
      </FormActions>
    </form>
  )
}

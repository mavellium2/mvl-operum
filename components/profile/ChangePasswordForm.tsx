'use client'

import { useActionState } from 'react'
import { changePasswordAction, type ProfileActionState } from '@/app/actions/profile'
import GlassButton from '@/components/ui/GlassButton'
import PasswordInput from '@/components/ui/PasswordInput'

export default function ChangePasswordForm() {
  const [state, action, isPending] = useActionState(changePasswordAction, {} as ProfileActionState)

  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="senhaAtual" className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
        <PasswordInput
          id="senhaAtual"
          name="senhaAtual"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="novaSenha" className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
        <PasswordInput
          id="novaSenha"
          name="novaSenha"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label htmlFor="confirmacao" className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
        <PasswordInput
          id="confirmacao"
          name="confirmacao"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {'error' in state && state.error && (
        <p className="text-sm text-red-600">{state.error as string}</p>
      )}
      {'message' in state && state.message && (
        <p className="text-sm text-green-600">{state.message as string}</p>
      )}

      <GlassButton type="submit" variant="primary" disabled={isPending}>
        {isPending ? 'Alterando...' : 'Alterar senha'}
      </GlassButton>
    </form>
  )
}

'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { useActionState, useState } from 'react'
import { alterarSenhaObrigatoriaAction } from '@/app/actions/alterarSenha'
import { PasswordCriteria } from '@/components/auth/PasswordCriteria'
import PasswordInput from '@/components/ui/PasswordInput'

export default function AlterarSenhaPage() {
  const [state, action, pending] = useActionState(alterarSenhaObrigatoriaAction, undefined)
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmacao, setConfirmacao] = useState('')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-sm p-8">
        <div className="mb-6 text-center">
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Redefinir senha</h1>
          <p className="text-sm text-gray-500 mt-1">
            O administrador solicitou que você defina uma nova senha antes de continuar.
          </p>
        </div>

        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="novaSenha" className="block text-sm font-medium text-gray-700 mb-1">
              Nova senha
            </label>
            <PasswordInput
              id="novaSenha"
              name="novaSenha"
              required
              minLength={8}
              autoFocus
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres, 1 número e 1 caractere especial"
              value={novaSenha}
              onChange={e => setNovaSenha(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <PasswordCriteria value={novaSenha} confirm={confirmacao} />
          </div>
          <div>
            <label htmlFor="confirmacao" className="block text-sm font-medium text-gray-700 mb-1">
              Confirmar senha
            </label>
            <PasswordInput
              id="confirmacao"
              name="confirmacao"
              required
              autoComplete="new-password"
              placeholder="Repita a nova senha"
              value={confirmacao}
              onChange={e => setConfirmacao(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {(state as { error?: string } | undefined)?.error && (
            <p className="text-sm text-red-600">{(state as { error?: string }).error}</p>
          )}
          <FormActions as="span" compact><OperumButton variant="primary"
            type="submit"
            disabled={pending}
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? 'Salvando…' : 'Definir nova senha'}
          </OperumButton></FormActions>
        </form>
      </div>
    </div>
  )
}

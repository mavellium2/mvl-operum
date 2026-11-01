'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { EmailInput } from '@/components/ui/ContatoInputs'
import { useActionState } from 'react'
import Link from 'next/link'
import { signupAction } from '@/app/actions/auth'
import PasswordInput from '@/components/ui/PasswordInput'

export function RegisterForm() {
  const [state, action, pending] = useActionState(signupAction, undefined)

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-gray-700">
          Nome
        </label>
        <OperumInput
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {state?.errors?.name && <p className="text-xs text-red-600">{state.errors.name}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-gray-700">
          Email
        </label>
        <EmailInput
          id="email"
          name="email"
          required
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {state?.errors?.email && <p className="text-xs text-red-600">{state.errors.email}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-gray-700">
          Senha
        </label>
        <PasswordInput
          id="password"
          name="password"
          required
          autoComplete="new-password"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-500">Mínimo 8 caracteres, com número e caractere especial</p>
        {state?.errors?.password && <p className="text-xs text-red-600">{state.errors.password}</p>}
      </div>

      {state?.message && (
        <p className="text-sm text-red-600">{state.message}</p>
      )}

      <OperumButton variant="primary"
        type="submit"
        disabled={pending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? 'Criando conta...' : 'Criar conta'}
      </OperumButton>

      <p className="text-center text-sm text-gray-600">
        Já tem conta?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          Entrar
        </Link>
      </p>
    </form>
  )
}

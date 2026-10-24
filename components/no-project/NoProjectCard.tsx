'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import UserAvatar from '@/components/user/UserAvatar'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { checkProjectAccessAction, logoutAction } from '@/app/actions/auth'

interface NoProjectCardProps {
  name: string
  email: string
  avatarUrl: string | null
  cargo: string | null
  departamento: string | null
}

export default function NoProjectCard({ name, email, avatarUrl, cargo, departamento }: NoProjectCardProps) {
  const [isPending, startTransition] = useTransition()
  const { toast } = useToast()
  const firstName = name.split(' ')[0]

  function handleCheck() {
    startTransition(async () => {
      // Se o usuário já tiver acesso, a action redireciona e este código nunca volta a executar.
      const result = await checkProjectAccessAction()
      if (!result.hasAccess) {
        toast('Nenhum projeto ainda.', 'warning')
      }
    })
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 w-full max-w-md p-8">
      {/* CABEÇALHO */}
      <div className="flex items-center gap-3 mb-6">
        <UserAvatar name={name} avatarUrl={avatarUrl} size="md" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">Olá, {firstName}</p>
          {email && <p className="text-xs text-gray-500 truncate">{email}</p>}
        </div>
      </div>

      {/* MENSAGEM DE ESTADO */}
      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
          <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-bold text-gray-900">Você ainda não faz parte de nenhum projeto.</h1>
        <p className="text-sm text-gray-500 mt-2">
          Assim que um administrador te adicionar a um projeto, ele aparece aqui.
        </p>
      </div>

      {/* AÇÃO PRINCIPAL */}
      <Button
        type="button"
        onClick={handleCheck}
        disabled={isPending}
        aria-busy={isPending}
        className="w-full justify-center cursor-pointer disabled:cursor-not-allowed"
      >
        {isPending && (
          <svg
            className="w-4 h-4 animate-spin motion-reduce:animate-none"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {isPending ? 'Verificando...' : 'Verificar novamente'}
      </Button>

      {/* SEÇÃO PERFIL */}
      {(cargo || departamento) && (
        <div className="mt-6 pt-6 border-t border-gray-100 text-sm text-gray-600 space-y-1">
          {cargo && (
            <p>
              <span className="font-medium text-gray-700">Cargo:</span> {cargo}
            </p>
          )}
          {departamento && (
            <p>
              <span className="font-medium text-gray-700">Departamento:</span> {departamento}
            </p>
          )}
        </div>
      )}
      <Link
        href="/configuracoes/perfil"
        className="block text-center text-sm text-blue-600 hover:underline mt-3 py-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
      >
        Editar perfil
      </Link>

      {/* RODAPÉ */}
      <form action={logoutAction} className="mt-6 pt-4 border-t border-gray-100">
        <button
          type="submit"
          className="w-full text-center text-xs text-gray-400 hover:text-gray-600 transition-colors py-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 cursor-pointer"
        >
          Sair
        </button>
      </form>
    </div>
  )
}

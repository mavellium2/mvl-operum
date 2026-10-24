'use client'

import { useEffect, useState, useTransition } from 'react'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'

type TenantEntry = {
  userId: string
  tenantId: string
  tenantName: string
  tenantSubdomain: string
  role: string
  isCurrent: boolean
  /** Conta com o mesmo e-mail ainda não vinculada: a primeira troca pede a senha dela. */
  requiresPassword?: boolean
  passwordScope?: 'current' | 'target'
}

const roleBadge: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700',
  gerente: 'bg-blue-100 text-blue-700',
  member: 'bg-gray-100 text-gray-600',
}

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  gerente: 'Gerente',
  member: 'Membro',
}

export default function UserTenantsList() {
  const [tenants, setTenants] = useState<TenantEntry[] | null>(null)
  const [isPending, startTransition] = useTransition()
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [senhaPara, setSenhaPara] = useState<string | null>(null)
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)

  function acessar(tenantId: string, password?: string) {
    setSwitchingId(tenantId)
    setErro(null)
    startTransition(async () => {
      const result = await switchTenantAction(tenantId, password)
      if (!result) return
      if (result.needsPassword) setSenhaPara(tenantId)
      if (result.error) setErro(result.error)
    })
  }

  useEffect(() => {
    getMyTenantsAction().then(setTenants).catch(() => setTenants([]))
  }, [])

  if (tenants === null) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1].map(i => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-gray-100">
            <div className="w-9 h-9 rounded-lg bg-gray-200 shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/3" />
              <div className="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (tenants.length === 0) {
    return <p className="text-sm text-gray-500">Nenhuma instituição encontrada.</p>
  }

  return (
    <ul className="space-y-2">
      {tenants.map(t => (
        <li
          key={t.tenantId}
          className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
            t.isCurrent ? 'border-blue-200 bg-blue-50/40' : 'border-gray-100 bg-white hover:bg-gray-50'
          }`}
        >
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900 truncate">{t.tenantName}</span>
              {t.isCurrent && (
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-green-100 text-green-700 border border-green-200 shrink-0">
                  Ativo
                </span>
              )}
              <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full border shrink-0 ${roleBadge[t.role] ?? roleBadge.member} border-transparent`}>
                {roleLabel[t.role] ?? t.role}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">Identificador: {t.tenantSubdomain}</p>
          </div>

          {!t.isCurrent && senhaPara === t.tenantId && (
            <form
              className="flex flex-col items-end gap-1 shrink-0"
              onSubmit={e => {
                e.preventDefault()
                // FormData lê o valor real, inclusive quando preenchido pelo
                // gerenciador de senhas sem atualizar o estado do React.
                const password = new FormData(e.currentTarget).get('password')
                if (typeof password === 'string' && password) acessar(t.tenantId, password)
              }}
            >
              <label className="text-xs text-gray-500" htmlFor={`senha-${t.tenantId}`}>
                {t.passwordScope === 'current' ? 'Senha da conta que está ativa' : `Senha da sua conta em ${t.tenantName}`}
              </label>
              <div className="flex gap-2">
                <input
                  id={`senha-${t.tenantId}`}
                  name="password"
                  type={mostrarSenha ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoFocus
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  className="w-40 px-2 py-1.5 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {isPending && switchingId === t.tenantId ? 'Confirmando…' : 'Confirmar'}
                </button>
              </div>
              <button type="button" className="text-xs text-blue-600" onClick={() => setMostrarSenha(v => !v)} aria-pressed={mostrarSenha}>
                {mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              </button>
              {t.passwordScope !== 'current' && <p className="text-xs text-gray-500 max-w-64">Esta conta pode ter uma senha diferente da instituição ativa.</p>}
              {erro && <p role="alert" className="text-xs text-red-600">{erro}</p>}
            </form>
          )}

          {!t.isCurrent && senhaPara !== t.tenantId && (
            <button
              disabled={isPending}
              onClick={() => {
                if (t.requiresPassword) { setSenha(''); setMostrarSenha(false); setErro(null); setSenhaPara(t.tenantId); return }
                acessar(t.tenantId)
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60 shrink-0"
            >
              {isPending && switchingId === t.tenantId ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Acessando…</span>
                </>
              ) : (
                <>
                  <span>Acessar</span>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

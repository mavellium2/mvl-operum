'use client'

import { useState, useTransition } from 'react'
import { approveOAuthAction, denyOAuthAction } from '@/app/actions/oauth'
import type { OAuthAuthorizeCheck, OAuthAuthorizeRequest } from '@/lib/api-client'
import { scopeLabel } from '@/lib/oauth/authorizeRequest'

type Check = Extract<OAuthAuthorizeCheck, { ok: true }>

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ background: 'var(--surface)' }}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-xl" style={{ border: '1px solid var(--border)' }}>
        <p className="mb-4 text-sm font-semibold tracking-wide" style={{ color: 'var(--brand-2)' }}>Operum</p>
        {children}
      </div>
    </div>
  )
}

export function OAuthErrorCard({ title, description }: { title: string; description: string }) {
  return (
    <Card>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>{description}</p>
    </Card>
  )
}

export default function OAuthConsent({ request, check }: { request: OAuthAuthorizeRequest; check: Check }) {
  const current = check.tenants.find(t => t.isCurrent) ?? check.tenants[0]
  const [selected, setSelected] = useState<string[]>(current ? [current.tenantId] : [])
  const [allowWrite, setAllowWrite] = useState(check.writeRequested)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [leaving, setLeaving] = useState(false)

  function toggleTenant(id: string) {
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  function decide(approve: boolean) {
    setError(null)
    startTransition(async () => {
      const res = approve
        ? await approveOAuthAction(request, selected, allowWrite)
        : await denyOAuthAction(request)
      if ('redirect' in res) {
        setLeaving(true)
        window.location.assign(res.redirect)
        return
      }
      setError(res.error)
    })
  }

  if (check.tenants.length === 0) {
    return <OAuthErrorCard title="Nenhum workspace disponível" description="Sua conta não tem workspace ativo para conectar." />
  }

  const shownScopes = check.scopes.filter(s => s !== 'operum:write' || allowWrite)
  const busy = pending || leaving

  return (
    <Card>
      <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
        <span className="break-words">{check.client.name}</span> quer acessar o seu Operum
      </h1>
      <p className="mt-1 text-xs text-gray-500 break-all">
        Aplicativo identificado por <strong className="font-semibold text-gray-700">{check.client.host}</strong>
        {check.client.kind === 'dcr' ? ' (nome informado pelo próprio aplicativo)' : ''}
      </p>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Depois de permitir, você volta para <strong className="font-semibold text-gray-900 break-all">{check.redirectHost}</strong>.
        Ele só vê e altera o que você mesmo pode ver e alterar.
      </p>
      <p className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
        Só permita se foi você quem pediu esta conexão agora. Se recebeu este link de outra pessoa, clique em Negar.
      </p>

      {check.loopback && (
        <p role="alert" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          O retorno é para um programa neste aparelho ({check.redirectHost}). Só permita se foi você quem iniciou a conexão agora, por exemplo no Claude Code.
        </p>
      )}

      <section className="mt-5">
        <h2 className="text-sm font-medium text-gray-900">O que ele poderá fazer</h2>
        <ul className="mt-2 space-y-1.5">
          {shownScopes.map(s => (
            <li key={s} className="flex gap-2 text-sm text-gray-700">
              <span aria-hidden className="text-green-600">✓</span>
              <span>{scopeLabel(s)}</span>
            </li>
          ))}
        </ul>
        {check.writeRequested && (
          <label className="mt-3 flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800">
            <input type="checkbox" className="h-5 w-5" checked={allowWrite} onChange={e => setAllowWrite(e.target.checked)} disabled={busy} />
            Permitir criar e alterar (sem isso, só consulta)
          </label>
        )}
      </section>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium text-gray-900">Workspaces</legend>
        <div className="mt-2 space-y-2">
          {check.tenants.map(t => (
            <label key={t.tenantId} className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={selected.includes(t.tenantId)}
                onChange={() => toggleTenant(t.tenantId)}
                disabled={busy}
              />
              <span className="flex-1 break-words">{t.tenantName}</span>
              {t.isCurrent && <span className="text-xs text-gray-500">atual</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => decide(false)}
          disabled={busy}
          className="min-h-11 rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Negar
        </button>
        <button
          type="button"
          onClick={() => decide(true)}
          disabled={busy || selected.length === 0}
          className="min-h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--brand-2)' }}
        >
          {busy ? 'Aguarde…' : 'Permitir'}
        </button>
      </div>

      <p className="mt-4 text-xs text-gray-500">
        Você pode desconectar quando quiser em Meu perfil → Personal Access Tokens → Apps conectados.
      </p>
    </Card>
  )
}

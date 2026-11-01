'use client'

import { matchesIntegrationSearch, useIntegrationSearch } from './IntegrationSearch'
import GlassButton from '@/components/ui/GlassButton'

import { useState, useTransition } from 'react'
import { revokeOAuthGrantAction } from '@/app/actions/oauth'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatDateBR } from '@/lib/date'
import type { OAuthGrantSummary } from '@/lib/api-client'

/** Conexões OAuth (ex.: conector do Claude) com revogação imediata. */
export default function ConnectedApps({ grants }: { grants: OAuthGrantSummary[] }) {
  const { query } = useIntegrationSearch()
  const visible = grants.filter(grant => matchesIntegrationSearch(`${grant.clientName} ${grant.redirectHost} ${grant.tenants.join(' ')}`, query))
  const [target, setTarget] = useState<OAuthGrantSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRevoking, startRevoke] = useTransition()

  function revoke(id: string) {
    setError(null)
    startRevoke(async () => {
      const res = await revokeOAuthGrantAction(id)
      if ('error' in res && res.error) setError(res.error)
      setTarget(null)
    })
  }

  if (grants.length === 0) {
    return <p className="text-sm text-gray-500">Você ainda não conectou um aplicativo. Escolha seu assistente e autorize o acesso com sua conta Operum. Suas conexões aparecerão aqui.</p>
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!visible.length && <p role="status" className="text-sm text-gray-500">Nenhum app conectado corresponde à pesquisa.</p>}
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
        {visible.map(g => (
          <li key={g.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 break-words">{g.clientName} <span className="font-normal text-gray-500">({g.redirectHost})</span></p>
              <p className="text-xs text-gray-500 break-words">
                {g.scopes.includes('operum:write') ? 'Leitura e escrita' : 'Só leitura'} · {g.tenants.join(', ')}
              </p>
              <p className="text-xs text-gray-500">
                Conectado em {formatDateBR(g.createdAt)}
                {g.lastUsedAt ? ` · último uso ${formatDateBR(g.lastUsedAt)}` : ''} · vence em {formatDateBR(g.expiresAt)}
              </p>
            </div>
            <GlassButton
              type="button"
              onClick={() => setTarget(g)}
              variant="custom" className="glass-button settings-destructive shrink-0"
            >
              Desconectar
            </GlassButton>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        isOpen={!!target}
        onClose={() => setTarget(null)}
        onConfirm={() => target && revoke(target.id)}
        title="Desconectar app"
        message={target ? `${target.clientName} perde o acesso ao Operum na hora. Para usar de novo, conecte outra vez.` : ''}
        confirmLabel="Desconectar"
        confirmDisabled={isRevoking}
      />
    </div>
  )
}

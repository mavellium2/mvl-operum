'use client'

import Select from '@/components/ui/Select'
import { useActionState, useState, useTransition } from 'react'
import { createApiTokenAction, revokeApiTokenAction, type CreateApiTokenState } from '@/app/actions/apiTokens'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { formatDateBR } from '@/lib/date'

type ApiTokenScope = 'read' | 'write'

type ApiTokenSummary = {
  id: string
  name: string
  prefix: string
  scopes: ApiTokenScope[]
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

// NEXT_PUBLIC_* é fixada no build da imagem, que não recebe o .env da VPS: o padrão
// precisa ser um endereço que funciona. mcp.operum.adm.br ainda não tem DNS.
const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL || 'https://api.operum.adm.br/mcp'

export default function ApiTokensManager({ tokens }: { tokens: ApiTokenSummary[] }) {
  const [state, formAction, isPending] = useActionState(createApiTokenAction, {} as CreateApiTokenState)
  const [revokeTarget, setRevokeTarget] = useState<ApiTokenSummary | null>(null)
  const [isRevoking, startRevoke] = useTransition()
  const [copied, setCopied] = useState(false)
  const [validade, setValidade] = useState('90')

  const active = tokens.filter(t => !t.revokedAt)

  function handleRevoke(id: string) {
    startRevoke(async () => {
      await revokeApiTokenAction(id)
    })
  }

  const claudeCommand = state.created
    ? `claude mcp add --transport http operum ${MCP_SERVER_URL} --header "Authorization: Bearer ${state.created.token}"`
    : ''

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
        <div>
          <label htmlFor="token-name" className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
          <input
            id="token-name"
            name="name"
            required
            maxLength={100}
            placeholder="Ex.: Claude Code - notebook"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked disabled className="rounded border-gray-300" />
            Leitura
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="write" className="rounded border-gray-300" />
            Permitir escrita
          </label>
        </div>

        <div>
          <label htmlFor="token-expires" className="block text-sm font-medium text-gray-700 mb-1">Validade</label>
          <Select
            id="token-expires"
            name="expiresInDays"
            searchable={false}
            value={validade}
            onChange={setValidade}
            options={[{ value: '30', label: '30 dias' }, { value: '90', label: '90 dias' }, { value: '180', label: '180 dias' }]}
          />
        </div>

        {state.error && <p className="text-sm text-red-600">{state.error}</p>}

        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? 'Gerando...' : 'Gerar token'}
        </Button>
      </form>

      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-2">Tokens ativos</h3>
        {active.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum token ativo.</p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
            {active.map(token => (
              <li key={token.id} className="flex items-center justify-between gap-4 px-4 py-3 bg-white">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{token.name}</p>
                  <p className="text-xs text-gray-500 font-mono">{token.prefix}…</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Escopos: {token.scopes.join(', ')} · Criado em {formatDateBR(token.createdAt)}
                    {token.expiresAt && ` · Expira em ${formatDateBR(token.expiresAt)}`}
                    {token.lastUsedAt && ` · Último uso ${formatDateBR(token.lastUsedAt)}`}
                  </p>
                </div>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={isRevoking}
                  onClick={() => setRevokeTarget(token)}
                >
                  Revogar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => revokeTarget && handleRevoke(revokeTarget.id)}
        title="Revogar token"
        message={`Tem certeza que deseja revogar o token "${revokeTarget?.name}"? Essa ação não pode ser desfeita e qualquer integração usando esse token deixará de funcionar imediatamente.`}
        confirmLabel="Revogar"
      />

      <Modal
        isOpen={!!state.created}
        onClose={() => { /* fechamento explícito abaixo — token só é exibido uma vez */ }}
        title="Token gerado"
        maxWidth="max-w-lg"
      >
        {state.created && (
          <div className="space-y-4">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Copie este token agora — por segurança, ele não será exibido novamente.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-gray-100 rounded-lg px-3 py-2 overflow-x-auto whitespace-nowrap">
                {state.created.token}
              </code>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(state.created!.token)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? 'Copiado!' : 'Copiar'}
              </Button>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Conectar no Claude Code</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-gray-900 text-gray-100 rounded-lg px-3 py-2 overflow-x-auto whitespace-nowrap">
                  {claudeCommand}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigator.clipboard.writeText(claudeCommand)}
                >
                  Copiar
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Participa de outras instituições? Gere um token em cada um e adicione todos ao mesmo servidor com{' '}
                <code className="bg-gray-100 rounded px-1">--header &quot;X-Operum-Tokens: opr_pat_...,opr_pat_...&quot;</code>.
              </p>
            </div>

            <div className="flex justify-end">
              <Button variant="primary" onClick={() => window.location.reload()}>Concluir</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

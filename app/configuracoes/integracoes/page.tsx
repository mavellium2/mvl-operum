import type { Metadata } from 'next'
import { listApiTokensAction } from '@/app/actions/apiTokens'
import { listOAuthGrantsAction } from '@/app/actions/oauth'
import ApiTokensManager from '@/components/integracoes/ApiTokensManager'
import ConnectedApps from '@/components/integracoes/ConnectedApps'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Integrações' }

/** Integrações do usuário: apps conectados por OAuth e Personal Access Tokens (MCP/API). */
export default async function IntegracoesPage() {
  const result = await listApiTokensAction()
  const tokens = ('tokens' in result ? result.tokens : []) ?? []
  const { grants } = await listOAuthGrantsAction()

  return (
    <>
      <p className="text-sm text-gray-500">
        Conecte ferramentas externas, como o Claude, para operar o Operum em seu nome.
      </p>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Apps conectados</h2>
        <p className="text-sm text-gray-500 mb-4">
          Apps que você autorizou com login, como o conector do Operum no app do Claude (web e celular).
        </p>
        <ConnectedApps grants={grants} />
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Personal Access Tokens</h2>
        <p className="text-sm text-gray-500 mb-4">
          Tokens de acesso pessoal permitem que ferramentas como o Claude Code operem no Operum em seu nome.
          Escolha o escopo de leitura ou escrita conforme a necessidade e revogue tokens que não estiverem mais em uso.
        </p>
        <ApiTokensManager tokens={tokens} />
      </section>
    </>
  )
}

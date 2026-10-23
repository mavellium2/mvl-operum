import Link from 'next/link'
import type { Metadata } from 'next'
import { listApiTokensAction } from '@/app/actions/apiTokens'
import ApiTokensManager from '@/components/profile/ApiTokensManager'
import { listOAuthGrantsAction } from '@/app/actions/oauth'
import ConnectedApps from '@/components/profile/ConnectedApps'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Personal Access Tokens' }

export default async function ApiTokensPage() {
  const result = await listApiTokensAction()
  const tokens = ('tokens' in result ? result.tokens : []) ?? []
  const { grants } = await listOAuthGrantsAction()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <Link href="/perfil" className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Personal Access Tokens</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <p className="text-sm text-gray-500 mb-4">
            Tokens de acesso pessoal permitem que ferramentas como o Claude Code operem no Operum em seu nome.
            Escolha o escopo de leitura ou escrita conforme a necessidade e revogue tokens que não estiverem mais em uso.
          </p>
          <ApiTokensManager tokens={tokens} />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Apps conectados</h2>
          <p className="text-sm text-gray-500 mb-4">
            Apps que você autorizou com login, como o conector do Operum no app do Claude (web e celular).
          </p>
          <ConnectedApps grants={grants} />
        </div>
      </main>
    </div>
  )
}

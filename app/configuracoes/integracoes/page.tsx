import IntegrationsWorkspace from '@/components/integracoes/IntegrationsWorkspace'
import type { Metadata } from 'next'
import { listApiTokensAction } from '@/app/actions/apiTokens'
import { listOAuthGrantsAction } from '@/app/actions/oauth'
import ApiTokensManager from '@/components/integracoes/ApiTokensManager'
import ConnectedApps from '@/components/integracoes/ConnectedApps'
import IntegrationGuides from '@/components/integracoes/IntegrationGuides'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Integrações' }

/** Integrações do usuário: apps conectados por OAuth e Personal Access Tokens (MCP/API). */
export default async function IntegracoesPage() {
  const result = await listApiTokensAction()
  const tokens = ('tokens' in result ? result.tokens : []) ?? []
  const { grants } = await listOAuthGrantsAction()

  return <IntegrationsWorkspace
    connectionCount={grants.length}
    tokenCount={tokens.filter(token => !token.revokedAt && (!token.expiresAt || new Date(token.expiresAt) > new Date())).length}
    available={<IntegrationGuides />}
    connections={<ConnectedApps grants={grants} />}
    tokens={<ApiTokensManager tokens={tokens} />}
  />
}

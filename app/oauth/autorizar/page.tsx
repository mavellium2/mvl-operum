import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/dal'
import { oauthApi, type OAuthAuthorizeCheck } from '@/lib/api-client'
import { parseAuthorizeRequest } from '@/lib/oauth/authorizeRequest'
import OAuthConsent, { OAuthErrorCard } from '@/components/oauth/OAuthConsent'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Autorizar acesso', robots: { index: false, follow: false } }

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * Tela de consentimento OAuth (SDD-mcp-oauth §4.3). Sem sessão, o proxy manda
 * para /login e volta para cá com a mesma query.
 */
export default async function AutorizarPage({ searchParams }: Props) {
  const params = await searchParams
  await verifySession()

  const req = parseAuthorizeRequest(params)
  if (!req) {
    return <OAuthErrorCard title="Pedido inválido" description="O link de autorização está incompleto. Volte ao aplicativo e tente conectar de novo." />
  }

  let check: OAuthAuthorizeCheck
  try {
    check = await oauthApi.check(req)
  } catch {
    return <OAuthErrorCard title="Operum indisponível" description="Não foi possível conferir o pedido agora. Tente de novo em alguns instantes." />
  }

  if (!check.ok) {
    // Cliente e endereço de retorno confiáveis: o erro volta para o aplicativo.
    if (check.redirect) redirect(check.redirect)
    return <OAuthErrorCard title="Não foi possível autorizar" description={check.description} />
  }

  return <OAuthConsent request={req} check={check} />
}

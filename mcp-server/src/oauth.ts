/**
 * Lado "servidor de recurso" do OAuth (SDD-mcp-oauth §4.7, RFC 9728).
 * Só fica ativo com OAUTH_ISSUER, MCP_RESOURCE_URL e MCP_GATEWAY_KEY
 * configurados; sem eles, o MCP segue aceitando só PAT, como antes.
 */
export const OAUTH_SCOPES = ['operum:read', 'operum:write', 'offline_access']

export interface OAuthResourceConfig {
  issuer: string
  resource: string
  metadataUrl: string
  metadataPaths: string[]
}

export function oauthResourceConfig(env: NodeJS.ProcessEnv = process.env): OAuthResourceConfig | null {
  const issuer = env.OAUTH_ISSUER?.replace(/\/+$/, '')
  const resourceRaw = env.MCP_RESOURCE_URL?.replace(/\/+$/, '')
  if (!issuer || !resourceRaw || !env.MCP_GATEWAY_KEY) return null
  let resource: URL
  try {
    resource = new URL(resourceRaw)
  } catch {
    return null
  }
  const path = resource.pathname === '/' ? '' : resource.pathname
  const suffixed = `/.well-known/oauth-protected-resource${path}`
  return {
    issuer,
    resource: resourceRaw,
    metadataUrl: `${resource.origin}${suffixed}`,
    metadataPaths: [...new Set([suffixed, '/.well-known/oauth-protected-resource'])],
  }
}

export function protectedResourceMetadata(cfg: OAuthResourceConfig) {
  return {
    resource: cfg.resource,
    authorization_servers: [cfg.issuer],
    scopes_supported: OAUTH_SCOPES,
    bearer_methods_supported: ['header'],
    resource_name: 'Operum',
  }
}

/** Valor do WWW-Authenticate do 401 (RFC 6750 §3 + RFC 9728 §5.1). */
export function wwwAuthenticate(cfg: OAuthResourceConfig | null, error?: 'invalid_token'): string {
  if (!cfg) return 'Bearer realm="operum"'
  const parts = [`resource_metadata="${cfg.metadataUrl}"`, `scope="${OAUTH_SCOPES.join(' ')}"`]
  if (error) parts.unshift(`error="${error}"`)
  return `Bearer ${parts.join(', ')}`
}

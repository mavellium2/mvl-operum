/**
 * Configuração do servidor de autorização OAuth (SDD-mcp-oauth §4.10).
 * Lida a cada chamada para que os testes possam trocar o ambiente.
 */
export const ACCESS_TOKEN_TTL_S = 60 * 60 // 1 h
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60 // 30 dias desde a última rotação
export const GRANT_MAX_TTL_S = 90 * 24 * 60 * 60 // teto absoluto da conexão
export const CODE_TTL_S = 60
/** Reuso de um refresh logo após a rotação (retentativa do próprio cliente) não revoga a conexão. */
export const REFRESH_REUSE_GRACE_MS = 10_000

export const SCOPE_READ = 'operum:read'
export const SCOPE_WRITE = 'operum:write'
export const SCOPE_OFFLINE = 'offline_access'
export const SUPPORTED_SCOPES = [SCOPE_READ, SCOPE_WRITE, SCOPE_OFFLINE] as const

export const HOSTED_CLAUDE_REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
export const HOSTED_CHATGPT_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect'

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * O servidor de autorização só funciona com as mesmas três variáveis que o
 * mcp-server exige (mcp-server/src/oauth.ts). Sem elas, o auth-service emitia
 * tokens com os valores padrão abaixo que o mcp-server recusava logo depois
 * do login ("a integração rejeitou as credenciais que acabou de emitir").
 */
export function oauthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.OAUTH_ISSUER?.trim() && env.MCP_RESOURCE_URL?.trim() && env.MCP_GATEWAY_KEY?.trim())
}

export function oauthConfig() {
  return {
    issuer: trimSlash(process.env.OAUTH_ISSUER ?? 'https://api.operum.adm.br'),
    authorizeUrl: process.env.OAUTH_AUTHORIZE_URL ?? 'https://operum.adm.br/oauth/autorizar',
    resource: trimSlash(process.env.MCP_RESOURCE_URL ?? 'https://api.operum.adm.br/mcp'),
    cimdAllowedHosts: (process.env.OAUTH_CIMD_ALLOWED_HOSTS ?? 'claude.ai,chatgpt.com')
      .split(',').map(h => h.trim().toLowerCase()).filter(Boolean),
    /** Redirects aceitos no registro dinâmico (DCR), além do loopback. */
    dcrAllowedRedirects: (process.env.OAUTH_DCR_ALLOWED_REDIRECTS ?? `${HOSTED_CLAUDE_REDIRECT},${HOSTED_CHATGPT_REDIRECT}`)
      .split(',').map(r => r.trim()).filter(Boolean),
  }
}

/** Metadados RFC 8414. */
export function authorizationServerMetadata() {
  const c = oauthConfig()
  return {
    issuer: c.issuer,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: c.authorizeUrl,
    token_endpoint: `${c.issuer}/oauth/token`,
    registration_endpoint: `${c.issuer}/oauth/register`,
    revocation_endpoint: `${c.issuer}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...SUPPORTED_SCOPES],
    client_id_metadata_document_supported: true,
  }
}

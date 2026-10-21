import { describe, it, expect } from 'vitest'
import { cimdHostAllowed, isCimdClientId, isPublicAddress, parseClientMetadata } from '../oauth/cimd'
import { isValidRedirectUri, redirectAllowed } from '../oauth/redirect'

const ID = 'https://claude.ai/oauth/mcp-client-metadata'

describe('CIMD', () => {
  it('só aceita client_id HTTPS com caminho, sem porta, query ou credenciais', () => {
    expect(isCimdClientId(ID)).toBe(true)
    expect(isCimdClientId('https://claude.ai/')).toBe(false)
    expect(isCimdClientId('http://claude.ai/x')).toBe(false)
    expect(isCimdClientId('https://claude.ai:8443/x')).toBe(false)
    expect(isCimdClientId('https://claude.ai/x?a=1')).toBe(false)
    expect(isCimdClientId('https://u:p@claude.ai/x')).toBe(false)
  })

  it('confere o host na allowlist', () => {
    expect(cimdHostAllowed(ID, ['claude.ai'])).toBe(true)
    expect(cimdHostAllowed('https://claude.ai.evil.example/x', ['claude.ai'])).toBe(false)
    expect(cimdHostAllowed('https://evil.example/x', ['claude.ai'])).toBe(false)
  })

  it('valida o documento', () => {
    const ok = { client_id: ID, client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], token_endpoint_auth_method: 'none' }
    expect(parseClientMetadata(ID, ok)).toEqual({ name: 'Claude', redirectUris: ok.redirect_uris })
    expect(() => parseClientMetadata(ID, { ...ok, client_id: 'https://claude.ai/outro' })).toThrow('não confere')
    expect(() => parseClientMetadata(ID, { ...ok, client_name: '' })).toThrow('client_name')
    expect(() => parseClientMetadata(ID, { ...ok, redirect_uris: ['javascript:alert(1)'] })).toThrow('redirect_uris')
    expect(() => parseClientMetadata(ID, { ...ok, redirect_uris: [] })).toThrow('redirect_uris')
    expect(() => parseClientMetadata(ID, { ...ok, token_endpoint_auth_method: 'client_secret_basic' })).toThrow('públicos')
    expect(() => parseClientMetadata(ID, 'texto')).toThrow()
  })

  it('bloqueia endereços internos', () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '172.18.0.2', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(isPublicAddress(ip)).toBe(false)
    }
    expect(isPublicAddress('160.79.104.10')).toBe(true)
  })
})

describe('redirect_uri', () => {
  const registered = ['https://claude.ai/api/mcp/auth_callback', 'http://localhost/callback', 'http://127.0.0.1/callback']

  it('HTTPS só com igualdade exata', () => {
    expect(redirectAllowed('https://claude.ai/api/mcp/auth_callback', registered)).toBe(true)
    expect(redirectAllowed('https://claude.ai/api/mcp/auth_callback/', registered)).toBe(false)
    expect(redirectAllowed('https://claude.ai/api/mcp/auth_callback?x=1', registered)).toBe(false)
  })

  it('loopback aceita qualquer porta, mas não outro caminho nem outro host', () => {
    expect(redirectAllowed('http://localhost:3118/callback', registered)).toBe(true)
    expect(redirectAllowed('http://127.0.0.1:53111/callback', registered)).toBe(true)
    expect(redirectAllowed('http://localhost:3118/outro', registered)).toBe(false)
    expect(redirectAllowed('http://evil.example:3118/callback', registered)).toBe(false)
  })

  it('recusa esquemas perigosos e fragmentos', () => {
    expect(isValidRedirectUri('javascript:alert(1)')).toBe(false)
    expect(isValidRedirectUri('http://example.com/cb')).toBe(false)
    expect(isValidRedirectUri('https://claude.ai/cb#x')).toBe(false)
  })
})

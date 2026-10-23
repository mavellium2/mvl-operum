import { describe, it, expect } from 'vitest'
import { parseAuthorizeRequest, scopeLabel } from '@/lib/oauth/authorizeRequest'

const base = {
  response_type: 'code',
  client_id: 'https://claude.ai/oauth/mcp-client-metadata',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
}

describe('parseAuthorizeRequest', () => {
  it('lê os campos conhecidos e ignora os demais', () => {
    expect(parseAuthorizeRequest({ ...base, state: 's', scope: 'operum:read', extra: 'x' })).toEqual({ ...base, state: 's', scope: 'operum:read' })
  })

  it('campo obrigatório ausente → null', () => {
    const { code_challenge: _omit, ...rest } = base
    expect(parseAuthorizeRequest(rest)).toBeNull()
  })

  it('parâmetro repetido (array) não é aceito', () => {
    expect(parseAuthorizeRequest({ ...base, client_id: ['a', 'b'] })).toBeNull()
  })

  it('valor grande demais → null', () => {
    expect(parseAuthorizeRequest({ ...base, state: 'x'.repeat(501) })).toBeNull()
  })

  it('tipo diferente de texto → null', () => {
    expect(parseAuthorizeRequest({ ...base, state: 123 })).toBeNull()
  })
})

describe('scopeLabel', () => {
  it('traduz os escopos do Operum', () => {
    expect(scopeLabel('operum:write')).toMatch(/Criar e alterar/)
    expect(scopeLabel('desconhecido')).toBe('desconhecido')
  })
})

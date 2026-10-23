import { describe, it, expect, vi, beforeEach } from 'vitest'

const { approve, deny, grants, revokeGrant } = vi.hoisted(() => ({
  approve: vi.fn(), deny: vi.fn(), grants: vi.fn(), revokeGrant: vi.fn(),
}))

vi.mock('@/lib/dal', () => ({ verifySession: vi.fn().mockResolvedValue({ userId: 'u1' }) }))
vi.mock('@/lib/api-client', () => ({ oauthApi: { approve, deny, grants, revokeGrant } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveOAuthAction, denyOAuthAction, revokeOAuthGrantAction } from '@/app/actions/oauth'

const req = {
  response_type: 'code',
  client_id: 'https://claude.ai/oauth/mcp-client-metadata',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
  state: 's1',
}

beforeEach(() => vi.clearAllMocks())

describe('approveOAuthAction', () => {
  it('repassa a requisição, os workspaces e a escrita, e devolve a URL de retorno', async () => {
    approve.mockResolvedValue({ redirect: 'https://claude.ai/api/mcp/auth_callback?code=x&state=s1' })
    const res = await approveOAuthAction(req, ['t-a', 't-a', 't-b'], true)
    expect(approve).toHaveBeenCalledWith(req, ['t-a', 't-b'], true)
    expect(res).toEqual({ redirect: 'https://claude.ai/api/mcp/auth_callback?code=x&state=s1' })
  })

  it('sem workspace válido, nem chama o auth-service', async () => {
    const res = await approveOAuthAction(req, ['../x', ''], true)
    expect(res).toEqual({ error: 'Escolha ao menos um workspace.' })
    expect(approve).not.toHaveBeenCalled()
  })

  it('requisição malformada é recusada', async () => {
    const res = await approveOAuthAction({ ...req, client_id: '' }, ['t-a'], true)
    expect(res).toEqual({ error: 'Pedido de autorização inválido.' })
  })

  it('erro do auth-service sem redirect vira mensagem', async () => {
    approve.mockResolvedValue({ ok: false, error: 'access_denied', description: 'Workspace não disponível para este usuário.' })
    expect(await approveOAuthAction(req, ['t-a'], false)).toEqual({ error: 'Workspace não disponível para este usuário.' })
  })

  it('allowWrite só vale com true explícito', async () => {
    approve.mockResolvedValue({ redirect: 'https://claude.ai/cb' })
    await approveOAuthAction(req, ['t-a'], 'sim' as unknown as boolean)
    expect(approve).toHaveBeenCalledWith(req, ['t-a'], false)
  })
})

describe('denyOAuthAction', () => {
  it('devolve a URL com access_denied', async () => {
    deny.mockResolvedValue({ redirect: 'https://claude.ai/cb?error=access_denied' })
    expect(await denyOAuthAction(req)).toEqual({ redirect: 'https://claude.ai/cb?error=access_denied' })
  })
})

describe('revokeOAuthGrantAction', () => {
  it('recusa id malformado', async () => {
    expect(await revokeOAuthGrantAction('../../x')).toEqual({ error: 'Conexão inválida' })
    expect(revokeGrant).not.toHaveBeenCalled()
  })

  it('revoga a conexão', async () => {
    revokeGrant.mockResolvedValue(undefined)
    expect(await revokeOAuthGrantAction('grant-1')).toEqual({ ok: true })
    expect(revokeGrant).toHaveBeenCalledWith('grant-1')
  })
})

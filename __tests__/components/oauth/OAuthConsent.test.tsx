import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const { approveOAuthAction, denyOAuthAction } = vi.hoisted(() => ({
  approveOAuthAction: vi.fn(),
  denyOAuthAction: vi.fn(),
}))
vi.mock('@/app/actions/oauth', () => ({ approveOAuthAction, denyOAuthAction }))

import OAuthConsent from '@/components/oauth/OAuthConsent'

const request = {
  response_type: 'code',
  client_id: 'https://claude.ai/oauth/mcp-client-metadata',
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
}

function check(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    client: { name: 'Claude', kind: 'cimd', clientId: request.client_id, host: 'claude.ai' },
    redirectUri: request.redirect_uri,
    redirectHost: 'claude.ai',
    loopback: false,
    scopes: ['operum:read', 'operum:write', 'offline_access'],
    writeRequested: true,
    tenants: [
      { tenantId: 't-a', tenantName: 'Mavellium', role: 'admin', isCurrent: true },
      { tenantId: 't-b', tenantName: 'Fábio', role: 'member', isCurrent: false },
    ],
    ...overrides,
  }
}

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', { value: { ...window.location, assign }, writable: true })
})

describe('OAuthConsent', () => {
  it('mostra o app, o host de retorno e marca só o workspace atual', () => {
    render(<OAuthConsent request={request} check={check()} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Claude quer acessar o seu Operum')
    expect(screen.getAllByText('claude.ai')).toHaveLength(2)
    expect(screen.getByText(/Só permita se foi você quem pediu/)).toBeTruthy()
    expect(screen.getByText(/Aplicativo identificado por/).textContent).toContain('claude.ai')
    expect(screen.queryByText(/nome informado pelo próprio aplicativo/)).toBeNull()
    expect((screen.getByLabelText(/Mavellium/) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/Fábio/) as HTMLInputElement).checked).toBe(false)
  })

  it('Permitir envia os workspaces e a escrita, e navega para a URL de retorno', async () => {
    approveOAuthAction.mockResolvedValue({ redirect: 'https://claude.ai/api/mcp/auth_callback?code=c1' })
    render(<OAuthConsent request={request} check={check()} />)
    fireEvent.click(screen.getByLabelText(/Fábio/))
    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=c1'))
    expect(approveOAuthAction).toHaveBeenCalledWith(request, ['t-a', 't-b'], true)
  })

  it('desmarcar a escrita autoriza só leitura', async () => {
    approveOAuthAction.mockResolvedValue({ redirect: 'https://claude.ai/cb' })
    render(<OAuthConsent request={request} check={check()} />)
    fireEvent.click(screen.getByLabelText(/Permitir criar e alterar/))
    expect(screen.queryByText(/Criar e alterar tarefas/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }))
    await waitFor(() => expect(approveOAuthAction).toHaveBeenCalledWith(request, ['t-a'], false))
  })

  it('sem workspace marcado, Permitir fica desabilitado', () => {
    render(<OAuthConsent request={request} check={check()} />)
    fireEvent.click(screen.getByLabelText(/Mavellium/))
    expect((screen.getByRole('button', { name: 'Permitir' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Negar devolve ao app com access_denied', async () => {
    denyOAuthAction.mockResolvedValue({ redirect: 'https://claude.ai/cb?error=access_denied' })
    render(<OAuthConsent request={request} check={check()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Negar' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied'))
  })

  it('erro aparece na tela e não navega', async () => {
    approveOAuthAction.mockResolvedValue({ error: 'Workspace não disponível para este usuário.' })
    render(<OAuthConsent request={request} check={check()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(assign).not.toHaveBeenCalled()
  })

  it('cliente DCR avisa que o nome é declarado pelo próprio app', () => {
    render(<OAuthConsent request={request} check={check({ client: { name: 'Claude Code', kind: 'dcr', clientId: 'opr_dcr_x', host: 'localhost:3118' } })} />)
    expect(screen.getByText(/nome informado pelo próprio aplicativo/)).toBeTruthy()
  })

  it('retorno para loopback mostra o aviso', () => {
    render(<OAuthConsent request={request} check={check({ loopback: true, redirectHost: 'localhost:3118' })} />)
    expect(screen.getByRole('alert').textContent).toMatch(/programa neste aparelho/)
  })
})

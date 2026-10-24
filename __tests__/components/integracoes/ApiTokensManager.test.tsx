import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/app/actions/apiTokens', () => ({
  createApiTokenAction: vi.fn(async () => ({ created: { id: 't1', token: 'opr_pat_teste123', name: 'Claude', scopes: ['read', 'write'] } })),
  revokeApiTokenAction: vi.fn(),
}))

import ApiTokensManager from '@/components/integracoes/ApiTokensManager'

describe('Personal Access Tokens — comando do Claude Code', () => {
  it('usa o endereço do MCP que funciona hoje (api.operum.adm.br), não o mcp.operum.adm.br sem DNS', async () => {
    render(<ApiTokensManager tokens={[]} />)
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Claude' } })
    fireEvent.click(screen.getByRole('button', { name: 'Gerar token' }))
    const comando = await waitFor(() => screen.getByText(/claude mcp add --transport http operum/))
    expect(comando.textContent).toContain('https://api.operum.adm.br/mcp')
    expect(comando.textContent).toContain('Authorization: Bearer opr_pat_teste123')
    expect(comando.textContent).not.toContain('mcp.operum.adm.br/mcp')
  })
})

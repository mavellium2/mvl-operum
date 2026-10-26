import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CopyConnectionValue from '@/components/integracoes/CopyConnectionValue'

afterEach(() => vi.unstubAllGlobals())

describe('copiar conexão', () => {
  it('copia todos os comandos, preservando a quebra de linha', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const value = 'codex mcp add operum --url https://api.operum.adm.br/mcp\ncodex mcp login operum'
    render(<CopyConnectionValue value={value} label="comandos do Codex" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar comandos do Codex' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('comandos do Codex copiado.'))
    expect(writeText).toHaveBeenCalledWith(value)
  })

  it('mantém o texto disponível e orienta a cópia manual se o navegador negar', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render(<CopyConnectionValue value="https://api.operum.adm.br/mcp" label="URL" />)
    fireEvent.click(screen.getByRole('button', { name: 'Copiar URL' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('copie manualmente'))
    expect(screen.getByText('https://api.operum.adm.br/mcp')).toBeVisible()
  })
})

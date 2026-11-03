import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StatusSincronizacao from '@/components/sincronizacao/StatusSincronizacao'
import { repetirSincronizacaoAction } from '@/app/actions/sincronizacao'

vi.mock('@/app/actions/sincronizacao', () => ({ repetirSincronizacaoAction: vi.fn() }))

const ok = { situacao: 'OK' as const, ultimaTentativaEm: '2026-10-21T12:00:00Z', ultimaConclusaoEm: '2026-10-21T12:00:00Z', erro: null, pendencias: [] }
const falha = { ...ok, situacao: 'FALHA' as const, erro: 'Banco ocupado. Tente novamente.' }
const pend = { ...ok, situacao: 'PENDENCIAS' as const, pendencias: [{ tipo: 'sem-responsavel', quantidade: 1, mensagem: '1 atividade sem responsável ativo' }] }

beforeEach(() => vi.clearAllMocks())

describe('StatusSincronizacao', () => {
  it('não ocupa espaço quando a atualização automática está normal ou tem pendências de dados', () => {
    const { rerender } = render(<StatusSincronizacao projectId="p" inicial={ok} podeSincronizar />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    rerender(<StatusSincronizacao key="2" projectId="p" inicial={pend} podeSincronizar />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mostra uma falha real e desaparece após nova tentativa bem-sucedida', async () => {
    vi.mocked(repetirSincronizacaoAction).mockResolvedValue({ status: ok })
    render(<StatusSincronizacao projectId="p" inicial={falha} podeSincronizar />)
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível atualizar')
    expect(screen.getByText(/Banco ocupado/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(repetirSincronizacaoAction).toHaveBeenCalledWith('p')
  })

  it('mantém visível o erro quando a nova tentativa falha', async () => {
    vi.mocked(repetirSincronizacaoAction).mockResolvedValue({ error: 'A atualização falhou.', status: falha })
    render(<StatusSincronizacao projectId="p" inicial={falha} podeSincronizar />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('A atualização falhou.')).toBeInTheDocument()
  })

  it('sem permissão mostra a falha, mas não oferece ação', () => {
    render(<StatusSincronizacao projectId="p" inicial={falha} podeSincronizar={false} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import StatusSincronizacao from '@/components/sincronizacao/StatusSincronizacao'
import { repetirSincronizacaoAction } from '@/app/actions/sincronizacao'

vi.mock('@/app/actions/sincronizacao', () => ({ repetirSincronizacaoAction: vi.fn() }))

const ok = { situacao: 'OK' as const, ultimaTentativaEm: '2026-10-21T12:00:00Z', ultimaConclusaoEm: '2026-10-21T12:00:00Z', erro: null, pendencias: [] }
const falha = { ...ok, situacao: 'FALHA' as const, erro: 'Banco ocupado. Tente novamente.' }
const pend = { ...ok, situacao: 'PENDENCIAS' as const, pendencias: [{ tipo: 'sem-responsavel', quantidade: 1, mensagem: '1 atividade concluída na planilha sem responsável ativo' }] }

beforeEach(() => vi.clearAllMocks())

describe('StatusSincronizacao', () => {
  it('só diz sincronizado sem pendência e sem erro', () => {
    const { rerender } = render(<StatusSincronizacao projectId="p" inicial={ok} podeSincronizar />)
    expect(screen.getByRole('status')).toHaveTextContent('EAP, planilha e sprints sincronizadas')
    rerender(<StatusSincronizacao key="2" projectId="p" inicial={pend} podeSincronizar />)
    expect(screen.getByRole('status')).toHaveTextContent('Sincronizado com 1 pendência')
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }))
    expect(screen.getByText(/sem responsável ativo/)).toBeInTheDocument()
  })

  it('falha mostra o motivo e "Tentar novamente"; repetir atualiza o estado', async () => {
    vi.mocked(repetirSincronizacaoAction).mockResolvedValue({ status: ok })
    render(<StatusSincronizacao projectId="p" inicial={falha} podeSincronizar />)
    expect(screen.getByRole('status')).toHaveTextContent('Falha na última sincronização')
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }))
    expect(screen.getByText(/Banco ocupado/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('sincronizadas'))
    expect(repetirSincronizacaoAction).toHaveBeenCalledWith('p')
  })

  it('erro ao repetir mantém a falha visível com a mensagem', async () => {
    vi.mocked(repetirSincronizacaoAction).mockResolvedValue({ error: 'A sincronização falhou.', status: falha })
    render(<StatusSincronizacao projectId="p" inicial={ok} podeSincronizar />)
    fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('A sincronização falhou.')
    expect(screen.getByRole('status')).toHaveTextContent('Falha na última sincronização')
  })

  it('sem permissão não oferece o botão', () => {
    render(<StatusSincronizacao projectId="p" inicial={null} podeSincronizar={false} />)
    expect(screen.getByRole('status')).toHaveTextContent('ainda não registrada')
    expect(screen.queryByRole('button', { name: /Sincronizar/ })).not.toBeInTheDocument()
  })
})

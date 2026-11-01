import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import HistoricoProjeto from '@/components/projetos/HistoricoProjeto'
import { listarVersoesProjetoAction } from '@/app/actions/projetoEdicao'

vi.mock('@/app/actions/projetoEdicao', () => ({ listarVersoesProjetoAction: vi.fn() }))

describe('recuperação do histórico', () => {
  it('permite tentar novamente após falha de comunicação', async () => {
    vi.mocked(listarVersoesProjetoAction).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ versoes: [] })
    render(<HistoricoProjeto projetoId="p1" aberto salvo={null} nomeDoUsuario={() => ''} onFechar={vi.fn()} onRestaurar={vi.fn()} recarregar={0} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Suas alterações continuam preservadas')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText(/Ainda não há versões/)).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

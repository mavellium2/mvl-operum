import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const nav = vi.hoisted(() => ({ refresh: vi.fn(), params: new URLSearchParams('doc=avaliacao-rh') }))
vi.mock('next/navigation', () => ({ useSearchParams: () => nav.params, useRouter: () => ({ refresh: nav.refresh, push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/lib/clientFetch', () => ({ fetchWithSession: vi.fn() }))
const toast = vi.hoisted(() => vi.fn())
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('@/hooks/useVersoesDocumento', () => ({ abrirPropostas: vi.fn(), useVersoesDocumento: vi.fn() }))
import { fetchWithSession } from '@/lib/clientFetch'
import AvaliacaoRhDocumento, { type AvaliacaoRhItem } from '@/components/projetos/documentacao/formularios/AvaliacaoRh'

const membros = [{ id: 'u1', name: 'Ana', setor: null }, { id: 'u2', name: 'Enzo', setor: null }]
const salvas: AvaliacaoRhItem[] = [{ integranteId: 'u1', integrante: 'Ana', rodada: 3, status: 'APPROVED', notaFinal: '9' }]
const tela = (rodadas: number, avaliacoes: AvaliacaoRhItem[] = []) =>
  render(<AvaliacaoRhDocumento projetoId="p1" membros={membros} avaliacoes={avaliacoes} rodadas={rodadas} permitido />)

beforeEach(() => { vi.resetAllMocks() })

describe('Avaliação de R.H. — excluir rodada', () => {
  it('com 2 rodadas (AC e AF) não há botão de excluir', () => {
    tela(2)
    expect(screen.queryByRole('button', { name: /Excluir a/ })).toBeNull()
  })

  it('só a última rodada, da 3ª em diante, tem o botão', () => {
    tela(4)
    expect(screen.getAllByRole('button', { name: /Excluir a/ })).toHaveLength(1)
    const quarta = screen.getByRole('region', { name: /4ª Avaliação/ })
    expect(within(quarta).getByRole('button', { name: 'Excluir a 4ª Avaliação' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: /3ª Avaliação/ })).queryByRole('button', { name: /Excluir a/ })).toBeNull()
  })

  it('pede confirmação, avisa das avaliações salvas e exclui pela API', async () => {
    vi.mocked(fetchWithSession).mockResolvedValue(Response.json({ rodadas: 2, versoesArquivadas: 1 }))
    tela(3, salvas)
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a 3ª Avaliação' }))
    expect(fetchWithSession).not.toHaveBeenCalled()
    expect(await screen.findByText('Excluir a 3ª Avaliação?')).toBeInTheDocument()
    expect(screen.getByText(/1 avaliação salva/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir rodada' }))
    await waitFor(() => expect(fetchWithSession).toHaveBeenCalledWith('/api/projects/p1/avaliacao-rh/rodadas', expect.objectContaining({ method: 'DELETE', body: JSON.stringify({ rodada: 3 }) })))
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled())
    expect(toast).toHaveBeenCalledWith('3ª Avaliação excluída.', 'success')
  })

  it('rodada vazia: o aviso diz que pode ser aberta de novo; erro do servidor aparece e não atualiza a lista', async () => {
    vi.mocked(fetchWithSession).mockResolvedValue(Response.json({ error: 'Só é possível excluir a última rodada' }, { status: 409 }))
    tela(3)
    fireEvent.click(screen.getByRole('button', { name: 'Excluir a 3ª Avaliação' }))
    expect(await screen.findByText(/ainda não tem avaliações salvas/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Excluir rodada' }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Só é possível excluir a última rodada', 'error'))
    expect(nav.refresh).not.toHaveBeenCalled()
  })
})

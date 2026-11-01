import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ExcluirFaseDialog from '@/components/projetos/ExcluirFaseDialog'
import { excluirFaseAction, impactoExclusaoFaseAction } from '@/app/actions/projetoEdicao'

vi.mock('@/app/actions/projetoEdicao', () => ({ excluirFaseAction: vi.fn(), impactoExclusaoFaseAction: vi.fn() }))
const impacto = { fase: 'Escopo', codigo: '1.1', itensEap: 0, tarefas: 0, sprints: [], orcamentoCronograma: 100, orcado: 0, realizado: 0, exigeMotivo: false }
const props = { projetoId: 'p1', fase: { nodeId: 'n1', nome: 'Escopo', numero: '1.1' }, versao: () => undefined, onFechar: vi.fn(), onExcluida: vi.fn() }
beforeEach(() => vi.resetAllMocks())

describe('recuperação de falhas na exclusão', () => {
  it('não habilita exclusão quando não consegue calcular o impacto', async () => {
    vi.mocked(impactoExclusaoFaseAction).mockRejectedValueOnce(new Error('offline'))
    render(<ExcluirFaseDialog {...props} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('nenhuma fase foi excluída')
    expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).toBeDisabled()
    expect(excluirFaseAction).not.toHaveBeenCalled()
  })
  it('explica orçamento manual e libera os controles após resultado incerto', async () => {
    vi.mocked(impactoExclusaoFaseAction).mockResolvedValueOnce({ impacto })
    vi.mocked(excluirFaseAction).mockRejectedValueOnce(new Error('offline'))
    render(<ExcluirFaseDialog {...props} />)
    expect(await screen.findByTestId('impacto-exclusao')).toHaveTextContent(/100,00 do orçamento do cronograma/)
    expect(screen.getByTestId('impacto-exclusao')).toHaveTextContent('Não há valores lançados na planilha')
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira a fase antes de tentar novamente')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled())
    expect(props.onExcluida).not.toHaveBeenCalled()
  })
})

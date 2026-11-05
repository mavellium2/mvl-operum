import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PrioridadeAtividade from '@/components/custos/PrioridadeAtividade'
const { patch, toast } = vi.hoisted(() => ({ patch: vi.fn(), toast: vi.fn() }))
vi.mock('@/app/actions/sprintBoard', () => ({ patchCardAction: patch }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))
const card = { id: 'c1', sprintId: 's1', etapa: null, priority: 'baixa' }
describe('prioridade pela planilha', () => {
  it('salva diretamente no card e atualiza a bandeira', async () => {
    patch.mockResolvedValueOnce({ card: { ...card, priority: 'alta' } })
    const onChanged = vi.fn()
    render(<PrioridadeAtividade card={card} nome="Atividade" canEdit onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prioridade de Atividade: Baixa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alta' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalledOnce())
    expect(patch).toHaveBeenCalledWith('s1', 'c1', { priority: 'alta' })
    expect(screen.getByRole('button', { name: 'Prioridade de Atividade: Alta' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('permite escolher prioridade de rascunho sem chamar a API', () => {
    const onDraft = vi.fn()
    const calls = patch.mock.calls.length
    render(<PrioridadeAtividade nome="Nova atividade" canEdit draftPriority="baixa" onDraft={onDraft} onChanged={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Prioridade de Nova atividade: Baixa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alta' }))
    expect(onDraft).toHaveBeenCalledWith('alta')
    expect(patch.mock.calls.length).toBe(calls)
    expect(screen.getByRole('button', { name: 'Prioridade de Nova atividade: Baixa' })).toHaveFocus()
  })
  it('sem permissão apresenta apenas o indicador', () => {
    render(<PrioridadeAtividade card={card} nome="Atividade" canEdit={false} onChanged={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Prioridade Baixa' })).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})

import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { startTransition } from 'react'
import CardModal from '@/components/card/CardModal'

// Server Actions que nunca respondem: simulam a fila serial do Next ocupada.
const pendente = vi.hoisted(() => () => new Promise(() => {}))
vi.mock('@/app/actions/tags', () => ({ assignTagToCardAction: vi.fn(), removeTagFromCardAction: vi.fn() }))
vi.mock('@/app/actions/time', () => ({
  startTimerAction: vi.fn(), pauseTimerAction: vi.fn(),
  getCardTimeAction: vi.fn(pendente), getActiveTimerAction: vi.fn(pendente),
  getCardsTimerAction: vi.fn(pendente), getTimeEntriesAction: vi.fn(pendente),
  addManualTimeAction: vi.fn(), updateTimeEntryAction: vi.fn(), deleteTimeEntryAction: vi.fn(),
}))
vi.mock('@/app/actions/sprintBoard', () => ({ getCardMovementsAction: vi.fn(pendente), getCardPlanilhaAction: vi.fn().mockResolvedValue({ linha: null }) }))
vi.mock('@/app/actions/cardResponsible', () => ({
  addResponsibleAction: vi.fn(), removeResponsibleAction: vi.fn(), getResponsiblesAction: vi.fn(pendente),
}))

const card = {
  id: 'c1', title: 'Corrigir anexo', description: 'URL do MinIO\nabre no primeiro clique',
  color: '#3b82f6' as const, priority: 'alta', sprintId: 's1',
  tags: [{ tagId: 't1', tag: { id: 't1', name: 'Bug', color: '#ef4444' } }],
  attachments: [], createdAt: 0, updatedAt: 0,
  startDate: new Date('2026-10-15T12:00:00Z'), endDate: new Date('2026-10-20T12:00:00Z'),
}

describe('abrir card', () => {
  it('com uma Server Action pendente numa transição (como no quadro), o card abre preenchido', async () => {
    // O Next chama Server Actions dentro de transições; enquanto uma está pendente,
    // o React 19 segura qualquer outra transição até ela terminar.
    await act(async () => { startTransition(async () => { await pendente() }) })
    render(<CardModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} initialCard={card} onPatch={vi.fn()} />)
    expect(screen.getByDisplayValue('Corrigir anexo')).toBeInTheDocument()
    expect(screen.getByText(/URL do MinIO/)).toBeInTheDocument()
  })


  it('título, descrição e prioridade aparecem na primeira renderização, sem esperar o servidor', () => {
    render(<CardModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} initialCard={card} boardTags={[{ id: 't1', name: 'Bug', color: '#ef4444' }]} onPatch={vi.fn()} />)
    expect(screen.getByDisplayValue('Corrigir anexo')).toBeInTheDocument()
    expect(screen.getByText(/URL do MinIO/)).toBeInTheDocument()
  })

  it('modal de criação começa vazio', () => {
    render(<CardModal isOpen onClose={vi.fn()} onSubmit={vi.fn()} />)
    const campos = screen.getAllByRole('textbox') as HTMLInputElement[]
    expect(campos.every(c => c.value === '')).toBe(true)
  })
})

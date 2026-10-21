import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Card from '@/components/card/Card'
import type { Card as CardType } from '@/types/kanban'

vi.mock('@hello-pangea/dnd', () => ({
  Draggable: ({ children }: { children: (p: object, s: object) => React.ReactNode }) =>
    <>{children({ innerRef: () => {}, draggableProps: { style: {} }, dragHandleProps: {} }, { isDragging: false })}</>,
}))

vi.mock('@/components/card/CardModal', () => ({
  default: () => null,
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
  default: () => null,
}))

vi.mock('@/app/actions/tags', () => ({
  assignTagToCardAction: vi.fn(),
  removeTagFromCardAction: vi.fn(),
}))

vi.mock('@/app/actions/time', () => ({
  startTimerAction: vi.fn(),
  pauseTimerAction: vi.fn(),
  getCardTimeAction: vi.fn().mockResolvedValue({ seconds: 0 }),
  getActiveTimerAction: vi.fn().mockResolvedValue({ entry: null }),
  getCardsTimerAction: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map(id => [id, { seconds: 0, entry: null }]))),
}))

vi.mock('@/app/actions/cardResponsible', () => ({
  addResponsibleAction: vi.fn(),
  removeResponsibleAction: vi.fn(),
  getResponsiblesAction: vi.fn().mockResolvedValue({ responsibles: [] }),
}))

const makeCard = (overrides: Partial<CardType> = {}): CardType => ({
  id: 'c1',
  title: 'Test Card',
  description: 'Some description',
  color: '#6b7280',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
})

const defaultProps = {
  index: 0,
  columnId: 'col1',
  onClick: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
  users: [{ id: 'u1', name: 'Alice', email: 'alice@test.com', avatarUrl: null }],
  boardTags: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Card priority badge', () => {
  it.each([
    ['alta', 'Alta', /red/],
    ['media', 'Média', /amber/],
    ['baixa', 'Baixa', /emerald/],
  ])('prioridade %s aparece sempre (sem hover) como "%s"', (priority, label, cor) => {
    render(<Card {...defaultProps} card={makeCard({ priority })} />)
    const badge = screen.getByTestId('card-prioridade')
    expect(badge).toHaveTextContent(label)
    expect(badge.className).toMatch(cor)
    // Não pode estar dentro do bloco que só aparece no hover.
    expect(badge.closest('.opacity-0')).toBeNull()
  })

  it('does not render priority badge when priority is not set', () => {
    render(<Card {...defaultProps} card={makeCard({ priority: undefined })} />)
    expect(screen.queryByTestId('card-prioridade')).not.toBeInTheDocument()
  })
})

describe('Card description text', () => {
  it('shows truncated description text instead of icon', () => {
    render(<Card {...defaultProps} card={makeCard({ description: 'Texto da descrição detalhada' })} />)
    expect(screen.getByText('Texto da descrição detalhada')).toBeInTheDocument()
  })

  it('has title attribute with full description for tooltip', () => {
    const desc = 'Descrição longa para tooltip'
    render(<Card {...defaultProps} card={makeCard({ description: desc })} />)
    const el = screen.getByText(desc)
    expect(el).toHaveAttribute('title', desc)
  })

  it('does not render description text when description is empty', () => {
    render(<Card {...defaultProps} card={makeCard({ description: '' })} />)
    // Nenhum parágrafo de descrição deve aparecer
    expect(screen.queryByTestId('card-description')).not.toBeInTheDocument()
  })
})

describe('Card red flag (realizado > orcado)', () => {
  it('shows red flag indicator when realizado_min exceeds orcado_min', () => {
    const card = makeCard({ orcado_min: 60, realizado_min: 120 } as never)
    render(<Card {...defaultProps} card={card} />)
    expect(screen.getByTestId('card-overrun-flag')).toBeInTheDocument()
  })

  it('does not show red flag when realizado_min is within orcado_min', () => {
    const card = makeCard({ orcado_min: 120, realizado_min: 60 } as never)
    render(<Card {...defaultProps} card={card} />)
    expect(screen.queryByTestId('card-overrun-flag')).not.toBeInTheDocument()
  })

  it('does not show red flag when orcado_min is not set', () => {
    const card = makeCard({ realizado_min: 60 } as never)
    render(<Card {...defaultProps} card={card} />)
    expect(screen.queryByTestId('card-overrun-flag')).not.toBeInTheDocument()
  })
})

describe('Card tempo planejado/realizado display', () => {
  it('renders tempo row when orcado_min is set', () => {
    const card = makeCard({ orcado_min: 480 } as never)
    render(<Card {...defaultProps} card={card} />)
    expect(screen.getByTestId('card-tempo-row')).toBeInTheDocument()
  })

  it('does not render tempo row when neither orcado_min nor realizado_min set', () => {
    render(<Card {...defaultProps} card={makeCard()} />)
    expect(screen.queryByTestId('card-tempo-row')).not.toBeInTheDocument()
  })
})

describe('Card dados da Planilha de Custos', () => {
  it('mostra horas orçadas/realizadas no formato da planilha', () => {
    const card = makeCard({ orcado_min: 95, realizado_min: 480 } as never)
    render(<Card {...defaultProps} card={card} />)
    expect(screen.getByTestId('card-tempo-row')).toHaveTextContent('1h35')
    expect(screen.getByTestId('card-tempo-row')).toHaveTextContent('8h')
  })

  it('em aberto: data prevista e valor orçado, identificados', () => {
    const card = makeCard({ orcado_min: 60, data_prevista: '2026-03-10', orcado_total: 300, realizado_total: 120 } as never)
    render(<Card {...defaultProps} card={card} />)
    expect(screen.getByTestId('card-data-prevista')).toHaveTextContent(/Prev\.\s*10\/03/)
    expect(screen.getByTestId('card-valor')).toHaveTextContent(/Orçado\s*R\$\s*300,00/)
    expect(screen.queryByTestId('card-data-realizada')).not.toBeInTheDocument()
  })

  it('concluído: valor realizado e data realizada', () => {
    const card = makeCard({ data_prevista: '2026-03-10', data_realizacao: '2026-03-12', orcado_total: 300, realizado_total: 120.5 } as never)
    render(<Card {...defaultProps} card={card} concluido />)
    expect(screen.getByTestId('card-data-realizada')).toHaveTextContent(/Real\.\s*12\/03/)
    expect(screen.getByTestId('card-valor')).toHaveTextContent(/Realizado\s*R\$\s*120,50/)
  })

  it('sem permissão de ver a planilha (sem totais) não mostra valor', () => {
    const card = makeCard({ orcado_min: 60, data_prevista: '2026-03-10' } as never)
    render(<Card {...defaultProps} card={card} />)
    expect(screen.queryByTestId('card-valor')).not.toBeInTheDocument()
  })

  it('não marca estouro quando não há horas orçadas', () => {
    const card = makeCard({ orcado_min: 0, realizado_min: 30 } as never)
    render(<Card {...defaultProps} card={card} />)
    expect(screen.queryByTestId('card-overrun-flag')).not.toBeInTheDocument()
  })
})

describe('Card responsible avatars', () => {
  it('renders responsible avatars on card face', () => {
    const card = makeCard({
      responsibles: [
        { user: { id: 'u1', name: 'Alice', avatarUrl: null } },
        { user: { id: 'u2', name: 'Bob', avatarUrl: null } },
      ],
    })
    render(<Card {...defaultProps} card={card} />)
    expect(screen.getByTitle('Alice')).toBeInTheDocument()
    expect(screen.getByTitle('Bob')).toBeInTheDocument()
  })

  it('renders +N indicator when more than 3 responsibles', () => {
    const card = makeCard({
      responsibles: [
        { user: { id: 'u1', name: 'A', avatarUrl: null } },
        { user: { id: 'u2', name: 'B', avatarUrl: null } },
        { user: { id: 'u3', name: 'C', avatarUrl: null } },
        { user: { id: 'u4', name: 'D', avatarUrl: null } },
      ],
    })
    render(<Card {...defaultProps} card={card} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
  })
})

describe('Card — selo de prazo', () => {
  const dia = 24 * 60 * 60 * 1000

  it('sem prazo, não mostra o selo', () => {
    render(<Card {...defaultProps} card={makeCard()} />)
    expect(screen.queryByTestId('card-prazo')).not.toBeInTheDocument()
  })

  it('prazo vencido fica "atrasado"', () => {
    render(<Card {...defaultProps} card={makeCard({ endDate: new Date(Date.now() - dia) })} />)
    expect(screen.getByTestId('card-prazo')).toHaveAttribute('data-status', 'atrasado')
  })

  it('vence em até 2 dias fica "proximo"', () => {
    render(<Card {...defaultProps} card={makeCard({ endDate: new Date(Date.now() + dia) })} />)
    expect(screen.getByTestId('card-prazo')).toHaveAttribute('data-status', 'proximo')
  })

  it('card concluído não fica atrasado', () => {
    render(<Card {...defaultProps} concluido card={makeCard({ endDate: new Date(Date.now() - dia) })} />)
    expect(screen.getByTestId('card-prazo')).toHaveAttribute('data-status', 'concluido')
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import SprintBoard from '@/components/sprint/SprintBoard'
import { createCardInSprintAction, updateCardInSprintAction, moveCardInSprintAction, renameSprintColumnAction, deleteSprintColumnAction } from '@/app/actions/sprintBoard'
import { fetchWithSession } from '@/lib/clientFetch'
import { useSearchParams } from 'next/navigation'
import { ToastProvider } from '@/components/ui/Toast'
import { escolherOpcao } from '../../helpers/select'

function renderWithProviders(ui: React.ReactElement) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

const drag = vi.hoisted(() => ({ end: null as null | ((result: unknown) => Promise<void>) }))
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }: { children: React.ReactNode; onDragEnd: (result: unknown) => Promise<void> }) => { drag.end = onDragEnd; return <>{children}</> },
  Droppable: ({ children, droppableId }: { children: (p: object, s: object) => React.ReactNode; droppableId: string }) =>
    <div data-testid={`drop-${droppableId}`}>{children({ innerRef: () => {}, droppableProps: {}, placeholder: null }, { isDraggingOver: false })}</div>,
  Draggable: ({ children }: { children: (p: object, s: object) => React.ReactNode }) =>
    <>{children({ innerRef: () => {}, draggableProps: { style: {} }, dragHandleProps: {} }, { isDragging: false })}</>,
}))

vi.mock('@/app/actions/sprintBoard', () => ({
  moveCardInSprintAction: vi.fn(),
  addSprintColumnAction: vi.fn(),
  updateSprintMetaAction: vi.fn(),
  createCardInSprintAction: vi.fn(),
  renameSprintColumnAction: vi.fn(),
  deleteSprintColumnAction: vi.fn(),
  reorderSprintColumnsAction: vi.fn(),
  updateCardInSprintAction: vi.fn(),
  deleteCardInSprintAction: vi.fn(),
  getProjectBacklogAction: vi.fn().mockResolvedValue([]),
  moveCardToSprintAction: vi.fn(),
  moveCardToBacklogAction: vi.fn(),
  createBacklogCardAction: vi.fn(),
  getCardMovementsAction: vi.fn().mockResolvedValue({ movements: [] }),
  getCardPlanilhaAction: vi.fn().mockResolvedValue({ linha: null }),
}))

vi.mock('@/lib/clientFetch', () => ({ fetchWithSession: vi.fn() }))
vi.mock('@/app/actions/tags', () => ({
  assignTagToCardAction: vi.fn(),
  removeTagFromCardAction: vi.fn(),
  createTagAction: vi.fn(),
}))

vi.mock('@/app/actions/auth', () => ({
  logoutAction: vi.fn(),
}))

vi.mock('@/app/actions/time', () => ({
  startTimerAction: vi.fn(),
  pauseTimerAction: vi.fn(),
  getCardTimeAction: vi.fn().mockResolvedValue({ seconds: 0 }),
  getActiveTimerAction: vi.fn().mockResolvedValue({ entry: null }),
  getCardsTimerAction: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map(id => [id, { seconds: 0, entry: null }]))),
  getTimeEntriesAction: vi.fn().mockResolvedValue({ entries: [] }),
  addManualTimeAction: vi.fn().mockResolvedValue({ entry: { id: 'm1' } }),
  updateTimeEntryAction: vi.fn().mockResolvedValue({ entry: { id: 'm1' } }),
  deleteTimeEntryAction: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/app/actions/cardResponsible', () => ({
  addResponsibleAction: vi.fn(),
  removeResponsibleAction: vi.fn(),
  getResponsiblesAction: vi.fn(),
}))

vi.mock('@/app/actions/comentarios', () => ({
  createCommentAction: vi.fn(),
  getCommentsAction: vi.fn().mockResolvedValue({ comments: [] }),
}))

vi.mock('@/app/actions/attachments', () => ({
  deleteAttachmentAction: vi.fn(),
  setCoverAction: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn(), replace: vi.fn() }),
  usePathname: vi.fn().mockReturnValue('/sprints/s1'),
  useSearchParams: vi.fn().mockReturnValue(new URLSearchParams()),
}))

const sprint = {
  id: 's1',
  name: 'Sprint 1',
  status: 'ACTIVE' as const,
  startDate: null,
  endDate: null,
  description: null,
  qualidade: null,
  dificuldade: null,
}

const users = [
  { id: 'u1', name: 'Ana Lima', email: 'ana@example.com', avatarUrl: null },
]

const tags = [
  { id: 't1', name: 'Bug', color: '#ef4444' },
]

const columns = [
  {
    id: 'sc1', title: 'A Fazer', position: 0,
    cards: [
      {
        id: 'c1',
        title: 'Task 1',
        description: 'Descrição da task',
        color: '#3b82f6',
        tags: [{ tagId: 't1', tag: { id: 't1', name: 'Bug', color: '#ef4444' } }],
        attachments: [],
        timeEntries: [],
      },
    ],
  },
  {
    id: 'sc2', title: 'Concluído', position: 1,
    cards: [],
  },
]

beforeEach(() => vi.clearAllMocks())

describe('SprintBoard', () => {
  it('renders sprint name in header', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    expect(screen.getByText('Sprint 1')).toBeInTheDocument()
  })

  it('renders all columns', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    expect(screen.getByText('A Fazer')).toBeInTheDocument()
    expect(screen.getByText('Concluído')).toBeInTheDocument()
  })

  it('renders cards in columns', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    expect(screen.getByText('Task 1')).toBeInTheDocument()
  })

  it('renders add column button', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    expect(screen.getByText(/nova coluna/i)).toBeInTheDocument()
  })

  it('renders status badge', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    expect(screen.getByText('Ativa')).toBeInTheDocument()
  })

  it('renders delete column button for each column', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    expect(screen.getByRole('button', { name: /excluir coluna a fazer/i })).toBeInTheDocument()
  })

  it('renders card with tags', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" users={users} tags={tags} />)
    expect(screen.getByText('Bug')).toBeInTheDocument()
  })

  it('column header has inline editable title', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    const titles = screen.getAllByText('A Fazer')
    expect(titles.length).toBeGreaterThanOrEqual(1)
  })

  it('renders board action menu button', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    expect(screen.getByRole('button', { name: /board actions/i })).toBeInTheDocument()
  })

  it('opens CSV import modal via action menu', () => {
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    fireEvent.click(screen.getByRole('button', { name: /board actions/i }))
    fireEvent.click(screen.getByText(/importar csv/i))
    expect(screen.getAllByText(/importar csv/i).length).toBeGreaterThanOrEqual(1)
  })

  it('opens card modal when clicking a backlog card', () => {
    const backlogCard = {
      id: 'bc1',
      title: 'Backlog Task',
      description: '',
      color: '#3b82f6',
      tags: [],
      attachments: [],
    }
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" backlogCards={[backlogCard]} />)
    fireEvent.click(screen.getByText('Backlog Task'))
    expect(screen.getByRole('button', { name: /salvar alterações/i })).toBeInTheDocument()
  })

  it('opens concluded card in read-only mode', () => {
    const concludedColumns = [
      columns[0],
      {
        id: 'sc2', title: 'Concluído', position: 1,
        cards: [{ id: 'c9', title: 'Done Task', description: 'feito', color: '#3b82f6', tags: [], attachments: [] }],
      },
    ]
    renderWithProviders(<SprintBoard sprint={sprint} columns={concludedColumns} projectId="proj1" />)
    fireEvent.click(screen.getByText('Done Task'))
    expect(screen.getByRole('heading', { name: /done task/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /fechar/i }).length).toBeGreaterThan(0)
  })

  describe('filtros do quadro', () => {
    const colunasComPrazo = [
      {
        id: 'sc1', title: 'A Fazer', position: 0,
        cards: [
          { id: 'c1', title: 'Tarefa vencida', description: '', color: '#3b82f6', endDate: new Date(Date.now() - 86400000).toISOString(), tags: [], attachments: [], timeEntries: [] },
          { id: 'c2', title: 'Tarefa livre', description: '', color: '#3b82f6', tags: [{ tagId: 't1', tag: { id: 't1', name: 'Bug', color: '#ef4444' } }], attachments: [], timeEntries: [] },
        ],
      },
    ]

    it('filtro "Atrasados" mostra só os cards com prazo vencido; limpar volta tudo', () => {
      renderWithProviders(<SprintBoard sprint={sprint} columns={colunasComPrazo} projectId="proj1" backlogCards={[]} />)
      fireEvent.click(screen.getByRole('button', { name: /Filtros/ }))
      escolherOpcao(screen.getByLabelText('Prazo'), 'Atrasados')
      expect(screen.getByText('Tarefa vencida')).toBeInTheDocument()
      expect(screen.queryByText('Tarefa livre')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
      expect(screen.getByText('Tarefa livre')).toBeInTheDocument()
    })

    it('filtro por etiqueta', () => {
      renderWithProviders(<SprintBoard sprint={sprint} columns={colunasComPrazo} projectId="proj1" backlogCards={[]} tags={tags} />)
      fireEvent.click(screen.getByRole('button', { name: /Filtros/ }))
      escolherOpcao(screen.getByLabelText('Etiqueta'), 'Bug')
      expect(screen.getByText('Tarefa livre')).toBeInTheDocument()
      expect(screen.queryByText('Tarefa vencida')).not.toBeInTheDocument()
    })
  })
})

describe('SprintBoard — card da URL (?card=), SDD 4.3', () => {
  const cols = [
    { ...columns[0], cards: [columns[0].cards[0], { ...columns[0].cards[0], id: 'c2', title: 'Task 2' }] },
    columns[1],
  ]
  const naUrl = (card?: string) =>
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams(card ? `card=${card}` : '') as never)
  const quadro = () => <ToastProvider><SprintBoard sprint={sprint} columns={cols} projectId="proj1" /></ToastProvider>

  beforeEach(() => {
    window.history.replaceState(null, '', '/projetos/proj1/sprints/s1')
  })
  afterEach(() => naUrl())

  it('abre o card da URL ao montar', () => {
    naUrl('c1')
    render(quadro())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Task 1')).toBeInTheDocument()
  })

  it('com o quadro já montado, um ?card= novo (clique na busca) abre o card', () => {
    naUrl()
    const { rerender } = render(quadro())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    naUrl('c2')
    rerender(quadro())
    expect(screen.getByDisplayValue('Task 2')).toBeInTheDocument()
  })

  it('fechar tira o ?card= da URL, e clicar de novo no mesmo resultado reabre', () => {
    window.history.replaceState(null, '', '/projetos/proj1/sprints/s1?card=c1')
    const replace = vi.spyOn(window.history, 'replaceState')
    naUrl('c1')
    const { rerender } = render(quadro())

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(replace).toHaveBeenCalledWith(null, '', '/projetos/proj1/sprints/s1')

    // O Next sincroniza o useSearchParams com o replaceState.
    naUrl()
    rerender(quadro())
    naUrl('c1')
    rerender(quadro())
    expect(screen.getByDisplayValue('Task 1')).toBeInTheDocument()
  })
})


describe('SDD 10.1–10.2 recuperação', () => {
  const drop = (id = 'c1', source = 'sc1', destination = 'sc2') => ({ draggableId: id, type: 'CARD', source: { droppableId: source, index: 0 }, destination: { droppableId: destination, index: 0 } })
  it.each(['403', '500', 'network'])('mover com %s mantém posição e permite retry', async error => {
    const action = vi.mocked(moveCardInSprintAction)
    if (error === 'network') action.mockRejectedValueOnce(new Error('network'))
    else action.mockResolvedValueOnce({ error })
    action.mockResolvedValue({ success: true } as never)
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    await act(async () => { await drag.end!(drop()) })
    expect(within(screen.getByTestId('drop-sc1')).getByText('Task 1')).toBeInTheDocument()
    expect(within(screen.getByTestId('drop-sc2')).queryByText('Task 1')).not.toBeInTheDocument()
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent(error)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' })) })
    expect(within(screen.getByTestId('drop-sc2')).getByText('Task 1')).toBeInTheDocument()
  })
  it('card vai para o destino ao soltar, antes da resposta do servidor (sem sumir e voltar)', async () => {
    let release!: (value: { success: true }) => void
    vi.mocked(moveCardInSprintAction).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    let pending!: Promise<void>
    act(() => { pending = drag.end!(drop()) })
    expect(within(screen.getByTestId('drop-sc2')).getByText('Task 1')).toBeInTheDocument()
    await act(async () => { release({ success: true }); await pending })
    expect(within(screen.getByTestId('drop-sc2')).getByText('Task 1')).toBeInTheDocument()
  })
  it('movimento recusado pelo servidor devolve o card à coluna de origem', async () => {
    vi.mocked(moveCardInSprintAction).mockResolvedValueOnce({ error: '403' } as never)
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    await act(async () => { await drag.end!(drop()) })
    expect(within(screen.getByTestId('drop-sc1')).getByText('Task 1')).toBeInTheDocument()
    expect(within(screen.getByTestId('drop-sc2')).queryByText('Task 1')).not.toBeInTheDocument()
  })
  it('falha tardia de outro card não apaga movimento já confirmado', async () => {
    let release!: (value: { error: string }) => void
    vi.mocked(moveCardInSprintAction).mockImplementationOnce(() => new Promise(resolve => { release = resolve })).mockResolvedValue({ success: true } as never)
    const other = { ...columns[0].cards[0], id: 'c2', title: 'Outra tarefa' }
    renderWithProviders(<SprintBoard sprint={sprint} columns={[{ ...columns[0], cards: [columns[0].cards[0], other] }, columns[1]]} projectId="proj1" />)
    let pending!: Promise<void>
    act(() => { pending = drag.end!(drop()) })
    await act(async () => { await drag.end!(drop('c2')) })
    await act(async () => { release({ error: '500' }); await pending })
    expect(within(screen.getByTestId('drop-sc2')).getByText('Outra tarefa')).toBeInTheDocument()
    expect(within(screen.getByTestId('drop-sc1')).getByText('Task 1')).toBeInTheDocument()
  })
  it.each(['403', '500', 'rede'])('renomear rejeitado com %s preserva nome confirmado', async error => {
    if (error === 'rede') vi.mocked(renameSprintColumnAction).mockRejectedValue(new Error(error))
    else vi.mocked(renameSprintColumnAction).mockResolvedValue({ error })
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    fireEvent.click(screen.getByText('A Fazer'))
    const input = screen.getByDisplayValue('A Fazer')
    fireEvent.change(input, { target: { value: 'Nome não confirmado' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(renameSprintColumnAction).toHaveBeenCalled())
    expect(screen.getByText('A Fazer')).toBeInTheDocument()
    expect(screen.queryByText('Nome não confirmado')).not.toBeInTheDocument()
  })
  it.each(['403', '500', 'rede'])('excluir rejeitado com %s mantém coluna e cards', async error => {
    if (error === 'rede') vi.mocked(deleteSprintColumnAction).mockRejectedValue(new Error(error))
    else vi.mocked(deleteSprintColumnAction).mockResolvedValue({ error })
    renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Excluir coluna A Fazer' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(deleteSprintColumnAction).toHaveBeenCalled())
    expect(screen.getByText('A Fazer')).toBeInTheDocument()
    expect(screen.getByText('Task 1')).toBeInTheDocument()
  })
  it('retry de anexo parcial usa o card já criado e mantém formulário', async () => {
    vi.mocked(createCardInSprintAction).mockResolvedValue({ card: { id: 'created', title: 'Nova', description: '', color: '#94a3b8' } } as never)
    vi.mocked(updateCardInSprintAction).mockResolvedValue({ card: { id: 'created' } } as never)
    vi.mocked(fetchWithSession).mockResolvedValueOnce(Response.json({ error: '503' }, { status: 503 })).mockResolvedValue(Response.json({ id: 'attachment', fileName: 'spec.txt', fileType: 'text/plain', filePath: 'private', fileSize: 4, createdAt: new Date().toISOString() }))
    const { container } = renderWithProviders(<SprintBoard sprint={sprint} columns={columns} projectId="proj1" />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Adicionar card' })[1])
    fireEvent.change(screen.getByPlaceholderText('Título da tarefa...'), { target: { value: 'Nova' } })
    const file = new File(['spec'], 'spec.txt', { type: 'text/plain' })
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Criar card' }))
    await screen.findByText(/Tarefa criada. Tentar novamente continua/)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Criar card' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(createCardInSprintAction).toHaveBeenCalledTimes(1)
    expect(fetchWithSession).toHaveBeenCalledTimes(2)
    expect(within(screen.getByTestId('drop-sc1')).getAllByText('Nova')).toHaveLength(1)
  })
})

'use client'

import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useToast } from '@/components/ui/Toast'
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd'
import SprintHeader from './SprintHeader'
import ColumnComponent from '@/components/board/Column'
import CardComponent from '@/components/card/Card'
import Modal from '@/components/ui/Modal'
import CardModal, { type CardSubmitResult } from '@/components/card/CardModal'
import { Column as ColumnType, Card as CardType, CardColor } from '@/types/kanban'
import {
  moveCardInSprintAction,
  addSprintColumnAction,
  renameSprintColumnAction,
  setSprintColumnColorAction,
  deleteSprintColumnAction,
  reorderSprintColumnsAction,
  createCardInSprintAction,
  updateCardInSprintAction,
  deleteCardInSprintAction,
  getProjectBacklogAction,
  moveCardToSprintAction,
  moveCardToBacklogAction,
  createBacklogCardAction,
  patchCardAction,
} from '@/app/actions/sprintBoard'
import { createCommentAction, getCommentsAction, updateCommentAction, deleteCommentAction } from '@/app/actions/comentarios'
import { deleteAttachmentAction, setCoverAction, renameAttachmentAction } from '@/app/actions/attachments'
import { addResponsibleAction, removeResponsibleAction } from '@/app/actions/cardResponsible'
import { fetchWithSession } from '@/lib/clientFetch'
import { aplicarFiltros, buscarCards, filtrosAtivos, FILTROS_PADRAO, type CardFilters } from '@/lib/cardFilters'
import { ColumnSearchButton, ColumnSearchInput } from '@/components/board/ColumnSearch'
import { isColunaConcluida } from '@/lib/cardUtils'
import { precisaDeOutroResponsavel } from '@/lib/responsavelInativo'
import { colunaExigeResponsavel } from '@/lib/responsavelObrigatorio'
import CardsSemResponsavel, { type CardPendente } from './CardsSemResponsavel'
import { useClientNow } from '@/hooks/useClientNow'

interface SprintCard {
  id: string
  title: string
  description: string
  color: string
  priority?: string | null
  sprintPosition?: number | null
  tags?: { tagId: string; tag: { id?: string; name: string; color: string } }[]
  attachments?: { id: string; fileName: string; fileType: string; filePath: string; fileSize: number; isCover?: boolean; uploadedAt: string | Date }[]
  timeEntries?: { duration: number }[]
  responsibles?: { user: { id: string; name: string; avatarUrl: string | null } }[]
  startDate?: string | Date | null
  endDate?: string | Date | null
  eapCode?: string
  /** Linha da Planilha de Custos da atividade ligada; totais só para quem vê a planilha. */
  planilha?: { minOrcado: number; minReal: number; dataPrevista: string | null; dataRealizacao: string | null; totalOrcado?: number | null; totalReal?: number | null }
}

type NewCardData = {
  title: string
  description: string
  color: CardColor
  priority?: string
  responsibles?: string[]
  files?: File[]
  startDate?: string | null
  endDate?: string | null
}

interface SprintColumnData {
  id: string
  title: string
  position: number
  color?: string | null
  cards: SprintCard[]
}

interface Sprint {
  id: string
  name: string
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED'
  startDate: Date | string | null
  endDate: Date | string | null
  description?: string | null
  qualidade?: number | null
  dificuldade?: number | null
}

interface SprintBoardProps {
  sprint: Sprint
  columns: SprintColumnData[]
  backlogCards?: SprintCard[]
  users?: { id: string; name: string; email: string; avatarUrl?: string | null }[]
  tags?: { id: string; name: string; color: string }[]
  currentUser?: { id: string; name: string; email: string; avatarUrl?: string | null } | null
  initialCardId?: string | null
  projectId?: string | null
  /** Membros inativados no projeto (continuam nos cards em que já eram responsáveis). */
  inactiveUserIds?: string[]
}

function toColumnType(col: SprintColumnData): ColumnType {
  return { id: col.id, title: col.title, cardIds: col.cards.map(c => c.id), color: col.color ?? null }
}

function toCardType(card: SprintCard, sprintId: string, inativos?: ReadonlySet<string>): CardType {
  return {
    id: card.id,
    title: card.title,
    eapCode: card.eapCode,
    ...(card.planilha ? {
      orcado_min: card.planilha.minOrcado,
      realizado_min: card.planilha.minReal,
      orcado_total: card.planilha.totalOrcado ?? null,
      realizado_total: card.planilha.totalReal ?? null,
      data_prevista: card.planilha.dataPrevista,
      data_realizacao: card.planilha.dataRealizacao,
    } : {}),
    precisaResponsavel: inativos ? precisaDeOutroResponsavel((card.responsibles ?? []).map(r => r.user.id), inativos) : false,
    description: card.description ?? '',
    color: (card.color ?? '#6b7280') as CardColor,
    priority: card.priority ?? 'media',
    sprintId,
    tags: card.tags?.map(ct => ({
      tagId: ct.tagId,
      tag: { id: ct.tag.id ?? ct.tagId, name: ct.tag.name, color: ct.tag.color },
    })),
    attachments: card.attachments?.map(a => ({
      id: a.id,
      fileName: a.fileName,
      fileType: a.fileType,
      filePath: a.filePath,
      fileSize: a.fileSize,
      isCover: a.isCover ?? false,
      uploadedAt: typeof a.uploadedAt === 'string' ? new Date(a.uploadedAt).getTime() : a.uploadedAt instanceof Date ? a.uploadedAt.getTime() : Date.now(),
    })) ?? [],
    responsibles: card.responsibles ?? [],
    startDate: card.startDate ? new Date(card.startDate) : null,
    endDate: card.endDate ? new Date(card.endDate) : null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

/** Anexo devolvido pelo file-service (createdAt) no formato do quadro (uploadedAt). */
function toSprintAttachment(att: Record<string, unknown>): NonNullable<SprintCard['attachments']>[number] {
  return {
    id: att.id as string,
    fileName: att.fileName as string,
    fileType: att.fileType as string,
    filePath: att.filePath as string,
    fileSize: att.fileSize as number,
    isCover: att.isCover as boolean | undefined,
    uploadedAt: (att.uploadedAt as string | Date | undefined) ?? (att.createdAt as string | Date),
  }
}

export default function SprintBoard({ sprint, columns: initialColumns, backlogCards: initialBacklogCards, users, tags, currentUser, initialCardId, projectId, inactiveUserIds }: SprintBoardProps) {
  const { toast } = useToast()
  const inativos = useMemo(() => new Set(inactiveUserIds ?? []), [inactiveUserIds])
  const permissions = useProjectPermissions()
  const [columns, setColumns] = useState(initialColumns)
  const [newColTitle, setNewColTitle] = useState('')
  const [addingCol, setAddingCol] = useState(false)
  // O ?card= é lido no cliente: com o quadro já montado (busca, link para a
  // mesma sprint), o Next reaproveita o componente e um useState(initialCardId)
  // ignorava o card novo (SDD 4.3).
  const searchParams = useSearchParams()
  const cardDaUrl = searchParams?.get('card') ?? null
  const [openCardId, setOpenCardId] = useState<string | null>(cardDaUrl ?? initialCardId ?? null)
  const [cardDaUrlAnterior, setCardDaUrlAnterior] = useState(cardDaUrl)
  if (cardDaUrl !== cardDaUrlAnterior) {
    setCardDaUrlAnterior(cardDaUrl)
    if (cardDaUrl) setOpenCardId(cardDaUrl)
  }

  /** Fecha o card e tira o ?card= da URL (sem ida ao servidor), para o mesmo resultado da busca abrir de novo. */
  function fecharCard() {
    setOpenCardId(null)
    const url = new URL(window.location.href)
    if (!url.searchParams.has('card')) return
    url.searchParams.delete('card')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }
  const [cardComments, setCardComments] = useState<{ id: string; user: { id: string; name: string; avatarUrl?: string | null }; content: string; createdAt: Date }[]>([])
  const [addingCardToColumn, setAddingCardToColumn] = useState<string | null>(null)
  const [boardBg, setBoardBg] = useState('bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900')
  const [backlogCards, setBacklogCards] = useState<SprintCard[]>(initialBacklogCards ?? [])
  const [filters, setFilters] = useState<CardFilters>(FILTROS_PADRAO)
  const now = useClientNow()
  const filtering = filtrosAtivos(filters)
  // Com filtro/ordenação os índices exibidos não batem com os reais: o arraste
  // fica desligado até limpar os filtros.
  const visibleCards = (cards: SprintCard[], concluida: boolean) =>
    filtering && now ? aplicarFiltros(cards, filters, { now, userId: currentUser?.id, concluida }) : cards
  const [addingBacklogCard, setAddingBacklogCard] = useState(false)
  const [backlogSearchOpen, setBacklogSearchOpen] = useState(false)
  const [backlogSearch, setBacklogSearch] = useState('')
  const backlogSearching = backlogSearch.trim() !== ''
  const backlogVisible = visibleCards(backlogCards, false)
  const backlogShown = backlogSearching ? buscarCards(backlogVisible, backlogSearch) : backlogVisible
  function closeBacklogSearch() { setBacklogSearch(''); setBacklogSearchOpen(false) }
  const [pendingMove, setPendingMove] = useState<{
    cardId: string
    srcColumnId: string
    srcColumnIndex: number
    dstColumnId: string
    dstColumnIndex: number
    reason: string
  } | null>(null)
  
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  const isImageBg = boardBg.startsWith('url')

  useEffect(() => {
    if (!openCardId) return
    getCommentsAction(openCardId).then(res => {
      if (res.comments) setCardComments(res.comments)
    })
    return () => { setCardComments([]) }
  }, [openCardId])

  useEffect(() => {
    if (!projectId || initialBacklogCards) return
    getProjectBacklogAction(projectId).then(result => {
      if (Array.isArray(result)) setBacklogCards(result as SprintCard[])
    })
  }, [projectId, initialBacklogCards])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return 
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('.drag-handle')) return

    setIsDragging(true)
    setStartX(e.pageX - (scrollContainerRef.current?.offsetLeft || 0))
    setScrollLeft(scrollContainerRef.current?.scrollLeft || 0)
  }

  const handleMouseLeave = () => setIsDragging(false)
  const handleMouseUp = () => setIsDragging(false)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return
    e.preventDefault()
    const x = e.pageX - scrollContainerRef.current.offsetLeft
    const walk = (x - startX) * 1.5
    scrollContainerRef.current.scrollLeft = scrollLeft - walk
  }

  async function uploadCardAttachment(cardId: string, file: File): Promise<Record<string, unknown> | null> {
    const form = new FormData()
    form.append('cardId', cardId)
    form.append('file', file)
    try {
      const res = await fetchWithSession('/api/uploads', { method: 'POST', body: form })
      if (res.ok) {
        const att = await res.json()
        toast('Anexo enviado com sucesso!', 'success')
        return att
      }
      const body = await res.json().catch(() => ({})) as { error?: string; message?: string }
      toast(body.error ?? body.message ?? 'Falha ao enviar o anexo.', 'error')
      return null
    } catch {
      toast('Erro de rede ao enviar o anexo.', 'error')
      return null
    }
  }

  const pendingActions = useRef(new Set<string>())
  const [mutationErrors, setMutationErrors] = useState<Record<string, { message: string; retry: () => Promise<unknown> }>>({})
  async function confirmed(key: string, action: () => Promise<unknown>, apply: () => void): Promise<CardSubmitResult> {
    if (pendingActions.current.has(key)) return { error: 'Aguarde a operação em andamento.' }
    pendingActions.current.add(key)
    try {
      const result = await action()
      if (!result || typeof result !== 'object' || ('error' in result && result.error) || !(('success' in result && result.success === true) || ('card' in result && result.card) || ('column' in result && result.column))) {
        throw new Error(result && typeof result === 'object' && 'error' in result ? String(result.error) : 'Não foi possível confirmar a alteração.')
      }
      apply()
      setMutationErrors(previous => { const next = { ...previous }; delete next[key]; return next })
      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro de rede. Tente novamente.'
      setMutationErrors(previous => ({ ...previous, [key]: { message, retry: () => confirmed(key, action, apply) } }))
      toast(message, 'error')
      return { error: message }
    } finally { pendingActions.current.delete(key) }
  }
  function patchCardState(cardId: string, updater: (c: SprintCard) => SprintCard) {
    setColumns(cols => cols.map(col => ({ ...col, cards: col.cards.map(c => c.id === cardId ? updater(c) : c) })))
    setBacklogCards(prev => prev.map(c => c.id === cardId ? updater(c) : c))
  }
  const boardState = useRef({ columns, backlogCards })
  useEffect(() => { boardState.current = { columns, backlogCards } }, [columns, backlogCards])
  function applyMove(original: SprintCard, destination: string, index: number) {
    const card = boardState.current.backlogCards.find(c => c.id === original.id) ?? boardState.current.columns.flatMap(col => col.cards).find(c => c.id === original.id) ?? original
    setBacklogCards(cards => {
      const next = cards.filter(c => c.id !== card.id)
      if (destination === 'BACKLOG') next.splice(Math.min(index, next.length), 0, card)
      return next
    })
    setColumns(cols => cols.map(col => {
      const cards = col.cards.filter(c => c.id !== card.id)
      if (col.id === destination) cards.splice(Math.min(index, cards.length), 0, card)
      return { ...col, cards }
    }))
  }
  async function move(cardId: string, source: string, destination: string, index: number, reason?: string) {
    const card = backlogCards.find(c => c.id === cardId) ?? columns.flatMap(c => c.cards).find(c => c.id === cardId)
    if (!card) return { error: 'Tarefa não encontrada.' }
    if (pendingActions.current.has(`card:${cardId}`)) return { error: 'Aguarde a operação em andamento.' }
    // Otimista: o card já fica no destino ao soltar (antes, voltava à origem até o
    // servidor responder e "sumia e voltava"); se o servidor recusar, desfaz.
    const antes = boardState.current
    const origemIndex = source === 'BACKLOG'
      ? antes.backlogCards.findIndex(c => c.id === cardId)
      : antes.columns.find(col => col.id === source)?.cards.findIndex(c => c.id === cardId) ?? -1
    applyMove(card, destination, index)
    const result = await confirmed(`card:${cardId}`, () => destination === 'BACKLOG' ? moveCardToBacklogAction(cardId)
      : source === 'BACKLOG' ? moveCardToSprintAction(cardId, sprint.id, destination, index)
      : moveCardInSprintAction(cardId, destination, index, reason), () => applyMove(card, destination, index))
    // Desfaz só este card (outros movimentos confirmados no meio-tempo ficam).
    if ('error' in result) applyMove(card, source, Math.max(0, origemIndex))
    return result
  }
  async function handleDragEnd(result: DropResult) {
    const { destination, source, draggableId, type } = result
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return
    if (type === 'COLUMN') {
      if (!permissions.has('quadro:sprints')) return
      const order = columns.map(col => col.id)
      const [moved] = order.splice(source.index, 1)
      order.splice(destination.index, 0, moved)
      await confirmed('column-order', () => reorderSprintColumnsAction(sprint.id, order), () => setColumns(cols => [...cols].sort((a,b) => {
        const ai = order.indexOf(a.id), bi = order.indexOf(b.id)
        return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi)
      })))
      return
    }
    if (!permissions.has('quadro:mover')) return
    const src = columns.find(c => c.id === source.droppableId), dst = columns.find(c => c.id === destination.droppableId)
    if (src && dst && dst.position < src.position) {
      setPendingMove({ cardId: draggableId, srcColumnId: source.droppableId, srcColumnIndex: source.index, dstColumnId: destination.droppableId, dstColumnIndex: destination.index, reason: '' })
      return
    }
    await move(draggableId, source.droppableId, destination.droppableId, destination.index)
  }
  async function confirmPendingMove() {
    if (!pendingMove?.reason.trim()) return
    const result = await move(pendingMove.cardId, pendingMove.srcColumnId, pendingMove.dstColumnId, pendingMove.dstColumnIndex, pendingMove.reason)
    if ('success' in result) setPendingMove(null)
  }
  function cancelPendingMove() { setPendingMove(null) }
  async function handleCardTimerStarted(cardId: string) {
    // O servidor torna responsável quem iniciou o timer num card sem ninguém (ADR-045).
    const atual = columns.flatMap(c => c.cards).find(c => c.id === cardId) ?? backlogCards.find(c => c.id === cardId)
    if (atual && (atual.responsibles ?? []).length === 0 && currentUser) {
      patchCardState(cardId, c => ({ ...c, responsibles: [{ user: { id: currentUser.id, name: currentUser.name, avatarUrl: currentUser.avatarUrl ?? null } }] }))
    }
    const target = columns.find(col => col.title.trim().toLowerCase() === 'em andamento')
    const source = columns.find(col => col.cards.some(card => card.id === cardId))
    if (!target || (source && source.position >= target.position)) return
    await move(cardId, source?.id ?? 'BACKLOG', target.id, target.cards.length)
  }
  // Cards em "Em andamento" ou depois sem responsável ativo: aviso e atribuição rápida.
  const colunasPos = columns.map(c => ({ id: c.id, title: c.title, position: c.position }))
  const cardsSemResponsavel: CardPendente[] = columns
    .filter(col => colunaExigeResponsavel(colunasPos, col.id))
    .flatMap(col => col.cards.flatMap((card): CardPendente[] => {
      const ids = (card.responsibles ?? []).map(r => r.user.id)
      if (ids.length === 0) return [{ id: card.id, title: card.title, coluna: col.title, motivo: 'sem' }]
      if (precisaDeOutroResponsavel(ids, inativos)) return [{ id: card.id, title: card.title, coluna: col.title, motivo: 'inativo' }]
      return []
    }))
  async function atribuirResponsavel(cardId: string, userId: string): Promise<{ error?: string }> {
    const r = await addResponsibleAction(cardId, userId)
    if ('error' in r && r.error) return { error: r.error }
    const u = users?.find(x => x.id === userId)
    if (u) patchCardState(cardId, c => ({ ...c, responsibles: [...(c.responsibles ?? []), { user: { id: u.id, name: u.name, avatarUrl: u.avatarUrl ?? null } }] }))
    toast('Responsável definido.', 'success')
    return {}
  }

  async function handleAddColumn() {
    if (!permissions.has('quadro:sprints') || !newColTitle.trim()) return
    await confirmed('new-column', async () => {
      const result = await addSprintColumnAction(sprint.id, newColTitle.trim())
      if ('column' in result && result.column) {
        setColumns(cols => [...cols, { ...result.column!, cards: [] }])
        setNewColTitle(''); setAddingCol(false)
      }
      return result
    }, () => {})
  }
  async function handleRenameColumn(columnId: string, title: string) {
    if (!permissions.has('quadro:sprints')) return
    await confirmed(`column:${columnId}`, () => renameSprintColumnAction(sprint.id, columnId, title), () => setColumns(cols => cols.map(c => c.id === columnId ? { ...c, title } : c)))
  }
  async function handleChangeColumnColor(columnId: string, color: string | null) {
    if (!permissions.has('quadro:sprints')) return
    await confirmed(`column:${columnId}`, () => setSprintColumnColorAction(sprint.id, columnId, color), () => setColumns(cols => cols.map(c => c.id === columnId ? { ...c, color } : c)))
  }
  async function handleDeleteColumn(columnId: string) {
    if (!permissions.has('quadro:sprints')) return
    await confirmed(`column:${columnId}`, () => deleteSprintColumnAction(sprint.id, columnId), () => setColumns(cols => cols.filter(c => c.id !== columnId)))
  }
  // A confirmed creation survives retries of its attachments/responsibles.
  const creations = useRef(new Map<string, { card: SprintCard; users: Set<string>; files: Set<File> }>())
  function cardPayload(data: NewCardData) {
    return { title: data.title, description: data.description, color: data.color, priority: data.priority, startDate: data.startDate, endDate: data.endDate }
  }
  async function createCard(destination: string, data: NewCardData): Promise<CardSubmitResult> {
    if (!permissions.has('quadro:cards')) return { error: 'Sem permissão para criar tarefas.' }
    try {
      let creation = creations.current.get(destination)
      if (!creation) {
        const result = destination === 'BACKLOG'
          ? await createBacklogCardAction(projectId!, data)
          : await createCardInSprintAction({ ...data, sprintId: sprint.id, sprintColumnId: destination })
        if ('error' in result || !result.card) throw new Error(('error' in result && result.error) || 'Não foi possível criar a tarefa.')
        const card: SprintCard = { ...result.card, description: result.card.description ?? '', tags: [], attachments: [], timeEntries: [], responsibles: [] }
        creation = { card, users: new Set(), files: new Set() }
        creations.current.set(destination, creation)
        applyMove(card, destination, Number.MAX_SAFE_INTEGER)
      } else {
        const result = await updateCardInSprintAction(sprint.id, creation.card.id, cardPayload(data))
        if ('error' in result) throw new Error(result.error)
        patchCardState(creation.card.id, c => ({ ...c, title: data.title, description: data.description, color: data.color, priority: data.priority, startDate: data.startDate, endDate: data.endDate }))
      }
      for (const userId of creation.users) {
        if (data.responsibles?.includes(userId)) continue
        const result = await removeResponsibleAction(creation.card.id, userId)
        if ('error' in result) throw new Error(result.error)
        creation.users.delete(userId)
        patchCardState(creation.card.id, c => ({ ...c, responsibles: c.responsibles?.filter(r => r.user.id !== userId) }))
      }
      for (const userId of data.responsibles ?? []) {
        if (creation.users.has(userId)) continue
        const result = await addResponsibleAction(creation.card.id, userId)
        if ('error' in result) throw new Error(result.error)
        creation.users.add(userId)
        const user = users?.find(u => u.id === userId)
        patchCardState(creation.card.id, c => ({ ...c, responsibles: [...(c.responsibles ?? []), { user: { id: userId, name: user?.name ?? '', avatarUrl: user?.avatarUrl ?? null } }] }))
      }
      for (const file of data.files ?? []) {
        if (creation.files.has(file)) continue
        const attachment = await uploadCardAttachment(creation.card.id, file)
        if (!attachment) throw new Error('Não foi possível enviar o anexo.')
        creation.files.add(file)
        patchCardState(creation.card.id, c => ({ ...c, attachments: [...(c.attachments ?? []), toSprintAttachment(attachment)] }))
      }
      creations.current.delete(destination)
      return { success: true }
    } catch (error) {
      return { error: `${creations.current.has(destination) ? 'Tarefa criada. Tentar novamente continua na mesma tarefa. ' : ''}${error instanceof Error ? error.message : 'Erro de rede.'}` }
    }
  }
  function handleAddBacklogCardModal(data: NewCardData) { return createCard('BACKLOG', data) }
  function handleAddCard(columnId: string, data: NewCardData) { return createCard(columnId, data) }
  async function handleUpdateCard(cardId: string, data: NewCardData): Promise<CardSubmitResult> {
    if (!permissions.has('quadro:cards')) return { error: 'Sem permissão para editar tarefas.' }
    return confirmed(`card:${cardId}`, () => updateCardInSprintAction(sprint.id, cardId, cardPayload(data)), () => patchCardState(cardId, c => ({ ...c, title: data.title, description: data.description, color: data.color, priority: data.priority, startDate: data.startDate, endDate: data.endDate })))
  }
  const handleUpdateBacklogCard = handleUpdateCard
  async function handleDeleteCard(cardId: string) {
    if (!permissions.has('quadro:excluir')) return
    await confirmed(`card:${cardId}`, () => deleteCardInSprintAction(sprint.id, cardId), () => {
      setBacklogCards(cards => cards.filter(c => c.id !== cardId))
      setColumns(cols => cols.map(col => ({ ...col, cards: col.cards.filter(c => c.id !== cardId) })))
    })
  }
  const handleDeleteBacklogCard = handleDeleteCard

  return (
    <div 
      className={`h-full w-full flex flex-col overflow-hidden bg-cover bg-center bg-fixed transition-all duration-700 selection:bg-blue-500/30 ${!isImageBg ? boardBg : ''}`}
      style={isImageBg ? { backgroundImage: boardBg } : {}}
    >
      {Object.entries(mutationErrors).map(([key, failure]) => <div key={key} role="alert" className="bg-red-50 text-red-800 p-3 text-sm">{failure.message} <button type="button" onClick={() => void failure.retry()} className="underline">Tentar novamente</button></div>)}
      <SprintHeader 
        sprint={sprint} 
        currentUser={currentUser} 
        tags={tags}
        filters={filters}
        onFiltersChange={setFilters}
        onChangeBackground={setBoardBg} 
        projectId={projectId}
      />

      {permissions.has('quadro:cards') && (
        <CardsSemResponsavel
          pendentes={cardsSemResponsavel}
          users={users ?? []}
          onAtribuir={atribuirResponsavel}
          onAbrirCard={id => setOpenCardId(id)}
        />
      )}

      <div
        ref={scrollContainerRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex-1 overflow-x-auto overflow-y-hidden cursor-default ${isDragging ? 'cursor-grabbing select-none' : ''}
          [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-black/10 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-white/30`}
      >
        <div className="h-full inline-flex items-start p-6 space-x-4">
          <DragDropContext onDragEnd={handleDragEnd}>

            {/* Coluna virtual de Backlog — global por projeto, mesmo design das outras colunas */}
            {projectId && (
              <div className="flex flex-col w-72 sm:w-80 max-h-full shrink-0 bg-gray-100/90 backdrop-blur-sm rounded-2xl shadow-sm border border-black/5 overflow-hidden">

                {/* Header — igual ao ColumnHeader mas sem rename/delete */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-gray-800 text-sm tracking-tight">Backlog</span>
                    <span className="bg-gray-200/50 text-gray-600 text-[10px] font-bold rounded-md px-1.5 py-0.5 min-w-[20px] text-center border border-black/5">
                      {backlogSearching ? `${backlogShown.length}/${backlogVisible.length}` : backlogCards.length}
                    </span>
                  </div>
                  <ColumnSearchButton
                    columnTitle="Backlog"
                    open={backlogSearchOpen}
                    onToggle={() => (backlogSearchOpen ? closeBacklogSearch() : setBacklogSearchOpen(true))}
                  />
                </div>

                {backlogSearchOpen && (
                  <ColumnSearchInput
                    columnTitle="Backlog"
                    value={backlogSearch}
                    onChange={setBacklogSearch}
                    onClose={closeBacklogSearch}
                    shown={backlogShown.length}
                    total={backlogVisible.length}
                  />
                )}

                {/* Cards */}
                <Droppable droppableId="BACKLOG" type="CARD" isDropDisabled={backlogSearching}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`px-2 pb-2 flex flex-col gap-2 overflow-y-auto min-h-0
                        [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-black/10 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-black/20
                        ${snapshot.isDraggingOver ? 'bg-blue-50/50' : ''}`}
                    >
                      {backlogSearching && backlogShown.length === 0 && (
                        <div className="flex items-center justify-center h-16 rounded-xl text-xs text-gray-400 mx-2 mt-2 shrink-0">
                          Nenhum card corresponde à busca
                        </div>
                      )}
                      {!backlogSearching && backlogCards.length === 0 && !snapshot.isDraggingOver && (
                        <div className="flex items-center justify-center h-16 border-2 border-dashed border-gray-300 rounded-xl text-xs text-gray-400 mx-2 mt-2 shrink-0">
                          Arraste cards aqui
                        </div>
                      )}
                      {backlogShown.map((card, index) => (
                        <div key={card.id} className="shrink-0">
                          <CardComponent
                            card={toCardType(card, sprint.id, inativos)}
                            index={index}
                            columnId="BACKLOG"
                            onUpdate={handleUpdateBacklogCard}
                            onDelete={handleDeleteBacklogCard}
                            users={users}
                            boardTags={tags}
                            onClick={() => setOpenCardId(card.id)}
                            onTimerStarted={handleCardTimerStarted}
                            dragDisabled={filtering || backlogSearching}
                          />
                        </div>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>

                {/* Footer — igual ao das outras colunas */}
                <div className="p-2 border-t border-black/5 bg-gray-100 rounded-b-2xl shrink-0">
                  <button
                    disabled={!permissions.has('quadro:cards')}
                    onClick={() => setAddingBacklogCard(true)}
                    className="w-full flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 hover:text-blue-600 hover:bg-white rounded-xl transition-all active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    Adicionar card
                  </button>
                </div>
              </div>
            )}

            <Droppable droppableId="sprint-columns" direction="horizontal" type="COLUMN">
                {provided => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className="flex h-full items-start space-x-4"
                  >
                    {columns.map((col, index) => (
                      <div key={col.id} className="h-full">
                        <ColumnComponent
                          column={toColumnType(col)}
                          cards={visibleCards(col.cards, isColunaConcluida(col.title)).map(c => toCardType(c, sprint.id, inativos))}
                          dragDisabled={filtering}
                          index={index}
                          onRenameColumn={handleRenameColumn}
                          onChangeColumnColor={handleChangeColumnColor}
                          onDeleteColumn={handleDeleteColumn}
                          onAddCard={(colId) => setAddingCardToColumn(colId)}
                          onUpdateCard={handleUpdateCard}
                          onDeleteCard={handleDeleteCard}
                          users={users}
                          boardTags={tags}
                          onCardClick={(cardId) => setOpenCardId(cardId)}
                          onTimerStarted={handleCardTimerStarted}
                        />
                      </div>
                    ))}
                    {provided.placeholder}

                    <div className="w-72 shrink-0 h-full">
                      {addingCol ? (
                        <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-white/20 animate-in fade-in zoom-in-95 duration-300">
                          <input
                            autoFocus
                            value={newColTitle}
                            onChange={e => setNewColTitle(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleAddColumn()
                              if (e.key === 'Escape') setAddingCol(false)
                            }}
                            placeholder="Título da coluna..."
                            className="w-full px-4 py-2.5 bg-gray-100/50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 transition-all mb-3"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleAddColumn}
                              className="flex-1 bg-blue-600 text-white text-xs font-bold py-2 rounded-lg hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
                            >
                              Criar Coluna
                            </button>
                            <button
                              onClick={() => setAddingCol(false)}
                              className="px-3 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-all"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          disabled={!permissions.has('quadro:sprints')}
                          onClick={() => setAddingCol(true)}
                          className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-2xl text-sm text-white font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] group"
                        >
                          <div className="bg-white/20 p-1 rounded-md group-hover:bg-blue-500 transition-colors">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                          </div>
                          Nova Coluna
                        </button>
                      )}
                    </div>

                    <div className="w-8 shrink-0 invisible" />
                  </div>
                )}
              </Droppable>
          </DragDropContext>
        </div>
      </div>

      {/* MODAL DO CARD - TOTALMENTE INTEGRADO */}
      {(() => {
        if (!openCardId) return null

        // Card pode estar em uma coluna ou no backlog (coluna virtual).
        const currentColumn = columns.find(col => col.cards.some(c => c.id === openCardId))
        const openCardRaw = currentColumn?.cards.find(c => c.id === openCardId) ?? backlogCards.find(c => c.id === openCardId)

        if (!openCardRaw) return null

        const openCardType = toCardType(openCardRaw, sprint.id, inativos)
        // Cards na coluna de conclusão (mesmo renomeada: "Done", "Entregue"…): só visualização.
        const readOnly = !!currentColumn && isColunaConcluida(currentColumn.title)
        const isBacklog = !currentColumn

        return (
          <CardModal
            key={openCardId}
            isOpen
            readOnly={readOnly}
            onClose={fecharCard}
            onSubmit={data => {
              if (readOnly) return Promise.resolve({ error: 'Tarefa somente para leitura.' })
              return isBacklog ? handleUpdateBacklogCard(openCardId, data) : handleUpdateCard(openCardId, data)
            }}
            initialCard={openCardType}
            users={users}
            boardTags={tags}
            onTimerStarted={handleCardTimerStarted}
            onPatch={async patch => {
              const cardId = openCardId
              const result = await patchCardAction(sprint.id, cardId, patch)
              if ('error' in result && result.error) return { error: result.error }
              patchCardState(cardId, c => ({ ...c, ...patch }))
            }}
            
            // Repassando os anexos (o componente CardModal já mapeia eles)
            attachments={openCardType.attachments}
            
            onAttachmentUpload={async (file) => {
              if (!openCardId) return
              const att = await uploadCardAttachment(openCardId, file)
              if (att) patchCardState(openCardId, c => ({ ...c, attachments: [...(c.attachments ?? []), toSprintAttachment(att)] }))
            }}
            onAttachmentRename={async (attachmentId, newName) => {
              if (!openCardId) return
              const result = await renameAttachmentAction(attachmentId, openCardId, newName)
              if ('error' in result) { toast(result.error as string, 'error'); return }
              patchCardState(openCardId, c => ({
                ...c,
                attachments: (c.attachments ?? []).map(a => a.id === attachmentId ? { ...a, fileName: newName } : a),
              }))
            }}
            onAttachmentDelete={async (attachmentId) => {
              if (!openCardId) return
              const result = await deleteAttachmentAction(attachmentId, openCardId)
              if ('error' in result) { toast(result.error as string, 'error'); return }
              patchCardState(openCardId, c => ({ ...c, attachments: (c.attachments ?? []).filter(a => a.id !== attachmentId) }))
            }}
            onAttachmentSetCover={async (attachmentId) => {
              if (!openCardId) return
              const result = await setCoverAction(openCardId, attachmentId)
              if ('error' in result) { toast(result.error as string, 'error'); return }
              patchCardState(openCardId, c => ({
                ...c,
                attachments: (c.attachments ?? []).map(a => ({ ...a, isCover: a.id === attachmentId })),
              }))
            }}
            onAddComment={async (content) => {
              if (!openCardId) return
              const res = await createCommentAction(openCardId, content)
              if ('error' in res && res.error) {
                toast(res.error as string, 'error')
                return
              }
              if (res.comment) setCardComments(prev => [...prev, res.comment!])
            }}
            onEditComment={async (commentId, content) => {
              if (!openCardId) return
              const res = await updateCommentAction(openCardId, commentId, content)
              if ('error' in res && res.error) { toast(res.error as string, 'error'); return }
              setCardComments(prev => prev.map(c => c.id === commentId ? { ...c, content } : c))
            }}
            onDeleteComment={async (commentId) => {
              if (!openCardId) return
              const res = await deleteCommentAction(openCardId, commentId)
              if ('error' in res && res.error) { toast(res.error as string, 'error'); return }
              setCardComments(prev => prev.filter(c => c.id !== commentId))
            }}
            currentUser={currentUser ?? undefined}
            onResponsiblesChange={(responsibles) => {
              if (!openCardId) return
              patchCardState(openCardId, c => ({
                ...c,
                responsibles: responsibles.map(r => ({ user: { id: r.user.id, name: r.user.name, avatarUrl: r.user.avatarUrl } })),
              }))
            }}
            comments={cardComments.filter(c => c.user).map(c => ({
              id: c.id,
              user: { id: c.user.id, name: c.user.name, email: '', avatarUrl: c.user.avatarUrl ?? null },
              content: c.content,
              createdAt: new Date(c.createdAt),
            }))}
          />
        )
      })()}

      {/* Montados só quando abertos: cada abertura começa com o formulário limpo. */}
      {addingCardToColumn && <CardModal
        isOpen={!!addingCardToColumn}
        onClose={() => { if (addingCardToColumn) creations.current.delete(addingCardToColumn); setAddingCardToColumn(null) }}
        onSubmit={async (data) => {
          return addingCardToColumn ? handleAddCard(addingCardToColumn, data) : { error: 'Selecione uma coluna.' }
        }}
        users={users}
        boardTags={tags}
      />}

      {addingBacklogCard && <CardModal
        isOpen={addingBacklogCard}
        onClose={() => { creations.current.delete('BACKLOG'); setAddingBacklogCard(false) }}
        onSubmit={handleAddBacklogCardModal}
        users={users}
        boardTags={tags}
      />}

      {/* Diálogo de motivo para movimentação retroativa */}
      {pendingMove && (
        <Modal isOpen onClose={cancelPendingMove} title="Motivo da movimentação">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold text-gray-900 mb-1">Motivo da movimentação</h3>
            <p className="text-sm text-gray-500 mb-4">
              Por que este card está voltando para uma etapa anterior?
            </p>
            <textarea
              autoFocus
              value={pendingMove.reason}
              onChange={e => setPendingMove(prev => prev ? { ...prev, reason: e.target.value } : null)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey && pendingMove.reason.trim()) { e.preventDefault(); confirmPendingMove() }
                if (e.key === 'Escape') cancelPendingMove()
              }}
              placeholder="Ex: Bug encontrado em produção, cliente solicitou revisão..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancelPendingMove}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmPendingMove}
                disabled={!pendingMove.reason.trim()}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
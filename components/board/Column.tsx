'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useState } from 'react'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { Draggable, Droppable } from '@hello-pangea/dnd'
import { Column as ColumnType, Card as CardType, CardColor } from '@/types/kanban'
import ColumnHeader from './ColumnHeader'
import CardComponent from '@/components/card/Card'
import { isColunaConcluida } from '@/lib/cardUtils'
import { buscarCards } from '@/lib/cardFilters'
import { ColumnSearchInput } from './ColumnSearch'

interface User { id: string; name: string; email: string }
interface Tag { id: string; name: string; color: string }

interface ColumnProps {
  column: ColumnType
  cards: CardType[]
  index: number
  isBacklog?: boolean
  isVirtual?: boolean
  onRenameColumn?: (columnId: string, title: string) => void
  onChangeColumnColor?: (columnId: string, color: string | null) => void
  onDeleteColumn?: (columnId: string) => void
  onAddCard: (columnId: string) => void
  onUpdateCard: (cardId: string, data: { title: string; description: string; color: CardColor }) => void
  onDeleteCard: (cardId: string, columnId: string) => void
  users?: User[]
  boardTags?: Tag[]
  onCardClick: (cardId: string) => void
  onTimerStarted?: (cardId: string) => void
  /** Quadro filtrado/ordenado: cards não podem ser arrastados. */
  dragDisabled?: boolean
}

export default function Column({
  column, cards, index,
  isBacklog = false, isVirtual = false,
  onRenameColumn, onChangeColumnColor, onDeleteColumn,
  onAddCard, onUpdateCard, onDeleteCard,
  users, boardTags, onCardClick, onTimerStarted, dragDisabled = false,
}: ColumnProps) {

  const permissions = useProjectPermissions()
  const concluida = !isBacklog && isColunaConcluida(column.title)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searching = search.trim() !== ''
  const shownCards = searching ? buscarCards(cards, search) : cards
  // Com a busca, os índices exibidos não batem com os reais: a coluna não
  // arrasta nem recebe cards até a busca ser limpa.
  const cardDragDisabled = dragDisabled || searching
  function closeSearch() { setSearch(''); setSearchOpen(false) }

  const columnBg = isBacklog
    ? 'bg-slate-700/80 border-slate-500/30 backdrop-blur-md'
    : isVirtual
      ? 'bg-gray-100/70 border-dashed border-gray-300/60 backdrop-blur-sm'
      : 'bg-gray-100/90 backdrop-blur-sm border-black/5'

  return (
    <Draggable draggableId={column.id} index={index} isDragDisabled={isBacklog || !permissions.has('quadro:sprints')}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className={`flex flex-col w-72 sm:w-80 max-h-full shrink-0 rounded-2xl transition-shadow overflow-hidden border
            ${columnBg}
            ${snapshot.isDragging ? 'shadow-2xl ring-2 ring-blue-300 rotate-1' : 'shadow-sm'}`}
        >
          {/* HEADER DA COLUNA */}
          <div {...provided.dragHandleProps} className="drag-handle">
            {isBacklog ? (
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-500/20">
                <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
                </svg>
                <span className="text-sm font-semibold text-slate-200 flex-1">Backlog</span>
                <span className="text-xs bg-slate-500/40 text-slate-300 px-2 py-0.5 rounded-full font-medium">{cards.length}</span>
              </div>
            ) : (
              <ColumnHeader
                title={column.title}
                cardCount={searching ? `${shownCards.length}/${cards.length}` : cards.length}
                searchOpen={searchOpen}
                onToggleSearch={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
                onRename={permissions.has('quadro:sprints') && onRenameColumn ? (title) => onRenameColumn(column.id, title) : undefined}
                color={column.color ?? null}
                onChangeColor={permissions.has('quadro:sprints') && onChangeColumnColor ? (color) => onChangeColumnColor(column.id, color) : undefined}
                onDelete={permissions.has('quadro:sprints') && onDeleteColumn ? () => onDeleteColumn(column.id) : undefined}
              />
            )}
          </div>

          {searchOpen && !isBacklog && (
            <ColumnSearchInput
              columnTitle={column.title}
              value={search}
              onChange={setSearch}
              onClose={closeSearch}
              shown={shownCards.length}
              total={cards.length}
            />
          )}

          <Droppable droppableId={column.id} type="CARD" isDropDisabled={searching}>
            {(dropProvided, dropSnapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`px-2 pb-2 flex flex-col gap-2 overflow-y-auto min-h-0 transition-colors
                  [&::-webkit-scrollbar]:w-1.5
                  [&::-webkit-scrollbar-thumb]:rounded-full
                  ${isBacklog
                    ? '[&::-webkit-scrollbar-thumb]:bg-slate-400/30 hover:[&::-webkit-scrollbar-thumb]:bg-slate-400/50'
                    : '[&::-webkit-scrollbar-thumb]:bg-black/10 hover:[&::-webkit-scrollbar-thumb]:bg-black/20'}
                  ${dropSnapshot.isDraggingOver
                    ? isBacklog ? 'bg-slate-500/20' : 'bg-blue-50/50'
                    : ''}`}
              >
                {searching && shownCards.length === 0 && (
                  <div className="flex items-center justify-center h-16 rounded-xl text-xs mx-2 mt-2 shrink-0 text-gray-400">
                    Nenhum card corresponde à busca
                  </div>
                )}
                {!searching && cards.length === 0 && !dropSnapshot.isDraggingOver && (
                  <div className={`flex items-center justify-center h-16 border-2 border-dashed rounded-xl text-xs mx-2 mt-2 shrink-0
                    ${isBacklog ? 'border-slate-500/30 text-slate-400' : 'border-gray-300 text-gray-400'}`}>
                    {isBacklog ? 'Sem tasks no backlog' : 'Arraste cards aqui'}
                  </div>
                )}
                {shownCards.map((card, i) => (
                  <div key={card.id} className="shrink-0">
                    <CardComponent
                      card={card}
                      index={i}
                      columnId={column.id}
                      onUpdate={onUpdateCard}
                      onDelete={onDeleteCard}
                      users={users}
                      boardTags={boardTags}
                      onClick={() => onCardClick(card.id)}
                      onTimerStarted={onTimerStarted}
                      concluido={concluida}
                      dragDisabled={cardDragDisabled}
                    />
                  </div>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>

          {/* RODAPÉ: Adicionar Card */}
          <div className="p-2 border-t border-black/5 bg-gray-100 rounded-b-2xl shrink-0">
            <OperumButton variant="default" type="button"
              disabled={!permissions.has('quadro:cards')}
              onClick={() => onAddCard(column.id)} // Repassa o evento pro pai
              className="w-full flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-500 hover:text-blue-600 hover:bg-white rounded-xl transition-all active:scale-[0.98]"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Adicionar card
            </OperumButton>
          </div>
        </div>
      )}
    </Draggable>
  )
}

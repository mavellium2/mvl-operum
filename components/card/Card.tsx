'use client'

import { MENSAGEM_RESPONSAVEL_INATIVO } from '@/lib/responsavelInativo'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useState } from 'react'
import { Draggable } from '@hello-pangea/dnd'
import { Card as CardType, CardColor } from '@/types/kanban'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { TagBadge } from '@/components/tag/TagBadge'
import UserAvatar from '@/components/user/UserAvatar'
import { useCardTimer } from '@/hooks/useCardTimer'
import { prazoStatus, formatPrazoCurto, type PrazoStatus } from '@/lib/cardUtils'
import { useClientNow } from '@/hooks/useClientNow'

interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
}

interface Tag {
  id: string
  name: string
  color: string
}

interface CardProps {
  card: CardType
  index: number
  columnId: string
  onUpdate: (cardId: string, data: { title: string; description: string; color: CardColor }) => void
  onDelete: (cardId: string, columnId: string) => void
  users?: User[]
  boardTags?: Tag[]
  onClick: () => void
  /** Disparado quando o timer é iniciado a partir do card fechado. */
  onTimerStarted?: (cardId: string) => void
  /** Card numa coluna de conclusão: o prazo não aparece como atrasado. */
  concluido?: boolean
  /** Desliga o arraste (ex.: quadro filtrado/ordenado, índices não batem). */
  dragDisabled?: boolean
}

const PRIORIDADE_STYLE: Record<string, { label: string; cls: string; dot: string }> = {
  alta: { label: 'Alta', cls: 'bg-red-50 text-red-700', dot: 'bg-red-500' },
  media: { label: 'Média', cls: 'bg-amber-50 text-amber-800', dot: 'bg-amber-500' },
  baixa: { label: 'Baixa', cls: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
}

const PRAZO_STYLE: Record<PrazoStatus, { cls: string; title: string }> = {
  ok: { cls: 'bg-gray-100 text-gray-600', title: 'Prazo' },
  proximo: { cls: 'bg-amber-100 text-amber-800', title: 'Vence em até 2 dias' },
  atrasado: { cls: 'bg-red-100 text-red-700', title: 'Prazo vencido' },
  concluido: { cls: 'bg-gray-100 text-gray-400 line-through', title: 'Prazo (card concluído)' },
}

/** Minutos → "8h" ou "1h35" (mesma leitura da coluna Horas da planilha). */
export function formatTempo(min?: number | null): string {
  if (min == null || min <= 0) return ''
  const total = Math.round(min)
  const h = Math.floor(total / 60), m = total % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** "2026-10-21" (ou Date) → "21/10"; ano só quando não é o corrente. */
function formatDataCurta(d: Date | string | null | undefined): string {
  if (!d) return ''
  const iso = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10)
  const [y, m, dia] = iso.split('-')
  if (!y || !m || !dia) return ''
  return y === String(new Date().getFullYear()) ? `${dia}/${m}` : `${dia}/${m}/${y}`
}

function formatCardTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function Card({ card, index, columnId, onDelete, onClick, onTimerStarted, concluido = false, dragDisabled = false }: CardProps) {
  const permissions = useProjectPermissions()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const timer = useCardTimer(card.id)
  const isTimerRunning = timer.isRunning
  const elapsedSeconds = timer.elapsed

  const hasDescription = !!card.description?.trim()
  const tituloExibido = card.eapCode ? `${card.eapCode} - ${card.title}` : card.title
  const hasAttachments = card.attachments && card.attachments.length > 0
  const cover = card.attachments?.find(a => a.isCover)

  const orcadoMin = card.orcado_min ?? null
  const realizadoMin = card.realizado_min ?? null
  const isOverrun = orcadoMin != null && orcadoMin > 0 && realizadoMin != null && realizadoMin > orcadoMin
  const hasTempoData = (orcadoMin ?? 0) > 0 || (realizadoMin ?? 0) > 0
  const dataPrevista = formatDataCurta(card.data_prevista)
  const dataRealizada = formatDataCurta(card.data_realizacao)
  // Em aberto mostra o valor orçado; concluído, o realizado (com a data realizada).
  const valor = concluido
    ? (card.realizado_total != null ? { rotulo: 'Realizado', texto: brl(card.realizado_total) } : null)
    : (card.orcado_total != null ? { rotulo: 'Orçado', texto: brl(card.orcado_total) } : null)

  // Depende do relógio e do fuso do navegador: só calcula no cliente.
  const now = useClientNow()
  const prazo = now ? prazoStatus(card.endDate, now, concluido) : null
  const prioridade = card.priority ? PRIORIDADE_STYLE[card.priority] : undefined

  const handleTimerClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if ((!isTimerRunning && !permissions.has('quadro:cards')) || timer.loading) return
    const wasRunning = isTimerRunning
    if (await timer.toggle() && !wasRunning) onTimerStarted?.(card.id)
  }

  return (
    <>
      <Draggable draggableId={card.id} index={index} isDragDisabled={dragDisabled || !permissions.has('quadro:mover')}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            {...provided.dragHandleProps}
            className={`group bg-white rounded-xl shadow-sm border border-gray-200/75 overflow-hidden cursor-pointer transition-all duration-200 flex flex-col drag-handle
              ${isOverrun ? 'border-l-red-500' : ''}
              ${snapshot.isDragging ? 'shadow-2xl rotate-2 ring-2 ring-blue-400 scale-105 z-50' : 'hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5 active:scale-[0.98]'}`}
            style={{
              ...provided.draggableProps.style,
              borderLeftWidth: cover ? '0' : '4px',
              borderLeftColor: isOverrun ? '#ef4444' : card.color,
              borderTopWidth: cover ? '4px' : '0',
              borderTopColor: cover ? card.color : 'transparent',
            }}
            onClick={onClick}
          >
            {/* Flag vermelha de estouro */}
            {isOverrun && (
              <div data-testid="card-overrun-flag" className="absolute top-2 right-2 z-10 text-red-500 text-sm" title="Tempo realizado excede o planejado">
                ⚑
              </div>
            )}

            {/* Capa */}
            {cover && (
              <div className="w-full h-32 overflow-hidden border-b border-gray-100 bg-gray-100 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${cover.id}/image`} alt="Capa" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              </div>
            )}

            <div className="p-3.5 flex-1 flex flex-col">

              {/* Tags */}
              {card.tags && card.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {card.tags.map(ct => (
                    <TagBadge key={ct.tagId} name={ct.tag.name} color={ct.tag.color} className="text-[10px] px-2 py-0.5" />
                  ))}
                </div>
              )}

              {/* Título + botões de ação (prioridade + lixeira) */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <button type="button" onClick={event => { event.stopPropagation(); onClick() }} aria-label={`Abrir tarefa ${tituloExibido}`} className="text-[14px] font-bold text-gray-800 leading-snug flex-1 break-words text-left rounded focus-visible:ring-2 focus-visible:ring-blue-500">
                  {tituloExibido}
                </button>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0 -mt-1 -mr-1">
                  <button
                    disabled={!permissions.has('quadro:excluir')}
                    onClick={e => { e.stopPropagation(); if (permissions.has('quadro:excluir')) setConfirmOpen(true) }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    aria-label="Excluir card"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {card.precisaResponsavel && !concluido && (
                <p
                  role="note"
                  title={MENSAGEM_RESPONSAVEL_INATIVO}
                  className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800"
                >
                  Responsável inativo: adicione outro para concluir
                </p>
              )}

              {/* Descrição truncada */}
              {hasDescription && (
                <p
                  data-testid="card-description"
                  title={card.description}
                  className="text-xs text-gray-500 line-clamp-2 mb-2 leading-relaxed"
                >
                  {card.description}
                </p>
              )}

              {/* Prioridade + prazo: sempre visíveis (antes a prioridade só aparecia no hover) */}
              {(prioridade || (prazo && card.endDate)) && (
                <div className="flex flex-wrap items-center gap-1.5 mb-1">
                  {prioridade && (
                    <span
                      data-testid="card-prioridade"
                      title={`Prioridade ${prioridade.label.toLowerCase()}`}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${prioridade.cls}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${prioridade.dot}`} aria-hidden="true" />
                      {prioridade.label}
                    </span>
                  )}
                  {prazo && card.endDate && (
                  <span
                    data-testid="card-prazo"
                    data-status={prazo}
                    title={`${PRAZO_STYLE[prazo].title}: ${new Date(card.endDate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${PRAZO_STYLE[prazo].cls}`}
                  >
                    <span aria-hidden="true">📅</span>
                    {formatPrazoCurto(card.endDate, now ?? undefined)}
                  </span>
                  )}
                </div>
              )}

              {/* Planejamento x execução da atividade (Planilha de Custos) */}
              {(dataPrevista || dataRealizada || valor) && (
                <div data-testid="card-planilha" className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1 text-[11px] text-gray-600">
                  {dataPrevista && (
                    <span data-testid="card-data-prevista" title="Data prevista (orçado)">
                      <span className="text-gray-400">Prev.</span> {dataPrevista}
                    </span>
                  )}
                  {(dataRealizada || concluido) && (
                    <span data-testid="card-data-realizada" title="Data realizada" className={dataRealizada ? 'text-green-700' : 'text-gray-400'}>
                      <span className="text-gray-400">Real.</span> {dataRealizada || '—'}
                    </span>
                  )}
                  {valor && (
                    <span data-testid="card-valor" title={`Valor ${valor.rotulo.toLowerCase()} na Planilha de Custos`} className="font-semibold text-gray-700">
                      <span className="font-normal text-gray-400">{valor.rotulo}</span> {valor.texto}
                    </span>
                  )}
                </div>
              )}

              <div className="flex-1" />

              {timer.error && <p role="alert" className="text-xs text-red-600">{timer.error} <button type="button" onClick={event => { event.stopPropagation(); void timer.refresh() }} disabled={timer.loading}>Atualizar timer</button></p>}
              {/* Rodapé */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 gap-2">

                {/* Esquerda: ícones + timer */}
                <div className="flex items-center gap-3.5 text-gray-500">
                  {hasAttachments && (
                    <div className="flex items-center gap-1 text-xs font-semibold" title="Anexos">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                      </svg>
                      {card.attachments?.length}
                    </div>
                  )}

                  {/* Timer */}
                  <button type="button"
                    disabled={timer.loading || !timer.known || (!isTimerRunning && !permissions.has('quadro:cards'))}
                    aria-label={isTimerRunning ? 'Pausar timer' : 'Iniciar timer'}
                    className={`flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md transition-colors ${isTimerRunning ? 'bg-green-50' : 'hover:bg-gray-100'}`}
                    aria-disabled={!isTimerRunning && !permissions.has('quadro:cards')}
                    onClick={handleTimerClick}
                    title={isTimerRunning ? 'Pausar tempo' : 'Iniciar tempo'}
                  >
                    {isTimerRunning ? (
                      <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 shadow-sm hover:bg-red-200 transition-colors">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z" /></svg>
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-600 transition-colors shadow-sm">
                        <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                      </div>
                    )}
                    <span className={`text-xs font-mono font-bold tracking-tight mt-px ${isTimerRunning ? 'text-green-700' : 'text-gray-600'}`}>{timer.known ? formatCardTimer(elapsedSeconds) : '—'}</span>
                  </button>
                </div>

                {/* Direita: tempo planejado/realizado + avatares */}
                <div className="flex items-center gap-2.5">

                  {/* Tempo */}
                  {hasTempoData && (
                    <div
                      data-testid="card-tempo-row"
                      title="Horas orçadas / realizadas (Planilha de Custos)"
                      className={`flex items-center gap-1 text-[11px] font-mono font-bold ${isOverrun ? 'text-red-500' : 'text-gray-500'}`}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span>{formatTempo(orcadoMin) || '—'}</span>
                      <span className="text-gray-400">/</span>
                      <span>{formatTempo(realizadoMin) || '—'}</span>
                    </div>
                  )}

                  {/* Avatares */}
                  {card.responsibles && card.responsibles.length > 0 && (
                    <div className="flex -space-x-2 overflow-hidden hover:space-x-0.5 transition-all duration-300">
                      {card.responsibles.slice(0, 3).map(r => (
                        <div key={r.user.id} className="ring-[2px] ring-white rounded-full bg-gray-200 shrink-0">
                          <UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} size="sm" />
                        </div>
                      ))}
                      {card.responsibles.length > 3 && (
                        <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-500 z-10 shadow-sm shrink-0">
                          +{card.responsibles.length - 3}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}
      </Draggable>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => onDelete(card.id, columnId)}
        title="Excluir card"
        message={`Tem certeza que deseja excluir o card "${card.title}"? Esta ação não pode ser desfeita.`}
      />
    </>
  )
}

'use client'

import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'

import { useState, useEffect, useRef, useCallback, useId } from 'react'
import type { LinhaAtividade } from '@/lib/planilhaCustos'
import { fmtDataBR } from '@/lib/planilhaCustos'
import { Card, CardColor, Attachment } from '@/types/kanban'
import { assignTagToCardAction, removeTagFromCardAction } from '@/app/actions/tags'
import { addManualTimeAction, getTimeEntriesAction, updateTimeEntryAction, deleteTimeEntryAction } from '@/app/actions/time'
import { getCardPlanilhaAction, getCardMovementsAction } from '@/app/actions/sprintBoard'
import CardTimer from './CardTimer'
import UserAvatar from '@/components/user/UserAvatar'
import ColorPicker from './ColorPicker'
import { TagSelector } from '../tag/TagSelector'
import MultiUserSelector from './MultiUserSelector'
import { useOverlay } from '@/hooks/useOverlay'
import { useAutosave } from '@/hooks/useAutosave'
import { toDatetimeLocal, fromDatetimeLocal } from '@/lib/cardUtils'
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_TYPES_LABEL, MAX_ATTACHMENT_MB, erroDoAnexo,
  isLinkAttachment, linkHref, linkHost, linkThumbnail,
} from '@/lib/attachmentTypes'

interface User { id: string; name: string; email: string; avatarUrl?: string | null }
interface Tag { id: string; name: string; color: string }
interface Comment { id: string; user: User; content: string; createdAt: Date }
interface TimeEntry { id: string; duration: number; description?: string | null; isManual: boolean; isRunning: boolean; startedAt: string | Date; endedAt?: string | Date | null }
interface CardMovement { id: string; fromColumnTitle: string | null; toColumnTitle: string | null; reason: string | null; movedAt: string }
interface Responsible { userId: string; user: { id: string; name: string; avatarUrl: string | null } }

export type CardSubmitResult = { success: true } | { error: string }

interface CardModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { title: string; description: string; color: CardColor; priority: string; responsibles?: string[]; files?: File[]; startDate?: string | null; endDate?: string | null }) => Promise<CardSubmitResult>
  initialCard?: Card
  /** Modo somente-leitura: cards concluídos podem ser vistos mas não editados. */
  readOnly?: boolean
  users?: User[]
  boardTags?: Tag[]
  attachments?: Attachment[]
  /** Pode devolver a Promise do envio: o modal mostra "Enviando…" até ela terminar. */
  onAttachmentUpload?: (file: File) => void | Promise<void>
  onAttachmentRename?: (attachmentId: string, newName: string) => void
  onAttachmentDelete?: (attachmentId: string) => void
  onAttachmentSetCover?: (attachmentId: string) => void
  comments?: Comment[]
  onAddComment?: (content: string) => void
  onEditComment?: (commentId: string, content: string) => Promise<void>
  onDeleteComment?: (commentId: string) => Promise<void>
  currentUser?: User
  onResponsiblesChange?: (responsibles: Responsible[]) => void
  /** Disparado quando o timer é iniciado dentro do modal (Correção 6). */
  onTimerStarted?: (cardId: string) => void
  /**
   * Grava alterações parciais de um card existente (autosave da descrição).
   * Sem ele, a descrição só é enviada pelo botão "Salvar" do modal.
   */
  onPatch?: (patch: CardPatch) => Promise<{ error?: string } | void>
}

export interface CardPatch {
  description?: string
  startDate?: string | null
  endDate?: string | null
}

const DEFAULT_COLOR: CardColor = '#94a3b8'

const PRIORITY_LABELS: Record<string, { label: string; cls: string }> = {
  baixa:  { label: 'Baixa',  cls: 'bg-slate-100 text-slate-600' },
  media:  { label: 'Média',  cls: 'bg-yellow-100 text-yellow-700' },
  alta:   { label: 'Alta',   cls: 'bg-red-100 text-red-600' },
}

function formatDuration(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/** Tipos que a rota /api/files/:id/image serve (e o lightbox mostra). */
const PREVIEW_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])

/** Link para abrir o arquivo: a rota confere a sessão e redireciona para a URL assinada (SDD 4.2). */
function downloadHref(attachmentId: string, cardId: string): string {
  return `/api/files/${attachmentId}/download?cardId=${encodeURIComponent(cardId)}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentIcon({ fileType }: { fileType: string }) {
  if (isLinkAttachment(fileType)) {
    return (
      <svg className="w-4 h-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    )
  }
  if (fileType.startsWith('image/')) {
    return (
      <svg className="w-4 h-4 shrink-0 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
      </svg>
    )
  }
  if (fileType.startsWith('video/')) {
    return (
      <svg className="w-4 h-4 shrink-0 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    )
  }
  if (fileType === 'application/pdf') {
    return (
      <svg className="w-4 h-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
      </svg>
    )
  }
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) {
    return (
      <svg className="w-4 h-4 shrink-0 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0c0 .621.504 1.125 1.125 1.125h15c.621 0 1.125-.504 1.125-1.125m-19.5 0v6.75c0 .621.504 1.125 1.125 1.125h15c.621 0 1.125-.504 1.125-1.125v-6.75m0 0V5.625" />
      </svg>
    )
  }
  return (
    <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  )
}

export default function CardModal({
  isOpen, onClose, onSubmit, initialCard, readOnly: requestedReadOnly = false, users, boardTags,
  attachments = [], onAttachmentUpload, onAttachmentRename, onAttachmentDelete, onAttachmentSetCover,
  comments = [], onAddComment, onEditComment, onDeleteComment, currentUser, onResponsiblesChange, onTimerStarted, onPatch,
}: CardModalProps) {

  const permissions = useProjectPermissions()
  const readOnly = requestedReadOnly || !permissions.has('quadro:cards')
  // O estado começa com os dados do card que o quadro já tem: o card abre preenchido
  // na hora. O pai monta um modal novo por card (key), então não é preciso reiniciar
  // o formulário num efeito. Antes isso era feito num startTransition, que o React 19
  // prende às Server Actions em andamento (fila serial do Next): título e descrição
  // só apareciam 3–10 s depois, quando terminavam tempo, movimentações e comentários.
  const [title, setTitle]                   = useState(() => initialCard?.title ?? '')
  const [color, setColor]                   = useState<CardColor>(() => initialCard?.color ?? DEFAULT_COLOR)
  const [priority, setPriority]             = useState(() => initialCard?.priority ?? 'media')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(() => initialCard?.tags?.map(t => t.tagId) ?? [])
  const [selectedResponsibleIds, setSelectedResponsibleIds] = useState<string[]>([])
  const [linhaPlanilha, setLinhaPlanilha] = useState<LinhaAtividade | null>(null)
  const [erroPlanilha, setErroPlanilha] = useState('')
  const canViewSheet = permissions.has('planilha:ver')
  useEffect(() => {
    if (!isOpen || !initialCard?.id || !canViewSheet) return
    let active = true
    void getCardPlanilhaAction(initialCard.id).then(result => {
      if (!active) return
      setLinhaPlanilha('linha' in result ? result.linha ?? null : null)
      setErroPlanilha(result.error ?? '')
    }).catch(() => { if (active) setErroPlanilha('Não foi possível carregar os dados da planilha.') })
    return () => { active = false }
  }, [isOpen, initialCard?.id, canViewSheet])
  const [error, setError]                   = useState('')

  const [savedDescription, setSavedDescription] = useState(() => initialCard?.description ?? '')
  const [draftDescription, setDraftDescription] = useState(() => initialCard?.description ?? '')
  const [isEditingDesc, setIsEditingDesc]       = useState(false)

  // Datas no formato do <input type="datetime-local"> (fuso do navegador).
  const [startLocal, setStartLocal] = useState(() => toDatetimeLocal(initialCard?.startDate))
  const [endLocal, setEndLocal]     = useState(() => toDatetimeLocal(initialCard?.endDate))

  const [commentText, setCommentText]   = useState('')
  const [isCommenting, setIsCommenting] = useState(false)

  const [showManualForm, setShowManualForm] = useState(false)
  const [manualHours, setManualHours]       = useState('')
  const [manualMinutes, setManualMinutes]   = useState('')
  const [manualSeconds, setManualSeconds]   = useState('')
  const [manualDesc, setManualDesc]         = useState('')
  const [timeError, setTimeError]           = useState('')

  const [timerKey, setTimerKey]           = useState(0)
  const [timeEntries, setTimeEntries]     = useState<TimeEntry[]>([])
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editHours, setEditHours]           = useState('')
  const [editMinutes, setEditMinutes]       = useState('')
  const [editDesc, setEditDesc]             = useState('')

  const [movements, setMovements]           = useState<CardMovement[]>([])
  const [activeHistoryTab, setActiveHistoryTab] = useState<'tempo' | 'movimentos'>('tempo')

  const [renamingId, setRenamingId]   = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [editingCommentId, setEditingCommentId]       = useState<string | null>(null)
  const [editCommentContent, setEditCommentContent]   = useState('')

  const [coverIndex] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [anexoErro, setAnexoErro] = useState('')
  const [preview, setPreview] = useState<Attachment | null>(null)

  const [enviandoAnexo, setEnviandoAnexo] = useState(false)

  const imageAttachments = attachments.filter(a => a.fileType.startsWith('image/'))
  const hasCover = imageAttachments.length > 0
  const isEditing = !!initialCard

  const initialCardId = initialCard?.id

  const initialCardRef = useRef(initialCard)
  useEffect(() => { initialCardRef.current = initialCard })

  const autosaveEnabled = isOpen && isEditing && !readOnly && !!onPatch
  const descAutosave = useAutosave(
    draftDescription,
    async (description: string) => {
      const savingCardId = initialCard?.id
      const res = await onPatch?.({ description })
      if (res && res.error) throw new Error(res.error)
      if (initialCardRef.current?.id === savingCardId) setSavedDescription(description)
    },
    { enabled: autosaveEnabled },
  )
  const resetDescAutosave = descAutosave.reset

  const datasValue = `${startLocal}|${endLocal}`
  const datasInvalidas = !!startLocal && !!endLocal && endLocal < startLocal
  const datasAutosave = useAutosave(
    datasValue,
    async (value: string) => {
      const [inicio, fim] = value.split('|')
      if (inicio && fim && fim < inicio) throw new Error('O prazo não pode ser antes do início.')
      const res = await onPatch?.({ startDate: fromDatetimeLocal(inicio), endDate: fromDatetimeLocal(fim) })
      if (res && res.error) throw new Error(res.error)
    },
    { enabled: autosaveEnabled, delay: 600 },
  )
  const resetDatasAutosave = datasAutosave.reset

  // O pai recria o objeto `initialCard` a cada render; reinicializar o
  // formulário por referência apagaria o que o usuário está digitando. O efeito
  // abaixo só alinha o autosave e busca tempo e movimentações (seções secundárias).

  const reloadTimeEntries = useCallback(async () => {
    if (!initialCardId) return
    const res = await getTimeEntriesAction(initialCardId)
    if ('entries' in res && res.entries) setTimeEntries(res.entries as TimeEntry[])
    setTimerKey(k => k + 1)
  }, [initialCardId])

  useEffect(() => {
    if (!isOpen) return
    const initialCard = initialCardRef.current
    resetDescAutosave(initialCard?.description ?? '')
    const inicio = toDatetimeLocal(initialCard?.startDate)
    const fim = toDatetimeLocal(initialCard?.endDate)
    resetDatasAutosave(`${inicio}|${fim}`)

    if (initialCard?.id) {
      getTimeEntriesAction(initialCard.id).then(res => {
        if ('entries' in res && res.entries) setTimeEntries(res.entries as TimeEntry[])
      })
      getCardMovementsAction(initialCard.id).then(res => {
        if ('movements' in res && res.movements) setMovements(res.movements as CardMovement[])
      })
    }
  }, [isOpen, initialCardId, resetDescAutosave, resetDatasAutosave])

  const handleTagToggle = async (tagId: string) => {
    if (!initialCard) return
    const adding = !selectedTagIds.includes(tagId)
    setSelectedTagIds(ids => adding ? [...ids, tagId] : ids.filter(id => id !== tagId))
    if (adding) await assignTagToCardAction(initialCard.id, tagId)
    else await removeTagFromCardAction(initialCard.id, tagId)
  }

  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const titleId = useId()
  const previewRef = useRef<HTMLDivElement>(null)
  const handleSave = async () => {
    if (savingRef.current) return
    if (!title.trim()) { setError('O título é obrigatório para salvar.'); return }
    if (datasInvalidas) { setError('O prazo não pode ser antes do início.'); return }
    savingRef.current = true
    setSaving(true); setError('')
    try {
      const flushed = await Promise.all([descAutosave.flush(), datasAutosave.flush()])
      if (flushed.some(success => !success)) throw new Error('Não foi possível salvar as alterações. Tente novamente.')
      const result = await onSubmit({ title: title.trim(), description: draftDescription,
        startDate: fromDatetimeLocal(startLocal), endDate: fromDatetimeLocal(endLocal), color, priority,
        responsibles: selectedResponsibleIds, files: pendingFiles })
      if (!result || 'error' in result) throw new Error(result?.error || 'Não foi possível confirmar o salvamento.')
      onClose()
    } catch (error) { setError(error instanceof Error ? error.message : 'Erro de rede. Tente novamente.') }
    finally { savingRef.current = false; setSaving(false) }
  }
  const handleCancel = async () => {
    if (savingRef.current) return
    if (!autosaveEnabled || [descAutosave.status, datasAutosave.status].every(status => status === 'idle' || status === 'saved')) { onClose(); return }
    savingRef.current = true; setSaving(true)
    try {
      const flushed = await Promise.all([descAutosave.flush(), datasAutosave.flush()])
      if (flushed.every(Boolean)) onClose()
      else setError('Não foi possível salvar as alterações. Tente novamente antes de fechar.')
    } finally { savingRef.current = false; setSaving(false) }
  }
  const zIndex = useOverlay(dialogRef, () => void handleCancel(), isOpen)
  const previewZIndex = useOverlay(previewRef, () => setPreview(null), isOpen && !!preview)

  const handleSaveDescription = () => {
    setSavedDescription(draftDescription)
    setIsEditingDesc(false)
  }

  const handleCloseDescEditor = () => {
    void descAutosave.flush()
    setIsEditingDesc(false)
  }

  const handleCommentSubmit = () => {
    if (!commentText.trim() || !onAddComment) return
    onAddComment(commentText)
    setCommentText('')
    setIsCommenting(false)
  }

  const handleRegisterTime = async () => {
    const h = parseInt(manualHours || '0', 10)
    const m = parseInt(manualMinutes || '0', 10)
    const s = parseInt(manualSeconds || '0', 10)
    if (h === 0 && m === 0 && s === 0) { setTimeError('Informe pelo menos 1 segundo.'); return }
    if (!manualDesc.trim()) { setTimeError('Descreva o que foi feito.'); return }
    if (!initialCard?.id) return
    setTimeError('')
    const res = await addManualTimeAction(initialCard.id, h, m, s, manualDesc.trim())
    if ('error' in res && res.error) { setTimeError(res.error as string); return }
    await reloadTimeEntries()
    setManualHours('')
    setManualMinutes('')
    setManualSeconds('')
    setManualDesc('')
    setShowManualForm(false)
  }

  const handleStartEditEntry = (entry: TimeEntry) => {
    setEditingEntryId(entry.id)
    setEditHours(String(Math.floor(entry.duration / 3600)))
    setEditMinutes(String(Math.floor((entry.duration % 3600) / 60)))
    setEditDesc(entry.description ?? '')
  }

  const handleSaveEditEntry = async () => {
    if (!editingEntryId) return
    const h = parseInt(editHours || '0', 10)
    const m = parseInt(editMinutes || '0', 10)
    await updateTimeEntryAction(editingEntryId, h, m, editDesc || undefined)
    setTimeEntries(prev => prev.map(e =>
      e.id === editingEntryId
        ? { ...e, duration: h * 3600 + m * 60, description: editDesc || null }
        : e
    ))
    setEditingEntryId(null)
  }

  const handleDeleteEntry = async (entryId: string) => {
    await deleteTimeEntryAction(entryId)
    setTimeEntries(prev => prev.filter(e => e.id !== entryId))
  }

  const insertMarkdown = (prefix: string, suffix = '') =>
    setDraftDescription(prev => prev + `${prefix}texto${suffix}`)

  const hasUnsavedDescription = draftDescription !== savedDescription

  const autosaveLabel: Record<string, { text: string; cls: string } | null> = {
    idle: null,
    pending: { text: 'Salvando…', cls: 'text-slate-400' },
    saving: { text: 'Salvando…', cls: 'text-slate-400' },
    saved: { text: 'Salvo', cls: 'text-emerald-600' },
    error: { text: 'Erro ao salvar. Tentar de novo', cls: 'text-red-600 hover:underline cursor-pointer' },
  }
  const autosaveInfo = autosaveEnabled ? autosaveLabel[descAutosave.status] : null

  if (!isOpen) return null

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{ zIndex }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-slate-900/50 backdrop-blur-sm"
    >
      <span id={titleId} className="sr-only">{isEditing ? `Tarefa: ${title}` : 'Nova tarefa'}</span>
      <div className="absolute inset-0" onClick={handleCancel} aria-hidden="true" />

      <div aria-busy={saving} className="relative w-full max-w-5xl h-[90vh] bg-white rounded-xl shadow-2xl font-sans flex flex-col overflow-hidden border border-slate-200">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white shrink-0">
          <div
            className="w-3.5 h-3.5 rounded-full shrink-0 ring-2 ring-slate-200"
            style={{ backgroundColor: color }}
          />
          {initialCard?.eapCode && (
            <span className="shrink-0 text-xl font-semibold text-slate-400 tabular-nums" title="Código na EAP">{initialCard.eapCode} -</span>
          )}
          {readOnly ? (
            <h2 className="flex-1 text-xl font-semibold text-slate-900 rounded px-1 truncate">{title}</h2>
          ) : (
            <input
              autoFocus
              value={title}
              disabled={saving}
              onChange={e => { setTitle(e.target.value); setError('') }}
              className="min-w-0 flex-1 bg-transparent text-xl font-semibold text-slate-900 outline-none focus:ring-1 focus:ring-blue-400 rounded px-1"
              placeholder="Título da tarefa..."
            />
          )}
          <button
            onClick={handleCancel}
            disabled={saving}
            aria-label="Fechar"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && <p role="alert" className="shrink-0 border-b bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

        {hasCover && (
          <div className="relative w-full h-40 bg-slate-100 shrink-0 border-b border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/files/${imageAttachments[coverIndex].id}/image`} alt="Capa" className="w-full h-full object-cover" />
          </div>
        )}

        {/* ── Body ── */}
        <div inert={saving} className="flex-1 flex min-h-0 overflow-hidden">

          {/* Coluna esquerda */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full">

            {/* Descrição */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descrição</h3>
                <div className="flex items-center gap-2">
                  {autosaveInfo && (
                    <button
                      type="button"
                      aria-live="polite"
                      disabled={descAutosave.status !== 'error'}
                      onClick={() => { void descAutosave.flush() }}
                      className={`text-[11px] font-medium ${autosaveInfo.cls}`}
                    >
                      {autosaveInfo.text}
                    </button>
                  )}
                  {!autosaveEnabled && hasUnsavedDescription && !isEditingDesc && (
                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">não salvo</span>
                  )}
                  {!isEditingDesc && !readOnly && (
                    <button
                      onClick={() => setIsEditingDesc(true)}
                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                    >
                      Editar
                    </button>
                  )}
                </div>
              </div>

              {readOnly ? (
                <div className="min-h-[72px] p-3 rounded-lg bg-slate-50 text-sm text-slate-700 border border-slate-200">
                  {draftDescription
                    ? <div className="whitespace-pre-wrap">{draftDescription}</div>
                    : <span className="text-slate-400 text-sm">Sem descrição.</span>
                  }
                </div>
              ) : isEditingDesc ? (
                <div className="border border-blue-400 rounded-lg overflow-hidden bg-white ring-1 ring-blue-400">
                  <div className="flex items-center gap-1 p-1.5 bg-slate-50 border-b border-slate-200">
                    <button type="button" onClick={() => insertMarkdown('**', '**')} className="px-2 py-1 text-xs hover:bg-slate-200 rounded font-bold text-slate-600 cursor-pointer">B</button>
                    <button type="button" onClick={() => insertMarkdown('*', '*')} className="px-2 py-1 text-xs hover:bg-slate-200 rounded italic text-slate-600 cursor-pointer">I</button>
                    <button type="button" onClick={() => insertMarkdown('- ')} className="px-2 py-1 text-xs hover:bg-slate-200 rounded text-slate-600 cursor-pointer">• Lista</button>
                  </div>
                  <textarea
                    autoFocus
                    value={draftDescription}
                    onChange={e => setDraftDescription(e.target.value)}
                    onBlur={() => { void descAutosave.flush() }}
                    placeholder="Adicione detalhes, critérios de aceite..."
                    className="w-full p-3 text-sm text-slate-700 outline-none min-h-[120px] resize-y"
                  />
                  <div className="flex gap-2 p-2 bg-slate-50 border-t border-slate-200">
                    {autosaveEnabled ? (
                      <button onClick={handleCloseDescEditor} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer">Concluir</button>
                    ) : (
                      <>
                        <button onClick={handleSaveDescription} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer">Salvar</button>
                        <button onClick={() => { setDraftDescription(savedDescription); setIsEditingDesc(false) }} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs rounded-md transition-colors cursor-pointer">Cancelar</button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => setIsEditingDesc(true)}
                  className="min-h-[72px] p-3 rounded-lg cursor-text bg-slate-50 hover:bg-slate-100 text-sm text-slate-700 transition-colors border border-slate-200"
                >
                  {draftDescription
                    ? <div className="whitespace-pre-wrap">{draftDescription}</div>
                    : <span className="text-slate-400 text-sm">Clique para adicionar uma descrição...</span>
                  }
                </div>
              )}
            </section>

            {/* Anexos */}
            {(attachments.length > 0 || onAttachmentUpload || !isEditing) && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Anexos</h3>
                  {!readOnly && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={enviandoAnexo}
                      title={`${ATTACHMENT_TYPES_LABEL}, até ${MAX_ATTACHMENT_MB} MB`}
                      className="text-xs text-slate-500 hover:text-slate-800 transition-colors cursor-pointer disabled:cursor-wait disabled:opacity-60"
                    >
                      {enviandoAnexo ? 'Enviando…' : '+ Adicionar'}
                    </button>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ATTACHMENT_ACCEPT}
                    className="hidden"
                    data-testid="card-anexo-input"
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (!f) return
                      // Recusa aqui, antes de subir um vídeo inteiro para o servidor recusar.
                      const erro = erroDoAnexo(f)
                      setAnexoErro(erro ?? '')
                      if (erro) return
                      if (!isEditing) {
                        setPendingFiles(prev => [...prev, f])
                        return
                      }
                      setEnviandoAnexo(true)
                      try {
                        await onAttachmentUpload?.(f)
                      } finally {
                        setEnviandoAnexo(false)
                      }
                    }}
                  />
                </div>
                {anexoErro && <p role="alert" className="text-xs text-red-600 mb-2">{anexoErro}</p>}
                {pendingFiles.length > 0 && (
                  <ul className="space-y-0.5 mb-2">
                    {pendingFiles.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                        <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                        </svg>
                        <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{f.name}</span>
                        <span className="text-xs text-slate-400 shrink-0">{formatBytes(f.size)}</span>
                        <button
                          onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                          className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 cursor-pointer shrink-0"
                          aria-label={`Remover ${f.name}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {attachments.length === 0
                  ? (pendingFiles.length === 0 && <p className="text-sm text-slate-400 italic">Nenhum anexo ainda.</p>)
                  : (
                    <ul className="space-y-0.5">
                      {attachments.map(a => {
                        // Link (vídeo do YouTube etc.): abre a URL direto, sem URL assinada do MinIO.
                        // Link com esquema que não é http(s) fica sem href (nunca cai na rota de download).
                        const isLink = isLinkAttachment(a.fileType)
                        const href = isLink ? linkHref(a.filePath) : null
                        const thumb = href ? linkThumbnail(href) : null
                        // Arquivo: imagem abre no lightbox; o resto, pela rota de download.
                        const podeVer = !isLink && PREVIEW_TYPES.has(a.fileType)
                        const abrir = isLink ? href : initialCard ? downloadHref(a.id, initialCard.id) : null
                        return (
                        <li key={a.id} className="flex items-center gap-2 group rounded-md px-2 py-1.5 hover:bg-slate-50">
                          {thumb
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={thumb} alt="" data-testid="anexo-link-miniatura" className="w-12 h-7 shrink-0 rounded object-cover bg-slate-100" />
                            : <AttachmentIcon fileType={a.fileType} />}
                          {renamingId === a.id ? (
                            <form
                              className="flex-1 flex items-center gap-1"
                              onSubmit={e => {
                                e.preventDefault()
                                const trimmed = renameValue.trim()
                                if (trimmed && onAttachmentRename) onAttachmentRename(a.id, trimmed)
                                setRenamingId(null)
                              }}
                            >
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                aria-label="Novo nome do anexo"
                                className="flex-1 min-w-0 rounded border border-slate-500 bg-white px-1.5 py-0.5 text-xs text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/40"
                              />
                              <button type="submit" className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer shrink-0">OK</button>
                              <button type="button" onClick={() => setRenamingId(null)} className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer shrink-0">Cancelar</button>
                            </form>
                          ) : (
                            <>
                              {podeVer ? (
                                <button
                                  type="button"
                                  onClick={() => setPreview(a)}
                                  className="flex-1 min-w-0 truncate text-left text-sm text-blue-600 hover:underline cursor-pointer"
                                >
                                  {a.fileName}
                                </button>
                              ) : abrir ? (
                                <a
                                  href={abrir}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex-1 min-w-0 truncate text-sm text-blue-600 hover:underline"
                                >
                                  {a.fileName}
                                </a>
                              ) : (
                                <span className="flex-1 min-w-0 truncate text-sm text-slate-700">{a.fileName}</span>
                              )}
                              <span className="text-xs text-slate-400 shrink-0">{href ? linkHost(href) : formatBytes(a.fileSize)}</span>
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                {podeVer ? (
                                  <button
                                    type="button"
                                    title="Ver imagem"
                                    aria-label={`Ver ${a.fileName}`}
                                    onClick={() => setPreview(a)}
                                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                                    </svg>
                                  </button>
                                ) : abrir && (
                                  <a
                                    href={abrir}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={href ? 'Abrir link' : 'Abrir arquivo'}
                                    aria-label={`Abrir ${a.fileName}`}
                                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                                    </svg>
                                  </a>
                                )}
                                {!readOnly && onAttachmentRename && (
                                  <button
                                    title="Renomear"
                                    onClick={() => { setRenamingId(a.id); setRenameValue(a.fileName) }}
                                    className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 cursor-pointer"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                                    </svg>
                                  </button>
                                )}
                                {!readOnly && a.fileType.startsWith('image/') && onAttachmentSetCover && (
                                  <button
                                    title={a.isCover ? 'Capa atual' : 'Definir como capa'}
                                    onClick={() => onAttachmentSetCover(a.id)}
                                    className={`p-1 rounded cursor-pointer ${a.isCover ? 'text-yellow-500' : 'hover:bg-slate-200 text-slate-400 hover:text-yellow-500'}`}
                                  >
                                    <svg className="w-3.5 h-3.5" fill={a.isCover ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                                    </svg>
                                  </button>
                                )}
                                {!readOnly && onAttachmentDelete && (
                                  <button
                                    title="Excluir"
                                    onClick={() => onAttachmentDelete(a.id)}
                                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 cursor-pointer"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                    </svg>
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </li>
                        )
                      })}
                    </ul>
                  )
                }
              </section>
            )}

            {/* Comentários */}
            <section>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Atividade</h3>

              {!readOnly && (
                <div className={`border rounded-lg overflow-hidden bg-white mb-4 transition-all ${isCommenting ? 'border-blue-400 ring-1 ring-blue-400' : 'border-slate-200'}`}>
                  <textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    onFocus={() => setIsCommenting(true)}
                    placeholder="Escreva um comentário..."
                    className={`w-full bg-transparent text-slate-800 p-3 outline-none resize-none text-sm ${isCommenting ? 'min-h-[72px]' : 'h-10 overflow-hidden'}`}
                  />
                  {isCommenting && (
                    <div className="p-2 bg-slate-50 border-t border-slate-200 flex gap-2">
                      <button onClick={handleCommentSubmit} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer">Comentar</button>
                      <button onClick={() => { setIsCommenting(false); setCommentText('') }} className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs rounded-md transition-colors cursor-pointer">Cancelar</button>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {comments.map(comment => {
                  const isOwner = currentUser?.id === comment.user.id
                  const isEditingThis = editingCommentId === comment.id
                  return (
                    <div key={comment.id} className="flex gap-3">
                      <UserAvatar name={comment.user.name} avatarUrl={comment.user.avatarUrl} size="sm" />
                      <div className="flex-1">
                        <div className="flex items-baseline gap-2 mb-1">
                          <span className="font-semibold text-slate-900 text-sm">{comment.user.name}</span>
                          <span className="text-[11px] text-slate-400">há pouco</span>
                          {isOwner && !isEditingThis && !readOnly && (
                            <div className="ml-auto flex gap-1">
                              <button
                                onClick={() => { setEditingCommentId(comment.id); setEditCommentContent(comment.content) }}
                                className="text-[11px] text-slate-400 hover:text-blue-600 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => onDeleteComment?.(comment.id)}
                                className="text-[11px] text-slate-400 hover:text-red-600 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                              >
                                Excluir
                              </button>
                            </div>
                          )}
                        </div>
                        {isEditingThis ? (
                          <div className="border border-blue-400 ring-1 ring-blue-400 rounded-lg overflow-hidden bg-white">
                            <textarea
                              autoFocus
                              value={editCommentContent}
                              onChange={e => setEditCommentContent(e.target.value)}
                              className="w-full bg-transparent text-slate-800 p-3 outline-none resize-none text-sm min-h-[64px]"
                            />
                            <div className="p-2 bg-slate-50 border-t border-slate-200 flex gap-2">
                              <button
                                onClick={async () => {
                                  if (!editCommentContent.trim()) return
                                  await onEditComment?.(comment.id, editCommentContent.trim())
                                  setEditingCommentId(null)
                                  setEditCommentContent('')
                                }}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                              >
                                Salvar
                              </button>
                              <button
                                onClick={() => { setEditingCommentId(null); setEditCommentContent('') }}
                                className="px-3 py-1.5 text-slate-500 hover:text-slate-700 text-xs rounded-md transition-colors cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="bg-slate-50 p-3 rounded-lg text-sm text-slate-700 border border-slate-200">
                            {comment.content}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {comments.length === 0 && <p className="text-sm text-slate-400 italic">Sem comentários ainda.</p>}
              </div>
            </section>
          </div>

          {/* ── Coluna direita ── */}
          <div className="w-72 shrink-0 border-l border-slate-200 bg-slate-50 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full">
            <div className="p-4 space-y-5">

              {/* Propriedades */}
              <section className="space-y-3">
                {/* Responsáveis */}
                {readOnly ? (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Responsáveis</p>
                    {initialCard?.responsibles && initialCard.responsibles.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {initialCard.responsibles.map(r => (
                          <div key={r.user.id} className="flex items-center gap-1.5 bg-blue-50 rounded-full pl-1 pr-2 py-0.5">
                            <UserAvatar name={r.user.name} avatarUrl={r.user.avatarUrl} size="sm" />
                            <span className="text-xs text-blue-800 font-medium">{r.user.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-400 italic">Sem responsáveis.</p>
                    )}
                  </div>
                ) : users && users.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Responsáveis</p>
                    <div className="bg-white rounded-lg border border-slate-200 p-2">
                      {isEditing ? (
                        <MultiUserSelector cardId={initialCard.id} users={users} onResponsiblesChange={onResponsiblesChange} />
                      ) : (
                        <MultiUserSelector
                          cardId=""
                          pending
                          users={users}
                          onResponsiblesChange={resps => setSelectedResponsibleIds(resps.map(r => r.userId))}
                        />
                      )}
                    </div>
                  </div>
                )}

                {/* Prioridade */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Prioridade</p>
                  {readOnly ? (
                    <span className={`inline-block px-3 py-1.5 text-xs font-medium rounded-md ${PRIORITY_LABELS[priority]?.cls ?? 'bg-slate-100 text-slate-600'}`}>
                      {PRIORITY_LABELS[priority]?.label ?? '—'}
                    </span>
                  ) : (
                    <div className="flex gap-1.5">
                      {(['baixa', 'media', 'alta'] as const).map(p => (
                        <button
                          key={p}
                          onClick={() => setPriority(p)}
                          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border ${
                            priority === p
                              ? `${PRIORITY_LABELS[p].cls} border-transparent ring-2 ring-offset-1 ring-blue-400`
                              : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {PRIORITY_LABELS[p].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {erroPlanilha && <p role="status" className="text-xs text-slate-500">{erroPlanilha}</p>}
                {linhaPlanilha && <section className="rounded-lg border border-slate-200 p-3 text-xs text-slate-600" aria-label="Planilha de Custos">
                  <h3 className="mb-2 font-semibold text-slate-800">Planilha de Custos · {linhaPlanilha.codigo}</h3>
                  <p>Elaborado por: {linhaPlanilha.elaboradoPor || 'Não definido'}</p>
                  <p>Orçado: {linhaPlanilha.minOrcado} min · {linhaPlanilha.totalOrcado?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'}</p>
                  <p>Realizado: {linhaPlanilha.minReal} min · {linhaPlanilha.totalReal?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) ?? '—'}</p>
                  <p>Prevista: {fmtDataBR(linhaPlanilha.dataPrevista) || '—'}</p>
                  <p>Realização: {fmtDataBR(linhaPlanilha.dataRealizacao) || '—'}</p>
                </section>}
                {/* Datas */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Datas</p>
                  {readOnly ? (
                    <div className="text-xs text-slate-600 space-y-0.5">
                      <p>Início: {startLocal ? new Date(startLocal).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p>
                      <p>Prazo: {endLocal ? new Date(endLocal).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {([
                        { id: 'card-start', label: 'Início', value: startLocal, set: setStartLocal },
                        { id: 'card-end', label: 'Prazo (entrega)', value: endLocal, set: setEndLocal },
                      ] as const).map(f => (
                        <div key={f.id}>
                          <label htmlFor={f.id} className="block text-[11px] text-slate-500 mb-0.5">{f.label}</label>
                          <div className="flex items-center gap-1">
                            <input
                              id={f.id}
                              type="datetime-local"
                              value={f.value}
                              onChange={e => { f.set(e.target.value); setError('') }}
                              onBlur={() => { if (!datasInvalidas) void datasAutosave.flush() }}
                              className="flex-1 min-w-0 bg-white border border-slate-200 rounded-md px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                            />
                            {f.value && (
                              <button
                                type="button"
                                onClick={() => f.set('')}
                                aria-label={`Remover ${f.label.toLowerCase()}`}
                                className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {datasInvalidas && (
                        <p role="alert" className="text-[11px] text-red-600">O prazo não pode ser antes do início.</p>
                      )}
                      {!datasInvalidas && autosaveEnabled && datasAutosave.status === 'error' && (
                        <button type="button" onClick={() => { void datasAutosave.flush() }} className="text-[11px] text-red-600 hover:underline cursor-pointer">
                          Erro ao salvar as datas. Tentar de novo
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Cor */}
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Cor</p>
                  {readOnly ? (
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full ring-2 ring-slate-200" style={{ backgroundColor: color }} />
                      <span className="text-xs text-slate-500">{color}</span>
                    </div>
                  ) : (
                    <ColorPicker value={color} onChange={setColor} />
                  )}
                </div>

                {/* Etiquetas */}
                {readOnly ? (
                  (selectedTagIds.length > 0) && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Etiquetas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(boardTags ?? []).filter(t => selectedTagIds.includes(t.id)).map(t => (
                          <span key={t.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: `${t.color}20`, color: t.color }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                ) : boardTags && boardTags.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Etiquetas</p>
                    <TagSelector tags={boardTags} selectedTagIds={selectedTagIds} onToggle={handleTagToggle} />
                  </div>
                )}
              </section>

              <hr className="border-slate-200" />

              {/* Registro de Tempo */}
              {isEditing && !readOnly && initialCard?.id && (
                <section>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Registro de Tempo</p>

                  <div className="bg-white rounded-lg border border-slate-200 p-3">
                    <CardTimer cardId={initialCard.id} onEntryChanged={reloadTimeEntries} timerKey={timerKey} onTimerStarted={onTimerStarted} />
                  </div>

                  {/* Toggle Lançamento Manual */}
                  <button
                    onClick={() => { setShowManualForm(v => !v); setTimeError('') }}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer border border-dashed border-slate-300"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showManualForm
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      }
                    </svg>
                    {showManualForm ? 'Ocultar lançamento manual' : 'Lançamento manual'}
                  </button>

                  {showManualForm && (
                    <div className="mt-2 bg-white rounded-lg border border-slate-200 p-3 space-y-2">
                      <div className="flex gap-1.5">
                        <input
                          type="number" min="0" placeholder="0h"
                          value={manualHours}
                          onChange={e => { setManualHours(e.target.value); setTimeError('') }}
                          className="w-1/3 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-blue-400 text-slate-700"
                        />
                        <input
                          type="number" min="0" max="59" placeholder="00m"
                          value={manualMinutes}
                          onChange={e => { setManualMinutes(e.target.value); setTimeError('') }}
                          className="w-1/3 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-blue-400 text-slate-700"
                        />
                        <input
                          type="number" min="0" max="59" placeholder="00s"
                          value={manualSeconds}
                          onChange={e => { setManualSeconds(e.target.value); setTimeError('') }}
                          className="w-1/3 border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-blue-400 text-slate-700"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="O que foi feito?"
                        value={manualDesc}
                        onChange={e => { setManualDesc(e.target.value); setTimeError('') }}
                        className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm outline-none focus:border-blue-400 text-slate-700"
                      />
                      {timeError && <p className="text-red-500 text-xs">{timeError}</p>}
                      <button
                        onClick={handleRegisterTime}
                        disabled={!manualDesc.trim()}
                        className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-md transition-colors cursor-pointer"
                      >
                        Registrar
                      </button>
                    </div>
                  )}
                </section>
              )}

              {/* Histórico */}
              {isEditing && !readOnly && (timeEntries.length > 0 || movements.length > 0) && (
                <>
                  <hr className="border-slate-200" />
                  <section>
                    {/* Abas */}
                    <div className="flex gap-1 mb-3 bg-slate-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setActiveHistoryTab('tempo')}
                        className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${activeHistoryTab === 'tempo' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Tempo {timeEntries.length > 0 && <span className="text-slate-400">({timeEntries.length})</span>}
                      </button>
                      <button
                        onClick={() => setActiveHistoryTab('movimentos')}
                        className={`flex-1 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${activeHistoryTab === 'movimentos' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Movimentos {movements.length > 0 && <span className="text-slate-400">({movements.length})</span>}
                      </button>
                    </div>

                    {/* Aba Tempo */}
                    {activeHistoryTab === 'tempo' && (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                        {timeEntries.length === 0
                          ? <p className="text-xs text-slate-400 italic">Nenhum registro ainda.</p>
                          : timeEntries.map(entry => (
                            editingEntryId === entry.id ? (
                              <div key={entry.id} className="bg-white rounded-lg border border-blue-300 p-2.5 space-y-2">
                                <div className="flex gap-1.5">
                                  <input type="number" min="0" value={editHours} onChange={e => setEditHours(e.target.value)} placeholder="0h" className="w-1/2 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                  <input type="number" min="0" max="59" value={editMinutes} onChange={e => setEditMinutes(e.target.value)} placeholder="00m" className="w-1/2 border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                </div>
                                <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Descrição" className="w-full border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                <div className="flex gap-1.5">
                                  <button onClick={handleSaveEditEntry} className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md transition-colors cursor-pointer">Salvar</button>
                                  <button onClick={() => setEditingEntryId(null)} className="flex-1 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-md transition-colors cursor-pointer">Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              <div key={entry.id} className="group bg-white rounded-lg border border-slate-200 px-3 py-2 flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold text-slate-800">{formatDuration(entry.duration)}</span>
                                  {entry.description && <p className="text-xs text-slate-500 truncate mt-0.5">{entry.description}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleStartEditEntry(entry)}
                                    title="Editar"
                                    className="p-1 hover:bg-slate-100 rounded cursor-pointer"
                                  >
                                    <svg className="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteEntry(entry.id)}
                                    title="Excluir"
                                    className="p-1 hover:bg-red-50 rounded cursor-pointer"
                                  >
                                    <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                              </div>
                            )
                          ))
                        }
                      </div>
                    )}

                    {/* Aba Movimentos */}
                    {activeHistoryTab === 'movimentos' && (
                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                        {movements.length === 0
                          ? <p className="text-xs text-slate-400 italic">Nenhuma movimentação registrada.</p>
                          : movements.map(mov => (
                            <div key={mov.id} className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                              <div className="flex items-center gap-1.5 text-xs">
                                <span className="text-slate-500 shrink-0 max-w-[70px] truncate">{mov.fromColumnTitle ?? '—'}</span>
                                <svg className="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                <span className="font-semibold text-slate-800 shrink-0 max-w-[70px] truncate">{mov.toColumnTitle ?? '—'}</span>
                              </div>
                              {mov.reason && <p className="text-xs text-slate-500 italic truncate mt-0.5">{mov.reason}</p>}
                              <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(mov.movedAt)}</p>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </section>
                </>
              )}

            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-3 flex items-center justify-between">
          {readOnly ? (
            <button
              onClick={handleCancel}
                disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-sm"
            >
              Fechar
            </button>
          ) : (
            <>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                {isEditing ? 'Fechar sem salvar' : 'Cancelar'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                {saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar card'}
              </button>
            </>
          )}
        </div>
      </div>

      {preview && initialCard && (
        <div ref={previewRef} tabIndex={-1} style={{ zIndex: previewZIndex }}
          role="dialog"
          aria-modal="true"
          aria-label={`Visualizar ${preview.fileName}`}
          className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-3 bg-slate-950/85 p-4"
          onClick={() => setPreview(null)}
        >
          <div className="flex w-full max-w-5xl items-center gap-3 text-sm text-white" onClick={e => e.stopPropagation()}>
            <span className="flex-1 min-w-0 truncate font-medium">{preview.fileName}</span>
            <a
              href={downloadHref(preview.id, initialCard.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md border border-white/30 px-2.5 py-1 hover:bg-white/10"
            >
              Abrir em nova aba
            </a>
            <button
              type="button"
              autoFocus
              aria-label="Fechar visualização"
              onClick={() => setPreview(null)}
              className="shrink-0 rounded-md p-1.5 hover:bg-white/10 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${preview.id}/image`}
            alt={preview.fileName}
            onClick={e => e.stopPropagation()}
            className="max-h-[85vh] max-w-full rounded-lg bg-white object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  )
}

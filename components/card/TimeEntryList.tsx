'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useState, useEffect } from 'react'
import { getTimeEntriesAction, updateTimeEntryAction, deleteTimeEntryAction } from '@/app/actions/time'

interface TimeEntry {
  id: string
  duration: number
  description: string | null
  isManual: boolean
  createdAt: Date | string
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}m`
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

interface Props {
  cardId: string
  refreshKey?: number
  onChanged?: () => void
}

export default function TimeEntryList({ cardId, refreshKey, onChanged }: Props) {
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editHours, setEditHours] = useState('0')
  const [editMinutes, setEditMinutes] = useState('0')
  const [editDescription, setEditDescription] = useState('')
  const [editError, setEditError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const result = await getTimeEntriesAction(cardId)
      if ('entries' in result) setEntries(result.entries as TimeEntry[])
    }
    load()
  }, [cardId, refreshKey])

  function startEdit(entry: TimeEntry) {
    const h = Math.floor(entry.duration / 3600)
    const m = Math.floor((entry.duration % 3600) / 60)
    setEditHours(h.toString())
    setEditMinutes(m.toString())
    setEditDescription(entry.description ?? '')
    setEditError('')
    setEditingId(entry.id)
  }

  async function handleSaveEdit(entryId: string) {
    setEditError('')
    const h = parseInt(editHours) || 0
    const m = parseInt(editMinutes) || 0
    if (h === 0 && m === 0) {
      setEditError('Informe um tempo maior que zero.')
      return
    }
    setLoading(true)
    const result = await updateTimeEntryAction(entryId, h, m, editDescription || undefined)
    setLoading(false)
    if ('error' in result && result.error) {
      setEditError(result.error)
      return
    }
    if ('entry' in result && result.entry) {
      setEntries(prev => prev.map(e =>
        e.id === entryId
          ? { ...e, duration: (result.entry as TimeEntry).duration, description: (result.entry as TimeEntry).description }
          : e
      ))
    }
    setEditingId(null)
    onChanged?.()
  }

  async function handleDelete(entryId: string) {
    setDeleteError('')
    setLoading(true)
    const result = await deleteTimeEntryAction(entryId)
    setLoading(false)
    if ('error' in result) { setDeleteError(result.error ?? 'Não foi possível excluir o registro.'); return }
    setEntries(prev => prev.filter(e => e.id !== entryId))
    onChanged?.()
  }

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 mt-1">Nenhum registro ainda.</p>
  }

  return (
    <>
    {deleteError && <p role="alert" className="text-xs text-red-500 mt-2">{deleteError}</p>}
    <ul className="flex flex-col gap-1 mt-2" aria-label="Registros de tempo">
      {entries.map(entry => (
        <li key={entry.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
          {editingId === entry.id ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Horas</label>
                  <OperumInput
                    type="number"
                    min="0"
                    value={editHours}
                    onChange={e => setEditHours(e.target.value)}
                    aria-label="Horas edição"
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">Minutos</label>
                  <OperumInput
                    type="number"
                    min="0"
                    max="59"
                    value={editMinutes}
                    onChange={e => setEditMinutes(e.target.value)}
                    aria-label="Minutos edição"
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>
              <OperumInput
                type="text"
                placeholder="Descrição (opcional)"
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                aria-label="Descrição edição"
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              {editError && <p className="text-xs text-red-500">{editError}</p>}
              <FormActions className="flex gap-2">
                <OperumButton variant="primary"
                  type="button"
                  aria-label="Salvar edição"
                  onClick={(e) => { e.stopPropagation(); handleSaveEdit(entry.id) }}
                  disabled={loading}
                  className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  Salvar
                </OperumButton>
                <OperumButton variant="default"
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setEditingId(null) }}
                  className="px-3 py-1 border border-gray-200 text-gray-600 text-xs rounded hover:bg-gray-50"
                >
                  Cancelar
                </OperumButton>
              </FormActions>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-gray-800 tabular-nums">
                  {formatDuration(entry.duration)}
                </span>
                {entry.description && (
                  <span className="text-xs text-gray-500 truncate">{entry.description}</span>
                )}
                <span className="text-xs text-gray-400">{formatDate(entry.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <OperumButton variant="default"
                  type="button"
                  aria-label="Editar registro"
                  onClick={(e) => { e.stopPropagation(); startEdit(entry) }}
                  className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded border border-blue-100 hover:bg-blue-50"
                >
                  Editar
                </OperumButton>
                <OperumButton variant="danger"
                  type="button"
                  aria-label="Excluir registro"
                  onClick={(e) => { e.stopPropagation(); handleDelete(entry.id) }}
                  disabled={loading}
                  className="text-xs text-red-500 hover:text-red-700 px-1.5 py-0.5 rounded border border-red-100 hover:bg-red-50 disabled:opacity-50"
                >
                  Excluir
                </OperumButton>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
    </>
  )
}

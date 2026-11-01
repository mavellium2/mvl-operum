'use client'

import FormActions from '@/components/ui/FormActions'
import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useRef, useState } from 'react'
import { addManualTimeAction } from '@/app/actions/time'
import { useCardTimer } from '@/hooks/useCardTimer'
import { avisoTimerLongo } from '@/lib/avisoTimer'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

interface CardTimerProps {
  cardId: string
  onEntryChanged?: () => void
  timerKey?: number
  /** Disparado quando o timer é iniciado (Correção 6). */
  onTimerStarted?: (cardId: string) => void
}

export default function CardTimer({ cardId, onEntryChanged, timerKey, onTimerStarted }: CardTimerProps) {
  const timer = useCardTimer(cardId, timerKey)
  const isRunning = timer.isRunning, elapsed = timer.elapsed, loading = timer.loading, error = timer.error
  const manualPending = useRef(false)
  const [manualSaving, setManualSaving] = useState(false)
  const [showManualForm, setShowManualForm] = useState(false)
  const [manualHours, setManualHours] = useState(0)
  const [manualMinutes, setManualMinutes] = useState(0)
  const [manualError, setManualError] = useState('')

  async function handleStart() { if (await timer.toggle()) onTimerStarted?.(cardId) }
  async function handlePause() { if (await timer.toggle()) onEntryChanged?.() }

  async function handleSaveManual() {
    if (manualPending.current) return
    setManualError('')
    if (manualHours === 0 && manualMinutes === 0) {
      setManualError('Informe um tempo válido')
      return
    }
    manualPending.current = true; setManualSaving(true)
    try {
      const result = await addManualTimeAction(cardId, manualHours, manualMinutes)
      if ('error' in result && result.error) throw new Error(result.error)
      setShowManualForm(false); setManualHours(0); setManualMinutes(0)
      await timer.refresh()
      onEntryChanged?.()
    } catch (error) { setManualError(error instanceof Error ? error.message : 'Erro de rede. Tente novamente.') }
    finally { manualPending.current = false; setManualSaving(false) }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span
          className="text-2xl font-mono font-semibold text-slate-800 tabular-nums min-w-[80px]"
          aria-label="Tempo acumulado"
        >
          {timer.known ? formatDuration(elapsed) : '—'}
        </span>

        {isRunning ? (
          <OperumButton variant="default"
            type="button"
            onClick={e => { e.stopPropagation(); handlePause() }}
            disabled={loading || manualSaving || !timer.known}
            aria-label="Pausar timer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-sm font-medium hover:bg-amber-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
            Pausar
          </OperumButton>
        ) : (
          <OperumButton variant="default"
            type="button"
            onClick={e => { e.stopPropagation(); handleStart() }}
            disabled={loading || manualSaving || !timer.known}
            aria-label="Iniciar timer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-sm font-medium hover:bg-green-200 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            Iniciar
          </OperumButton>
        )}
      </div>

      {isRunning && (() => {
        const aviso = avisoTimerLongo(timer.entry?.startedAt, new Date())
        return aviso ? <p role="status" className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">{aviso}</p> : null
      })()}

      {error && <p role="alert" className="text-xs text-red-500">{error} <OperumButton variant="default" type="button" disabled={loading} onClick={() => void timer.refresh()}>Atualizar timer</OperumButton></p>}

      {!showManualForm ? (
        <OperumButton variant="default"
          type="button"
          onClick={e => { e.stopPropagation(); setShowManualForm(true); setManualError('') }}
          className="text-xs text-slate-500 hover:text-slate-700 underline transition-colors cursor-pointer self-start"
        >
          Adicionar manualmente
        </OperumButton>
      ) : (
        <div className="flex flex-col gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`manual-hours-${cardId}`} className="text-xs text-slate-500">Horas</label>
              <OperumInput
                id={`manual-hours-${cardId}`}
                type="number"
                min={0}
                max={168}
                value={manualHours}
                onChange={e => setManualHours(Number(e.target.value))}
                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`manual-minutes-${cardId}`} className="text-xs text-slate-500">Minutos</label>
              <OperumInput
                id={`manual-minutes-${cardId}`}
                type="number"
                min={0}
                max={59}
                value={manualMinutes}
                onChange={e => setManualMinutes(Number(e.target.value))}
                className="w-16 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
            </div>
          </div>
          {manualError && <p className="text-xs text-red-500">{manualError}</p>}
          <FormActions className="flex gap-2">
            <OperumButton variant="default"
              type="button"
              onClick={() => { setShowManualForm(false); setManualError('') }}
              className="px-3 py-1 text-xs text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </OperumButton>
            <OperumButton variant="primary"
              type="button"
              onClick={e => { e.stopPropagation(); handleSaveManual() }}
              disabled={loading || manualSaving || !timer.known}
              className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-60 cursor-pointer"
            >
              Salvar
            </OperumButton>
          </FormActions>
        </div>
      )}
    </div>
  )
}

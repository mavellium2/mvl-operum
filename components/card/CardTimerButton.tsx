'use client'

import OperumButton from '@/components/ui/GlassButton'
import type { useCardTimer } from '@/hooks/useCardTimer'

type Timer = ReturnType<typeof useCardTimer>

export function formatCardTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

/**
 * Play/stop compacto do card, com o tempo acumulado. Usado no minicard do quadro e
 * nas atividades da Planilha de Custos: o estado vem de `useCardTimer`, que é o
 * mesmo para o card em qualquer tela.
 */
export default function CardTimerButton({ timer, canStart, onStarted, onStopped, compacto = false, className = '' }: {
  timer: Timer
  /** Iniciar exige permissão nos cards; pausar um timer já rodando continua permitido. */
  canStart: boolean
  onStarted?: () => void
  onStopped?: () => void
  /** Só o ícone quando parado; o tempo aparece enquanto o timer roda (tabelas densas). */
  compacto?: boolean
  className?: string
}) {
  const rodando = timer.isRunning
  const bloqueado = !rodando && !canStart

  async function alternar(event: React.MouseEvent) {
    event.stopPropagation()
    if (bloqueado || timer.loading) return
    const estavaRodando = rodando
    if (!(await timer.toggle())) return
    if (estavaRodando) onStopped?.()
    else onStarted?.()
  }

  return (
    <OperumButton variant="default" type="button"
      disabled={timer.loading || !timer.known || bloqueado}
      aria-label={rodando ? 'Pausar timer' : 'Iniciar timer'}
      aria-disabled={bloqueado}
      aria-pressed={rodando}
      className={`card-timer-button flex items-center gap-1.5 px-2 py-1 -ml-2 rounded-md transition-colors ${rodando ? 'bg-green-50' : 'hover:bg-gray-100'} ${className}`}
      onClick={alternar}
      title={rodando ? 'Pausar tempo' : 'Iniciar tempo'}
    >
      {rodando ? (
        <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center text-red-600 shadow-sm hover:bg-red-200 transition-colors">
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z" /></svg>
        </div>
      ) : (
        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-green-100 hover:text-green-600 transition-colors shadow-sm">
          <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
        </div>
      )}
      {(!compacto || rodando) && <span className={`text-xs font-mono font-bold tracking-tight mt-px ${rodando ? 'text-green-700' : 'text-gray-600'}`}>{timer.known ? formatCardTimer(timer.elapsed) : '—'}</span>}
    </OperumButton>
  )
}

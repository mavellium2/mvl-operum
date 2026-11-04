'use client'

import OperumCloseButton from '@/components/ui/GlassCloseButton'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AtSign, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

type ToastVariant = 'success' | 'error' | 'warning' | 'mention'

interface Toast {
  id: string
  message: string
  title?: string
  variant: ToastVariant
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant, title?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const ICONS: Record<ToastVariant, React.ReactNode> = {
  mention: <AtSign className="w-4 h-4 shrink-0 text-blue-600" />,
  success: <CheckCircle className="w-4 h-4 shrink-0" />,
  error: <XCircle className="w-4 h-4 shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 shrink-0" />,
}

const STYLES: Record<ToastVariant, string> = {
  mention: 'border border-slate-200 bg-white text-slate-900',
  success: 'bg-emerald-600 text-white',
  error:   'bg-red-600 text-white',
  warning: 'bg-amber-500 text-white',
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), toast.variant === 'mention' ? 8500 : 4000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.variant, onDismiss])

  return (
    <div
      role={toast.variant === 'mention' ? 'status' : 'alert'}
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-in slide-in-from-bottom-4 duration-200 ${STYLES[toast.variant]}`}
    >
      {ICONS[toast.variant]}
      <div className="min-w-0 flex-1 break-words">
        {toast.title && <p className="mb-1 font-semibold">{toast.title}</p>}
        <p>{toast.message}</p>
        {toast.variant === 'mention' && <a href="/notificacoes" className="mt-1 inline-block text-xs text-blue-700 underline">Ver notificações</a>}
      </div>
      <OperumCloseButton onClick={() => onDismiss(toast.id)}
        className="opacity-70 hover:opacity-100 transition-opacity ml-1"
        label="Fechar notificação" />
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [mounted, setMounted] = useState(false)
  const counterRef = useRef(0)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true) }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, variant: ToastVariant = 'success', title?: string) => {
    const id = `toast-${++counterRef.current}`
    setToasts(prev => [...prev, { id, message, variant, title }])
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {mounted && createPortal(
        <div
          aria-live="polite"
          className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 w-80 max-w-[calc(100vw-2.5rem)]"
        >
          {toasts.map(t => (
            <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return ctx
}

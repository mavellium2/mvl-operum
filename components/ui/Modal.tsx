'use client'

import { useEffect, useRef, useState, useId } from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from '@/hooks/useOverlay'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: string     // Ex: 'max-w-md', 'max-w-4xl', 'max-w-5xl'
  className?: string    // Para sobrescrever cor de fundo, texto, etc.
  closeButton?: React.ReactNode
  scrollContent?: boolean
  hideHeader?: boolean  // Se true, remove o cabeçalho padrão do modal
}

export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children,
  maxWidth = 'max-w-md',
  className = 'bg-white text-gray-900',
  hideHeader = false,
  scrollContent = true,
  closeButton
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  // Previne erros de hidratação no Next.js ao usar createPortal
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true) }, [])

  const titleId = useId()
  const zIndex = useOverlay(dialogRef, onClose, isOpen && mounted)

  if (!isOpen || !mounted) return null

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex justify-center p-4 sm:p-6 ${scrollContent ? 'items-center' : 'items-start overflow-y-auto'}`}
      ref={dialogRef}
      tabIndex={-1}
      style={{ zIndex }}
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Diálogo'}
    >
      {hideHeader && title && <h2 id={titleId} className="sr-only">{title}</h2>}
      {/* Overlay Escuro com Blur */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Container Principal do Modal */}
      <div
        className={`relative z-10 w-full ${maxWidth} rounded-2xl shadow-2xl flex flex-col ${scrollContent ? 'max-h-[95vh]' : 'my-auto shrink-0'} animate-in zoom-in-95 duration-200 overflow-hidden ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Cabeçalho Padrão (Ocultável) */}
        {!hideHeader && title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/50 shrink-0">
            <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
            {closeButton ?? (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors rounded-lg p-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Fechar modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            )}
          </div>
        )}
        
        {/* Área de Conteúdo */}
        <div className={`${scrollContent ? 'overflow-y-auto flex-1' : 'overflow-visible'} ${hideHeader ? '' : 'px-6 py-4'}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
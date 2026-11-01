'use client'

import OperumCloseButton from '@/components/ui/GlassCloseButton'
import { useEffect, useRef, useState, useId } from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from '@/hooks/useOverlay'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: string
}

export default function Drawer({
  isOpen,
  onClose,
  title,
  children,
  width = 'w-96',
}: DrawerProps) {
  const [mounted, setMounted] = useState(false)
  const firstFocusRef = useRef<HTMLButtonElement>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true) }, [])

  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const zIndex = useOverlay(dialogRef, onClose, isOpen && mounted)

  if (!mounted || !isOpen) return null

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      style={{ zIndex }}
      aria-modal="true"
      role="dialog"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Painel'}
      className="fixed inset-0 z-[100] flex justify-end"
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Painel lateral */}
      <div
        className={`relative z-10 ${width} max-w-full h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
          {title && <h2 id={titleId} className="text-base font-semibold text-slate-800">{title}</h2>}
          <OperumCloseButton ref={firstFocusRef}
            onClick={onClose}
            className="ml-auto text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg p-1.5 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            label="Fechar" />
        </div>

        {/* Conteúdo scrollável */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}

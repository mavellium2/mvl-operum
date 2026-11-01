'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useState, useEffect, useRef } from 'react'

interface BoardActionMenuProps {
  onImportCsv?: () => void
  onCreateSprint: () => void // Importante: Se não for usar por enquanto, pode manter, mas lembre-se de implementar a lógica depois ou remover se não for necessário
  onManageTags?: () => void   // O mesmo vale para tags
  onChangeLayout?: () => void;
}

export default function BoardActionMenu({ onImportCsv, onChangeLayout }: BoardActionMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <OperumButton variant="custom" type="button"
        aria-label="Board actions"
        onClick={() => setOpen(o => !o)}
        className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="12" cy="19" r="1.5" />
        </svg>
      </OperumButton>

      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50">
          {onImportCsv && <OperumButton variant="default" type="button"
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => { setOpen(false); onImportCsv() }}
          >
            Importar CSV
          </OperumButton>}

          {onChangeLayout && (
            <OperumButton variant="default" type="button"
              onClick={() => { setOpen(false); onChangeLayout(); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Alterar Layout (Fundo)
            </OperumButton>
          )}
        </div>
      )}
    </div>
  )
}

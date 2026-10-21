'use client'

import { useEffect, useRef, useState } from 'react'
import { CARD_COLORS } from '@/types/kanban'

interface ColumnColorButtonProps {
  columnTitle: string
  /** Cor atual da coluna; null = aparência padrão. */
  value: string | null
  onChange: (color: string | null) => void
}

/** Cores oferecidas para colunas: as mesmas dos cards, sem o cinza (que é o padrão). */
export const COLUMN_COLORS = CARD_COLORS.filter(c => c.value !== '#6b7280')

export default function ColumnColorButton({ columnTitle, value, onChange }: ColumnColorButtonProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function choose(color: string | null) {
    setOpen(false)
    if (color !== value) onChange(color)
  }

  const swatch = 'w-6 h-6 rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        onMouseDown={e => e.stopPropagation()}
        className={`p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-black/5 transition-all shrink-0 focus:opacity-100 ${open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        aria-label={`Cor da coluna ${columnTitle}`}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
        </svg>
      </button>

      {open && (
        <div
          role="group"
          aria-label={`Escolher cor da coluna ${columnTitle}`}
          onMouseDown={e => e.stopPropagation()}
          className="absolute right-0 top-full mt-1 z-50 w-48 bg-white rounded-xl shadow-lg border border-gray-100 p-3 cursor-default"
        >
          <p className="text-xs font-semibold text-gray-500 mb-2">Cor da coluna</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => choose(null)}
              title="Padrão"
              aria-label={`Padrão${value === null ? ' (selecionada)' : ''}`}
              aria-pressed={value === null}
              className={`${swatch} bg-gray-100 border border-gray-300 flex items-center justify-center`}
              style={{ boxShadow: value === null ? '0 0 0 2px white, 0 0 0 4px #9ca3af' : undefined }}
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeWidth={2} d="M5 19L19 5" />
              </svg>
            </button>
            {COLUMN_COLORS.map(({ value: color, label }) => (
              <button
                key={color}
                type="button"
                onClick={() => choose(color)}
                title={label}
                aria-label={`${label}${value === color ? ' (selecionada)' : ''}`}
                aria-pressed={value === color}
                className={swatch}
                style={{
                  backgroundColor: color,
                  boxShadow: value === color ? `0 0 0 2px white, 0 0 0 4px ${color}` : undefined,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useEffect, useRef } from 'react'

interface ColumnSearchButtonProps {
  columnTitle: string
  open: boolean
  onToggle: () => void
}

/** Lupa do cabeçalho da coluna: abre e fecha o campo de busca. */
export function ColumnSearchButton({ columnTitle, open, onToggle }: ColumnSearchButtonProps) {
  return (
    <OperumButton variant="custom"
      type="button"
      onClick={e => { e.stopPropagation(); onToggle() }}
      aria-label={open ? `Fechar busca na coluna ${columnTitle}` : `Buscar na coluna ${columnTitle}`}
      aria-expanded={open}
      title="Buscar nesta coluna"
      className={`p-1.5 rounded-lg transition-all shrink-0 ${open
        ? 'text-blue-600 bg-blue-50'
        : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
      </svg>
    </OperumButton>
  )
}

interface ColumnSearchInputProps {
  columnTitle: string
  value: string
  onChange: (value: string) => void
  onClose: () => void
  shown: number
  total: number
}

/**
 * Campo de busca da coluna. Fica fora da alça de arraste da coluna: lá dentro,
 * a barra de espaço iniciaria o arraste pelo teclado.
 */
export function ColumnSearchInput({ columnTitle, value, onChange, onClose, shown, total }: ColumnSearchInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  return (
    <div className="px-2 pt-2 shrink-0">
      <div className="relative">
        <OperumInput
          ref={inputRef}
          type="search"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); onClose() }
          }}
          placeholder="Buscar nesta coluna..."
          aria-label={`Buscar cards na coluna ${columnTitle}`}
          className="w-full rounded-xl border border-black/10 bg-white pl-3 pr-8 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <OperumButton variant="custom"
          type="button"
          onClick={onClose}
          aria-label="Limpar e fechar a busca"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </OperumButton>
      </div>
      {value.trim() && (
        <p className="mt-1 px-1 text-[11px] text-gray-500" aria-live="polite">
          {shown === 0 ? 'Nenhum card encontrado' : `${shown} de ${total} cards`} · arraste pausado durante a busca
        </p>
      )}
    </div>
  )
}

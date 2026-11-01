'use client'

import GlassButton from '@/components/ui/GlassButton'

import { useState, useRef, useEffect, useLayoutEffect, KeyboardEvent } from 'react'

import { createPortal } from 'react-dom'

interface MultiCreatableSelectProps {
  values: string[]
  onChange: (values: string[]) => void
  options: string[]
  placeholder?: string
  disabled?: boolean
  /** Rótulo acessível do campo de digitação. */
  ariaLabel?: string
}

export default function MultiCreatableSelect({
  values,
  onChange,
  options,
  placeholder = 'Adicionar...',
  disabled = false,
  ariaLabel,
}: MultiCreatableSelectProps) {
  const [inputValue, setInputValue] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    if (!isOpen || disabled) return
    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const below = window.innerHeight - rect.bottom - 16
      const above = rect.top - 16
      const up = below < 180 && above > below
      const height = Math.max(80, Math.min(320, up ? above : below))
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)), width: Math.min(rect.width, window.innerWidth - 16), top: up ? rect.top - height - 6 : rect.bottom + 6, maxHeight: height })
    }
    update()
    window.addEventListener('resize', update)
    const scroll = (event: Event) => { if (!panelRef.current?.contains(event.target as Node)) update() }
    window.addEventListener('scroll', scroll, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', scroll, true) }
  }, [isOpen, disabled, values.length])

  const filtered = options.filter(
    opt =>
      opt.toLowerCase().includes(inputValue.toLowerCase()) &&
      !values.includes(opt),
  )

  const showCreate =
    inputValue.trim() !== '' &&
    !options.some(o => o.toLowerCase() === inputValue.trim().toLowerCase()) &&
    !values.includes(inputValue.trim())

  function addValue(val: string) {
    const trimmed = val.trim()
    if (!trimmed || values.includes(trimmed)) return
    onChange([...values, trimmed])
    setInputValue('')
    inputRef.current?.focus()
  }

  function removeValue(val: string) {
    onChange(values.filter(v => v !== val))
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && inputValue.trim()) {
      e.preventDefault()
      addValue(inputValue)
    } else if (e.key === 'Backspace' && inputValue === '' && values.length > 0) {
      removeValue(values[values.length - 1])
    } else if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div data-glass-multiselect data-open={isOpen && !disabled && (filtered.length > 0 || showCreate)} ref={containerRef} className="relative">
      <div
        className={`
          min-h-[46px] w-full px-3 py-2 bg-slate-50/50 border border-slate-200/60 rounded-xl
          flex flex-wrap gap-1.5 items-center cursor-text
          focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-500
          transition-all duration-200
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus()
            setIsOpen(true)
          }
        }}
      >
        {values.map(val => (
          <span
            key={val}
            className="multiselect-glass-chip inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-lg"
          >
            {val}
            {!disabled && (
              <GlassButton variant="custom"
                type="button"
                onClick={e => { e.stopPropagation(); removeValue(val) }}
                aria-label={`Remover ${val}`}
                className="text-blue-500 hover:text-blue-800 transition-colors leading-none"
                tabIndex={-1}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </GlassButton>
            )}
          </span>
        ))}

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setIsOpen(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={values.length === 0 ? placeholder : ''}
          aria-label={ariaLabel}
          disabled={disabled}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-sm text-slate-800 font-medium"
        />
      </div>

      {isOpen && !disabled && position && (filtered.length > 0 || showCreate) && createPortal(
        <div ref={panelRef} data-glass-select-panel style={{ position: 'fixed', ...position, zIndex: 10000, overflowY: 'auto', padding: 4 }} className="bg-white border border-slate-200 rounded-xl shadow-lg">
          {filtered.map(opt => (
            <GlassButton variant="custom"
              key={opt}
              type="button"
              onMouseDown={e => { e.preventDefault(); addValue(opt) }}
              className="glass-select-option w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {opt}
            </GlassButton>
          ))}
          {showCreate && (
            <GlassButton variant="custom"
              type="button"
              onMouseDown={e => { e.preventDefault(); addValue(inputValue) }}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2 border-t border-slate-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Criar &ldquo;{inputValue.trim()}&rdquo;
            </GlassButton>
          )}
        </div>, document.body
      )}
    </div>
  )
}

'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'

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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
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
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-lg"
          >
            {val}
            {!disabled && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); removeValue(val) }}
                aria-label={`Remover ${val}`}
                className="text-blue-500 hover:text-blue-800 transition-colors leading-none"
                tabIndex={-1}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
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

      {isOpen && !disabled && (filtered.length > 0 || showCreate) && (
        <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {filtered.map(opt => (
            <button
              key={opt}
              type="button"
              onMouseDown={e => { e.preventDefault(); addValue(opt) }}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {opt}
            </button>
          ))}
          {showCreate && (
            <button
              type="button"
              onMouseDown={e => { e.preventDefault(); addValue(inputValue) }}
              className="w-full px-4 py-2.5 text-left text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors flex items-center gap-2 border-t border-slate-100"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Criar &ldquo;{inputValue.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}

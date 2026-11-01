'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface ToolbarSelectOption<T extends string> {
  value: T
  label: string
  icon: React.ReactNode
  disabled?: boolean
  /** Motivo de estar desabilitada (aparece como dica). */
  hint?: string
}

interface Props<T extends string> {
  /** Título do card na barra ("Organizar", "Visualização"). */
  title: string
  value: T | null
  options: ToolbarSelectOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  /** Texto do botão quando não há valor (ex.: nada selecionado). */
  placeholder?: string
}

/**
 * Card da barra da EAP com um select de ícones: o botão mostra a opção atual e a
 * seta abre a lista (como o "Organizar" do vídeo de referência). Teclado: setas,
 * Home/End, Enter/Espaço escolhem, Esc fecha.
 */
export default function ToolbarSelect<T extends string>({ title, value, options, onChange, disabled, placeholder }: Props<T>) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  // A barra da EAP rola na horizontal (overflow): a lista usa posição fixa para não ser cortada.
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const atual = options.find(o => o.value === value) ?? null

  useEffect(() => {
    if (!open) return
    const fora = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.focus()
    const fechar = () => setOpen(false)
    window.addEventListener('resize', fechar)
    window.addEventListener('scroll', fechar, true)
    return () => { window.removeEventListener('resize', fechar); window.removeEventListener('scroll', fechar, true) }
  }, [open])

  function abrir() {
    if (disabled) return
    const i = options.findIndex(o => o.value === value)
    setActive(i >= 0 ? i : 0)
    const r = buttonRef.current?.getBoundingClientRect()
    setPos(r ? { top: r.bottom + 4, left: r.left } : null)
    setOpen(true)
  }

  function escolher(i: number) {
    const o = options[i]
    if (!o || o.disabled) return
    onChange(o.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  function mover(delta: number) {
    setActive(prev => {
      for (let k = 1; k <= options.length; k++) {
        const i = (prev + delta * k + options.length) % options.length
        if (!options[i].disabled) return i
      }
      return prev
    })
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mover(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mover(-1) }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0) }
    else if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); escolher(active) }
    else if (e.key === 'Escape' || e.key === 'Tab') { setOpen(false); if (e.key === 'Escape') buttonRef.current?.focus() }
  }

  return (
    <div ref={rootRef} className="relative flex flex-col gap-0.5 border border-gray-200 rounded-md bg-white p-1 shadow-sm shrink-0">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 px-0.5">{title}</span>
      <OperumButton variant="custom"
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : abrir())}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); abrir() } }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${title}: ${atual?.label ?? placeholder ?? 'escolher'}`}
        title={atual?.label ?? placeholder}
        className="flex items-center gap-1 rounded px-1 py-0.5 text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
      >
        <span className="flex items-center justify-center w-7 h-7">{atual?.icon ?? options[0]?.icon}</span>
        <span className="text-[11px] font-medium max-w-[7.5rem] truncate">{atual?.label ?? placeholder}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
      </OperumButton>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-label={title}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onKeyDown}
          style={pos ? { position: 'fixed', top: pos.top, left: pos.left } : undefined}
          className="fixed z-50 min-w-[12rem] rounded-md border border-gray-200 bg-white py-1 shadow-lg focus:outline-none"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              title={o.disabled ? o.hint : undefined}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()}
              onClick={() => escolher(i)}
              className={`flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer select-none
                ${o.disabled ? 'opacity-40 cursor-not-allowed' : ''}
                ${i === active && !o.disabled ? 'bg-blue-50' : ''}
                ${o.value === value ? 'text-blue-700 font-medium' : 'text-gray-700'}`}
            >
              <span className="flex items-center justify-center w-8 h-8 shrink-0">{o.icon}</span>
              <span>{o.label}</span>
              {o.value === value && <span className="ml-auto text-xs" aria-hidden="true">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

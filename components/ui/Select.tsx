'use client'

import { Input as OperumInput } from '@/components/ui/Field'
import GlassButton from '@/components/ui/GlassButton'

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Plus, Search } from 'lucide-react'

export interface SelectOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
  /** Antes do nome (ex.: foto da pessoa), na opção e no campo selecionado. */
  icone?: ReactNode
}

export interface SelectProps {
  options: SelectOption[]
  value?: string | null
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  id?: string
  name?: string
  ariaLabel?: string
  className?: string
  compact?: boolean
  /** Dentro de texto (ex.: folha dos documentos): sem borda nem altura própria, segue a fonte e a linha de quem está em volta. */
  inline?: boolean
  /** Valor de uma linha de propriedades (painel lateral): texto com seta, fundo só ao passar o mouse. */
  propriedade?: boolean
  searchable?: boolean
  onCreate?: () => void
  createLabel?: string
}

export default function Select({ options, value, onChange, placeholder = 'Selecione...', disabled = false,
  id, name, ariaLabel, className = '', compact = false, inline = false, propriedade = false, searchable = true, onCreate,
  createLabel = 'Criar novo',
}: SelectProps) {
  const uid = useId()
  const listId = `${uid}-list`
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 })
  const visible = options.filter(option => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))
  const selected = value == null || value === '' ? undefined : options.find(option => option.value === value)
  const expanded = open && !disabled
  const targets = visible.flatMap((option, index) => option.disabled ? [] : [index])
  if (onCreate) targets.push(visible.length)
  const activeId = active >= 0 && active < visible.length && !visible[active]?.disabled ? `${uid}-option-${active}` : undefined

  function close(restoreFocus = false) {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }

  function show(last = false) {
    if (disabled) return
    setQuery('')
    const enabled = options.flatMap((option, index) => option.disabled ? [] : [index])
    const current = options.findIndex(option => option.value === value && !option.disabled)
    setActive(last ? (enabled.at(-1) ?? (onCreate ? options.length : -1)) : current >= 0 ? current : (enabled[0] ?? (onCreate ? options.length : -1)))
    setOpen(true)
  }

  function choose(index: number) {
    if (index === visible.length && onCreate) {
      close(true)
      onCreate()
    } else if (visible[index] && !visible[index].disabled) {
      close(true)
      onChange?.(visible[index].value)
    }
  }

  function keys(event: KeyboardEvent) {
    if (event.key === 'Tab') {
      const onFooter = document.activeElement?.id === `${uid}-create`
      if ((event.shiftKey && !onFooter) || (!event.shiftKey && (onFooter || !onCreate))) close(true)
    }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const current = targets.indexOf(active)
      const next = current < 0 ? (direction > 0 ? 0 : targets.length - 1) : (current + direction + targets.length) % targets.length
      setActive(targets[next] ?? -1)
    }
    if (event.key === 'Enter') { event.preventDefault(); choose(active) }
  }

  useLayoutEffect(() => {
    if (!expanded) return
    function place() {
      const rect = trigger.current?.getBoundingClientRect()
      if (!rect) return
      const margin = 8
      const below = window.innerHeight - rect.bottom - margin - 6
      const above = rect.top - margin - 6
      const upwards = below < 220 && above > below
      const maxHeight = Math.max(0, Math.min(320, upwards ? above : below))
      const width = Math.min(Math.max(rect.width, 240), Math.max(0, window.innerWidth - margin * 2))
      const height = Math.min(panel.current?.scrollHeight ?? maxHeight, maxHeight)
      setPosition({ width, maxHeight, left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)), top: upwards ? Math.max(margin, rect.top - height - 6) : Math.max(margin, rect.bottom + 6) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [expanded, query, options.length])

  useEffect(() => {
    if (!expanded) return
    if (searchable) search.current?.focus()
    else panel.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus()
    function outside(event: MouseEvent) {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    function focusOutside(event: FocusEvent) {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('focusin', focusOutside)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('focusin', focusOutside) }
  }, [expanded, searchable])

  useEffect(() => {
    if (!expanded || active < 0) return
    const element = document.getElementById(active === visible.length ? `${uid}-create` : `${uid}-option-${active}`)
    element?.scrollIntoView?.({ block: 'nearest' })
    if (active === visible.length) element?.focus()
    else if (document.activeElement?.id === `${uid}-create`) {
      if (searchable) search.current?.focus()
      else panel.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus()
    }
  }, [active, expanded, uid, visible.length, searchable])

  return (
    <span className={`inline-flex min-w-0 ${inline || propriedade ? 'w-full align-baseline' : compact ? 'max-w-full align-middle' : 'w-full'} ${className}`}>
      {name && <input type="hidden" name={name} value={value ?? ''} disabled={disabled} />}
      <GlassButton variant="custom" ref={trigger} id={id} type="button" role="combobox" aria-label={ariaLabel} aria-haspopup="listbox"
        aria-expanded={expanded} aria-controls={expanded ? listId : undefined} disabled={disabled}
        onClick={() => expanded ? close() : show()}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(event.key === 'ArrowUp') }
        }}
        className={`operum-field group flex min-w-0 items-center justify-between gap-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-50 ${propriedade ? 'h-8 w-full rounded-lg px-2.5 text-[13px] font-medium hover:bg-slate-100 aria-expanded:bg-slate-100' : inline ? 'w-full rounded-sm px-0.5 leading-[inherit]! [font:inherit]! hover:bg-blue-50/60 aria-expanded:bg-[#f5f8ff] aria-expanded:outline aria-expanded:outline-2 aria-expanded:outline-blue-500' : compact ? 'h-7 rounded-md border border-transparent px-1.5 hover:border-slate-200 hover:bg-slate-50' : 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm hover:border-blue-300'} ${selected ? (inline ? 'text-inherit' : 'text-slate-800') : 'text-slate-400'}`}>
        <span className="flex min-w-0 items-center gap-2">{selected?.icone && <span className="shrink-0">{selected.icone}</span>}<span className="truncate">{selected?.label ?? placeholder}</span></span>
        <ChevronDown aria-hidden="true" size={compact || inline || propriedade ? 13 : 16} className={`shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </GlassButton>
      {expanded && createPortal(
        <div data-glass-select-panel ref={panel} tabIndex={-1} onKeyDown={keys} style={{ position: 'fixed', ...position, zIndex: 10000 }}
          className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-xl shadow-slate-900/10 outline-none">
          {searchable && <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-3 py-2.5">
            <Search size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
            <OperumInput ref={search} value={query} onChange={event => { setQuery(event.target.value); setActive(-1) }}
              role="combobox" aria-label={`Buscar ${ariaLabel ?? 'opções'}`} aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={activeId}
              placeholder="Buscar..." className="min-w-0 flex-1 bg-transparent text-slate-700 outline-none placeholder:text-slate-400" />
          </div>}
          <div id={listId} role="listbox" aria-label={ariaLabel ?? 'Opções'} tabIndex={searchable ? undefined : 0}
            aria-activedescendant={!searchable ? activeId : undefined} className="min-h-0 flex-1 overflow-y-auto p-1">
            {visible.length === 0 && <div role="status" className="px-3 py-5 text-center text-slate-400">Nenhuma opção encontrada</div>}
            {visible.map((option, index) => <div key={option.value} id={`${uid}-option-${index}`} role="option" data-active={active === index}
              aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
              onMouseEnter={() => { if (!option.disabled) setActive(index) }} onMouseDown={event => event.preventDefault()}
              onClick={() => choose(index)}
              className={`glass-select-option flex items-center gap-3 rounded-lg px-3 py-2 ${option.disabled ? 'cursor-not-allowed text-slate-300' : `cursor-pointer ${active === index ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}`}>
              {option.icone && <span className="shrink-0">{option.icone}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{option.label}</span>{option.description && <span className="block truncate text-xs text-slate-400">{option.description}</span>}</span>
              {option.value === value && <Check size={16} aria-hidden="true" className="shrink-0 text-blue-600" />}
            </div>)}
          </div>
          {onCreate && <div className="shrink-0 border-t border-slate-100 p-1">
            <GlassButton variant="custom" id={`${uid}-create`} type="button" onClick={() => choose(visible.length)}
              onFocus={() => setActive(visible.length)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left font-medium text-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${active === visible.length ? 'bg-blue-50' : 'hover:bg-blue-50'}`}>
              <Plus size={16} aria-hidden="true" />{createLabel}
            </GlassButton>
          </div>}
        </div>, document.body)}
    </span>
  )
}

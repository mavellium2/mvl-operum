'use client'

import GlassButton from '@/components/ui/GlassButton'

import { useId, useRef } from 'react'

export interface GlassSegment<T extends string> {
  value: T
  label: string
  description?: string
  changed?: boolean
  id?: string
  panelId?: string
}

export default function GlassSegmentedControl<T extends string>({ options, value, onChange, label, variant = 'tabs', className = '' }: {
  options: readonly GlassSegment<T>[]
  value: string
  onChange: (value: T) => void
  label: string
  variant?: 'tabs' | 'compact'
  className?: string
}) {
  const uid = useId()
  const root = useRef<HTMLDivElement>(null)
  const compact = variant === 'compact'
  const selected = options.findIndex(option => option.value === value)
  return <div ref={root} role={compact ? 'radiogroup' : 'tablist'} aria-label={label}
    className={`${compact ? 'period-glass-tabs' : 'project-section-tabs'} relative isolate mb-3 grid shrink-0 gap-1 rounded-[20px] p-1.5 ${className}`}
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {selected >= 0 && <span aria-hidden="true" className={`pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 rounded-[15px] ${compact ? 'period-glass-lens' : ''}`}
      style={{ width: `calc((100% - 0.75rem - ${(options.length - 1) * .25}rem) / ${options.length})`, transform: `translateX(calc(${selected} * (100% + 0.25rem)))` }} />}
    {options.map((option, index) => <GlassButton variant="custom" key={option.value} type="button" role={compact ? 'radio' : 'tab'}
      id={option.id ?? `${uid}-${index}`} aria-controls={option.panelId}
      aria-selected={compact ? undefined : option.value === value} aria-checked={compact ? option.value === value : undefined}
      tabIndex={index === (selected < 0 ? 0 : selected) ? 0 : -1}
      onClick={() => onChange(option.value)}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length
        root.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()
        onChange(options[next].value)
      }}
      className={`${compact ? 'period-glass-option items-center text-center text-xs font-semibold' : 'pressionavel items-start text-left'} relative z-10 flex min-w-0 flex-col overflow-hidden rounded-[15px] px-4 py-2`}>
      <span className={`flex items-center gap-1.5 ${compact ? '' : 'text-sm font-bold'} ${option.value === value ? 'text-slate-900' : 'text-slate-600'}`}>
        {option.label}{option.changed && <span className="anim-surgir h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" title="Com alterações" />}
      </span>
      {option.description && <span className="truncate text-xs font-medium text-slate-500">{option.description}</span>}
    </GlassButton>)}
  </div>
}

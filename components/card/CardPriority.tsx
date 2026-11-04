'use client'

import Select from '@/components/ui/Select'
import { Flag } from 'lucide-react'
import OperumButton from '@/components/ui/GlassButton'
import { PRIORITY_LABELS } from '@/lib/cardUtils'

export default function CardPriority({ priority, onChange, compact = false }: { priority: string; onChange?: (priority: string) => void; compact?: boolean }) {
  if (compact) return (
    <div className="flex items-center gap-2">
      <span className="min-w-[76px] text-[11px] font-semibold text-[var(--ap-muted,#64748b)]">Prioridade</span>
      {onChange ? (
        <Select
          compact
          searchable={false}
          ariaLabel="Prioridade"
          placeholder="Selecionar"
          value={priority}
          onChange={value => { if (value) onChange(value) }}
          options={Object.entries(PRIORITY_LABELS).map(([value, { label, cls }]) => ({
            value, label,
            icone: <Flag size={13} aria-hidden="true" className={cls.split(' ')[1]} />,
          }))}
        />
      ) : <span className="text-xs">{PRIORITY_LABELS[priority]?.label ?? '—'}</span>}
    </div>
  )

  return (
    <div>
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Prioridade</p>
      {!onChange ? (
        <span className={`inline-block px-3 py-1.5 text-xs font-medium rounded-md ${PRIORITY_LABELS[priority]?.cls ?? 'bg-slate-100 text-slate-600'}`}>
          {PRIORITY_LABELS[priority]?.label ?? '—'}
        </span>
      ) : (
        <div className="flex gap-1.5">
          {(['baixa', 'media', 'alta'] as const).map(p => (
            <OperumButton variant="default" type="button"
              key={p}
              onClick={() => onChange(p)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer border ${
                priority === p
                  ? `${PRIORITY_LABELS[p].cls} border-transparent ring-2 ring-offset-1 ring-blue-400`
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {PRIORITY_LABELS[p].label}
            </OperumButton>
          ))}
        </div>
      )}
    </div>
  )
}

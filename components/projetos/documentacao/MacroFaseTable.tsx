'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import MoedaInput from '@/components/ui/MoedaInput'
import { useEffect, useRef } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import DateInput from '@/components/ui/DateInput'

export interface MacroFase {
  id: string
  fase: string
  dataLimite: string | null
  custo: string | null
}

interface Props {
  fases: MacroFase[]
  onChange: (id: string, field: keyof Omit<MacroFase, 'id'>, value: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  autoFocusId?: string
  disabled?: boolean
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const thClass = 'px-3 py-2 text-xs font-semibold text-slate-600 text-left border-b border-slate-200'
const tdClass = 'px-2 py-1.5'
const inputClass =
  'w-full bg-transparent border border-transparent rounded px-2 py-1 text-sm text-slate-800 ' +
  'hover:border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors'

// ── Component ─────────────────────────────────────────────────────────────────

export default function MacroFaseTable({ fases, onChange, onAdd, onRemove, autoFocusId, disabled }: Props) {
  const faseInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  // Auto-focus newly added fase input
  useEffect(() => {
    if (!autoFocusId) return
    const el = faseInputRefs.current.get(autoFocusId)
    if (el) el.focus()
  }, [autoFocusId])

  const total = fases.reduce((sum, f) => {
    const n = parseFloat((f.custo ?? '').replace(',', '.'))
    return sum + (isNaN(n) ? 0 : n)
  }, 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className={thClass} style={{ width: '40%' }}>Macro Fase</th>
            <th className={thClass} style={{ width: '25%' }}>Data Limite</th>
            <th className={thClass} style={{ width: '25%' }}>Custo (R$)</th>
            <th className={`${thClass} text-center`} style={{ width: '10%' }} />
          </tr>
        </thead>
        <tbody>
          {fases.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-slate-400 text-sm">
                Nenhuma macro fase cadastrada.
              </td>
            </tr>
          )}
          {fases.map(f => (
            <tr key={f.id} className="group hover:bg-slate-50 transition-colors border-b border-slate-100">
              <td className={tdClass}>
                <OperumInput
                  ref={el => {
                    if (el) faseInputRefs.current.set(f.id, el)
                    else faseInputRefs.current.delete(f.id)
                  }}
                  className={inputClass}
                  value={f.fase}
                  onChange={e => onChange(f.id, 'fase', e.target.value)}
                  placeholder="Nome da fase"
                  disabled={disabled}
                />
              </td>
              <td className={tdClass}>
                <DateInput
                  className={inputClass}
                  value={f.dataLimite ?? ''}
                  onChange={v => onChange(f.id, 'dataLimite', v)}
                  disabled={disabled}
                />
              </td>
              <td className={tdClass}>
                <MoedaInput
                  value={f.custo}
                  // O Termo guarda o custo como "1234.50".
                  onValueChange={(_, valor) => onChange(f.id, 'custo', valor === null || Number.isNaN(valor) ? '' : valor.toFixed(2))}
                  rotulo="Custo"
                  aria-label="Custo"
                  className={inputClass + ' text-right'}
                  disabled={disabled}
                />
              </td>
              <td className={`${tdClass} text-center`}>
                <OperumButton variant="custom" type="button"
                  onClick={() => onRemove(f.id)}
                  disabled={disabled}
                  className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-30"
                  aria-label="Remover fase"
                >
                  <Trash2 className="w-4 h-4" />
                </OperumButton>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-slate-50 border-t-2 border-slate-300 font-semibold">
            <td className="px-3 py-2 text-sm text-slate-700" colSpan={2}>
              <OperumButton variant="default" type="button"
                onClick={onAdd}
                disabled={disabled}
                className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar fase
              </OperumButton>
            </td>
            <td className="px-3 py-2 text-sm text-slate-800 text-right" colSpan={2}>
              Total:{' '}
              <span className="font-bold">
                {total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

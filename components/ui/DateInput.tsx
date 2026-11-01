'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'

interface DateInputProps {
  id?: string
  name?: string
  /** Data canônica (aaaa-mm-dd) — mesmo contrato do <input type="date"> nativo. */
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  ariaLabel?: string
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** aaaa-mm-dd (ou ISO datetime) → dd/mm/aaaa */
function toBR(value: string): string {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (br) return `${pad2(Number(br[1]))}/${pad2(Number(br[2]))}/${br[3]}`
  return ''
}

/** Máscara dd/mm/aaaa enquanto o usuário digita */
function maskBR(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** Valida dd/mm/aaaa (dia real do calendário) */
function isValidBR(text: string): boolean {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return false
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12) return false
  const d = new Date(year, month - 1, day)
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
}

/**
 * Campo de data com exibição garantida em dd/mm/aaaa, independente do locale
 * do navegador (diferente do <input type="date"> nativo, que segue o SO/browser).
 * Mantém o contrato de valor aaaa-mm-dd e oferece o calendário nativo via
 * showPicker().
 */
export default function DateInput({
  id,
  name,
  value,
  onChange,
  className = '',
  placeholder = 'dd/mm/aaaa',
  required = false,
  disabled = false,
  ariaLabel,
}: DateInputProps) {
  const [prevValue, setPrevValue] = useState(value)
  const [text, setText] = useState(() => toBR(value))
  const hiddenRef = useRef<HTMLInputElement>(null)

  // Sincroniza quando o valor canônico muda por fora (ex.: carga de versão aprovada).
  // Padrão "ajuste de estado durante render" da documentação do React: em vez de efeito,
  // compara com o valor anterior e reseta o texto apenas quando o prop muda.
  if (value !== prevValue) {
    setPrevValue(value)
    setText(toBR(value))
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = maskBR(e.target.value)
    setText(next)
    if (next.length === 0) {
      onChange('')
      return
    }
    if (isValidBR(next)) {
      const iso = `${next.slice(6, 10)}-${next.slice(3, 5)}-${next.slice(0, 2)}`
      onChange(iso)
    }
  }

  // Ao sair do campo, descarta digitação incompleta/inválida
  function handleBlur() {
    if (text.trim() !== '' && !isValidBR(text)) {
      setText(toBR(value))
    }
  }

  function openPicker() {
    const el = hiddenRef.current
    if (!el || disabled) return
    if (value) el.value = value
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {
        // showPicker indisponível (jsdom / browsers antigos) → segue para fallback
      }
    }
    el.focus()
  }

  return (
    <div className="relative">
      <OperumInput
        type="text"
        inputMode="numeric"
        id={id}
        name={name}
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
        autoComplete="off"
        className={`${className} pr-9 ${disabled ? 'opacity-60' : ''}`}
      />
      <OperumButton variant="custom"
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Abrir calendário"
        className="absolute inset-y-0 right-0 flex items-center px-2 text-slate-400 hover:text-slate-600 transition-colors"
      >
        <CalendarDays className="w-4 h-4" />
      </OperumButton>
      {/* Input nativo escondido usado apenas para abrir o calendário do browser */}
      <OperumInput
        ref={hiddenRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        value={value}
        onChange={e => {
          if (!e.target.value) return
          setText(toBR(e.target.value))
          onChange(e.target.value)
        }}
      />
    </div>
  )
}
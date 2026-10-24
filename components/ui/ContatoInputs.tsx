'use client'

import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { erroEmail, erroTelefone, formatEmail, formatTelefone } from '@/lib/contato'

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  /** Valor controlado. Sem ele, o campo guarda o próprio estado a partir de `defaultValue`. */
  value?: string | null
  defaultValue?: string | null
  onValueChange?: (valor: string) => void
  /** Ícone ou outro adorno posicionado sobre o campo (fica num wrapper `relative`). */
  adorno?: ReactNode
}

type CampoProps = BaseProps & {
  type: 'tel' | 'email'
  formatar: (v: string) => string
  validar: (v: string, obrigatorio: boolean) => string | null
}

function CampoContato({ type, formatar, validar, value, defaultValue, onValueChange, adorno, required, onBlur, className, id, ...rest }: CampoProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const erroId = `${inputId}-erro`
  const ref = useRef<HTMLInputElement>(null)
  // Valor salvo só ganha máscara se for válido: texto antigo fora do padrão aparece como está.
  const exibir = (v: string) => (validar(v, false) === null ? formatar(v) : v)
  const [interno, setInterno] = useState(() => exibir(defaultValue ?? ''))
  const [tocado, setTocado] = useState(false)
  const atual = value !== undefined ? exibir(value ?? '') : interno
  const erro = validar(atual, Boolean(required))

  // Bloqueia o envio nativo do formulário enquanto o valor for inválido.
  useEffect(() => {
    ref.current?.setCustomValidity(erro ?? '')
  }, [erro])

  const mostrarErro = tocado && erro !== null

  const input = (
    <input
      {...rest}
      ref={ref}
      id={inputId}
      type={type}
      inputMode={type === 'tel' ? 'tel' : 'email'}
      autoComplete={rest.autoComplete ?? (type === 'tel' ? 'tel' : 'email')}
      required={required}
      value={atual}
      onChange={e => {
        const formatado = formatar(e.target.value)
        if (value === undefined) setInterno(formatado)
        onValueChange?.(formatado)
      }}
      onBlur={e => {
        setTocado(true)
        onBlur?.(e)
      }}
      onInvalid={() => setTocado(true)}
      aria-invalid={mostrarErro || undefined}
      aria-describedby={mostrarErro ? erroId : rest['aria-describedby']}
      className={`${className ?? ''} ${mostrarErro ? 'border-red-400 focus:ring-red-400' : ''}`}
    />
  )

  return (
    <>
      {adorno ? <div className="relative">{adorno}{input}</div> : input}
      {mostrarErro && <p id={erroId} className="mt-1 text-xs text-red-600">{erro}</p>}
    </>
  )
}

/** Campo de telefone com máscara (00) 00000-0000 e validação. */
export function TelefoneInput(props: BaseProps) {
  return <CampoContato {...props} type="tel" formatar={formatTelefone} validar={erroTelefone} placeholder={props.placeholder ?? '(00) 00000-0000'} />
}

/** Campo de e-mail sem espaços e com validação de formato. */
export function EmailInput(props: BaseProps) {
  return <CampoContato {...props} type="email" formatar={formatEmail} validar={erroEmail} />
}

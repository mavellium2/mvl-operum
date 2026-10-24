'use client'

import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { erroMoeda, formatMoeda, moedaParaCampo, parseMoeda } from '@/lib/dinheiro'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  /** Valor salvo: texto em qualquer formato aceito ("1.234,56", "1234.56") ou número. */
  value?: string | number | null
  defaultValue?: string | number | null
  /** Recebe o texto com máscara ("1.234,56", vazio sem valor) e o número (null sem valor). */
  onValueChange?: (texto: string, valor: number | null) => void
  /** Mostra "R$ " dentro do campo (para quando não há um prefixo visual ao lado). */
  comSimbolo?: boolean
  /** Ícone ou prefixo posicionado sobre o campo (fica num wrapper `relative`). */
  adorno?: ReactNode
  /** Nome usado nas mensagens de erro, ex.: "Valor/hora". */
  rotulo?: string
}

/** Campo de valor em reais com máscara (centavos entram pela direita) e validação. */
export default function MoedaInput({ value, defaultValue, onValueChange, comSimbolo = false, adorno, rotulo, required, onBlur, className, id, placeholder, ...rest }: Props) {
  const autoId = useId()
  const inputId = id ?? autoId
  const erroId = `${inputId}-erro`
  const ref = useRef<HTMLInputElement>(null)
  const [interno, setInterno] = useState(() => moedaParaCampo(defaultValue, comSimbolo))
  const [tocado, setTocado] = useState(false)
  const atual = value !== undefined ? moedaParaCampo(value, comSimbolo) : interno
  const erro = erroMoeda(atual, { obrigatorio: Boolean(required), rotulo })

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
      type="text"
      inputMode="numeric"
      required={required}
      value={atual}
      placeholder={placeholder ?? (comSimbolo ? 'R$ 0,00' : '0,00')}
      onChange={e => {
        const texto = formatMoeda(e.target.value, comSimbolo)
        if (value === undefined) setInterno(texto)
        onValueChange?.(texto, parseMoeda(texto))
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

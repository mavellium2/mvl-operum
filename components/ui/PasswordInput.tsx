'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type PasswordInputProps = Omit<ComponentProps<'input'>, 'type'> & {
  /** Classes do contêiner (o input ocupa a largura dele). */
  wrapperClassName?: string
}

/**
 * Campo de senha com botão para mostrar ou ocultar o que foi digitado (SDD 4.6).
 * Repassa todas as props do input, então troca um `<input type="password">`
 * sem mudar o resto. O botão é `type="button"` (não envia o formulário) e fica
 * desabilitado junto com o campo.
 */
export default function PasswordInput({ className = '', wrapperClassName = '', disabled, ...props }: PasswordInputProps) {
  const [visivel, setVisivel] = useState(false)
  return (
    <div className={`relative ${wrapperClassName}`}>
      <OperumInput {...props} disabled={disabled} type={visivel ? 'text' : 'password'} className={`${className} pr-10`} />
      <OperumButton variant="custom"
        type="button"
        onClick={() => setVisivel(v => !v)}
        disabled={disabled}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
      >
        {visivel ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
      </OperumButton>
    </div>
  )
}

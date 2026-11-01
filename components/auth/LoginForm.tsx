'use client'

import OperumButton from '@/components/ui/GlassButton'
import { Input as OperumInput } from '@/components/ui/Field'
import { formatEmail } from '@/lib/contato'
import { useActionState, useRef, useState } from 'react'
import Link from 'next/link'
import { loginAction } from '@/app/actions/auth'
import type { FormState } from '@/types/auth'

interface LoginFormProps {
  /** Página para voltar depois do login (vinda do ?from= do proxy). */
  from?: string
  /** "inatividade": a sessão expirou por falta de uso. */
  motivo?: string
}

export function LoginForm({ from, motivo }: LoginFormProps = {}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [shaking, setShaking] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  const [state, formAction, pending] = useActionState(
    async (prevState: FormState, formData: FormData) => {
      const result = await loginAction(prevState, formData)
      if (result?.message) {
        setPassword('')
        setShaking(true)
        setTimeout(() => setShaking(false), 450)
        requestAnimationFrame(() => passwordRef.current?.focus())
      }
      return result
    },
    undefined,
  )

  const emailFloating = emailFocused || email !== ''
  const passwordFloating = passwordFocused || password !== ''

  const inputClass =
    'w-full rounded-xl px-4 pt-6 pb-2 text-sm outline-none transition-all duration-150'
  const inputStyle: React.CSSProperties = {
    background: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    color: 'var(--text-primary)',
  }
  const inputFocusStyle: React.CSSProperties = {
    boxShadow: '0 0 0 3px rgba(79,70,229,0.15)',
    borderColor: 'var(--brand-2)',
  }

  return (
    <div
      className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl"
      style={{
        border: '1px solid var(--border)',
        ...(shaking ? { animation: 'shake 0.45s ease both' } : {}),
      }}
    >
      <div className="mb-6">
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Entrar
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Acesse sua conta para continuar.
        </p>
      </div>

      {motivo === 'inatividade' && !state?.message && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Sua sessão expirou por inatividade. Entre de novo para continuar de onde parou.
        </p>
      )}

      <form action={formAction} className="flex flex-col gap-5">
        {from && <input type="hidden" name="from" value={from} />}
        {/* Email */}
        <div className="relative">
          <OperumInput
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(formatEmail(e.target.value))}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
            placeholder=" "
            className={inputClass}
            style={{
              ...inputStyle,
              ...(emailFocused ? inputFocusStyle : {}),
            }}
          />
          <label
            htmlFor="email"
            className="pointer-events-none absolute left-4 transition-all duration-150"
            style={
              emailFloating
                ? {
                    top: '6px',
                    fontSize: '11px',
                    color: emailFocused ? 'var(--brand-2)' : 'var(--text-secondary)',
                  }
                : {
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                  }
            }
          >
            Email
          </label>
        </div>

        {/* Senha */}
        <div className="flex flex-col gap-1">
          <div className="relative">
            <OperumInput
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              ref={passwordRef}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder=" "
              className={`${inputClass} pr-11`}
              style={{
                ...inputStyle,
                ...(passwordFocused ? inputFocusStyle : {}),
              }}
            />
            <label
              htmlFor="password"
              className="pointer-events-none absolute left-4 transition-all duration-150"
              style={
                passwordFloating
                  ? {
                      top: '6px',
                      fontSize: '11px',
                      color: passwordFocused ? 'var(--brand-2)' : 'var(--text-secondary)',
                    }
                  : {
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '14px',
                      color: 'var(--text-secondary)',
                    }
              }
            >
              Senha
            </label>
            <OperumButton variant="custom"
              type="button"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors duration-150"
              style={{ color: 'var(--text-secondary)' }}
              tabIndex={0}
            >
              {showPassword ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </OperumButton>
          </div>
          <div className="flex justify-end">
            <Link
              href="/recuperar-senha"
              className="text-xs font-medium underline-offset-2 hover:underline"
              style={{ color: 'var(--brand-2)' }}
            >
              Esqueci minha senha
            </Link>
          </div>
        </div>

        {/* Erro inline */}
        {state?.message && (
          <div
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2"
            role="alert"
            aria-live="assertive"
          >
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-sm text-red-700">{state.message}</span>
          </div>
        )}

        {/* Botão Entrar */}
        <OperumButton variant="default"
          type="submit"
          disabled={pending}
          className="relative w-full overflow-hidden rounded-xl px-4 py-3 text-sm font-medium text-white transition-transform duration-150 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:scale-100"
          style={{
            background: 'linear-gradient(135deg, var(--brand-1), var(--brand-3))',
          }}
        >
          {/* Shimmer */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.4s linear infinite',
            }}
          />
          <span className="relative flex items-center justify-center gap-2">
            {pending && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {pending ? 'Entrando…' : 'Entrar'}
          </span>
        </OperumButton>
      </form>
    </div>
  )
}

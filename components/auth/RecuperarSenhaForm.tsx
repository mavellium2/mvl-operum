'use client'

import { formatEmail } from '@/lib/contato'
import { useActionState, useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  requestPasswordResetAction,
  validateResetCodeAction,
  resetPasswordAction,
} from '@/app/actions/auth'
import { PasswordCriteria } from '@/components/auth/PasswordCriteria'
import { Eye, EyeOff } from 'lucide-react'

type Step = 'email' | 'code' | 'password' | 'done'

const STEP_LABELS = ['Email', 'Código', 'Nova Senha']
const OTP_LENGTH = 8
const RESEND_COOLDOWN = 60

function stepIndex(step: Step): number {
  return step === 'email' ? 0 : step === 'code' ? 1 : step === 'password' ? 2 : 3
}

const inputBase: React.CSSProperties = {
  background: '#ffffff',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'var(--border)',
  color: 'var(--text-primary)',
}
const inputFocus: React.CSSProperties = {
  boxShadow: '0 0 0 3px rgba(79,70,229,0.15)',
  borderColor: 'var(--brand-2)',
}

/* ────────────── Floating-label input ────────────── */
function FloatingInput({
  id, name, label, type = 'text', value, onChange, onFocus, onBlur, focused, maxLength, autoComplete, required,
}: {
  id: string; name: string; label: string; type?: string
  value: string; onChange: (v: string) => void
  onFocus: () => void; onBlur: () => void; focused: boolean
  maxLength?: number; autoComplete?: string; required?: boolean
}) {
  const floating = focused || value !== ''
  // Senha ganha o botão de mostrar/ocultar (SDD 4.6).
  const ehSenha = type === 'password'
  const [visivel, setVisivel] = useState(false)
  return (
    <div className="relative">
      <input
        id={id} name={name} type={ehSenha && visivel ? 'text' : type} required={required}
        autoComplete={autoComplete} maxLength={maxLength}
        value={value} placeholder=" "
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus} onBlur={onBlur}
        className={`w-full rounded-xl px-4 pt-6 pb-2 text-sm transition-all duration-150${ehSenha ? ' pr-11' : ''}`}
        style={{ ...inputBase, ...(focused ? inputFocus : {}) }}
      />
      {ehSenha && (
        <button
          type="button"
          onClick={() => setVisivel(v => !v)}
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          className="absolute inset-y-0 right-0 flex items-center px-3.5 cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          {visivel ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
        </button>
      )}
      <label
        htmlFor={id}
        className="pointer-events-none absolute left-4 transition-all duration-150"
        style={
          floating
            ? { top: '6px', fontSize: '11px', color: focused ? 'var(--brand-2)' : 'var(--text-secondary)' }
            : { top: '50%', transform: 'translateY(-50%)', fontSize: '14px', color: 'var(--text-secondary)' }
        }
      >
        {label}
      </label>
    </div>
  )
}

/* ────────────── OTP Input (8 cells) ────────────── */
function OtpInput({
  value,
  onChange,
  name,
}: {
  value: string
  onChange: (v: string) => void
  name: string
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const digits = Array.from({ length: OTP_LENGTH }, (_, i) => value[i] ?? '')

  const update = useCallback(
    (idx: number, ch: string) => {
      const next = digits.map((d, i) => (i === idx ? ch : d)).join('').replace(/[^A-Z2-9]/gi, '').toUpperCase()
      onChange(next)
    },
    [digits, onChange],
  )

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        update(idx, '')
      } else if (idx > 0) {
        refs.current[idx - 1]?.focus()
        update(idx - 1, '')
      }
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      refs.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < OTP_LENGTH - 1) {
      refs.current[idx + 1]?.focus()
    }
  }

  const handleChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^A-Z2-9]/gi, '').toUpperCase()
    if (!raw) return
    if (raw.length > 1) {
      const pasted = raw.slice(0, OTP_LENGTH - idx)
      const next = [...digits]
      for (let i = 0; i < pasted.length; i++) next[idx + i] = pasted[i]
      onChange(next.join(''))
      const focusAt = Math.min(idx + pasted.length, OTP_LENGTH - 1)
      refs.current[focusAt]?.focus()
      return
    }
    update(idx, raw[0])
    if (idx < OTP_LENGTH - 1) refs.current[idx + 1]?.focus()
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Código de recuperação">
      {/* Hidden input carries the full value for FormData */}
      <input type="hidden" name={name} value={digits.join('')} />
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="text"
          maxLength={1}
          value={d}
          data-testid={`otp-cell-${i}`}
          aria-label={`Digito ${i + 1} de ${OTP_LENGTH}`}
          onChange={(e) => handleChange(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => { e.target.select(); setFocusedIdx(i) }}
          onBlur={() => setFocusedIdx(-1)}
          className="h-12 w-full rounded-xl text-center text-base font-mono font-semibold transition-all duration-150 focus:outline-none"
          style={{
            ...inputBase,
            ...(focusedIdx === i ? inputFocus : {}),
          }}
        />
      ))}
    </div>
  )
}

/* ────────────── Resend button with cooldown ────────────── */
function ResendButton({
  onResend,
  resendCount,
}: {
  onResend: () => void
  resendCount: number
}) {
  const [cooldown, setCooldown] = useState(0)
  const maxResends = 2 // depois de 3 envios totais (1 original + 2 reenvios) o rate limit bate

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(id)
  }, [cooldown])

  const handleClick = () => {
    onResend()
    setCooldown(RESEND_COOLDOWN)
  }

  if (resendCount >= maxResends) {
    return (
      <p className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
        Limite de reenvios atingido. Solicite novamente desde o início.
      </p>
    )
  }

  if (cooldown > 0) {
    return (
      <p className="text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
        Reenviar em <strong>{cooldown}s</strong>
      </p>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-center text-sm underline-offset-2 hover:underline"
      style={{ color: 'var(--brand-2)' }}
    >
      Reenviar código
    </button>
  )
}

/* ────────────── Progress bar ────────────── */
function ProgressBar({ current, total }: { current: number; total: number }) {
  return (
    <div
      className="mb-6 flex gap-1.5"
      role="progressbar"
      aria-valuenow={current + 1}
      aria-valuemax={total}
      aria-label={`Passo ${current + 1} de ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1 flex-1 overflow-hidden rounded-full"
          style={{ background: 'var(--border)' }}
        >
          <div
            className="h-full rounded-full motion-safe:transition-all motion-safe:duration-300"
            style={{
              width: i <= current ? '100%' : '0%',
              background: 'linear-gradient(90deg, var(--brand-1), var(--brand-3))',
            }}
          />
        </div>
      ))}
    </div>
  )
}

/* ────────────── Slide wrapper ────────────── */
function SlideStep({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      aria-hidden={!visible || undefined}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateX(0)' : 'translateX(20px)',
        pointerEvents: visible ? 'auto' : 'none',
        position: visible ? 'relative' : 'absolute',
        width: '100%',
      }}
      className="motion-safe:transition-[opacity,transform] motion-safe:duration-250"
    >
      {children}
    </div>
  )
}

/* ────────────── Error block ────────────── */
function ErrorBlock({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2"
      role="alert"
      aria-live="polite"
    >
      <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <span className="text-sm text-red-700">{message}</span>
    </div>
  )
}

/* ────────────── Primary button ────────────── */
function PrimaryButton({
  pending,
  label,
  loadingLabel,
  disabled,
}: {
  pending: boolean
  label: string
  loadingLabel: string
  disabled?: boolean
}) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="relative w-full overflow-hidden rounded-xl px-4 py-3 text-sm font-medium text-white transition-transform duration-150 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 disabled:scale-100 motion-reduce:hover:scale-100"
      style={{ background: 'linear-gradient(135deg, var(--brand-1), var(--brand-3))' }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 motion-safe:animate-[shimmer_1.4s_linear_infinite]"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)',
          backgroundSize: '200% 100%',
        }}
      />
      <span className="relative flex items-center justify-center gap-2">
        {pending && (
          <svg className="h-4 w-4 motion-safe:animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {pending ? loadingLabel : label}
      </span>
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm text-center transition-colors duration-150 hover:underline"
      style={{ color: 'var(--text-secondary)' }}
    >
      ← Voltar
    </button>
  )
}

/* ────────────── Main component ────────────── */
export function RecuperarSenhaForm() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otpValue, setOtpValue] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resendCount, setResendCount] = useState(0)

  const [ef, setEf] = useState(false)
  const [npf, setNpf] = useState(false)
  const [cpf, setCpf] = useState(false)

  const idx = stepIndex(step)

  const passwordValid =
    newPassword.length >= 8 &&
    /\d/.test(newPassword) &&
    /[^a-zA-Z0-9]/.test(newPassword) &&
    newPassword === confirmPassword

  // ── Step 1 action ──
  const [emailState, emailAction, emailPending] = useActionState(
    async (prevState: unknown, formData: FormData) => {
      const result = await requestPasswordResetAction(prevState, formData)
      if ((result as { success?: boolean }).success) {
        setEmail((formData.get('email') as string).toLowerCase().trim())
        setStep('code')
      }
      return result
    },
    undefined,
  )

  // ── Step 2 action ──
  const [codeState, codeAction, codePending] = useActionState(
    async (prevState: unknown, formData: FormData) => {
      const result = await validateResetCodeAction(prevState, formData)
      if ((result as { success?: boolean }).success) {
        setStep('password')
      }
      return result
    },
    undefined,
  )

  // ── Step 3 action ──
  const [passState, passAction, passPending] = useActionState(
    async (prevState: unknown, formData: FormData) => {
      const result = await resetPasswordAction(prevState, formData)
      if ((result as { success?: boolean }).success) setStep('done')
      return result
    },
    undefined,
  )

  // ── Resend handler ──
  const handleResend = useCallback(async () => {
    setResendCount((c) => c + 1)
    const fd = new FormData()
    fd.set('email', email)
    await requestPasswordResetAction(undefined, fd)
  }, [email])

  return (
    <div
      className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl"
      style={{ border: '1px solid var(--border)' }}
    >
      {step !== 'done' && (
        <>
          <div className="mb-2">
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Recuperar Senha
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
              {STEP_LABELS[idx]}
            </p>
          </div>
          <ProgressBar current={idx} total={3} />
        </>
      )}

      <div className="relative overflow-hidden" data-testid="wizard" data-step={step}>
        {/* ── Step 1: Email ── */}
        <SlideStep visible={step === 'email'}>
          <form action={emailAction} className="flex flex-col gap-4">
            <FloatingInput
              id="email" name="email" label="Email" type="email"
              value={email} onChange={v => setEmail(formatEmail(v))}
              onFocus={() => setEf(true)} onBlur={() => setEf(false)} focused={ef}
              autoComplete="email" required
            />
            <div aria-live="polite">
              <ErrorBlock message={(emailState as { error?: string } | undefined)?.error} />
            </div>
            <PrimaryButton pending={emailPending} label="Enviar código" loadingLabel="Enviando…" />
            <p className="text-center text-sm">
              <Link
                href="/login"
                className="font-medium underline-offset-2 hover:underline"
                style={{ color: 'var(--brand-2)' }}
              >
                Voltar ao login
              </Link>
            </p>
          </form>
        </SlideStep>

        {/* ── Step 2: Code (OTP) ── */}
        <SlideStep visible={step === 'code'}>
          <form action={codeAction} className="flex flex-col gap-4">
            <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>
              Se existe uma conta com{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{email}</strong>
              , você receberá um código de 8 caracteres.
            </p>
            <input type="hidden" name="email" value={email} />
            <OtpInput name="code" value={otpValue} onChange={setOtpValue} />
            <div aria-live="polite">
              <ErrorBlock message={(codeState as { error?: string } | undefined)?.error} />
            </div>
            <PrimaryButton
              pending={codePending}
              label="Validar código"
              loadingLabel="Validando…"
              disabled={otpValue.replace(/[^A-Z2-9]/gi, '').length < OTP_LENGTH}
            />
            <ResendButton onResend={handleResend} resendCount={resendCount} />
            <BackButton onClick={() => { setOtpValue(''); setStep('email') }} />
          </form>
        </SlideStep>

        {/* ── Step 3: New password ── */}
        <SlideStep visible={step === 'password'}>
          <form action={passAction} className="flex flex-col gap-4">
            <input type="hidden" name="email" value={email} />
            <input type="hidden" name="code" value={otpValue} />
            <div>
              <FloatingInput
                id="newPassword" name="newPassword" label="Nova senha" type="password"
                value={newPassword} onChange={setNewPassword}
                onFocus={() => setNpf(true)} onBlur={() => setNpf(false)} focused={npf}
                autoComplete="new-password" required
              />
              <PasswordCriteria value={newPassword} confirm={confirmPassword} />
            </div>
            <FloatingInput
              id="confirmPassword" name="confirmPassword" label="Confirmar senha" type="password"
              value={confirmPassword} onChange={setConfirmPassword}
              onFocus={() => setCpf(true)} onBlur={() => setCpf(false)} focused={cpf}
              autoComplete="new-password" required
            />
            <div aria-live="polite">
              <ErrorBlock message={(passState as { error?: string } | undefined)?.error} />
            </div>
            <PrimaryButton
              pending={passPending}
              label="Redefinir senha"
              loadingLabel="Redefinindo…"
              disabled={!passwordValid}
            />
            <BackButton onClick={() => setStep('code')} />
          </form>
        </SlideStep>

        {/* ── Done ── */}
        <SlideStep visible={step === 'done'}>
          <div className="flex flex-col items-center gap-5 py-6 text-center">
            <svg viewBox="0 0 56 56" className="h-16 w-16" fill="none" aria-label="Sucesso" role="img">
              <circle cx="28" cy="28" r="26" stroke="url(#ok-grad)" strokeWidth="2.5" />
              <path
                d="M16 28l8 8 16-16"
                stroke="url(#ok-grad)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength="1"
                strokeDasharray="1"
                strokeDashoffset="1"
                className="motion-safe:[animation:draw_0.6s_ease_both_0.2s]"
              />
              <defs>
                <linearGradient id="ok-grad" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#7c3aed" />
                  <stop offset="1" stopColor="#2563eb" />
                </linearGradient>
              </defs>
            </svg>
            <div className="motion-safe:[animation:fade-up_0.4s_ease_both_0.5s] motion-safe:opacity-0">
              <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Senha redefinida!
              </p>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                Você já pode entrar com sua nova senha.
              </p>
            </div>
            <div className="motion-safe:[animation:fade-up_0.4s_ease_both_0.7s] motion-safe:opacity-0">
              <Link
                href="/login"
                className="inline-block rounded-xl px-6 py-2.5 text-sm font-medium text-white"
                style={{ background: 'linear-gradient(135deg, var(--brand-1), var(--brand-3))' }}
              >
                Ir para o login
              </Link>
            </div>
          </div>
        </SlideStep>
      </div>
    </div>
  )
}

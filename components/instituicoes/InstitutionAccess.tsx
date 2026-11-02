'use client'

import { useId, useState, useTransition } from 'react'
import { ArrowRight } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'
import PasswordInput from '@/components/ui/PasswordInput'
import Modal from '@/components/ui/Modal'
import FormActions from '@/components/ui/FormActions'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'

/** Usa o mesmo fluxo autenticado de troca de conta de Minhas instituições. */
export default function InstitutionAccess({ tenantId, name }: { tenantId: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<'current' | 'target'>('target')
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const uid = useId()
  function access(password?: string) {
    setError('')
    startTransition(async () => {
      const result = await switchTenantAction(tenantId, password)
      if (result?.needsPassword) setOpen(true)
      if (result?.error) setError(result.error)
    })
  }
  function begin() {
    setError('')
    startTransition(async () => {
      const membership = (await getMyTenantsAction()).find(t => t.tenantId === tenantId)
      if (!membership) { setError('Não foi possível confirmar seu vínculo. Atualize a página e tente novamente.'); return }
      setScope(membership.passwordScope === 'current' ? 'current' : 'target')
      if (membership.requiresPassword) setOpen(true)
      else access()
    })
  }
  return <>
    <GlassButton variant="primary" disabled={pending} onClick={begin}>{pending ? 'Acessando…' : 'Acessar'}<ArrowRight size={14} aria-hidden="true" /></GlassButton>
    {error && !open && <p role="alert" className="text-xs text-red-600">{error}</p>}
    <Modal isOpen={open} onClose={() => { if (!pending) { setOpen(false); setError('') } }} title={`Acessar ${name}`} className="vidro text-gray-900">
      <form onSubmit={e => { e.preventDefault(); const password = new FormData(e.currentTarget).get('password'); if (typeof password === 'string' && password) access(password) }}>
        <label htmlFor={uid} className="mb-2 block text-sm">{scope === 'current' ? 'Senha da conta que está ativa' : `Senha da sua conta em ${name}`}</label>
        <PasswordInput id={uid} name="password" required maxLength={128} autoComplete="current-password" autoFocus disabled={pending} className="w-full rounded-xl border px-3 py-2" />
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <FormActions surface="none" className="mt-4 flex justify-end gap-2"><GlassButton disabled={pending} onClick={() => { setOpen(false); setError('') }}>Cancelar</GlassButton><GlassButton variant="primary" type="submit" disabled={pending}>{pending ? 'Confirmando…' : 'Confirmar acesso'}</GlassButton></FormActions>
      </form>
    </Modal>
  </>
}

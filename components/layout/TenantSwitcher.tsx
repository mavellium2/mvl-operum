'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { getMyTenantsAction, switchTenantAction } from '@/app/actions/auth'

type TenantEntry = {
  userId: string
  tenantId: string
  tenantName: string
  tenantSubdomain: string
  role: string
  isCurrent: boolean
  requiresPassword?: boolean
}

export default function TenantSwitcher() {
  const [tenants, setTenants] = useState<TenantEntry[]>([])
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    const reload = () => { getMyTenantsAction().then(items => { if (active) setTenants(items) }).catch(() => {}) }
    reload()
    window.addEventListener('operum:instituicao-atualizada', reload)
    return () => { active = false; window.removeEventListener('operum:instituicao-atualizada', reload) }
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node
      if (ref.current?.contains(t)) return
      if (dropRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Posição do dropdown via portal (não é cortado por overflow-hidden da sidebar).
  // Abre para cima, pois o botão fica no rodapé da sidebar.
  const [dropRect, setDropRect] = useState<{ left: number; bottom: number; width: number } | null>(null)
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const r = ref.current?.getBoundingClientRect()
      if (r) {
        setDropRect({
          left: r.left,
          bottom: window.innerHeight - r.top + 8,
          width: 224,
        })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [open, tenants.length])

  const current = tenants.find(t => t.isCurrent)

  if (tenants.length <= 1 && !current) return null

  return (
    <div className="relative" ref={ref}>
      <OperumButton variant="default" type="button"
        onClick={() => setOpen(v => !v)}
        disabled={isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-100"
        title="Trocar de instituição"
      >
        <span className="max-w-[120px] truncate">{current?.tenantName ?? '...'}</span>
        {tenants.length > 1 && (
          isPending ? (
            <svg className="w-3.5 h-3.5 animate-spin text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )
        )}
      </OperumButton>

      {open && tenants.length > 1 && dropRect && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[60] bg-white rounded-xl shadow-lg border border-gray-100 py-1 max-h-80 overflow-y-auto"
          style={{ left: dropRect.left, bottom: dropRect.bottom, width: dropRect.width }}
        >
          <p className="px-3 pt-1 pb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Trocar de instituição</p>
          {tenants.map(t => (
            <OperumButton variant="default" type="button"
              key={t.tenantId}
              disabled={t.isCurrent || isPending}
              onClick={() => {
                setOpen(false)
                // Conta ainda não vinculada: a senha é confirmada em Minhas instituições.
                if (t.requiresPassword) { router.push('/configuracoes/instituicoes'); return }
                startTransition(async () => {
                  const result = await switchTenantAction(t.tenantId)
                  if (result?.needsPassword) router.push('/configuracoes/instituicoes')
                })
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors disabled:cursor-default"
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${t.isCurrent ? 'bg-blue-500' : 'bg-gray-300'}`} />
              <span className="flex-1 truncate text-gray-800">{t.tenantName}</span>
              {t.isCurrent && <span className="text-xs text-blue-500 font-medium shrink-0">atual</span>}
              {!t.isCurrent && t.requiresPassword && <span className="text-xs text-gray-400 shrink-0">confirmar senha</span>}
            </OperumButton>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

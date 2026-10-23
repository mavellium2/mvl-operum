'use client'

import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'

/**
 * Registra o service worker do PWA (/sw.js) em produção e avisa quando há uma
 * versão nova esperando. A atualização só acontece quando o usuário pede,
 * para não recarregar a página no meio de uma edição (MOB-19).
 *
 * Em desenvolvimento não registra e remove um worker que tenha ficado de um
 * build de produção local, para não servir estáticos velhos no `next dev`.
 */
export default function ServiceWorkerRegistrar() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const sw = navigator.serviceWorker

    if (process.env.NODE_ENV !== 'production') {
      sw.getRegistrations()
        .then(regs => regs.forEach(reg => { void reg.unregister() }))
        .catch(() => {})
      return
    }

    let registration: ServiceWorkerRegistration | null = null
    let cancelled = false

    // Só é "atualização" se já havia um worker controlando a página;
    // a primeira instalação não gera aviso.
    const offer = (worker: ServiceWorker | null) => {
      if (!cancelled && worker && sw.controller) setWaiting(worker)
    }

    const onUpdateFound = () => {
      const installing = registration?.installing
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') offer(installing)
      })
    }

    // App instalado fica aberto por dias: procura versão nova ao voltar.
    const onVisible = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {})
    }

    sw.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(reg => {
        registration = reg
        offer(reg.waiting)
        reg.addEventListener('updatefound', onUpdateFound)
      })
      .catch(() => {})
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      registration?.removeEventListener('updatefound', onUpdateFound)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  function atualizar() {
    if (!waiting) return
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true })
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }

  if (!waiting || dismissed) return null

  return (
    <div
      role="status"
      className="fixed inset-x-4 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg sm:left-auto sm:right-4 sm:mx-0"
      style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <span className="flex-1">Nova versão do Operum disponível.</span>
      <button
        type="button"
        onClick={atualizar}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 font-medium text-slate-900 hover:bg-slate-100"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Atualizar
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Atualizar depois"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

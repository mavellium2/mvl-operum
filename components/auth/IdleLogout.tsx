'use client'

import OperumButton from '@/components/ui/GlassButton'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { expireSessionAction, touchSessionAction } from '@/app/actions/auth'
import { idleMs } from '@/lib/sessionIdle'

/** Atividade compartilhada entre abas: usar o Operum numa aba mantém as outras. */
const STORAGE_KEY = 'operum:lastActivity'
const CHECK_MS = 15_000
const AVISO_MS = 60_000
/** Com atividade na tela, avisa o servidor a cada 5 min (renova o last_seen do proxy). */
const PING_MS = 5 * 60_000
const EVENTOS = ['pointerdown', 'keydown', 'mousemove', 'wheel', 'touchstart', 'scroll'] as const

function lerAtividadeCompartilhada(): number {
  try {
    return Number(window.localStorage.getItem(STORAGE_KEY)) || 0
  } catch {
    return 0
  }
}

function gravarAtividadeCompartilhada(t: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(t))
  } catch {
    // modo privado / storage bloqueado: segue só com a aba atual
  }
}

/**
 * Encerra a sessão depois de N minutos sem uso (NEXT_PUBLIC_SESSION_IDLE_MINUTES,
 * padrão 30), avisando 1 minuto antes. O proxy aplica o mesmo limite no servidor.
 */
export default function IdleLogout() {
  const pathname = usePathname()
  const pathnameRef = useRef(pathname)
  const lastActivity = useRef(0)
  const lastPing = useRef(0)
  const expirando = useRef(false)
  const [aviso, setAviso] = useState(false)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    const limite = idleMs()
    const inicio = Date.now()
    lastActivity.current = inicio
    lastPing.current = inicio
    gravarAtividadeCompartilhada(inicio)

    let ultimaGravacao = inicio
    const onActivity = () => {
      const now = Date.now()
      lastActivity.current = now
      if (now - ultimaGravacao > 5_000) {
        ultimaGravacao = now
        gravarAtividadeCompartilhada(now)
      }
    }
    EVENTOS.forEach(e => window.addEventListener(e, onActivity, { passive: true }))

    const id = window.setInterval(() => {
      const now = Date.now()
      const ultima = Math.max(lastActivity.current, lerAtividadeCompartilhada())
      const parado = now - ultima

      if (parado >= limite) {
        if (expirando.current) return
        expirando.current = true
        void expireSessionAction(pathnameRef.current)
        return
      }
      setAviso(parado >= limite - AVISO_MS)

      if (lastActivity.current > lastPing.current && now - lastPing.current >= PING_MS) {
        lastPing.current = now
        void touchSessionAction()
      }
    }, CHECK_MS)

    return () => {
      EVENTOS.forEach(e => window.removeEventListener(e, onActivity))
      window.clearInterval(id)
    }
  }, [])

  if (!aviso) return null

  const continuar = () => {
    const now = Date.now()
    lastActivity.current = now
    lastPing.current = now
    gravarAtividadeCompartilhada(now)
    setAviso(false)
    void touchSessionAction()
  }

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Sessão prestes a expirar"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300] w-[calc(100%-2rem)] max-w-md rounded-xl border border-amber-200 bg-white shadow-2xl p-4 flex items-center gap-3"
    >
      <p className="flex-1 text-sm text-gray-700">
        Sua sessão vai expirar em 1 minuto por inatividade.
      </p>
      <OperumButton variant="primary"
        type="button"
        onClick={continuar}
        className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
      >
        Continuar conectado
      </OperumButton>
    </div>
  )
}

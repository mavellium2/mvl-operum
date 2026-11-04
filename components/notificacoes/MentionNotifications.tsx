'use client'

import { useEffect } from 'react'
import { getUnreadMentionsAction } from '@/app/actions/notificacoes'
import { useToast } from '@/components/ui/Toast'
import { useSidebarSession } from '@/hooks/useSidebarSession'

export default function MentionNotifications() {
  const { user } = useSidebarSession()
  const { toast } = useToast()
  const userId = user?.id

  useEffect(() => {
    if (!userId) return
    const storageKey = `operum:mention-popups:${userId}`
    const shown = new Set<string>()
    let active = true
    let polling = false

    async function poll() {
      if (document.hidden || polling) return
      polling = true
      try {
        const notifications = await getUnreadMentionsAction()
        if (!active) return
        try {
          const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')
          if (Array.isArray(saved)) for (const id of saved) if (typeof id === 'string') shown.add(id)
        } catch { /* O conjunto em memória ainda evita repetições. */ }

        for (const notification of notifications.slice().reverse()) {
          if (shown.has(notification.id)) continue
          shown.add(notification.id)
          toast(notification.message, 'mention', notification.title)
        }
        try {
          sessionStorage.setItem(storageKey, JSON.stringify([...shown].slice(-100)))
        } catch { /* O popup segue funcionando sem armazenamento de sessão. */ }
      } catch {
        // Uma falha temporária é recuperada na próxima consulta.
      } finally {
        polling = false
      }
    }

    void poll()
    const interval = window.setInterval(poll, 5000)
    document.addEventListener('visibilitychange', poll)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', poll)
    }
  }, [toast, userId])

  return null
}

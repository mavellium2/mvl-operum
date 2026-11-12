'use client'
import { useEffect } from 'react'
import { gravarRecentes, lerRecentes, recentProjectKey, registrarRecente } from '@/lib/recentProject'

/** Ao abrir um projeto, ele passa a ser o primeiro da lista de recentes deste usuário nesta instituição. */
export default function RecentProjectRecorder({ userId, tenantId, projectId }: { userId: string; tenantId: string; projectId: string }) {
  useEffect(() => {
    const chave = recentProjectKey(userId, tenantId)
    const atual = document.cookie.split('; ').find(c => c.startsWith(`${chave}=`))?.slice(chave.length + 1)
    const lista = registrarRecente(lerRecentes(atual), projectId)
    document.cookie = `${chave}=${encodeURIComponent(gravarRecentes(lista))}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
  }, [userId, tenantId, projectId])
  return null
}

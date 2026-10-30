'use client'

import { useCallback, useMemo } from 'react'
import { fetchWithSession } from '@/lib/clientFetch'

type Tipo = 'CHARTER' | 'STAKEHOLDER' | 'EAP' | 'ATA'

/**
 * Rascunho privado de um documento ("Salvar mais tarde"): guarda, recupera e
 * descarta as alterações do usuário sem criar versão. Usa o mesmo
 * armazenamento do rascunho automático do Termo (/revisions?draft=1).
 */
export function useRascunhoDocumento(projetoId: string | undefined, tipo: Tipo, resourceId = '') {
  const guardar = useCallback(async (payload: unknown): Promise<boolean> => {
    if (!projetoId) return false
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tipo, resourceId, payload, draft: true }),
      })
      return r.ok
    } catch { return false }
  }, [projetoId, tipo, resourceId])

  const recuperar = useCallback(async <T,>(): Promise<T | null> => {
    if (!projetoId) return null
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/revisions?type=${tipo}&resourceId=${encodeURIComponent(resourceId)}&draft=1`)
      if (!r.ok) return null
      const draft = await r.json()
      return (draft?.payload as T) ?? null
    } catch { return null }
  }, [projetoId, tipo, resourceId])

  const descartar = useCallback(async (): Promise<void> => {
    if (!projetoId) return
    await fetchWithSession(`/api/projects/${projetoId}/revisions`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: tipo, resourceId, draft: true }),
    })
  }, [projetoId, tipo, resourceId])

  return useMemo(() => ({ guardar, recuperar, descartar }), [guardar, recuperar, descartar])
}

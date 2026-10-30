'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchWithSession } from '@/lib/clientFetch'

export interface VersaoDocumento {
  id: string
  versao?: string | null
  commitTitle: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | string
  createdAt: string
  approvedAt?: string | null
  payload: unknown
}

/**
 * Versões de um documento (seletor "Versão" e contador de propostas pendentes
 * da barra do editor). Recarrega quando uma versão é salva ou revisada.
 */
export function useVersoesDocumento(projetoId: string | undefined, tipo: 'CHARTER' | 'STAKEHOLDER' | 'EAP' | 'ATA', resourceId = '') {
  const [versoes, setVersoes] = useState<VersaoDocumento[]>([])
  const carregar = useCallback(async () => {
    if (!projetoId) return
    try {
      const r = await fetchWithSession(`/api/projects/${projetoId}/revisions?type=${tipo}&resourceId=${encodeURIComponent(resourceId)}&tab=historico`)
      if (!r.ok) return
      const data = await r.json()
      setVersoes(Array.isArray(data?.versions) ? data.versions : [])
    } catch { /* não crítico: a barra só fica sem a lista */ }
  }, [projetoId, tipo, resourceId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
    const atualizar = (e: Event) => { if ((e as CustomEvent<{ projetoId: string }>).detail?.projetoId === projetoId) void carregar() }
    window.addEventListener('operum:document-version', atualizar)
    window.addEventListener('operum:document-published', atualizar)
    return () => {
      window.removeEventListener('operum:document-version', atualizar)
      window.removeEventListener('operum:document-published', atualizar)
    }
  }, [carregar, projetoId])

  const vigente = versoes
    .filter(v => v.status === 'APPROVED')
    .sort((a, b) => new Date(b.approvedAt ?? b.createdAt).getTime() - new Date(a.approvedAt ?? a.createdAt).getTime())[0] ?? null
  const pendentes = versoes.filter(v => v.status === 'PENDING').length
  return { versoes, vigente, pendentes, recarregar: carregar }
}

export const ROTULO_STATUS: Record<string, string> = { PENDING: 'pendente', APPROVED: 'aprovada', REJECTED: 'rejeitada' }

/** Abre o painel "Propostas e registro" do documento (DocumentacaoLayout). */
export function abrirPropostas(projetoId: string) {
  window.dispatchEvent(new CustomEvent('operum:revisar-propostas', { detail: { projetoId } }))
}

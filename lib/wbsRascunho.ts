import type { ArvoreEap } from './wbsMerge'

/**
 * Rascunho local da EAP preservado quando o salvamento falha ou entra em
 * conflito. Fica no navegador (localStorage), isolado por tenant, usuário e
 * projeto, e é apagado quando a pessoa aplica ou descarta (ou expira em 30 dias).
 */
export interface RascunhoEap {
  versao: 1
  tenantId: string
  userId: string
  projetoId: string
  motivo: 'conflito' | 'falha'
  salvoEm: number
  /** Versão do servidor sobre a qual a pessoa editou. */
  base: ArvoreEap
  local: ArvoreEap
}

const VALIDADE_MS = 30 * 24 * 60 * 60 * 1000

export const chaveDoRascunho = (tenantId: string, userId: string, projetoId: string) => `operum:eap-rascunho:${tenantId}:${userId}:${projetoId}`

function armazenamento(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null }
}

export function salvarRascunho(r: Omit<RascunhoEap, 'versao'>): boolean {
  const s = armazenamento()
  if (!s) return false
  try {
    s.setItem(chaveDoRascunho(r.tenantId, r.userId, r.projetoId), JSON.stringify({ versao: 1, ...r }))
    return true
  } catch {
    return false // cota cheia ou armazenamento bloqueado
  }
}

export function lerRascunho(tenantId: string, userId: string, projetoId: string, agora = Date.now()): RascunhoEap | null {
  const s = armazenamento()
  if (!s) return null
  const chave = chaveDoRascunho(tenantId, userId, projetoId)
  try {
    const bruto = s.getItem(chave)
    if (!bruto) return null
    const r = JSON.parse(bruto) as RascunhoEap
    const valido = r?.versao === 1 && r.tenantId === tenantId && r.userId === userId && r.projetoId === projetoId
      && r.local?.nodes && r.base?.nodes && typeof r.salvoEm === 'number'
    if (!valido || agora - r.salvoEm > VALIDADE_MS) { s.removeItem(chave); return null }
    return r
  } catch {
    return null
  }
}

export function apagarRascunho(tenantId: string, userId: string, projetoId: string): void {
  try { armazenamento()?.removeItem(chaveDoRascunho(tenantId, userId, projetoId)) } catch { /* nada a limpar */ }
}

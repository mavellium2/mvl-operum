/**
 * Regras da lista de Atas de Reunião (Documentação > Atas): resumo de cada
 * ata, status de aprovação pelas versões enviadas, busca e filtros.
 */

export type StatusAta = 'APPROVED' | 'PENDING' | 'REJECTED' | 'NONE'

export interface AtaListItem {
  id: string
  numero: number
  /** ISO da data da reunião. */
  data: string
  elaboradoPor: string
  local: string | null
  /** Primeiro assunto tratado (primeira linha preenchida). */
  assunto: string
  /** Nomes dos presentes (contagem e busca). */
  presentes: string[]
  acoes: number
  /** Ações com prazo anterior a hoje. A ata não guarda se a ação foi concluída. */
  acoesVencidas: number
  anexos: number
}

type AtaDoBanco = {
  id: string
  numero: number
  data: Date | null
  createdAt: Date
  elaboradoPor: string | null
  local: string | null
  assuntosTratados: string | null
  presentes: { nome: string }[]
  acoes: { prazo: Date | null }[]
  anexos: unknown[]
}

/** Dia (aaaa-mm-dd, UTC) para comparar prazos sem efeito de fuso. */
const diaUtc = (d: Date) => d.toISOString().slice(0, 10)

/** Resumo de uma ata para a lista (sem enviar o conteúdo inteiro ao navegador). */
export function resumoDaAta(a: AtaDoBanco, hoje: Date = new Date()): AtaListItem {
  const assunto = (a.assuntosTratados ?? '').split('\n').map(l => l.trim()).find(Boolean) ?? ''
  const dataHoje = diaUtc(hoje)
  return {
    id: a.id,
    numero: a.numero,
    data: (a.data ?? a.createdAt).toISOString(),
    elaboradoPor: a.elaboradoPor ?? '',
    local: a.local,
    assunto: assunto.replace(/[;.]\s*$/, ''),
    presentes: a.presentes.map(p => p.nome).filter(n => n.trim()),
    acoes: a.acoes.length,
    acoesVencidas: a.acoes.filter(x => x.prazo && diaUtc(x.prazo) < dataHoje).length,
    anexos: a.anexos.length,
  }
}

/** Status de cada ata pela versão mais recente enviada (sem versão: NONE). */
export function statusPorAta(versoes: { resourceId: string; status: string; createdAt: string }[]): Record<string, StatusAta> {
  const ultima: Record<string, { status: string; em: number }> = {}
  for (const v of versoes) {
    if (!v.resourceId) continue
    const em = new Date(v.createdAt).getTime()
    if (!ultima[v.resourceId] || em > ultima[v.resourceId].em) ultima[v.resourceId] = { status: v.status, em }
  }
  return Object.fromEntries(Object.entries(ultima).map(([id, u]) => [id, (['APPROVED', 'PENDING', 'REJECTED'].includes(u.status) ? u.status : 'NONE') as StatusAta]))
}

export type FiltroAtas = 'todas' | 'pendentes' | 'vencidas'

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Busca por assunto, pessoa (quem elaborou ou presente), local ou número, mais o filtro rápido. */
export function filtrarAtas(atas: AtaListItem[], busca: string, filtro: FiltroAtas, status: Record<string, StatusAta>): AtaListItem[] {
  const termo = semAcento(busca.trim())
  return atas.filter(a => {
    if (filtro === 'pendentes' && status[a.id] !== 'PENDING') return false
    if (filtro === 'vencidas' && a.acoesVencidas === 0) return false
    if (!termo) return true
    const numero = termo.replace(/^n[ºo°]?\s*/, '')
    if (/^\d+$/.test(numero)) return a.numero === Number(numero)
    return [a.assunto, a.elaboradoPor, a.local ?? '', ...a.presentes].some(t => semAcento(t).includes(termo))
  })
}

import type { WbsNodeClient } from '@/types/wbs'
import { minutosRealizados } from './tempoRealizado'

export interface ProjetoConfigCustos {
  valorPorMinuto: number
  horasPorDia: number
}

/**
 * Custo derivado de uma folha (previsto): tempo (min) × valorPorMinuto + materiais.
 * Usado na Planilha de Custos conforme §5.4 ("adotar derivação").
 */
export function custoFolhaPrevisto(
  tempoMinutos: number,
  valorPorMinuto: number,
  materiais: number,
): number {
  return round2(tempoMinutos * valorPorMinuto + materiais)
}

/** Custo derivado de uma folha (realizado): tempo real (min) × valorPorMinuto + materiais reais. */
export function custoFolhaRealizado(
  tempoRealMinutos: number,
  valorPorMinuto: number,
  materiaisReal: number,
): number {
  return round2(tempoRealMinutos * valorPorMinuto + materiaisReal)
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Converte uma string digitada em HORAS para minutos inteiros.
 * Aceita decimal ("5", "5.5", "5,5") ou h:mm ("5:30").
 * Texto vazio → 0; texto inválido → NaN (chamador ignora).
 */
export function minutosDeHoras(texto: string): number {
  const t = texto.trim().replace(',', '.')
  if (t === '') return 0
  const colon = t.match(/^(\d+):(\d{1,2})$/)
  if (colon) {
    const h = Number(colon[1])
    const m = Number(colon[2])
    if (m > 59) return Number.NaN
    return Math.round(h * 60 + m)
  }
  const n = Number(t)
  if (!Number.isFinite(n)) return Number.NaN
  return Math.round(n * 60)
}

/**
 * Converte uma string digitada em DIAS para minutos inteiros
 * (dias × horasPorDia × 60). Texto vazio → 0; inválido → NaN.
 */
export function minutosDeDias(texto: string, horasPorDia: number): number {
  const t = texto.trim().replace(',', '.')
  if (t === '') return 0
  const n = Number(t)
  if (!Number.isFinite(n)) return Number.NaN
  return Math.round(n * horasPorDia * 60)
}

export interface PlanilhaRow {
  id: string
  codigo: string
  titulo: string
  nivel: number
  unidade: string
  quantidade: number
  situacao: string
  dataInicio: string | null
  dataFim: string | null
  custoPrevisto: number
  custoReal: number
  éFolha: boolean
}

export interface PlanilhaResult {
  rows: PlanilhaRow[]
  totalPrevisto: number
  totalReal: number
}

const limparData = (iso?: string | null): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function situacaoDe(p: number): string {
  if (p >= 100) return 'Concluído'
  if (p <= 0) return 'Não iniciado'
  return `Em andamento (${Math.round(p)}%)`
}

/**
 * Deriva a Planilha de Custos a partir da árvore da EAP.
 * Folhas: custo = tempo×valorPorMinuto+materiais. Pais: soma dos filhos.
 */
export function computePlanilha(
  nodes: Record<string, WbsNodeClient>,
  rootId: string | null,
  config: ProjetoConfigCustos,
): PlanilhaResult {
  if (!rootId || !nodes[rootId]) return { rows: [], totalPrevisto: 0, totalReal: 0 }

  const { valorPorMinuto } = config
  const fatura: Record<string, { prev: number; real: number }> = {}
  const ordem: string[] = []

  const coleta = (id: string, nivel: number) => {
    const node = nodes[id]
    if (!node || ordem.includes(id)) return
    ordem.push(id)
    node.childrenIds.forEach(c => coleta(c, nivel + 1))
  }
  coleta(rootId, 0)

  for (let i = ordem.length - 1; i >= 0; i--) {
    const id = ordem[i]
    const node = nodes[id]
    const hijos = node.childrenIds.filter(c => nodes[c])

    if (hijos.length === 0) {
      const prev = custoFolhaPrevisto(node.properties.tempoMinutos ?? 0, valorPorMinuto, node.properties.materiais ?? 0)
      const real = custoFolhaRealizado(minutosRealizados(node.properties), valorPorMinuto, node.properties.materiaisReal ?? 0)
      fatura[id] = { prev, real }
    } else {
      let prev = 0
      let real = 0
      for (const c of hijos) {
        prev += fatura[c]?.prev ?? 0
        real += fatura[c]?.real ?? 0
      }
      fatura[id] = { prev, real }
    }
  }

  const rows: PlanilhaRow[] = []
  let totalPrevisto = 0
  let totalReal = 0

  ordem.forEach(id => {
    const node = nodes[id]
    if (!node) return
    const hijos = node.childrenIds.filter(c => nodes[c])
    const esFolha = hijos.length === 0
    const f = fatura[id]

    if (esFolha) {
      const tempo = node.properties.tempoMinutos ?? 0
      const tempoReal = minutosRealizados(node.properties)
      const pc = node.properties.percentualConclusao
      let situacao: string
      if (pc !== undefined) situacao = situacaoDe(pc)
      else if (tempoReal > 0) situacao = 'Em andamento'
      else situacao = 'Não iniciado'

      rows.push({
        id: node.id,
        codigo: node.code,
        titulo: node.title,
        nivel: 0,
        unidade: tempo > 0 ? 'h' : '—',
        quantidade: tempo > 0 ? round2(tempo / 60) : 0,
        situacao,
        dataInicio: limparData(node.properties.dataRealizacao ?? node.properties.dataPrevista),
        dataFim: limparData(node.properties.dataRealizacao ?? node.properties.dataPrevista),
        custoPrevisto: f.prev,
        custoReal: f.real,
        éFolha: true,
      })
      totalPrevisto += f.prev
      totalReal += f.real
    } else {
      rows.push({
        id: node.id,
        codigo: node.code,
        titulo: node.title,
        nivel: 0,
        unidade: '—',
        quantidade: 0,
        situacao: f.real > 0 ? 'Em andamento' : 'A consolidar',
        dataInicio: null,
        dataFim: null,
        custoPrevisto: round2(f.prev),
        custoReal: round2(f.real),
        éFolha: false,
      })
    }
  })

  return { rows, totalPrevisto: round2(totalPrevisto), totalReal: round2(totalReal) }
}

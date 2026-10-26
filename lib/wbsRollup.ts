import { dataRealizacaoEfetiva } from '@/lib/dataRealizacao'
import { elaboradoresDe, somaValoresPorMinuto } from './elaboradores'
import { minutosRealizados } from './tempoRealizado'
import type { WbsNodeClient, WbsRollup } from '@/types/wbs'
import { custoFolhaPrevisto, custoFolhaRealizado, round2 } from './custosCalc'
import { maiorData } from './planilhaCustos'

/**
 * Calcula rollup de custo e durationDays para cada nó.
 * Pós-ordem iterativa (sem recursão). Resultado NÃO é persistido.
 *
 * - Folha: usa properties.cost / properties.durationDays (0 se ausente).
 * - Pai: soma os rollups dos filhos. Valor próprio é ignorado enquanto há filhos.
 */
export function computeRollups(
  nodes: Record<string, WbsNodeClient>,
  rootId: string | null
): Record<string, WbsRollup> {
  if (!rootId || !nodes[rootId]) return {}

  // Coleta pré-ordem para depois inverter → pós-ordem
  const preOrder: string[] = []
  const seen = new Set<string>()
  const stack: string[] = [rootId]

  while (stack.length > 0) {
    const id = stack.pop()!
    if (!nodes[id] || seen.has(id)) continue
    seen.add(id)
    preOrder.push(id)

    const node = nodes[id]
    // Empurra filhos na ordem inversa para processar em ordem correta
    for (let i = node.childrenIds.length - 1; i >= 0; i--) {
      stack.push(node.childrenIds[i])
    }
  }

  const result: Record<string, WbsRollup> = {}

  // Processa em pós-ordem (folhas primeiro)
  for (let i = preOrder.length - 1; i >= 0; i--) {
    const id = preOrder[i]
    const node = nodes[id]
    if (!node) continue

    const activeChildren = node.childrenIds.filter(cid => nodes[cid])

    if (activeChildren.length === 0) {
      result[id] = {
        cost: node.properties.cost ?? 0,
        durationDays: node.properties.durationDays ?? 0,
        isRolledUp: false,
      }
    } else {
      let cost = 0
      let durationDays = 0
      for (const cid of activeChildren) {
        cost += result[cid]?.cost ?? 0
        durationDays += result[cid]?.durationDays ?? 0
      }
      result[id] = { cost, durationDays, isRolledUp: true }
    }
  }

  return result
}

export interface WbsFinancialSummary {
  budgetHours: number
  actualHours: number
  budgetCost: number | null
  actualCost: number | null
  /** Folha: a data da linha. Com filhos: a maior data prevista das atividades (Data fim do Sub-total). */
  dataPrevista: string | null
  /** Folha: a data da linha. Com filhos: a maior, só quando todas as atividades foram realizadas. */
  dataRealizacao: string | null
}

/** Financial view uses the same leaf calculations/rates as the cost sheet. */
export function computeFinancialRollups(
  nodes: Record<string, WbsNodeClient>, rootId: string | null,
  rates: Record<string, number | null>,
): Record<string, WbsFinancialSummary> {
  if (!rootId || !nodes[rootId]) return {}
  const order: string[] = [], seen = new Set<string>(), stack = [rootId]
  while (stack.length) {
    const id = stack.pop()!
    if (!nodes[id] || seen.has(id)) continue
    seen.add(id); order.push(id)
    stack.push(...nodes[id].childrenIds)
  }
  const result: Record<string, WbsFinancialSummary> = {}
  const folhas: Record<string, WbsFinancialSummary[]> = {}
  for (const id of order.reverse()) {
    const n = nodes[id], children = n.childrenIds.filter(c => nodes[c])
    // Etapa (filha da raiz) sem atividades: a planilha não tem linha para ela e o
    // Sub-total fica zerado — valores antigos gravados na própria etapa não contam.
    if (!children.length && n.parentId === rootId && id !== rootId) {
      result[id] = { budgetHours: 0, actualHours: 0, budgetCost: null, actualCost: null, dataPrevista: null, dataRealizacao: null }
      folhas[id] = []
      continue
    }
    if (!children.length) {
      // Vários elaboradores trabalham o tempo inteiro: soma o valor/minuto de cada um.
      const p = n.properties, rate = somaValoresPorMinuto(elaboradoresDe(p).map(id => rates[id]))
      result[id] = {
        budgetHours: (p.tempoMinutos ?? 0) / 60,
        actualHours: minutosRealizados(p) / 60,
        budgetCost: rate == null ? (p.materiais ? round2(p.materiais) : null) : custoFolhaPrevisto(p.tempoMinutos ?? 0, rate, p.materiais ?? 0),
        actualCost: rate == null ? (p.materiaisReal ? round2(p.materiaisReal) : null) : custoFolhaRealizado(minutosRealizados(p), rate, p.materiaisReal ?? 0),
        dataPrevista: p.dataPrevista ?? null,
        dataRealizacao: dataRealizacaoEfetiva(p),
      }
      folhas[id] = [result[id]]
    } else {
      // Soma as atividades (folhas), como o Sub-total da planilha.
      const rows = children.flatMap(c => folhas[c] ?? [])
      folhas[id] = rows
      const todasRealizadas = rows.length > 0 && rows.every(r => r.dataRealizacao)
      result[id] = {
        budgetHours: rows.reduce((sum, r) => sum + r.budgetHours, 0),
        actualHours: rows.reduce((sum, r) => sum + r.actualHours, 0),
        budgetCost: rows.some(r => r.budgetCost !== null) ? round2(rows.reduce((sum, r) => sum + (r.budgetCost ?? 0), 0)) : null,
        actualCost: rows.some(r => r.actualCost !== null) ? round2(rows.reduce((sum, r) => sum + (r.actualCost ?? 0), 0)) : null,
        dataPrevista: maiorData(rows.map(r => r.dataPrevista)),
        dataRealizacao: todasRealizadas ? maiorData(rows.map(r => r.dataRealizacao)) : null,
      }
    }
  }
  return result
}

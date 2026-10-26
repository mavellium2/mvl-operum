import { dataRealizacaoEfetiva } from '@/lib/dataRealizacao'
import { elaboradoresDe, menorJornada, somaValoresPorMinuto } from './elaboradores'
import { minutosRealizados } from './tempoRealizado'
import type { WbsNodeClient } from '@/types/wbs'
import { custoFolhaPrevisto, custoFolhaRealizado, round2 } from '@/lib/custosCalc'

/**
 * Planilha de Custos — modelo IDÊNTICO (§F).
 * Estrutura e dados manuais: folhas da EAP (`WbsNode.properties`); tempo realizado
 * de cards com histórico vem da projeção dos apontamentos (ADR-065). Custo derivado de
 * quem elaborou a linha (membro do projeto):
 *   jornada         = horasDiarias do elaborador
 *   valorPorMinuto  = remuneracao / 30 / jornada / 60   (coluna R$)
 *   Total = (min × R$) + materiais.
 * Sem elaborador (ou sem salário/jornada cadastrados) → R$ NENHUM (null): não
 * existe valor padrão. O Total fica só com os materiais (null sem materiais).
 */

export interface PlanilhaConfig {
  valorReferencia: number
  horasPorDia: number
}

export type SituacaoAtividade = 'Antecipada' | 'No prazo' | 'Atrasada' | 'Pendente'

export interface LinhaAtividade {
  nodeId: string
  codigo: string
  titulo: string
  /** Descrição da tarefa (do card ligado, quando houver; senão a do nó da EAP). Vazia sem descrição. */
  descricao: string
  /** Nomes dos elaboradores, separados por vírgula. */
  elaboradoPor: string
  /** Primeiro elaborador (formato antigo). */
  elaboradoPorUserId: string | null
  /** Elaboradores da linha = responsáveis do card ligado. */
  elaboradoPorUserIds: string[]
  /** Coluna R$: soma do valor por minuto dos elaboradores (todos trabalham o tempo inteiro); null sem nenhum com salário e jornada */
  vpm: number | null
  /** menor jornada diária (horas/dia) entre os elaboradores; null quando nenhuma cadastrada */
  jornadaDiaria: number | null
  // Orçado
  minOrcado: number
  materiaisOrcado: number
  dataPrevista: string | null
  rOrcado: number | null
  totalOrcado: number | null
  // Realizado
  minReal: number
  /** Tempo derivado do card: corrigir nos apontamentos, sem sobrescrever pela planilha. */
  tempoRealDosCards?: boolean
  materiaisReal: number
  dataRealizacao: string | null
  rReal: number | null
  totalReal: number | null
  situacao: SituacaoAtividade
}

export interface LinhaMacrofase {
  nodeId: string
  codigo: string
  titulo: string
  atividades: LinhaAtividade[]
  // Orçado (sub-total)
  minOrcado: number
  materiaisOrcado: number
  totalOrcado: number
  // Realizado (sub-total)
  minReal: number
  materiaisReal: number
  totalReal: number
  /** Data fim da fase (sprint): a maior data prevista das atividades; null sem datas. */
  dataFim: string | null
}

export interface QuadroValor {
  fase: string
  orcado: number
  realizado: number
}

export interface QuadroTempo {
  fase: string
  minOrcado: number
  minReal: number
}

export interface QuadroElaborador {
  elaborador: string
  qtdeAtividades: number
  percentual: number
}

export interface PlanilhaDeCustos {
  config: PlanilhaConfig
  macrofases: LinhaMacrofase[]
  qtdeAtividades: number
  totalOrcado: number
  totalReal: number
  tempoOrcadoTotal: number
  tempoRealTotal: number
  /** Data fim do projeto: a maior data fim das fases; null sem datas. */
  dataFimProjeto: string | null
  quadros: {
    valor: QuadroValor[]
    tempo: QuadroTempo[]
    elaboradores: QuadroElaborador[]
  }
}

export function valorPorMinutoDe(config: PlanilhaConfig): number {
  return config.valorReferencia / 30 / config.horasPorDia / 60
}

/** Membro interno (UserProject) que pode elaborar — salário mensal e jornada. */
export interface Elaborador {
  userId: string
  name: string
  /** salário mensal (R$) para o valor/min da linha */
  remuneracao: number | null
  horasDiarias: number | null
}

/** jornada diária do elaborador; null quando não cadastrada (padrão é nenhum). */
export function horasPorDiaDoElaborador(e: Elaborador | undefined): number | null {
  const h = e?.horasDiarias ?? null
  return h && h > 0 ? h : null
}

/** valor por minuto do elaborador — remuneracao / 30 / jornada / 60; null sem salário ou jornada. */
export function valorPorMinutoDoElaborador(e: Elaborador): number | null {
  const horas = horasPorDiaDoElaborador(e)
  const remuneracao = e.remuneracao ?? null
  if (!(remuneracao && remuneracao > 0) || horas === null) return null
  return remuneracao / 30 / horas / 60
}

/** ISO `yyyy-mm-dd` → `dd/mm/aaaa` (comparação lexicográfica vale como data). */
export function fmtDataBR(iso: string | null | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return ''
  return `${d}/${m}/${y}`
}

/** Maior data `aaaa-mm-dd` da lista (ignora vazias); null quando não há nenhuma. */
export function maiorData(datas: Array<string | null | undefined>): string | null {
  let maior: string | null = null
  for (const d of datas) {
    const dia = d?.slice(0, 10)
    if (dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) && (!maior || dia > maior)) maior = dia
  }
  return maior
}

export function situacaoDe(prevista: string | null, realizacao: string | null): SituacaoAtividade {
  if (!realizacao) return 'Pendente'
  // Compara apenas a data (aaaa-mm-dd) para não quebrar com datetime ("2026-03-10T...").
  const prev = prevista?.slice(0, 10) ?? null
  const real = realizacao.slice(0, 10)
  if (prev) {
    if (real < prev) return 'Antecipada'
    if (real === prev) return 'No prazo'
  }
  return 'Atrasada'
}

function coletaFolhas(nodes: Record<string, WbsNodeClient>, nodeId: string): WbsNodeClient[] {
  const stack = [nodes[nodeId]]
  const folhas: WbsNodeClient[] = []
  while (stack.length > 0) {
    const n = stack.pop()
    if (!n) continue
    if (n.childrenIds.length === 0) {
      folhas.push(n)
    } else {
      for (let i = n.childrenIds.length - 1; i >= 0; i--) {
        stack.push(nodes[n.childrenIds[i]])
      }
    }
  }
  return folhas
}

export function computarPlanilhaCustos(
  nodes: Record<string, WbsNodeClient>,
  rootId: string | null,
  config: PlanilhaConfig,
  elaboradores?: Map<string, Elaborador>,
): PlanilhaDeCustos {
  // Total = (Min × R$) + Materiais; sem R$ (valor/min), só os materiais.
  const fatura = (min: number, materiais: number, vpm: number | null) =>
    vpm !== null ? custoFolhaPrevisto(min, vpm, materiais) : materiais ? round2(materiais) : null
  const faturaReal = (min: number, materiais: number, vpm: number | null) =>
    vpm !== null ? custoFolhaRealizado(min, vpm, materiais) : materiais ? round2(materiais) : null

  const macrofases: LinhaMacrofase[] = []
  if (rootId && nodes[rootId]) {
    for (const faseId of nodes[rootId].childrenIds) {
      const fase = nodes[faseId]
      if (!fase) continue

      // Mostra TODAS as macrofases (mesmo sem atividades) para refletir a estrutura completa da EAP.
      // Macrofases sem atividades folha terão array vazio e totais zerados.
      const atividades: LinhaAtividade[] = fase.childrenIds.length === 0
        ? []
        : coletaFolhas(nodes, faseId).map(n => {
        const p = n.properties
        const minOrcado = p.tempoMinutos ?? 0
        const materiaisOrcado = p.materiais ?? 0
        const minReal = minutosRealizados(p)
        const materiaisReal = p.materiaisReal ?? 0
        // Jornada/valor derivam SOMENTE de quem elaborou a linha; sem elaborador
        // (ou sem salário/jornada) o valor é nenhum — não existe valor padrão.
        // Vários elaboradores: soma os valores e usa a menor jornada (ADR-044).
        const ids = elaboradoresDe(p)
        const doLinha = ids.map(id => elaboradores?.get(id)).filter((e): e is Elaborador => !!e)
        const jornadaDiaria = menorJornada(doLinha.map(horasPorDiaDoElaborador))
        const vpm = somaValoresPorMinuto(doLinha.map(valorPorMinutoDoElaborador))
        return {
          nodeId: n.id,
          codigo: n.code,
          titulo: n.title,
          descricao: (p.description ?? '').trim(),
          elaboradoPor: p.elaboradoPor ?? '',
          elaboradoPorUserId: ids[0] ?? null,
          elaboradoPorUserIds: ids,
          vpm,
          jornadaDiaria,
          minOrcado,
          materiaisOrcado,
          dataPrevista: p.dataPrevista ?? null,
          rOrcado: vpm !== null ? round2(minOrcado * vpm) : null,
          totalOrcado: fatura(minOrcado, materiaisOrcado, vpm),
          minReal,
          tempoRealDosCards: p.tempoRealApontadoSegundos !== undefined,
          materiaisReal,
          dataRealizacao: dataRealizacaoEfetiva(p),
          rReal: vpm !== null ? round2(minReal * vpm) : null,
          totalReal: faturaReal(minReal, materiaisReal, vpm),
          situacao: situacaoDe(p.dataPrevista ?? null, dataRealizacaoEfetiva(p)),
        }
      })

      macrofases.push({
        nodeId: fase.id,
        codigo: fase.code,
        titulo: fase.title,
        atividades,
        minOrcado: atividades.reduce((s, a) => s + a.minOrcado, 0),
        materiaisOrcado: atividades.reduce((s, a) => s + a.materiaisOrcado, 0),
        totalOrcado: atividades.reduce((s, a) => s + (a.totalOrcado ?? 0), 0),
        minReal: atividades.reduce((s, a) => s + a.minReal, 0),
        materiaisReal: atividades.reduce((s, a) => s + a.materiaisReal, 0),
        totalReal: atividades.reduce((s, a) => s + (a.totalReal ?? 0), 0),
        dataFim: maiorData(atividades.map(a => a.dataPrevista)),
      })
    }
  }

  const todas = macrofases.flatMap(f => f.atividades)

  // Quadro 3 — elaboradores
  const porElaborador = new Map<string, number>()
  for (const a of todas) {
    // Cada elaborador da linha conta a atividade (com vários, a soma passa de 100%).
    const nomes = a.elaboradoPor.split(',').map(n => n.trim()).filter(Boolean)
    for (const nome of new Set(nomes)) porElaborador.set(nome, (porElaborador.get(nome) ?? 0) + 1)
  }
  const totalAtividades = todas.length
  const quadroElaboradores = [...porElaborador.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([elaborador, qtdeAtividades]) => ({
      elaborador,
      qtdeAtividades,
      percentual: totalAtividades > 0 ? Math.round((qtdeAtividades / totalAtividades) * 1000) / 10 : 0,
    }))

  return {
    config,
    macrofases,
    qtdeAtividades: totalAtividades,
    totalOrcado: round2(macrofases.reduce((s, f) => s + f.totalOrcado, 0)),
    totalReal: round2(macrofases.reduce((s, f) => s + f.totalReal, 0)),
    tempoOrcadoTotal: macrofases.reduce((s, f) => s + f.minOrcado, 0),
    tempoRealTotal: macrofases.reduce((s, f) => s + f.minReal, 0),
    dataFimProjeto: maiorData(macrofases.map(f => f.dataFim)),
    quadros: {
      valor: macrofases.map(f => ({ fase: `${f.codigo} ${f.titulo}`, orcado: f.totalOrcado, realizado: f.totalReal })),
      tempo: macrofases.map(f => ({ fase: `${f.codigo} ${f.titulo}`, minOrcado: f.minOrcado, minReal: f.minReal })),
      elaboradores: quadroElaboradores,
    },
  }
}
/**
 * A descrição só converge na criação (EAP ↔ sprint, ADR-033): depois, quem a edita
 * é o card. Para linhas ligadas a um card, vale a descrição atual dele.
 */
export function aplicarDescricoesDosCards(
  planilha: PlanilhaDeCustos,
  nodes: Record<string, WbsNodeClient>,
  descricaoPorCard: ReadonlyMap<string, string>,
): PlanilhaDeCustos {
  return {
    ...planilha,
    macrofases: planilha.macrofases.map(f => ({
      ...f,
      atividades: f.atividades.map(a => {
        const cardId = nodes[a.nodeId]?.properties.cardId
        return cardId && descricaoPorCard.has(cardId) ? { ...a, descricao: descricaoPorCard.get(cardId)!.trim() } : a
      }),
    })),
  }
}

/** Ids dos cards ligados às atividades da planilha. */
export function cardsDasAtividades(planilha: PlanilhaDeCustos, nodes: Record<string, WbsNodeClient>): string[] {
  const ids = planilha.macrofases.flatMap(f => f.atividades.map(a => nodes[a.nodeId]?.properties.cardId))
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

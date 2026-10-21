/**
 * Indicação visual do progresso da sprint (card "Sprints: indicar progresso por
 * cor e conclusão em verde"). O fundo do cartão ganha um degradê verde que avança
 * com a porcentagem de cards concluídos; a sprint concluída fica verde-clara.
 * O estado continua escrito (selo de status e "Progresso X%"), a cor só reforça.
 */

export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED'

export interface ProgressoSprint {
  /** 0–100, arredondado. */
  pct: number
  /** Sprint encerrada ou com todos os cards concluídos. */
  concluida: boolean
  /** Estilo inline do cartão (fundo e borda). */
  cardStyle: { background: string; borderColor?: string }
  /** Estilo inline do preenchimento da barra. */
  barStyle: { width: string; background: string }
}

const VERDE_CLARO = '#f0fdf4' // green-50
const VERDE_BORDA = '#bbf7d0' // green-200
const AZUL = '#3b82f6' // blue-500
const VERDE = '#22c55e' // green-500

export function porcentagemSprint(concluidos: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const pct = Math.round((Math.max(0, concluidos) / total) * 100)
  return Math.min(100, Math.max(0, pct))
}

export function progressoSprint(status: SprintStatus | string, concluidos: number, total: number): ProgressoSprint {
  const pct = porcentagemSprint(concluidos, total)
  const concluida = status === 'COMPLETED' || (total > 0 && pct === 100)

  if (concluida) {
    return {
      pct,
      concluida,
      cardStyle: { background: VERDE_CLARO, borderColor: VERDE_BORDA },
      barStyle: { width: `${total > 0 ? pct : 100}%`, background: VERDE },
    }
  }

  // Degradê: a faixa verde cobre a parte concluída e se dissolve no branco.
  // Fica mais intensa conforme a sprint se aproxima do fim.
  const alpha = (0.06 + 0.16 * (pct / 100)).toFixed(3)
  const background = pct > 0
    ? `linear-gradient(90deg, rgba(34, 197, 94, ${alpha}) 0%, rgba(34, 197, 94, ${alpha}) ${Math.max(0, pct - 15)}%, #ffffff ${pct}%)`
    : '#ffffff'

  return {
    pct,
    concluida,
    cardStyle: { background },
    barStyle: { width: `${pct}%`, background: `linear-gradient(90deg, ${AZUL}, ${misturar(AZUL, VERDE, pct / 100)})` },
  }
}

/** Interpola duas cores #rrggbb (t entre 0 e 1). */
export function misturar(de: string, para: string, t: number): string {
  const k = Math.min(1, Math.max(0, t))
  const a = hex(de), b = hex(para)
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k))
  return `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function hex(cor: string): [number, number, number] {
  const n = parseInt(cor.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const SPRINT_STATUS_LABEL: Record<SprintStatus, { label: string; cls: string }> = {
  PLANNED: { label: 'Planejada', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  ACTIVE: { label: 'Ativa', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  COMPLETED: { label: 'Concluída', cls: 'bg-green-100 text-green-800 border-green-300' },
}

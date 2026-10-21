export interface DerivadosInput {
  minutos: number
  horasDiarias: number
  remuneracao: number
}

export interface DerivadosResult {
  horas: number
  dias: number
  valorPorMinuto: number
  total: number
}

export function calcularDerivados(input: DerivadosInput): DerivadosResult {
  const { minutos, horasDiarias, remuneracao } = input

  if (horasDiarias === 0) {
    return { horas: minutos / 60, dias: 0, valorPorMinuto: 0, total: 0 }
  }

  const horas = minutos / 60
  const dias = horas / horasDiarias
  const valorPorMinuto = remuneracao / (horasDiarias * 60)
  const total = minutos * valorPorMinuto

  return { horas, dias, valorPorMinuto, total }
}

export type SituacaoStatus = 'Antecipada' | 'No prazo' | 'Atrasada'

export function calcularSituacaoStatus(
  dataRealizacao: Date | null | undefined,
  dataPrevista: Date | null | undefined
): SituacaoStatus | null {
  if (!dataRealizacao || !dataPrevista) return null

  const realMs = dataRealizacao.setHours(0, 0, 0, 0)
  const prevMs = new Date(dataPrevista).setHours(0, 0, 0, 0)

  if (realMs < prevMs) return 'Antecipada'
  if (realMs === prevMs) return 'No prazo'
  return 'Atrasada'
}

// ── Prazo do card ───────────────────────────────────────────────────────────

export type PrazoStatus = 'ok' | 'proximo' | 'atrasado' | 'concluido'

const DOIS_DIAS_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Situação do prazo (endDate) de um card:
 * - `concluido`: card numa coluna de conclusão, independente da data;
 * - `atrasado`: prazo já passou;
 * - `proximo`: vence em até 2 dias;
 * - `ok`: dentro do prazo.
 * Sem prazo, retorna null.
 */
export function prazoStatus(
  endDate: Date | string | null | undefined,
  now: Date,
  concluido: boolean,
): PrazoStatus | null {
  if (!endDate) return null
  const fim = new Date(endDate).getTime()
  if (Number.isNaN(fim)) return null
  if (concluido) return 'concluido'
  const restante = fim - now.getTime()
  if (restante < 0) return 'atrasado'
  if (restante <= DOIS_DIAS_MS) return 'proximo'
  return 'ok'
}

const COLUNAS_CONCLUSAO = new Set(['concluido', 'concluida', 'concluidos', 'concluidas', 'done', 'finalizado', 'finalizada', 'entregue', 'feito'])

/** Coluna que representa trabalho terminado ("Concluído", "Done"…). */
export function isColunaConcluida(title: string | null | undefined): boolean {
  if (!title) return false
  const key = title.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  return COLUNAS_CONCLUSAO.has(key)
}

/**
 * Coluna de conclusão da sprint, mesmo renomeada: a de nome de conclusão
 * ("Concluído", "Done", "Entregue"…) mais à direita; sem nenhuma, a última coluna.
 * null quando a sprint não tem colunas.
 */
export function colunaDeConclusao<T extends { title: string; position: number }>(colunas: T[]): T | null {
  const ordenadas = [...colunas].sort((a, b) => a.position - b.position)
  const porNome = ordenadas.filter(c => isColunaConcluida(c.title))
  return porNome.at(-1) ?? ordenadas.at(-1) ?? null
}

/** "30/09", ou "30/09/27" quando o prazo não é do ano corrente. */
export function formatPrazoCurto(date: Date | string, now: Date = new Date()): string {
  const d = new Date(date)
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  if (d.getFullYear() === now.getFullYear()) return `${dia}/${mes}`
  return `${dia}/${mes}/${String(d.getFullYear()).slice(-2)}`
}

/** Data → valor de `<input type="datetime-local">` no fuso local ("2026-09-30T23:59"). */
export function toDatetimeLocal(date: Date | string | null | undefined): string {
  if (!date) return ''
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Valor de `<input type="datetime-local">` → ISO UTC; vazio vira null (remove a data). */
export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

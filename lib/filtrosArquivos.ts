/**
 * Filtros da lista de arquivos (Fotos e Vídeos, Desenhos Técnicos, Pesquisas, Arquivos do admin…).
 * Dentro de um mesmo filtro as opções somam (OU); filtros diferentes se combinam (E). Filtro vazio vale como "todos".
 * Lógica pura (sem React), para ser testada à parte.
 */

export type PeriodoArquivo = '' | 'hoje' | '7d' | '30d' | 'ano' | 'personalizado'
export type FaixaTamanho = 'pequeno' | 'medio' | 'grande' | 'enorme'

export interface FiltrosArquivos {
  tipos: string[]
  enviadores: string[]
  periodo: PeriodoArquivo
  /** aaaa-mm-dd; só valem com `periodo: 'personalizado'` (qualquer um dos dois pode ficar vazio). */
  de: string
  ate: string
  tamanhos: FaixaTamanho[]
  somenteEstrela: boolean
}

export const FILTROS_ARQUIVOS_VAZIOS: FiltrosArquivos = { tipos: [], enviadores: [], periodo: '', de: '', ate: '', tamanhos: [], somenteEstrela: false }

const MB = 1024 * 1024
export const FAIXAS_TAMANHO: { valor: FaixaTamanho; rotulo: string; min: number; max: number }[] = [
  { valor: 'pequeno', rotulo: 'Até 1 MB', min: 0, max: MB },
  { valor: 'medio', rotulo: '1 a 10 MB', min: MB, max: 10 * MB },
  { valor: 'grande', rotulo: '10 a 100 MB', min: 10 * MB, max: 100 * MB },
  { valor: 'enorme', rotulo: 'Mais de 100 MB', min: 100 * MB, max: Infinity },
]

export const PERIODOS_ARQUIVO: { valor: Exclude<PeriodoArquivo, '' | 'personalizado'>; rotulo: string }[] = [
  { valor: 'hoje', rotulo: 'Hoje' },
  { valor: '7d', rotulo: 'Últimos 7 dias' },
  { valor: '30d', rotulo: 'Últimos 30 dias' },
  { valor: 'ano', rotulo: 'Este ano' },
]

/** Hora atual; fica fora dos componentes para os testes poderem fixá-la. */
export const agora = () => Date.now()

const inicioDoDia = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }

/** Intervalo [inicio, fim) em milissegundos; `null` em cada ponta = sem limite. */
export function intervaloDoPeriodo(f: Pick<FiltrosArquivos, 'periodo' | 'de' | 'ate'>, ref: number): { inicio: number | null; fim: number | null } | null {
  const dia = 24 * 60 * 60 * 1000
  switch (f.periodo) {
    case 'hoje': return { inicio: inicioDoDia(ref), fim: null }
    case '7d': return { inicio: inicioDoDia(ref) - 6 * dia, fim: null }
    case '30d': return { inicio: inicioDoDia(ref) - 29 * dia, fim: null }
    case 'ano': return { inicio: new Date(new Date(ref).getFullYear(), 0, 1).getTime(), fim: null }
    case 'personalizado': {
      const de = /^\d{4}-\d{2}-\d{2}$/.test(f.de) ? new Date(`${f.de}T00:00:00`).getTime() : null
      const ate = /^\d{4}-\d{2}-\d{2}$/.test(f.ate) ? new Date(`${f.ate}T00:00:00`).getTime() + dia : null
      return de === null && ate === null ? null : { inicio: de, fim: ate }
    }
    default: return null
  }
}

export interface ItemFiltravel {
  categoria: string
  enviadoPor: string | null
  /** ISO. */
  data: string
  tamanhoBytes?: number
  favorito?: boolean
}

/** Aplica os filtros a um item. `ref` é a hora de referência dos períodos relativos. */
export function passaNosFiltros(item: ItemFiltravel, f: FiltrosArquivos, ref: number): boolean {
  if (f.tipos.length && !f.tipos.includes(item.categoria)) return false
  if (f.enviadores.length && !(item.enviadoPor && f.enviadores.includes(item.enviadoPor))) return false
  const intervalo = intervaloDoPeriodo(f, ref)
  if (intervalo) {
    const t = Date.parse(item.data)
    if (Number.isNaN(t)) return false
    if (intervalo.inicio !== null && t < intervalo.inicio) return false
    if (intervalo.fim !== null && t >= intervalo.fim) return false
  }
  if (f.tamanhos.length) {
    if (typeof item.tamanhoBytes !== 'number') return false
    const b = item.tamanhoBytes
    if (!FAIXAS_TAMANHO.some(x => f.tamanhos.includes(x.valor) && b >= x.min && b < x.max)) return false
  }
  if (f.somenteEstrela && !item.favorito) return false
  return true
}

/** Quantos filtros têm algo marcado (o número no botão). */
export function contarFiltros(f: FiltrosArquivos): number {
  return [f.tipos.length > 0, f.enviadores.length > 0, intervaloDoPeriodo(f, 0) !== null, f.tamanhos.length > 0, f.somenteEstrela].filter(Boolean).length
}

const dataBr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : '')

/** Rótulo do período para a etiqueta do filtro ativo. */
export function rotuloDoPeriodo(f: Pick<FiltrosArquivos, 'periodo' | 'de' | 'ate'>): string {
  if (f.periodo === 'personalizado') {
    const de = dataBr(f.de), ate = dataBr(f.ate)
    return de && ate ? `${de} a ${ate}` : de ? `A partir de ${de}` : ate ? `Até ${ate}` : ''
  }
  return PERIODOS_ARQUIVO.find(p => p.valor === f.periodo)?.rotulo ?? ''
}

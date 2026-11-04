'use server'

import { refletirResponsaveisNoNo } from '@/services/wbsService'

import { verifySession } from '@/lib/dal'
import { cardsApi, timeEntriesApi } from '@/lib/api-client'
import { LIMITE_TIMER_HORAS } from '@/lib/avisoTimer'
import { revalidatePath } from 'next/cache'

function revalidarRealizado() {
  revalidatePath('/projetos/[projetoId]/planilha-custos', 'page')
  revalidatePath('/projetos/[projetoId]/wbs', 'page')
  revalidatePath('/sprints/[sprintId]', 'page')
}

// CUIDs gerados pelo Prisma: começam com 'c', alfanuméricos minúsculos, ~25 chars
const CUID_RE = /^c[a-z0-9]{20,30}$/
const MAX_DESCRIPTION_LENGTH = 500
/** Mesmo teto por lançamento do sprint-service (ADR-046). */
const LIMITE_LANCAMENTO_SEGUNDOS = LIMITE_TIMER_HORAS * 3600
const MAX_DIAS_LANCAMENTO = 31

function assertValidId(id: string, label = 'ID'): void {
  if (!id || !CUID_RE.test(id)) {
    throw new Error(`${label} inválido`)
  }
}

function assertValidTime(hours: number, minutes: number): void {
  if (!Number.isInteger(hours) || hours < 0 || hours > 168) {
    throw new Error('Horas deve ser um número inteiro entre 0 e 168')
  }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    throw new Error('Minutos deve ser um número inteiro entre 0 e 59')
  }
}

function sanitizeDescription(desc?: string): string | undefined {
  if (desc === undefined) return undefined
  const trimmed = desc.trim()
  if (trimmed.length > MAX_DESCRIPTION_LENGTH) {
    throw new Error(`Descrição excede o limite de ${MAX_DESCRIPTION_LENGTH} caracteres`)
  }
  return trimmed || undefined
}

/** Divide o total em partes de no máximo 12 h, da mais antiga para a mais recente. */
function dividirEmLancamentos(totalSegundos: number): number[] {
  const partes: number[] = []
  let restante = totalSegundos
  while (restante > 0) {
    const parte = Math.min(restante, LIMITE_LANCAMENTO_SEGUNDOS)
    partes.push(parte)
    restante -= parte
  }
  return partes
}

export async function startTimerAction(cardId: string) {
  try {
    const session = await verifySession()
    assertValidId(cardId, 'cardId')
    const entry = await cardsApi.startTimer(cardId)
    // Iniciar o timer leva o card para "Em andamento", que exige responsável (ADR-045):
    // sem nenhum, quem iniciou vira o responsável.
    const responsavelAdicionado = await tornarResponsavelSeVazio(cardId, session.userId)
    return { entry, responsavelAdicionado }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao iniciar timer' }
  }
}

export async function pauseTimerAction(entryId: string) {
  try {
    await verifySession()
    assertValidId(entryId, 'entryId')
    const entry = await cardsApi.stopTimer(entryId)
    revalidarRealizado()
    return { entry }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao pausar timer' }
  }
}

export async function getCardTimeAction(cardId: string) {
  try {
    await verifySession()
    assertValidId(cardId, 'cardId')
    const { seconds } = await cardsApi.getTimeTotal(cardId)
    return { seconds }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao buscar tempo' }
  }
}

export async function getActiveTimerAction(cardId: string) {
  try {
    await verifySession()
    assertValidId(cardId, 'cardId')
    const entry = await cardsApi.getActiveTimer(cardId)
    return { entry }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao buscar timer', entry: null }
  }
}

export type CardTimerState =
  | { seconds: number; entry: { id: string; isRunning?: boolean; startedAt: string | Date; duration?: number | null } | null }
  | { error: string }

/**
 * Total e timer ativo de vários cards numa única Server Action. O cliente executa
 * Server Actions uma de cada vez; com uma chamada por card, o quadro inteiro
 * enfileirava e estourava o tempo do timer. Aqui as leituras rodam em paralelo.
 */
export async function getCardsTimerAction(cardIds: string[]): Promise<Record<string, CardTimerState>> {
  await verifySession()
  const ids = [...new Set(cardIds)].slice(0, 200)
  const result: Record<string, CardTimerState> = {}
  let next = 0
  const worker = async () => {
    while (next < ids.length) {
      const id = ids[next++]
      try {
        assertValidId(id, 'cardId')
        const [total, entry] = await Promise.all([cardsApi.getTimeTotal(id), cardsApi.getActiveTimer(id)])
        result[id] = { seconds: total.seconds, entry: entry ?? null }
      } catch (err) {
        result[id] = { error: err instanceof Error ? err.message : 'Erro ao buscar timer' }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, ids.length) }, worker))
  return result
}

export async function addManualTimeAction(cardId: string, hours: number, minutes: number, secs = 0, description?: string, days = 0) {
  try {
    await verifySession()
    assertValidId(cardId, 'cardId')
    assertValidTime(hours, minutes)
    if (!Number.isInteger(days) || days < 0 || days > MAX_DIAS_LANCAMENTO) {
      throw new Error(`Dias deve ser um número inteiro entre 0 e ${MAX_DIAS_LANCAMENTO}`)
    }
    if (!Number.isInteger(secs) || secs < 0 || secs > 59) {
      throw new Error('Segundos deve ser um número inteiro entre 0 e 59')
    }
    const safeDescription = sanitizeDescription(description)
    const seconds = (days * 24 + hours) * 3600 + minutes * 60 + secs
    if (seconds <= 0) {
      return { error: 'O tempo deve ser maior que zero' }
    }
    if (seconds > MAX_DIAS_LANCAMENTO * 24 * 3600) {
      return { error: `O lançamento deve ter no máximo ${MAX_DIAS_LANCAMENTO} dias` }
    }
    const endedAt = new Date()
    const partes = dividirEmLancamentos(seconds)
    const criadas: { id: string }[] = []
    let inicio = new Date(endedAt.getTime() - seconds * 1000)
    try {
      for (const parte of partes) {
        const fim = new Date(inicio.getTime() + parte * 1000)
        const entry = await cardsApi.createManualEntry(cardId, {
          startedAt: inicio.toISOString(),
          endedAt: fim.toISOString(),
          description: safeDescription,
        }) as { id: string }
        criadas.push(entry)
        inicio = fim
      }
    } catch (err) {
      // A API valida cada lançamento isoladamente; se um deles falhar, desfaz os já gravados.
      await Promise.allSettled(criadas.map(e => timeEntriesApi.delete(e.id)))
      throw err
    }
    revalidarRealizado()
    return { entry: criadas[criadas.length - 1], entries: criadas }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao adicionar tempo' }
  }
}

export async function getTimeEntriesAction(cardId: string) {
  try {
    await verifySession()
    assertValidId(cardId, 'cardId')
    const entries = await cardsApi.listTimeEntries(cardId)
    return { entries }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao buscar registros', entries: [] as never[] }
  }
}

export async function updateTimeEntryAction(entryId: string, hours: number, minutes: number, description?: string) {
  try {
    await verifySession()
    assertValidId(entryId, 'entryId')
    assertValidTime(hours, minutes)
    const safeDescription = sanitizeDescription(description)
    const seconds = hours * 3600 + minutes * 60
    if (seconds <= 0) {
      return { error: 'O tempo deve ser maior que zero' }
    }
    const entry = await timeEntriesApi.update(entryId, { duration: seconds, description: safeDescription ?? null })
    revalidarRealizado()
    return { entry }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao atualizar registro' }
  }
}

export async function deleteTimeEntryAction(entryId: string) {
  try {
    await verifySession()
    assertValidId(entryId, 'entryId')
    await timeEntriesApi.delete(entryId)
    revalidarRealizado()
    return { success: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Erro ao excluir registro' }
  }
}

async function tornarResponsavelSeVazio(cardId: string, userId: string): Promise<boolean> {
  try {
    const card = await cardsApi.get(cardId) as { responsibles?: unknown[] }
    if ((card.responsibles ?? []).length > 0) return false
    await cardsApi.addResponsible(cardId, userId)
    await refletirResponsaveisNoNo(cardId).catch(() => {})
    return true
  } catch {
    return false // best-effort: o timer já está correndo; o movimento avisa se faltar responsável
  }
}

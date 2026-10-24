import { verifyRouteSession } from '@/lib/routeAuth'
import { parseCsvBuffer, mapRowToCardData } from '@/services/csvImportService'
import { sprintsApi, cardsApi } from '@/lib/api-client'
import { CsvRowSchema } from '@/lib/validation/csvSchemas'

const ALLOWED_CSV_TYPES = ['text/csv', 'text/plain']
// Limites: um CSV grande criava milhares de cards de uma vez, todos em paralelo.
const CSV_MAX_BYTES = 1024 * 1024
const CSV_MAX_LINHAS = 500
const CSV_CONCORRENCIA = 5

/** Cria os cards em lotes pequenos, mantendo o resultado na ordem das linhas. */
async function emLotes<T, R>(itens: T[], fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const resultados: PromiseSettledResult<R>[] = []
  for (let i = 0; i < itens.length; i += CSV_CONCORRENCIA) {
    resultados.push(...await Promise.allSettled(itens.slice(i, i + CSV_CONCORRENCIA).map(fn)))
  }
  return resultados
}

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof verifyRouteSession>>
  try { session = await verifyRouteSession(request) }
  catch { return Response.json({ error: 'Autenticação indisponível' }, { status: 503 }) }
  if (!session?.userId) {
    return Response.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const formData = await request.formData()
  const sprintId = formData.get('sprintId') as string | null
  const file = formData.get('file') as File | null

  if (!file) return Response.json({ error: 'Arquivo CSV é obrigatório' }, { status: 400 })
  if (!ALLOWED_CSV_TYPES.includes(file.type)) {
    return Response.json({ error: 'Tipo de arquivo inválido. Use um arquivo .csv' }, { status: 400 })
  }
  if (file.size > CSV_MAX_BYTES) return Response.json({ error: 'Arquivo CSV excede 1 MB' }, { status: 413 })
  if (!sprintId) return Response.json({ error: 'sprintId é obrigatório' }, { status: 400 })

  const [sprint, sprintColumns] = await Promise.all([
    sprintsApi.get(sprintId).catch(() => null),
    sprintsApi.listColumns(sprintId).catch(() => []) as Promise<Array<{ id: string; title: string }>>,
  ])

  if (!sprint) return Response.json({ error: 'Sprint não encontrado' }, { status: 404 })
  if ((sprintColumns as unknown[]).length === 0) {
    return Response.json({ error: 'Sprint não tem colunas. Abra a sprint antes de importar.' }, { status: 400 })
  }

  const csvText = await file.text()
  const rows = parseCsvBuffer(csvText)
  if (rows.length === 0) return Response.json({ imported: 0, errors: [] })
  if (rows.length > CSV_MAX_LINHAS) {
    return Response.json({ error: `O CSV pode ter no máximo ${CSV_MAX_LINHAS} linhas` }, { status: 413 })
  }

  const errors: { row: number; message: string }[] = []
  const validRows: ReturnType<typeof mapRowToCardData>[] = []

  rows.forEach((row, i) => {
    const parsed = CsvRowSchema.safeParse(row)
    if (!parsed.success) {
      errors.push({ row: i + 1, message: parsed.error.issues[0].message })
      return
    }
    validRows.push(mapRowToCardData(row, sprintId, sprintColumns, validRows.length, 0))
  })

  const results = await emLotes(validRows, ({ tagsImport: _tagsImport, ...card }) => cardsApi.create(card as Record<string, unknown>))

  const failed = results.filter(r => r.status === 'rejected').length
  if (failed > 0) {
    errors.push({ row: -1, message: `${failed} card(s) falharam ao ser criados no servidor` })
  }

  return Response.json({ imported: results.length - failed, errors })
}

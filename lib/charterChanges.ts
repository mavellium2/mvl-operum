export interface CharterChange { field: string; before: unknown; after: unknown }
const fields = ['categoria', 'justificativa', 'objetivos', 'metodologia', 'descricaoProduto', 'premissas', 'restricoes', 'limitesAutoridade', 'principaisEnvolvidos', 'textoGerencia', 'macroFases', 'documentContext'] as const
export function charterChanges(previous: unknown, current: unknown): CharterChange[] {
  const before = previous && typeof previous === 'object' ? previous as Record<string, unknown> : {}
  const after = current && typeof current === 'object' ? current as Record<string, unknown> : {}
  return fields.filter(field => JSON.stringify(before[field] ?? null) !== JSON.stringify(after[field] ?? null)).map(field => ({ field, before: before[field] ?? null, after: after[field] ?? null }))
}

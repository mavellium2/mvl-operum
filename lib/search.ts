/** Busca textual por termos, sem diferenciar acentos ou maiúsculas. */
export function matchesSearch(text: string, query: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const haystack = normalize(text)
  return normalize(query).trim().split(/\s+/).every(term => haystack.includes(term))
}

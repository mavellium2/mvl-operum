/** Identificador legível; nomes sem letras/números usam uma base neutra. */
export function institutionIdentifier(name: string) {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/g, '')
  return slug.length >= 3 ? slug : slug ? `instituicao-${slug}` : 'instituicao'
}
export function availableInstitutionIdentifier(base: string, occupied: readonly string[]) {
  const used = new Set(occupied)
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const suffix = `-${n}`
    const candidate = base.slice(0, 63 - suffix.length).replace(/-+$/g, '') + suffix
    if (!used.has(candidate)) return candidate
  }
}

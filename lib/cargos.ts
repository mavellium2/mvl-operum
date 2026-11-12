/**
 * Função exibida para um membro no projeto: as funções dele no projeto (as mesmas
 * de Stakeholders) ou, sem elas, o cargo global do usuário. É só texto de exibição.
 */
export function cargoNoProjeto(funcoesNoProjeto: string[] | null | undefined, cargoGlobal?: string | null): string | null {
  const nomes = (funcoesNoProjeto ?? []).map(c => c.trim()).filter(Boolean)
  if (nomes.length > 0) return nomes.join(', ')
  return cargoGlobal?.trim() || null
}

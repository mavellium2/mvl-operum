/** Preferência visual por conta e instituição; nunca concede acesso ao projeto. */
export function recentProjectKey(userId: string, tenantId: string) {
  return `operum_recent_${encodeURIComponent(tenantId)}_${encodeURIComponent(userId)}`
}

/** Quantos projetos recentes a lista guarda (o mais recente primeiro). */
export const MAX_RECENTES = 50
const ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * Lê a lista de recentes do cookie: "id1,id2,…" (o mais recente primeiro). O cookie
 * antigo, com um único ID, vale como lista de um item. IDs inválidos ou repetidos saem.
 */
export function lerRecentes(valor?: string | null): string[] {
  const ids: string[] = []
  for (const parte of decodeURIComponent(valor ?? '').split(',')) {
    const id = parte.trim()
    if (ID.test(id) && !ids.includes(id)) ids.push(id)
    if (ids.length >= MAX_RECENTES) break
  }
  return ids
}

/** Abriu um projeto: ele vai para o início e sai da posição anterior (como uma pilha). */
export function registrarRecente(atual: string[], projectId: string): string[] {
  return [projectId, ...atual.filter(id => id !== projectId)].slice(0, MAX_RECENTES)
}

export const gravarRecentes = (ids: string[]) => ids.join(',')

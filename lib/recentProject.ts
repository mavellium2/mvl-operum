/** Preferência visual por conta e instituição; nunca concede acesso ao projeto. */
export function recentProjectKey(userId: string, tenantId: string) {
  return `operum_recent_${encodeURIComponent(tenantId)}_${encodeURIComponent(userId)}`
}

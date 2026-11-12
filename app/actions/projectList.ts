'use server'
import { verifySession } from '@/lib/dal'
import { loadProjectList } from '@/services/projectList'

export async function loadMoreProjects(input: { page: number; query: string; status: string; preferred: string }) {
  await verifySession()
  if (!input || !Number.isSafeInteger(input.page) || input.page < 2 || input.page > 100000 || typeof input.query !== 'string' || input.query.length > 200 || typeof input.preferred !== 'string' || input.preferred.length > 3300 || !['', 'ACTIVE', 'COMPLETED', 'ARCHIVED', 'INACTIVE'].includes(input.status)) return { error: 'Não foi possível carregar essa página de projetos.' } as const
  try {
    return { batch: await loadProjectList(input.page, input.query.trim(), input.status, input.preferred) }
  } catch {
    return { error: 'Não foi possível carregar mais projetos. Tente novamente.' } as const
  }
}

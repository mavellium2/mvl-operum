import 'server-only'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { projectsApi } from '@/lib/api-client'
import { canProjectPermission } from '@/services/projectAccess'
import { recentProjectKey } from '@/lib/recentProject'

export async function loadProjectList(page: number, query: string, status: string, preferred?: string) {
  const session = await verifySession()
  const recent = preferred ?? (await cookies()).get(recentProjectKey(session.userId, session.tenantId))?.value ?? ''
  const { items, total } = await projectsApi.list(page, 9, recent, { q: query, status })
  const projects = await Promise.all(items.map(async project => ({
    id: project.id, name: project.name, slogan: project.slogan ?? null, logoUrl: project.logoUrl ?? null,
    status: project.status ?? 'ACTIVE', startDate: project.startDate ?? null, endDate: project.endDate ?? null,
    members: project._count?.members ?? 0, macroFases: project._count?.macroFases ?? 0, editable: await canProjectPermission(session, project.id, 'projeto:editar'),
  })))
  return { projects, total, recent }
}
export type ProjectListBatch = Awaited<ReturnType<typeof loadProjectList>>

import 'server-only'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { projectsApi } from '@/lib/api-client'
import { canProjectPermission } from '@/services/projectAccess'
import { gravarRecentes, lerRecentes, recentProjectKey } from '@/lib/recentProject'
import { FILTROS_VAZIOS, filtrosNaQuery, filtrosProjetosKey, lerFiltrosDoCookie, type FiltrosProjetos } from '@/lib/filtrosProjetos'

/** Filtros guardados desta conta nesta instituição (vazios = todos os projetos). */
export async function lerFiltrosGuardados(): Promise<FiltrosProjetos> {
  const session = await verifySession()
  return lerFiltrosDoCookie((await cookies()).get(filtrosProjetosKey(session.userId, session.tenantId))?.value)
}

export async function loadProjectList(page: number, query: string, filtros: FiltrosProjetos = FILTROS_VAZIOS, preferred?: string, comOpcoes = false) {
  const session = await verifySession()
  // Lista de recentes deste usuário nesta instituição (o mais recente primeiro).
  const recent = gravarRecentes(lerRecentes(preferred ?? (await cookies()).get(recentProjectKey(session.userId, session.tenantId))?.value ?? ''))
  const { items, total, opcoes } = await projectsApi.list(page, 9, recent, { q: query, filtros: filtrosNaQuery(filtros), opcoes: comOpcoes })
  const projects = await Promise.all(items.map(async project => ({
    id: project.id, name: project.name, slogan: project.slogan ?? null, logoUrl: project.logoUrl ?? null,
    status: project.status ?? 'ACTIVE', startDate: project.startDate ?? null, endDate: project.endDate ?? null,
    members: project._count?.members ?? 0, macroFases: project._count?.macroFases ?? 0, editable: await canProjectPermission(session, project.id, 'projeto:editar'),
  })))
  return { projects, total, recent, opcoes: opcoes ?? { anos: [], departamentos: [], termos: [] } }
}
export type ProjectListBatch = Awaited<ReturnType<typeof loadProjectList>>

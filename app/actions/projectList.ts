'use server'
import { cookies } from 'next/headers'
import { verifySession } from '@/lib/dal'
import { loadProjectList } from '@/services/projectList'
import { filtrosProjetosKey, gravarFiltrosNoCookie, normalizarFiltros, type FiltrosProjetos } from '@/lib/filtrosProjetos'

export async function loadMoreProjects(input: { page: number; query: string; filtros: FiltrosProjetos; preferred: string }) {
  await verifySession()
  if (!input || !Number.isSafeInteger(input.page) || input.page < 2 || input.page > 100000 || typeof input.query !== 'string' || input.query.length > 200 || typeof input.preferred !== 'string' || input.preferred.length > 3300 || !input.filtros || typeof input.filtros !== 'object') return { error: 'Não foi possível carregar essa página de projetos.' } as const
  try {
    return { batch: await loadProjectList(input.page, input.query.trim(), normalizarFiltros(input.filtros), input.preferred) }
  } catch {
    return { error: 'Não foi possível carregar mais projetos. Tente novamente.' } as const
  }
}

/** Guarda os filtros de "Meus projetos" desta conta nesta instituição, para a lista já abrir filtrada. */
export async function salvarFiltrosProjetos(filtros: FiltrosProjetos) {
  const session = await verifySession()
  const valor = gravarFiltrosNoCookie(normalizarFiltros(filtros))
  if (valor.length > 3500) return { error: 'Filtros demais. Desmarque algumas opções.' } as const
  ;(await cookies()).set(filtrosProjetosKey(session.userId, session.tenantId), valor, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 365,
  })
  return { ok: true } as const
}

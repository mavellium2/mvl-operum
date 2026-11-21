import { verifySession } from '@/lib/dal'
import Link from 'next/link'
import { FolderKanban } from 'lucide-react'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import GlassCard from '@/components/ui/GlassCard'
import { NewProjectButton } from '@/components/projetos/ProjectListActions'
import ProjectListFilters from '@/components/projetos/ProjectListFilters'
import ProjectListGrid from '@/components/projetos/ProjectListGrid'
import { lerFiltrosGuardados, loadProjectList } from '@/services/projectList'
import { filtrosAtivos } from '@/lib/filtrosProjetos'
import type { Metadata } from 'next'
import './projects.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Meus projetos' }
export default async function ProjetosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await verifySession()
  const params = await searchParams
  const query = (params.q ?? '').trim().slice(0, 200)
  // Filtros guardados desta conta: a lista já abre filtrada (ajustes de 20/11/2026).
  const filtros = await lerFiltrosGuardados()
  const filtrando = filtrosAtivos(filtros) > 0
  const initial = await loadProjectList(1, query, filtros, undefined, true)
  const { total, projects: projetos, opcoes } = initial
  return <ProjectAppearance enabled><div className="projects-page">
    <header className="projects-heading" style={{ background: 'transparent' }}><div><h1>Meus projetos <span>{total}</span></h1></div>{session.role === 'admin' && <NewProjectButton />}</header>
    <ProjectListFilters query={query} filtros={filtros} opcoes={opcoes} />
    {projetos.length ? <ProjectListGrid key={`${query}:${JSON.stringify(filtros)}`} initial={initial} query={query} filtros={filtros} /> : <GlassCard className="projects-empty"><FolderKanban size={34} strokeWidth={1.3} aria-hidden="true" /><h2>{query || filtrando ? 'Nenhum projeto encontrado' : total ? 'Nenhum projeto nesta página' : 'Seu próximo projeto começa aqui'}</h2><p>{query || filtrando ? 'Tente outro nome ou mude as opções marcadas nos filtros.' : total ? 'Volte à primeira página para encontrar seus projetos.' : 'Reúna as ideias, organize as entregas e convide sua equipe.'}</p>{query || total ? <Link href="/projetos">Ver projetos</Link> : session.role === 'admin' && <NewProjectButton />}</GlassCard>}
  </div></ProjectAppearance>
}

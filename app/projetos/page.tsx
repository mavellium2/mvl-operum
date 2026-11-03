import { verifySession } from '@/lib/dal'
import Link from 'next/link'
import { FolderKanban } from 'lucide-react'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import GlassCard from '@/components/ui/GlassCard'
import { NewProjectButton } from '@/components/projetos/ProjectListActions'
import ProjectListFilters from '@/components/projetos/ProjectListFilters'
import ProjectListGrid from '@/components/projetos/ProjectListGrid'
import { loadProjectList } from '@/services/projectList'
import type { Metadata } from 'next'
import './projects.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Meus projetos' }
export default async function ProjetosPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const session = await verifySession()
  const params = await searchParams
  const query = (params.q ?? '').trim().slice(0, 200)
  const statusFilter = ['ACTIVE', 'COMPLETED', 'ARCHIVED', 'INACTIVE'].includes(params.status ?? '') ? params.status! : ''
  const initial = await loadProjectList(1, query, statusFilter)
  const { total, projects: projetos } = initial
  return <ProjectAppearance enabled><div className="projects-page">
    <header className="projects-heading" style={{ background: 'transparent' }}><div><h1>Meus projetos <span>{total}</span></h1></div>{session.role === 'admin' && <NewProjectButton />}</header>
    <ProjectListFilters query={query} status={statusFilter} />
    {projetos.length ? <ProjectListGrid key={`${query}:${statusFilter}`} initial={initial} query={query} status={statusFilter} /> : <GlassCard className="projects-empty"><FolderKanban size={34} strokeWidth={1.3} aria-hidden="true" /><h2>{query || statusFilter ? 'Nenhum projeto encontrado' : total ? 'Nenhum projeto nesta página' : 'Seu próximo projeto começa aqui'}</h2><p>{query || statusFilter ? 'Tente outro nome ou escolha uma situação diferente nos filtros.' : total ? 'Volte à primeira página para encontrar seus projetos.' : 'Reúna as ideias, organize as entregas e convide sua equipe.'}</p>{query || statusFilter || total ? <Link href="/projetos">Ver projetos</Link> : session.role === 'admin' && <NewProjectButton />}</GlassCard>}
  </div></ProjectAppearance>
}

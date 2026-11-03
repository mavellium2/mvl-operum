'use client'

import Link from 'next/link'
import Image from 'next/image'
import { UsersRound, CalendarDays, Layers3, Plus, LoaderCircle } from 'lucide-react'
import { STATUS_CONFIG } from '@/lib/statusConfig'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import DeleteProjectButton from '@/components/projetos/DeleteProjectButton'
import { EditProjectButton } from '@/components/projetos/ProjectListActions'
import { useRef, useState } from 'react'
import { loadMoreProjects } from '@/app/actions/projectList'
import type { ProjectListBatch } from '@/services/projectList'

function initials(name: string) { return name.trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'P' }
function date(value?: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' })
}

type Props = { initial: ProjectListBatch; query: string; status: string }
export default function ProjectListGrid(props: Props) {
  // Server Actions podem reenviar o mesmo lote como um novo objeto.
  // Só reiniciar quando o conteúdo mudar; identidade de objeto não é uma alteração.
  return <ProjectGrid key={JSON.stringify([props.initial, props.query, props.status])} {...props} />
}
function ProjectGrid({ initial, query, status }: Props) {
  const [projects, setProjects] = useState(initial.projects)
  const [total, setTotal] = useState(initial.total)
  const [nextPage, setNextPage] = useState(2)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const recent = initial.recent
  const hasMore = projects.length < total
  async function more() {
    if (busy.current) return
    busy.current = true
    setPending(true); setError('')
    try {
      const result = await loadMoreProjects({ page: nextPage, query, status, preferred: recent })
      if ('error' in result) { setError(result.error ?? 'Tente novamente.'); return }
      const batch = result.batch
      setProjects(previous => { const ids = new Set(previous.map(project => project.id)); return [...previous, ...batch.projects.filter(project => !ids.has(project.id))] })
      setTotal(batch.projects.length ? batch.total : projects.length)
      setNextPage(value => value + 1)
    } catch { setError('Não foi possível carregar mais projetos. Tente novamente.') }
    finally { busy.current = false; setPending(false) }
  }
  return <>
      <div id="project-list-grid" className="projects-grid" aria-busy={pending}>{projects.map((project, index) => {
        const status = STATUS_CONFIG[project.status ?? 'ACTIVE'] ?? STATUS_CONFIG.ACTIVE
        const members = project.members
        const last = index === 0 && recent === project.id && project.status === 'ACTIVE'
        const start = date(project.startDate), end = date(project.endDate)
        return <GlassCard as="article" interactive key={project.id} data-status={project.status ?? 'ACTIVE'} className={`project-list-card ${last ? 'project-list-card--recent' : ''}`} style={{ '--card-order': index % 9 } as React.CSSProperties}>
          <div className="project-card-top"><span className="project-list-logo">{project.logoUrl ? <Image unoptimized width={44} height={44} src={project.logoUrl} alt="" /> : initials(project.name)}</span><span className="project-status" data-status={project.status ?? 'ACTIVE'}><i />{status.label === 'Inactive' ? 'Inativo' : status.label}</span>{project.editable && <div className="project-list-actions"><EditProjectButton id={project.id} name={project.name} /><DeleteProjectButton id={project.id} name={project.name} /></div>}</div>
          <Link className="project-card-main" href={`/projetos/${project.id}`} aria-label={`Acessar projeto ${project.name}`}><h2>{project.name}</h2><p>{project.slogan || 'Planeje as próximas entregas e acompanhe sua equipe.'}</p></Link>
          <div className="project-card-meta"><span><UsersRound size={15} aria-hidden="true" />{members} {members === 1 ? 'membro' : 'membros'}</span><span><Layers3 size={15} aria-hidden="true" />{project.macroFases} {project.macroFases === 1 ? 'macrofase' : 'macrofases'}</span><span className="project-card-period"><CalendarDays size={15} aria-hidden="true" />{start && end ? `${start} até ${end}` : start ? `${start} até data a definir` : end ? `Início a definir até ${end}` : 'Sem período definido'}</span></div>
        </GlassCard>
      })}</div>
    <div className="projects-load-more">
      <p role="status" aria-live="polite">{projects.length} de {total} projetos</p>
      {error && <p role="alert" className="projects-load-error">{error}</p>}
      {hasMore && <GlassButton variant="default" disabled={pending} onClick={more} aria-controls="project-list-grid">{pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{pending ? 'Carregando projetos…' : error ? 'Tentar novamente' : 'Carregar mais projetos'}</GlassButton>}
    </div>
  </>
}

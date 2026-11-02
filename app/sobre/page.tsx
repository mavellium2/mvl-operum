import { DESENVOLVEDORES, EQUIPE_INFO } from '@/lib/equipe'
import type { Metadata } from 'next'
import { LayoutDashboard, Network, Files, Wallet, GraduationCap, ArrowUpRight, Mail } from 'lucide-react'
import ProjectAppearance from '@/components/aparencia/ProjectAppearance'
import GlassCard from '@/components/ui/GlassCard'
import UserAvatar from '@/components/user/UserAvatar'
import { ReleaseHistory } from './release-history'
import AboutContent from './about-content'
import './about.css'

export const metadata: Metadata = { title: 'Sobre' }

const resources = [
  { name: 'Kanban', description: 'Organize tarefas e acompanhe o trabalho da equipe.', Icon: LayoutDashboard },
  { name: 'EAP', description: 'Estruture o escopo e as entregas do projeto.', Icon: Network },
  { name: 'Documentos', description: 'Mantenha atas e documentos no mesmo ambiente.', Icon: Files },
  { name: 'Custos', description: 'Planeje o orçamento e acompanhe os gastos.', Icon: Wallet },
]

export default function SobrePage() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION
  return <ProjectAppearance enabled>
    <AboutContent version={version} history={version ? <ReleaseHistory version={version} /> : <p className="text-sm text-gray-500">Histórico indisponível nesta execução.</p>}
      overview={<div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,1fr)]">
        <GlassCard interactive className="about-card p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">Um ambiente para o projeto inteiro</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">O Operum integra fluxos de trabalho, documentação e controle de custos em uma plataforma de gestão de projetos.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">{resources.map(({ name, description, Icon }) => <div key={name} className="about-feature flex items-start gap-3"><span className="about-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.6} /></span><div><h3 className="text-sm font-semibold text-gray-900">{name}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{description}</p></div></div>)}</div>
          <div className="about-origin mt-6 flex items-start gap-2.5 border-t pt-4"><GraduationCap size={17} className="mt-0.5 shrink-0" aria-hidden="true" /><p className="text-xs leading-5 text-gray-500">Desenvolvido como Trabalho de Conclusão de Curso.</p></div>
        </GlassCard>
        <GlassCard interactive className="about-card p-5 sm:p-6">
          <h2 className="text-base font-semibold text-gray-900">Quem faz o Operum</h2>
          <p className="mt-1 text-xs leading-5 text-gray-500">{EQUIPE_INFO.instituicao} · {EQUIPE_INFO.curso}</p>
          <div className="mt-5 space-y-5">{DESENVOLVEDORES.toSorted((a, b) => a.area.localeCompare(b.area)).map(member => <section key={member.email}><h3 className="about-credit-label mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider">{member.area === 'orientacao' ? 'Orientação acadêmica' : 'Desenvolvimento'}</h3><GlassCard interactive className="about-member p-4"><div className="flex items-start gap-3"><UserAvatar name={member.nome} size="md" /><div className="min-w-0 flex-1"><h4 className="text-sm font-semibold text-gray-900">{member.nome}</h4><p className="mt-1 text-xs font-medium text-gray-500">{member.papel}{member.instituicao && ` · ${member.instituicao}`}</p>{member.curso && !member.papel.includes(member.curso) && <p className="mt-0.5 text-xs text-gray-500">{member.curso}</p>}<div className="mt-3 flex flex-wrap gap-x-4 gap-y-2"><a className="about-link inline-flex min-w-0 items-center gap-1.5 text-xs" href={`mailto:${member.email}`}><Mail size={13} className="shrink-0" aria-hidden="true" /><span className="break-all">{member.email}</span></a>{member.rede && <a className="about-link inline-flex items-center gap-1 text-xs" href={member.rede} target="_blank" rel="noopener noreferrer">LinkedIn<ArrowUpRight size={13} aria-hidden="true" /></a>}</div></div></div></GlassCard></section>)}</div>
        </GlassCard>
      </div>} />
  </ProjectAppearance>
}

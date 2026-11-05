'use client'

import { Fragment } from 'react'
import SidebarNavLink from './SidebarNavLink'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, Briefcase, LayoutDashboard, Columns3, UsersRound, Files, Network, Wallet, Settings2 } from 'lucide-react'
import { useProjectPermissions } from '@/components/permissoes/ProjectPermissions'
import DocumentSidebar from '@/components/projetos/documentacao/DocumentSidebar'
import SidebarLayout from '@/components/layout/SidebarLayout'

interface Props {
  projetoId: string
  projectName?: string
  canManageMembers: boolean
  canManageGlobalCatalogs?: boolean
}


export default function ProjectSidebar({ projetoId, projectName, canManageMembers, canManageGlobalCatalogs = false }: Props) {
  const permissions = useProjectPermissions()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const isAta = pathname === `/projetos/${projetoId}/atas` || pathname.startsWith(`/projetos/${projetoId}/atas/`)
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/') || (href === `/projetos/${projetoId}/documentacao` && isAta)

  const navItems = [
    { href: `/projetos/${projetoId}/dashboard`, label: 'Dashboard', Icon: LayoutDashboard },
    { href: `/projetos/${projetoId}/sprints`, label: 'Sprints', Icon: Columns3 },
    { href: `/projetos/${projetoId}/wbs`, label: 'EAP / WBS', Icon: Network },
    { href: `/projetos/${projetoId}/documentacao`, label: 'Documentação', Icon: Files },
    { href: `/projetos/${projetoId}/planilha-custos`, label: 'Planilha de Custos', Icon: Wallet },
    ...((canManageMembers || permissions.has('cadastros:gerenciar'))
      ? [
          { href: `/projetos/${projetoId}/stakeholders`, label: 'Stakeholders', Icon: UsersRound },
        ]
      : []),
    ...(permissions.has('projeto:editar') ? [{ href: `/projetos/${projetoId}/configuracoes`, label: 'Editar projeto', Icon: Settings2 }] : []),
    ...(canManageGlobalCatalogs ? [
      { href: '/admin/cadastros/departamentos', label: 'Departamentos', Icon: Building2 },
      { href: '/admin/cadastros/funcoes', label: 'Funções', Icon: Briefcase },
    ] : []),
  ].filter(item => {
    if (item.label === 'Sprints' || item.label === 'Dashboard') return permissions.has('quadro:ver')
    if (item.label === 'Documentação') return permissions.has('documentos:ver')
    if (item.label === 'Planilha de Custos') return permissions.has('planilha:ver')
    if (item.label === 'Stakeholders') return canManageMembers
    return true
  })

  // Contexto da busca conforme a sub-rota do projeto.
  const parts = pathname.split('/')
  const subRoute = parts[3] ?? ''
  // /projetos/:id/sprints/:sprintId → a busca prioriza os cards desta sprint.
  const currentSprintId = subRoute === 'sprints' && parts[4] && parts[4] !== 'nova' ? parts[4] : undefined
  const search: { placeholder: string; context: 'global_projects' | 'project_items' | 'sprint_items' | 'project_members' | 'default'; contextId?: string } = (
    subRoute === 'membros'
      ? { placeholder: 'Buscar membros no projeto...', context: 'project_members', contextId: projetoId }
      : { placeholder: 'Buscar cards, sprints e pessoas...', context: 'project_items', contextId: projetoId }
  )

  const title = navItems.find(i => isActive(i.href))?.label ?? (pathname.startsWith('/configuracoes') ? 'Configurações' : pathname === '/sobre' ? 'Sobre' : pathname === '/notificacoes' ? 'Notificações' : 'Projeto')

  return (
    <>
      <SidebarLayout
        projectName={projectName ?? 'Projeto'}
        title={title}
        searchPlaceholder={search.placeholder}
        searchContext={search.context}
        contextId={search.contextId}
        currentSprintId={currentSprintId}
      >
        <p className="sidebar-group-label">Neste projeto</p>
        {navItems.map(({ href, label, Icon }) => {
          const documentacao = href === `/projetos/${projetoId}/documentacao`
          return (
            <Fragment key={href}>
              {label === 'Departamentos' && <p className="sidebar-group-label">Administração</p>}
              <SidebarNavLink href={href} label={label} active={isActive(href)}><Icon /></SidebarNavLink>
              {/* Documentos logo abaixo do item Documentação, quando ele está aberto. */}
              {documentacao && permissions.has('documentos:ver') && isActive(href) && (
                <DocumentSidebar embedded projetoId={projetoId} activeDoc={isAta ? 'atas' : searchParams.get('doc') ?? 'stakeholder'} onSelect={doc => router.replace(`/projetos/${projetoId}/documentacao?doc=${encodeURIComponent(doc)}`)} />
              )}
            </Fragment>
          )
        })}

      </SidebarLayout>

    </>
  )
}

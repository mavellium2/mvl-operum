'use client'

import { Fragment, useState } from 'react'
import SidebarNavLink from './SidebarNavLink'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Building2, Briefcase, LayoutDashboard, Columns3, UsersRound, Files, Network, Wallet, Settings2 } from 'lucide-react'
import { SECOES_ARQUIVOS } from '@/lib/arquivosProjeto'
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
  // Fotos e Vídeos e Apresentação ficam dentro da Documentação no menu (ajustes de 20/11/2026).
  const secaoArquivos = Object.values(SECOES_ARQUIVOS).find(s => pathname === `/projetos/${projetoId}/${s.slug}` || pathname.startsWith(`/projetos/${projetoId}/${s.slug}/`))
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/') || (href === `/projetos/${projetoId}/documentacao` && (isAta || !!secaoArquivos))
  const docsHref = `/projetos/${projetoId}/documentacao`
  const naDocumentacao = isActive(docsHref)
  // Clicar de novo em "Documentação" recolhe os documentos; volta a abrir ao clicar outra vez
  // ou ao entrar de novo na Documentação vindo de outra tela.
  const [docsRecolhidos, setDocsRecolhidos] = useState(false)
  const [estavaNaDocumentacao, setEstavaNaDocumentacao] = useState(naDocumentacao)
  if (estavaNaDocumentacao !== naDocumentacao) {
    setEstavaNaDocumentacao(naDocumentacao)
    if (!naDocumentacao) setDocsRecolhidos(false)
  }
  const docsAbertos = naDocumentacao && !docsRecolhidos

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

  const title = secaoArquivos?.titulo ?? navItems.find(i => isActive(i.href))?.label ?? (pathname.startsWith('/configuracoes') ? 'Configurações' : pathname === '/sobre' ? 'Sobre' : pathname === '/notificacoes' ? 'Notificações' : 'Projeto')

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
          const documentacao = href === docsHref
          return (
            <Fragment key={href}>
              {label === 'Departamentos' && <p className="sidebar-group-label">Administração</p>}
              <SidebarNavLink
                href={href}
                label={label}
                active={isActive(href)}
                expanded={documentacao ? docsAbertos : undefined}
                onClick={documentacao && naDocumentacao ? event => { event.preventDefault(); setDocsRecolhidos(v => !v) } : undefined}
              ><Icon /></SidebarNavLink>
              {/* Documentos logo abaixo do item Documentação, quando ele está aberto. */}
              {documentacao && permissions.has('documentos:ver') && docsAbertos && (
                <DocumentSidebar
                  embedded
                  projetoId={projetoId}
                  activeDoc={secaoArquivos?.slug ?? (isAta ? 'atas' : searchParams.get('doc') ?? 'stakeholder')}
                  onSelect={doc => {
                    if (Object.values(SECOES_ARQUIVOS).some(s => s.slug === doc)) router.push(`/projetos/${projetoId}/${doc}`)
                    else if (secaoArquivos || isAta) router.push(`/projetos/${projetoId}/documentacao?doc=${encodeURIComponent(doc)}`)
                    else router.replace(`/projetos/${projetoId}/documentacao?doc=${encodeURIComponent(doc)}`)
                  }}
                />
              )}
            </Fragment>
          )
        })}

      </SidebarLayout>

    </>
  )
}

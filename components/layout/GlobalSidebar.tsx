'use client'

import { Fragment } from 'react'
import { useSidebarSession } from '@/hooks/useSidebarSession'
import SidebarNavLink from './SidebarNavLink'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FolderKanban, Paperclip, Users, Building2, Briefcase, Landmark, Info, Settings } from 'lucide-react'
import SidebarLayout from '@/components/layout/SidebarLayout'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/projetos', label: 'Projetos', Icon: FolderKanban },
  { href: '/arquivos', label: 'Arquivos', Icon: Paperclip },
  { href: '/configuracoes', label: 'Configurações', Icon: Settings },
  { href: '/sobre', label: 'Sobre', Icon: Info },
]

const ADMIN_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/projetos', label: 'Projetos', Icon: FolderKanban },
  { href: '/admin/users', label: 'Usuários', Icon: Users },
  { href: '/arquivos', label: 'Arquivos', Icon: Paperclip },
  { href: '/admin/cadastros/departamentos', label: 'Departamentos', Icon: Building2 },
  { href: '/admin/cadastros/funcoes', label: 'Funções', Icon: Briefcase },
  { href: '/admin/tenants', label: 'Instituições da plataforma', Icon: Landmark },
  { href: '/configuracoes', label: 'Configurações', Icon: Settings },
]

const FALLBACK_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  projetos: 'Projetos',
  arquivos: 'Arquivos',
  notificacoes: 'Notificações',
  sprints: 'Sprints',
  perfil: 'Perfil',
  admin: 'Admin',
  'alterar-senha': 'Alterar senha',
  sobre: 'Sobre',
  configuracoes: 'Configurações',
}

/** Sidebar global, compartilhando conta e comportamento com os projetos. */
export default function GlobalSidebar() {
  const pathname = usePathname()
  const { user, loading } = useSidebarSession()
  const role = user?.role, operador = user?.platformOperator === true
  const parts = pathname.split('/').filter(Boolean)
  let search: { placeholder: string; context: 'global_projects' | 'project_items' | 'sprint_items' | 'project_members' | 'default'; contextId?: string } = {
    placeholder: 'Buscar...',
    context: 'default',
  }
  if (parts[0] === 'sprints' && parts[1]) {
    search = { placeholder: 'Buscar cards e tarefas na sprint...', context: 'sprint_items', contextId: parts[1] }
  } else if (parts[0] === 'projetos' || pathname === '/') {
    search = { placeholder: 'Buscar projetos...', context: 'global_projects' }
  } else if (parts[0] === 'dashboard') {
    search = { placeholder: 'Buscar...', context: 'default' }
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  // Instituições é do operador da plataforma (ADR-060), não do admin de uma instituição.
  const nav = role === 'admin' ? ADMIN_ITEMS.filter(i => i.href !== '/admin/tenants' || operador) : NAV_ITEMS

  const title = nav.find(i => isActive(i.href))?.label
    ?? FALLBACK_TITLES[parts[0]]
    ?? 'Operum'

  const groups = [
    { label: 'Trabalho', items: nav.filter(item => ['/dashboard', '/admin/dashboard', '/projetos', '/arquivos'].includes(item.href)) },
    { label: 'Administração', items: nav.filter(item => ['/admin/users', '/admin/cadastros/departamentos', '/admin/cadastros/funcoes'].includes(item.href)) },
    { label: 'Plataforma', items: nav.filter(item => item.href === '/admin/tenants') },
  ]
  return <SidebarLayout title={title} searchPlaceholder={search.placeholder} searchContext={search.context} contextId={search.contextId} logoHref={role === 'admin' ? '/admin/dashboard' : '/'}>
    {loading ? <div role="status" className="px-3 py-4 text-xs opacity-60">Carregando navegação…</div> : groups.filter(group => group.items.length).map(group => <Fragment key={group.label}><p className="sidebar-group-label">{group.label}</p>{group.items.map(({ href, label, Icon }) => <SidebarNavLink key={href} href={href} label={label} active={isActive(href)}><Icon size={17} aria-hidden="true" /></SidebarNavLink>)}</Fragment>)}
  </SidebarLayout>
}

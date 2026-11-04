'use client'

import { useEffect } from 'react'
import MentionNotifications from '@/components/notificacoes/MentionNotifications'
import { usePathname } from 'next/navigation'
import GlobalSidebar from '@/components/layout/GlobalSidebar'
import { SidebarSessionProvider } from '@/hooks/useSidebarSession'
import { ProjectNavigationProvider, useProjectNavigation, keepsProjectNavigation } from './ProjectNavigationContext'
import ProjectSidebar from './ProjectSidebar'
import { ProjectPermissionsProvider } from '@/components/permissoes/ProjectPermissions'
import IdleLogout from '@/components/auth/IdleLogout'

const HIDDEN_PATHS = ['/login', '/register', '/recuperar-senha', '/alterar-senha', '/no-project', '/oauth', '/offline']

/**
 * Casca do app: sem header superior — o cabeçalho (marca, busca, workspace,
 * notificações, usuário) vive dentro de uma sidebar.
 *
 * - Páginas de auth / sem projeto: nada além do conteúdo.
 * - Páginas de projeto (/projetos/:id/...): a ProjectSidebar já traz o
 *   cabeçalho + navegação do projeto.
 * - Demais páginas: sidebar global + conteúdo.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return <ProjectNavigationProvider><ShellContent>{children}</ShellContent></ProjectNavigationProvider>
}
function ShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const navigation = useProjectNavigation()!
  const parts = pathname.split('/').filter(Boolean)
  const isProjectPage = parts[0] === 'projetos' && Boolean(parts[1]) && parts[1] !== 'novo'
  const keepProject = keepsProjectNavigation(pathname)
  const remember = navigation.remember
  useEffect(() => { if (!isProjectPage && !keepProject) remember(null) }, [isProjectPage, keepProject, remember])

  if (pathname === '/privacidade' || pathname === '/termos') return <>{children}</>

  if (HIDDEN_PATHS.some(p => pathname.startsWith(p))) return <>{children}</>

  if (isProjectPage) return <SidebarSessionProvider><IdleLogout /><MentionNotifications />{children}</SidebarSessionProvider>

  return (
    <SidebarSessionProvider><div className="flex flex-1 overflow-hidden">
      <IdleLogout />
      <MentionNotifications />
      {keepProject && navigation.project ? <ProjectPermissionsProvider permissions={navigation.project.permissions}><ProjectSidebar {...navigation.project} /></ProjectPermissionsProvider> : <GlobalSidebar />}
      <main className="flex-1 min-w-0 h-full overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div></SidebarSessionProvider>
  )
}

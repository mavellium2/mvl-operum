'use client'

import { usePathname } from 'next/navigation'
import GlobalSidebar from '@/components/layout/GlobalSidebar'
import IdleLogout from '@/components/auth/IdleLogout'

const HIDDEN_PATHS = ['/login', '/register', '/recuperar-senha', '/alterar-senha', '/no-project', '/oauth']

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
  const pathname = usePathname()

  if (HIDDEN_PATHS.some(p => pathname.startsWith(p))) return <>{children}</>

  const parts = pathname.split('/').filter(Boolean)
  const isProjectPage = parts[0] === 'projetos' && Boolean(parts[1]) && parts[1] !== 'novo'
  if (isProjectPage) return <><IdleLogout />{children}</>

  return (
    <div className="flex flex-1 overflow-hidden">
      <IdleLogout />
      <GlobalSidebar />
      <main className="flex-1 min-w-0 h-full overflow-y-auto pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
